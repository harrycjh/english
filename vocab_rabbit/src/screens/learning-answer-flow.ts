export interface LearningAnswerFlow {
  retrySameQuestion: boolean;
  requiresManualContinue: boolean;
  holdAfterFeedbackMs: number;
}

export interface LifePhotoRevealFlow {
  revealAfterAudioMs: number;
  holdAfterRevealMs: number;
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
    requiresManualContinue: (level === 4 || level === 6)
      && answerCorrect
      && hasRelatedResult,
    holdAfterFeedbackMs: 2_000,
  };
}
