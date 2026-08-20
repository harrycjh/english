import { describe, expect, it } from 'vitest';
import type { AnswerEvent } from '../models/answer-event';
import {
  buildTodayAnswerStatistics,
  buildTodayUnfamiliarNewWords,
  countsTowardTodayAccuracy,
} from './today-answer-statistics';

function event(
  id: string,
  level: number | undefined,
  isCorrect: boolean,
  questionKind: AnswerEvent['questionKind'] = 'text-choice',
): AnswerEvent {
  return {
    id,
    wordId: `word-${id}`,
    dateKey: '2026-08-17',
    answeredAt: `2026-08-17T10:00:0${id.length}.000Z`,
    questionKind,
    selectedAnswer: '',
    correctAnswer: '',
    isCorrect,
    responseTimeMs: 1_000,
    learningStateBefore: level === undefined ? undefined : {
      wordId: `word-${id}`,
      masteryLevel: level,
      reviewStage: level,
      correctStreak: 0,
      wrongCount: 0,
      lastStudiedAt: null,
      nextDueAt: null,
    },
  };
}

describe('today answer statistics', () => {
  it('excludes both correct and wrong Lv0 self-assessments', () => {
    const stats = buildTodayAnswerStatistics([
      event('lv0-correct', 0, true, 'recognition'),
      event('lv0-wrong', 0, false, 'recognition'),
      event('lv1-correct', 1, true),
      event('lv2-wrong', 2, false),
    ], '2026-08-17');

    expect(stats).toEqual({
      eventCount: 4,
      totalCount: 2,
      correctCount: 1,
      wrongCount: 1,
      accuracy: 50,
    });
  });

  it('recognizes legacy recognition events without a saved level as Lv0', () => {
    expect(countsTowardTodayAccuracy(event('legacy-lv0', undefined, true, 'recognition'))).toBe(false);
    expect(countsTowardTodayAccuracy(event('legacy-answer', undefined, true))).toBe(true);
  });

  it('lists words marked unknown in todays Lv0 recognition questions', () => {
    const unknownA = { ...event('a-first', 0, false, 'recognition'), wordId: 'word-a', learningAction: 'unknown' as const };
    const unknownAAgain = {
      ...event('a-again', 0, false, 'recognition'),
      wordId: 'word-a',
      answeredAt: '2026-08-17T11:00:00.000Z',
      learningAction: 'unknown' as const,
    };
    const unknownB = { ...event('b', 0, false, 'recognition'), wordId: 'word-b', learningAction: 'unknown' as const };
    const oldUnknown = {
      ...event('old', 0, false, 'recognition'),
      wordId: 'word-c',
      dateKey: '2026-08-16',
      learningAction: 'unknown' as const,
    };
    const textChoiceUnknown = { ...event('review', 1, false), wordId: 'review-word', learningAction: 'unknown' as const };

    expect(buildTodayUnfamiliarNewWords(
      [unknownB, unknownA, oldUnknown, textChoiceUnknown, unknownAAgain],
      '2026-08-17',
    )).toEqual([
      { wordId: 'word-a', unfamiliarCount: 2, lastMarkedAt: '2026-08-17T11:00:00.000Z' },
      { wordId: 'word-b', unfamiliarCount: 1, lastMarkedAt: unknownB.answeredAt },
    ]);
  });

  it('keeps synced unknown choices visible after the word has advanced to Lv1', () => {
    const syncedUnknown = {
      ...event('synced', 0, false, 'recognition'),
      wordId: 'word-now-lv1',
      selectedAnswer: '不认识',
      correctAnswer: '认识',
      learningAction: undefined,
      learningStateAfter: {
        wordId: 'word-now-lv1',
        masteryLevel: 1,
        reviewStage: 1,
        correctStreak: 0,
        wrongCount: 1,
        lastStudiedAt: '2026-08-17T10:00:06.000Z',
        nextDueAt: '2026-08-18T04:00:00.000Z',
      },
    } satisfies AnswerEvent;

    expect(buildTodayUnfamiliarNewWords(
      [syncedUnknown],
      '2026-08-17',
    )).toEqual([{
      wordId: 'word-now-lv1',
      unfamiliarCount: 1,
      lastMarkedAt: syncedUnknown.answeredAt,
    }]);
  });
});
