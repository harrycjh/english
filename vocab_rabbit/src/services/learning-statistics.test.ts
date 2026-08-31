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

function event(
  id: string,
  wordId: string,
  dateKey: string,
  isCorrect: boolean,
  overrides: Partial<AnswerEvent> = {},
): AnswerEvent {
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
    ...overrides,
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
    expect(statistics.timeline[90]).toMatchObject({
      dateKey: '2026-07-15',
      newCount: 1,
      reviewCount: 0,
      kind: 'today',
      isProjected: true,
    });
    expect(statistics.timeline[91]).toMatchObject({ dateKey: '2026-07-16', newCount: 1, reviewCount: 1, kind: 'forecast' });
    expect(statistics.timeline.at(-1)?.dateKey).toBe('2026-10-13');
    expect(statistics.totalLearnedWords).toBe(1);
    expect(statistics.totalAnswers).toBe(2);
  });

  it('carries each study day answer accuracy into the load timeline', () => {
    const statistics = buildLearningStatistics({
      currentTask: task({
        dateKey: '2026-07-15',
        totalAnswered: 3,
        correctCount: 2,
        answeredWordIds: ['word-a', 'word-b'],
      }),
      tasks: [],
      answerEvents: [
        event('correct-1', 'word-a', '2026-07-15', true),
        event('wrong-1', 'word-a', '2026-07-15', false),
        event('correct-2', 'word-b', '2026-07-15', true),
      ],
      words: [{ id: 'word-a' }, { id: 'word-b' }],
      recordsById: {},
      selectionById: {},
      setting: defaultParentSetting,
      now: new Date('2026-07-15T12:00:00.000Z'),
    });

    expect(statistics.timeline[90]).toMatchObject({
      dateKey: '2026-07-15',
      answerCount: 3,
      correctCount: 2,
      accuracy: (2 / 3) * 100,
    });
    expect(statistics.timeline[89]).toMatchObject({ answerCount: 0, correctCount: 0, accuracy: null });
    expect(statistics.timeline[91]).toMatchObject({ answerCount: 0, correctCount: 0, accuracy: null });
  });

  it('switches todays bar from the translucent plan to actual completed words after study starts', () => {
    const statistics = buildLearningStatistics({
      currentTask: task({
        dateKey: '2026-07-15',
        newWordIds: ['word-a', 'word-b'],
        reviewWordIds: ['word-c'],
        totalAnswered: 1,
        correctCount: 1,
        answeredWordIds: ['word-b'],
      }),
      tasks: [],
      answerEvents: [event('answer-1', 'word-b', '2026-07-15', true)],
      words: [{ id: 'word-a' }, { id: 'word-b' }, { id: 'word-c' }],
      recordsById: {},
      selectionById: {},
      setting: defaultParentSetting,
      now: new Date('2026-07-15T12:00:00.000Z'),
    });

    expect(statistics.timeline[90]).toMatchObject({
      dateKey: '2026-07-15',
      newCount: 1,
      reviewCount: 0,
      totalCount: 1,
      kind: 'today',
      isProjected: false,
    });
  });

  it('projects reviews created by future daily new words', () => {
    const statistics = buildLearningStatistics({
      currentTask: task({ dateKey: '2026-07-15' }),
      tasks: [],
      answerEvents: [],
      words: Array.from({ length: 20 }, (_, index) => ({ id: `word-${index}` })),
      recordsById: {},
      selectionById: {},
      setting: { ...defaultParentSetting, dailyNewWordCount: 2, dailyReviewLimit: 5 },
      now: new Date('2026-07-15T12:00:00.000Z'),
    });

    expect(statistics.forecast[0]).toMatchObject({
      dateKey: '2026-07-16',
      newCount: 2,
      reviewCount: 0,
    });
    expect(statistics.forecast[2]).toMatchObject({
      dateKey: '2026-07-18',
      newCount: 2,
      reviewCount: 2,
    });
    expect(statistics.forecast[3]).toMatchObject({
      dateKey: '2026-07-19',
      newCount: 2,
      reviewCount: 4,
    });
    expect(statistics.forecastModel).toMatchObject({
      dailyNewTarget: 2,
      dailyReviewBaseline: 5,
      historicalAnswerSamples: 0,
      expectedAccuracy: 0.85,
    });
  });

  it('uses historical answer accuracy when advancing projected review stages', () => {
    const correctEvents = Array.from({ length: 20 }, (_, index) => (
      event(`correct-${index}`, `word-${index}`, '2026-07-14', true)
    ));
    const wrongEvents = Array.from({ length: 20 }, (_, index) => (
      event(`wrong-${index}`, `word-${index}`, '2026-07-14', false)
    ));
    const input = {
      currentTask: task({ dateKey: '2026-07-15' }),
      tasks: [],
      words: Array.from({ length: 30 }, (_, index) => ({ id: `word-${index}` })),
      recordsById: {},
      selectionById: {},
      setting: { ...defaultParentSetting, dailyNewWordCount: 2, dailyReviewLimit: 5 },
      now: new Date('2026-07-15T12:00:00.000Z'),
    };

    const highAccuracy = buildLearningStatistics({ ...input, answerEvents: correctEvents });
    const lowAccuracy = buildLearningStatistics({ ...input, answerEvents: wrongEvents });

    expect(highAccuracy.forecastModel.historicalAnswerSamples).toBe(20);
    expect(highAccuracy.forecastModel.expectedAccuracy).toBeGreaterThan(0.9);
    expect(lowAccuracy.forecastModel.expectedAccuracy).toBeLessThan(0.4);
  });

  it('shows deferred reviews without taking capacity away from future new words', () => {
    const recordsById = Object.fromEntries(Array.from({ length: 6 }, (_, index) => {
      const wordId = `review-${index}`;
      return [wordId, {
        wordId,
        masteryLevel: 1,
        reviewStage: 1,
        correctStreak: 1,
        wrongCount: 0,
        lastStudiedAt: '2026-07-14T08:00:00.000Z',
        nextDueAt: '2026-07-16T08:00:00.000Z',
      } satisfies LearningRecord];
    }));

    const statistics = buildLearningStatistics({
      currentTask: task({ dateKey: '2026-07-15' }),
      tasks: [],
      answerEvents: [],
      words: [
        ...Object.keys(recordsById).map((id) => ({ id })),
        ...Array.from({ length: 5 }, (_, index) => ({ id: `new-${index}` })),
      ],
      recordsById,
      selectionById: {},
      setting: { ...defaultParentSetting, dailyNewWordCount: 2, dailyReviewLimit: 2 },
      now: new Date('2026-07-15T12:00:00.000Z'),
    });

    expect(statistics.forecast[0]).toMatchObject({
      reviewCount: 2,
      newCount: 2,
      retryCount: 1,
      deferredReviewCount: 4,
      totalCount: 4,
    });
  });

  it('does not pull a review across the 4am study-day boundary', () => {
    const wordId = 'boundary-word';
    const recordsById: Record<string, LearningRecord> = {
      [wordId]: {
        wordId,
        masteryLevel: 2,
        reviewStage: 2,
        correctStreak: 1,
        wrongCount: 0,
        lastStudiedAt: '2026-07-14T08:00:00.000Z',
        nextDueAt: '2026-07-16T20:00:00.000Z',
      },
    };
    const statistics = buildLearningStatistics({
      currentTask: task({ dateKey: '2026-07-15' }),
      tasks: [],
      answerEvents: [],
      words: [{ id: wordId }],
      recordsById,
      selectionById: {},
      setting: { ...defaultParentSetting, dailyNewWordCount: 3, dailyReviewLimit: 5 },
      now: new Date('2026-07-15T12:00:00.000Z'),
    });

    expect(statistics.forecast[0]).toMatchObject({ dateKey: '2026-07-16', reviewCount: 0 });
    expect(statistics.forecast[1]).toMatchObject({ dateKey: '2026-07-17', reviewCount: 1 });
  });

  it('uses question-kind and mastery-level accuracy to estimate same-day retries', () => {
    const answerEvents = [
      ...Array.from({ length: 40 }, (_, index) => event(
        `image-${index}`,
        `image-history-${index}`,
        '2026-07-14',
        true,
        {
          questionKind: 'image-english-choice',
          learningStateBefore: {
            wordId: `image-history-${index}`,
            masteryLevel: 2,
            reviewStage: 2,
            correctStreak: 0,
            wrongCount: 0,
            lastStudiedAt: null,
            nextDueAt: null,
          },
        },
      )),
      ...Array.from({ length: 40 }, (_, index) => event(
        `spell-${index}`,
        `spell-history-${index}`,
        '2026-07-14',
        false,
        {
          questionKind: 'sentence-choice',
          learningStateBefore: {
            wordId: `spell-history-${index}`,
            masteryLevel: 5,
            reviewStage: 5,
            correctStreak: 0,
            wrongCount: 0,
            lastStudiedAt: null,
            nextDueAt: null,
          },
        },
      )),
    ];
    const record = (wordId: string, masteryLevel: number): LearningRecord => ({
      wordId,
      masteryLevel,
      reviewStage: masteryLevel,
      correctStreak: 1,
      wrongCount: 0,
      lastStudiedAt: '2026-07-14T08:00:00.000Z',
      nextDueAt: '2026-07-15T20:00:00.000Z',
    });
    const input = {
      currentTask: task({ dateKey: '2026-07-15' }),
      tasks: [],
      answerEvents,
      selectionById: {},
      setting: { ...defaultParentSetting, dailyNewWordCount: 3, dailyReviewLimit: 5 },
      now: new Date('2026-07-15T12:00:00.000Z'),
    };
    const imageForecast = buildLearningStatistics({
      ...input,
      words: [{ id: 'image-word' }],
      recordsById: { 'image-word': record('image-word', 2) },
    });
    const spellingForecast = buildLearningStatistics({
      ...input,
      words: [{ id: 'spell-word' }],
      recordsById: { 'spell-word': record('spell-word', 5) },
    });

    expect(spellingForecast.forecast[0].retryCount).toBeGreaterThan(imageForecast.forecast[0].retryCount);
    expect(spellingForecast.forecast[1].reviewCount).toBe(0);
  });

  it('uses the current non-default load setting and predicts 100% completion', () => {
    const historicalTasks = Array.from({ length: 30 }, (_, index) => {
      const day = String(index + 1).padStart(2, '0');
      const plannedIds = Array.from({ length: 10 }, (__, wordIndex) => `day-${index}-word-${wordIndex}`);
      return task({
        dateKey: `2026-06-${day}`,
        newWordIds: plannedIds,
        answeredWordIds: plannedIds.slice(0, 2),
        totalAnswered: 2,
        correctCount: 2,
      });
    });
    const statistics = buildLearningStatistics({
      currentTask: task({ dateKey: '2026-07-15' }),
      tasks: historicalTasks,
      answerEvents: [],
      words: Array.from({ length: 100 }, (_, index) => ({ id: `future-${index}` })),
      recordsById: {},
      selectionById: {},
      setting: { ...defaultParentSetting, dailyNewWordCount: 15, dailyReviewLimit: 20 },
      now: new Date('2026-07-15T12:00:00.000Z'),
    });

    expect(statistics.forecastModel.dailyNewTarget).toBe(15);
    expect(statistics.forecastModel.completionRate).toBe(1);
    expect(statistics.forecast[0].newCount).toBe(15);
  });

  it('does not forecast more daily reviews after words reach level 10', () => {
    const recordsById = Object.fromEntries(Array.from({ length: 30 }, (_, index) => {
      const wordId = `mastered-${index}`;
      return [wordId, {
        wordId,
        masteryLevel: 10,
        reviewStage: 10,
        correctStreak: 8,
        wrongCount: 0,
        lastStudiedAt: '2026-07-14T08:00:00.000Z',
        nextDueAt: null,
      } satisfies LearningRecord];
    }));
    const completedHistory = Array.from({ length: 30 }, (_, index) => task({
      dateKey: `2026-06-${String(index + 1).padStart(2, '0')}`,
      newWordIds: [`history-${index}`],
      answeredWordIds: [`history-${index}`],
      completedAt: `2026-06-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`,
      totalAnswered: 1,
      correctCount: 1,
    }));
    const statistics = buildLearningStatistics({
      currentTask: task({ dateKey: '2026-07-15' }),
      tasks: completedHistory,
      answerEvents: [],
      words: Object.keys(recordsById).map((id) => ({ id })),
      recordsById,
      selectionById: {},
      setting: { ...defaultParentSetting, dailyNewWordCount: 3, dailyReviewLimit: 50 },
      now: new Date('2026-07-15T12:00:00.000Z'),
    });
    expect(statistics.forecast.every((point) => point.reviewCount === 0)).toBe(true);
  });

  it('reports measured study time per day and projects it forward at the same pace', () => {
    const answerEvents = [
      event('e1', 'word-a', '2026-07-14', true, { answeredAt: '2026-07-14T10:00:00.000Z', responseTimeMs: 8_000 }),
      event('e2', 'word-b', '2026-07-14', true, { answeredAt: '2026-07-14T10:00:20.000Z', responseTimeMs: 9_000 }),
      event('e3', 'word-c', '2026-07-14', false, { answeredAt: '2026-07-14T10:00:40.000Z', responseTimeMs: 7_000 }),
      event('e4', 'word-a', '2026-07-15', true, { answeredAt: '2026-07-15T09:00:00.000Z', responseTimeMs: 12_000 }),
    ];
    const statistics = buildLearningStatistics({
      currentTask: task({
        dateKey: '2026-07-15',
        newWordIds: ['word-d'],
        answeredWordIds: ['word-a'],
        totalAnswered: 1,
        correctCount: 1,
      }),
      tasks: [task({
        dateKey: '2026-07-14',
        newWordIds: ['word-a', 'word-b', 'word-c'],
        completedAt: '2026-07-14T10:01:00.000Z',
        totalAnswered: 3,
        correctCount: 2,
        answeredWordIds: ['word-a', 'word-b', 'word-c'],
      })],
      answerEvents,
      words: [{ id: 'word-a' }, { id: 'word-b' }, { id: 'word-c' }, { id: 'word-d' }],
      recordsById: {},
      selectionById: {},
      setting: defaultParentSetting,
      now: new Date('2026-07-15T12:00:00.000Z'),
    });

    const july14 = statistics.history.find((point) => point.dateKey === '2026-07-14');
    // 8s of think time, then two 20s gaps that also cover feedback and audio.
    expect(july14?.durationMs).toBe(48_000);
    expect(statistics.todayStudyDurationMs).toBe(12_000);
    expect(statistics.totalStudyDurationMs).toBe(60_000);
    expect(statistics.averageDailyStudyDurationMs).toBe(30_000);

    // 4 samples (8s, 20s, 20s, 12s -> median 16s) blended with the 15s prior.
    expect(statistics.averageQuestionDurationMs).toBe(15_250);
    const tomorrow = statistics.forecast[0];
    expect(tomorrow.durationMs).toBe(
      (tomorrow.newCount + tomorrow.reviewCount + tomorrow.retryCount) * 15_250,
    );
  });

  it('reports no study time when nothing has been answered', () => {
    const statistics = buildLearningStatistics({
      currentTask: task({ dateKey: '2026-07-15' }),
      tasks: [],
      answerEvents: [],
      words: [{ id: 'word-a' }],
      recordsById: {},
      selectionById: {},
      setting: defaultParentSetting,
      now: new Date('2026-07-15T12:00:00.000Z'),
    });

    expect(statistics.totalStudyDurationMs).toBe(0);
    expect(statistics.todayStudyDurationMs).toBe(0);
    expect(statistics.averageDailyStudyDurationMs).toBe(0);
    expect(statistics.averageQuestionDurationMs).toBe(15_000);
  });
});
