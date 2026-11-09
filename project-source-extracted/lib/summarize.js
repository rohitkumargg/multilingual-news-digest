/**
 * MND — Multilingual News Digest
 * Server-side News Summarization Utility.
 * 
 * Transforms raw RSS snippets, article content, and titles into:
 * 1. Concise, factual 2–4 sentence (~40–80 words) summaries for cards
 * 2. Key highlight bullet points for quick takeaways
 * 3. In-depth 2–3 paragraph synthesized story for in-website reading
 * 
 * Supports configurable LLM provider (Google Gemini) via server environment variables,
 * with an intelligent, deduplicated algorithmic summarizer when no API key is present or on API failure.
 * 
 * Strict rule: No AI disclosures or provider branding in output text or metadata.
 */

import crypto from 'crypto';

// ─── In-memory Cache ─────────────────────────────────────────────────────────

const summaryCache = new Map();
const SUMMARY_CACHE_TTL = 60 * 60 * 1000; // 1 hour

function getCacheKey(article) {
  const base = article.id || `${article.title || ''}_${(article.snippet || '').slice(0, 50)}`;
  const hash = crypto.createHash('md5').update(base).digest('hex');
  return `summary_v2_${hash}`;
}

// ─── Text Cleaning ───────────────────────────────────────────────────────────

/**
 * Clean up text from RSS artifacts, HTML entities, and Google News boilerplate.
 */
function cleanRawText(text) {
  if (!text) return '';
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/See more headlines and perspectives on Google News/gi, '')
    .replace(/View Full Coverage on Google News/gi, '')
    .replace(/Tap to read the full story about:\s*/gi, '')
    .replace(/Click here to read more/gi, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8216;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split text into clean, valid sentences.
 */
function splitIntoSentences(text) {
  if (!text) return [];
  return text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => {
      if (s.length < 20) return false;
      const lower = s.toLowerCase();
      if (
        lower.startsWith('tap to read') ||
        lower.startsWith('view full') ||
        lower.startsWith('click here') ||
        lower.startsWith('subscribe') ||
        lower.startsWith('follow us') ||
        lower.startsWith('first published') ||
        lower.startsWith('photo credit')
      ) {
        return false;
      }
      return true;
    });
}

// ─── Algorithmic Fallback Summarizer ─────────────────────────────────────────

/**
 * Produces a clean, factual, concise summary, key highlights, and in-depth story
 * from the imported news source data without inventing details.
 */
export function createFallbackDigest(article) {
  const title = cleanRawText(article?.title || '');
  const snippet = cleanRawText(article?.snippet || '');
  const bodyText = cleanRawText(article?.bodyText || '');
  const metaDesc = cleanRawText(article?.metaDesc || '');

  // 1. Gather all candidate sentences from bodyText, metaDesc, snippet
  const combinedText = `${bodyText} ${metaDesc} ${snippet}`.trim();
  const rawSentences = splitIntoSentences(combinedText);

  // 2. Filter out sentences that duplicate the headline or each other
  const uniqueSentences = [];
  const titleWords = new Set(
    title.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter((w) => w.length > 3)
  );

  for (const s of rawSentences) {
    const sWords = s.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter((w) => w.length > 3);
    if (sWords.length === 0) continue;

    // Check overlap with title
    let overlapWithTitle = 0;
    for (const w of sWords) {
      if (titleWords.has(w)) overlapWithTitle++;
    }
    // Skip if it almost entirely mirrors the title
    if (sWords.length > 0 && overlapWithTitle / sWords.length > 0.75) {
      continue;
    }

    // Check overlap with already chosen sentences
    let isDuplicate = false;
    for (const chosen of uniqueSentences) {
      const chosenWords = new Set(
        chosen.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter((w) => w.length > 3)
      );
      let matchCount = 0;
      for (const w of sWords) {
        if (chosenWords.has(w)) matchCount++;
      }
      if (sWords.length > 0 && matchCount / sWords.length > 0.65) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      uniqueSentences.push(s);
    }
  }

  // 3. Construct concise 2-3 sentence card summary (~40-80 words)
  let leadSentence = title;
  if (!/[.?!]$/.test(leadSentence)) {
    leadSentence += '.';
  }

  const cardSentences = [leadSentence];
  let currentWordsCount = leadSentence.split(/\s+/).length;

  for (const s of uniqueSentences) {
    if (cardSentences.length >= 3) break;
    let formatted = s.trim();
    if (!/[.?!]$/.test(formatted)) formatted += '.';
    const sentenceWordCount = formatted.split(/\s+/).length;

    // Only add sentence if total word count stays under 90 words, or if we need at least 2 sentences
    if (cardSentences.length < 2 || (currentWordsCount + sentenceWordCount <= 90)) {
      cardSentences.push(formatted);
      currentWordsCount += sentenceWordCount;
    }
  }

  const summary = cardSentences.join(' ').trim();

  // 4. Construct Key Highlights (2 to 4 bullet points)
  const highlights = [];
  if (title) {
    highlights.push(title.replace(/[.?!]$/, ''));
  }
  for (const s of uniqueSentences) {
    if (highlights.length >= 4) break;
    highlights.push(s.replace(/[.?!]$/, ''));
  }

  // 5. Construct In-Depth Full Story (2-3 paragraphs for in-website reader)
  const paragraphs = [];
  // First paragraph: Lead and immediate context
  paragraphs.push(summary);

  // Second paragraph: Deeper facts or quotes from article
  if (uniqueSentences.length >= 3) {
    const p2Sentences = uniqueSentences.slice(2, 6).map((s) => (/[.?!]$/.test(s) ? s : `${s}.`));
    if (p2Sentences.length > 0) {
      paragraphs.push(p2Sentences.join(' '));
    }
  } else if (bodyText && bodyText !== snippet && bodyText.length > 80) {
    // If we have extra body text from source
    const bodySentences = splitIntoSentences(bodyText).filter((s) => !uniqueSentences.includes(s));
    if (bodySentences.length > 0) {
      paragraphs.push(bodySentences.slice(0, 3).join(' '));
    }
  }

  const fullStory = paragraphs.join('\n\n');

  return {
    summary,
    highlights,
    fullStory,
  };
}

// ─── Gemini Summarizer ───────────────────────────────────────────────────────

/**
 * Call Gemini API on server side to generate a structured news digest.
 */
async function generateGeminiDigest(article) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const title = article.title || '';
  const details = `${article.bodyText || ''} ${article.snippet || ''} ${article.metaDesc || ''}`.trim();

  const prompt = `You are an editor for an Indian news digest website.
Summarize the following news report into a JSON object based ONLY on the provided title and details.
Do NOT invent details. Do NOT mention AI or models.

Title: ${title}
Details: ${details}

Return ONLY a valid JSON object matching this schema:
{
  "summary": "Concise 2 to 3 sentence news summary (40 to 75 words) suitable for a news card.",
  "highlights": ["3 to 4 concise bullet point highlights of key facts or outcomes"],
  "fullStory": "A 2 to 3 paragraph in-depth narrative report (100 to 180 words) providing context and development."
}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500); // 4.5s timeout

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 350,
          responseMimeType: 'application/json',
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[Summarize] Gemini API returned status ${res.status}`);
      return null;
    }

    const data = await res.json();
    const candidate = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidate) return null;

    const parsed = JSON.parse(candidate);
    if (parsed && parsed.summary && typeof parsed.summary === 'string') {
      return {
        summary: parsed.summary.trim(),
        highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [title],
        fullStory: parsed.fullStory || parsed.summary,
      };
    }

    return null;
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn('[Summarize] Gemini digest error or timeout, falling back:', err.message);
    return null;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Summarize a single article. Uses in-memory cache, then Gemini API,
 * then algorithmic fallback. Never fails or crashes.
 *
 * @param {Object} article - Article object
 * @returns {Promise<Object>} { summary, highlights, fullStory }
 */
export async function getArticleDigest(article) {
  if (!article) {
    return { summary: '', highlights: [], fullStory: '' };
  }

  const cacheKey = getCacheKey(article);
  const cached = summaryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SUMMARY_CACHE_TTL) {
    return cached.digest;
  }

  let digest = null;

  // Try Gemini if API key is configured
  if (process.env.GEMINI_API_KEY) {
    digest = await generateGeminiDigest(article);
  }

  // If Gemini was not used or failed, use clean algorithmic digest
  if (!digest || !digest.summary) {
    digest = createFallbackDigest(article);
  }

  summaryCache.set(cacheKey, { digest, timestamp: Date.now() });
  return digest;
}

/**
 * Backward-compatible single article summarizer (returns summary string).
 */
export async function summarizeArticle(article) {
  const digest = await getArticleDigest(article);
  return digest.summary;
}

/**
 * Summarize an array of articles in parallel.
 * Populates article.summary, article.highlights, article.fullStory.
 *
 * @param {Array<Object>} articles - Array of article objects
 * @returns {Promise<Array<Object>>} Articles with summary fields populated
 */
export async function summarizeArticles(articles) {
  if (!Array.isArray(articles) || articles.length === 0) {
    return [];
  }

  const enriched = await Promise.all(
    articles.map(async (article) => {
      try {
        const digest = await getArticleDigest(article);
        return {
          ...article,
          summary: digest.summary,
          highlights: digest.highlights,
          fullStory: digest.fullStory,
        };
      } catch (err) {
        console.warn(`[Summarize] Failed for article ${article.id}:`, err);
        const fallback = createFallbackDigest(article);
        return {
          ...article,
          summary: fallback.summary,
          highlights: fallback.highlights,
          fullStory: fallback.fullStory,
        };
      }
    })
  );

  return enriched;
}
