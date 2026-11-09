import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  currentCalendarDay,
  getCalendarDaysDiff,
  calculateStreakUpdate,
} from './streakLogic.js';

describe('lib/streakLogic.js — Streak Calculation Logic (§11, §12)', () => {
  describe('Rule 1: First qualifying login', () => {
    it('sets current_streak to 1 and initializes longest_streak when no existing row (lastLoginDate is null)', () => {
      const result = calculateStreakUpdate({
        currentStreak: 0,
        longestStreak: 0,
        lastLoginDate: null,
        today: '2026-10-23',
      });

      assert.deepEqual(result, {
        type: 'first',
        current_streak: 1,
        longest_streak: 1,
        last_login_date: '2026-10-23',
        today_counted: true,
        today: '2026-10-23',
      });
    });

    it('sets current_streak to 1 and preserves existing historical longest_streak if present', () => {
      const result = calculateStreakUpdate({
        currentStreak: 0,
        longestStreak: 8,
        lastLoginDate: null,
        today: '2026-10-23',
      });

      assert.equal(result.type, 'first');
      assert.equal(result.current_streak, 1);
      assert.equal(result.longest_streak, 8);
      assert.equal(result.today_counted, true);
    });

    it('handles undefined/null longestStreak safely on first login', () => {
      const result = calculateStreakUpdate({
        lastLoginDate: null,
        today: '2026-10-23',
      });

      assert.equal(result.type, 'first');
      assert.equal(result.current_streak, 1);
      assert.equal(result.longest_streak, 1);
    });
  });

  describe('Rule 3: Same calendar day login (Idempotency)', () => {
    it('returns type same_day without modifying streaks when logging in again on same calendar day', () => {
      const result = calculateStreakUpdate({
        currentStreak: 4,
        longestStreak: 7,
        lastLoginDate: '2026-10-23',
        todayCounted: true,
        today: '2026-10-23',
      });

      assert.deepEqual(result, {
        type: 'same_day',
        current_streak: 4,
        longest_streak: 7,
        last_login_date: '2026-10-23',
        today_counted: true,
        today: '2026-10-23',
      });
    });
  });

  describe('Rule 2: Consecutive calendar day login (Increment)', () => {
    it('increments streak by 1 when logging in on the next calendar day (diffInDays === 1)', () => {
      const result = calculateStreakUpdate({
        currentStreak: 3,
        longestStreak: 10,
        lastLoginDate: '2026-10-22',
        todayCounted: false,
        today: '2026-10-23',
      });

      assert.equal(result.type, 'increment');
      assert.equal(result.current_streak, 4);
      assert.equal(result.longest_streak, 10);
      assert.equal(result.last_login_date, '2026-10-23');
      assert.equal(result.today_counted, true);
    });

    it('updates longest_streak when current_streak reaches a new personal best', () => {
      const result = calculateStreakUpdate({
        currentStreak: 10,
        longestStreak: 10,
        lastLoginDate: '2026-10-22',
        todayCounted: false,
        today: '2026-10-23',
      });

      assert.equal(result.type, 'increment');
      assert.equal(result.current_streak, 11);
      assert.equal(result.longest_streak, 11);
    });
  });

  describe('Rule 4 & 5: Missed days and Reset with preservation', () => {
    it('resets current_streak to 1 when missing 1 day (diffInDays === 2), preserving longest_streak', () => {
      const result = calculateStreakUpdate({
        currentStreak: 14,
        longestStreak: 14,
        lastLoginDate: '2026-10-21',
        today: '2026-10-23',
      });

      assert.equal(result.type, 'reset');
      assert.equal(result.current_streak, 1);
      assert.equal(result.longest_streak, 14);
      assert.equal(result.last_login_date, '2026-10-23');
      assert.equal(result.today_counted, true);
    });

    it('resets current_streak to 1 when missing multiple days (diffInDays > 2), preserving longest_streak', () => {
      const result = calculateStreakUpdate({
        currentStreak: 20,
        longestStreak: 25,
        lastLoginDate: '2026-09-01',
        today: '2026-10-23',
      });

      assert.equal(result.type, 'reset');
      assert.equal(result.current_streak, 1);
      assert.equal(result.longest_streak, 25);
    });
  });

  describe('Calendar Boundaries & Leap Years (getCalendarDaysDiff & streak updates)', () => {
    it('handles month boundaries correctly (e.g. Oct 31 -> Nov 1 is diff === 1)', () => {
      const diff = getCalendarDaysDiff('2026-11-01', '2026-10-31');
      assert.equal(diff, 1);

      const result = calculateStreakUpdate({
        currentStreak: 5,
        longestStreak: 5,
        lastLoginDate: '2026-10-31',
        today: '2026-11-01',
      });
      assert.equal(result.type, 'increment');
      assert.equal(result.current_streak, 6);
    });

    it('handles year boundaries correctly (e.g. Dec 31 -> Jan 1 is diff === 1)', () => {
      const diff = getCalendarDaysDiff('2027-01-01', '2026-12-31');
      assert.equal(diff, 1);

      const result = calculateStreakUpdate({
        currentStreak: 10,
        longestStreak: 10,
        lastLoginDate: '2026-12-31',
        today: '2027-01-01',
      });
      assert.equal(result.type, 'increment');
      assert.equal(result.current_streak, 11);
    });

    it('handles leap year February 29 (leap year 2028: Feb 28 -> Feb 29 is 1 day, Feb 29 -> Mar 1 is 1 day)', () => {
      const diff1 = getCalendarDaysDiff('2028-02-29', '2028-02-28');
      assert.equal(diff1, 1);

      const diff2 = getCalendarDaysDiff('2028-03-01', '2028-02-29');
      assert.equal(diff2, 1);

      const result1 = calculateStreakUpdate({
        currentStreak: 2,
        longestStreak: 2,
        lastLoginDate: '2028-02-28',
        today: '2028-02-29',
      });
      assert.equal(result1.type, 'increment');
      assert.equal(result1.current_streak, 3);

      const result2 = calculateStreakUpdate({
        currentStreak: 3,
        longestStreak: 3,
        lastLoginDate: '2028-02-29',
        today: '2028-03-01',
      });
      assert.equal(result2.type, 'increment');
      assert.equal(result2.current_streak, 4);
    });

    it('handles non-leap year February (non-leap year 2026: Feb 28 -> Mar 1 is 1 day)', () => {
      const diff = getCalendarDaysDiff('2026-03-01', '2026-02-28');
      assert.equal(diff, 1);

      const result = calculateStreakUpdate({
        currentStreak: 4,
        longestStreak: 10,
        lastLoginDate: '2026-02-28',
        today: '2026-03-01',
      });
      assert.equal(result.type, 'increment');
      assert.equal(result.current_streak, 5);
    });
  });

  describe('currentCalendarDay — Asia/Kolkata (IST) Date Formatting', () => {
    it('returns a string matching YYYY-MM-DD pattern', () => {
      const today = currentCalendarDay();
      assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
    });

    it('correctly maps UTC timestamp across midnight boundary into IST (UTC+5:30)', () => {
      // 18:29 UTC on 2026-10-23 is 23:59 IST on 2026-10-23
      const beforeMidnightUtc = new Date('2026-10-23T18:29:00Z');
      assert.equal(currentCalendarDay(beforeMidnightUtc), '2026-10-23');

      // 18:30 UTC on 2026-10-23 is exactly 00:00:00 (midnight) on 2026-10-24 in IST
      const atMidnightUtc = new Date('2026-10-23T18:30:00Z');
      assert.equal(currentCalendarDay(atMidnightUtc), '2026-10-24');

      // 20:00 UTC on 2026-12-31 is 01:30 on 2027-01-01 in IST
      const newYearsEveUtc = new Date('2026-12-31T20:00:00Z');
      assert.equal(currentCalendarDay(newYearsEveUtc), '2027-01-01');
    });
  });
});
