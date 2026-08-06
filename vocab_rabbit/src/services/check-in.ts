import type { DailyTaskSummary } from '../models/daily-task';
import { addDaysToStudyDateKey } from './study-day';

/**
 * A day counts as 签到 when that day's plan was finished, not merely opened.
 *
 * Anything looser turns the calendar into a second heatmap: the heatmap already
 * shows effort, and a stamp that a half-finished day can earn is worth nothing
 * to a child. Finishing is the thing the app asks for, so finishing is the thing
 * the stamp records — and it is the same bar the backpack unlocks are priced at.
 */
export function isCheckedIn(task: DailyTaskSummary | undefined): boolean {
  return Boolean(task?.completedAt);
}

export interface CheckInDay {
  dateKey: string;
  /** Day of the month, 1-31. */
  dayOfMonth: number;
  isCheckedIn: boolean;
  isToday: boolean;
  /** True once the date is past today — the future cannot be un-signed. */
  isFuture: boolean;
}

export interface CheckInMonth {
  /** `YYYY-MM`. */
  monthKey: string;
  year: number;
  /** 1-12, for display. */
  month: number;
  /** Blank cells before the 1st so the grid starts on the right weekday. */
  leadingBlanks: number;
  days: CheckInDay[];
  checkedInCount: number;
}

/**
 * How much check-in history the app loads, and therefore the most days it can
 * ever count. Nothing in the backpack may cost more than this or it can never
 * be unlocked -- `backpack.test.ts` holds the catalogue to it.
 */
export const CHECK_IN_HISTORY_DAYS = 90;

export interface CheckInSummary {
  /**
   * Days signed in within the loaded history. Prices the backpack. Capped by
   * CHECK_IN_HISTORY_DAYS, not unbounded.
   */
  totalDays: number;
  /** Days in a row ending today (or yesterday, if today is still open). */
  streakDays: number;
  isTodayCheckedIn: boolean;
}

function collectCheckedInDateKeys(tasks: DailyTaskSummary[]): Set<string> {
  const dateKeys = new Set<string>();
  for (const task of tasks) {
    if (isCheckedIn(task)) dateKeys.add(task.dateKey);
  }
  return dateKeys;
}

/**
 * Days in a row up to today.
 *
 * Today not being finished yet does not break the streak — it has not been
 * missed, it is merely unfinished, and a child who opens the app at breakfast
 * should not be told the streak they earned yesterday is gone. So an open today
 * is skipped and the count runs back from yesterday.
 */
function countStreak(checkedIn: Set<string>, todayKey: string): number {
  let dateKey = checkedIn.has(todayKey) ? todayKey : addDaysToStudyDateKey(todayKey, -1);
  let streak = 0;
  while (checkedIn.has(dateKey)) {
    streak += 1;
    dateKey = addDaysToStudyDateKey(dateKey, -1);
  }
  return streak;
}

export function summarizeCheckIns(tasks: DailyTaskSummary[], todayKey: string): CheckInSummary {
  const checkedIn = collectCheckedInDateKeys(tasks);
  return {
    totalDays: checkedIn.size,
    streakDays: countStreak(checkedIn, todayKey),
    isTodayCheckedIn: checkedIn.has(todayKey),
  };
}

function parseMonthKey(monthKey: string): { year: number; month: number } {
  const [year, month] = monthKey.split('-').map(Number);
  return { year, month };
}

/** `YYYY-MM` for the month a study date belongs to. */
export function getMonthKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/** Steps a month key by whole months, so December wraps into January. */
export function addMonths(monthKey: string, months: number): string {
  const { year, month } = parseMonthKey(monthKey);
  const zeroBased = (year * 12) + (month - 1) + months;
  const nextYear = Math.floor(zeroBased / 12);
  const nextMonth = zeroBased - (nextYear * 12) + 1;
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`;
}

/**
 * One month laid out as a calendar grid, weeks starting on Sunday.
 *
 * Built from UTC dates because study date keys are already the study day, not a
 * wall clock — running them back through a local `Date` would shift the whole
 * month by a timezone.
 */
export function buildCheckInMonth(
  tasks: DailyTaskSummary[],
  monthKey: string,
  todayKey: string,
): CheckInMonth {
  const checkedIn = collectCheckedInDateKeys(tasks);
  const { year, month } = parseMonthKey(monthKey);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const days: CheckInDay[] = [];
  for (let dayOfMonth = 1; dayOfMonth <= dayCount; dayOfMonth += 1) {
    const dateKey = `${monthKey}-${String(dayOfMonth).padStart(2, '0')}`;
    days.push({
      dateKey,
      dayOfMonth,
      isCheckedIn: checkedIn.has(dateKey),
      isToday: dateKey === todayKey,
      isFuture: dateKey > todayKey,
    });
  }

  return {
    monthKey,
    year,
    month,
    leadingBlanks: firstDay.getUTCDay(),
    days,
    checkedInCount: days.filter((day) => day.isCheckedIn).length,
  };
}
