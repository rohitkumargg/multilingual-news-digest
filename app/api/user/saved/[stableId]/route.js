import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { saved_articles } from '@/lib/schema';

/**
 * DELETE /api/user/saved/[stableId]
 * Removes a saved article for the authenticated user.
 * Enforces ownership: only deletes records where user_id matches session user.
 */
export async function DELETE(request, { params }) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please sign in to manage saved articles.' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const stableId = resolvedParams?.stableId?.trim();

    if (!stableId || typeof stableId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid article identifier.' },
        { status: 400 }
      );
    }

    const deleted = await db
      .delete(saved_articles)
      .where(
        and(
          eq(saved_articles.user_id, userId),
          eq(saved_articles.article_stable_id, stableId)
        )
      )
      .returning({ id: saved_articles.id });

    if (!deleted || deleted.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Article not found in saved list.' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Saved Articles API] Error deleting saved article:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete saved article. Please try again.' },
      { status: 500 }
    );
  }
}
