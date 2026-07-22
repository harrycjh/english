import { describe, expect, it } from 'vitest';
import { evaluateLearningRecord } from './learning-schedule.mjs';

const emptyRecord = {
  wordId: 'word-a',
  masteryLevel: 0,
  reviewStage: 0,
  correctStreak: 0,
  wrongCount: 0,
  lastStudiedAt: null,
  nextDueAt: null,
};

function event(overrides = {}) {
  return {
    answeredAt: '2026-07-21T08:00:00.000Z',
    isCorrect: true,
    learningAction: 'answer',
    ...overrides,
  };
}

describe('cloud learning schedule', () => {
  it('handles the two first-exposure choices', () => {
    expect(evaluateLearningRecord(emptyRecord, event({ learningAction: 'recognized' }))).toMatchObject({
      masteryLevel: 2,
      nextDueAt: '2026-07-22T20:00:00.000Z',
    });
    expect(evaluateLearningRecord(emptyRecord, event({ isCorrect: false, learningAction: 'unknown' }))).toMatchObject({
      masteryLevel: 0,
      nextDueAt: '2026-07-20T20:00:00.000Z',
    });
  });

  it('keeps a wrong answer at its current level', () => {
    const current = { ...emptyRecord, masteryLevel: 5, reviewStage: 5 };
    expect(evaluateLearningRecord(current, event({ isCorrect: false }))).toMatchObject({
      masteryLevel: 5,
      reviewStage: 5,
      nextDueAt: '2026-07-20T20:00:00.000Z',
    });
  });

  it('keeps mastered reviews between 60 and 90 days', () => {
    const current = { ...emptyRecord, masteryLevel: 8, reviewStage: 8 };
    const next = evaluateLearningRecord(current, event());
    const days = Math.round(
      (new Date(next.nextDueAt).getTime() - new Date(event().answeredAt).getTime()) / 86_400_000,
    );
    expect(next.masteryLevel).toBe(9);
    expect(days).toBeGreaterThanOrEqual(60);
    expect(days).toBeLessThanOrEqual(90);
  });
});
