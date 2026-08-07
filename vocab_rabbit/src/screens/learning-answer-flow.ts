export interface LearningAnswerFlow {
  retrySameQuestion: boolean;
  requiresManualContinue: boolean;
  holdAfterFeedbackMs: number;
}

export interface LifePhotoRevealFlow {
  revealAfterAudioMs: number;
  holdAfterRevealMs: number;
}

export const LEVEL_UP_ANIMATION_MS = 900;
export const AFTER_LEVEL_UP_ADVANCE_DELAY_MS = 2_000;

export interface UpgradeWaitSegments {
  beforeUpgradeMs: number;
  upgradeMs: number;
}

export function getUpgradeWaitSegments(
  totalWaitMs: number,
  shouldAnimateUpgrade: boolean,
): UpgradeWaitSegments {
  const normalizedWait = Math.max(0, totalWaitMs);
  if (!shouldAnimateUpgrade) {
    return {
      beforeUpgradeMs: normalizedWait,
      upgradeMs: 0,
    };
  }

  const upgradeMs = Math.min(LEVEL_UP_ANIMATION_MS, normalizedWait);
  return {
    beforeUpgradeMs: normalizedWait - upgradeMs,
    upgradeMs,
  };
}

export function getLifePhotoRevealFlow(
  level: number,
  answerCorrect: boolean,
  hasLifePhoto: boolean,
): LifePhotoRevealFlow | null {
  if (level !== 2 || !answerCorrect || !hasLifePhoto) return null;
  return {
    revealAfterAudioMs: 1_000,
    holdAfterRevealMs: 3_000,
  };
}

export function getLearningAnswerFlow(
  level: number,
  answerCorrect: boolean,
  hasRelatedResult: boolean,
): LearningAnswerFlow {
  return {
    retrySameQuestion: false,
    requiresManualContinue: (level === 4 || level === 6 || level === 8)
      && answerCorrect
      && hasRelatedResult,
    holdAfterFeedbackMs: 2_000,
  };
}
