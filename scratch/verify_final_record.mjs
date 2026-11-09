process.loadEnvFile('.env.local');
import { Pool } from '@neondatabase/serverless';

async function verifyFinalRecord() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const res = await pool.query(`
      SELECT
        id,
        delivery_status,
        email_sent,
        retry_count,
        delivery_attempted_at IS NOT NULL AS has_attempted_at,
        delivery_attempted_at,
        resend_message_id IS NOT NULL AND length(resend_message_id) > 0 AS has_resend_message_id,
        delivery_error IS NULL AS is_delivery_error_null,
        delivery_error,
        claim_started_at IS NULL AS is_claim_cleared
      FROM feedback
      WHERE id = '9a555230-8645-47d4-99c0-9572fceb0f46';
    `);

    if (res.rows.length === 0) {
      console.log('Record not found.');
      return;
    }

    const r = res.rows[0];
    console.log('Record ID:', r.id);
    console.log('delivery_status:', r.delivery_status);
    console.log('email_sent:', r.email_sent);
    console.log('retry_count:', r.retry_count);
    console.log('delivery_attempted_at populated:', r.has_attempted_at);
    console.log('delivery_attempted_at timestamp:', r.delivery_attempted_at);
    console.log('resend_message_id populated:', r.has_resend_message_id);
    console.log('delivery_error is null:', r.is_delivery_error_null);
    if (!r.is_delivery_error_null) {
      console.log('delivery_error note:', r.delivery_error);
    }
    console.log('claim_started_at cleared (NULL):', r.is_claim_cleared);
  } finally {
    await pool.end();
  }
}

verifyFinalRecord();
