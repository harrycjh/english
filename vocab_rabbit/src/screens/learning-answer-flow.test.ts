import { describe, expect, it } from 'vitest';
import { getLearningAnswerFlow, getLifePhotoRevealFlow } from './learning-answer-flow';

describe('getLearningAnswerFlow', () => {
  it('moves a wrong level 5 question to the queue tail instead of reopening it immediately', () => {
    expect(getLearningAnswerFlow(5, false, false)).toEqual({
      retrySameQuestion: false,
      requiresManualContinue: false,
      holdAfterFeedbackMs: 2_000,
    });
  });

  it.each([4, 6])('requires a manual continue after a correct related-page reveal at level %i', (level) => {
    expect(getLearningAnswerFlow(level, true, true)).toEqual({
      retrySameQuestion: false,
      requiresManualContinue: true,
      holdAfterFeedbackMs: 2_000,
    });
  });

  it.each([true, false])('uses a two-second fixed wait for every level when answerCorrect is %s', (answerCorrect) => {
    for (let level = 0; level <= 10; level += 1) {
      expect(getLearningAnswerFlow(level, answerCorrect, false).holdAfterFeedbackMs).toBe(2_000);
    }
  });

  it('reveals a level 2 life photo one second after audio and holds it for three seconds', () => {
    expect(getLifePhotoRevealFlow(2, true, true)).toEqual({
      revealAfterAudioMs: 1_000,
      holdAfterRevealMs: 3_000,
    });
    expect(getLifePhotoRevealFlow(2, false, true)).toBeNull();
    expect(getLifePhotoRevealFlow(1, true, true)).toBeNull();
  });
});
