import { describe, expect, it } from 'vitest';
import { defaultParentSetting, normalizeParentSetting } from './parent-setting';

describe('parent setting normalization', () => {
  it('does not cap daily new words or the daily review limit', () => {
    expect(normalizeParentSetting({
      ...defaultParentSetting,
      dailyNewWordCount: 120,
      dailyReviewLimit: 500,
    })).toMatchObject({
      dailyNewWordCount: 120,
      dailyReviewLimit: 500,
    });
  });

  it('keeps minimums and stores whole finite counts', () => {
    expect(normalizeParentSetting({
      ...defaultParentSetting,
      dailyNewWordCount: 1,
      dailyReviewLimit: 7.8,
    })).toMatchObject({
      dailyNewWordCount: 3,
      dailyReviewLimit: 7,
    });
  });
});
