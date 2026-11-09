process.loadEnvFile('.env.local');
import { Pool } from '@neondatabase/serverless';

const TARGET_ID = '9a555230-8645-47d4-99c0-9572fceb0f46';

async function cleanupAndVerify() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // 1. Parameterized update
    const updateQuery = `
      UPDATE feedback
      SET delivery_error = NULL
      WHERE id = $1
        AND delivery_status = 'sent'
        AND email_sent = TRUE;
    `;
    const updateRes = await pool.query(updateQuery, [TARGET_ID]);
    console.log(`UPDATE rowCount: ${updateRes.rowCount}`);

    if (updateRes.rowCount !== 1) {
      console.error(`ERROR: Expected exactly 1 record updated, but affected ${updateRes.rowCount} records.`);
      return;
    }

    // 2. Read-only verification query
    const verifyQuery = `
      SELECT
        id,
        delivery_status,
        email_sent,
        delivery_error IS NULL AS is_delivery_error_null,
        resend_message_id IS NOT NULL AND length(resend_message_id) > 0 AS has_resend_message_id,
        claim_started_at IS NULL AS is_claim_cleared
      FROM feedback
      WHERE id = $1;
    `;
    const verifyRes = await pool.query(verifyQuery, [TARGET_ID]);
    if (verifyRes.rows.length === 1) {
      const r = verifyRes.rows[0];
      console.log('Verification:');
      console.log(' - Record ID matched:', r.id === TARGET_ID);
      console.log(' - delivery_status:', r.delivery_status);
      console.log(' - email_sent:', r.email_sent);
      console.log(' - delivery_error IS NULL:', r.is_delivery_error_null);
      console.log(' - resend_message_id populated:', r.has_resend_message_id);
    }
  } catch (err) {
    console.error('Operation failed:', err.message);
  } finally {
    await pool.end();
  }
}

cleanupAndVerify();
