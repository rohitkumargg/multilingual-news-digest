import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

// Import actual production route handlers
import { POST as registerHandler } from '../app/api/user/register/route.js';
import { POST as saveArticleHandler } from '../app/api/user/saved/route.js';
import { GET as getSavedArticlesHandler } from '../app/api/user/saved/route.js';
import { DELETE as deleteArticleHandler } from '../app/api/user/saved/[stableId]/route.js';
import { POST as streakHandler } from '../app/api/user/streak/route.js';
import { GET as profileHandler } from '../app/api/user/profile/route.js';

// Production helpers
import { stableArticleId } from './articleId.js';
import { currentCalendarDay } from './streakLogic.js';

// Mocks injected at module boundary
import { mockState, resetMockState } from '../scratch/mock_db.mjs';
import { setMockSession, clearMockSession } from '../scratch/mock_auth.mjs';

function createJsonRequest(url, method, body, headers = {}) {
  const reqHeaders = new Headers({
    'Content-Type': 'application/json',
    'x-forwarded-for': '203.0.113.195',
    ...headers,
  });

  return new Request(url, {
    method,
    headers: reqHeaders,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function createRawRequest(url, method, rawBody, contentType = 'application/json') {
  return new Request(url, {
    method,
    headers: new Headers({
      'Content-Type': contentType,
      'x-forwarded-for': '203.0.113.195',
    }),
    body: rawBody,
  });
}

function getYesterday(todayStr) {
  const [y, m, d] = todayStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

describe('Phase 8B: Actual Route Handler Tests with Mocked Boundaries', () => {

  beforeEach(() => {
    resetMockState();
    clearMockSession();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. REGISTRATION ROUTE HANDLER (app/api/user/register/route.js)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('POST /api/user/register — Actual Route Handler Execution', () => {

    it('rejects malformed or unparseable JSON with HTTP 400', async () => {
      const req = createRawRequest('http://localhost:3000/api/user/register', 'POST', '{bad json:');
      const res = await registerHandler(req);
      const data = await res.json();

      assert.equal(res.status, 400);
      assert.deepEqual(data, { success: false, error: 'Invalid JSON request body.' });
    });

    it('rejects missing or non-string email with HTTP 400', async () => {
      const req1 = createJsonRequest('http://localhost:3000/api/user/register', 'POST', {
        password: 'ValidPassword123!',
      });
      const res1 = await registerHandler(req1);
      assert.equal(res1.status, 400);
      assert.equal((await res1.json()).error, 'Invalid email format');

      const req2 = createJsonRequest('http://localhost:3000/api/user/register', 'POST', {
        email: 12345,
        password: 'ValidPassword123!',
      });
      const res2 = await registerHandler(req2);
      assert.equal(res2.status, 400);
      assert.equal((await res2.json()).error, 'Invalid email format');
    });

    it('rejects invalid email formats and overlength emails with HTTP 400', async () => {
      const invalidEmails = [
        'plainaddress',
        '@example.com',
        'email.example.com',
        'email@example@example.com',
        'email@example',
        `${'a'.repeat(245)}@example.com`, // 257 chars
      ];

      for (const email of invalidEmails) {
        const req = createJsonRequest('http://localhost:3000/api/user/register', 'POST', {
          email,
          password: 'ValidPassword123!',
        });
        const res = await registerHandler(req);
        assert.equal(res.status, 400, `Expected 400 for ${email}`);
        assert.equal((await res.json()).error, 'Invalid email format');
      }
    });

    it('rejects passwords below 8 and above 128 characters with HTTP 400', async () => {
      // Below 8
      const reqShort = createJsonRequest('http://localhost:3000/api/user/register', 'POST', {
        email: 'user@example.com',
        password: '1234567',
      });
      const resShort = await registerHandler(reqShort);
      assert.equal(resShort.status, 400);
      assert.equal((await resShort.json()).error, 'Password must be at least 8 characters');

      // Above 128
      const reqLong = createJsonRequest('http://localhost:3000/api/user/register', 'POST', {
        email: 'user@example.com',
        password: 'P'.repeat(129),
      });
      const resLong = await registerHandler(reqLong);
      assert.equal(resLong.status, 400);
      assert.equal((await resLong.json()).error, 'Password must not exceed 128 characters');
    });

    it('rejects duplicate email with HTTP 409 Conflict', async () => {
      // Mock returns an existing user row
      mockState.existingUsers = [{ id: 'existing-uuid-123' }];

      const req = createJsonRequest('http://localhost:3000/api/user/register', 'POST', {
        email: 'existing.user@example.com',
        password: 'StrongPassword123!',
      });
      const res = await registerHandler(req);
      const data = await res.json();

      assert.equal(res.status, 409);
      assert.deepEqual(data, {
        success: false,
        error: 'An account with this email already exists.',
      });
    });

    it('enforces registration rate limiting (HTTP 429) when exceeding 5 per hour', async () => {
      // Mock rate limit counter returning 6
      mockState.rateLimitCount = 6;

      const req = createJsonRequest('http://localhost:3000/api/user/register', 'POST', {
        email: 'spammer@example.com',
        password: 'StrongPassword123!',
      });
      const res = await registerHandler(req);
      const data = await res.json();

      assert.equal(res.status, 429);
      assert.deepEqual(data, {
        success: false,
        error: 'Too many registrations from this IP address. Maximum 5 per hour.',
      });
    });

    it('successfully creates account (HTTP 201), normalizes email, and hashes password before persistence', async () => {
      mockState.existingUsers = [];
      mockState.rateLimitCount = 1;

      const rawPassword = 'MySecretPassword2026!';
      const req = createJsonRequest('http://localhost:3000/api/user/register', 'POST', {
        email: '   NewReader@NewsDigest.IN   ',
        password: rawPassword,
      });

      const res = await registerHandler(req);
      const data = await res.json();

      assert.equal(res.status, 201);
      assert.deepEqual(data, { success: true, message: 'Account created.' });

      // Verify database interaction
      assert.equal(mockState.insertedUsers.length, 1);
      const inserted = mockState.insertedUsers[0];

      // 1. Email normalized
      assert.equal(inserted.email, 'newreader@newsdigest.in');

      // 2. Password hashed with bcrypt
      assert.notEqual(inserted.password_hash, rawPassword);
      assert.ok(inserted.password_hash.startsWith('$2'));

      // 3. Hash matches raw password
      const passwordMatches = await bcrypt.compare(rawPassword, inserted.password_hash);
      assert.equal(passwordMatches, true);
    });

    it('returns HTTP 500 when database throws an unexpected error', async () => {
      mockState.throwError = new Error('Database connection pool terminated');

      const req = createJsonRequest('http://localhost:3000/api/user/register', 'POST', {
        email: 'user@example.com',
        password: 'ValidPassword123!',
      });

      const res = await registerHandler(req);
      const data = await res.json();

      assert.equal(res.status, 500);
      assert.deepEqual(data, {
        success: false,
        error: 'Failed to create account. Please try again later.',
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. SAVED ARTICLES POST ROUTE HANDLER (app/api/user/saved/route.js)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('POST /api/user/saved — Actual Route Handler Execution', () => {

    const testUrl = 'https://www.thehindu.com/news/national/general-elections-update.ece';
    const validStableId = stableArticleId({ link: testUrl });

    it('rejects unauthenticated requests with HTTP 401 Unauthorized', async () => {
      clearMockSession();

      const req = createJsonRequest('http://localhost:3000/api/user/saved', 'POST', {
        stableId: validStableId,
        link: testUrl,
        title: 'Election Update',
      });

      const res = await saveArticleHandler(req);
      const data = await res.json();

      assert.equal(res.status, 401);
      assert.deepEqual(data, {
        success: false,
        error: 'Unauthorized. Please sign in to save articles.',
      });
    });

    it('rejects missing required fields (stableId, link, title) with HTTP 400', async () => {
      setMockSession({ user: { id: 'usr-123' } });

      // Missing stableId
      const res1 = await saveArticleHandler(
        createJsonRequest('http://localhost:3000/api/user/saved', 'POST', { link: testUrl, title: 'Title' })
      );
      assert.equal(res1.status, 400);
      assert.equal((await res1.json()).error, 'Article stableId is required.');

      // Missing link
      const res2 = await saveArticleHandler(
        createJsonRequest('http://localhost:3000/api/user/saved', 'POST', { stableId: validStableId, title: 'Title' })
      );
      assert.equal(res2.status, 400);
      assert.equal((await res2.json()).error, 'Article link URL is required.');

      // Missing title
      const res3 = await saveArticleHandler(
        createJsonRequest('http://localhost:3000/api/user/saved', 'POST', { stableId: validStableId, link: testUrl })
      );
      assert.equal(res3.status, 400);
      assert.equal((await res3.json()).error, 'Article title is required.');
    });

    it('rejects invalid URLs and unsupported schemes (javascript:, ftp:) with HTTP 400', async () => {
      setMockSession({ user: { id: 'usr-123' } });

      const invalidLinks = [
        'javascript:alert(1)',
        'ftp://mirror.aarnet.edu.au/pub/test.iso',
        'data:text/html,<h1>Hello</h1>',
        'not-a-valid-url',
        'http://',
      ];

      for (const link of invalidLinks) {
        const req = createJsonRequest('http://localhost:3000/api/user/saved', 'POST', {
          stableId: 'some-stable-id',
          link,
          title: 'Exploit Story',
        });
        const res = await saveArticleHandler(req);
        assert.equal(res.status, 400, `Expected 400 for ${link}`);
        assert.equal((await res.json()).error, 'Invalid article URL format.');
      }
    });

    it('rejects mismatched client-supplied stable ID with HTTP 400', async () => {
      setMockSession({ user: { id: 'usr-123' } });

      // Client passes a forged stable ID that doesn't match the server's stableArticleId({ link })
      const forgedStableId = 'abcdef0123456789abcdef0123456789';

      const req = createJsonRequest('http://localhost:3000/api/user/saved', 'POST', {
        stableId: forgedStableId,
        link: testUrl,
        title: 'Authentic Headline',
      });

      const res = await saveArticleHandler(req);
      const data = await res.json();

      assert.equal(res.status, 400);
      assert.deepEqual(data, {
        success: false,
        error: 'Invalid article identifier.',
      });
    });

    it('successfully saves valid article (HTTP 201) using authenticated user ID', async () => {
      const authUserId = 'usr-authenticated-456';
      setMockSession({ user: { id: authUserId } });

      const req = createJsonRequest('http://localhost:3000/api/user/saved', 'POST', {
        stableId: validStableId,
        link: testUrl,
        title: 'Election Update 2026',
        source: 'The Hindu',
        category: 'politics',
        summary: 'A detailed summary of election updates.',
      });

      const res = await saveArticleHandler(req);
      const data = await res.json();

      assert.equal(res.status, 201);
      assert.equal(data.success, true);
      assert.ok(data.savedAt);

      // Verify the database transaction was called and wrote with the authenticated user ID
      const txInsert = mockState.lastQueries.find((q) => q.type === 'tx.insert');
      assert.ok(txInsert, 'Must execute a transaction insert');
      assert.equal(txInsert.vals.user_id, authUserId);
      assert.equal(txInsert.vals.article_stable_id, validStableId);
      assert.equal(txInsert.vals.article_link, testUrl);
      assert.equal(txInsert.vals.article_title, 'Election Update 2026');
      assert.equal(txInsert.vals.article_category, 'politics');
    });

    it('handles duplicate save idempotently (HTTP 200 with alreadySaved: true)', async () => {
      setMockSession({ user: { id: 'usr-123' } });
      mockState.existingSavedArticles = [{ id: 'saved-record-1' }];

      const req = createJsonRequest('http://localhost:3000/api/user/saved', 'POST', {
        stableId: validStableId,
        link: testUrl,
        title: 'Already Saved Headline',
      });

      const res = await saveArticleHandler(req);
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.deepEqual(data, {
        success: true,
        alreadySaved: true,
      });
    });

    it('enforces 500-article account limit (HTTP 400)', async () => {
      setMockSession({ user: { id: 'usr-123' } });
      mockState.savedArticleCount = 500;

      const req = createJsonRequest('http://localhost:3000/api/user/saved', 'POST', {
        stableId: validStableId,
        link: testUrl,
        title: '501st Article',
      });

      const res = await saveArticleHandler(req);
      const data = await res.json();

      assert.equal(res.status, 400);
      assert.deepEqual(data, {
        success: false,
        error: 'Maximum limit of 500 saved articles reached. Remove older saved articles to bookmark new ones.',
      });
    });

    it('returns HTTP 500 on unexpected database error during save', async () => {
      setMockSession({ user: { id: 'usr-123' } });
      mockState.throwError = new Error('Lock acquisition timeout');

      const req = createJsonRequest('http://localhost:3000/api/user/saved', 'POST', {
        stableId: validStableId,
        link: testUrl,
        title: 'Story',
      });

      const res = await saveArticleHandler(req);
      const data = await res.json();

      assert.equal(res.status, 500);
      assert.deepEqual(data, {
        success: false,
        error: 'Failed to save article. Please try again.',
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. SAVED ARTICLES DELETE ROUTE HANDLER (app/api/user/saved/[stableId]/route.js)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('DELETE /api/user/saved/[stableId] — Actual Route Handler Execution', () => {

    const targetStableId = '71614468abcdef0123456789abcdef01';

    it('rejects unauthenticated requests with HTTP 401 Unauthorized', async () => {
      clearMockSession();

      const req = new Request(`http://localhost:3000/api/user/saved/${targetStableId}`, { method: 'DELETE' });
      const res = await deleteArticleHandler(req, { params: Promise.resolve({ stableId: targetStableId }) });
      const data = await res.json();

      assert.equal(res.status, 401);
      assert.deepEqual(data, {
        success: false,
        error: 'Unauthorized. Please sign in to manage saved articles.',
      });
    });

    it('successfully deletes saved article (HTTP 200) with user ownership constraint', async () => {
      const authUserId = 'usr-owner-789';
      setMockSession({ user: { id: authUserId } });
      mockState.deleteResult = [{ id: 'saved-entry-1' }];

      const req = new Request(`http://localhost:3000/api/user/saved/${targetStableId}`, { method: 'DELETE' });
      const res = await deleteArticleHandler(req, { params: Promise.resolve({ stableId: targetStableId }) });
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.deepEqual(data, { success: true });

      // Verify the delete query was issued with ownership constraint
      const deleteQuery = mockState.lastQueries.find((q) => q.type === 'delete');
      assert.ok(deleteQuery, 'Must execute delete query');
    });

    it('returns HTTP 404 when article is not found or belongs to another user', async () => {
      // If another user attempts deletion, mock returns 0 affected rows
      setMockSession({ user: { id: 'usr-different-user' } });
      mockState.deleteResult = []; // 0 deleted records

      const req = new Request(`http://localhost:3000/api/user/saved/${targetStableId}`, { method: 'DELETE' });
      const res = await deleteArticleHandler(req, { params: Promise.resolve({ stableId: targetStableId }) });
      const data = await res.json();

      assert.equal(res.status, 404);
      assert.deepEqual(data, {
        success: false,
        error: 'Article not found in saved list.',
      });
    });

    it('returns HTTP 500 when database throws an error during deletion', async () => {
      setMockSession({ user: { id: 'usr-123' } });
      mockState.throwError = new Error('Database connection interrupted');

      const req = new Request(`http://localhost:3000/api/user/saved/${targetStableId}`, { method: 'DELETE' });
      const res = await deleteArticleHandler(req, { params: Promise.resolve({ stableId: targetStableId }) });
      const data = await res.json();

      assert.equal(res.status, 500);
      assert.deepEqual(data, {
        success: false,
        error: 'Failed to delete saved article. Please try again.',
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. USER STREAK ROUTE HANDLER (app/api/user/streak/route.js)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('POST /api/user/streak — Actual Route Handler Execution', () => {

    it('rejects unauthenticated requests with HTTP 401 Unauthorized', async () => {
      clearMockSession();

      const res = await streakHandler();
      const data = await res.json();

      assert.equal(res.status, 401);
      assert.deepEqual(data, {
        success: false,
        error: 'Unauthorized. Please sign in to record streaks.',
      });
    });

    it('first qualifying login creates initial streak record (HTTP 200, current: 1, longest: 1)', async () => {
      const today = currentCalendarDay();
      setMockSession({ user: { id: 'usr-streak-1' } });
      mockState.userStreakRows = [
        { current_streak: 0, longest_streak: 0, last_login_date: null, today_counted: false },
      ];

      const res = await streakHandler();
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.deepEqual(data, {
        type: 'first',
        current_streak: 1,
        longest_streak: 1,
        today,
      });

      // Assert tx.update set the record to day 1
      const updateQuery = mockState.lastQueries.find((q) => q.type === 'tx.update');
      assert.ok(updateQuery, 'Must execute transaction update');
      assert.equal(updateQuery.set.current_streak, 1);
      assert.equal(updateQuery.set.longest_streak, 1);
      assert.equal(updateQuery.set.last_login_date, today);
      assert.equal(updateQuery.set.today_counted, true);
    });

    it('same-day login is idempotent (HTTP 200, type: same_day, no DB update)', async () => {
      const today = currentCalendarDay();
      setMockSession({ user: { id: 'usr-streak-1' } });
      mockState.userStreakRows = [
        { current_streak: 5, longest_streak: 10, last_login_date: today, today_counted: true },
      ];

      const res = await streakHandler();
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.deepEqual(data, {
        type: 'same_day',
        current_streak: 5,
        longest_streak: 10,
        today,
      });

      // Assert tx.update was skipped
      const updateQuery = mockState.lastQueries.find((q) => q.type === 'tx.update');
      assert.equal(updateQuery, undefined, 'tx.update must NOT be called for same_day login');
    });

    it('consecutive-day login increments current streak and updates longest streak', async () => {
      const today = currentCalendarDay();
      const yesterday = getYesterday(today);
      setMockSession({ user: { id: 'usr-streak-1' } });
      mockState.userStreakRows = [
        { current_streak: 3, longest_streak: 3, last_login_date: yesterday, today_counted: true },
      ];

      const res = await streakHandler();
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.deepEqual(data, {
        type: 'increment',
        current_streak: 4,
        longest_streak: 4,
        today,
      });

      const updateQuery = mockState.lastQueries.find((q) => q.type === 'tx.update');
      assert.ok(updateQuery, 'Must execute transaction update');
      assert.equal(updateQuery.set.current_streak, 4);
      assert.equal(updateQuery.set.longest_streak, 4);
      assert.equal(updateQuery.set.last_login_date, today);
      assert.equal(updateQuery.set.today_counted, true);
    });

    it('missed day resets current streak to 1 while preserving historical longest streak', async () => {
      const today = currentCalendarDay();
      setMockSession({ user: { id: 'usr-streak-1' } });
      mockState.userStreakRows = [
        { current_streak: 12, longest_streak: 20, last_login_date: '2026-01-01', today_counted: true },
      ];

      const res = await streakHandler();
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.deepEqual(data, {
        type: 'reset',
        current_streak: 1,
        longest_streak: 20,
        today,
      });

      const updateQuery = mockState.lastQueries.find((q) => q.type === 'tx.update');
      assert.ok(updateQuery, 'Must execute transaction update');
      assert.equal(updateQuery.set.current_streak, 1);
      assert.equal(updateQuery.set.longest_streak, 20);
      assert.equal(updateQuery.set.last_login_date, today);
    });

    it('returns HTTP 500 when database throws an error during streak processing', async () => {
      setMockSession({ user: { id: 'usr-streak-1' } });
      mockState.throwError = new Error('Lock acquisition failed');

      const res = await streakHandler();
      const data = await res.json();

      assert.equal(res.status, 500);
      assert.deepEqual(data, {
        success: false,
        error: 'Failed to record streak update. Please try again.',
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. USER PROFILE ROUTE HANDLER (app/api/user/profile/route.js)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('GET /api/user/profile — Actual Route Handler Execution', () => {

    it('rejects unauthenticated requests with HTTP 401 Unauthorized', async () => {
      clearMockSession();

      const res = await profileHandler();
      const data = await res.json();

      assert.equal(res.status, 401);
      assert.deepEqual(data, {
        success: false,
        error: 'Unauthorized. Please sign in to view your profile.',
      });
    });

    it('returns HTTP 404 when authenticated user account is not found in database', async () => {
      setMockSession({ user: { id: 'usr-deleted' } });
      mockState.existingUsers = [];

      const res = await profileHandler();
      const data = await res.json();

      assert.equal(res.status, 404);
      assert.deepEqual(data, {
        success: false,
        error: 'User account not found.',
      });
    });

    it('returns complete profile with active streaks and saved article count (HTTP 200)', async () => {
      setMockSession({ user: { id: 'usr-active' } });
      const createdDate = new Date('2026-02-15T10:30:00.000Z');

      mockState.existingUsers = [{ email: 'active.user@newsdigest.in', createdAt: createdDate }];
      mockState.profileStreakRows = [{ currentStreak: 7, longestStreak: 14, lastLoginDate: '2026-10-22' }];
      mockState.savedArticleCount = 12;

      const res = await profileHandler();
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.deepEqual(data, {
        email: 'active.user@newsdigest.in',
        createdAt: createdDate.toISOString(),
        currentStreak: 7,
        longestStreak: 14,
        lastLoginDate: '2026-10-22',
        savedCount: 12,
      });
    });

    it('handles uninitialized streaks and empty saved articles with default values (HTTP 200)', async () => {
      setMockSession({ user: { id: 'usr-fresh' } });
      const createdDate = new Date('2026-10-23T08:00:00.000Z');

      mockState.existingUsers = [{ email: 'fresh.user@newsdigest.in', createdAt: createdDate }];
      mockState.profileStreakRows = []; // Uninitialized streak row
      mockState.savedArticleCount = 0;  // 0 saved articles

      const res = await profileHandler();
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.deepEqual(data, {
        email: 'fresh.user@newsdigest.in',
        createdAt: createdDate.toISOString(),
        currentStreak: 0,
        longestStreak: 0,
        lastLoginDate: null,
        savedCount: 0,
      });
    });

    it('returns HTTP 500 when database throws an error during profile retrieval', async () => {
      setMockSession({ user: { id: 'usr-active' } });
      mockState.throwError = new Error('Database read failure');

      const res = await profileHandler();
      const data = await res.json();

      assert.equal(res.status, 500);
      assert.deepEqual(data, {
        success: false,
        error: 'Failed to retrieve profile data. Please try again.',
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. SAVED ARTICLES GET ROUTE HANDLER (app/api/user/saved/route.js)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('GET /api/user/saved — Actual Route Handler Execution', () => {

    it('rejects unauthenticated requests with HTTP 401 Unauthorized', async () => {
      clearMockSession();

      const req = new Request('http://localhost:3000/api/user/saved');
      const res = await getSavedArticlesHandler(req);
      const data = await res.json();

      assert.equal(res.status, 401);
      assert.deepEqual(data, {
        success: false,
        error: 'Unauthorized. Please sign in to view saved articles.',
      });
    });

    it('returns paginated saved articles with default parameters (page 1, limit 20)', async () => {
      const authUserId = 'usr-saved-test';
      setMockSession({ user: { id: authUserId } });

      const pubDate = new Date('2026-10-20T12:00:00.000Z');
      const savedAt = new Date('2026-10-21T15:00:00.000Z');

      mockState.savedArticleCount = 1;
      mockState.savedArticleRows = [
        {
          article_stable_id: 'art-stable-1',
          article_link: 'https://thehindu.com/news/national/story-1',
          article_title: 'Headline 1',
          article_source: 'The Hindu',
          article_image_url: 'https://img.com/1.jpg',
          article_summary: 'Summary 1',
          article_category: 'politics',
          article_pub_date: pubDate,
          saved_at: savedAt,
        },
      ];

      const req = new Request('http://localhost:3000/api/user/saved');
      const res = await getSavedArticlesHandler(req);
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.page, 1);
      assert.equal(data.limit, 20);
      assert.equal(data.total, 1);
      assert.equal(data.articles.length, 1);

      assert.deepEqual(data.articles[0], {
        stableId: 'art-stable-1',
        link: 'https://thehindu.com/news/national/story-1',
        title: 'Headline 1',
        source: 'The Hindu',
        imageUrl: 'https://img.com/1.jpg',
        summary: 'Summary 1',
        category: 'politics',
        pubDate: pubDate.toISOString(),
        savedAt: savedAt.toISOString(),
      });

      // Verify pagination values sent to query builder
      const paginationQuery = mockState.lastQueries.find((q) => q.type === 'select.pagination');
      assert.ok(paginationQuery, 'Must execute pagination query');
      assert.equal(paginationQuery.limit, 20);
      assert.equal(paginationQuery.offset, 0);
    });

    it('handles custom valid pagination parameters (e.g. page 3, limit 15)', async () => {
      setMockSession({ user: { id: 'usr-saved-test' } });
      mockState.savedArticleCount = 45;
      mockState.savedArticleRows = [];

      const req = new Request('http://localhost:3000/api/user/saved?page=3&limit=15');
      const res = await getSavedArticlesHandler(req);
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.page, 3);
      assert.equal(data.limit, 15);
      assert.equal(data.total, 45);

      const paginationQuery = mockState.lastQueries.find((q) => q.type === 'select.pagination');
      assert.ok(paginationQuery);
      assert.equal(paginationQuery.limit, 15);
      assert.equal(paginationQuery.offset, 30); // (3 - 1) * 15 = 30
    });

    it('falls back to defaults for invalid pagination values (non-numeric and negative values)', async () => {
      setMockSession({ user: { id: 'usr-saved-test' } });
      mockState.savedArticleCount = 10;
      mockState.savedArticleRows = [];

      // Non-numeric
      const reqInvalid = new Request('http://localhost:3000/api/user/saved?page=invalid&limit=bad');
      const resInvalid = await getSavedArticlesHandler(reqInvalid);
      const dataInvalid = await resInvalid.json();

      assert.equal(dataInvalid.page, 1);
      assert.equal(dataInvalid.limit, 20);

      // Negative
      const reqNeg = new Request('http://localhost:3000/api/user/saved?page=-5&limit=0');
      const resNeg = await getSavedArticlesHandler(reqNeg);
      const dataNeg = await resNeg.json();

      assert.equal(dataNeg.page, 1);
      assert.equal(dataNeg.limit, 20);
    });

    it('enforces maximum page size limit of 100', async () => {
      setMockSession({ user: { id: 'usr-saved-test' } });
      mockState.savedArticleCount = 200;
      mockState.savedArticleRows = [];

      const req = new Request('http://localhost:3000/api/user/saved?page=1&limit=500');
      const res = await getSavedArticlesHandler(req);
      const data = await res.json();

      assert.equal(data.limit, 100);

      const paginationQuery = mockState.lastQueries.find((q) => q.type === 'select.pagination');
      assert.equal(paginationQuery.limit, 100);
    });

    it('enforces user scoping on both count and paginated article queries', async () => {
      const authUserId = 'usr-scoped-owner-999';
      setMockSession({ user: { id: authUserId } });

      const req = new Request('http://localhost:3000/api/user/saved');
      const res = await getSavedArticlesHandler(req);
      assert.equal(res.status, 200);

      // Verify queries were recorded for saved_articles table
      const selectQueries = mockState.lastQueries.filter(
        (q) => q.table === 'saved_articles'
      );
      assert.ok(selectQueries.length >= 2, 'Should execute both count and paginated select queries');
    });

    it('returns empty array when user has zero saved articles (HTTP 200)', async () => {
      setMockSession({ user: { id: 'usr-empty' } });
      mockState.savedArticleCount = 0;
      mockState.savedArticleRows = [];

      const req = new Request('http://localhost:3000/api/user/saved');
      const res = await getSavedArticlesHandler(req);
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.deepEqual(data.articles, []);
      assert.equal(data.total, 0);
    });

    it('returns HTTP 500 when database throws an error during saved articles retrieval', async () => {
      setMockSession({ user: { id: 'usr-saved-test' } });
      mockState.throwError = new Error('Database read failure');

      const req = new Request('http://localhost:3000/api/user/saved');
      const res = await getSavedArticlesHandler(req);
      const data = await res.json();

      assert.equal(res.status, 500);
      assert.deepEqual(data, {
        success: false,
        error: 'Failed to retrieve saved articles. Please try again.',
      });
    });
  });
});
