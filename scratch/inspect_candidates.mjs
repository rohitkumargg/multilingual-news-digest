process.loadEnvFile('.env.local');
import { Pool } from '@neondatabase/serverless';

async function inspectCandidates() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const totalRes = await pool.query('SELECT count(*)::int as count FROM feedback;');
    console.log('Total feedback records in database:', totalRes.rows[0].count);

    const statusRes = await pool.query('SELECT delivery_status, count(*)::int as count FROM feedback GROUP BY delivery_status;');
    console.log('Status breakdown:', statusRes.rows);

    const MAX_RETRY_ATTEMPTS = 5;
    const candidatesQuery = `
      SELECT id, retry_count, delivery_status, delivery_attempted_at, claim_started_at, created_at
      FROM feedback
      WHERE retry_count < $1
        AND (
          delivery_status IN ('pending', 'failed')
          OR (delivery_status = 'retrying' AND claim_started_at < now() - interval '10 minutes')
        )
        AND (
          delivery_attempted_at IS NULL
          OR delivery_attempted_at < now() - (interval '1 minute' * power(2, retry_count))
        )
      ORDER BY created_at ASC
      LIMIT 50;
    `;
    const candRes = await pool.query(candidatesQuery, [MAX_RETRY_ATTEMPTS]);
    console.log('Eligible candidate records count:', candRes.rows.length);
    candRes.rows.forEach((r, idx) => {
      console.log(` - Candidate #${idx + 1}: ID=${r.id}, status=${r.delivery_status}, retry_count=${r.retry_count}, created_at=${r.created_at}, attempted_at=${r.delivery_attempted_at}`);
    });
  } finally {
    await pool.end();
  }
}
inspectCandidates();
