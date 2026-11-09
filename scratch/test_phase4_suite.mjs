import assert from 'node:assert/strict';
import { stableArticleId, isLikelyStableGuid } from '../lib/articleId.js';

console.log('--- Testing Phase 4: Stable Article Identification & Validation ---');

// Test 1: Basic valid HTTPS URL
const id1 = stableArticleId({ link: 'https://www.thehindu.com/news/national/article12345.ece' });
assert.ok(id1 && id1.length === 32, 'Valid URL should produce a 32-character hex ID');
console.log('✓ Test 1 Passed: Valid URL generates 32-char hex stable ID');

// Test 2: Case insensitivity of scheme and host, case preservation of path
const id2a = stableArticleId({ link: 'HTTPS://WWW.TheHindu.COM/news/national/ArticleCase123.ece' });
const id2b = stableArticleId({ link: 'https://www.thehindu.com/news/national/ArticleCase123.ece' });
const id2c = stableArticleId({ link: 'https://www.thehindu.com/news/national/articlecase123.ece' });
assert.equal(id2a, id2b, 'Host & scheme case normalization must match');
assert.notEqual(id2b, id2c, 'Path case must be preserved (case-sensitive paths)');
console.log('✓ Test 2 Passed: Scheme & host normalized, path case preserved');

// Test 3: Tracking parameters removed, functional parameters preserved and sorted
const id3a = stableArticleId({
  link: 'https://indianexpress.com/article/cities/delhi/story-999/?utm_source=twitter&utm_medium=social&story_id=555&gclid=xyz&ref=mnd&category=delhi',
});
const id3b = stableArticleId({
  link: 'https://indianexpress.com/article/cities/delhi/story-999/?category=delhi&story_id=555',
});
assert.equal(id3a, id3b, 'Tracking params must be removed and remaining params sorted');
console.log('✓ Test 3 Passed: Tracking params stripped and functional query params preserved & sorted');

// Test 4: Fragment removal
const id4a = stableArticleId({ link: 'https://ndtv.com/india-news/top-story-101#comments-section' });
const id4b = stableArticleId({ link: 'https://ndtv.com/india-news/top-story-101' });
assert.equal(id4a, id4b, 'URL fragment must be stripped prior to hashing');
console.log('✓ Test 4 Passed: URL fragments stripped');

// Test 5: Rejection of malformed, relative, unsupported scheme URLs
assert.equal(stableArticleId({ link: 'relative/path/story.html' }), null, 'Relative URLs must return null');
assert.equal(stableArticleId({ link: '/just/a/path' }), null, 'Relative path must return null');
assert.equal(stableArticleId({ link: 'javascript:alert(1)' }), null, 'javascript: protocol must return null');
assert.equal(stableArticleId({ link: 'ftp://ftp.example.com/file' }), null, 'ftp: protocol must return null');
assert.equal(stableArticleId({ link: 'data:text/plain;base64,SGVsbG8=' }), null, 'data: protocol must return null');
assert.equal(stableArticleId({ link: 'not a url at all' }), null, 'Malformed string must return null');
assert.equal(stableArticleId({ link: '' }), null, 'Empty string must return null');
assert.equal(stableArticleId({ link: '   ' }), null, 'Whitespace string must return null');
assert.equal(stableArticleId(null), null, 'null input must return null');
assert.equal(stableArticleId({}), null, 'Empty object must return null');
console.log('✓ Test 5 Passed: Malformed, relative, and unsupported protocols strictly return null');

// Test 6: Stable GUID preference vs fallback rejection
assert.equal(isLikelyStableGuid('https://timesofindia.indiatimes.com/story123'), true);
assert.equal(isLikelyStableGuid('http://feeds.ndtv.com/guid123'), true);
assert.equal(isLikelyStableGuid('1728888888888-0.12345Date.now'), false);
assert.equal(isLikelyStableGuid(null), false);

const idGuid = stableArticleId({
  guid: 'https://publisher.com/canonical-guid-url',
  link: 'https://google.com/news/redirect?url=xyz',
});
const expectedGuid = stableArticleId({ link: 'https://publisher.com/canonical-guid-url' });
assert.equal(idGuid, expectedGuid, 'Valid HTTP GUID should be used as canonical source');

const idFallbackGuid = stableArticleId({
  guid: '1728888888888-0.9876Date.now',
  link: 'https://publisher.com/canonical-article-link',
});
const expectedLink = stableArticleId({ link: 'https://publisher.com/canonical-article-link' });
assert.equal(idFallbackGuid, expectedLink, 'Unstable random GUID must fall back to canonical link');
console.log('✓ Test 6 Passed: Stable GUID preference and random fallback avoidance verified');

console.log('\n--- All Unit Tests in test_phase4_suite.mjs Passed Cleanly! ---');
