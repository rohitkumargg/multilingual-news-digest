/**
 * MND — Multilingual News Digest
 * POST /api/translate
 * 
 * Server-side translation endpoint.
 * Accepts:
 *  - { text: string, targetLanguage: string }
 *  - { texts: string[], targetLanguage: string }
 *  - { articles: Array<{ id, title, summary }>, targetLanguage: string }
 * 
 * Validates request body and restricts target languages to allowed Indian languages only.
 */

import { NextResponse } from 'next/server';
import { translateText, translateBatch } from '@/lib/translate';
import { isValidLanguageCode, SUPPORTED_LANGUAGES } from '@/lib/languages';

export async function POST(request) {
  try {
    const body = await request.json();
    const { text, texts, articles, targetLanguage } = body;

    // Validate target language
    if (!targetLanguage || typeof targetLanguage !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'targetLanguage is required.',
          supportedLanguages: SUPPORTED_LANGUAGES.map((l) => l.code),
        },
        { status: 400 }
      );
    }

    const cleanTargetLang = targetLanguage.toLowerCase().trim();

    if (!isValidLanguageCode(cleanTargetLang)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid target language: '${targetLanguage}'. Only supported Indian languages are allowed.`,
          supportedLanguages: SUPPORTED_LANGUAGES.map((l) => l.code),
        },
        { status: 400 }
      );
    }

    // If English, return original input
    if (cleanTargetLang === 'en') {
      if (text !== undefined) {
        return NextResponse.json({ success: true, translatedText: text, targetLanguage: 'en' });
      }
      if (Array.isArray(texts)) {
        return NextResponse.json({ success: true, translatedTexts: texts, targetLanguage: 'en' });
      }
      if (Array.isArray(articles)) {
        return NextResponse.json({ success: true, translatedArticles: articles, targetLanguage: 'en' });
      }
    }

    // 1. Articles batch mode
    if (Array.isArray(articles)) {
      // Flatten only needed card fields (title, summary, highlights[1..]) and deduplicate identical strings
      const uniqueTexts = [];
      const textToUniqueIdx = new Map();
      const targetMappings = []; // targetMappings[uIdx] = array of { index, field, hIdx }

      function registerText(val, target) {
        if (!val || typeof val !== 'string') return;
        const trimmed = val.trim();
        if (!trimmed) return;

        let uIdx = textToUniqueIdx.get(trimmed);
        if (uIdx === undefined) {
          uIdx = uniqueTexts.length;
          textToUniqueIdx.set(trimmed, uIdx);
          uniqueTexts.push(trimmed);
          targetMappings.push([]);
        }
        targetMappings[uIdx].push(target);
      }

      articles.forEach((art, index) => {
        if (art.title) {
          registerText(art.title, { index, field: 'title' });
        }

        const hasUsableSummary = Boolean(
          art.summary && typeof art.summary === 'string' && art.summary.trim().length > 0
        );

        if (hasUsableSummary) {
          registerText(art.summary, { index, field: 'summary' });
        } else if (art.snippet && typeof art.snippet === 'string' && art.snippet.trim().length > 0) {
          // Translate snippet ONLY when article does not have a usable summary
          registerText(art.snippet, { index, field: 'snippet' });
        }

        // Do NOT send fullStory for initial translation
        // Include highlights: highlights[0] reuses title translation without extra API requests
        if (Array.isArray(art.highlights)) {
          art.highlights.forEach((h, hIdx) => {
            if (hIdx === 0) {
              const textToUse = art.title || h;
              if (textToUse) {
                registerText(textToUse, { index, field: 'highlights', hIdx });
              }
              return;
            }
            if (h) {
              registerText(h, { index, field: 'highlights', hIdx });
            }
          });
        }
      });

      const translatedUniqueItems = await translateBatch(uniqueTexts, cleanTargetLang);

      // Clone original articles, preserving original English fullStory
      const translatedArticles = articles.map((a) => ({
        ...a,
        highlights: Array.isArray(a.highlights) ? [...a.highlights] : [],
      }));

      // Map translated results back to every place where that string occurred
      targetMappings.forEach((targets, uIdx) => {
        const translated = translatedUniqueItems[uIdx];
        if (!translated) return;

        targets.forEach(({ index, field, hIdx }) => {
          if (field === 'highlights') {
            translatedArticles[index].highlights[hIdx] = translated;
          } else {
            translatedArticles[index][field] = translated;
          }
        });
      });

      return NextResponse.json({
        success: true,
        targetLanguage: cleanTargetLang,
        translatedArticles,
      });
    }

    // 2. Texts array mode
    if (Array.isArray(texts)) {
      // Step 1 & 2: Validate and deduplicate `texts`, building `uniqueTexts` and `occurrenceIndices`
      const uniqueTexts = [];
      const textToUniqueIdx = new Map();
      const occurrenceIndices = [];

      texts.forEach((t) => {
        if (!t || typeof t !== 'string') {
          occurrenceIndices.push(-1);
          return;
        }
        const trimmed = t.trim();
        if (!trimmed) {
          occurrenceIndices.push(-1);
          return;
        }
        let uIdx = textToUniqueIdx.get(trimmed);
        if (uIdx === undefined) {
          uIdx = uniqueTexts.length;
          textToUniqueIdx.set(trimmed, uIdx);
          uniqueTexts.push(trimmed);
        }
        occurrenceIndices.push(uIdx);
      });

      if (uniqueTexts.length === 0) {
        return NextResponse.json({
          success: true,
          targetLanguage: cleanTargetLang,
          translatedTexts: texts,
        });
      }

      // Step 3: Call translateBatch(uniqueTexts, cleanTargetLang) exactly once
      const translatedUnique = await translateBatch(uniqueTexts, cleanTargetLang);

      // Step 4: Reconstruct translatedTexts using occurrenceIndices
      const translatedTexts = texts.map((original, i) => {
        const uIdx = occurrenceIndices[i];
        if (uIdx === -1 || uIdx === undefined) return original;
        return translatedUnique[uIdx] || original;
      });

      // Step 5: Return the result
      return NextResponse.json({
        success: true,
        targetLanguage: cleanTargetLang,
        translatedTexts,
      });
    }

    // 3. Single text mode
    if (typeof text === 'string') {
      const translatedText = await translateText(text, cleanTargetLang);
      return NextResponse.json({
        success: true,
        targetLanguage: cleanTargetLang,
        translatedText,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Request body must contain text, texts, or articles.' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[API /api/translate] Unhandled error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process translation request.' },
      { status: 500 }
    );
  }
}
