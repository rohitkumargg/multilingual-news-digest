/**
 * MND — Server-Authoritative Login Streak Pure Logic (§11, §12)
 *
 * Rules:
 * Rule 1: First qualifying login → streak = 1
 * Rule 2: Login on the next calendar day → streak += 1
 * Rule 3: Multiple logins on same calendar day → no change (idempotent, type: 'same_day')
 * Rule 4: One or more calendar days missed → reset streak = 1
 * Rule 5: Preserve longest_streak across resets
 * Timezone: Asia/Kolkata (IST, UTC+5:30)
 */

/**
 * Returns current calendar day string in 'YYYY-MM-DD' formatted for Asia/Kolkata (IST).
 * @param {Date} [date] - Optional date object, defaults to now.
 * @returns {string} 'YYYY-MM-DD'
 */
export function currentCalendarDay(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/**
 * Calculates the difference in full calendar days between two 'YYYY-MM-DD' strings.
 * @param {string} dateStrA - 'YYYY-MM-DD'
 * @param {string} dateStrB - 'YYYY-MM-DD'
 * @returns {number} dateStrA - dateStrB in days
 */
export function getCalendarDaysDiff(dateStrA, dateStrB) {
  const [y1, m1, d1] = dateStrA.split('-').map(Number);
  const [y2, m2, d2] = dateStrB.split('-').map(Number);

  const utcA = Date.UTC(y1, m1 - 1, d1);
  const utcB = Date.UTC(y2, m2 - 1, d2);

  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((utcA - utcB) / msPerDay);
}

/**
 * Pure streak update calculator.
 * @param {Object} params
 * @param {number} [params.currentStreak=0]
 * @param {number} [params.longestStreak=0]
 * @param {string|null} [params.lastLoginDate=null] - 'YYYY-MM-DD'
 * @param {boolean} [params.todayCounted=false]
 * @param {string} [params.today] - 'YYYY-MM-DD' in IST (defaults to current IST day)
 * @returns {{
 *   type: 'first' | 'same_day' | 'increment' | 'reset',
 *   current_streak: number,
 *   longest_streak: number,
 *   last_login_date: string,
 *   today_counted: boolean,
 *   today: string
 * }}
 */
export function calculateStreakUpdate({
  currentStreak = 0,
  longestStreak = 0,
  lastLoginDate = null,
  todayCounted = false,
  today = currentCalendarDay(),
}) {
  // Case 1: First qualifying login ever (uninitialized row)
  if (!lastLoginDate) {
    return {
      type: 'first',
      current_streak: 1,
      longest_streak: Math.max(1, longestStreak || 0),
      last_login_date: today,
      today_counted: true,
      today,
    };
  }

  const diffInDays = getCalendarDaysDiff(today, lastLoginDate);

  // Case 2: Same calendar day in IST (idempotent login)
  if (diffInDays === 0) {
    return {
      type: 'same_day',
      current_streak: currentStreak,
      longest_streak: longestStreak,
      last_login_date: today,
      today_counted: true,
      today,
    };
  }

  // Case 3: Exactly next calendar day in IST (streak increments)
  if (diffInDays === 1) {
    const newStreak = (currentStreak || 0) + 1;
    const newLongest = Math.max(newStreak, longestStreak || 0);

    return {
      type: 'increment',
      current_streak: newStreak,
      longest_streak: newLongest,
      last_login_date: today,
      today_counted: true,
      today,
    };
  }

  // Case 4: Missed one or more days (streak resets to 1, longest preserved)
  return {
    type: 'reset',
    current_streak: 1,
    longest_streak: Math.max(1, longestStreak || 0),
    last_login_date: today,
    today_counted: true,
    today,
  };
}
