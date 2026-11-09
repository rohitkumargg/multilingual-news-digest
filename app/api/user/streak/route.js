import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { user_streaks } from '@/lib/schema';
import { currentCalendarDay, calculateStreakUpdate } from '@/lib/streakLogic';

export async function POST() {
  try {
    // 1. Authenticate request using server session
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please sign in to record streaks.' },
        { status: 401 }
      );
    }

    const today = currentCalendarDay();

    // 2. Phase 1: Atomically ensure user_streaks row exists (handles first-login safely)
    await db
      .insert(user_streaks)
      .values({
        user_id: userId,
        current_streak: 0,
        longest_streak: 0,
        last_login_date: null,
        today_counted: false,
      })
      .onConflictDoNothing({
        target: user_streaks.user_id,
      });

    // 3. Phase 2: Transaction with SELECT ... FOR UPDATE to serialize concurrent requests
    const result = await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(user_streaks)
        .where(eq(user_streaks.user_id, userId))
        .for('update');

      if (!rows || rows.length === 0) {
        throw new Error('User streak record not found after seed.');
      }

      const row = rows[0];

      const streakUpdate = calculateStreakUpdate({
        currentStreak: row.current_streak,
        longestStreak: row.longest_streak,
        lastLoginDate: row.last_login_date,
        todayCounted: row.today_counted,
        today,
      });

      // Only update database if streak changed (skip update if same_day idempotent)
      if (streakUpdate.type !== 'same_day') {
        await tx
          .update(user_streaks)
          .set({
            current_streak: streakUpdate.current_streak,
            longest_streak: streakUpdate.longest_streak,
            last_login_date: streakUpdate.last_login_date,
            today_counted: true,
          })
          .where(eq(user_streaks.user_id, userId));
      }

      return streakUpdate;
    });

    return NextResponse.json(
      {
        type: result.type,
        current_streak: result.current_streak,
        longest_streak: result.longest_streak,
        today: result.today,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Streak API] Error processing streak update:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to record streak update. Please try again.' },
      { status: 500 }
    );
  }
}
