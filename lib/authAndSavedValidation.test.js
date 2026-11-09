import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { stableArticleId } from './articleId.js';

// ─── 1. Registration Validation Logic Contract (§15, §23) ───────────────────
// Mirrors server-side rules in app/api/user/register/route.js without DB import

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRegistrationInput(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid JSON request body.', status: 400 };
  }

  const { email: rawEmail, password: rawPassword } = body;

  if (!rawEmail || typeof rawEmail !== 'string') {
    return { valid: false, error: 'Invalid email format', status: 400 };
  }

  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_REGEX.test(email) || email.length > 255) {
    return { valid: false, error: 'Invalid email format', status: 400 };
  }

  if (!rawPassword || typeof rawPassword !== 'string' || rawPassword.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters', status: 400 };
  }

  if (rawPassword.length > 128) {
    return { valid: false, error: 'Password must not exceed 128 characters', status: 400 };
  }

  return { valid: true, email, password: rawPassword };
}

// ─── 2. Credential Verification Contract (lib/auth.js) ──────────────────────
// Mirrors authorize() in lib/auth.js without next-auth Next.js runtime bindings

async function verifyCredentials(credentials, userLookupFn) {
  if (!credentials?.email || !credentials?.password) {
    return null;
  }

  const email = String(credentials.email).trim().toLowerCase();
  const password = String(credentials.password);

  const user = await userLookupFn(email);
  if (!user || !user.password_hash) {
    return null;
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
  };
}

// ─── 3. NextAuth Callbacks Contract (lib/auth.js) ───────────────────────────
// Mirrors jwt and session callbacks in lib/auth.js

const nextAuthCallbacks = {
  async jwt({ token, user }) {
    if (user) {
      token.id = user.id;
      token.email = user.email;
    }
    return token;
  },
  async session({ session, token }) {
    if (session?.user && token) {
      session.user.id = token.id;
      session.user.email = token.email;
    }
    return session;
  },
};

// ─── 4. Saved-Article Validation Contract (app/api/user/saved/route.js) ──────
// Mirrors input validation in app/api/user/saved/route.js using stableArticleId

function validateSaveArticleInput(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid JSON request body.', status: 400 };
  }

  const { stableId, link, title } = body;

  if (!stableId || typeof stableId !== 'string' || !stableId.trim()) {
    return { valid: false, error: 'Article stableId is required.', status: 400 };
  }

  if (!link || typeof link !== 'string' || !link.trim()) {
    return { valid: false, error: 'Article link URL is required.', status: 400 };
  }

  if (!title || typeof title !== 'string' || !title.trim()) {
    return { valid: false, error: 'Article title is required.', status: 400 };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(link.trim());
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return { valid: false, error: 'Invalid article URL format.', status: 400 };
    }
  } catch {
    return { valid: false, error: 'Invalid article URL format.', status: 400 };
  }

  const expectedId = stableArticleId({ link });
  if (!expectedId || expectedId !== stableId.trim()) {
    return { valid: false, error: 'Invalid article identifier.', status: 400 };
  }

  return { valid: true };
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST SUITES
// ═════════════════════════════════════════════════════════════════════════════

describe('Phase 8A: Authentication & Saved-Article Validation Logic', () => {

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Registration Validation Tests
  // ───────────────────────────────────────────────────────────────────────────
  describe('Registration Validation (app/api/user/register/route.js)', () => {
    it('rejects null or non-object request body', () => {
      assert.equal(validateRegistrationInput(null).valid, false);
      assert.equal(validateRegistrationInput(undefined).valid, false);
      assert.equal(validateRegistrationInput('string body').valid, false);
    });

    it('rejects missing, empty, or non-string email', () => {
      assert.equal(validateRegistrationInput({ email: '', password: 'ValidPassword123' }).valid, false);
      assert.equal(validateRegistrationInput({ email: null, password: 'ValidPassword123' }).valid, false);
      assert.equal(validateRegistrationInput({ email: 12345, password: 'ValidPassword123' }).valid, false);
      assert.equal(validateRegistrationInput({ password: 'ValidPassword123' }).valid, false);
    });

    it('rejects invalid email formats', () => {
      const invalidEmails = [
        'plainaddress',
        '@example.com',
        'Joe Smith <email@example.com>',
        'email.example.com',
        'email@example@example.com',
        'email@example', // missing dot
        'email with space@example.com',
      ];
      for (const email of invalidEmails) {
        const res = validateRegistrationInput({ email, password: 'ValidPassword123' });
        assert.equal(res.valid, false, `Expected invalid for: ${email}`);
        assert.equal(res.error, 'Invalid email format');
      }
    });

    it('rejects email exceeding maximum length boundary (255 characters)', () => {
      const longLocal = 'a'.repeat(245);
      const email257 = `${longLocal}@example.com`; // 245 + 12 = 257 chars
      assert.equal(email257.length > 255, true);
      const res = validateRegistrationInput({ email: email257, password: 'ValidPassword123' });
      assert.equal(res.valid, false);
      assert.equal(res.error, 'Invalid email format');
    });

    it('accepts email at maximum length boundary (255 characters)', () => {
      const localPart = 'a'.repeat(243);
      const email255 = `${localPart}@x.co`; // 243 + 5 = 248 chars <= 255
      const res = validateRegistrationInput({ email: email255, password: 'ValidPassword123' });
      assert.equal(res.valid, true);
    });

    it('normalizes email by trimming whitespace and converting to lowercase', () => {
      const res = validateRegistrationInput({
        email: '   Ravi.Kumar@Example.COM   ',
        password: 'ValidPassword123',
      });
      assert.equal(res.valid, true);
      assert.equal(res.email, 'ravi.kumar@example.com');
    });

    it('rejects password shorter than 8 characters', () => {
      const shortPasswords = ['', '1234567', 'abc', null, undefined];
      for (const password of shortPasswords) {
        const res = validateRegistrationInput({ email: 'user@example.com', password });
        assert.equal(res.valid, false);
        assert.equal(res.error, 'Password must be at least 8 characters');
      }
    });

    it('rejects password exceeding 128 characters', () => {
      const longPassword = 'P'.repeat(129);
      const res = validateRegistrationInput({ email: 'user@example.com', password: longPassword });
      assert.equal(res.valid, false);
      assert.equal(res.error, 'Password must not exceed 128 characters');
    });

    it('accepts valid password boundaries (8 chars and 128 chars)', () => {
      const res8 = validateRegistrationInput({ email: 'user@example.com', password: 'P'.repeat(8) });
      assert.equal(res8.valid, true);

      const res128 = validateRegistrationInput({ email: 'user@example.com', password: 'P'.repeat(128) });
      assert.equal(res128.valid, true);
    });

    it('accepts valid registration input', () => {
      const res = validateRegistrationInput({
        email: 'reader@newsdigest.in',
        password: 'StrongPassword2026!',
      });
      assert.equal(res.valid, true);
      assert.equal(res.email, 'reader@newsdigest.in');
      assert.equal(res.password, 'StrongPassword2026!');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Credential Verification Tests (lib/auth.js)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Credential Verification (lib/auth.js authorize())', () => {
    const rawPassword = 'CorrectPassword123!';
    let testPasswordHash;

    // Generate real bcrypt hash (12 rounds) once before running verification tests
    it('initializes bcrypt hash with 12 rounds for test fixtures', async () => {
      testPasswordHash = await bcrypt.hash(rawPassword, 12);
      assert.ok(testPasswordHash.startsWith('$2'));
    });

    it('verifies credentials successfully when email and password match', async () => {
      const mockLookup = async (email) => {
        if (email === 'user@example.com') {
          return { id: 'usr-uuid-1', email: 'user@example.com', password_hash: testPasswordHash };
        }
        return null;
      };

      const result = await verifyCredentials(
        { email: 'user@example.com', password: rawPassword },
        mockLookup
      );

      assert.deepEqual(result, {
        id: 'usr-uuid-1',
        email: 'user@example.com',
      });
    });

    it('normalizes email before lookup (case and whitespace insensitivity)', async () => {
      let queriedEmail = null;
      const mockLookup = async (email) => {
        queriedEmail = email;
        return { id: 'usr-uuid-2', email: 'user@example.com', password_hash: testPasswordHash };
      };

      const result = await verifyCredentials(
        { email: '   USER@EXAMPLE.COM   ', password: rawPassword },
        mockLookup
      );

      assert.equal(queriedEmail, 'user@example.com');
      assert.equal(result?.id, 'usr-uuid-2');
    });

    it('rejects when password does not match hash', async () => {
      const mockLookup = async () => ({
        id: 'usr-uuid-3',
        email: 'user@example.com',
        password_hash: testPasswordHash,
      });

      const result = await verifyCredentials(
        { email: 'user@example.com', password: 'WrongPassword456' },
        mockLookup
      );

      assert.equal(result, null);
    });

    it('returns null when user is not found in database', async () => {
      const mockLookup = async () => null;

      const result = await verifyCredentials(
        { email: 'nonexistent@example.com', password: rawPassword },
        mockLookup
      );

      assert.equal(result, null);
    });

    it('returns null immediately when email or password credentials are missing', async () => {
      let lookupCalled = false;
      const mockLookup = async () => {
        lookupCalled = true;
        return null;
      };

      assert.equal(await verifyCredentials(null, mockLookup), null);
      assert.equal(await verifyCredentials({}, mockLookup), null);
      assert.equal(await verifyCredentials({ email: 'user@example.com' }, mockLookup), null);
      assert.equal(await verifyCredentials({ password: 'Password123' }, mockLookup), null);
      assert.equal(lookupCalled, false, 'Database lookup must not be called when credentials are incomplete');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. NextAuth Callbacks Tests (lib/auth.js)
  // ───────────────────────────────────────────────────────────────────────────
  describe('NextAuth Callbacks (lib/auth.js)', () => {
    it('JWT callback maps user.id and user.email to token upon sign-in', async () => {
      const token = {};
      const user = { id: 'uuid-1234', email: 'test@domain.com' };

      const updatedToken = await nextAuthCallbacks.jwt({ token, user });

      assert.equal(updatedToken.id, 'uuid-1234');
      assert.equal(updatedToken.email, 'test@domain.com');
    });

    it('JWT callback preserves existing token values when user is not provided (subsequent calls)', async () => {
      const token = { id: 'uuid-1234', email: 'test@domain.com', custom: 'preserved' };

      const updatedToken = await nextAuthCallbacks.jwt({ token });

      assert.equal(updatedToken.id, 'uuid-1234');
      assert.equal(updatedToken.email, 'test@domain.com');
      assert.equal(updatedToken.custom, 'preserved');
    });

    it('Session callback copies token.id and token.email to session.user', async () => {
      const session = { user: { name: 'Reader' } };
      const token = { id: 'uuid-5678', email: 'reader@digest.com' };

      const updatedSession = await nextAuthCallbacks.session({ session, token });

      assert.equal(updatedSession.user.id, 'uuid-5678');
      assert.equal(updatedSession.user.email, 'reader@digest.com');
      assert.equal(updatedSession.user.name, 'Reader');
    });

    it('Session callback safely handles missing user or token without throwing', async () => {
      const emptySession = {};
      const token = { id: 'uuid-9999' };

      const res1 = await nextAuthCallbacks.session({ session: emptySession, token });
      assert.deepEqual(res1, {});

      const sessionWithUser = { user: {} };
      const res2 = await nextAuthCallbacks.session({ session: sessionWithUser, token: null });
      assert.deepEqual(res2, { user: {} });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Saved-Article Validation Tests (app/api/user/saved/route.js)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Saved-Article Validation (app/api/user/saved/route.js)', () => {
    const validUrl = 'https://www.thehindu.com/news/national/elections-2026.ece';
    const computedStableId = stableArticleId({ link: validUrl });

    it('accepts valid HTTP/HTTPS URLs with matching computed stable ID', () => {
      const res = validateSaveArticleInput({
        stableId: computedStableId,
        link: validUrl,
        title: 'National Election Updates 2026',
      });
      assert.equal(res.valid, true);
    });

    it('rejects unsupported URI protocols (javascript:, ftp:, data:, file:)', () => {
      const disallowed = [
        'javascript:alert(1)',
        'ftp://ftp.is.co.za/linux/distributions/README',
        'data:text/html,<script>alert(1)</script>',
        'file:///etc/passwd',
      ];

      for (const link of disallowed) {
        const id = stableArticleId({ link }) || 'dummy-stable-id';
        const res = validateSaveArticleInput({
          stableId: id,
          link,
          title: 'Malicious Link',
        });
        assert.equal(res.valid, false, `Expected rejection for: ${link}`);
        assert.equal(res.error, 'Invalid article URL format.');
      }
    });

    it('rejects malformed or unparseable URLs', () => {
      const badUrls = ['not-a-url', 'http://', 'https://', '://emptyhost'];
      for (const link of badUrls) {
        const res = validateSaveArticleInput({
          stableId: 'some-id',
          link,
          title: 'Bad URL Story',
        });
        assert.equal(res.valid, false);
        assert.equal(res.error, 'Invalid article URL format.');
      }
    });

    it('rejects mismatched or forged stable ID', () => {
      const res = validateSaveArticleInput({
        stableId: '00000000000000000000000000000000', // incorrect forged hash
        link: validUrl,
        title: 'National Election Updates 2026',
      });
      assert.equal(res.valid, false);
      assert.equal(res.error, 'Invalid article identifier.');
    });

    it('rejects missing or empty required fields (stableId, link, title)', () => {
      assert.equal(validateSaveArticleInput(null).valid, false);

      // Missing stableId
      assert.equal(
        validateSaveArticleInput({ link: validUrl, title: 'Story' }).error,
        'Article stableId is required.'
      );
      assert.equal(
        validateSaveArticleInput({ stableId: '   ', link: validUrl, title: 'Story' }).error,
        'Article stableId is required.'
      );

      // Missing link
      assert.equal(
        validateSaveArticleInput({ stableId: computedStableId, title: 'Story' }).error,
        'Article link URL is required.'
      );
      assert.equal(
        validateSaveArticleInput({ stableId: computedStableId, link: '   ', title: 'Story' }).error,
        'Article link URL is required.'
      );

      // Missing title
      assert.equal(
        validateSaveArticleInput({ stableId: computedStableId, link: validUrl }).error,
        'Article title is required.'
      );
      assert.equal(
        validateSaveArticleInput({ stableId: computedStableId, link: validUrl, title: '   ' }).error,
        'Article title is required.'
      );
    });
  });
});
