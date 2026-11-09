/**
 * MND — Server-side RSS feed fetcher and parser.
 * Uses rss-parser to fetch and normalize articles from Google News and
 * Indian news outlet RSS feeds.
 */

import Parser from 'rss-parser';
import { isPlaceholderOrCorruptedImage } from './constants.js';

// Configure rss-parser with custom fields for media content
const parser = new Parser({
  customFields: {
    item: [
      ['media:content', 'media:content', { keepArray: true }],
      ['media:thumbnail', 'media:thumbnail'],
      ['enclosure', 'enclosure'],
      ['source', 'source'],
      ['content:encoded', 'content:encoded'],
    ],
  },
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MND-NewsAggregator/1.0',
    Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
  },
});

/**
 * Extract the best available image URL from an RSS item.
 */
function extractImage(item) {
  let url = null;

  // 1. media:content
  if (item['media:content']) {
    const media = Array.isArray(item['media:content'])
      ? item['media:content'][0]
      : item['media:content'];
    if (media?.$?.url) url = media.$.url;
  }

  // 2. media:thumbnail
  if (!url && item['media:thumbnail']?.$?.url) {
    url = item['media:thumbnail'].$.url;
  }

  // 3. enclosure (image type)
  if (!url && item.enclosure?.url) {
    const type = item.enclosure.type || '';
    if (!type || type.startsWith('image/')) {
      url = item.enclosure.url;
    }
  }

  // 4. Parse <img> from description or content:encoded
  if (!url) {
    const rawHtml = item['content:encoded'] || item.content || item.description || '';
    const imgMatch = rawHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch && imgMatch[1]) {
      url = imgMatch[1];
    }
  }

  if (url && !isPlaceholderOrCorruptedImage(url)) {
    return url;
  }

  return null;
}

/**
 * Normalize text by replacing problematic Unicode characters with clean ASCII.
 * Fixes mojibake from curly quotes, em-dashes, etc.
 */
function normalizeText(text) {
  if (!text) return '';
  return text
    // Curly/smart quotes → straight quotes
    .replace(/[\u2018\u2019\u201A\u2032\u0060]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    // Dashes
    .replace(/[\u2013\u2014\u2015]/g, ' — ')
    .replace(/[\u2010\u2011\u2012]/g, '-')
    // Ellipsis
    .replace(/\u2026/g, '...')
    // Spaces
    .replace(/[\u00A0\u2002\u2003\u2009]/g, ' ')
    // Bullet
    .replace(/\u2022/g, '-')
    // Clean up any remaining control characters
    .replace(/[\u0000-\u001F\u007F]/g, '')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strip HTML tags from text to produce plain text.
 */
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&mdash;/g, ' — ')
    .replace(/&ndash;/g, ' – ')
    .replace(/&hellip;/g, '...')
    .replace(/&nbsp;/g, ' ')
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetch and parse a single RSS feed URL.
 * Returns an array of normalized article objects.
 */
export async function fetchAndParseRss(feedUrl, fallbackSourceName = 'News') {
  const feed = await parser.parseURL(feedUrl);

  return (feed.items || []).map((item) => {
    // Extract source name
    let sourceName = fallbackSourceName;
    if (item.source) {
      if (typeof item.source === 'string') {
        sourceName = item.source;
      } else if (typeof item.source === 'object') {
        sourceName = item.source._ || item.source.name || fallbackSourceName;
      }
    } else if (item.creator) {
      sourceName = item.creator;
    }

    // Clean title — remove trailing " - Source Name" if present
    let title = item.title || 'Untitled';
    if (title.includes(' - ')) {
      const parts = title.split(' - ');
      // Check if the last part looks like a source name (short text)
      const lastPart = parts[parts.length - 1].trim();
      if (lastPart.length < 40) {
        if (sourceName === fallbackSourceName) {
          sourceName = lastPart;
        }
        title = parts.slice(0, -1).join(' - ').trim();
      }
    }

    // Extract text from all available sources in the RSS item
    const contentEncoded = stripHtml(item['content:encoded'] || '');
    const descText = stripHtml(item.description || '');
    const snippetText = stripHtml(item.contentSnippet || '');
    const summaryText = stripHtml(item.summary || '');
    const rawContent = stripHtml(item.content || '');

    // Gather unique text candidates
    const candidates = [contentEncoded, rawContent, descText, snippetText, summaryText]
      .filter((t) => t && t.trim().length > 20);

    // Pick the most comprehensive text as bodyText
    let bodyText = '';
    for (const c of candidates) {
      if (c.length > bodyText.length) {
        bodyText = c;
      }
    }

    // Clean up Google News-style boilerplate
    bodyText = bodyText
      .replace(/See more headlines and perspectives on Google News/gi, '')
      .replace(/View Full Coverage on Google News/gi, '')
      .replace(/Tap to read the full story about:\s*/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    let snippet = snippetText || descText || bodyText;
    snippet = snippet
      .replace(/See more headlines and perspectives on Google News/gi, '')
      .replace(/View Full Coverage on Google News/gi, '')
      .replace(/Tap to read the full story about:\s*/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    // If still empty, use title as clean fallback
    if (!snippet || snippet.length < 15) {
      snippet = title;
    }

    // Normalize encoding issues in title, snippet, and bodyText
    title = normalizeText(title);
    snippet = normalizeText(snippet);
    bodyText = normalizeText(bodyText);

    return {
      id: item.guid || item.link || `${Date.now()}-${Math.random()}`,
      title,
      link: item.link || '',
      pubDate: item.isoDate || item.pubDate || new Date().toISOString(),
      source: sourceName,
      snippet,
      bodyText,
      imageUrl: extractImage(item),
    };
  });
}

// ─── In-memory cache ────────────────────────────────────────────────────────

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in ms

/**
 * Fetch RSS with caching. Returns cached result if within TTL.
 */
export async function fetchRssCached(feedUrl, fallbackSourceName = 'News') {
  const cacheKey = feedUrl;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const data = await fetchAndParseRss(feedUrl, fallbackSourceName);
  cache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}

// ─── Article enrichment from source URL ─────────────────────────────────────

const articleDetailsCache = new Map();
const ARTICLE_DETAILS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Fetch details (image, meta description, paragraphs) from a URL's HTML.
 */
async function fetchArticleDetails(url) {
  if (!url) return null;

  const cached = articleDetailsCache.get(url);
  if (cached && Date.now() - cached.timestamp < ARTICLE_DETAILS_CACHE_TTL) {
    return cached.data;
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 MND-NewsAggregator/1.0',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(3500),
    });

    if (!res.ok) {
      articleDetailsCache.set(url, { data: null, timestamp: Date.now() });
      return null;
    }

    const html = await res.text();

    // 1. Image extraction (reject Google News shell logos and placeholders)
    const isGoogleNewsPage =
      (res.url && res.url.includes('news.google.com')) ||
      (url && url.includes('news.google.com'));

    const imgMatch =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    let imageUrl = imgMatch ? imgMatch[1] : null;

    if (isGoogleNewsPage || isPlaceholderOrCorruptedImage(imageUrl)) {
      imageUrl = null;
    }

    // 2. Meta description extraction
    const descMatch =
      html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i);
    const metaDesc = descMatch ? stripHtml(descMatch[1]) : '';

    // 3. Article paragraphs extraction
    const pRegex = /<p[^>]*>([^<]{35,})<\/p>/gi;
    let match;
    const paras = [];
    while ((match = pRegex.exec(html)) !== null && paras.length < 4) {
      const cleanP = stripHtml(match[1]).trim();
      const lower = cleanP.toLowerCase();
      if (
        cleanP.length > 35 &&
        !lower.startsWith('subscribe') &&
        !lower.startsWith('read more') &&
        !lower.startsWith('follow us') &&
        !lower.startsWith('photo:') &&
        !lower.startsWith('copyright')
      ) {
        paras.push(cleanP);
      }
    }

    const data = {
      imageUrl,
      metaDesc,
      paragraphs: paras.join(' '),
    };

    articleDetailsCache.set(url, { data, timestamp: Date.now() });
    return data;
  } catch {
    articleDetailsCache.set(url, { data: null, timestamp: Date.now() });
    return null;
  }
}

/**
 * Enrich articles by extracting images and content from their source URLs.
 * Processes articles in parallel with error resilience.
 */
export async function enrichArticles(articles) {
  if (!Array.isArray(articles) || articles.length === 0) return articles;

  // Clean existing placeholder / Google News logo images
  for (const a of articles) {
    if (a.imageUrl && isPlaceholderOrCorruptedImage(a.imageUrl)) {
      a.imageUrl = null;
    }
  }

  const targetArticles = articles.filter(
    (a) => !a.imageUrl || !a.bodyText || a.bodyText.length < 80
  );
  if (targetArticles.length === 0) return articles;

  await Promise.allSettled(
    targetArticles.map(async (article) => {
      const details = await fetchArticleDetails(article.link);
      if (details) {
        if (!article.imageUrl && details.imageUrl && !isPlaceholderOrCorruptedImage(details.imageUrl)) {
          article.imageUrl = details.imageUrl;
        }
        if (details.metaDesc && (!article.snippet || article.snippet.length < 40)) {
          article.snippet = details.metaDesc;
        }
        if (details.paragraphs && (!article.bodyText || article.bodyText.length < 100)) {
          article.bodyText = details.paragraphs;
        }
      }
    })
  );

  // Guarantee clean imageUrls
  for (const a of articles) {
    if (a.imageUrl && isPlaceholderOrCorruptedImage(a.imageUrl)) {
      a.imageUrl = null;
    }
  }

  return articles;
}

// Backward-compatible alias
export const enrichArticleImages = enrichArticles;
