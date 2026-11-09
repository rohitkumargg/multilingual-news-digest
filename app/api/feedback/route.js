import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { Resend } from 'resend';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { feedback, feedback_rate_limit } from '@/lib/schema';

const MAX_FEEDBACK_PER_HOUR = 3;
const VALID_CATEGORIES = new Set(['general', 'bug', 'suggestion', 'other']);

function getClientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || '127.0.0.1';
}

function hashString(val) {
  return crypto.createHash('sha256').update(val).digest('hex');
}

export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body.' },
        { status: 400 }
      );
    }

    const { name: rawName, message: rawMessage, category: rawCategory } = body || {};

    // 1. Validate message (required, 10-2000 characters after trim)
    if (!rawMessage || typeof rawMessage !== 'string' || rawMessage.trim().length < 10) {
      return NextResponse.json(
        { success: false, error: 'Feedback message must be at least 10 characters.' },
        { status: 400 }
      );
    }

    const message = rawMessage.trim();
    if (message.length > 2000) {
      return NextResponse.json(
        { success: false, error: 'Feedback message must not exceed 2000 characters.' },
        { status: 400 }
      );
    }

    // 2. Validate optional name (max 100 chars, default "Anonymous")
    let name = 'Anonymous';
    if (rawName && typeof rawName === 'string') {
      const trimmedName = rawName.trim();
      if (trimmedName.length > 0) {
        if (trimmedName.length > 100) {
          return NextResponse.json(
            { success: false, error: 'Name must not exceed 100 characters.' },
            { status: 400 }
          );
        }
        name = trimmedName;
      }
    }

    // 3. Validate optional category (enum: general, bug, suggestion, other; default general)
    let category = 'general';
    if (rawCategory) {
      if (typeof rawCategory !== 'string' || !VALID_CATEGORIES.has(rawCategory.toLowerCase())) {
        return NextResponse.json(
          { success: false, error: 'Invalid category. Allowed values: general, bug, suggestion, other.' },
          { status: 400 }
        );
      }
      category = rawCategory.toLowerCase();
    }

    // 4. Rate Limiting: max 3 per IP per hour (§7, §15)
    // Concurrency-safe atomic upsert on feedback_rate_limit
    const rawIp = getClientIp(request);
    const ipHash = hashString(rawIp);

    let rateLimitRecord;
    try {
      const result = await db
        .insert(feedback_rate_limit)
        .values({
          ip_hash: ipHash,
          submission_count: 1,
          window_start: sql`now()`,
        })
        .onConflictDoUpdate({
          target: feedback_rate_limit.ip_hash,
          set: {
            submission_count: sql`CASE
              WHEN feedback_rate_limit.window_start < now() - interval '1 hour' THEN 1
              WHEN feedback_rate_limit.submission_count <= ${MAX_FEEDBACK_PER_HOUR} THEN feedback_rate_limit.submission_count + 1
              ELSE feedback_rate_limit.submission_count
            END`,
            window_start: sql`CASE
              WHEN feedback_rate_limit.window_start < now() - interval '1 hour' THEN now()
              ELSE feedback_rate_limit.window_start
            END`,
          },
        })
        .returning({
          count: feedback_rate_limit.submission_count,
        });
      rateLimitRecord = result[0];
    } catch (rateLimitErr) {
      console.error('[Feedback] Rate limit check error:', rateLimitErr);
      return NextResponse.json(
        { success: false, error: 'Failed to process feedback. Database unavailable.' },
        { status: 500 }
      );
    }

    if (rateLimitRecord && rateLimitRecord.count > MAX_FEEDBACK_PER_HOUR) {
      return NextResponse.json(
        { success: false, error: 'Too many submissions. Please try again later.' },
        { status: 429 }
      );
    }

    // 5. Content Deduplication (10-minute window) (§7, §15)
    const contentHash = hashString(ipHash + message);

    try {
      const recentDuplicates = await db
        .select({ id: feedback.id })
        .from(feedback)
        .where(
          and(
            eq(feedback.content_hash, contentHash),
            sql`created_at > now() - interval '10 minutes'`
          )
        )
        .limit(1);

      if (recentDuplicates && recentDuplicates.length > 0) {
        return NextResponse.json(
          { success: false, error: 'Duplicate submission detected.' },
          { status: 429 }
        );
      }
    } catch (dedupErr) {
      console.error('[Feedback] Deduplication check error:', dedupErr);
      return NextResponse.json(
        { success: false, error: 'Failed to verify submission. Database unavailable.' },
        { status: 500 }
      );
    }

    // 6. Step 1: Durably insert record into DB (Primary success criterion) (§7, §15)
    let insertedId;
    try {
      const [inserted] = await db
        .insert(feedback)
        .values({
          category,
          name_provided: name,
          message,
          ip_hash: ipHash,
          content_hash: contentHash,
          email_sent: false,
          delivery_status: 'pending',
          retry_count: 0,
        })
        .returning({ id: feedback.id });
      insertedId = inserted.id;
    } catch (insertErr) {
      console.error('[Feedback] DB insert failed:', insertErr);
      return NextResponse.json(
        { success: false, error: 'Failed to save your feedback. Please try again.' },
        { status: 500 }
      );
    }

    // 7. Step 2: Attempt email notification via Resend with 5-second timeout (§7, §15)
    let emailSent = false;
    let resendMessageId = null;
    let deliveryError = null;
    const RESEND_REQUEST_TIMEOUT_MS = 5000;

    if (process.env.RESEND_API_KEY) {
      let signal;
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'no-reply@yourdomain.com';
        const toEmail = process.env.FEEDBACK_TO_EMAIL || 'owner@yourdomain.com';
        const subjectCategory = category.charAt(0).toUpperCase() + category.slice(1);
        const previewText = message.length > 60 ? `${message.slice(0, 57)}...` : message;
        const idempotencyKey = `feedback_${insertedId}`;

        signal = AbortSignal.timeout(RESEND_REQUEST_TIMEOUT_MS);

        const emailResult = await resend.emails.send(
          {
            from: fromEmail,
            to: toEmail,
            subject: `[MND Feedback] ${subjectCategory} — ${previewText}`,
            text: `Category: ${category}\nName: ${name}\nSubmitted: ${new Date().toISOString()}\nIP (hashed): ${ipHash}\n\n---\n${message}`,
          },
          {
            signal,
            idempotencyKey,
          }
        );

        if (signal.aborted) {
          deliveryError =
            signal.reason?.name === 'TimeoutError'
              ? `Resend request timed out after ${RESEND_REQUEST_TIMEOUT_MS}ms`
              : (signal.reason?.message || `Resend request timed out after ${RESEND_REQUEST_TIMEOUT_MS}ms`);
        } else if (emailResult?.error) {
          deliveryError = emailResult.error.message || 'Resend returned an error';
        } else if (emailResult?.data?.id) {
          emailSent = true;
          resendMessageId = emailResult.data.id;
        } else {
          deliveryError = 'No message ID returned by Resend';
        }
      } catch (sendErr) {
        if (signal?.aborted) {
          deliveryError =
            signal.reason?.name === 'TimeoutError'
              ? `Resend request timed out after ${RESEND_REQUEST_TIMEOUT_MS}ms`
              : (signal.reason?.message || `Resend request timed out after ${RESEND_REQUEST_TIMEOUT_MS}ms`);
        } else {
          deliveryError = sendErr?.message || 'Network error delivering email';
        }
      }
    } else {
      deliveryError = 'RESEND_API_KEY is not configured';
    }

    // 8. Update DB with delivery result and return appropriate success state
    if (emailSent) {
      try {
        await db
          .update(feedback)
          .set({
            email_sent: true,
            delivery_status: 'sent',
            resend_message_id: resendMessageId,
            delivery_error: null,
            delivery_attempted_at: sql`now()`,
            claim_started_at: null,
          })
          .where(eq(feedback.id, insertedId));
      } catch (updateErr) {
        console.error('[Feedback] Failed to record sent status in DB:', updateErr);
      }

      return NextResponse.json({
        success: true,
        emailDelivered: true,
        message: 'Thank you! Your feedback has been received.',
      });
    } else {
      // Persistence succeeded, email failed or pending retry -> qualified success
      try {
        await db
          .update(feedback)
          .set({
            email_sent: false,
            delivery_status: 'failed',
            delivery_error: deliveryError,
            delivery_attempted_at: sql`now()`,
            claim_started_at: null,
          })
          .where(eq(feedback.id, insertedId));
      } catch (updateErr) {
        console.error('[Feedback] Failed to record failed status in DB:', updateErr);
      }

      return NextResponse.json({
        success: true,
        emailDelivered: false,
        message: "Your feedback was received. Email notification is pending.",
      });
    }
  } catch (unexpectedErr) {
    console.error('[Feedback] Unexpected server error:', unexpectedErr);
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 }
    );
  }
}
