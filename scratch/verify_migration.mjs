process.loadEnvFile('.env.local');
import { Pool } from '@neondatabase/serverless';

async function verifyMigration() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    console.log('--- TABLE VERIFICATION ---');
    const tablesRes = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    const tableNames = tablesRes.rows.map(r => r.table_name);
    console.log('Found public tables:', tableNames);

    const EXPECTED_TABLES = [
      'users',
      'user_streaks',
      'saved_articles',
      'feedback',
      'feedback_rate_limit',
      'registration_rate_limit',
    ];

    EXPECTED_TABLES.forEach(t => {
      const exists = tableNames.includes(t);
      console.log(`Table [${t}]: ${exists ? 'EXISTS (✓)' : 'MISSING (✗)'}`);
    });

    console.log('\n--- INDEX VERIFICATION ---');
    const indexRes = await pool.query(`
      SELECT tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname;
    `);
    console.log(`Total public indexes found: ${indexRes.rows.length}`);
    indexRes.rows.forEach(r => {
      console.log(` - ${r.tablename}.${r.indexname}`);
    });

    const EXPECTED_CUSTOM_INDEXES = [
      'feedback_ip_hash_idx',
      'feedback_content_hash_idx',
      'feedback_delivery_status_idx',
      'feedback_claim_started_at_idx',
      'saved_articles_user_id_idx',
      'saved_articles_stable_id_idx',
      'user_streaks_user_id_idx',
    ];

    console.log('\nChecking custom business indexes:');
    const existingIndexNames = new Set(indexRes.rows.map(r => r.indexname));
    EXPECTED_CUSTOM_INDEXES.forEach(idx => {
      const exists = existingIndexNames.has(idx);
      console.log(`Index [${idx}]: ${exists ? 'EXISTS (✓)' : 'MISSING (✗)'}`);
    });

    console.log('\n--- DRIZZLE MIGRATION TRACKING TABLE ---');
    const drizzleTablesRes = await pool.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_name LIKE '%drizzle%'
      ORDER BY table_schema, table_name;
    `);

    if (drizzleTablesRes.rows.length === 0) {
      console.log('No Drizzle migration tracking table found!');
    } else {
      for (const row of drizzleTablesRes.rows) {
        console.log(`Found tracking table: "${row.table_schema}"."${row.table_name}"`);
        const rows = await pool.query(`SELECT id, hash, created_at FROM "${row.table_schema}"."${row.table_name}"`);
        console.log(`Recorded migrations count: ${rows.rows.length}`);
        rows.rows.forEach(r => {
          console.log(` - ID: ${r.id}, Hash: ${r.hash}, CreatedAt: ${r.created_at}`);
        });
      }
    }
  } catch (err) {
    console.error('Verification query failed:', err.message);
  } finally {
    await pool.end();
  }
}

verifyMigration();
