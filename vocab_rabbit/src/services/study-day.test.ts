import { describe, expect, it } from 'vitest';
import {
  createDateTimeForStudyDateKey,
  createStudyDateKey,
  getMillisecondsUntilNextStudyDay,
  getStudyDayReviewCutoff,
} from './study-day';

describe('4am study-day boundary', () => {
  it('keeps activity before 4am on the previous study day', () => {
    expect(createStudyDateKey(new Date('2026-07-20T19:59:59.999Z'))).toBe('2026-07-20');
    expect(createStudyDateKey(new Date('2026-07-20T20:00:00.000Z'))).toBe('2026-07-21');
  });

  it('uses the next 4am as the review cutoff', () => {
    const now = new Date('2026-07-21T07:41:00.000Z');
    expect(getStudyDayReviewCutoff(now).toISOString()).toBe('2026-07-21T20:00:00.000Z');
    expect(getMillisecondsUntilNextStudyDay(now)).toBe(12 * 60 * 60 * 1000 + 19 * 60 * 1000);
  });

  it('keeps the real clock time when answering inside a simulated study day', () => {
    const beforeRefresh = new Date('2026-07-20T18:30:15.125Z');
    expect(createDateTimeForStudyDateKey('2026-07-20', beforeRefresh).toISOString())
      .toBe('2026-07-20T18:30:15.125Z');
  });
});
