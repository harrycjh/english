import { describe, expect, it } from 'vitest';
import { createEmptyRecord, evaluateAnswer } from './spaced-repetition';

const DAY_MS = 24 * 60 * 60 * 1000;

function dueDelayDays(wordId: string, answeredAt: Date): number {
  const record = evaluateAnswer(createEmptyRecord(wordId), true, answeredAt);
  return (new Date(record.nextDueAt!).getTime() - answeredAt.getTime()) / DAY_MS;
}

describe('spaced repetition', () => {
  it('spreads the first review deterministically across one to three days', () => {
    const answeredAt = new Date('2026-07-16T10:00:00.000Z');
    const delays = Array.from({ length: 30 }, (_, index) => dueDelayDays(`word-${index}`, answeredAt));

    expect(delays.every((delay) => Number.isInteger(delay) && delay >= 1 && delay <= 3)).toBe(true);
    expect(new Set(delays)).toEqual(new Set([1, 2, 3]));
    expect(dueDelayDays('word-7', answeredAt)).toBe(dueDelayDays('word-7', answeredAt));
  });

  it('keeps later correct-answer intervals longer than the initial random delay', () => {
    const answeredAt = new Date('2026-07-16T10:00:00.000Z');
    const first = evaluateAnswer(createEmptyRecord('word-a'), true, answeredAt);
    const secondAnsweredAt = new Date(first.nextDueAt!);
    const second = evaluateAnswer(first, true, secondAnsweredAt);
    const secondDelayDays = (new Date(second.nextDueAt!).getTime() - secondAnsweredAt.getTime()) / DAY_MS;

    expect(secondDelayDays).toBe(4);
  });
});
