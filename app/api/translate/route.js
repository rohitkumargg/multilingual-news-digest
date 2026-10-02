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
      // Flatten titles and summaries into a single list to translate efficiently
      const textItems = [];
      const itemMap = [];

      articles.forEach((art, index) => {
        if (art.title) {
          textItems.push(art.title);
          itemMap.push({ index, field: 'title' });
        }
        if (art.summary) {
          textItems.push(art.summary);
          itemMap.push({ index, field: 'summary' });
        }
        if (art.snippet) {
          textItems.push(art.snippet);
          itemMap.push({ index, field: 'snippet' });
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

      const translatedItems = await translateBatch(textItems, cleanTargetLang);

      // Clone original articles
      const translatedArticles = articles.map((a) => ({
        ...a,
        highlights: Array.isArray(a.highlights) ? [...a.highlights] : [],
      }));

      itemMap.forEach(({ index, field, hIdx }, i) => {
        if (field === 'highlights') {
          translatedArticles[index].highlights[hIdx] = translatedItems[i] || articles[index].highlights[hIdx];
        } else {
          translatedArticles[index][field] = translatedItems[i] || articles[index][field];
        }
      });

      return NextResponse.json({
        success: true,
        targetLanguage: cleanTargetLang,
        translatedArticles,
      });
    }

    // 2. Texts array mode
    if (Array.isArray(texts)) {
      const translatedTexts = await translateBatch(texts, cleanTargetLang);
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
