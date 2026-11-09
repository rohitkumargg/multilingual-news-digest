import { NextResponse } from 'next/server';
import { eq, count } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, user_streaks, saved_articles } from '@/lib/schema';

/**
 * GET /api/user/profile
 * Returns profile details for the authenticated user:
 * email, account creation date, login streaks, and saved articles count.
 */
export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please sign in to view your profile.' },
        { status: 401 }
      );
    }

    // 1. Fetch user account details
    const userRows = await db
      .select({
        email: users.email,
        createdAt: users.created_at,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRows || userRows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'User account not found.' },
        { status: 404 }
      );
    }

    const user = userRows[0];

    // 2. Fetch user streak details (if initialized)
    const streakRows = await db
      .select({
        currentStreak: user_streaks.current_streak,
        longestStreak: user_streaks.longest_streak,
        lastLoginDate: user_streaks.last_login_date,
      })
      .from(user_streaks)
      .where(eq(user_streaks.user_id, userId))
      .limit(1);

    const streak = streakRows[0] || {
      currentStreak: 0,
      longestStreak: 0,
      lastLoginDate: null,
    };

    // 3. Count user's saved articles
    const savedCountResult = await db
      .select({ value: count() })
      .from(saved_articles)
      .where(eq(saved_articles.user_id, userId));

    const savedCount = Number(savedCountResult[0]?.value || 0);

    return NextResponse.json(
      {
        email: user.email,
        createdAt: user.createdAt.toISOString(),
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        lastLoginDate: streak.lastLoginDate,
        savedCount,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Profile API] Error fetching profile:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve profile data. Please try again.' },
      { status: 500 }
    );
  }
}
