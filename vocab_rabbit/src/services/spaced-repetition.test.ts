import { describe, expect, it } from 'vitest';
import { createEmptyRecord, evaluateAnswer } from './spaced-repetition';
import { addDaysToStudyDateKey, createStudyDateKey } from './study-day';

function expectDueOnStudyDay(record: ReturnType<typeof createEmptyRecord>, answeredAt: Date, delayDays: number) {
  expect(createStudyDateKey(new Date(record.nextDueAt!)))
    .toBe(addDaysToStudyDateKey(createStudyDateKey(answeredAt), delayDays));
  expect(new Date(record.nextDueAt!).toISOString().slice(11)).toBe('20:00:00.000Z');
}

describe('spaced repetition', () => {
  it('moves a recognized new word from level 0 to level 1 for next-day review', () => {
    const answeredAt = new Date('2026-07-21T08:00:00.000Z');
    const record = evaluateAnswer(createEmptyRecord('word-a'), true, answeredAt, 'recognized');

    expect(record).toMatchObject({ masteryLevel: 1, reviewStage: 1, correctStreak: 1 });
    expectDueOnStudyDay(record, answeredAt, 1);
  });

  it('keeps an unknown new word at level 0 so the retry uses the same question', () => {
    const answeredAt = new Date('2026-07-21T08:00:00.000Z');
    const record = evaluateAnswer(createEmptyRecord('word-a'), false, answeredAt, 'unknown');

    expect(record).toMatchObject({ masteryLevel: 0, reviewStage: 0, wrongCount: 1 });
    expectDueOnStudyDay(record, answeredAt, 0);
  });

  it('advances exactly one level at each correct answer through level 9', () => {
    const expectedDelays = [1, 2, 3, 5, 8, 13, 21, 30, 60];
    let record = createEmptyRecord('word-a');
    let answeredAt = new Date('2026-07-21T08:00:00.000Z');

    for (const [index, expectedDelay] of expectedDelays.entries()) {
      record = evaluateAnswer(record, true, answeredAt, index === 0 ? 'recognized' : 'answer');
      expect(record.masteryLevel).toBe(index + 1);
      expect(record.masteryLevel).toBe(record.reviewStage);
      expectDueOnStudyDay(record, answeredAt, expectedDelay);
      answeredAt = new Date(record.nextDueAt!);
    }

    expect(record.masteryLevel).toBe(9);
  });

  it('only lowers the level when the wrong-answer policy triggers and leaves it immediately due', () => {
    const answeredAt = new Date('2026-07-21T08:00:00.000Z');
    const current = { ...createEmptyRecord('word-a'), masteryLevel: 6, reviewStage: 6 };
    const firstWrong = evaluateAnswer(current, false, answeredAt);
    const thirdWrong = evaluateAnswer(firstWrong, false, answeredAt, 'answer', true);

    expect(firstWrong).toMatchObject({ masteryLevel: 6, reviewStage: 6, wrongCount: 1 });
    expect(thirdWrong).toMatchObject({ masteryLevel: 5, reviewStage: 5, wrongCount: 2 });
    expectDueOnStudyDay(thirdWrong, answeredAt, 0);
  });

  it('never downgrades below level zero', () => {
    const answeredAt = new Date('2026-07-21T08:00:00.000Z');
    const record = evaluateAnswer(createEmptyRecord('word-a'), false, answeredAt, 'unknown', true);

    expect(record).toMatchObject({ masteryLevel: 0, reviewStage: 0, wrongCount: 1 });
  });

  it('moves level 9 words to level 10 mastered with no further daily review', () => {
    const answeredAt = new Date('2026-07-21T08:00:00.000Z');
    const current = { ...createEmptyRecord('word-a'), masteryLevel: 9, reviewStage: 9 };
    const record = evaluateAnswer(current, true, answeredAt);

    expect(record).toMatchObject({ masteryLevel: 10, reviewStage: 10, nextDueAt: null });
    expect(evaluateAnswer(record, true, answeredAt).masteryLevel).toBe(10);
  });
});
