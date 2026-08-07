import { describe, expect, it } from 'vitest';
import {
  AFTER_LEVEL_UP_ADVANCE_DELAY_MS,
  getLearningAnswerFlow,
  getLifePhotoRevealFlow,
  getUpgradeWaitSegments,
  LEVEL_UP_ANIMATION_MS,
} from './learning-answer-flow';

describe('getLearningAnswerFlow', () => {
  it('moves a wrong level 5 question to the queue tail instead of reopening it immediately', () => {
    expect(getLearningAnswerFlow(5, false, false)).toEqual({
      retrySameQuestion: false,
      requiresManualContinue: false,
      holdAfterFeedbackMs: 2_000,
    });
  });

  it.each([4, 6, 8])('requires a manual continue after a correct related-page reveal at level %i', (level) => {
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

  it('keeps the level-up cue in the final part of the wait', () => {
    expect(getUpgradeWaitSegments(2_000, true)).toEqual({
      beforeUpgradeMs: 1_100,
      upgradeMs: 900,
    });
    expect(getUpgradeWaitSegments(3_000, true)).toEqual({
      beforeUpgradeMs: 2_100,
      upgradeMs: 900,
    });
    expect(getUpgradeWaitSegments(2_000, false)).toEqual({
      beforeUpgradeMs: 2_000,
      upgradeMs: 0,
    });
  });

  it('keeps a two-second pause after the level-up animation before advancing', () => {
    expect(LEVEL_UP_ANIMATION_MS).toBe(900);
    expect(AFTER_LEVEL_UP_ADVANCE_DELAY_MS).toBe(2_000);
  });
});
