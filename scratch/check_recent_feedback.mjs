process.loadEnvFile('.env.local');
import { Pool } from '@neondatabase/serverless';

async function checkRecentFeedback() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const res = await pool.query(`
      SELECT id, category, name_provided, email_sent, delivery_status,
             delivery_error, delivery_attempted_at, retry_count,
             resend_message_id, created_at
      FROM feedback
      ORDER BY created_at DESC
      LIMIT 5;
    `);
    console.log('Total submissions found:', res.rows.length);
    res.rows.forEach((r, idx) => {
      console.log(`--- Record #${idx + 1} ---`);
      console.log('ID:', r.id);
      console.log('Category:', r.category);
      console.log('Name provided:', r.name_provided);
      console.log('Created at:', r.created_at);
      console.log('Email sent:', r.email_sent);
      console.log('Delivery status:', r.delivery_status);
      console.log('Delivery error:', r.delivery_error);
      console.log('Delivery attempted at:', r.delivery_attempted_at);
      console.log('Retry count:', r.retry_count);
      console.log('Resend message ID:', r.resend_message_id);
    });
  } catch (err) {
    console.error('Query error:', err.message);
  } finally {
    await pool.end();
  }
}

checkRecentFeedback();
