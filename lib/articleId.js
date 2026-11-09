import crypto from 'crypto';

/**
 * Known tracking-only query parameters that are safe to remove.
 * Meaningful article-identifying parameters (e.g. id, articleId, story) are preserved.
 */
const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'msclkid',
  'ref',
  'source',
  'mc_cid',
  'mc_eid',
]);

/**
 * Checks if a GUID is likely a stable URL-based GUID rather than a random timestamp fallback.
 * @param {string} guid
 * @returns {boolean}
 */
export function isLikelyStableGuid(guid) {
  if (!guid || typeof guid !== 'string') return false;
  const trimmed = guid.trim();
  return (
    (trimmed.startsWith('http://') || trimmed.startsWith('https://')) &&
    !trimmed.includes('Date.now')
  );
}

/**
 * Returns a 32-character hex stable ID for an article, derived from its canonical URL.
 * Returns null if the URL is invalid, relative, malformed, empty, or uses an unsupported scheme.
 *
 * Validation & Normalization policy (§13):
 * - Extract raw URL candidate from article.guid (if valid HTTP/HTTPS URL) or article.link.
 * - If raw candidate is missing, non-string, empty, or whitespace-only, return null.
 * - Strictly validate that candidate is an absolute URL using `new URL(raw.trim())`.
 * - Require protocol to be strictly 'http:' or 'https:'. Reject relative URLs, malformed URLs,
 *   and unsupported schemes (e.g. javascript:, data:, ftp:, file:) by returning null.
 * - Invalid or unparseable URLs NEVER receive a stable ID and NEVER fall back to hashing raw strings.
 * - Normalize scheme and hostname to lowercase (RFC 3986: host is case-insensitive).
 * - Preserve the URL path as-is (paths are case-sensitive on most servers).
 * - Remove URL fragment (#...) — fragments are client-side only, not part of resource identity.
 * - Remove only the explicitly listed tracking parameters from the query string.
 * - Preserve and sort all other query parameters that may identify distinct articles.
 *
 * @param {Object} article
 * @param {string} [article.link]
 * @param {string} [article.guid]
 * @returns {string|null} 32-character hex hash or null
 */
export function stableArticleId(article) {
  if (!article || typeof article !== 'object') return null;

  const raw =
    article.guid && isLikelyStableGuid(article.guid)
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

  // Reject unsupported protocols (e.g. javascript:, data:, ftp:, file:)
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
