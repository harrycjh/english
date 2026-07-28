import type { LearningRecord } from '../models/learning-record';
import type { LearningAction } from '../models/answer-event';
import { getReviewDueAt } from './study-day';

export const MAX_MASTERY_LEVEL = 10;
export const REVIEW_INTERVAL_DAYS = [0, 1, 2, 3, 5, 8, 13, 21, 30, 60] as const;

export function createEmptyRecord(wordId: string): LearningRecord {
  return {
    wordId,
    masteryLevel: 0,
    reviewStage: 0,
    correctStreak: 0,
    wrongCount: 0,
    lastStudiedAt: null,
    nextDueAt: null,
  };
}

export function evaluateAnswer(
  currentRecord: LearningRecord,
  isCorrect: boolean,
  now: Date = new Date(),
  _learningAction: LearningAction = 'answer',
  levelDowngrade = false,
): LearningRecord {
  const currentLevel = Math.min(Math.max(currentRecord.masteryLevel, 0), MAX_MASTERY_LEVEL);
  const masteryLevel = isCorrect
    ? Math.min(currentLevel + 1, MAX_MASTERY_LEVEL)
    : levelDowngrade
      ? Math.max(currentLevel - 1, 0)
      : currentLevel;

  const delayDays = !isCorrect ? 0 : REVIEW_INTERVAL_DAYS[masteryLevel];
  const nextDueAt = masteryLevel >= MAX_MASTERY_LEVEL
    ? null
    : getReviewDueAt(now, delayDays).toISOString();

  return {
    ...currentRecord,
    masteryLevel,
    reviewStage: masteryLevel,
    correctStreak: isCorrect ? currentRecord.correctStreak + 1 : 0,
    wrongCount: isCorrect ? currentRecord.wrongCount : currentRecord.wrongCount + 1,
    lastStudiedAt: now.toISOString(),
    nextDueAt,
  };
}

export function isMastered(record: LearningRecord | undefined): boolean {
  return Boolean(record && record.masteryLevel >= MAX_MASTERY_LEVEL);
}
