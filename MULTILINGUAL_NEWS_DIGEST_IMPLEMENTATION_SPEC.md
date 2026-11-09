# Multilingual News Digest — Complete Implementation Specification

**Project:** Multilingual News Digest (MND)  
**Repository:** https://github.com/rohitkumargg/multilingual-news-digest  
**Live Site:** https://multilingual-news-digest.vercel.app/  
**Spec authored:** 2026-10-13  
**Status:** Implementation-ready. No code was changed during specification writing.

---

## 1. Executive Summary

This document specifies three feature groups to be implemented on the MND website:

| # | Feature | Scope |
|---|---------|-------|
| 1 | **Feedback submission** | Real delivery/storage; never fake success |
| 2 | **Newspaper sharing** | Category-specific share + whole-paper share |
| 3 | **Authentication, streak, profile, saved news** | Proper account-based; no localStorage substitution |

All existing functionality (news fetching, categorization, translation, summarization, TTS, responsive layout) must remain intact. No unrelated refactoring.

**Selected provider stack (approved by user, 2026-10-13):**
- **Authentication:** NextAuth.js (Auth.js v5) with Credentials provider (email+password)
- **Database:** Neon (PostgreSQL, serverless) — free tier sufficient for this project
- **ORM:** Drizzle ORM (lightweight, edge-compatible, TypeScript-optional in JS projects)
- **Feedback delivery:** Durable database persistence in Neon PostgreSQL (primary) + Resend (email notification) with retry tracking
- **Spam protection:** Simple server-side rate limiting (IP + content hash) — no third-party CAPTCHA to minimize data collection

Rationale: NextAuth + Neon is the most commonly supported stack for Next.js App Router on Vercel, has generous free tiers, and requires no vendor lock-in beyond Neon's hosted Postgres. Drizzle provides type safety without code-gen complexity.

---

## 2. Verified Current Architecture

**Source-code verified facts** (from ZIP, 2026-10-13):

| Item | Value |
|------|-------|
| Next.js version | **16.3.3** |
| React version | 19.2.8 |
| Router | App Router (`app/`) |
| Main page | `app/page.js` — `'use client'` directive, single-page SPA-style |
| Language | JavaScript (no TypeScript) |
| Styling | CSS in `app/globals.css` (CSS variables, BEM-like class names) |
| Dependencies | `next`, `react`, `react-dom`, `rss-parser`, `sanitize-html` |
| Deployment | Vercel |
| Auth | **None currently** |
| Database | **None currently** |
| Feedback | **None currently** |

**Existing API routes (all in `app/api/`):**
- `GET /api/news` — fetch + summarize + optionally translate RSS articles
- `POST /api/translate` — translate texts/articles to Indian languages
- `POST /api/summarize` — (implied by lib; the route exists as `app/api/summarize/route.js`)
- `POST /api/tts` — text-to-speech

**Existing lib files:**
- `lib/rss.js` — RSS fetch, parse, image extraction, enrichment
- `lib/categorize.js` — content-based article categorization
- `lib/summarize.js` — algorithmic + Gemini-backed summarization
- `lib/translate.js` — Google Translate primary + Gemini/Bhashini fallback
- `lib/languages.js` — 12 Indian language codes
- `lib/constants.js` — CATEGORIES (6), INDIAN_STATES, CATEGORY_KEYWORDS, helpers
- `lib/translations.js` — UI string translations per language
- `lib/fetchNews.js` — client-side fetch utility calling `/api/news`
- `lib/speaker.js` — TTS via Google Translate TTS

**Existing components:**
- `Header.js` — masthead with StateSelector, LanguageSelector
- `CategoryNav.js` — horizontal tab bar for category filtering
- `CategorySection.js` — renders a section with one lead + up to 5 secondary `NewsCard`s
- `NewsCard.js` — individual article card with audio button
- `ArticleReaderModal.js` — in-site article reader modal
- `DateSwitcher.js` — date selection + search bar
- `NewsTicker.js` — breaking news ticker
- `LoadingState.js`, `ErrorState.js`, `Footer.js`, `StateSelector.js`, `LanguageSelector.js`

**Routing observation:**
The site is a **single-page application** with one route (`/`). Category selection is controlled by React state (`activeCategory`) — there are no distinct URL paths per category. The `CategorySection` renders with `id="category-{categoryId}"` anchor attributes (e.g. `id="category-politics"`).

**Article identity observation:**
Articles have an `id` field set to `item.guid || item.link || \`${Date.now()}-${Math.random()}\`` in `lib/rss.js`. GUIDs from reputable publishers (The Hindu, Indian Express, NDTV) are stable. Google News GUIDs are less reliable. The `link` field is the canonical URL and is more stable than a random ID.

**Environment variables currently in use:**
- `GEMINI_API_KEY` — optional; enables Gemini-based summarization and translation fallback
- `GEMINI_MODEL` — optional; defaults to `gemini-1.5-flash`
- `BHASHINI_API_KEY`, `BHASHINI_API_URL`, `BHASHINI_USER_ID` — optional Bhashini translation

---

## 3. Actual Existing Files/Components Relevant to Implementation

| File | Role in new features |
|------|---------------------|
| `app/page.js` | Must be modified: add auth session context, streak popup, share button props |
| `app/layout.js` | Must be modified: wrap with `SessionProvider` |
| `components/Header.js` | Must be modified: add whole-newspaper share button + auth nav links |
| `components/CategorySection.js` | Must be modified: add category share button |
| `components/NewsCard.js` | Must be modified: add save/bookmark button |
| `components/Footer.js` | Must be modified: add feedback link and Sign In / Account link (Approved Decision F) |
| `app/api/news/route.js` | Must be modified: attach server-computed `stableId` to each returned article (no other changes) |
| `lib/constants.js` | Untouched |
| `lib/rss.js` | Untouched |
| `lib/translate.js` | Untouched |
| `lib/summarize.js` | Untouched |
| `lib/fetchNews.js` | Untouched |
| `app/globals.css` | Append new styles; do not remove existing rules |

---

## 4. Scope: What Changes and What Remains Untouched

### Changes
- Add `lib/db.js` — Neon/Drizzle database client
- Add `lib/schema.js` — Drizzle table definitions
- Add `lib/auth.js` — NextAuth.js configuration
- Add `lib/articleId.js` — canonical stable article ID computation and validation
- Add `scripts/retry-feedback-email.js` — operator retry worker for failed/pending feedback email delivery
- Add `app/api/auth/[...nextauth]/route.js` — NextAuth.js catch-all route
- Add `app/api/feedback/route.js` — POST feedback submission (persists first, then attempts email)
- Add `app/api/user/register/route.js` — POST user registration
- Add `app/api/user/streak/route.js` — POST streak update (qualifying login only)
- Add `app/api/user/saved/route.js` — GET/POST/DELETE saved articles
- Add `app/api/user/profile/route.js` — GET user profile data
- Add `components/AuthModal.js` — login/register modal
- Add `components/ProfilePanel.js` — user profile slide-in panel
- Add `components/StreakPopup.js` — post-login streak notification
- Add `components/FeedbackModal.js` — feedback submission modal
- Add `components/ShareButton.js` — reusable share button (category + whole-paper variants)
- Modify `app/layout.js` — add `SessionProvider`
- Modify `app/page.js` — integrate auth, share, streak, feedback, async hash scrolling
- Modify `components/Header.js` — auth nav buttons, whole-paper share, feedback button
- Modify `components/Footer.js` — feedback link and auth entry point (Approved Decision F)
- Modify `components/CategorySection.js` — category share button
- Modify `components/NewsCard.js` — save/unsave button
- Modify `app/api/news/route.js` — attach server-computed `stableId` to each article before returning (one import + one mapping line; no changes to news fetching, RSS, translation, TTS, or summarization logic)
- Modify `app/globals.css` — new feature styles appended
- Modify `next.config.mjs` — no image changes needed; may need to add `serverExternalPackages` for Drizzle or `@neondatabase/serverless`
- Modify `package.json` — add new dependencies

### Untouched
- `lib/rss.js`, `lib/categorize.js`, `lib/summarize.js`, `lib/translate.js`, `lib/fetchNews.js`, `lib/speaker.js`, `lib/languages.js`, `lib/constants.js`, `lib/translations.js`
- `app/api/translate/route.js`, `app/api/summarize/route.js`, `app/api/tts/route.js`
- `components/ArticleReaderModal.js`, `components/CategoryNav.js`, `components/DateSwitcher.js`, `components/NewsTicker.js`, `components/LoadingState.js`, `components/ErrorState.js`, `components/StateSelector.js`, `components/LanguageSelector.js`
- All existing CSS rules in `globals.css`
- `README.md` (outside scope; has noted conflict markers but fixing them is not required)
- `public/` assets
- `jsconfig.json`, `LICENSE`, `.gitignore`

---

## 5. Approved Provider, Authentication, and Database Architecture

> **Status: Approved by User (2026-10-13).** All core product and provider architecture decisions (A through H) have been explicitly reviewed and approved by the project owner.

### Authentication: NextAuth.js (Auth.js v5)

- Use `next-auth` v5 (Auth.js). The App Router integration is native.
- Use **Credentials provider** for email + password.
- Passwords hashed with **bcryptjs** (pure JS, no native deps needed).
- Sessions stored as **JWT** (stateless; no session table required).
- JWT is HttpOnly, Secure, SameSite=Lax cookie managed by NextAuth.
- Session validity: 30 days (rolling). Configurable.

**Why not OAuth/social login?**  
The requirement is "proper account-based authentication." OAuth is not required and adds external dependencies. Credentials-based auth meets the spec. OAuth can be added later.

### Database: Neon (Serverless PostgreSQL)

- Neon provides a PostgreSQL-compatible serverless database.
- Free tier: 512 MB storage, 10 GB transfer/month, 1 project, unlimited databases.
- Serverless driver `@neondatabase/serverless` is edge/Vercel-compatible.
- No always-on compute cost.
- Branching support for staging environments.
- **Pricing verified from Neon docs (neon.tech/pricing):** Free tier is permanent (not a trial). As of documentation review date 2026-10-13: Free = 512 MB, Shared compute, Launch plan starts at \$19/month for more storage.

### ORM: Drizzle ORM

- Lightweight; zero codegen required; works directly with SQL.
- `drizzle-orm` + `drizzle-kit` for migrations.
- Works with `@neondatabase/serverless`.

### Feedback: Resend

- Free tier: 3,000 emails/month, 1 domain.
- `resend` npm package; straightforward integration.
- Feedback records are durably persisted in the `feedback` database table first before email dispatch.
- Feedback notification emails sent to owner's email address via Resend.
- Delivery status (`pending`, `sent`, `failed`) and retry metadata tracked in PostgreSQL. Failed deliveries recovered via retry script (`scripts/retry-feedback-email.js`).
- **Pricing verified from resend.com/pricing (2026-10-13):** Free = 3,000 emails/month, 100/day. Pro starts at \$20/month for 50,000 emails. Free tier is sufficient for personal-project feedback volumes.

### Spam protection

- Server-side: rate-limit feedback by IP (max 3 submissions per IP per hour, tracked in the PostgreSQL `feedback_rate_limit` table to guarantee consistent enforcement across Vercel serverless function instances).
- Content-hash deduplication: reject identical submissions from same IP within 10 minutes.
- Max message length: 2000 characters.
- No CAPTCHA (minimizes personal-data collection per requirement).

### Dependencies to Add

```
npm install next-auth@beta
npm install @neondatabase/serverless
npm install drizzle-orm
npm install drizzle-kit --save-dev
npm install bcryptjs
npm install resend
```

> **Note:** `next-auth@beta` refers to Auth.js v5 which supports Next.js App Router natively. Verify the current stable beta tag at time of implementation: `npm show next-auth dist-tags`.

---

## 6. Account Setup, Environment Variables, Pricing, and Deployment Configuration

### Neon Setup

1. Create account at https://neon.tech
2. Create a new project: "mnd-production"
3. Create a database: "mnd"
4. Copy the **connection string** (pooled, for serverless): `postgresql://...`
5. For local dev, also copy the **direct connection string** (for migrations)

### Resend Setup

1. Create account at https://resend.com
2. Add and verify your domain, or use the sandbox domain for testing
3. Create an API key with "Send" permissions
4. Note the verified sender email address

### NextAuth Setup

1. Generate a secret: `openssl rand -base64 32` (or use Node: `require('crypto').randomBytes(32).toString('base64')`)

### Environment Variables

Create `.env.local` (local development) and add the same to Vercel Dashboard → Project Settings → Environment Variables:

```
# Existing (unchanged)
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-1.5-flash
BHASHINI_API_KEY=...
BHASHINI_API_URL=...
BHASHINI_USER_ID=...

# NEW: Neon Database
DATABASE_URL=postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/mnd?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/mnd?sslmode=require&endpoint=ep-xxx

# NEW: NextAuth
NEXTAUTH_SECRET=<generated-secret>
NEXTAUTH_URL=http://localhost:3000  # Local only; Vercel auto-detects VERCEL_URL

# NEW: Resend
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=no-reply@yourdomain.com
FEEDBACK_TO_EMAIL=owner@yourdomain.com
```

**NEXTAUTH_URL note:** On Vercel, NextAuth v5 reads `NEXTAUTH_URL` or auto-uses `VERCEL_URL`. Set `NEXTAUTH_URL` explicitly in Vercel env vars to the production domain (e.g., `https://multilingual-news-digest.vercel.app`).

### Drizzle Configuration

Create `drizzle.config.js` at project root:

```js
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  schema: './lib/schema.js',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED,
  },
});
```

Add scripts to `package.json`:
```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:studio": "drizzle-kit studio"
```

### Pricing Summary

| Service | Free Tier | Paid Starts At |
|---------|-----------|----------------|
| Neon | 512 MB storage, 10 GB transfer | \$19/month (Launch) |
| Resend | 3,000 emails/month | \$20/month (Pro, 50K) |
| NextAuth | Open source, free | — |
| Drizzle | Open source, free | — |
| Vercel | Hobby tier (existing) | \$20/month (Pro) |

For a personal project with low traffic, all services remain within free tier indefinitely.

---

## 7. Feedback Implementation Design

### User Flow

1. User clicks "Feedback" button (in `Header.js` or `Footer.js`)
2. `FeedbackModal` opens as a dialog
3. User fills in: optional name (default: "Anonymous"), feedback message (required, 10–2000 chars), optional category dropdown (General / Bug / Suggestion / Other)
4. User clicks "Send Feedback"
5. Client shows loading spinner; button disabled
6. Server validates, rate-limits, persists the record in DB (with `delivery_status = 'pending'`), then attempts to send email via Resend and updates the record with the delivery result
7. Client shows success state when the record has been durably stored. If email delivery also succeeded, no additional messaging is needed. If email delivery failed but persistence succeeded, the client shows a qualified success: "Your feedback was received. Email notification is pending."
8. Client shows an error state only if the database write itself failed (record was not stored)

### Server-side Validation

```
POST /api/feedback
Body: { name?, message, category? }

Validation:
- message: required, string, trim, min 10 chars, max 2000 chars
- name: optional, string, trim, max 100 chars, default "Anonymous"
- category: optional, enum ["general", "bug", "suggestion", "other"]
- If validation fails: 400 with field-specific error
- Rate limit: max 3 per IP per hour (tracked in DB: `feedback_rate_limit` table)
- Content dedup: hash(ip + message); reject identical within 10 min (return 429 with "Duplicate submission")
```

### Email Content

```
Subject: [MND Feedback] {category} — {first 60 chars of message}
From: no-reply@yourdomain.com
To: owner@yourdomain.com
Reply-To: (not set — minimize data collection)

Body:
Category: {category}
Name: {name}
Submitted: {ISO timestamp}
IP (hashed): {sha256(ip)}

---
{message}
```

> IP is hashed before logging/emailing. Full IP is never stored.

### Database Record (required — persistence before delivery)

The database write is the **primary success criterion**. Email delivery is best-effort and tracked as a separate field. The server inserts the record first, then updates delivery status after the Resend call completes.

**Initial insert (before attempting email):**
```sql
INSERT INTO feedback (
  id, category, name_provided, message, ip_hash, content_hash,
  email_sent, delivery_status, delivery_attempted_at, claim_started_at,
  resend_message_id, delivery_error, retry_count,
  created_at
) VALUES (
  gen_random_uuid(), $1, $2, $3, $4, $5,
  false, 'pending', NULL, NULL,
  NULL, NULL, 0,
  now()
)
RETURNING id;
```

**Update after successful Resend call:**
```sql
UPDATE feedback
SET email_sent = true,
    delivery_status = 'sent',
    delivery_attempted_at = now(),
    claim_started_at = NULL,
    resend_message_id = $resendMessageId
WHERE id = $feedbackId;
```

**Update after failed Resend call:**
```sql
UPDATE feedback
SET email_sent = false,
    delivery_status = 'failed',
    delivery_attempted_at = now(),
    claim_started_at = NULL,
    delivery_error = $errorMessage
WHERE id = $feedbackId;
```

### States to Implement in FeedbackModal

- **Idle:** Form with name, category, message fields. Submit button enabled.
- **Loading:** Submit button shows spinner, disabled. Fields non-interactive.
- **Success (email delivered):** Form hidden. "Thank you! Your feedback has been received." Close button.
- **Success (persistence only — email pending):** Form hidden. "Your feedback was received. We'll send ourselves an email notification shortly." Close button. This state occurs when the DB write succeeded but Resend returned an error. The record is durably stored and will be retried by the retry script (see §7 Retry Strategy).
- **Error (DB write failed):** Form remains. "Failed to save your feedback. Please try again." The submission was not stored and the user should retry.
- **Specific validation errors:** "Message too short", "Message too long", "Too many submissions — please wait", "Duplicate submission detected."

> The client distinguishes the two success states via the server response. The server returns `{ "success": true, "emailDelivered": true }` when email was sent, and `{ "success": true, "emailDelivered": false }` when the record was stored but email delivery failed. The client must never display an error state for a successfully persisted record.

### Spam Mitigation

- Rate limit: 3 submissions per IP per hour (stored in `feedback_rate_limit` table: columns `ip_hash`, `count`, `window_start`)
- Content dedup: 10-minute window
- Server-side only — client-side checks are UX hints, not enforcement
- No CAPTCHA (per requirement to minimize personal-data collection)

### Retry Strategy for Failed Email Delivery

Feedback records with `delivery_status = 'pending'`, `delivery_status = 'failed'`, or stale `delivery_status = 'retrying'` (where retry worker crashed) and fewer than `MAX_RETRY_ATTEMPTS` (default: 5) retries must be retried by an operator-run script.

**Retry script location:** `scripts/retry-feedback-email.js`

**Stale-claim timeout:** 10 minutes (`interval '10 minutes'`). When a worker begins processing a record, it records `claim_started_at = now()`. If the worker crashes, loses connectivity, or hangs, the claim expires after 10 minutes and the record becomes eligible to be reclaimed by another worker.

**Candidate Selection & Retry Eligibility Query:**
To process eligible records while respecting backoff and retry limits, the script selects candidate rows using the following criteria:
1. `retry_count < 5` (avoids unbounded retries)
2. Status is `pending`, `failed`, or an expired claim (`retrying` with `claim_started_at < now() - interval '10 minutes'`)
3. Backoff duration has elapsed, OR the record has never been attempted (`delivery_attempted_at IS NULL`)

```sql
SELECT id, retry_count, delivery_status, delivery_attempted_at, claim_started_at
FROM feedback
WHERE retry_count < 5
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
```

**Atomic Claim / Reclaim Operation:**
Before attempting email delivery via Resend, the script must atomically claim the record in a single SQL statement that sets `delivery_status = 'retrying'` and records `claim_started_at = now()`:

```sql
UPDATE feedback
SET delivery_status = 'retrying',
    claim_started_at = now()
WHERE id = $id
  AND retry_count < 5
  AND (
    delivery_status IN ('pending', 'failed')
    OR (delivery_status = 'retrying' AND claim_started_at < now() - interval '10 minutes')
  )
  AND (
    delivery_attempted_at IS NULL
    OR delivery_attempted_at < now() - (interval '1 minute' * power(2, retry_count))
  );
```

- If this statement returns `0` affected rows, another concurrent worker already claimed the row or its state changed — the worker skips it immediately.
- If it returns `1` affected row, this worker holds an exclusive 10-minute claim on the row and proceeds to invoke Resend.

**Delivery Result Updates:**
- **On Resend success:**
  ```sql
  UPDATE feedback
  SET email_sent = true,
      delivery_status = 'sent',
      resend_message_id = $resendMessageId,
      delivery_attempted_at = now(),
      claim_started_at = NULL
  WHERE id = $id;
  ```
- **On Resend failure:**
  ```sql
  UPDATE feedback
  SET email_sent = false,
      delivery_status = CASE WHEN retry_count + 1 >= 5 THEN 'permanently_failed' ELSE 'failed' END,
      retry_count = retry_count + 1,
      delivery_attempted_at = now(),
      delivery_error = $errorMessage,
      claim_started_at = NULL
  WHERE id = $id;
  ```

**Concurrency, Worker Resumption, and Delivery Guarantees:**
- **Crash Recovery & Stale Claims:** If Worker A crashes after claiming a row, the row remains in `'retrying'` until `claim_started_at` exceeds 10 minutes. At that point, Worker B atomically reclaims it.
- **Worker Resumption after Timeout:** If Worker A hangs for >10 minutes and then resumes execution after Worker B has already reclaimed the record:
  - If Worker B has already completed delivery and set `delivery_status = 'sent'`, Worker A's final update will not revert `'sent'` if guarded by `WHERE delivery_status = 'retrying'`.
  - If both workers dispatch an email to Resend before either updates the database, the recipient owner may receive duplicate email notifications.
- **Ambiguous Outcomes on Network/Process Crash:** If a worker crashes *after* Resend accepts the email payload but *before* PostgreSQL commits the status update, the row will eventually be reclaimed and re-sent.
- **At-Least-Once Delivery Semantics:** The system provides **at-least-once delivery**, never claiming strictly exactly-once delivery across distributed external APIs. Email notification templates should be idempotent (displaying feedback ID, submission timestamp, and sender details), ensuring duplicate delivery in rare crash scenarios causes no data corruption.

**Operational use:**
- Run manually: `node scripts/retry-feedback-email.js`
- For automated scheduling, a cron job or Vercel Cron (if available on the project's plan) can invoke the script. The schedule recommendation is every 15 minutes for the first hour, then hourly.
- The script reads `DATABASE_URL` and `RESEND_API_KEY` from environment variables. It must not be committed with hardcoded secrets.

**Test coverage:**
- Unit test: `scripts/retry-feedback-email.test.js` — mock Resend and DB; verify selection of `delivery_attempted_at IS NULL` rows, selection of elapsed-backoff rows, exclusion of unelapsed-backoff rows, reclamation of stale claims (>10 min), skipping of active claims (<=10 min), retry count increments, and transition to `'permanently_failed'` at limit.
- Manual test: insert a row with `delivery_status = 'failed'` and an elapsed backoff date; run script; verify row transitions to `'sent'`.

**`retry_count` and `claim_started_at` columns:** Tracked in the `feedback` table schema (see §14). Default `retry_count = 0`, `claim_started_at = NULL`.

---

## 8. Category-Specific Newspaper-Sharing Design

### Navigation Architecture Finding

**Verified:** The site uses a **single route** (`/`). Category state is managed client-side via `activeCategory` React state in `app/page.js`. There are no URL paths per category.

**Solution:** Use **URL hash fragments** matching the existing `id` attribute on each `<section>`. Each `CategorySection` already renders `id="category-{categoryId}"`. A URL like `https://site.com/#category-politics` is stable and will scroll-anchor to the section on load.

> **Why hash, not query parameter?**  
> The site is a `'use client'` SPA. Query parameters require reading `searchParams` on mount to set `activeCategory`. Hash fragments work with the existing `id` anchors without any state-reading code, and they can be handled client-side with a one-time `useEffect` reading `window.location.hash` on mount to auto-set `activeCategory`. Either approach works; hash is simpler and requires fewer changes to `app/page.js`.

### Implementation: Hash-Based Deep Linking

**Add to `app/page.js`** (two effects — one for hash parsing and synchronization, one for post-load scrolling):

Because news articles load asynchronously, a single mount effect is not sufficient: the category section element may not exist in the DOM until data has loaded and React has rendered the category sections.

**Effect 1 — Parse hash on mount and synchronize on hash changes:**

```js
// On mount and subsequent hashchange events, read hash and set activeCategory
// This immediately activates the correct category tab without waiting for data.
// It does NOT scroll — scroll is handled after data renders (Effect 2).
useEffect(() => {
  const syncCategoryFromHash = () => {
    const hash = window.location.hash; // e.g. "#category-politics"
    if (hash) {
      const match = hash.match(/^#category-(.+)$/);
      if (match) {
        const catId = match[1];
        const valid = CATEGORIES.find(c => c.id === catId);
        if (valid) setActiveCategory(catId);
      }
    }
  };

  syncCategoryFromHash();
  window.addEventListener('hashchange', syncCategoryFromHash);
  return () => window.removeEventListener('hashchange', syncCategoryFromHash);
}, []);
```

**Effect 2 — Scroll to category section after news data has loaded:**

This effect depends on `news` (the loaded articles array) being non-empty. It reads the pending hash from the URL and scrolls the matching section into view **after the data is rendered**. It runs at most once per initial hash by using a ref to track whether the initial scroll has already occurred.

```js
// Scroll to category section once news data is available (handles async load)
const initialHashScrolled = useRef(false);
useEffect(() => {
  if (initialHashScrolled.current) return;           // already scrolled on initial load
  if (!news || news.length === 0) return;            // data not yet available
  const hash = window.location.hash;
  if (!hash) return;
  const match = hash.match(/^#category-(.+)$/);
  if (!match) return;
  const catId = match[1];
  const valid = CATEGORIES.find(c => c.id === catId);
  if (!valid) return;
  const el = document.getElementById(`category-${catId}`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    initialHashScrolled.current = true;
  }
}, [news]);
```

> **Why two effects?** Effect 1 immediately activates the correct category tab and responds to subsequent `hashchange` events so the UI reflects user navigation. Effect 2 waits for articles to render before scrolling, so the section element is guaranteed to exist in the DOM. The `useRef` guard ensures the scroll happens only once on initial navigation, not on every subsequent news refresh.

> **Invalid hashes:** If the hash does not match any `CATEGORIES` entry, both effects silently skip — no error, no scroll, default category shown.

### Category Share Button

**Location:** `CategorySection.js`, inside `.category-header-row`, beside the category title group (right side, within `category-header-line` or after it).

**Behavior:**
1. Click/tap → try `navigator.share({ title, url })` (Web Share API)
2. If Web Share API unavailable or fails → copy URL to clipboard → show "Copied!" toast for 2 seconds
3. URL constructed: `window.location.origin + '/#category-' + category.id`

**Desktop:** Button visible on hover/focus of the section header row (CSS `:focus-within` or group-hover).  
**Touch/mobile:** Button always visible (no hover detection needed; CSS `@media (pointer: coarse)`).

**Accessibility:** `<button type="button" aria-label="Share {categoryLabel} section">` with an SVG share icon.

**Props added to `CategorySection`:**
```js
// No new props needed — category.id is already available
```

### Share Feedback

- After successful copy: a small floating toast `<div role="status" aria-live="polite">Link copied!</div>` appears near the button for 2 seconds.
- After Web Share API success: no additional feedback (the OS share sheet handles it).

---

## 9. Whole-Newspaper Sharing Design

### Location

Inside `Header.js`, in the `masthead-inner` div, added to the right of the `brand` section or within the `header-controls` area.

**Specific placement:** Add a `<button className="masthead-share-btn">` between the brand div and the `header-controls` div, or append it to `header-controls` after the existing controls. The brand div currently has `onClick` for scroll-to-top; the share button should be separate and clearly labeled.

### URL to Share

- Share the entire website: `window.location.origin` (e.g. `https://multilingual-news-digest.vercel.app`)
- **Not** the current hash or path — this must always share the homepage

### Share Content

```js
navigator.share({
  title: 'MND — Multilingual News Digest',
  text: 'Stay updated with the latest Indian news. Sports, politics, technology, education and more — in your language.',
  url: window.location.origin,
})
```

### Fallback

Same as category share: copy `window.location.origin` to clipboard → "Copied!" toast.

### Layout Preservation

- The masthead layout uses flexbox (`masthead-inner`). The share button must be inline, not breaking the row.
- On mobile: button shows icon only. On desktop: icon + "Share" text.
- CSS: `flex-shrink: 0` so the button doesn't collapse.

---

## 10. Authentication and Profile Design

### Registration Flow

1. User clicks "Sign In" in Header → `AuthModal` opens (defaults to login tab)
2. User clicks "Register" tab
3. Fills: email (required), password (required, min 8 chars), confirm password
4. Client validates match; server validates email format, uniqueness, password strength
5. Server hashes password with bcryptjs (rounds: 12), stores in `users` table
6. Server returns success; client automatically signs in

### Login Flow

1. User enters email + password
2. NextAuth `authorize` callback:
   a. Look up user by email
   b. `bcryptjs.compare(password, user.password_hash)`
   c. If valid: return user object → JWT issued
   d. If invalid: return null → NextAuth shows error
3. On successful login: call `/api/user/streak` → server calculates streak update
4. Show `StreakPopup` with result

### Logout Flow

1. User clicks "Sign Out" in Header or ProfilePanel
2. `signOut()` from `next-auth/react` called
3. Session cookie cleared; UI returns to guest state

### Session Persistence

- JWT in HttpOnly cookie, 30-day rolling expiry
- `SessionProvider` wraps `app/layout.js` body
- `useSession()` hook used in client components to read auth state

### Header and Footer UI (Approved Decision F)

- **Header:**
  - Guest state: "Sign In" button in `header-controls` (`onAuthClick` prop)
  - Authenticated state: User avatar/initials button opening `ProfilePanel` (`onProfileClick` prop); "Sign Out" link
- **Footer:**
  - Guest state: "Sign In" link in footer navigation (`onAuthClick` prop)
  - Authenticated state: "My Account" link opening `ProfilePanel` (`onProfileClick` prop)
  - Both states: "Feedback" link opening `FeedbackModal` (`onFeedbackClick` prop)
- **Bookmark Prompt (Approved Decision H):**
  - Clicking bookmark icon in `NewsCard` while unauthenticated opens `AuthModal` prompting login to save articles.
  - Merely reading or viewing articles never prompts for authentication.

### Profile Panel (Approved Decision G)

- Slide-in from right or bottom sheet on mobile (`components/ProfilePanel.js`)
- Sections:
  1. **User info:** Email address (display only), member since date
  2. **Login streak:** Current streak count with flame icon, longest streak
  3. **Saved articles:** List of saved articles with remove buttons
  4. Close button
- States: loading skeleton, populated, error with retry

---

## 11. Server-Authoritative Login-Streak Algorithm

### Qualifying Login Definition

A "qualifying login" occurs when:
- The user successfully authenticates (correct email/password)
- AND the endpoint `POST /api/user/streak` is called once per login (called by client after NextAuth sign-in callback confirms authentication)
- Page navigation, session refreshes, `useSession()` calls, and profile page views do NOT count

### Streak Rules (as specified)

```
Rule 1: First qualifying login → streak = 1
Rule 2: Login on the next calendar day → streak += 1
Rule 3: Multiple logins on same calendar day → no change (idempotent)
Rule 4: One or more calendar days missed → reset streak = 1
Rule 5: Preserve longest_streak across resets
Rule 6: Stored in DB, associated with authenticated account
Rule 7: Show popup after qualifying login explaining result
Rule 8: Opening/reopening popup never increments streak
Rule 9: Concurrent requests must not double-increment
Rule 10: Consistent timezone for calendar day determination (see §12)
Rule 11: Server calculates everything — client provides no dates or counts
Rule 12: Concurrency protection via DB transactions (see §12)
```

### Streak Algorithm Pseudocode

> **Why not SELECT ... FOR UPDATE alone?**  
> `SELECT ... FOR UPDATE` acquires a row-level lock on an *existing* row. If the row does not yet exist (first ever login for this user), there is nothing to lock. Two concurrent first-login requests could both see no row, both proceed to INSERT, and one would fail with a unique-constraint violation — or both could succeed if the constraint is absent. The correct approach is to ensure the row exists atomically before locking it.

**Two-phase approach:**
1. Atomically ensure the row exists using `INSERT ... ON CONFLICT DO NOTHING`.
2. Open a transaction, acquire a `SELECT ... FOR UPDATE` lock on the now-guaranteed row, then compute and apply the update.

```
POST /api/user/streak
  Authenticate: extract userId from JWT (NextAuth session). If no valid session → 401.

  today = currentCalendarDay(timezone = 'Asia/Kolkata')  // see §12

  // Phase 1: Ensure the row exists (handles first-ever login atomically).
  // ON CONFLICT DO NOTHING means concurrent requests are safe:
  // exactly one INSERT succeeds; the others silently skip.
  INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_login_date, today_counted)
  VALUES ($userId, 0, 0, NULL, false)
  ON CONFLICT (user_id) DO NOTHING;

  // Phase 2: Lock the now-existing row and compute the streak update.
  BEGIN TRANSACTION;

  SELECT id, current_streak, longest_streak, last_login_date, today_counted
  FROM user_streaks
  WHERE user_id = $userId
  FOR UPDATE;  -- row always exists after Phase 1; lock is guaranteed

  IF row.today_counted == true AND row.last_login_date == today:
    // Same calendar day, already counted — idempotent
    result = { type: 'same_day', current_streak: row.current_streak, longest_streak: row.longest_streak }
    // No UPDATE needed

  ELSE IF row.last_login_date IS NULL:
    // First qualifying login (row was just seeded with zeros in Phase 1)
    UPDATE user_streaks
    SET current_streak = 1,
        longest_streak = 1,
        last_login_date = today,
        today_counted = true
    WHERE user_id = $userId;
    result = { type: 'first', current_streak: 1, longest_streak: 1 }

  ELSE:
    yesterday = today - 1 day
    IF row.last_login_date == yesterday:
      new_streak = row.current_streak + 1
      new_longest = MAX(new_streak, row.longest_streak)
      reason = 'increment'
    ELSE:
      // Missed one or more days
      new_streak = 1
      new_longest = row.longest_streak  // preserve longest_streak across resets
      reason = 'reset'

    UPDATE user_streaks
    SET current_streak = new_streak,
        longest_streak = new_longest,
        last_login_date = today,
        today_counted = true
    WHERE user_id = $userId;

    result = { type: reason, current_streak: new_streak, longest_streak: new_longest }

  COMMIT;

  RETURN 200 { ...result }
```

### Popup Content

| `result.type` | Popup message |
|--------------|---------------|
| `first` | "Welcome! Your streak has started. 🔥 Day 1!" |
| `same_day` | (No popup shown — same day login is silent) |
| `increment` | "You're on a roll! 🔥 {n}-day streak!" |
| `reset` | "Streak reset. You were away for a while. 🔥 Start fresh: Day 1!" |

---

## 12. Timezone Handling and Concurrency Protection

### Timezone Strategy

**Approved Decision (Decision E — Approved by User):** Use **Asia/Kolkata (India Standard Time, UTC+5:30)** as the canonical timezone for determining calendar days.

**Rationale:** MND is an India-focused news platform. All users are expected to be in India or consuming Indian news. Using IST ensures consistent "today" boundaries regardless of the server's system timezone.

**Implementation:**

```js
function currentCalendarDay() {
  // Returns 'YYYY-MM-DD' in IST regardless of server TZ
  const now = new Date();
  const istFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return istFormatter.format(now); // 'YYYY-MM-DD' format (en-CA locale)
}
```

**Stored in DB as:** `DATE` type (PostgreSQL `DATE` column stores only the date, no time). This naturally prevents timezone ambiguity in the column itself.

### Concurrency Protection

**Mechanism: `INSERT ... ON CONFLICT DO NOTHING` followed by `SELECT ... FOR UPDATE` within a transaction.**

`SELECT ... FOR UPDATE` acquires a row-level exclusive lock on an *existing* row. It cannot lock a row that does not yet exist. If two concurrent requests both arrive for a user's very first login and both issue `SELECT ... FOR UPDATE`, both see no row, both attempt `INSERT`, and the result is a race condition.

**Correct two-phase approach:**

```sql
-- Phase 1 (outside transaction): atomically ensure the row exists.
-- ON CONFLICT DO NOTHING means only one INSERT wins; others are no-ops.
INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_login_date, today_counted)
VALUES ($1, 0, 0, NULL, false)
ON CONFLICT (user_id) DO NOTHING;

-- Phase 2 (inside transaction): lock the guaranteed-existing row, compute, update.
BEGIN;
SELECT id, current_streak, longest_streak, last_login_date, today_counted
  FROM user_streaks WHERE user_id = $1 FOR UPDATE;
-- compute new streak values (see pseudocode in §11)
UPDATE user_streaks SET ... WHERE user_id = $1;
COMMIT;
```

**Why this is correct:**
- Phase 1 is atomic per the `ON CONFLICT` guarantee: exactly one concurrent INSERT succeeds; others silently skip. No duplicate rows.
- After Phase 1 completes, the row is guaranteed to exist for all concurrent requests.
- Phase 2 `FOR UPDATE` then locks the existing row. Concurrent requests for the same user queue behind the lock.
- The second request, after acquiring the lock, sees `today_counted = true` and returns `same_day` without updating. This prevents double-increment from simultaneous requests (e.g., double-click, concurrent tabs).
- The initial seed values (`current_streak = 0`, `last_login_date = NULL`) are sentinel values; the Phase 2 logic detects `last_login_date IS NULL` to identify the first qualifying login and sets streak = 1.

**With Drizzle ORM:**  
Drizzle supports `db.transaction()` and raw SQL fragments via `sql\`...\``. Use `db.execute(sql\`INSERT ... ON CONFLICT DO NOTHING\`)` for Phase 1 outside the transaction, then `db.transaction(async (tx) => { ... })` for Phase 2.

**Serverless Note:**  
Neon's serverless driver supports transactions. Each Vercel invocation gets a fresh connection from the pool. The two-phase approach is safe: Phase 1 executes as a single statement (atomic by definition in PostgreSQL), and Phase 2 runs within a transaction scope within the same invocation.

---

## 13. Saved-News Identity and Persistence Strategy

### Article Identity Problem

**Verified from `lib/rss.js` (line 202):**
```js
id: item.guid || item.link || `${Date.now()}-${Math.random()}`
```

- `item.guid` from publisher RSS feeds (The Hindu, Indian Express, NDTV) is typically stable and unique.
- Google News RSS items also typically provide GUIDs.
- The `link` (canonical URL) is stable and publisher-consistent.
- The fallback `${Date.now()}-${Math.random()}` is **not stable** — it changes every fetch.

**Recommendation:** Use a **stable article identifier** derived from the canonical link URL, normalized:

```js
// lib/articleId.js (new file)
import crypto from 'crypto';

/**
 * Known tracking-only query parameters that are safe to remove.
 * Meaningful article-identifying parameters (e.g. id, articleId, story) are preserved.
 */
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'msclkid', 'ref', 'source', 'mc_cid', 'mc_eid',
]);

/**
 * Returns a 32-character hex stable ID for an article, derived from its canonical URL.
 * Returns null if the URL is invalid, relative, malformed, empty, or uses an unsupported scheme.
 *
 * Validation & Normalization policy:
 *   - Extract raw URL candidate from article.guid (if valid HTTP/HTTPS URL) or article.link.
 *   - If raw candidate is missing, non-string, empty, or whitespace-only, return null.
 *   - Strictly validate that candidate is an absolute URL using `new URL(raw.trim())`.
 *   - Require protocol to be strictly 'http:' or 'https:'. Reject relative URLs, malformed URLs,
 *     and unsupported schemes (e.g. javascript:, data:, ftp:, file:) by returning null.
 *   - Invalid or unparseable URLs NEVER receive a stable ID and NEVER fall back to hashing raw strings.
 *   - Normalize scheme and hostname to lowercase (RFC 3986: host is case-insensitive).
 *   - Preserve the URL path as-is (paths are case-sensitive on most servers).
 *   - Remove URL fragment (#...) — fragments are client-side only, not part of resource identity.
 *   - Remove only the explicitly listed tracking parameters from the query string.
 *   - Preserve and sort all other query parameters that may identify distinct articles.
 */
export function stableArticleId(article) {
  if (!article || typeof article !== 'object') return null;

  const raw = (article.guid && isLikelyStableGuid(article.guid))
    ? article.guid
    : article.link;
  if (!raw || typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    // Malformed or relative URL: reject immediately. Never fall back to raw strings.
    return null;
  }

  // Reject unsupported protocols (e.g., javascript:, data:, ftp:, file:)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }

  // Lowercase scheme and hostname only (paths are case-sensitive)
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();

  // Remove fragment
  url.hash = '';

  // Remove only known tracking params; preserve all others
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }

  // Sort remaining params for deterministic ordering
  url.searchParams.sort();

  const normalized = url.toString();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}

function isLikelyStableGuid(guid) {
  if (!guid || typeof guid !== 'string') return false;
  const trimmed = guid.trim();
  // Accept GUIDs that look like valid HTTP/HTTPS URLs; reject random fallbacks
  return (trimmed.startsWith('http://') || trimmed.startsWith('https://')) &&
    !trimmed.includes('Date.now');
}
```

This `stableArticleId` is computed server-side and attached to each article before returning from `/api/news`. If an article's URL is invalid or malformed, `stableArticleId` returns `null`; the news API sets `art.stableId = null` safely without breaking or crashing the news response. Articles with `stableId: null` remain readable in the feed but cannot be bookmarked until a valid canonical URL is provided. The client uses this ID for save operations.

### What to Store

When a user saves an article, store a **snapshot** of the article data so it remains displayable even if the RSS item disappears:

```
saved_articles table:
  id (uuid, PK)
  user_id (uuid, FK → users.id)
  article_stable_id (varchar(32)) -- sha256 of normalized link
  article_link (text)             -- canonical URL
  article_title (text)            -- title at time of saving
  article_source (text)           -- source publication
  article_image_url (text)        -- nullable
  article_summary (text)          -- summary at time of saving
  article_category (varchar(32))  -- category id
  article_pub_date (timestamptz)  -- publication date
  saved_at (timestamptz DEFAULT now())
```

### Save/Unsave API

```
POST /api/user/saved         -- save article
  Auth: required
  Body: { stableId, link, title, source, imageUrl?, summary, category, pubDate }
  Returns: { saved: true, savedAt: ISO }

DELETE /api/user/saved/{stableId}  -- unsave article
  Auth: required
  Returns: { deleted: true }

GET /api/user/saved           -- list saved articles
  Auth: required
  Returns: { articles: [...], count: N }
```

**Ownership enforcement:** All queries include `WHERE user_id = $sessionUserId`. Users cannot access or delete other users' saved articles.

### Save Button in NewsCard

- Add a bookmark/save icon button to `NewsCard.js` footer, beside the existing audio and read-more buttons
- State: saved (filled bookmark) / unsaved (outline bookmark)
- Requires auth: if unauthenticated user clicks save → prompt "Sign in to save articles" (open AuthModal)
- Optimistic UI: toggle saved state immediately; revert on API error with error toast
- The save operation sends the article snapshot data to the API

### Saved Articles in Profile

- ProfilePanel shows saved articles in a scrollable list
- Each item shows: thumbnail (if available), title, source, save date, remove button
- Remove button calls `DELETE /api/user/saved/{stableId}` and removes from list
- Empty state: "No saved articles yet. Bookmark articles to read them later."
- Error state: "Failed to load saved articles." with retry button

---

## 14. Database Schema, Constraints, Indexes, and Migrations

### Schema (`lib/schema.js` — Drizzle ORM)

```js
import { pgTable, uuid, varchar, text, boolean, timestamp, date, integer, unique, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password_hash: varchar('password_hash', { length: 255 }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const user_streaks = pgTable('user_streaks', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  current_streak: integer('current_streak').notNull().default(0),
  longest_streak: integer('longest_streak').notNull().default(0),
  last_login_date: date('last_login_date'),  // DATE in IST, no time component
  today_counted: boolean('today_counted').notNull().default(false),
}, (table) => ({
  userIdIdx: index('user_streaks_user_id_idx').on(table.user_id),
}));

export const saved_articles = pgTable('saved_articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  article_stable_id: varchar('article_stable_id', { length: 32 }).notNull(),
  article_link: text('article_link').notNull(),
  article_title: text('article_title').notNull(),
  article_source: varchar('article_source', { length: 255 }),
  article_image_url: text('article_image_url'),
  article_summary: text('article_summary'),
  article_category: varchar('article_category', { length: 32 }),
  article_pub_date: timestamp('article_pub_date', { withTimezone: true }),
  saved_at: timestamp('saved_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userArticleUnique: unique('saved_articles_user_article_unique').on(table.user_id, table.article_stable_id),
  userIdIdx: index('saved_articles_user_id_idx').on(table.user_id),
  stableIdIdx: index('saved_articles_stable_id_idx').on(table.article_stable_id),
}));

export const feedback = pgTable('feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  category: varchar('category', { length: 50 }),
  name_provided: varchar('name_provided', { length: 100 }),
  message: text('message').notNull(),
  ip_hash: varchar('ip_hash', { length: 64 }),
  content_hash: varchar('content_hash', { length: 64 }),
  // Delivery tracking fields
  email_sent: boolean('email_sent').notNull().default(false),
  delivery_status: varchar('delivery_status', { length: 20 }).notNull().default('pending'),
  // Valid values: 'pending' | 'retrying' | 'sent' | 'failed' | 'permanently_failed'
  resend_message_id: varchar('resend_message_id', { length: 255 }),
  delivery_error: text('delivery_error'),           // most recent error message, if any
  delivery_attempted_at: timestamp('delivery_attempted_at', { withTimezone: true }),
  claim_started_at: timestamp('claim_started_at', { withTimezone: true }), // worker claim start time for stale-claim recovery
  retry_count: integer('retry_count').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  ipHashIdx: index('feedback_ip_hash_idx').on(table.ip_hash),
  contentHashIdx: index('feedback_content_hash_idx').on(table.content_hash),
  deliveryStatusIdx: index('feedback_delivery_status_idx').on(table.delivery_status),
  claimStartedAtIdx: index('feedback_claim_started_at_idx').on(table.claim_started_at),
  // Indexes support efficient retry-script queries and stale-claim recovery
}));

export const feedback_rate_limit = pgTable('feedback_rate_limit', {
  id: uuid('id').primaryKey().defaultRandom(),
  ip_hash: varchar('ip_hash', { length: 64 }).notNull().unique(),
  submission_count: integer('submission_count').notNull().default(1),
  window_start: timestamp('window_start', { withTimezone: true }).defaultNow().notNull(),
});

export const registration_rate_limit = pgTable('registration_rate_limit', {
  id: uuid('id').primaryKey().defaultRandom(),
  ip_hash: varchar('ip_hash', { length: 64 }).notNull().unique(),
  registration_count: integer('registration_count').notNull().default(1),
  window_start: timestamp('window_start', { withTimezone: true }).defaultNow().notNull(),
});
```

### Constraints Summary

| Table | Key constraints |
|-------|----------------|
| `users` | `email` UNIQUE NOT NULL; `password_hash` NOT NULL |
| `user_streaks` | `user_id` UNIQUE (one row per user), FK cascade delete |
| `saved_articles` | `(user_id, article_stable_id)` UNIQUE (prevent duplicate saves) |
| `feedback` | No unique on message (allow resubmission after window); `delivery_status` has a DB-level default of `'pending'`; `email_sent` defaults to `false` |
| `registration_rate_limit` | `ip_hash` UNIQUE NOT NULL (Approved Decision B: 5 registrations/hour per IP) |

### Indexes Summary

- `user_streaks.user_id` — lookup by user
- `saved_articles.user_id` — list user's saved articles
- `saved_articles.article_stable_id` — check if article saved (with user_id)
- `feedback.ip_hash` — rate limit lookups
- `feedback.content_hash` — dedup lookups
- `feedback.delivery_status` — retry-script queries (select pending/failed rows)
- `feedback.claim_started_at` — retry-script queries (identify stale retry claims older than 10 minutes)
- `registration_rate_limit.ip_hash` — registration rate limit lookups (Approved Decision B)

### Migrations

Run locally:
```
npm run db:generate   # generates SQL migration files in drizzle/migrations/
npm run db:migrate    # applies migrations to DATABASE_URL_UNPOOLED
```

On Vercel production:
- Run migrations manually before deploying (use `db:migrate` against production `DATABASE_URL_UNPOOLED`)
- Or add a `postinstall` script: `"postinstall": "npm run db:migrate"` (caution: runs on every Vercel build)
- **Recommended:** Run migrations as a separate step before promotion to production

---

## 15. API Endpoint Specifications

### Authentication Endpoints (NextAuth)

NextAuth v5 registers its own routes automatically at `app/api/auth/[...nextauth]/route.js`.

**Existing NextAuth routes (auto-handled):**
- `POST /api/auth/signin` — sign in with credentials
- `POST /api/auth/signout` — sign out
- `GET /api/auth/session` — get current session
- `GET /api/auth/csrf` — CSRF token

---

### `POST /api/user/register`

**Purpose:** Create new user account.

**Auth required:** No (public endpoint).

**Rate limiting (Approved Decision B):**
1. Compute `ipHash = sha256(request.ip || x-forwarded-for[0])`
2. Check `registration_rate_limit` table for this `ipHash`
3. If `registration_count >= 5` within the last hour, return `429` `{ "success": false, "error": "Too many registrations from this IP address. Maximum 5 per hour." }`
4. Otherwise, increment count or insert row with current timestamp (resetting window if older than 1 hour).

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "minimum8chars"
}
```

**Server validation:**
- email: valid format (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`), lowercase, max 255 chars
- password: min 8 chars, max 128 chars
- Check no existing user with same email

**On success:** `201` `{ success: true, message: "Account created." }`

**On error:**
- `400` — validation failure: `{ success: false, error: "Invalid email format" }` or `{ success: false, error: "Password must be at least 8 characters" }`
- `409` — email taken: `{ success: false, error: "An account with this email already exists." }`
- `429` — rate limit exceeded: `{ success: false, error: "Too many registrations from this IP address. Maximum 5 per hour." }`
- `500` — database error

**Server action:** Hash password with bcryptjs (rounds=12), INSERT into `users`, return success. Do NOT auto-login (client should call NextAuth sign-in afterward).

---

### `POST /api/user/streak`

**Purpose:** Record a qualifying login and update streak. Called once per login event.

**Auth required:** Yes (JWT session cookie via NextAuth).

**Request body:** `{}` (empty — all data server-derived)

**Authorization:** Extract `session.user.id` from NextAuth. Reject if no valid session.

**Response:**
```json
{
  "type": "first" | "increment" | "reset" | "same_day",
  "current_streak": 5,
  "longest_streak": 12,
  "today": "2026-10-13"
}
```

**Server logic:** Execute streak algorithm from §11 using the two-phase concurrency-safe design: atomic `INSERT ... ON CONFLICT DO NOTHING` seed followed by a transaction with `SELECT ... FOR UPDATE` lock, ensuring safe handling for both initial first logins and subsequent concurrent logins.

**HTTP status:** `200` always (even `same_day` returns 200 — it's not an error).

---

### `GET /api/user/profile`

**Purpose:** Get user profile data (streak + saved article count).

**Auth required:** Yes.

**Response:**
```json
{
  "email": "user@example.com",
  "createdAt": "2026-01-01T00:00:00Z",
  "currentStreak": 5,
  "longestStreak": 12,
  "lastLoginDate": "2026-10-13",
  "savedCount": 7
}
```

---

### `GET /api/user/saved`

**Purpose:** List saved articles for authenticated user.

**Auth required:** Yes.

**Query params:** `?page=1&limit=20` (default: page=1, limit=20)

**Response:**
```json
{
  "articles": [
    {
      "stableId": "abc123...",
      "link": "https://...",
      "title": "...",
      "source": "The Hindu",
      "imageUrl": "https://...",
      "summary": "...",
      "category": "politics",
      "pubDate": "2026-10-13T10:00:00Z",
      "savedAt": "2026-10-13T12:00:00Z"
    }
  ],
  "total": 7,
  "page": 1,
  "limit": 20
}
```

---

### `POST /api/user/saved`

**Purpose:** Save an article.

**Auth required:** Yes.

**Request body:**
```json
{
  "stableId": "abc123...",
  "link": "https://...",
  "title": "Article title",
  "source": "The Hindu",
  "imageUrl": "https://...",
  "summary": "...",
  "category": "politics",
  "pubDate": "2026-10-13T10:00:00Z"
}
```

**Server validation:**
- All fields validated; `stableId`, `link`, `title` required
- `link` must be a valid, parseable absolute URL with protocol `http:` or `https:`. Server validates with `try { const u = new URL(link.trim()); if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(); } catch { return 400; }`. Reject malformed, relative, unsupported scheme, or empty/whitespace URLs with `400` `{ "success": false, "error": "Invalid article URL format." }`.
- `category` must be one of the 6 valid category IDs
- Enforce ownership: `user_id` taken from session, never from request body
- **Stable ID verification (required):** The server independently recomputes `expectedId = stableArticleId({ link })` using the canonical `lib/articleId.js` implementation and compares it to the client-provided `stableId`. If `expectedId` is `null` or does not match `stableId`, reject with `400` `{ "success": false, "error": "Invalid article identifier." }`. This prevents clients from submitting tampered or fabricated stable IDs, or saving articles with invalid URLs.

**On success:** `201` `{ "success": true, "savedAt": "..." }`
**If already saved:** `200` `{ "success": true, "alreadySaved": true }` (idempotent — use `ON CONFLICT DO NOTHING`)
**If max saved articles limit reached (Approved Decision D — 500 articles per account):** Count existing saved articles for `user_id`; if count >= 500, return `400` `{ "success": false, "error": "Maximum limit of 500 saved articles reached. Remove older saved articles to bookmark new ones." }`.

---

### `DELETE /api/user/saved/[stableId]`

**Purpose:** Remove a saved article.

**Auth required:** Yes.

**Path param:** `stableId` — 32-char hex string

**Server:** `DELETE FROM saved_articles WHERE user_id = $sessionUserId AND article_stable_id = $stableId`

**On success:** `200` `{ "success": true }`
**If not found:** `404` `{ "success": false, "error": "Article not found in saved list." }`

---

### `POST /api/feedback`

**Purpose:** Submit user feedback.

**Auth required:** No (public endpoint — allow anonymous feedback).

**Request body:**
```json
{
  "name": "Optional Name",
  "message": "Feedback message text",
  "category": "suggestion"
}
```

**Server validation:**
- `message`: required, string, trim, 10–2000 chars
- `name`: optional, trim, max 100 chars, default "Anonymous"
- `category`: optional, enum `["general", "bug", "suggestion", "other"]`, default "general"

**Rate limiting:**
1. Compute `ipHash = sha256(request.ip || x-forwarded-for[0])`
2. Look up `feedback_rate_limit` for this `ipHash`
3. If `submission_count >= 3` and `window_start` is within last hour → `429` with `{ error: "Too many submissions. Please try again later." }`
4. Otherwise: increment count or create row; reset window if older than 1 hour

**Dedup:**
1. Compute `contentHash = sha256(ipHash + message.trim())`
2. Check `feedback` table for `content_hash = $contentHash` submitted in last 10 minutes → `429` with `{ error: "Duplicate submission detected." }`

**On success (ordered steps):**
1. INSERT feedback record into `feedback` table with `delivery_status = 'pending'`, `email_sent = false`, `claim_started_at = NULL`. Capture the returned `id`.
2. If the INSERT fails (DB error): return `500` `{ "success": false, "error": "Failed to save your feedback. Please try again." }`. Do NOT proceed to email.
3. Attempt to send email via Resend.
4. If Resend succeeds: UPDATE the feedback row: `email_sent = true`, `delivery_status = 'sent'`, `resend_message_id = <id>`, `delivery_attempted_at = now()`, `claim_started_at = NULL`. Return `200` `{ "success": true, "emailDelivered": true, "message": "Thank you for your feedback!" }`.
5. If Resend fails: UPDATE the feedback row: `email_sent = false`, `delivery_status = 'failed'`, `delivery_attempted_at = now()`, `claim_started_at = NULL`, `delivery_error = <error message>`. Return `200` `{ "success": true, "emailDelivered": false, "message": "Your feedback was received. Email notification is pending." }`. Do NOT return an error code — the record was durably stored and will be retried.

**On DB write failure only:**  
Return `500` `{ "success": false, "error": "Failed to save your feedback. Please try again." }`. This is the only case where the user should be encouraged to resubmit.

---

## 16. File-by-File Implementation Plan

### New Files to Create

#### `lib/db.js`
**Role:** Initialize Neon database client with Drizzle ORM.
```js
// Export db instance using @neondatabase/serverless + drizzle-orm
// Import in all API routes needing DB access
```

#### `lib/schema.js`
**Role:** Drizzle table definitions as specified in §14.

#### `lib/auth.js`
**Role:** NextAuth v5 configuration. Exports `{ auth, handlers, signIn, signOut }`. Defines Credentials provider, `authorize` callback that queries DB and validates bcrypt, JWT callbacks that include `user.id` in the token.

#### `lib/articleId.js`
**Role:** `stableArticleId(article)` function — SHA-256 of normalized canonical URL (32-char hex). Validates absolute HTTP/HTTPS URLs; strictly returns `null` for invalid, relative, malformed, or unsupported scheme inputs without fallback hashing.

#### `drizzle.config.js`
**Role:** Drizzle Kit config (see §6).

#### `drizzle/migrations/` (directory)
**Role:** Auto-generated SQL migrations from `drizzle-kit generate`.

#### `app/api/auth/[...nextauth]/route.js`
**Role:** NextAuth App Router catch-all handler. Exports `{ GET, POST }` from `auth.js` handlers.

#### `app/api/user/register/route.js`
**Role:** POST handler for user registration (see §15).

#### `app/api/user/streak/route.js`
**Role:** POST handler for streak update (see §15, algorithm from §11).

#### `app/api/user/profile/route.js`
**Role:** GET handler for profile data (see §15).

#### `app/api/user/saved/route.js`
**Role:** GET (list) and POST (save) handlers (see §15).

#### `app/api/user/saved/[stableId]/route.js`
**Role:** DELETE handler for removing saved article (see §15).

#### `app/api/feedback/route.js`
**Role:** POST handler for feedback (see §7, §15).

#### `scripts/retry-feedback-email.js`
**Role:** Operator-run Node.js script that queries for feedback rows with `delivery_status IN ('pending', 'failed')` or stale `'retrying'` claims (`claim_started_at < now() - interval '10 minutes'`), respecting exponential backoff (and selecting never-attempted `delivery_attempted_at IS NULL` records) and `retry_count < MAX_RETRY_ATTEMPTS`. Atomically claims each record using `UPDATE ... SET delivery_status = 'retrying', claim_started_at = now()`, re-attempts Resend delivery, and updates delivery tracking fields. See §7 Retry Strategy for full specification.

#### `components/AuthModal.js`
**Role:** `'use client'` modal with login/register tabs. Uses `signIn` from `next-auth/react`. Calls `/api/user/register` for registration. After successful login, calls `/api/user/streak` and passes result to parent via callback prop.

#### `components/FeedbackModal.js`
**Role:** `'use client'` modal with feedback form. Posts to `/api/feedback`. Manages idle/loading/success/error states. Never shows success on failure.

#### `components/ProfilePanel.js`
**Role:** `'use client'` slide-in panel showing streak, saved articles, logout. Uses `useSession()`. Fetches from `/api/user/profile` and `/api/user/saved`.

#### `components/StreakPopup.js`
**Role:** `'use client'` temporary notification shown once after qualifying login. Receives `{ type, currentStreak, longestStreak }` props. Displays appropriate message. Auto-dismisses after 5 seconds or on click. Does NOT call any API when shown/dismissed.

#### `components/ShareButton.js`
**Role:** `'use client'` reusable share button. Props: `{ url, title, text?, variant: 'category' | 'masthead' }`. Handles Web Share API + clipboard fallback + toast feedback.

### Existing Files to Modify

#### `package.json`
Add dependencies as listed in §5. Add `db:generate`, `db:migrate`, `db:studio` scripts.

#### `next.config.mjs`
Add if needed:
```js
serverExternalPackages: ['@neondatabase/serverless'],
```
(Depending on Next.js 16 handling of the Neon serverless driver.)

#### `app/layout.js`
- Add `'use client'` directive OR use a separate `providers.js` wrapper
- Wrap body children with `<SessionProvider>` from `next-auth/react`
- Note: `layout.js` currently has `metadata` export which requires it to be a Server Component. Solution: Create `app/providers.js` as a `'use client'` wrapper around `SessionProvider`, and import it in `app/layout.js` without adding `'use client'` to `layout.js` itself.

**Minimal change to `layout.js`:**
```js
// Add import:
import Providers from './providers';
// Wrap body:
<body><Providers>{children}</Providers></body>
```

**New file: `app/providers.js`:**
```js
'use client';
import { SessionProvider } from 'next-auth/react';
export default function Providers({ children }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

#### `app/page.js`
Add:
1. `useEffect` hooks to synchronize category from hash on mount/hashchange and to scroll to category section once async news data is rendered (§8)
2. Import and conditionally render `StreakPopup` (passed streak result as state)
3. Import and render `AuthModal` (controlled by `showAuthModal` state)
4. Import and render `FeedbackModal` (controlled by `showFeedbackModal` state)
5. Pass `onSaveArticle` callback down to `CategorySection` → `NewsCard`
6. Track `savedArticleIds` Set (fetched after auth, refreshed on save/unsave)
7. Pass `savedArticleIds` down to `NewsCard` components

**Risk:** `app/page.js` is already 428 lines and complex. Changes must be surgical. Each new state variable and effect must be clearly justified and minimal.

#### `components/Header.js`
Add:
1. Import `useSession` from `next-auth/react`
2. Auth nav section in `header-controls`:
   - Guest: "Sign In" button (`onAuthClick` prop)
   - Authed: user initials avatar button (`onProfileClick` prop)
3. Whole-newspaper `ShareButton` in masthead (§9)
4. "Feedback" button (`onFeedbackClick` prop)

Props added: `onAuthClick`, `onProfileClick`, `onFeedbackClick`.

#### `components/Footer.js`
Modify:
1. Add "Feedback" button/link (`onFeedbackClick` prop)
2. Add auth entry point link (Approved Decision F): "Sign In" link when guest (`onAuthClick` prop), or "My Account" link when authenticated (`onProfileClick` prop)

Props added: `onAuthClick`, `onProfileClick`, `onFeedbackClick`.

#### `components/CategorySection.js`
Add:
1. Import `ShareButton` 
2. Add `ShareButton` to `category-header-row` (§8)

No new props needed — `category.id` is already available.

#### `components/NewsCard.js`
Add:
1. Bookmark/save button in `news-card-footer`
2. Props: `onSaveArticle`, `isSaved`
3. If `isSaved` is undefined (not logged in or not yet loaded), show outline bookmark
4. Click → if not authed, call `onRequestAuth()` prop; if authed, call `onSaveArticle(article)`

Props added: `onSaveArticle`, `isSaved`, `onRequestAuth`.

#### `app/api/news/route.js`
Modify:
1. Import `stableArticleId` from `lib/articleId.js`
2. In the article response mapping step, attach `stableId`: `art.stableId = stableArticleId(art)`. If an article's URL is invalid or unparseable, `stableArticleId` safely returns `null`; `art.stableId` is set to `null` without throwing or crashing the news response.
3. Do not modify RSS parsing, news fetching, translation, summarization, or TTS logic.

#### `app/globals.css`
Append (do not modify existing rules):
- `.masthead-share-btn` styles
- `.category-share-btn` styles (hover-visible on desktop, always visible on touch)
- `.auth-modal-overlay`, `.auth-modal` styles
- `.feedback-modal-overlay`, `.feedback-modal` styles
- `.profile-panel`, `.profile-panel-overlay` styles
- `.streak-popup` styles
- `.share-toast` styles
- `.bookmark-btn` styles
- `.auth-modal tabs`, form input/button styles
- Appropriate dark/light responsive variants

---

## 17. UI, Responsive Behavior, and Accessibility

### Share Buttons

**Category share button:**
- Desktop (`@media (hover: hover)`): Initially `opacity: 0; pointer-events: none`, visible on `.category-header-row:hover .category-share-btn, .category-header-row:focus-within .category-share-btn`
- Touch (`@media (pointer: coarse)` or `@media (hover: none)`): Always visible (`opacity: 1`)
- `aria-label="Share {categoryLabel} news section"`, `type="button"`
- Icon: share SVG (standard share icon)

**Masthead share button:**
- Always visible
- Mobile: icon only; Desktop: icon + "Share" text
- `aria-label="Share Multilingual News Digest"`, `type="button"`

### Auth Modal

- Full-screen overlay on mobile, centered dialog on desktop (max-width: 420px)
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby="auth-modal-title"`
- Focus trap within modal (Tab/Shift+Tab cycle within modal)
- Escape key closes modal
- Initial focus on first input field

### Feedback Modal

- Same responsive behavior as Auth Modal
- `role="dialog"`, `aria-modal="true"`
- Form fields: name (optional), category (select), message (textarea)
- Character counter for message (e.g. "247/2000")
- Submit button shows spinner during loading
- Error messages associated with fields via `aria-describedby`

### Profile Panel

- Slide-in from right on desktop (`transform: translateX(100%)` → `translateX(0)`)
- Bottom sheet on mobile (`transform: translateY(100%)` → `translateY(0)`)
- Overlay backdrop with `role="presentation"` backdrop click to close
- `role="complementary"` or `role="dialog"` on the panel
- Scrollable content area for saved articles

### Streak Popup

- Fixed position, bottom-right corner (desktop) or bottom-center (mobile)
- `role="status"`, `aria-live="polite"` (for screen readers)
- Auto-dismiss after 5 seconds, or click/tap to dismiss
- Does not block page interaction

### Bookmark Button (NewsCard)

- Position: in `news-card-footer` after the Read/Listen buttons
- Icon: filled bookmark (saved) / outline bookmark (not saved)
- `aria-label="Save article" / "Article saved"`, `type="button"`
- `aria-pressed={isSaved}` for toggle semantics

### Keyboard Navigation

All new interactive elements must be keyboard-accessible:
- Tab order: Share buttons accessible via Tab
- Modals: Focus trapped, Escape closes
- Profile panel: Escape closes
- Streak popup: Space/Enter dismisses

### WCAG Standards

- Minimum contrast ratio 4.5:1 for all new text
- No color-only information
- All interactive elements have visible focus indicators
- All images have alt text or `aria-hidden="true"` for decorative icons

---

## 18. Security and Privacy Considerations

### Authentication Security

- Passwords hashed with bcryptjs, rounds=12 (≈250ms per hash on modern hardware — sufficient for brute-force resistance)
- JWT secret must be at minimum 32 bytes of random entropy (`NEXTAUTH_SECRET`)
- JWT cookie: `HttpOnly`, `Secure` (HTTPS only), `SameSite=Lax`
- CSRF: NextAuth v5 handles CSRF token automatically for form-based sign-in
- Password minimum length: 8 chars (enforced both client and server)
- No password complexity requirements beyond length (NIST recommendation)

### Session Security

- JWT does not include password hash or sensitive user data — only `user.id` and `user.email`
- Session expiry: 30-day rolling (configurable in NextAuth)
- Logout invalidates client cookie; no server-side session revocation (JWT is stateless — acceptable for this project scale)

### API Authorization

- All `/api/user/*` endpoints (except `/register`) extract session from NextAuth `auth()` server function
- Session user ID is the authoritative identity — client cannot override it
- All DB queries filter by `WHERE user_id = $sessionUserId` — data isolation by design

### Input Sanitization

- All user inputs (feedback, registration) are validated on the server
- `sanitize-html` is already in dependencies — use it for any HTML content
- `stableId` path param is validated against `/^[a-f0-9]{32}$/` before DB query
- SQL injection: Drizzle ORM uses parameterized queries — safe by default

### Privacy Minimization

- No full IP addresses stored; only SHA-256 hash of IP (one-way, cannot be reversed)
- No personally identifiable information required for feedback (name is optional)
- No analytics beyond what Vercel provides by default
- No tracking pixels or third-party analytics added
- Saved articles store only content metadata, not behavioral data
- GDPR: No personal data processing for EU visitors beyond session cookie — but formal GDPR compliance is outside scope

### Rate Limiting

- Feedback: 3/hour per IP hash (§7)
- Registration: Max 5 accounts/hour per IP address (Approved Decision B; tracked in database `registration_rate_limit` table)
- No rate limiting on streak endpoint — the `today_counted` DB flag is the natural idempotency mechanism

### Spam/Abuse on Feedback

- Content dedup (10-min window, same IP+content) prevents identical bot submissions
- Max message length (2000 chars) prevents large-payload attacks
- The endpoint is slow by design (Resend API + DB write) — not suitable for high-volume automation

---

## 19. Unit, Integration, and Manual Testing

### Unit Tests

Add `jest` or use Next.js built-in test support. Test files alongside implementation:

**`lib/articleId.test.js`:**
- `stableArticleId` returns consistent 32-char hex for the same valid URL
- Different URLs produce different IDs
- URLs differing only by tracking params (e.g., `utm_source`) produce the same ID
- URLs differing by meaningful params (e.g., `?id=123` vs `?id=456`) produce different IDs
- URL path case is preserved (`/Article` and `/article` produce different IDs)
- URL scheme and hostname are case-insensitive (`HTTP://Example.com/` and `http://example.com/` produce the same ID)
- Fragment (`#section`) is removed and does not affect the ID
- Malformed URLs (e.g., `'not-a-url'`, `'http://'`) strictly return `null` without throwing and without generating a hash
- Relative URLs (e.g., `'/news/story'`, `'story.html'`) strictly return `null`
- Unsupported schemes (e.g., `'javascript:alert(1)'`, `'ftp://example.com/item'`, `'data:text/html,...'`) strictly return `null`
- Empty strings, whitespace-only strings, and non-string inputs strictly return `null`
- `null` returned when both `article.guid` and `article.link` are absent

**`lib/streakAlgorithm.test.js` (pure function test):**
Extract the streak calculation logic into a pure function for testability:
```js
// lib/streakLogic.js
export function computeStreakUpdate(existingRow, todayStr)
// Returns: { type, new_streak, new_longest }
```
Test cases:
- No existing row → `{ type: 'first', new_streak: 1 }`
- Last login = today → `{ type: 'same_day' }`
- Last login = yesterday → `{ type: 'increment' }`
- Last login = 2+ days ago → `{ type: 'reset', new_streak: 1 }`, longest_streak preserved
- Reset with record streak (5) → longest stays 5
- Increment to new record (6) → longest becomes 6

**`lib/currentCalendarDay.test.js`:**
- Returns string matching `YYYY-MM-DD` pattern
- Returns IST date (mock system clock)

### Integration Tests

**`app/api/feedback/route.test.js`:**
- Valid submission, Resend succeeds → 200 `{ success: true, emailDelivered: true }`
- Valid submission, Resend fails → 200 `{ success: true, emailDelivered: false }` (record stored, status = 'failed')
- DB write fails → 500 `{ success: false }` (nothing stored; user may resubmit)
- Message too short → 400
- Message too long → 400
- Rate limit exceeded → 429
- Duplicate content → 429
- Verify DB row has `delivery_status = 'sent'` after successful delivery
- Verify DB row has `delivery_status = 'failed'` and `retry_count = 0` after Resend failure

**`app/api/user/register/route.test.js`:**
- Valid registration → 201
- Duplicate email → 409
- Invalid email → 400
- Short password → 400
- Registration rate limit exceeded (6th registration in 1 hour from same IP) → 429 `{ error: "Too many registrations from this IP address. Maximum 5 per hour." }` (Approved Decision B)

**`scripts/retry-feedback-email.test.js`:**
- Eligible rows (pending/failed with elapsed backoff, or never-attempted `delivery_attempted_at IS NULL`, retry_count < MAX) are fetched and processed
- Newly inserted pending record (`delivery_attempted_at IS NULL`) is selected and processed immediately
- Previously failed record with elapsed backoff (`delivery_attempted_at < cutoff`) is selected and processed
- Record with unelapsed backoff (`delivery_attempted_at >= cutoff`) is excluded
- Stale retry claim (`delivery_status = 'retrying'` and `claim_started_at < now() - interval '10 minutes'`) is safely reclaimed
- Active retry claim (`delivery_status = 'retrying'` and `claim_started_at >= now() - interval '10 minutes'`) is skipped
- Successful Resend call updates status to 'sent', sets `email_sent = true`, clears `claim_started_at`
- Failed Resend call increments `retry_count`, sets status to 'failed', clears `claim_started_at`
- Rows at MAX_RETRY_ATTEMPTS are set to 'permanently_failed'
- Optimistic-lock: row already claimed by another worker (0 rows updated) is skipped

**`app/api/user/saved/route.test.js`:**
- Unauthenticated request → 401
- Save article → 201
- Save same article twice → 200 with `alreadySaved: true`
- Delete saved article → 200
- Delete another user's article → 404 (due to WHERE user_id = $sessionUserId)
- Save article with mismatched stableId (client stableId ≠ server-computed ID from link) → 400 `{ error: "Invalid article identifier." }`
- Save article with malformed URL in `link` field → 400
- Save article with relative URL in `link` field → 400
- Save article with unsupported scheme (e.g. `javascript:...`, `ftp:...`) in `link` field → 400
- Save article with whitespace-only or empty `link` field → 400
- Save article when user already has 500 saved articles → 400 with max limit error (Approved Decision D)


### Manual Testing Checklist

**Feature 1 — Feedback:**
- [ ] Feedback button visible in Header/Footer
- [ ] Modal opens and closes correctly
- [ ] Form validates empty message (shows error)
- [ ] Form validates too-long message
- [ ] Success state shown after successful submission (email delivered)
- [ ] Qualified success state shown when Resend fails/disconnected ("feedback received, email pending")
- [ ] Error state shown only when DB write fails
- [ ] Owner receives email
- [ ] Rate limit works after 3 submissions
- [ ] Submit button stays disabled during loading

**Feature 2 — Sharing:**
- [ ] Category share button appears on hover (desktop)
- [ ] Category share button always visible on touch device
- [ ] Category share URL contains correct hash (e.g. `#category-sports`)
- [ ] Opening shared URL activates correct category tab
- [ ] Web Share API sheet opens on mobile (if supported)
- [ ] "Copied!" toast appears on desktop copy-link fallback
- [ ] Masthead share button shares homepage URL (not current hash)
- [ ] Masthead share button visible across all screen sizes

**Feature 3 — Auth/Streak/Profile/Saved:**
- [ ] Register with new email works
- [ ] Duplicate email registration shows error
- [ ] Login with correct credentials works
- [ ] Login with wrong password shows error
- [ ] Streak popup appears after first login (Day 1)
- [ ] Streak popup NOT shown on same-day re-login
- [ ] Streak increments after next-day login
- [ ] Streak resets after missing a day
- [ ] Longest streak preserved after reset
- [ ] Profile panel shows correct streak and saved count
- [ ] Save article button works when logged in
- [ ] Save button opens auth modal when not logged in
- [ ] Saved article appears in profile panel
- [ ] Remove saved article works
- [ ] Logout clears session
- [ ] Protected endpoints return 401 when unauthenticated

**Regression:**
- [ ] News fetching still works (all 6 categories)
- [ ] Language translation still works
- [ ] State filtering still works
- [ ] Date switching still works
- [ ] Article reader modal opens correctly
- [ ] TTS (audio) still works in cards and reader
- [ ] Category nav tabs still work
- [ ] Search/filter still works
- [ ] Responsive layout not broken on mobile

---

## 20. Deployment, Migration, Rollback, and Recovery

### Deployment Order

1. Set all new environment variables in Vercel Dashboard
2. Run database migrations against production Neon database (`npm run db:migrate` with production `DATABASE_URL_UNPOOLED`)
3. Deploy to Vercel (`git push` to main branch or manual deploy)
4. Verify all features in production
5. Do NOT revert unless a critical issue is found

### Migration Safety

- Drizzle migrations are additive (new tables, new columns). They do not alter existing data.
- No existing tables are modified (there are no existing tables).
- Rollback: drop the new tables if needed (`DROP TABLE saved_articles, feedback, feedback_rate_limit, user_streaks, users;`)
- Drizzle-kit does not auto-rollback — maintain manual down-migration scripts if needed

### Rollback Plan

If a critical issue is found after deployment:
1. Revert the Vercel deployment to the previous successful deployment (Vercel instant rollback via dashboard)
2. The database tables remain (harmless with no app code accessing them)
3. Remove environment variables added for new features if they interfere

### Production Monitoring

- Monitor Vercel Function logs for errors in new API routes
- Monitor Resend dashboard for failed email deliveries
- Monitor Neon dashboard for connection errors or storage approaching free tier limits

---

## 21. Risks, Assumptions, and Approved Architecture Decisions

### Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Neon free tier: 512 MB storage. If thousands of articles are saved, storage could be exhausted. | Low (personal project) | Each saved article ~1–2 KB. 512 MB ≈ 260,000 saved articles. Sufficient. |
| `@neondatabase/serverless` cold start on Vercel | Low | Neon's serverless driver is designed for this. Typical cold start < 500ms. |
| In-memory rate limiting across Vercel instances | Medium | Rate limit is stored in DB (`feedback_rate_limit`), not in-memory. This is safe. |
| `app/page.js` complexity growth | Medium | Changes are surgical and minimal. Risk of merge conflicts if existing code changes simultaneously. |
| NextAuth v5 is in beta | Medium | v5 is production-stable (used widely). Monitor for breaking changes. Use exact version pinning. |
| JWT stateless logout | Low | Acceptable for this project. Full revocation requires server-side session store (Redis) — not needed at this scale. |
| Google News GUIDs are unstable for some items | Low | Stable ID derived from canonical `link` URL mitigates this. |
| Missing `NEXTAUTH_URL` in Vercel env causes redirect errors | High | Must be set explicitly. Documented in §6. |

### Assumptions

1. **Verified:** The site has no existing authentication, database, or feedback system.
2. **Assumed:** `app/api/summarize/route.js` exists (the lib function is imported in `news/route.js`; the standalone route was listed in directory structure but not read — not needed for new features anyway).
3. **Assumed:** Vercel Hobby plan is sufficient for new API routes. Neon serverless connections are counted per request, not concurrently — within Hobby limits.
4. **Assumed:** Owner has or can create a Resend account and a verified sender domain.
5. **Assumed:** Owner is comfortable with JWT-based authentication (stateless). If server-side session storage is later required (e.g., for immediate logout across devices), that can be added via NextAuth `database` adapter.
6. **Assumed:** IST timezone for streak day boundaries is acceptable.

### Record of Approved Product Decisions (Explicitly Approved by User, 2026-10-13)

> **Context & Approval Status:** All eight product decisions listed below were explicitly approved by the user on 2026-10-13. The implementation proceeds directly according to these approved designs.

| # | Decision Topic | Status | Approved Design (Specified in This Document) | Alternatives Considered | Detailed Section |
|---|----------------|:------:|---------------------------------------------|-------------------------|-------------------|
| A | Feedback delivery method | Approved | **Both** — Durable PostgreSQL persistence first (`pending`), followed by Resend email dispatch with retry tracking and at-least-once recovery | Email only / DB only | §5, §7, §14, §15 |
| B | Registration rate limiting | Approved | **5 accounts/hour per IP** (tracked in database `registration_rate_limit` table) | None / CAPTCHA | §14, §15, §18 |
| C | Password reset | Approved | **Out of scope for initial release** (to be added in later phase via email reset token) | Email-based reset flow in Phase 1 | §10, §15 |
| D | Maximum saved articles per user | Approved | **500 articles cap per user** (prevents database storage exhaustion on Neon free tier) | No limit / 1000 cap | §13, §15 |
| E | Streak calendar day timezone | Approved | **IST (Asia/Kolkata, UTC+5:30)** as canonical calendar day boundary | UTC / User local timezone | §11, §12, §14 |
| F | Auth entry points | Approved | **Header primary button** ("Sign In" / Avatar) + **Footer entry point** ("Sign In" / "My Account") + contextual bookmark prompt in `NewsCard` | Header only / Auto-modal on landing | §3, §4, §10, §13, §16 |
| G | Profile panel format | Approved | **Slide-in right panel** (`components/ProfilePanel.js`) with responsive bottom-sheet on mobile; preserves SPA architecture | Dedicated `/profile` route | §10, §16 |
| H | Article read login prompt | Approved | **Unobtrusive: prompt only on Save action**; never gate reading articles or browsing categories | Gate article reading / Prompt on card open | §10, §13, §16 |

> **Implementation Guideline:** The checklist in §22 and implementation instructions in §23 reflect the Approved Designs above. All eight decisions have been confirmed and integrated across all sections of this specification.

---

## 22. Ordered Implementation Checklist

Follow this order to minimize integration conflicts:

### Phase 1: Foundation

- [ ] 1. Add new dependencies to `package.json` (nextauth, neon, drizzle, bcryptjs, resend)
- [ ] 2. Create `lib/schema.js` with all table definitions
- [ ] 3. Create `lib/db.js` with Neon + Drizzle client
- [ ] 4. Create `drizzle.config.js`
- [ ] 5. Run `npm run db:generate` → generates migration files
- [ ] 6. Run `npm run db:migrate` against local/dev Neon database
- [ ] 7. Verify tables exist in Neon dashboard

### Phase 2: Authentication

- [ ] 8. Create `lib/auth.js` (NextAuth config with Credentials provider)
- [ ] 9. Create `app/api/auth/[...nextauth]/route.js`
- [ ] 10. Create `app/providers.js` (SessionProvider wrapper)
- [ ] 11. Modify `app/layout.js` to use `Providers`
- [ ] 12. Create `app/api/user/register/route.js`
- [ ] 13. Create `components/AuthModal.js` (login + register tabs, no streak logic yet)
- [ ] 14. Modify `components/Header.js` to show Sign In button and open AuthModal
- [ ] 15. Modify `app/page.js` to manage AuthModal state
- [ ] 16. Test: register, login, logout, session persistence

### Phase 3: Streak

- [ ] 17. Create `lib/streakLogic.js` (pure function for unit testing)
- [ ] 18. Create `app/api/user/streak/route.js`
- [ ] 19. Create `components/StreakPopup.js`
- [ ] 20. Modify `components/AuthModal.js`: after successful login, call `/api/user/streak`, pass result to `onLoginSuccess` callback
- [ ] 21. Modify `app/page.js`: handle `onLoginSuccess`, show `StreakPopup` for non-`same_day` results
- [ ] 22. Test: streak increments, resets, same-day idempotency, concurrent request safety

### Phase 4: Profile and Saved Articles

- [ ] 23. Create `lib/articleId.js`: strictly validate absolute HTTP/HTTPS URLs; return null for invalid, malformed, or relative URLs; never fall back to hashing raw strings
- [ ] 24. Modify `app/api/news/route.js`: import `stableArticleId` from `lib/articleId.js`; in the article mapping step, add `art.stableId = stableArticleId(art)` (safely receiving `null` for invalid URLs without breaking news delivery). This is the only change to this file — do not alter news fetching, RSS parsing, translation, summarization, or TTS logic.
- [ ] 25. Create `app/api/user/saved/route.js` (GET + POST)
- [ ] 26. Create `app/api/user/saved/[stableId]/route.js` (DELETE)
- [ ] 27. Create `app/api/user/profile/route.js` (GET)
- [ ] 28. Modify `components/NewsCard.js`: add bookmark button (save/unsave)
- [ ] 29. Modify `components/CategorySection.js`: pass `onSaveArticle`, `isSaved`, `onRequestAuth` props to `NewsCard`
- [ ] 30. Modify `app/page.js`: fetch `savedArticleIds` after auth, pass down props
- [ ] 31. Create `components/ProfilePanel.js` (streak + saved articles + logout)
- [ ] 32. Modify `components/Header.js`: show user avatar after login, open ProfilePanel
- [ ] 33. Modify `app/page.js`: manage ProfilePanel state
- [ ] 34. Test: save article, view in profile, remove, auth gate for unauthenticated save

### Phase 5: Sharing

- [ ] 35. Create `components/ShareButton.js`
- [ ] 36. Modify `app/page.js`: add hash synchronization `useEffect` and async post-load scrolling `useEffect` (§8)
- [ ] 37. Modify `components/CategorySection.js`: add category share button
- [ ] 38. Modify `components/Header.js`: add masthead share button
- [ ] 39. Test: category share URL, hash deep-link, masthead share URL, copy fallback, touch visibility

### Phase 6: Feedback

- [ ] 40. Create `app/api/feedback/route.js` (persist-first, then email; return `emailDelivered` flag)
- [ ] 41. Create `components/FeedbackModal.js` (handle both success states: email delivered vs. pending)
- [ ] 42. Add Feedback button to `components/Header.js` or `components/Footer.js`
- [ ] 43. Modify `app/page.js`: manage FeedbackModal state
- [ ] 44. Create `scripts/retry-feedback-email.js`: retry worker for failed/pending/stale-claim delivery with 10-minute claim timeout, backoff handling for NULL/elapsed `delivery_attempted_at`, and atomic claim updates
- [ ] 45. Test: valid submission (email sent), valid submission (email fails → emailDelivered: false), DB failure, validation errors, rate limiting, retry script stale claim recovery, NULL delivery_attempted_at handling, and transition to permanently_failed

### Phase 7: Styling and Polish

- [ ] 46. Append all new CSS to `app/globals.css`
- [ ] 47. Verify responsive layout on mobile (375px width)
- [ ] 48. Verify all keyboard navigation
- [ ] 49. Verify color contrast for new UI elements

### Phase 8: Testing and QA

- [ ] 50. Write unit tests for `streakLogic.js` and `articleId.js`
- [ ] 51. Run `npm run build` — fix any build errors
- [ ] 52. Complete manual testing checklist from §19
- [ ] 53. Regression: verify all 6 categories load, translation, TTS, date switching still work

### Phase 9: Deployment

- [ ] 54. Set all environment variables in Vercel Dashboard
- [ ] 55. Run migrations against production Neon database
- [ ] 56. Deploy to Vercel
- [ ] 57. Smoke test production deployment

---

## 23. GEMINI IMPLEMENTATION INSTRUCTIONS

### Read This Section Entirely Before Writing Any Code

You are implementing the three feature groups specified in this document for the Multilingual News Digest (MND) Next.js App Router project. Follow these instructions precisely.

---

### Pre-Implementation Requirements

1. **Read the entire specification** before editing any file. Every section is relevant.
2. **Read the Next.js docs** at `node_modules/next/dist/docs/` before writing any Next.js-specific code (required by `AGENTS.md`). Pay attention to App Router conventions, Server vs Client Components, and Route Handlers.
3. **Inspect the relevant existing source files** before modifying them:
   - `app/page.js` — understand all existing state, effects, and rendering
   - `app/layout.js` — understand the server component structure
   - `components/Header.js` — understand the masthead structure before adding buttons
   - `components/CategorySection.js` — understand the section layout before adding share button
   - `components/NewsCard.js` — understand the footer before adding bookmark button
4. **Check the installed Next.js version** (`package.json`: `"next": "16.3.3"`) and ensure all APIs used are compatible with this exact version.
5. **Verify NextAuth v5 compatibility** with Next.js 16. Install with `npm install next-auth@beta` and check the actual installed version.

---

### Scope and Boundaries

- Implement **only** the three feature groups: Feedback, Sharing, Authentication/Streak/Profile/Saved.
- Make **minimal, targeted changes** to existing files. Do not refactor, rename, or restructure existing code.
- **Preserve all existing functionality** including news fetching, categorization, translation, TTS, language selection, date switching, responsive layout, and article reader modal.
- Do **not** modify `app/api/news/route.js` beyond attaching `stableId` to each article (one line addition in the return mapping, plus the import of `stableArticleId`).
- Do **not** modify `lib/rss.js`, `lib/categorize.js`, `lib/summarize.js`, `lib/translate.js`, `lib/fetchNews.js`, `lib/speaker.js`, `lib/languages.js`, `lib/constants.js`, or `lib/translations.js`.
- Do **not** modify `app/api/translate/route.js`, `app/api/tts/route.js`, or `app/api/summarize/route.js`.
- Do **not** make changes to `README.md` (it has conflict markers outside scope).
- Do **not** commit, push, or deploy. Implementation only.

---

### Critical Rules

1. **Feedback success depends on durable database persistence, not email delivery.** The server must write the feedback record to the database before attempting email delivery. Return `{ success: true }` when the database write succeeds, even if Resend is temporarily unavailable. Never claim success if the database write failed. Never prompt the user to resubmit a record that has already been durably persisted. When persistence succeeds but email delivery fails, the response must explicitly indicate that the feedback was received and that email delivery will be retried — not that the submission failed.

2. **Never use localStorage as a substitute for account-based persistence.** All user data (streak, saved articles) must be stored in the Neon PostgreSQL database and associated with the authenticated user session.

3. **Enforce server-side authentication on all private endpoints.** Every `/api/user/*` endpoint (except `/api/user/register`) must extract the session via NextAuth's `auth()` function and reject unauthenticated requests with `401`. Never trust user-provided IDs.

4. **Make streak updates safe against concurrent requests, including first-login.** Use `INSERT ... ON CONFLICT` to atomically create or locate the streak row, then apply a `SELECT ... FOR UPDATE` lock within a transaction for the subsequent read-modify-write. `SELECT ... FOR UPDATE` alone does not protect a row that does not yet exist. Do not implement streak updates with a bare SELECT + UPDATE without locking (race condition).

5. **Never increment streak on page load, session refresh, or profile view.** Only call `/api/user/streak` after a successful NextAuth sign-in (in the `AuthModal` after `signIn()` resolves successfully). This is called exactly once per login event.

6. **Streak popup must never trigger a streak update.** It only displays information already returned from the API.

7. **Article stable IDs must be computed and validated server-side.** `lib/articleId.js` computes the stable ID from a normalized article URL. If a URL is invalid, relative, malformed, empty, or uses an unsupported scheme, `stableArticleId` returns `null` — it must never hash raw strings as a fallback. `app/api/news/route.js` attaches `stableId` (or `null`) to articles safely without breaking news delivery. When the client submits a save request, `POST /api/user/saved` independently validates that `link` is a valid absolute HTTP/HTTPS URL, recomputes the expected stable ID from `link`, and rejects any request where the URL is invalid or where the client-provided `stableId` does not match (HTTP 400). Never accept a client-provided `stableId` without verifying it against the server-computed value.

8. **The category deep-link effect must account for asynchronous news loading.** Setting `activeCategory` from the URL hash on mount is not sufficient if news articles load after mount. After news data is available, the application must scroll the target category section into view. Use a separate effect that depends on the news data being loaded, not only a one-time mount effect.

---

### Architecture Compliance

- Follow the architecture specified in §5: NextAuth.js v5 + Neon PostgreSQL + Drizzle ORM + Resend.
- Use the exact database schema specified in §14.
- Implement the API endpoints exactly as specified in §15 (correct HTTP methods, request/response shapes, status codes).
- Use IST (Asia/Kolkata) for all calendar day calculations (§12).
- Use the `ShareButton` component pattern from §8 and §9.

---

### Implementation Order

Follow the ordered checklist in §22 (Phases 1–9 in sequence). Do not skip ahead. Test each phase before proceeding.

---

### Tests

- Write unit tests for `lib/streakLogic.js` and `lib/articleId.js` as specified in §19.
- Run `npm run build` after completing all changes. Fix any build errors before reporting.
- Complete the manual test checklist from §19.

---

### Reporting

After completing implementation, provide a summary containing:

1. **List of every modified file** with a one-sentence description of what changed.
2. **List of every new file created** with its purpose.
3. **All new environment variables** required, with descriptions of how to obtain each value.
4. **All manual setup steps** (Neon project creation, Resend account setup, key generation).
5. **Confirmation that all eight approved product decisions from §21** were strictly adhered to.
6. **Test results:** build success/failure, unit test pass/fail, any manual test failures.

---

### When to Stop and Ask

Stop and ask the user before proceeding if:

- The user requests changes to any of the approved architecture decisions in §21, or explicit confirmation is needed before running migration/deployment steps.
- A dependency is incompatible with Next.js 16.3.3 and requires a different approach.
- The NextAuth v5 API differs significantly from what is described in §10, requiring an architectural change.
- Any new file would overwrite an existing file not listed as a file to modify.
- The Neon or Drizzle API differs from what is specified in a way that requires schema changes.

Do **not** silently change the architecture to a different preferred service or approach. If Neon is unavailable, ask before substituting another database.

---

*End of specification. Total sections: 23. All three feature groups are fully specified.*
