import { describe, expect, it } from 'vitest';
import type { DailyTaskSummary } from '../models/daily-task';
import {
  addMonths,
  buildCheckInMonth,
  getMonthKey,
  isCheckedIn,
  summarizeCheckIns,
} from './check-in';

function createTask(dateKey: string, completed: boolean): DailyTaskSummary {
  return {
    dateKey,
    newWordIds: ['word-a'],
    reviewWordIds: [],
    completedAt: completed ? `${dateKey}T09:00:00.000Z` : null,
    correctCount: completed ? 1 : 0,
    wrongCount: 0,
    totalAnswered: completed ? 1 : 0,
    answeredWordIds: completed ? ['word-a'] : [],
  };
}

describe('check-in', () => {
  it('signs a day in only once its plan is finished', () => {
    expect(isCheckedIn(createTask('2026-08-05', true))).toBe(true);
    expect(isCheckedIn(createTask('2026-08-05', false))).toBe(false);
    expect(isCheckedIn(undefined)).toBe(false);
  });

  it('counts every day ever signed in', () => {
    const tasks = [
      createTask('2026-07-01', true),
      createTask('2026-07-02', false),
      createTask('2026-08-04', true),
      createTask('2026-08-05', true),
    ];

    expect(summarizeCheckIns(tasks, '2026-08-05').totalDays).toBe(3);
  });

  it('runs the streak back from today', () => {
    const tasks = ['2026-08-01', '2026-08-03', '2026-08-04', '2026-08-05']
      .map((dateKey) => createTask(dateKey, true));

    const summary = summarizeCheckIns(tasks, '2026-08-05');

    expect(summary.streakDays).toBe(3);
    expect(summary.isTodayCheckedIn).toBe(true);
  });

  it('keeps a streak alive while today is still unfinished', () => {
    const tasks = [
      createTask('2026-08-03', true),
      createTask('2026-08-04', true),
      createTask('2026-08-05', false),
    ];

    const summary = summarizeCheckIns(tasks, '2026-08-05');

    // Today has not been missed, only not finished yet.
    expect(summary.streakDays).toBe(2);
    expect(summary.isTodayCheckedIn).toBe(false);
  });

  it('drops the streak to zero once a whole day is missed', () => {
    const tasks = [createTask('2026-08-01', true), createTask('2026-08-02', true)];

    expect(summarizeCheckIns(tasks, '2026-08-05').streakDays).toBe(0);
  });

  it('lays a month out as a calendar grid', () => {
    const tasks = [createTask('2026-08-01', true), createTask('2026-08-05', true)];

    const month = buildCheckInMonth(tasks, '2026-08', '2026-08-05');

    expect(month.year).toBe(2026);
    expect(month.month).toBe(8);
    expect(month.days).toHaveLength(31);
    // 2026-08-01 is a Saturday, so six blanks sit before it.
    expect(month.leadingBlanks).toBe(6);
    expect(month.checkedInCount).toBe(2);
    expect(month.days[0]).toMatchObject({ dayOfMonth: 1, isCheckedIn: true, isFuture: false });
    expect(month.days[1]).toMatchObject({ dayOfMonth: 2, isCheckedIn: false, isFuture: false });
    expect(month.days[4]).toMatchObject({ dayOfMonth: 5, isCheckedIn: true, isToday: true });
    expect(month.days[5]).toMatchObject({ dayOfMonth: 6, isFuture: true, isCheckedIn: false });
  });

  it('gets February right in a leap year', () => {
    const month = buildCheckInMonth([], '2028-02', '2028-03-10');
    expect(month.days).toHaveLength(29);
  });

  it('steps months across a year boundary', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-08', 0)).toBe('2026-08');
    expect(getMonthKey('2026-08-05')).toBe('2026-08');
  });
});
