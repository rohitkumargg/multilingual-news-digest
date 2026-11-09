import { NextResponse } from 'next/server';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, saved_articles } from '@/lib/schema';
import { stableArticleId } from '@/lib/articleId';
import { CATEGORIES } from '@/lib/constants';

const VALID_CATEGORIES = new Set([
  ...CATEGORIES.map((c) => c.id),
  'general',
  'national',
]);

const MAX_SAVED_ARTICLES_PER_USER = 500;

/**
 * GET /api/user/saved
 * List saved articles for the authenticated user with pagination.
 * Query params: ?page=1&limit=20
 */
export async function GET(request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please sign in to view saved articles.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const pageParam = parseInt(searchParams.get('page') || '1', 10);
    const limitParam = parseInt(searchParams.get('limit') || '20', 10);

    const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
    const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;
    const offset = (page - 1) * limit;

    // 1. Get total count for the user
    const totalResult = await db
      .select({ value: count() })
      .from(saved_articles)
      .where(eq(saved_articles.user_id, userId));
    const total = Number(totalResult[0]?.value || 0);

    // 2. Fetch paginated saved articles
    const rows = await db
      .select()
      .from(saved_articles)
      .where(eq(saved_articles.user_id, userId))
      .orderBy(desc(saved_articles.saved_at))
      .limit(limit)
      .offset(offset);

    const articles = rows.map((row) => ({
      stableId: row.article_stable_id,
      link: row.article_link,
      title: row.article_title,
      source: row.article_source,
      imageUrl: row.article_image_url,
      summary: row.article_summary,
      category: row.article_category,
      pubDate: row.article_pub_date ? row.article_pub_date.toISOString() : null,
      savedAt: row.saved_at ? row.saved_at.toISOString() : null,
    }));

    return NextResponse.json(
      {
        articles,
        total,
        page,
        limit,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Saved Articles API] Error listing saved articles:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve saved articles. Please try again.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/saved
 * Save an article snapshot for the authenticated user.
 * Enforces ownership, URL validation, stable ID recomputation, and 500 article cap.
 */
export async function POST(request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please sign in to save articles.' },
        { status: 401 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body.' },
        { status: 400 }
      );
    }

    const {
      stableId,
      link,
      title,
      source,
      imageUrl,
      summary,
      category,
      pubDate,
    } = body || {};

    // 1. Validate required fields
    if (!stableId || typeof stableId !== 'string' || !stableId.trim()) {
      return NextResponse.json(
        { success: false, error: 'Article stableId is required.' },
        { status: 400 }
      );
    }

    if (!link || typeof link !== 'string' || !link.trim()) {
      return NextResponse.json(
        { success: false, error: 'Article link URL is required.' },
        { status: 400 }
      );
    }

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json(
        { success: false, error: 'Article title is required.' },
        { status: 400 }
      );
    }

    // 2. Strict URL validation (§13, §15)
    let parsedUrl;
    try {
      parsedUrl = new URL(link.trim());
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return NextResponse.json(
          { success: false, error: 'Invalid article URL format.' },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid article URL format.' },
        { status: 400 }
      );
    }

    // 3. Independent server-side stable ID recomputation and verification (§13, §15, §23 Rule 7)
    const expectedId = stableArticleId({ link });
    if (!expectedId || expectedId !== stableId.trim()) {
      return NextResponse.json(
        { success: false, error: 'Invalid article identifier.' },
        { status: 400 }
      );
    }

    // 4. Validate category if provided
    let normalizedCategory = category ? String(category).trim().toLowerCase() : null;
    if (normalizedCategory && !VALID_CATEGORIES.has(normalizedCategory)) {
      normalizedCategory = 'general';
    }

    // Parse pubDate
    let parsedPubDate = null;
    if (pubDate) {
      const d = new Date(pubDate);
      if (!isNaN(d.getTime())) {
        parsedPubDate = d;
      }
    }

    // 5. Concurrency-safe atomic transaction (§13, §14, §15, Approved Decision D)
    // Acquire a row-level lock on the user's row in users table to serialize concurrent saves per user
    const result = await db.transaction(async (tx) => {
      // 5a. Lock authenticated user's row
      const userRows = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .for('update');

      if (!userRows || userRows.length === 0) {
        return {
          status: 404,
          data: { success: false, error: 'User account not found.' },
        };
      }

      // 5b. Check if article is already saved by this user (Idempotent 200 response)
      const existing = await tx
        .select({ id: saved_articles.id })
        .from(saved_articles)
        .where(
          and(
            eq(saved_articles.user_id, userId),
            eq(saved_articles.article_stable_id, expectedId)
          )
        )
        .limit(1);

      if (existing && existing.length > 0) {
        return {
          status: 200,
          data: { success: true, alreadySaved: true },
        };
      }

      // 5c. Enforce maximum 500 saved articles per account
      const totalCountResult = await tx
        .select({ value: count() })
        .from(saved_articles)
        .where(eq(saved_articles.user_id, userId));
      const currentCount = Number(totalCountResult[0]?.value || 0);

      if (currentCount >= MAX_SAVED_ARTICLES_PER_USER) {
        return {
          status: 400,
          data: {
            success: false,
            error:
              'Maximum limit of 500 saved articles reached. Remove older saved articles to bookmark new ones.',
          },
        };
      }

      // 5d. Insert the article snapshot into database
      const inserted = await tx
        .insert(saved_articles)
        .values({
          user_id: userId,
          article_stable_id: expectedId,
          article_link: link.trim(),
          article_title: title.trim(),
          article_source: source ? String(source).trim() : null,
          article_image_url: imageUrl ? String(imageUrl).trim() : null,
          article_summary: summary ? String(summary).trim() : null,
          article_category: normalizedCategory,
          article_pub_date: parsedPubDate,
        })
        .onConflictDoNothing({
          target: [saved_articles.user_id, saved_articles.article_stable_id],
        })
        .returning({
          savedAt: saved_articles.saved_at,
        });

      if (!inserted || inserted.length === 0) {
        // Handled concurrent duplicate save race safely
        return {
          status: 200,
          data: { success: true, alreadySaved: true },
        };
      }

      return {
        status: 201,
        data: {
          success: true,
          savedAt: inserted[0].savedAt.toISOString(),
        },
      };
    });

    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error('[Saved Articles API] Error saving article:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save article. Please try again.' },
      { status: 500 }
    );
  }
}
