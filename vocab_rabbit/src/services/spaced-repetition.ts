import type { LearningRecord } from '../models/learning-record';

const REVIEW_INTERVAL_HOURS = [0, 12, 36, 72, 168, 336, 720];

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
  now: Date = new Date()
): LearningRecord {
  const stage = isCorrect
    ? Math.min(currentRecord.reviewStage + 1, REVIEW_INTERVAL_HOURS.length - 1)
    : Math.max(currentRecord.reviewStage - 1, 0);

  const masteryLevel = isCorrect
    ? Math.min(currentRecord.masteryLevel + 1, 6)
    : Math.max(currentRecord.masteryLevel - 1, 0);

  const nextDueAt = new Date(now.getTime() + REVIEW_INTERVAL_HOURS[stage] * 60 * 60 * 1000);

  return {
    ...currentRecord,
    masteryLevel,
    reviewStage: stage,
    correctStreak: isCorrect ? currentRecord.correctStreak + 1 : 0,
    wrongCount: isCorrect ? currentRecord.wrongCount : currentRecord.wrongCount + 1,
    lastStudiedAt: now.toISOString(),
    nextDueAt: nextDueAt.toISOString(),
  };
}

export function isMastered(record: LearningRecord | undefined): boolean {
  return Boolean(record && record.masteryLevel >= 4);
}