#!/usr/bin/env node

/**
 * retry-feedback-email.js (§7, §16, §22 item 44)
 *
 * Background operator/cron worker for retrying failed or pending feedback notification emails.
 *
 * DELIVERY SEMANTICS:
 * This worker implements AT-LEAST-ONCE delivery across distributed external APIs.
 * If a worker process or network connection terminates after Resend accepts the email
 * but before the PostgreSQL status update commits, the claim will expire (10 minutes)
 * and be reclaimed on a subsequent run. Exactly-once delivery across external APIs is impossible
 * in distributed crash scenarios; email templates include the unique Feedback ID and timestamp
 * for idempotent operator inspection.
 *
 * ALGORITHM:
 * 1. Queries up to 50 eligible candidate rows:
 *    - retry_count < 5
 *    - delivery_status in ('pending', 'failed') OR stale claim ('retrying' with claim_started_at < now() - 10 min)
 *    - backoff elapsed (delivery_attempted_at IS NULL or delivery_attempted_at < now() - (1 min * 2^retry_count))
 * 2. Claims each row atomically using a conditional UPDATE statement.
 * 3. If claimed (1 row updated), dispatches email via Resend.
 * 4. Updates delivery_status to 'sent' on success, or increments retry_count and sets 'failed'
 *    (or 'permanently_failed' if retry_count >= 5) on error.
 */

import { Pool } from '@neondatabase/serverless';
import { Resend } from 'resend';

const MAX_RETRY_ATTEMPTS = 5;

export async function runFeedbackRetryWorker({
  databaseUrl = process.env.DATABASE_URL,
  resendApiKey = process.env.RESEND_API_KEY,
  fromEmail = process.env.RESEND_FROM_EMAIL || 'no-reply@yourdomain.com',
  toEmail = process.env.FEEDBACK_TO_EMAIL || 'owner@yourdomain.com',
  log = console.log,
  errorLog = console.error,
  pool: injectedPool = null,
  resend: injectedResend = null,
} = {}) {
  if (!injectedPool && !databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required to run the retry worker.');
  }

  if (!injectedResend && !resendApiKey) {
    throw new Error('RESEND_API_KEY environment variable is required to deliver feedback emails.');
  }

  const pool = injectedPool || new Pool({ connectionString: databaseUrl });
  const resend = injectedResend || new Resend(resendApiKey);

  try {
    log('[RetryWorker] Checking for eligible feedback records to process...');

    // 1. Candidate Selection Query (§7)
    const candidatesQuery = `
      SELECT id, retry_count, delivery_status, delivery_attempted_at, claim_started_at,
             category, name_provided, message, ip_hash
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

    const candidatesResult = await pool.query(candidatesQuery, [MAX_RETRY_ATTEMPTS]);
    const candidates = candidatesResult.rows;

    log(`[RetryWorker] Found ${candidates.length} candidate record(s).`);
    if (candidates.length === 0) {
      return { processed: 0, sent: 0, failed: 0, skipped: 0 };
    }

    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const record of candidates) {
      // 2. Atomic Claim / Reclaim Operation (§7)
      const claimQuery = `
        UPDATE feedback
        SET delivery_status = 'retrying',
            claim_started_at = now()
        WHERE id = $1
          AND retry_count < $2
          AND (
            delivery_status IN ('pending', 'failed')
            OR (delivery_status = 'retrying' AND claim_started_at < now() - interval '10 minutes')
          )
          AND (
            delivery_attempted_at IS NULL
            OR delivery_attempted_at < now() - (interval '1 minute' * power(2, retry_count))
          )
        RETURNING id;
      `;

      const claimResult = await pool.query(claimQuery, [record.id, MAX_RETRY_ATTEMPTS]);
      if (claimResult.rowCount === 0) {
        // Another worker claimed the record or its state changed
        log(`[RetryWorker] Record ${record.id} skipped (already claimed or ineligible).`);
        skippedCount++;
        continue;
      }

      log(`[RetryWorker] Claimed record ${record.id} (attempt #${record.retry_count + 1}). Sending via Resend...`);

      // 3. Dispatch Email via Resend
      const category = record.category || 'general';
      const name = record.name_provided || 'Anonymous';
      const subjectCategory = category.charAt(0).toUpperCase() + category.slice(1);
      const message = record.message || '';
      const preview = message.length > 60 ? `${message.slice(0, 57)}...` : message;

      let emailSuccess = false;
      let resendMessageId = null;
      let deliveryErrorMessage = null;
      const RETRY_RESEND_TIMEOUT_MS = 5000;
      let retrySignal;

      try {
        const idempotencyKey = `feedback_${record.id}`;
        retrySignal = AbortSignal.timeout(RETRY_RESEND_TIMEOUT_MS);

        const sendResult = await resend.emails.send(
          {
            from: fromEmail,
            to: toEmail,
            subject: `[MND Feedback] ${subjectCategory} — ${preview}`,
            text: `Feedback ID: ${record.id}\nCategory: ${category}\nName: ${name}\nIP (hashed): ${record.ip_hash || 'unknown'}\nRetry Attempt: ${record.retry_count + 1}\n\n---\n${message}`,
          },
          {
            signal: retrySignal,
            idempotencyKey,
          }
        );

        if (retrySignal.aborted) {
          deliveryErrorMessage =
            retrySignal.reason?.name === 'TimeoutError'
              ? `Resend request timed out after ${RETRY_RESEND_TIMEOUT_MS}ms`
              : (retrySignal.reason?.message || `Resend request timed out after ${RETRY_RESEND_TIMEOUT_MS}ms`);
        } else if (sendResult?.error) {
          deliveryErrorMessage = sendResult.error.message || 'Resend API returned an error';
        } else if (sendResult?.data?.id) {
          emailSuccess = true;
          resendMessageId = sendResult.data.id;
        } else {
          deliveryErrorMessage = 'No message ID returned by Resend';
        }
      } catch (sendErr) {
        if (retrySignal?.aborted) {
          deliveryErrorMessage =
            retrySignal.reason?.name === 'TimeoutError'
              ? `Resend request timed out after ${RETRY_RESEND_TIMEOUT_MS}ms`
              : (retrySignal.reason?.message || `Resend request timed out after ${RETRY_RESEND_TIMEOUT_MS}ms`);
        } else {
          deliveryErrorMessage = sendErr?.message || 'Network exception during Resend dispatch';
        }
      }

      // 4. Update Result in Database
      if (emailSuccess) {
        const successQuery = `
          UPDATE feedback
          SET email_sent = true,
              delivery_status = 'sent',
              resend_message_id = $2,
              delivery_error = NULL,
              delivery_attempted_at = now(),
              claim_started_at = NULL
          WHERE id = $1;
        `;
        await pool.query(successQuery, [record.id, resendMessageId]);
        log(`[RetryWorker] Record ${record.id} successfully sent (Message ID: ${resendMessageId}).`);
        sentCount++;
      } else {
        const nextRetryCount = record.retry_count + 1;
        const newStatus = nextRetryCount >= MAX_RETRY_ATTEMPTS ? 'permanently_failed' : 'failed';

        const failQuery = `
          UPDATE feedback
          SET email_sent = false,
              delivery_status = $2,
              retry_count = $3,
              delivery_attempted_at = now(),
              delivery_error = $4,
              claim_started_at = NULL
          WHERE id = $1;
        `;
        await pool.query(failQuery, [record.id, newStatus, nextRetryCount, deliveryErrorMessage]);
        errorLog(`[RetryWorker] Record ${record.id} delivery failed (new status: ${newStatus}, error: ${deliveryErrorMessage}).`);
        failedCount++;
      }
    }

    log(`[RetryWorker] Batch complete. Sent: ${sentCount}, Failed: ${failedCount}, Skipped: ${skippedCount}.`);
    return {
      processed: candidates.length - skippedCount,
      sent: sentCount,
      failed: failedCount,
      skipped: skippedCount,
    };
  } finally {
    if (!injectedPool) {
      await pool.end();
    }
  }
}

// Allow direct CLI invocation
if (process.argv[1] && process.argv[1].endsWith('retry-feedback-email.js')) {
  runFeedbackRetryWorker()
    .then((stats) => {
      console.log('[RetryWorker] Done:', stats);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[RetryWorker] Fatal error:', err);
      process.exit(1);
    });
}
