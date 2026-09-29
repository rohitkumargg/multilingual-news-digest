/**
 * MND — Multilingual News Digest
 * POST /api/summarize
 * 
 * Server-side summarization endpoint.
 * Accepts:
 *  - { title: string, snippet: string, id?: string }
 *  - { articles: Array<{ id, title, snippet }> }
 * 
 * Generates concise 2–4 sentence (~40–80 words) summaries.
 * Never outputs AI or model branding.
 */

import { NextResponse } from 'next/server';
import { summarizeArticle, summarizeArticles } from '@/lib/summarize';

export async function POST(request) {
  try {
    const body = await request.json();
    const { title, snippet, id, articles } = body;

    // Batch mode
    if (Array.isArray(articles)) {
      if (articles.length === 0) {
        return NextResponse.json({ success: true, articles: [] });
      }

      const summarized = await summarizeArticles(articles);
      return NextResponse.json({
        success: true,
        count: summarized.length,
        articles: summarized,
      });
    }

    // Single article mode
    if (title || snippet) {
      const summary = await summarizeArticle({ id: id || 'adhoc', title: title || '', snippet: snippet || '' });
      return NextResponse.json({
        success: true,
        summary,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Request body must contain title/snippet or articles array.' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[API /api/summarize] Unhandled error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate summary.' },
      { status: 500 }
    );
  }
}
