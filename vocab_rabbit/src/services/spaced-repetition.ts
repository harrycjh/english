import type { LearningRecord } from '../models/learning-record';
import type { LearningAction } from '../models/answer-event';
import { getReviewDueAt } from './study-day';

export const MAX_MASTERY_LEVEL = 9;
export const REVIEW_INTERVAL_DAYS = [0, 1, 2, 3, 5, 8, 13, 21, 30] as const;

export function getMasteredReviewDelayDays(wordId: string, answeredAt: Date): number {
  const seed = `${wordId}|${answeredAt.toISOString().slice(0, 10)}|mastered`;
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  }
  return 60 + ((hash >>> 0) % 31);
}

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

  const delayDays = !isCorrect
    ? 0
    : masteryLevel >= MAX_MASTERY_LEVEL
      ? getMasteredReviewDelayDays(currentRecord.wordId, now)
      : REVIEW_INTERVAL_DAYS[masteryLevel];
  const nextDueAt = getReviewDueAt(now, delayDays);

  return {
    ...currentRecord,
    masteryLevel,
    reviewStage: masteryLevel,
    correctStreak: isCorrect ? currentRecord.correctStreak + 1 : 0,
    wrongCount: isCorrect ? currentRecord.wrongCount : currentRecord.wrongCount + 1,
    lastStudiedAt: now.toISOString(),
    nextDueAt: nextDueAt.toISOString(),
  };
}

export function isMastered(record: LearningRecord | undefined): boolean {
  return Boolean(record && record.masteryLevel >= MAX_MASTERY_LEVEL);
}
