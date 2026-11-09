/**
 * MND — API route for fetching news.
 * GET /api/news?category=sports&state=all&lang=en
 *
 * Fetches from Google News RSS and Indian publisher feeds,
 * filters with content-based categorization (Task 3),
 * deduplicates, sorts by date, enriches missing images via og:image,
 * generates concise factual summaries (Task 2),
 * and optionally translates to requested Indian language (Task 1).
 */

import { NextResponse } from 'next/server';
import { fetchRssCached, enrichArticleImages } from '@/lib/rss';
import { CATEGORY_KEYWORDS, MAX_ARTICLES_PER_CATEGORY, isPlaceholderOrCorruptedImage } from '@/lib/constants';
import { classifyArticle, verifyArticleCategory } from '@/lib/categorize';
import { summarizeArticles } from '@/lib/summarize';
import { translateBatch } from '@/lib/translate';
import { isValidLanguageCode } from '@/lib/languages';

// ─── Google News URL builders & Date Range Resolution ────────────────────────

function resolveDateRange(dateParam) {
  if (!dateParam || dateParam === 'today' || dateParam === 'latest') {
    return { isBackDate: false, dateSuffix: '+when:2d', targetYmd: null };
  }

  const now = new Date();
  let target = new Date(now);

  if (dateParam === 'yesterday') {
    target.setDate(target.getDate() - 1);
  } else if (dateParam === '2days') {
    target.setDate(target.getDate() - 2);
  } else if (dateParam === '3days') {
    target.setDate(target.getDate() - 3);
  } else if (dateParam === 'week') {
    return { isBackDate: true, dateSuffix: '+when:7d', targetYmd: null };
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    const parsed = new Date(dateParam);
    if (!isNaN(parsed.getTime())) target = parsed;
  }

  const targetYmd = target.toISOString().slice(0, 10);
  const nextDay = new Date(target);
  nextDay.setDate(nextDay.getDate() + 1);
  const prevDay = new Date(target);
  prevDay.setDate(prevDay.getDate() - 1);

  const beforeStr = nextDay.toISOString().slice(0, 10);
  const afterStr = prevDay.toISOString().slice(0, 10);

  return {
    isBackDate: true,
    dateSuffix: `+before:${beforeStr}+after:${afterStr}`,
    targetYmd,
  };
}

function buildGoogleNewsUrl(query, dateParam = 'today') {
  const { dateSuffix } = resolveDateRange(dateParam);
  const encoded = encodeURIComponent(query);
  return `https://news.google.com/rss/search?q=${encoded}${dateSuffix}&hl=en-IN&gl=IN&ceid=IN:en`;
}

function buildGoogleNewsGeoUrl(state) {
  const encoded = encodeURIComponent(state);
  return `https://news.google.com/rss/headlines/section/geo/${encoded}?hl=en-IN&gl=IN&ceid=IN:en`;
}

// ─── State-specific publisher feeds ──────────────────────────────────────────

const STATE_PUBLISHER_FEEDS = {
  'Telangana': [
    { url: 'https://www.thehindu.com/news/national/telangana/feeder/default.rss', source: 'The Hindu' },
    { url: 'https://indianexpress.com/section/cities/hyderabad/feed/', source: 'Indian Express' },
  ],
  'Andhra Pradesh': [
    { url: 'https://www.thehindu.com/news/national/andhra-pradesh/feeder/default.rss', source: 'The Hindu' },
  ],
  'Karnataka': [
    { url: 'https://www.thehindu.com/news/national/karnataka/feeder/default.rss', source: 'The Hindu' },
    { url: 'https://indianexpress.com/section/cities/bangalore/feed/', source: 'Indian Express' },
  ],
  'Tamil Nadu': [
    { url: 'https://www.thehindu.com/news/national/tamil-nadu/feeder/default.rss', source: 'The Hindu' },
    { url: 'https://indianexpress.com/section/cities/chennai/feed/', source: 'Indian Express' },
  ],
  'Kerala': [
    { url: 'https://www.thehindu.com/news/national/kerala/feeder/default.rss', source: 'The Hindu' },
  ],
  'Maharashtra': [
    { url: 'https://indianexpress.com/section/cities/mumbai/feed/', source: 'Indian Express' },
    { url: 'https://indianexpress.com/section/cities/pune/feed/', source: 'Indian Express' },
  ],
  'Delhi': [
    { url: 'https://www.thehindu.com/news/cities/Delhi/feeder/default.rss', source: 'The Hindu' },
    { url: 'https://indianexpress.com/section/cities/delhi/feed/', source: 'Indian Express' },
  ],
  'West Bengal': [
    { url: 'https://www.thehindu.com/news/cities/kolkata/feeder/default.rss', source: 'The Hindu' },
    { url: 'https://indianexpress.com/section/cities/kolkata/feed/', source: 'Indian Express' },
  ],
  'Uttar Pradesh': [
    { url: 'https://indianexpress.com/section/cities/lucknow/feed/', source: 'Indian Express' },
  ],
  'Gujarat': [
    { url: 'https://indianexpress.com/section/cities/ahmedabad/feed/', source: 'Indian Express' },
  ],
  'Rajasthan': [
    { url: 'https://indianexpress.com/section/cities/jaipur/feed/', source: 'Indian Express' },
  ],
  'Punjab': [
    { url: 'https://indianexpress.com/section/cities/chandigarh/feed/', source: 'Indian Express' },
  ],
  'Chandigarh': [
    { url: 'https://indianexpress.com/section/cities/chandigarh/feed/', source: 'Indian Express' },
  ],
  'Haryana': [
    { url: 'https://indianexpress.com/section/cities/chandigarh/feed/', source: 'Indian Express' },
  ],
  'Bihar': [
    { url: 'https://indianexpress.com/section/cities/patna/feed/', source: 'Indian Express' },
  ],
  'Jharkhand': [
    { url: 'https://indianexpress.com/section/cities/ranchi/feed/', source: 'Indian Express' },
  ],
};

// ─── Feed URL resolution ─────────────────────────────────────────────────────

function getFeedUrls(category, state, dateParam = 'today') {
  const isNational = !state || state === 'all';
  const keywords = CATEGORY_KEYWORDS[category] || category;
  const feeds = [];
  const { isBackDate } = resolveDateRange(dateParam);

  // If user requested a back date, query Google News search archive with the specific date range
  if (isBackDate) {
    const loc = isNational ? 'India' : state;
    feeds.push(
      { url: buildGoogleNewsUrl(`${loc} ${keywords}`, dateParam), source: 'Google News Archive', general: false },
      { url: buildGoogleNewsUrl(`${loc} ${category} news`, dateParam), source: 'Google News Archive', general: false }
    );
    return feeds;
  }

  if (isNational) {
    switch (category) {
      case 'business':
        feeds.push(
          { url: 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-IN&gl=IN&ceid=IN:en', source: 'Google News', general: false },
          { url: 'https://indianexpress.com/section/business/feed/', source: 'Indian Express', general: false },
          { url: 'https://www.thehindu.com/business/feeder/default.rss', source: 'The Hindu', general: false },
          { url: 'https://feeds.feedburner.com/ndtvprofit-latest', source: 'NDTV Profit', general: false }
        );
        break;
      case 'entertainment':
        feeds.push(
          { url: 'https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=en-IN&gl=IN&ceid=IN:en', source: 'Google News', general: false },
          { url: 'https://indianexpress.com/section/entertainment/feed/', source: 'Indian Express', general: false },
          { url: 'https://www.thehindu.com/entertainment/feeder/default.rss', source: 'The Hindu', general: false }
        );
        break;
      case 'sports':
        feeds.push(
          { url: 'https://news.google.com/rss/headlines/section/topic/SPORTS?hl=en-IN&gl=IN&ceid=IN:en', source: 'Google News', general: false },
          { url: 'https://indianexpress.com/section/sports/feed/', source: 'Indian Express', general: false },
          { url: 'https://www.thehindu.com/sport/feeder/default.rss', source: 'The Hindu', general: false },
          { url: 'https://feeds.feedburner.com/ndtvsports-latest', source: 'NDTV Sports', general: false }
        );
        break;
      case 'education':
        feeds.push(
          { url: buildGoogleNewsUrl('India education exam board university CBSE NEET JEE'), source: 'Google News', general: false },
          { url: 'https://indianexpress.com/section/education/feed/', source: 'Indian Express', general: false },
          { url: 'https://www.thehindu.com/education/feeder/default.rss', source: 'The Hindu', general: false }
        );
        break;
      case 'technology':
        feeds.push(
          { url: 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-IN&gl=IN&ceid=IN:en', source: 'Google News', general: false },
          { url: 'https://indianexpress.com/section/technology/feed/', source: 'Indian Express', general: false },
          { url: 'https://www.thehindu.com/sci-tech/technology/feeder/default.rss', source: 'The Hindu', general: false },
          { url: 'https://feeds.feedburner.com/gadgets360-latest', source: 'NDTV Gadgets', general: false }
        );
        break;
      case 'politics':
        feeds.push(
          { url: 'https://news.google.com/rss/headlines/section/topic/NATION?hl=en-IN&gl=IN&ceid=IN:en', source: 'Google News', general: false },
          { url: 'https://indianexpress.com/section/india/feed/', source: 'Indian Express', general: false },
          { url: 'https://www.thehindu.com/news/national/feeder/default.rss', source: 'The Hindu', general: false },
          { url: 'https://feeds.feedburner.com/ndtvnews-india-news', source: 'NDTV', general: false }
        );
        break;
      default:
        feeds.push(
          { url: buildGoogleNewsUrl(`India ${keywords}`), source: 'Google News', general: false }
        );
    }
  } else {
    // State-specific
    feeds.push({
      url: buildGoogleNewsUrl(`${state} ${keywords}`),
      source: 'Google News',
      general: false,
    });

    const publisherFeeds = STATE_PUBLISHER_FEEDS[state];
    if (publisherFeeds && publisherFeeds.length > 0) {
      publisherFeeds.forEach((f) =>
        feeds.push({ url: f.url, source: f.source, general: true })
      );
    }

    feeds.push({
      url: buildGoogleNewsGeoUrl(state),
      source: `${state} News`,
      general: true,
    });
  }

  return feeds;
}

// ─── Deduplication ───────────────────────────────────────────────────────────

function deduplicateArticles(articles) {
  const seen = new Set();
  return articles.filter((article) => {
    const key = article.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (key.length < 5) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── GET handler ─────────────────────────────────────────────────────────────

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const category = (searchParams.get('category') || '').toLowerCase();
  const state = searchParams.get('state') || 'all';
  const lang = (searchParams.get('lang') || 'en').toLowerCase();
  const dateParam = (searchParams.get('date') || 'today').toLowerCase();

  // Validate category
  const validCategories = ['politics', 'business', 'technology', 'sports', 'education', 'entertainment'];
  if (!category || !validCategories.includes(category)) {
    return NextResponse.json(
      { success: false, error: `Invalid category. Must be one of: ${validCategories.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const feedConfigs = getFeedUrls(category, state, dateParam);

    // Fetch all feeds in parallel with error resilience
    const results = await Promise.allSettled(
      feedConfigs.map(({ url, source }) =>
        fetchRssCached(url, source).catch((err) => {
          console.warn(`Failed to fetch ${source} (${url}):`, err.message);
          return [];
        })
      )
    );

    // Collect and filter articles
    let allArticles = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        let articles = result.value;

        // Apply content-based categorization check (TASK 3)
        // For general feeds, filter strictly to this category
        if (feedConfigs[index].general) {
          articles = articles.filter((article) => {
            const { categoryId } = classifyArticle(article);
            return categoryId === category;
          });
        }

        allArticles.push(...articles);
      }
    });

    // Content-level categorization verification (TASK 3):
    // Ensure all candidate articles match the target category definition
    allArticles = allArticles.filter((article) => verifyArticleCategory(article, category));

    // Deduplicate
    allArticles = deduplicateArticles(allArticles);

    // Filter to target date if requested
    const { targetYmd } = resolveDateRange(dateParam);
    if (targetYmd) {
      const matchingArticles = allArticles.filter((a) => {
        if (!a.pubDate) return true;
        const aYmd = new Date(a.pubDate).toISOString().slice(0, 10);
        return aYmd <= targetYmd;
      });
      if (matchingArticles.length > 0) {
        allArticles = matchingArticles;
      }
    }

    // Chronological arrangement: strictly arrange newest on top, older news below
    allArticles.sort((a, b) => {
      const dateA = new Date(a.pubDate).getTime();
      const dateB = new Date(b.pubDate).getTime();
      if (isNaN(dateA) && isNaN(dateB)) return 0;
      if (isNaN(dateA)) return 1;
      if (isNaN(dateB)) return -1;
      return dateB - dateA; // Descending: newest published at top, older below
    });

    // Limit to max articles per category
    const limited = allArticles.slice(0, MAX_ARTICLES_PER_CATEGORY);

    // Tag each article with its confirmed category
    limited.forEach((art) => {
      art.category = category;
    });

    // Enrich any remaining articles that have no image via og:image extraction
    await enrichArticleImages(limited);

    // Generate concise summaries (TASK 2)
    const summarizedArticles = await summarizeArticles(limited);

    // Optional on-the-fly translation if lang is an Indian language (TASK 1)
    let finalArticles = summarizedArticles;
    if (lang !== 'en' && isValidLanguageCode(lang)) {
      try {
        const textItems = [];
        const itemMap = [];

        summarizedArticles.forEach((art, index) => {
          if (art.title) {
            textItems.push(art.title);
            itemMap.push({ index, field: 'title' });
          }
          if (art.summary) {
            textItems.push(art.summary);
            itemMap.push({ index, field: 'summary' });
          }
          if (art.fullStory) {
            textItems.push(art.fullStory);
            itemMap.push({ index, field: 'fullStory' });
          }
          if (Array.isArray(art.highlights)) {
            art.highlights.forEach((h, hIdx) => {
              textItems.push(h);
              itemMap.push({ index, field: 'highlights', hIdx });
            });
          }
        });

        const translated = await translateBatch(textItems, lang);
        finalArticles = summarizedArticles.map((a) => ({
          ...a,
          highlights: Array.isArray(a.highlights) ? [...a.highlights] : [],
        }));

        itemMap.forEach(({ index, field, hIdx }, i) => {
          if (field === 'highlights') {
            finalArticles[index].highlights[hIdx] = translated[i] || summarizedArticles[index].highlights[hIdx];
          } else {
            finalArticles[index][field] = translated[i] || summarizedArticles[index][field];
          }
        });
      } catch (transErr) {
        console.warn(`[News API] Translation to ${lang} failed, using English fallback:`, transErr.message);
        finalArticles = summarizedArticles;
      }
    }

    // Ensure no corrupted, placeholder, or Google News self-logo images are returned
    finalArticles.forEach((art) => {
      if (art.imageUrl && isPlaceholderOrCorruptedImage(art.imageUrl)) {
        art.imageUrl = null;
      }
    });

    return NextResponse.json({
      success: true,
      category,
      state,
      lang,
      count: finalArticles.length,
      articles: finalArticles,
    });
  } catch (error) {
    console.error(`[MND API] Error fetching ${category} news for ${state}:`, error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch news. Please try again later.' },
      { status: 500 }
    );
  }
}
