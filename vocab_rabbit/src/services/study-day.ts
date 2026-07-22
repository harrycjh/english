const HOUR_MS = 60 * 60 * 1000;
const STUDY_TIME_ZONE_OFFSET_HOURS = 8;

export const STUDY_DAY_REFRESH_HOUR = 4;

function parseDateKey(dateKey: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function createStudyDateKey(date: Date = new Date()): string {
  const studyDayOffsetHours = STUDY_TIME_ZONE_OFFSET_HOURS - STUDY_DAY_REFRESH_HOUR;
  return new Date(date.getTime() + studyDayOffsetHours * HOUR_MS).toISOString().slice(0, 10);
}

export function addDaysToStudyDateKey(dateKey: string, days: number): string {
  const [year, month, day] = parseDateKey(dateKey);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function createDateTimeForStudyDateKey(dateKey: string, clock: Date = new Date()): Date {
  const localClock = new Date(clock.getTime() + STUDY_TIME_ZONE_OFFSET_HOURS * HOUR_MS);
  const localHour = localClock.getUTCHours();
  const calendarDateKey = localHour < STUDY_DAY_REFRESH_HOUR
    ? addDaysToStudyDateKey(dateKey, 1)
    : dateKey;
  const hours = String(localHour).padStart(2, '0');
  const minutes = String(localClock.getUTCMinutes()).padStart(2, '0');
  const seconds = String(localClock.getUTCSeconds()).padStart(2, '0');
  const milliseconds = String(localClock.getUTCMilliseconds()).padStart(3, '0');
  return new Date(
    `${calendarDateKey}T${hours}:${minutes}:${seconds}.${milliseconds}+08:00`,
  );
}

export function getStudyDayReviewCutoff(date: Date = new Date()): Date {
  const nextDateKey = addDaysToStudyDateKey(createStudyDateKey(date), 1);
  return new Date(`${nextDateKey}T04:00:00.000+08:00`);
}

export function getReviewDueAt(answeredAt: Date, delayDays: number): Date {
  const dueDateKey = addDaysToStudyDateKey(createStudyDateKey(answeredAt), delayDays);
  return new Date(`${dueDateKey}T04:00:00.000+08:00`);
}

export function getMillisecondsUntilNextStudyDay(date: Date = new Date()): number {
  return Math.max(0, getStudyDayReviewCutoff(date).getTime() - date.getTime());
}
