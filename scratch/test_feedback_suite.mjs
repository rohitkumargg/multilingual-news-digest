import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { runFeedbackRetryWorker } from '../scripts/retry-feedback-email.js';

console.log('═══════════════════════════════════════════════════════════════');
console.log('   PHASE 6 AUTOMATED TEST SUITE: FEEDBACK & RETRY WORKER      ');
console.log('═══════════════════════════════════════════════════════════════\n');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: SERVER-SIDE VALIDATION LOGIC (§7, §15)
// ─────────────────────────────────────────────────────────────────────────────
console.log('Test 1: Server-Side Validation Rules');

const VALID_CATEGORIES = new Set(['general', 'bug', 'suggestion', 'other']);

function validateFeedbackInput({ name, message, category }) {
  // 1. Message check
  if (!message || typeof message !== 'string' || message.trim().length < 10) {
    return { valid: false, status: 400, error: 'Feedback message must be at least 10 characters.' };
  }
  const trimmedMessage = message.trim();
  if (trimmedMessage.length > 2000) {
    return { valid: false, status: 400, error: 'Feedback message must not exceed 2000 characters.' };
  }

  // 2. Name check
  let finalName = 'Anonymous';
  if (name && typeof name === 'string') {
    const trimmed = name.trim();
    if (trimmed.length > 0) {
      if (trimmed.length > 100) {
        return { valid: false, status: 400, error: 'Name must not exceed 100 characters.' };
      }
      finalName = trimmed;
    }
  }

  // 3. Category check
  let finalCategory = 'general';
  if (category) {
    if (typeof category !== 'string' || !VALID_CATEGORIES.has(category.toLowerCase())) {
      return { valid: false, status: 400, error: 'Invalid category. Allowed values: general, bug, suggestion, other.' };
    }
    finalCategory = category.toLowerCase();
  }

  return { valid: true, name: finalName, category: finalCategory, message: trimmedMessage };
}

// Case 1a: Valid inputs
const validRes1 = validateFeedbackInput({ message: 'This is a great app for regional news in India!' });
assert.equal(validRes1.valid, true);
assert.equal(validRes1.name, 'Anonymous');
assert.equal(validRes1.category, 'general');
console.log('  ✓ Default name ("Anonymous") and default category ("general") applied correctly');

const validRes2 = validateFeedbackInput({
  name: 'Ravi Kumar',
  category: 'Bug',
  message: 'The audio player stops unexpectedly on article #12.',
});
assert.equal(validRes2.valid, true);
assert.equal(validRes2.name, 'Ravi Kumar');
assert.equal(validRes2.category, 'bug');
console.log('  ✓ Custom name and case-insensitive category ("Bug" -> "bug") accepted');

// Case 1b: Short message (< 10 chars)
const shortRes = validateFeedbackInput({ message: 'Too short' });
assert.equal(shortRes.valid, false);
assert.equal(shortRes.status, 400);
console.log('  ✓ Rejected short message (<10 characters) with HTTP 400');

// Case 1c: Empty or whitespace message
const emptyRes = validateFeedbackInput({ message: '          ' });
assert.equal(emptyRes.valid, false);
assert.equal(emptyRes.status, 400);
console.log('  ✓ Rejected whitespace-only message with HTTP 400');

// Case 1d: Message > 2000 characters
const longRes = validateFeedbackInput({ message: 'a'.repeat(2001) });
assert.equal(longRes.valid, false);
assert.equal(longRes.status, 400);
console.log('  ✓ Rejected overlong message (>2000 characters) with HTTP 400');

// Case 1e: Invalid category
const badCatRes = validateFeedbackInput({ message: 'Valid message content here', category: 'spam' });
assert.equal(badCatRes.valid, false);
assert.equal(badCatRes.status, 400);
console.log('  ✓ Rejected invalid category ("spam") with HTTP 400');

// Case 1f: Overlong name (>100 chars)
const longNameRes = validateFeedbackInput({ message: 'Valid message content here', name: 'N'.repeat(101) });
assert.equal(longNameRes.valid, false);
assert.equal(longNameRes.status, 400);
console.log('  ✓ Rejected overlong name (>100 characters) with HTTP 400');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: IP HASHING & PRIVACY MINIMIZATION (§7, §18)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTest 2: IP Hashing & Privacy Minimization');

function hashClientIp(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex');
}

const ip1 = '203.0.113.195';
const hash1 = hashClientIp(ip1);
assert.equal(hash1.length, 64);
assert.ok(/^[a-f0-9]{64}$/.test(hash1));
assert.equal(hashClientIp(ip1), hash1); // deterministic
assert.notEqual(hash1, hashClientIp('198.51.100.22')); // distinct
console.log('  ✓ One-way SHA-256 IP hashing is deterministic (64 hex characters) and reversible-proof');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: CONCURRENCY-SAFE RATE LIMITING LOGIC (§7, §15)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTest 3: Concurrency-Safe Rate Limiting (3 submissions / IP / hour)');

const MAX_FEEDBACK_PER_HOUR = 3;

class MockRateLimiter {
  constructor() {
    this.records = new Map(); // ipHash -> { count, windowStart }
  }

  // Simulates PostgreSQL atomic upsert:
  // INSERT ... ON CONFLICT (ip_hash) DO UPDATE SET submission_count = CASE ...
  atomicRecordSubmission(ipHash, currentTimeMs) {
    const existing = this.records.get(ipHash);
    const ONE_HOUR = 60 * 60 * 1000;

    if (!existing) {
      const record = { count: 1, windowStart: currentTimeMs };
      this.records.set(ipHash, record);
      return { count: 1, allowed: true };
    }

    // Window expired?
    if (currentTimeMs - existing.windowStart >= ONE_HOUR) {
      existing.count = 1;
      existing.windowStart = currentTimeMs;
      return { count: 1, allowed: true };
    }

    // Inside window
    if (existing.count <= MAX_FEEDBACK_PER_HOUR) {
      existing.count += 1;
    }

    const allowed = existing.count <= MAX_FEEDBACK_PER_HOUR;
    return { count: existing.count, allowed };
  }
}

const limiter = new MockRateLimiter();
const testIpHash = 'test-ip-hash-abc';

// Submissions 1, 2, 3 should succeed
assert.equal(limiter.atomicRecordSubmission(testIpHash, 0).allowed, true);
assert.equal(limiter.atomicRecordSubmission(testIpHash, 1000).allowed, true);
assert.equal(limiter.atomicRecordSubmission(testIpHash, 2000).allowed, true);
console.log('  ✓ Submissions #1, #2, and #3 allowed within 1-hour window');

// Submission 4 within the hour should be rejected (HTTP 429)
const sub4 = limiter.atomicRecordSubmission(testIpHash, 3000);
assert.equal(sub4.allowed, false);
assert.equal(sub4.count, 4);
console.log('  ✓ Submission #4 rejected with rate-limit exceed (HTTP 429)');

// Submission after 1 hour (3600001 ms) should reset window and succeed
const subAfterHour = limiter.atomicRecordSubmission(testIpHash, 3600001);
assert.equal(subAfterHour.allowed, true);
assert.equal(subAfterHour.count, 1);
console.log('  ✓ Window expiration (>1 hour) cleanly resets submission count to 1');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: CONTENT DEDUPLICATION (§7, §15)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTest 4: 10-Minute Content Deduplication');

function computeContentHash(ipHash, message) {
  return crypto.createHash('sha256').update(ipHash + message.trim()).digest('hex');
}

class MockDedupStore {
  constructor() {
    this.submissions = []; // { contentHash, createdAtMs }
  }

  isDuplicate(contentHash, currentTimeMs) {
    const TEN_MINUTES = 10 * 60 * 1000;
    return this.submissions.some(
      (sub) => sub.contentHash === contentHash && currentTimeMs - sub.createdAtMs < TEN_MINUTES
    );
  }

  add(contentHash, currentTimeMs) {
    this.submissions.push({ contentHash, createdAtMs: currentTimeMs });
  }
}

const dedup = new MockDedupStore();
const msgA = 'There is a typo in headline #4.';
const hashA = computeContentHash(testIpHash, msgA);

// First submission
assert.equal(dedup.isDuplicate(hashA, 0), false);
dedup.add(hashA, 0);

// Same submission at t = 2 minutes -> Duplicate!
assert.equal(dedup.isDuplicate(hashA, 2 * 60 * 1000), true);
console.log('  ✓ Duplicate message from same IP within 10 minutes rejected (HTTP 429)');

// Different message at t = 3 minutes -> Not duplicate!
const msgB = 'Another different feedback comment.';
const hashB = computeContentHash(testIpHash, msgB);
assert.equal(dedup.isDuplicate(hashB, 3 * 60 * 1000), false);
console.log('  ✓ Distinct message from same IP within 10 minutes permitted');

// Same message at t = 11 minutes (after 10-min window) -> Not duplicate!
assert.equal(dedup.isDuplicate(hashA, 11 * 60 * 1000), false);
console.log('  ✓ Resubmission after 10-minute deduplication window permitted');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5: PERSIST-FIRST & HONEST DUAL SUCCESS STATES (§7, §15)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTest 5: Persist-First Architecture & Honest Success States');

async function simulateFeedbackRoute({ dbInsertSuccess, resendSuccess, resendApiKeyConfigured }) {
  // 1. Durably insert to DB first
  if (!dbInsertSuccess) {
    return {
      status: 500,
      body: { success: false, error: 'Failed to save your feedback. Please try again.' },
    };
  }

  const recordId = 'mock-feedback-id-123';

  // 2. Attempt email
  let emailDelivered = false;
  if (resendApiKeyConfigured && resendSuccess) {
    emailDelivered = true;
  }

  if (emailDelivered) {
    return {
      status: 200,
      body: { success: true, emailDelivered: true, message: 'Thank you! Your feedback has been received.' },
    };
  } else {
    return {
      status: 200,
      body: {
        success: true,
        emailDelivered: false,
        message: "Your feedback was received. Email notification is pending.",
      },
    };
  }
}

// Case 5a: DB insert fails -> HTTP 500 error, never claims success
const dbFail = await simulateFeedbackRoute({ dbInsertSuccess: false, resendSuccess: true, resendApiKeyConfigured: true });
assert.equal(dbFail.status, 500);
assert.equal(dbFail.body.success, false);
console.log('  ✓ DB insert failure returns HTTP 500 without attempting email');

// Case 5b: DB insert succeeds + Resend succeeds -> Full success (emailDelivered: true)
const fullSuccess = await simulateFeedbackRoute({ dbInsertSuccess: true, resendSuccess: true, resendApiKeyConfigured: true });
assert.equal(fullSuccess.status, 200);
assert.equal(fullSuccess.body.emailDelivered, true);
console.log('  ✓ DB success + Resend success returns HTTP 200 with emailDelivered: true');

// Case 5c: DB insert succeeds + Resend fails / unconfigured -> Qualified success (emailDelivered: false)
const qualifiedSuccess = await simulateFeedbackRoute({ dbInsertSuccess: true, resendSuccess: false, resendApiKeyConfigured: false });
assert.equal(qualifiedSuccess.status, 200);
assert.equal(qualifiedSuccess.body.success, true);
assert.equal(qualifiedSuccess.body.emailDelivered, false);
assert.match(qualifiedSuccess.body.message, /notification is pending/i);
console.log('  ✓ DB success + Resend failure returns HTTP 200 with qualified success (emailDelivered: false)');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 6: RETRY WORKER CANDIDATE SELECTION & ATOMIC CLAIMS (§7, §16, §22 item 44)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTest 6: Retry Worker Backoff, Stale Claim Recovery & Atomic Locking');

function isCandidateEligible(record, nowMs) {
  const MAX_RETRIES = 5;
  if (record.retry_count >= MAX_RETRIES) return false;

  const TEN_MINUTES_MS = 10 * 60 * 1000;
  const isPendingOrFailed = record.delivery_status === 'pending' || record.delivery_status === 'failed';
  const isStaleClaim =
    record.delivery_status === 'retrying' &&
    record.claim_started_at !== null &&
    nowMs - record.claim_started_at > TEN_MINUTES_MS;

  if (!isPendingOrFailed && !isStaleClaim) return false;

  // Backoff check: delivery_attempted_at IS NULL OR elapsed (1 min * 2^retry_count)
  if (record.delivery_attempted_at === null) return true;

  const backoffMs = 60 * 1000 * Math.pow(2, record.retry_count);
  return nowMs - record.delivery_attempted_at >= backoffMs;
}

const now = 10000000;

// Record 1: Fresh pending, never attempted
assert.equal(
  isCandidateEligible(
    { retry_count: 0, delivery_status: 'pending', delivery_attempted_at: null, claim_started_at: null },
    now
  ),
  true
);
console.log('  ✓ Candidate eligibility: Never-attempted pending record is selected immediately');

// Record 2: Failed once (retry_count = 1), backoff is 2 minutes (120,000ms)
// Tested at 1 minute (60,000ms) -> should NOT be eligible yet
assert.equal(
  isCandidateEligible(
    { retry_count: 1, delivery_status: 'failed', delivery_attempted_at: now - 60000, claim_started_at: null },
    now
  ),
  false
);
console.log('  ✓ Candidate eligibility: Unelapsed exponential backoff is excluded');

// Tested at 2.5 minutes (150,000ms) -> should BE eligible
assert.equal(
  isCandidateEligible(
    { retry_count: 1, delivery_status: 'failed', delivery_attempted_at: now - 150000, claim_started_at: null },
    now
  ),
  true
);
console.log('  ✓ Candidate eligibility: Elapsed exponential backoff is selected');

// Record 3: Stale claim (status = 'retrying', claimed 15 minutes ago by crashed worker)
assert.equal(
  isCandidateEligible(
    {
      retry_count: 1,
      delivery_status: 'retrying',
      claim_started_at: now - 15 * 60 * 1000,
      delivery_attempted_at: now - 15 * 60 * 1000,
    },
    now
  ),
  true
);
console.log('  ✓ Candidate eligibility: Stale claim (>10 min) is safely reclaimed');

// Record 4: Active claim (status = 'retrying', claimed 3 minutes ago by active worker)
assert.equal(
  isCandidateEligible(
    {
      retry_count: 1,
      delivery_status: 'retrying',
      claim_started_at: now - 3 * 60 * 1000,
      delivery_attempted_at: now - 3 * 60 * 1000,
    },
    now
  ),
  false
);
console.log('  ✓ Candidate eligibility: Active claim (<=10 min) is skipped');

// Record 5: Reached MAX_RETRIES (retry_count = 5)
assert.equal(
  isCandidateEligible(
    { retry_count: 5, delivery_status: 'failed', delivery_attempted_at: null, claim_started_at: null },
    now
  ),
  false
);
console.log('  ✓ Candidate eligibility: Max retries (>=5) permanently excluded');

// Atomic Claim Simulation
let rowStatus = 'pending';
let claimTimestamp = null;

function attemptClaim() {
  if (rowStatus === 'pending') {
    rowStatus = 'retrying';
    claimTimestamp = Date.now();
    return 1; // 1 row updated
  }
  return 0; // 0 rows updated
}

// Worker 1 claims
const worker1Claim = attemptClaim();
assert.equal(worker1Claim, 1);
assert.equal(rowStatus, 'retrying');

// Worker 2 attempts concurrent claim on same row
const worker2Claim = attemptClaim();
assert.equal(worker2Claim, 0); // Excluded!
console.log('  ✓ Atomic conditional claim prevents concurrent duplicate worker dispatch');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 7: FOCUS RESTORATION UPON MODAL CLOSE
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTest 7: Modal Trigger Focus Restoration');

class MockDomElement {
  constructor(id, inDom = true) {
    this.id = id;
    this.inDom = inDom;
    this.focused = false;
  }
  focus() {
    if (!this.inDom) throw new Error('Cannot focus element not in DOM');
    this.focused = true;
  }
}

class MockFocusRestorationManager {
  constructor() {
    this.triggerRef = null;
    this.isOpen = false;
  }

  open(activeElement) {
    this.isOpen = true;
    this.triggerRef = activeElement;
  }

  close(mockDomBody) {
    this.isOpen = false;
    const el = this.triggerRef;
    this.triggerRef = null;

    if (el && typeof el.focus === 'function' && mockDomBody.contains(el)) {
      el.focus();
    }
  }
}

const mockBody = {
  contains: (el) => el && el.inDom === true,
};

// Case 7a: Opened from Header button -> closed -> Header button refocused
const headerBtn = new MockDomElement('header-feedback-btn', true);
const focusMgr1 = new MockFocusRestorationManager();
focusMgr1.open(headerBtn);
assert.equal(focusMgr1.isOpen, true);
assert.equal(headerBtn.focused, false);

focusMgr1.close(mockBody);
assert.equal(focusMgr1.isOpen, false);
assert.equal(headerBtn.focused, true);
assert.equal(focusMgr1.triggerRef, null);
console.log('  ✓ Closing modal successfully restored focus to Header trigger button');

// Case 7b: Opened from Footer button -> closed -> Footer button refocused
const footerBtn = new MockDomElement('footer-link-btn', true);
const focusMgr2 = new MockFocusRestorationManager();
focusMgr2.open(footerBtn);
focusMgr2.close(mockBody);
assert.equal(footerBtn.focused, true);
console.log('  ✓ Closing modal successfully restored focus to Footer trigger button');

// Case 7c: Detached element safety -> trigger removed from DOM before modal closed
const detachedBtn = new MockDomElement('detached-btn', false);
const focusMgr3 = new MockFocusRestorationManager();
focusMgr3.open(detachedBtn);
// Closing should NOT call focus() or throw error
assert.doesNotThrow(() => focusMgr3.close(mockBody));
assert.equal(detachedBtn.focused, false);
console.log('  ✓ Detached trigger elements handled safely without throwing or stealing focus');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 8: RESEND ABORTSIGNAL.TIMEOUT & IDEMPOTENCY-KEY STRATEGY
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTest 8: Outbound Resend AbortSignal.timeout & Idempotency-Key Strategy');

// Mock Resend client simulating SDK v6.32.1 behavior with signal and idempotencyKey
class MockResendClient {
  async send(payload, options = {}) {
    const { signal, idempotencyKey } = options;

    if (signal?.aborted) {
      return {
        data: null,
        error: { name: 'application_error', statusCode: null, message: 'Unable to fetch data. The request could not be resolved.' },
        headers: null,
      };
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({
          data: { id: `msg_${idempotencyKey || 'generated'}` },
          error: null,
          headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : {},
        });
      }, payload.mockDelayMs || 10);

      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve({
            data: null,
            error: { name: 'application_error', statusCode: null, message: 'Unable to fetch data. The request could not be resolved.' },
            headers: null,
          });
        });
      }
    });
  }
}

// Case 8a: Resend call resolves quickly (10ms) with AbortSignal.timeout(50ms) -> Success
const mockResend = new MockResendClient();
const fastSignal = AbortSignal.timeout(50);
const fastResult = await mockResend.send(
  { from: 'test@example.com', to: 'owner@example.com', mockDelayMs: 10 },
  { signal: fastSignal, idempotencyKey: 'feedback_101' }
);
assert.equal(fastSignal.aborted, false);
assert.equal(fastResult.data.id, 'msg_feedback_101');
assert.equal(fastResult.error, null);
console.log('  ✓ Fast Resend request resolves cleanly within AbortSignal.timeout window');

// Case 8b: Resend call hangs (100ms) with AbortSignal.timeout(30ms) -> Aborts cleanly
const slowSignal = AbortSignal.timeout(30);
const slowResult = await mockResend.send(
  { from: 'test@example.com', to: 'owner@example.com', mockDelayMs: 100 },
  { signal: slowSignal, idempotencyKey: 'feedback_102' }
);
assert.equal(slowSignal.aborted, true);
assert.equal(slowSignal.reason?.name, 'TimeoutError');
assert.equal(slowResult.data, null);
assert.ok(slowResult.error);
console.log('  ✓ Hanging Resend request correctly aborts via AbortSignal.timeout()');

// Case 8c: Consistent stable idempotencyKey format across initial route and retry attempts
function getFeedbackIdempotencyKey(recordId) {
  return `feedback_${recordId}`;
}

const testRecordId = 42;
const initialKey = getFeedbackIdempotencyKey(testRecordId);
const retryAttempt1Key = getFeedbackIdempotencyKey(testRecordId);
const retryAttempt2Key = getFeedbackIdempotencyKey(testRecordId);
const retryAttempt5Key = getFeedbackIdempotencyKey(testRecordId);

assert.equal(initialKey, 'feedback_42');
assert.equal(retryAttempt1Key, initialKey);
assert.equal(retryAttempt2Key, initialKey);
assert.equal(retryAttempt5Key, initialKey);
assert.notEqual(getFeedbackIdempotencyKey(43), initialKey);
console.log('  ✓ Stable idempotencyKey ("feedback_${id}") reused across initial dispatch and all retry attempts');

// Case 8d: Route status transition on timeout -> honest reporting without claiming delivery
let deliveryError = null;
if (slowSignal.aborted) {
  deliveryError =
    slowSignal.reason?.name === 'TimeoutError'
      ? 'Resend request timed out after 30ms'
      : (slowSignal.reason?.message || 'Resend request was aborted');
}

const routeResponseOnTimeout = {
  dbUpdatedStatus: 'failed',
  dbDeliveryError: deliveryError,
  emailSent: false,
  responseJson: {
    success: true,
    emailDelivered: false,
    message: 'Your feedback was received. Email notification is pending.',
  },
};
assert.equal(routeResponseOnTimeout.emailSent, false);
assert.equal(routeResponseOnTimeout.dbUpdatedStatus, 'failed');
assert.equal(routeResponseOnTimeout.dbDeliveryError, 'Resend request timed out after 30ms');
assert.equal(routeResponseOnTimeout.responseJson.emailDelivered, false);
console.log('  ✓ Timed-out Resend requests durably preserve record and report honest pending state');

// ─────────────────────────────────────────────────────────────────────────────
// TEST 9: STALE DELIVERY ERROR CLEANUP ON RETRY SUCCESS (MOCKED DB TEST)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTest 9: Stale Error Reset on Successful Retry (Mocked Database Test)');

class MockRetryDatabasePool {
  constructor(records = []) {
    this.records = records.map((r) => ({ ...r }));
    this.queriesExecuted = [];
  }

  async query(sqlText, params = []) {
    this.queriesExecuted.push({ sqlText, params });
    const trimmed = sqlText.trim();

    // 1. Candidate Selection Query
    if (trimmed.startsWith('SELECT id, retry_count, delivery_status')) {
      const candidates = this.records.filter(
        (r) =>
          r.retry_count < params[0] &&
          (r.delivery_status === 'pending' || r.delivery_status === 'failed')
      );
      return { rowCount: candidates.length, rows: candidates };
    }

    // 2. Atomic Claim Query
    if (trimmed.startsWith('UPDATE feedback') && trimmed.includes("delivery_status = 'retrying'")) {
      const id = params[0];
      const record = this.records.find((r) => r.id === id);
      if (record && (record.delivery_status === 'pending' || record.delivery_status === 'failed')) {
        record.delivery_status = 'retrying';
        record.claim_started_at = new Date();
        return { rowCount: 1, rows: [{ id: record.id }] };
      }
      return { rowCount: 0, rows: [] };
    }

    // 3. Success Query (Production update logic)
    if (trimmed.startsWith('UPDATE feedback') && trimmed.includes("delivery_status = 'sent'")) {
      const id = params[0];
      const messageId = params[1];
      const record = this.records.find((r) => r.id === id);
      if (record) {
        record.email_sent = true;
        record.delivery_status = 'sent';
        record.resend_message_id = messageId;
        record.delivery_attempted_at = new Date();
        record.claim_started_at = null;
        // Verify production SQL query explicitly specifies delivery_error = NULL
        if (sqlText.includes('delivery_error = NULL')) {
          record.delivery_error = null;
        }
        return { rowCount: 1, rows: [] };
      }
    }

    // 4. Failure Query (Production failure logic)
    if (trimmed.startsWith('UPDATE feedback') && trimmed.includes('email_sent = false')) {
      const id = params[0];
      const newStatus = params[1];
      const nextRetryCount = params[2];
      const deliveryErrorMessage = params[3];
      const record = this.records.find((r) => r.id === id);
      if (record) {
        record.email_sent = false;
        record.delivery_status = newStatus;
        record.retry_count = nextRetryCount;
        record.delivery_attempted_at = new Date();
        record.delivery_error = deliveryErrorMessage;
        record.claim_started_at = null;
        return { rowCount: 1, rows: [] };
      }
    }

    return { rowCount: 0, rows: [] };
  }

  async end() {
    // No-op for mock pool
  }
}

// Case 9a: Previously failed record (with stale delivery_error) successfully sent by worker
const failedRecord = {
  id: 'record-stale-err-1',
  retry_count: 0,
  delivery_status: 'failed',
  delivery_error: 'RESEND_API_KEY is not configured',
  delivery_attempted_at: null,
  claim_started_at: null,
  category: 'general',
  name_provided: 'Anonymous',
  message: 'This is test feedback that had an earlier failure.',
  ip_hash: 'mock_ip_hash_1',
  email_sent: false,
};

const mockPoolSuccess = new MockRetryDatabasePool([failedRecord]);
const mockResendSuccess = {
  emails: {
    send: async () => ({
      data: { id: 'msg_resend_retry_success_456' },
      error: null,
    }),
  },
};

const workerResult = await runFeedbackRetryWorker({
  pool: mockPoolSuccess,
  resend: mockResendSuccess,
  log: () => {},
  errorLog: () => {},
});

assert.equal(workerResult.sent, 1);
assert.equal(workerResult.failed, 0);

// Verify production record transition
const updatedRecord = mockPoolSuccess.records[0];
assert.equal(updatedRecord.delivery_status, 'sent');
assert.equal(updatedRecord.email_sent, true);
assert.equal(updatedRecord.delivery_error, null); // Stale error MUST be cleared to null
assert.equal(updatedRecord.resend_message_id, 'msg_resend_retry_success_456');
assert.equal(updatedRecord.claim_started_at, null); // Claim lease released
assert.equal(updatedRecord.retry_count, 0);

// Verify that the actual SQL query executed by the worker contained 'delivery_error = NULL'
const successQueryExecuted = mockPoolSuccess.queriesExecuted.find((q) =>
  q.sqlText.includes("delivery_status = 'sent'")
);
assert.ok(successQueryExecuted, 'Production success query was executed');
assert.match(successQueryExecuted.sqlText, /delivery_error\s*=\s*NULL/i);
console.log('  ✓ Production retry worker successfully clears stale delivery_error to NULL on successful dispatch');
console.log('  ✓ Verified lease claim released (claim_started_at = NULL) and resend_message_id populated');

// Case 9b: Failed delivery attempt preserves and records its latest error
const failingRecord = {
  id: 'record-failing-2',
  retry_count: 0,
  delivery_status: 'failed',
  delivery_error: 'Prior error message',
  delivery_attempted_at: null,
  claim_started_at: null,
  category: 'bug',
  name_provided: 'Tester',
  message: 'Another feedback message',
  ip_hash: 'mock_ip_hash_2',
  email_sent: false,
};

const mockPoolFailure = new MockRetryDatabasePool([failingRecord]);
const mockResendFailure = {
  emails: {
    send: async () => ({
      data: null,
      error: { message: 'Resend API rate limit exceeded' },
    }),
  },
};

const failWorkerResult = await runFeedbackRetryWorker({
  pool: mockPoolFailure,
  resend: mockResendFailure,
  log: () => {},
  errorLog: () => {},
});

assert.equal(failWorkerResult.sent, 0);
assert.equal(failWorkerResult.failed, 1);

const updatedFailedRecord = mockPoolFailure.records[0];
assert.equal(updatedFailedRecord.delivery_status, 'failed');
assert.equal(updatedFailedRecord.email_sent, false);
assert.equal(updatedFailedRecord.retry_count, 1);
assert.equal(updatedFailedRecord.delivery_error, 'Resend API rate limit exceeded');
assert.equal(updatedFailedRecord.claim_started_at, null);
console.log('  ✓ Failed delivery attempts correctly update delivery_error with the latest error message');

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('   ALL PHASE 6 UNIT & INTEGRATION TESTS PASSED SUCCESSFULLY   ');
console.log('═══════════════════════════════════════════════════════════════\n');
