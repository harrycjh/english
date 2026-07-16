import { describe, expect, it } from 'vitest';
import type { DailyTaskSummary } from '../models/daily-task';
import {
  addDaysToDateKey,
  createDateTimeForDateKey,
  getTaskStudyQueue,
  reconcileTaskCompletion,
  recordTaskAnswer,
} from './task-service';

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
