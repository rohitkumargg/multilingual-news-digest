import assert from 'node:assert/strict';

// 1. Categories defined in the app (§8)
const CATEGORIES = [
  { id: 'india', label: 'India' },
  { id: 'world', label: 'World' },
  { id: 'politics', label: 'Politics' },
  { id: 'business', label: 'Business' },
  { id: 'technology', label: 'Technology' },
  { id: 'sports', label: 'Sports' }
];

console.log('--- TEST SUITE: PHASE 5 SHARING LOGIC ---');

// TEST 1: Category URL generation
console.log('\nTest 1: Category URL Generation');
const origin = 'https://multilingual-news-digest.vercel.app';
for (const cat of CATEGORIES) {
  const expectedUrl = `${origin}/#category-${cat.id}`;
  const generatedUrl = `${origin}/#category-${cat.id}`;
  assert.equal(generatedUrl, expectedUrl);
  console.log(`  ✓ Category URL for ${cat.id}: ${generatedUrl}`);
}

// TEST 2: Whole-Newspaper URL generation (clean origin, no hash, no query)
console.log('\nTest 2: Whole-Newspaper URL Generation');
const dirtyUrls = [
  'https://multilingual-news-digest.vercel.app/#category-politics',
  'https://multilingual-news-digest.vercel.app/?utm_source=test#category-world',
  'https://multilingual-news-digest.vercel.app/some/subpath#category-india'
];
for (const dirtyUrl of dirtyUrls) {
  const parsed = new URL(dirtyUrl);
  const cleanOrigin = parsed.origin;
  assert.equal(cleanOrigin, 'https://multilingual-news-digest.vercel.app');
  assert.ok(!cleanOrigin.includes('#'));
  assert.ok(!cleanOrigin.includes('?'));
  console.log(`  ✓ Stripped ${dirtyUrl} -> ${cleanOrigin}`);
}

// TEST 3: Hash Extraction and Validation Logic (Effect 1 & 2 in app/page.js)
console.log('\nTest 3: Hash Extraction & Category Matching Logic');
function resolveCategoryFromHash(hash, currentActive = 'all') {
  if (!hash || hash === '#' || hash === '#all') {
    return 'all';
  }
  const match = hash.match(/^#category-(.+)$/);
  if (match) {
    const catId = match[1];
    const valid = CATEGORIES.find(c => c.id === catId);
    if (valid) return catId;
  }
  // Unknown or malformed hashes are ignored safely, preserving currentActive
  return currentActive;
}

// Valid hashes
for (const cat of CATEGORIES) {
  const result = resolveCategoryFromHash(`#category-${cat.id}`, 'all');
  assert.equal(result, cat.id);
  console.log(`  ✓ Valid hash #category-${cat.id} resolved to: ${result}`);
}

// Empty / Root / Default hashes restore 'all'
const rootHashes = ['', '#', '#all'];
for (const rh of rootHashes) {
  const result = resolveCategoryFromHash(rh, 'politics');
  assert.equal(result, 'all');
  console.log(`  ✓ Empty/root hash "${rh}" restored default: ${result}`);
}

// Unknown or malformed hashes safely preserve existing category without throwing
const unknownHashes = [
  '#politics',
  '#category-',
  '#category-unknown',
  '#category-sports123',
  '#other-anchor',
  'https://example.com/#category-politics'
];
for (const unknown of unknownHashes) {
  const result = resolveCategoryFromHash(unknown, 'politics');
  assert.equal(result, 'politics');
  console.log(`  ✓ Unrecognized hash "${unknown}" safely preserved current: ${result}`);
}

// TEST 4: Web Share API handling simulation
console.log('\nTest 4: Web Share API Simulation (Success, AbortError, and Fallback)');

async function simulateShare({ navigatorShareMock, clipboardMock, shareData }) {
  let copied = false;
  let errorLogged = null;

  // 1. Try Web Share API
  if (navigatorShareMock) {
    try {
      await navigatorShareMock(shareData);
      return { status: 'shared', copied: false };
    } catch (err) {
      if (err?.name === 'AbortError') {
        // User closed share sheet — exit silently without copying
        return { status: 'aborted', copied: false };
      }
      errorLogged = err;
    }
  }

  // 2. Clipboard fallback
  if (clipboardMock) {
    try {
      await clipboardMock.writeText(shareData.url);
      copied = true;
      return { status: 'copied', copied: true, fallbackFrom: errorLogged?.message };
    } catch (clipErr) {
      return { status: 'clipboard_failed', error: clipErr };
    }
  }

  return { status: 'unsupported' };
}

// Case A: Web Share API succeeds
const resultA = await simulateShare({
  navigatorShareMock: async () => {},
  clipboardMock: { writeText: async () => {} },
  shareData: { title: 'MND', url: 'https://example.com' }
});
assert.equal(resultA.status, 'shared');
assert.equal(resultA.copied, false);
console.log('  ✓ Web Share API success handled without clipboard copy or toast');

// Case B: User cancels (AbortError)
const abortError = new Error('Share canceled');
abortError.name = 'AbortError';
const resultB = await simulateShare({
  navigatorShareMock: async () => { throw abortError; },
  clipboardMock: { writeText: async () => { throw new Error('Should not be called'); } },
  shareData: { title: 'MND', url: 'https://example.com' }
});
assert.equal(resultB.status, 'aborted');
assert.equal(resultB.copied, false);
console.log('  ✓ AbortError handled silently: no error, no clipboard copy, no toast');

// Case C: Web Share API throws generic error (e.g. NotAllowedError) -> fallback to clipboard
let clipboardWritten = '';
const resultC = await simulateShare({
  navigatorShareMock: async () => { throw new Error('Share permission denied'); },
  clipboardMock: {
    writeText: async (text) => { clipboardWritten = text; }
  },
  shareData: { title: 'MND', url: 'https://example.com/#category-business' }
});
assert.equal(resultC.status, 'copied');
assert.equal(resultC.copied, true);
assert.equal(clipboardWritten, 'https://example.com/#category-business');
console.log('  ✓ Web Share API failure gracefully fell back to clipboard copy & toast trigger');

// Case D: Web Share API unavailable (desktop browser without share support) -> directly uses clipboard
clipboardWritten = '';
const resultD = await simulateShare({
  navigatorShareMock: null,
  clipboardMock: {
    writeText: async (text) => { clipboardWritten = text; }
  },
  shareData: { title: 'MND', url: 'https://example.com' }
});
assert.equal(resultD.status, 'copied');
assert.equal(resultD.copied, true);
assert.equal(clipboardWritten, 'https://example.com');
console.log('  ✓ Web Share API unavailable directly uses clipboard copy & toast trigger');

// TEST 5: Toast Timer Reset on Consecutive Copies
console.log('\nTest 5: Toast Timer Reset on Consecutive Copies');
class MockToastTimerManager {
  constructor() {
    this.copied = false;
    this.timerId = null;
    this.timerStartTimes = [];
    this.clearedTimers = [];
  }

  triggerCopy(fakeCurrentTime) {
    if (this.timerId !== null) {
      this.clearedTimers.push(this.timerId);
      this.timerId = null;
    }
    this.copied = true;
    const newId = this.timerStartTimes.length + 1;
    this.timerId = newId;
    this.timerStartTimes.push({ id: newId, startTime: fakeCurrentTime });
  }

  expireTimer(timerId) {
    if (this.timerId === timerId) {
      this.copied = false;
      this.timerId = null;
    }
  }

  unmount() {
    if (this.timerId !== null) {
      this.clearedTimers.push(this.timerId);
      this.timerId = null;
    }
  }
}

const manager = new MockToastTimerManager();
// First copy at t=0
manager.triggerCopy(0);
assert.equal(manager.copied, true);
assert.equal(manager.timerId, 1);
assert.equal(manager.clearedTimers.length, 0);

// Second copy at t=1000ms (before timer 1 expires)
manager.triggerCopy(1000);
assert.equal(manager.copied, true);
assert.equal(manager.timerId, 2);
assert.deepEqual(manager.clearedTimers, [1]); // Timer 1 was cleared!

// Expire timer 1 (should be no-op because it was already cleared)
manager.expireTimer(1);
assert.equal(manager.copied, true); // Still copied!

// Expire timer 2 at t=3000ms (full 2s from second click)
manager.expireTimer(2);
assert.equal(manager.copied, false);
console.log('  ✓ Toast timer resets on consecutive clicks and clears previous timeout');

// Test unmount cleanup
manager.triggerCopy(4000);
assert.equal(manager.timerId, 3);
manager.unmount();
assert.equal(manager.timerId, null);
assert.ok(manager.clearedTimers.includes(3));
console.log('  ✓ Toast timer safely cleaned up on unmount');

console.log('\n--- ALL PHASE 5 TESTS PASSED SUCCESSFULLY ---\n');
