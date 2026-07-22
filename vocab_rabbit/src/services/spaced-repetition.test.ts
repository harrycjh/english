import { describe, expect, it } from 'vitest';
import { createEmptyRecord, evaluateAnswer, getMasteredReviewDelayDays } from './spaced-repetition';
import { addDaysToStudyDateKey, createStudyDateKey } from './study-day';

function expectDueOnStudyDay(record: ReturnType<typeof createEmptyRecord>, answeredAt: Date, delayDays: number) {
  expect(createStudyDateKey(new Date(record.nextDueAt!)))
    .toBe(addDaysToStudyDateKey(createStudyDateKey(answeredAt), delayDays));
  expect(new Date(record.nextDueAt!).toISOString().slice(11)).toBe('20:00:00.000Z');
}

describe('spaced repetition', () => {
  it('jumps a recognized new word directly to level 2 for a two-day review', () => {
    const answeredAt = new Date('2026-07-21T08:00:00.000Z');
    const record = evaluateAnswer(createEmptyRecord('word-a'), true, answeredAt, 'recognized');

    expect(record).toMatchObject({ masteryLevel: 2, reviewStage: 2, correctStreak: 1 });
    expectDueOnStudyDay(record, answeredAt, 2);
  });

  it('keeps an unknown new word at level 0 so the retry uses the same question', () => {
    const answeredAt = new Date('2026-07-21T08:00:00.000Z');
    const record = evaluateAnswer(createEmptyRecord('word-a'), false, answeredAt, 'unknown');

    expect(record).toMatchObject({ masteryLevel: 0, reviewStage: 0, wrongCount: 1 });
    expectDueOnStudyDay(record, answeredAt, 0);
  });

  it('uses the requested correct-answer intervals through level 8', () => {
    const expectedDelays = [2, 3, 5, 8, 13, 21, 30];
    let record = { ...createEmptyRecord('word-a'), masteryLevel: 1, reviewStage: 1 };
    let answeredAt = new Date('2026-07-21T08:00:00.000Z');

    for (const expectedDelay of expectedDelays) {
      record = evaluateAnswer(record, true, answeredAt);
      expect(record.masteryLevel).toBe(record.reviewStage);
      expectDueOnStudyDay(record, answeredAt, expectedDelay);
      answeredAt = new Date(record.nextDueAt!);
    }

    expect(record.masteryLevel).toBe(8);
  });

  it('does not lower the level after a wrong answer and leaves it immediately due', () => {
    const answeredAt = new Date('2026-07-21T08:00:00.000Z');
    const current = { ...createEmptyRecord('word-a'), masteryLevel: 6, reviewStage: 6 };
    const record = evaluateAnswer(current, false, answeredAt);

    expect(record).toMatchObject({ masteryLevel: 6, reviewStage: 6, wrongCount: 1 });
    expectDueOnStudyDay(record, answeredAt, 0);
  });

  it('keeps mastered words at level 9 and schedules deterministic 60-90 day reviews', () => {
    const answeredAt = new Date('2026-07-21T08:00:00.000Z');
    const current = { ...createEmptyRecord('word-a'), masteryLevel: 8, reviewStage: 8 };
    const record = evaluateAnswer(current, true, answeredAt);
    const delay = getMasteredReviewDelayDays('word-a', answeredAt);

    expect(record).toMatchObject({ masteryLevel: 9, reviewStage: 9 });
    expect(delay).toBeGreaterThanOrEqual(60);
    expect(delay).toBeLessThanOrEqual(90);
    expect(delay).toBe(getMasteredReviewDelayDays('word-a', answeredAt));
    expectDueOnStudyDay(record, answeredAt, delay);
    expect(evaluateAnswer(record, true, answeredAt).masteryLevel).toBe(9);
  });
});
