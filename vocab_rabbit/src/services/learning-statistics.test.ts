import { describe, expect, it } from 'vitest';
import type { AnswerEvent } from '../models/answer-event';
import type { DailyTaskSummary } from '../models/daily-task';
import { defaultParentSetting } from '../models/parent-setting';
import type { LearningRecord } from '../models/learning-record';
import { buildLearningStatistics } from './learning-statistics';

function task(overrides: Partial<DailyTaskSummary>): DailyTaskSummary {
  return {
    dateKey: '2026-07-15',
    newWordIds: [],
    reviewWordIds: [],
    completedAt: null,
    correctCount: 0,
    wrongCount: 0,
    totalAnswered: 0,
    answeredWordIds: [],
    ...overrides,
  };
}

function event(id: string, wordId: string, dateKey: string, isCorrect: boolean): AnswerEvent {
  return {
    id,
    wordId,
    dateKey,
    answeredAt: `${dateKey}T10:00:00.000Z`,
    questionKind: 'text-choice',
    selectedAnswer: '',
    correctAnswer: '',
    isCorrect,
    responseTimeMs: 500,
  };
}

describe('learning statistics', () => {
  it('keeps actual history and builds a 90-day forecast around today', () => {
    const currentTask = task({ dateKey: '2026-07-15', newWordIds: ['word-b'] });
    const recordsById: Record<string, LearningRecord> = {
      'word-a': {
        wordId: 'word-a',
        masteryLevel: 2,
        reviewStage: 2,
        correctStreak: 1,
        wrongCount: 0,
        lastStudiedAt: '2026-07-14T10:00:00.000Z',
        nextDueAt: '2026-07-16T10:00:00.000Z',
      },
    };
    const statistics = buildLearningStatistics({
      currentTask,
      tasks: [task({
        dateKey: '2026-07-13',
        newWordIds: ['word-a'],
        reviewWordIds: ['word-b'],
        completedAt: '2026-07-13T11:00:00.000Z',
        totalAnswered: 1,
        correctCount: 1,
        answeredWordIds: ['word-a'],
      }), task({
        dateKey: '2026-07-14',
        reviewWordIds: ['word-a'],
        completedAt: '2026-07-14T11:00:00.000Z',
        totalAnswered: 1,
        correctCount: 1,
        answeredWordIds: ['word-a'],
      })],
      answerEvents: [event('event-a', 'word-a', '2026-07-14', true)],
      words: ['word-a', 'word-b', 'word-c', 'word-d'].map((id) => ({ id })),
      recordsById,
      selectionById: {},
      setting: { ...defaultParentSetting, dailyNewWordCount: 1, dailyReviewLimit: 1 },
      now: new Date('2026-07-15T12:00:00.000Z'),
    });

    expect(statistics.history.map((point) => point.dateKey)).toEqual(['2026-07-13', '2026-07-14', '2026-07-15']);
    expect(statistics.history[0]).toMatchObject({ newCount: 1, reviewCount: 0 });
    expect(statistics.history[1]).toMatchObject({ newCount: 0, reviewCount: 1, learnedWordCount: 1, answerCount: 1, correctCount: 1 });
    expect(statistics.forecast).toHaveLength(90);
    expect(statistics.forecast[0]).toMatchObject({ dateKey: '2026-07-16', newCount: 1, reviewCount: 1 });
    expect(statistics.forecast.at(-1)?.dateKey).toBe('2026-10-13');
    expect(statistics.timeline).toHaveLength(181);
    expect(statistics.timeline[0]?.dateKey).toBe('2026-04-16');
    expect(statistics.timeline[86]?.dateKey).toBe('2026-07-11');
    expect(statistics.timeline[90]).toMatchObject({ dateKey: '2026-07-15', newCount: 0, reviewCount: 0, kind: 'today' });
    expect(statistics.timeline[91]).toMatchObject({ dateKey: '2026-07-16', newCount: 1, reviewCount: 1, kind: 'forecast' });
    expect(statistics.timeline.at(-1)?.dateKey).toBe('2026-10-13');
    expect(statistics.totalLearnedWords).toBe(1);
    expect(statistics.totalAnswers).toBe(2);
  });
});
