import { describe, expect, it } from 'vitest';
import { defaultParentSetting, normalizeParentSetting } from './parent-setting';

describe('parent setting normalization', () => {
  it('starts a new device at eight new words and eighty reviews', () => {
    expect(defaultParentSetting.dailyNewWordCount).toBe(8);
    expect(defaultParentSetting.dailyReviewLimit).toBe(80);
  });

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

  it('adds default voice selections to settings saved before voice selection existed', () => {
    expect(normalizeParentSetting({
      enableAudio: true,
    })).toMatchObject({
      englishVoiceURI: '',
      chineseVoiceURI: '',
      newWordQueue: [],
    });
  });

  it('normalizes the ordered new-word queue without duplicates or empty ids', () => {
    expect(normalizeParentSetting({
      ...defaultParentSetting,
      newWordQueue: ['word-b', '', 'word-a', 'word-b'],
    }).newWordQueue).toEqual(['word-b', 'word-a']);
  });

  it('remembers which backpack items are being worn', () => {
    expect(normalizeParentSetting({
      ...defaultParentSetting,
      mascotSceneId: 'cyber',
      focusSceneId: 'kennel',
    })).toMatchObject({
      mascotSceneId: 'cyber',
      focusSceneId: 'kennel',
    });
  });

  it('dresses settings saved before the backpack existed in the free items', () => {
    expect(normalizeParentSetting({
      enableAudio: true,
      mascotSceneId: '  ',
    })).toMatchObject({
      mascotSceneId: 'default',
      focusSceneId: 'default',
    });
  });
});
