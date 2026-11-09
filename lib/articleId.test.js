import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stableArticleId, isLikelyStableGuid } from './articleId.js';

describe('lib/articleId.js — Stable Article Identification & Normalization (§13)', () => {
  describe('Stable 32-character hex ID generation', () => {
    it('generates a consistent 32-character lowercase hex string for a valid URL', () => {
      const url = 'https://www.thehindu.com/news/national/article12345.ece';
      const id1 = stableArticleId({ link: url });
      const id2 = stableArticleId({ link: url });

      assert.ok(id1 && id1.length === 32, 'ID must be 32 characters long');
      assert.match(id1, /^[a-f0-9]{32}$/, 'ID must be hexadecimal');
      assert.equal(id1, id2, 'Same URL must produce identical stable ID');
    });

    it('generates different IDs for different canonical URLs', () => {
      const idA = stableArticleId({ link: 'https://indianexpress.com/article/sports/cricket/story-a' });
      const idB = stableArticleId({ link: 'https://indianexpress.com/article/sports/cricket/story-b' });

      assert.notEqual(idA, idB, 'Different URLs must produce different IDs');
    });
  });

  describe('URL Normalization', () => {
    it('normalizes scheme and hostname to lowercase (case-insensitive)', () => {
      const idUpper = stableArticleId({ link: 'HTTPS://WWW.TheHindu.COM/news/national/story.ece' });
      const idLower = stableArticleId({ link: 'https://www.thehindu.com/news/national/story.ece' });

      assert.equal(idUpper, idLower, 'Scheme and hostname case differences must normalize to identical ID');
    });

    it('preserves path case sensitivity', () => {
      const idPath1 = stableArticleId({ link: 'https://www.thehindu.com/news/national/StoryOne.ece' });
      const idPath2 = stableArticleId({ link: 'https://www.thehindu.com/news/national/storyone.ece' });

      assert.notEqual(idPath1, idPath2, 'Path case differences must yield distinct IDs');
    });

    it('strips URL fragments before hashing', () => {
      const idWithFragment = stableArticleId({ link: 'https://ndtv.com/india-news/top-story-101#comments-section' });
      const idClean = stableArticleId({ link: 'https://ndtv.com/india-news/top-story-101' });

      assert.equal(idWithFragment, idClean, 'URL fragment must not alter stable ID');
    });
  });

  describe('Tracking Parameter Removal and Functional Parameter Preservation', () => {
    it('removes known tracking parameters (utm_*, gclid, fbclid, ref, etc.)', () => {
      const idDirty = stableArticleId({
        link: 'https://indianexpress.com/article/delhi/story-999/?utm_source=twitter&utm_medium=social&utm_campaign=daily&utm_term=news&utm_content=headline&fbclid=123&gclid=456&msclkid=789&ref=mnd&source=app&mc_cid=abc&mc_eid=def',
      });
      const idClean = stableArticleId({
        link: 'https://indianexpress.com/article/delhi/story-999/',
      });

      assert.equal(idDirty, idClean, 'All tracking parameters must be stripped');
    });

    it('removes tracking parameters case-insensitively', () => {
      const idUpperTracking = stableArticleId({
        link: 'https://indianexpress.com/article/delhi/story-999/?UTM_SOURCE=google&REF=mnd',
      });
      const idClean = stableArticleId({
        link: 'https://indianexpress.com/article/delhi/story-999/',
      });

      assert.equal(idUpperTracking, idClean, 'Tracking parameter keys must be matched case-insensitively');
    });

    it('preserves meaningful functional query parameters and differentiates articles by them', () => {
      const idArticle1 = stableArticleId({
        link: 'https://example.com/view?story=101&category=sports',
      });
      const idArticle2 = stableArticleId({
        link: 'https://example.com/view?story=102&category=sports',
      });

      assert.notEqual(idArticle1, idArticle2, 'Different functional query parameters must produce different IDs');
    });

    it('sorts remaining query parameters deterministically regardless of parameter order', () => {
      const idOrder1 = stableArticleId({
        link: 'https://example.com/view?beta=2&alpha=1&gamma=3',
      });
      const idOrder2 = stableArticleId({
        link: 'https://example.com/view?alpha=1&gamma=3&beta=2',
      });

      assert.equal(idOrder1, idOrder2, 'Query parameter order must not affect stable ID');
    });

    it('correctly handles URLs with mixed tracking and functional parameters', () => {
      const idMixed = stableArticleId({
        link: 'https://example.com/view?utm_source=feed&id=500&gclid=xyz&topic=tech',
      });
      const idTarget = stableArticleId({
        link: 'https://example.com/view?id=500&topic=tech',
      });

      assert.equal(idMixed, idTarget, 'Mixed tracking and functional parameters must strip tracking and retain sorted functional params');
    });
  });

  describe('Invalid URLs and Malformed Input Rejection', () => {
    it('returns null for relative URLs', () => {
      assert.equal(stableArticleId({ link: '/news/story-123' }), null);
      assert.equal(stableArticleId({ link: 'story.html' }), null);
      assert.equal(stableArticleId({ link: '../article/view' }), null);
    });

    it('returns null for unsupported URL schemes (javascript:, ftp:, data:, file:)', () => {
      assert.equal(stableArticleId({ link: 'javascript:alert(1)' }), null);
      assert.equal(stableArticleId({ link: 'ftp://ftp.example.com/file' }), null);
      assert.equal(stableArticleId({ link: 'data:text/html;base64,PHNjcmlwdD4=' }), null);
      assert.equal(stableArticleId({ link: 'file:///c:/secret.txt' }), null);
    });

    it('returns null for malformed or unparseable URL strings without throwing', () => {
      assert.equal(stableArticleId({ link: 'not-a-valid-url' }), null);
      assert.equal(stableArticleId({ link: 'http://' }), null);
      assert.equal(stableArticleId({ link: 'https://' }), null);
      assert.equal(stableArticleId({ link: '://bad-scheme' }), null);
    });

    it('returns null for empty or whitespace-only strings', () => {
      assert.equal(stableArticleId({ link: '' }), null);
      assert.equal(stableArticleId({ link: '   ' }), null);
      assert.equal(stableArticleId({ link: '\t\n' }), null);
    });

    it('returns null when article object or link/guid fields are absent or invalid types', () => {
      assert.equal(stableArticleId(null), null);
      assert.equal(stableArticleId(undefined), null);
      assert.equal(stableArticleId('https://example.com'), null); // not an object
      assert.equal(stableArticleId({}), null);
      assert.equal(stableArticleId({ link: null }), null);
      assert.equal(stableArticleId({ link: 12345 }), null);
      assert.equal(stableArticleId({ link: true }), null);
      assert.equal(stableArticleId({ link: {} }), null);
    });
  });

  describe('GUID Preference and Unstable GUID Fallback Handling', () => {
    it('identifies stable vs unstable GUIDs accurately via isLikelyStableGuid', () => {
      assert.equal(isLikelyStableGuid('https://thehindu.com/article-guid'), true);
      assert.equal(isLikelyStableGuid('http://thehindu.com/article-guid'), true);
      assert.equal(isLikelyStableGuid('1729000000000-0.12345Date.now'), false);
      assert.equal(isLikelyStableGuid('random-guid-without-http'), false);
      assert.equal(isLikelyStableGuid(null), false);
      assert.equal(isLikelyStableGuid(undefined), false);
      assert.equal(isLikelyStableGuid(''), false);
    });

    it('prefers a valid stable HTTP/HTTPS GUID over article.link', () => {
      const idWithGuid = stableArticleId({
        guid: 'https://publisher.com/canonical-guid-url',
        link: 'https://google.com/news/redirect?id=unstable-wrapper',
      });
      const expectedGuidId = stableArticleId({
        link: 'https://publisher.com/canonical-guid-url',
      });

      assert.equal(idWithGuid, expectedGuidId);
    });

    it('falls back to article.link if article.guid is an unstable random timestamp', () => {
      const idWithUnstableGuid = stableArticleId({
        guid: '1729000000000-0.98765Date.now',
        link: 'https://publisher.com/canonical-article-link',
      });
      const expectedLinkId = stableArticleId({
        link: 'https://publisher.com/canonical-article-link',
      });

      assert.equal(idWithUnstableGuid, expectedLinkId);
    });

    it('returns null if both guid and link are unstable or invalid', () => {
      const idAllInvalid = stableArticleId({
        guid: '1729000000000-0.98765Date.now',
        link: 'not-a-url',
      });

      assert.equal(idAllInvalid, null);
    });
  });
});
