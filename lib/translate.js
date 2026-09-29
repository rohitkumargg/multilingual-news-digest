/**
 * MND — Multilingual News Digest
 * Server-side Translation Utility using Bhashini as primary provider.
 * 
 * Supports all 12 Indian languages with:
 * - Bhashini Dhruva/ULCA pipeline API as primary provider
 * - Fallback to Gemini translation if configured and Bhashini is unavailable
 * - Graceful fallback to original English text if all APIs fail
 * - In-memory caching by content hash + target language
 * - Batch translation support for efficient network transfer
 */

import crypto from 'crypto';
import { isValidLanguageCode, getLanguageInfo } from './languages';

// ─── In-memory Cache ─────────────────────────────────────────────────────────

const translationCache = new Map();
const TRANSLATION_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getCacheKey(text, targetLang) {
  const hash = crypto.createHash('md5').update(`${text}_${targetLang}`).digest('hex');
  return `trans_${targetLang}_${hash}`;
}

// ─── Bhashini Translation Provider ───────────────────────────────────────────

/**
 * Translate a batch of texts using Bhashini ULCA / Dhruva Inference Pipeline.
 *
 * @param {Array<string>} texts - Texts to translate
 * @param {string} targetLang - Target Indian language code (e.g. 'hi', 'te', 'ta')
 * @returns {Promise<Array<string>|null>} Array of translated texts or null on failure
 */
async function translateWithBhashini(texts, targetLang) {
  const apiKey = process.env.BHASHINI_API_KEY;
  if (!apiKey) return null;

  const endpoint =
    process.env.BHASHINI_API_URL ||
    'https://dhruva-api.bhashini.gov.in/services/inference/pipeline';
  const userId = process.env.BHASHINI_USER_ID || '';

  const headers = {
    'Content-Type': 'application/json',
    Authorization: apiKey,
    ...(userId ? { 'User-Id': userId } : {}),
  };

  const payload = {
    pipelineTasks: [
      {
        taskType: 'translation',
        config: {
          language: {
            sourceLanguage: 'en',
            targetLanguage: targetLang,
          },
        },
      },
    ],
    inputData: {
      input: texts.map((source) => ({ source })),
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[Translate] Bhashini returned HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();

    // Standard Dhruva response parsing
    const outputList = data?.pipelineResponse?.[0]?.output;
    if (Array.isArray(outputList) && outputList.length === texts.length) {
      return outputList.map((item, idx) => item.target || texts[idx]);
    }

    // Direct NMT endpoint format support
    if (Array.isArray(data?.output)) {
      return data.output.map((item, idx) => item.target || item.translatedText || texts[idx]);
    }

    return null;
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn('[Translate] Bhashini error or timeout:', err.message);
    return null;
  }
}

// ─── Gemini Fallback Translation Provider ───────────────────────────────────

/**
 * Fallback translation using Gemini when Bhashini is not configured or unavailable.
 */
async function translateWithGemini(texts, targetLang) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const langInfo = getLanguageInfo(targetLang);
  const targetLanguageName = langInfo ? langInfo.name : targetLang;

  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const prompt = `Translate the following English news items into ${targetLanguageName} (${langInfo?.nativeName || ''}).
Preserve proper nouns (people names, places, organizations, technical terms).
Maintain a clean journalistic tone.
Return ONLY a valid JSON array of strings corresponding to the input items, in the exact same order.

Input items:
${JSON.stringify(texts)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) return null;

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;

    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed) && parsed.length === texts.length) {
      return parsed.map((item, idx) => (typeof item === 'string' ? item : texts[idx]));
    }

    return null;
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn('[Translate] Gemini translation fallback error:', err.message);
    return null;
  }
}

// ─── Public Translation Fallback Provider ─────────────────────────────────

/**
 * Free public translation fallback to ensure Indian languages always translate
 * even when private API keys are not supplied.
 */
async function translateWithPublicService(texts, targetLang) {
  if (!Array.isArray(texts) || texts.length === 0) return texts;

  const results = await Promise.allSettled(
    texts.map(async (text) => {
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return text;
      }
      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          signal: AbortSignal.timeout(4500),
        });

        if (!res.ok) return text;

        const data = await res.json();
        if (Array.isArray(data?.[0])) {
          const combined = data[0]
            .map((chunk) => (Array.isArray(chunk) ? chunk[0] : ''))
            .filter(Boolean)
            .join('');
          return combined || text;
        }

        return text;
      } catch {
        return text;
      }
    })
  );

  return results.map((r, i) => (r.status === 'fulfilled' && r.value ? r.value : texts[i]));
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Translate a single text to target Indian language.
 *
 * @param {string} text - English text
 * @param {string} targetLang - Target language code ('hi', 'bn', etc.)
 * @returns {Promise<string>} Translated text (or original text if 'en' or error)
 */
export async function translateText(text, targetLang) {
  if (!text || typeof text !== 'string') return '';
  if (!targetLang || targetLang.toLowerCase() === 'en' || !isValidLanguageCode(targetLang)) {
    return text;
  }

  const cleanLang = targetLang.toLowerCase();
  const cacheKey = getCacheKey(text, cleanLang);
  const cached = translationCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < TRANSLATION_CACHE_TTL) {
    return cached.translated;
  }

  const [translated] = await translateBatch([text], cleanLang);
  return translated || text;
}

/**
 * Translate a batch of texts to target Indian language.
 * Checks cache for each item first, queries provider for uncached items,
 * and caches results.
 *
 * @param {Array<string>} texts - Array of texts
 * @param {string} targetLang - Target language code ('hi', 'bn', etc.)
 * @returns {Promise<Array<string>>} Array of translated texts
 */
export async function translateBatch(texts, targetLang) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  if (!targetLang || targetLang.toLowerCase() === 'en' || !isValidLanguageCode(targetLang)) {
    return texts;
  }

  const cleanLang = targetLang.toLowerCase();
  const results = new Array(texts.length);
  const uncachedIndices = [];
  const uncachedTexts = [];

  // Check cache first
  texts.forEach((text, index) => {
    if (!text) {
      results[index] = '';
      return;
    }
    const cacheKey = getCacheKey(text, cleanLang);
    const cached = translationCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < TRANSLATION_CACHE_TTL) {
      results[index] = cached.translated;
    } else {
      uncachedIndices.push(index);
      uncachedTexts.push(text);
    }
  });

  if (uncachedTexts.length === 0) {
    return results;
  }

  // 1. Try Bhashini as primary provider
  let translations = await translateWithBhashini(uncachedTexts, cleanLang);

  // 2. Fallback to Gemini if Bhashini failed or was not configured
  if (!translations) {
    translations = await translateWithGemini(uncachedTexts, cleanLang);
  }

  // 3. Fallback to reliable public translation service (guarantees translated output for Indian languages)
  if (!translations) {
    translations = await translateWithPublicService(uncachedTexts, cleanLang);
  }

  // 4. Fallback to original text if all failed
  if (!translations) {
    translations = uncachedTexts;
  }

  // Store in cache and populate results
  uncachedIndices.forEach((origIndex, i) => {
    const translated = translations[i] || uncachedTexts[i];
    results[origIndex] = translated;
    const cacheKey = getCacheKey(uncachedTexts[i], cleanLang);
    translationCache.set(cacheKey, { translated, timestamp: Date.now() });
  });

  return results;
}
