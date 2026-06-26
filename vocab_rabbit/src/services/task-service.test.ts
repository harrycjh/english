import { describe, expect, it } from 'vitest';
import type { DailyTaskSummary } from '../models/daily-task';
import { recordTaskAnswer } from './task-service';

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
