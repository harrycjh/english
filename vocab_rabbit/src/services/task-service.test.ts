import { describe, expect, it } from 'vitest';
import type { DailyTaskSummary } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import { defaultParentSetting } from '../models/parent-setting';
import type { WordRecord } from '../models/word';
import {
  addDaysToDateKey,
  buildDailyTask,
  createDateTimeForDateKey,
  expandDailyTaskPlan,
  getTaskStudyQueue,
  normalizeDailyTaskPlan,
  reconcileTaskCompletion,
  recordTaskAnswer,
} from './task-service';

function makeWord(id: string, category = '测试'): WordRecord {
  return {
    id,
    english: id,
    chinese: id,
    partOfSpeech: 'noun',
    category,
    difficulty: 1,
    imagePath: `/images/${id}.webp`,
    imageApproved: true,
    oxfordRefs: [],
  };
}

function makeDueRecord(wordId: string, nextDueAt = '2026-07-19T08:00:00.000Z'): LearningRecord {
  return {
    wordId,
    masteryLevel: 1,
    reviewStage: 1,
    correctStreak: 1,
    wrongCount: 0,
    lastStudiedAt: '2026-07-18T08:00:00.000Z',
    nextDueAt,
  };
}

function makeTask(): DailyTaskSummary {
  return {
    dateKey: '2026-06-26',
    newWordIds: ['ket_a_n'],
    reviewWordIds: ['ket_b_n'],
    completedAt: null,
    correctCount: 0,
    wrongCount: 0,
    totalAnswered: 0,
    answeredWordIds: [],
  };
}

describe('recordTaskAnswer', () => {
  it('increments task progress without marking the task completed', () => {
    const task = makeTask();

    const nextTask = recordTaskAnswer(task, false);

    expect(nextTask.totalAnswered).toBe(1);
    expect(nextTask.correctCount).toBe(0);
    expect(nextTask.wrongCount).toBe(1);
    expect(nextTask.completedAt).toBeNull();
  });

  it('tracks answered word ids once for resume support', () => {
    const task = makeTask();

    const nextTask = recordTaskAnswer(recordTaskAnswer(task, true, 'ket_a_n'), false, 'ket_a_n');

    expect(nextTask.totalAnswered).toBe(2);
    expect(nextTask.answeredWordIds).toEqual(['ket_a_n']);
  });

  it('does not mark a wrong-only word as completed for the day', () => {
    const nextTask = recordTaskAnswer(makeTask(), false, 'ket_a_n');

    expect(nextTask.answeredWordIds).toEqual([]);
    expect(getTaskStudyQueue(nextTask)).toContain('ket_a_n');
  });
});

describe('daily task queue', () => {
  it('places due reviews before new words and skips words already answered today', () => {
    const task = {
      ...makeTask(),
      newWordIds: ['new-a', 'new-b'],
      reviewWordIds: ['review-a', 'review-b'],
      answeredWordIds: ['review-a'],
    };

    expect(getTaskStudyQueue(task)).toEqual(['review-b', 'new-a', 'new-b']);
  });

  it('reopens a task marked complete before every planned word was answered', () => {
    const task = {
      ...makeTask(),
      newWordIds: ['new-a', 'new-b'],
      reviewWordIds: ['review-a'],
      answeredWordIds: ['review-a'],
      completedAt: '2026-07-16T10:00:00.000Z',
    };

    expect(reconcileTaskCompletion(task)).toMatchObject({
      completedAt: null,
      answeredWordIds: ['review-a'],
    });
  });

  it('uses authoritative answer events to remove fabricated completed words', () => {
    const task = {
      ...makeTask(),
      newWordIds: ['new-a', 'new-b'],
      reviewWordIds: ['review-a'],
      answeredWordIds: ['review-a', 'new-a', 'new-b'],
      completedAt: '2026-07-16T10:00:00.000Z',
    };

    expect(reconcileTaskCompletion(task, ['review-a'])).toMatchObject({
      completedAt: null,
      answeredWordIds: ['review-a'],
    });
  });
});

describe('review-first daily planning', () => {
  it('balances new words across star levels and gives extra slots to lower stars', () => {
    const newWords = Array.from({ length: 15 }, (_, index) => {
      const difficulty = (index % 5) + 1;
      return {
        ...makeWord(`star-${difficulty}-${Math.floor(index / 5) + 1}`, `category-${index % 3}`),
        difficulty,
      };
    });

    const task = buildDailyTask(
      newWords,
      {},
      { ...defaultParentSetting, dailyNewWordCount: 7 },
      new Date('2026-07-20T08:00:00.000Z'),
    );

    expect(task.newWordIds).toEqual([
      'star-1-1',
      'star-2-1',
      'star-3-1',
      'star-4-1',
      'star-5-1',
      'star-1-2',
      'star-2-2',
    ]);
  });

  it('fills missing star-level capacity from the remaining levels', () => {
    const newWords = [
      { ...makeWord('star-1-1'), difficulty: 1 },
      { ...makeWord('star-2-1'), difficulty: 2 },
      { ...makeWord('star-2-2'), difficulty: 2 },
      { ...makeWord('star-3-1'), difficulty: 3 },
      { ...makeWord('star-3-2'), difficulty: 3 },
    ];

    const task = buildDailyTask(
      newWords,
      {},
      { ...defaultParentSetting, dailyNewWordCount: 5 },
      new Date('2026-07-20T08:00:00.000Z'),
    );

    expect(task.newWordIds).toEqual([
      'star-1-1',
      'star-2-1',
      'star-3-1',
      'star-2-2',
      'star-3-2',
    ]);
  });

  it('uses the manual queue first and fills remaining slots automatically', () => {
    const newWords = [
      { ...makeWord('auto-one'), difficulty: 1 },
      { ...makeWord('auto-two'), difficulty: 2 },
      { ...makeWord('queued-five'), difficulty: 5 },
      { ...makeWord('queued-four'), difficulty: 4 },
    ];

    const task = buildDailyTask(
      newWords,
      {},
      {
        ...defaultParentSetting,
        dailyNewWordCount: 4,
        newWordQueue: ['queued-five', 'queued-four'],
      },
      new Date('2026-07-20T08:00:00.000Z'),
    );

    expect(task.newWordIds).toEqual([
      'queued-five',
      'queued-four',
      'auto-one',
      'auto-two',
    ]);
  });

  it('skips a word removed from the editable plan when rebuilding today', () => {
    const newWords = [makeWord('removed'), makeWord('replacement'), makeWord('later')];

    const task = buildDailyTask(
      newWords,
      {},
      { ...defaultParentSetting, dailyNewWordCount: 2 },
      new Date('2026-07-20T08:00:00.000Z'),
      {},
      new Set(['removed']),
    );

    expect(task.newWordIds).toEqual(['later', 'replacement']);
  });

  it('never places a level 10 mastered word back into the daily review queue', () => {
    const word = makeWord('mastered');
    const record = {
      ...makeDueRecord(word.id),
      masteryLevel: 10,
      reviewStage: 10,
      nextDueAt: null,
    };

    const task = buildDailyTask(
      [word],
      { [word.id]: record },
      defaultParentSetting,
      new Date('2026-07-21T08:00:00.000Z'),
    );

    expect(task.reviewWordIds).toEqual([]);
    expect(task.newWordIds).toEqual([]);
  });

  it('includes reviews due later in the same study day before the next 4am refresh', () => {
    const dueLaterToday = makeWord('due-later-today');
    const dueAfterRefresh = makeWord('due-after-refresh');
    const records = {
      [dueLaterToday.id]: makeDueRecord(dueLaterToday.id, '2026-07-21T08:48:00.000Z'),
      [dueAfterRefresh.id]: makeDueRecord(dueAfterRefresh.id, '2026-07-21T20:00:00.000Z'),
    };

    const task = buildDailyTask(
      [dueLaterToday, dueAfterRefresh],
      records,
      { ...defaultParentSetting, dailyReviewLimit: 5, dailyNewWordCount: 3 },
      new Date('2026-07-21T07:41:00.000Z'),
    );

    expect(task.reviewWordIds).toEqual(['due-later-today']);
  });

  it('includes a word as soon as its target study day refreshes at 4am', () => {
    const word = makeWord('due-at-refresh');
    const task = buildDailyTask(
      [word],
      { [word.id]: makeDueRecord(word.id, '2026-07-21T20:00:00.000Z') },
      { ...defaultParentSetting, dailyReviewLimit: 5, dailyNewWordCount: 3 },
      new Date('2026-07-21T20:00:00.000Z'),
    );

    expect(task.dateKey).toBe('2026-07-22');
    expect(task.reviewWordIds).toEqual([word.id]);
  });

  it('trims merged unanswered new words to the current allowance without losing answers', () => {
    const newWords = Array.from({ length: 27 }, (_, index) => makeWord(`new-${index}`));
    const reviewWords = Array.from({ length: 19 }, (_, index) => makeWord(`review-${index}`));
    const answeredNewWordIds = newWords.slice(0, 12).map((word) => word.id);
    const records = Object.fromEntries([
      ...answeredNewWordIds.map((wordId) => [wordId, makeDueRecord(wordId, '2026-07-25T08:00:00.000Z')]),
      ...reviewWords.map((word) => [word.id, makeDueRecord(word.id)]),
    ]);
    const task: DailyTaskSummary = {
      ...makeTask(),
      dateKey: '2026-07-20',
      newWordIds: newWords.map((word) => word.id),
      reviewWordIds: reviewWords.map((word) => word.id),
      answeredWordIds: answeredNewWordIds,
      totalAnswered: 12,
      correctCount: 12,
      completedAt: '2026-07-20T09:00:00.000Z',
    };

    const normalized = normalizeDailyTaskPlan(
      task,
      [...newWords, ...reviewWords],
      records,
      { ...defaultParentSetting, dailyNewWordCount: 12, dailyReviewLimit: 50 },
      new Date('2026-07-20T10:00:00.000Z'),
      {},
      answeredNewWordIds,
    );

    expect(normalized.newWordIds).toEqual(answeredNewWordIds);
    expect(normalized.reviewWordIds).toHaveLength(19);
    expect(normalized.answeredWordIds).toEqual(answeredNewWordIds);
    expect(normalized.completedAt).toBeNull();
  });

  it('keeps new-word capacity separate when overdue reviews exceed their limit', () => {
    const reviewWords = Array.from({ length: 4 }, (_, index) => makeWord(`review-${index}`));
    const newWords = Array.from({ length: 4 }, (_, index) => makeWord(`new-${index}`));
    const records = Object.fromEntries(reviewWords.map((word) => [word.id, makeDueRecord(word.id)]));

    const task = buildDailyTask(
      [...reviewWords, ...newWords],
      records,
      { ...defaultParentSetting, dailyReviewLimit: 2, dailyNewWordCount: 3 },
      new Date('2026-07-20T08:00:00.000Z'),
    );

    expect(task.reviewWordIds).toHaveLength(2);
    expect(task.newWordIds).toHaveLength(3);
  });

  it('keeps the full new-word allowance when reviews do not exceed their limit', () => {
    const reviewWords = Array.from({ length: 2 }, (_, index) => makeWord(`review-${index}`));
    const newWords = Array.from({ length: 4 }, (_, index) => makeWord(`new-${index}`));
    const records = Object.fromEntries(reviewWords.map((word) => [word.id, makeDueRecord(word.id)]));

    const task = buildDailyTask(
      [...reviewWords, ...newWords],
      records,
      { ...defaultParentSetting, dailyReviewLimit: 2, dailyNewWordCount: 3 },
      new Date('2026-07-20T08:00:00.000Z'),
    );

    expect(task.reviewWordIds).toHaveLength(2);
    expect(task.newWordIds).toHaveLength(3);
  });

  it('adds only the missing new words to a started or completed task', () => {
    const existingNewWords = [makeWord('new-a'), makeWord('new-b')];
    const availableNewWords = [makeWord('new-c'), makeWord('new-d'), makeWord('new-e')];
    const existingReview = makeWord('review-a');
    const task: DailyTaskSummary = {
      ...makeTask(),
      newWordIds: existingNewWords.map((word) => word.id),
      reviewWordIds: [existingReview.id],
      totalAnswered: 3,
      correctCount: 3,
      answeredWordIds: [existingReview.id, existingNewWords[0].id, existingNewWords[1].id],
      completedAt: '2026-07-20T09:00:00.000Z',
    };
    const records = {
      [existingReview.id]: makeDueRecord(existingReview.id, '2026-07-21T08:00:00.000Z'),
      [existingNewWords[0].id]: makeDueRecord(existingNewWords[0].id, '2026-07-21T08:00:00.000Z'),
      [existingNewWords[1].id]: makeDueRecord(existingNewWords[1].id, '2026-07-21T08:00:00.000Z'),
    };

    const expanded = expandDailyTaskPlan(
      task,
      [...existingNewWords, ...availableNewWords, existingReview],
      records,
      { ...defaultParentSetting, dailyReviewLimit: 2, dailyNewWordCount: 4 },
      new Date('2026-07-20T10:00:00.000Z'),
    );

    expect(expanded.newWordIds).toEqual(['new-a', 'new-b', 'new-c', 'new-d']);
    expect(expanded.reviewWordIds).toEqual(['review-a']);
    expect(expanded.totalAnswered).toBe(3);
    expect(expanded.answeredWordIds).toEqual(task.answeredWordIds);
    expect(expanded.completedAt).toBeNull();
  });

  it('extends a started review plan only to the configured review limit', () => {
    const reviewWords = Array.from({ length: 5 }, (_, index) => makeWord(`review-${index}`));
    const records = Object.fromEntries(reviewWords.map((word) => [word.id, makeDueRecord(word.id)]));
    const task: DailyTaskSummary = {
      ...makeTask(),
      newWordIds: [],
      reviewWordIds: ['review-0', 'review-1'],
      totalAnswered: 1,
      answeredWordIds: ['review-0'],
    };

    const expanded = expandDailyTaskPlan(
      task,
      reviewWords,
      records,
      { ...defaultParentSetting, dailyReviewLimit: 3, dailyNewWordCount: 2 },
      new Date('2026-07-20T10:00:00.000Z'),
    );

    expect(expanded.reviewWordIds).toEqual(['review-0', 'review-1', 'review-2']);
    expect(expanded.newWordIds).toEqual([]);
    expect(expanded.totalAnswered).toBe(1);
  });
});

describe('simulated study date', () => {
  it('advances date keys without depending on the device timezone', () => {
    expect(addDaysToDateKey('2026-07-16', 1)).toBe('2026-07-17');
    expect(addDaysToDateKey('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('moves the current clock time onto the selected study date', () => {
    const actualNow = new Date('2026-07-16T10:35:42.123Z');
    expect(createDateTimeForDateKey('2026-07-18', actualNow).toISOString())
      .toBe('2026-07-18T10:35:42.123Z');
  });
});
