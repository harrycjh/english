import { describe, expect, it } from 'vitest';

import {
  collectAdjudicationTargets,
  normalizeAdjudication,
} from './adjudicate-teaching-chunk-example-review.mjs';

const target = {
  key: 'ket_take_v::0',
  phrase: 'take part in',
  sentence: 'I take part in the race.',
  translation: '我参加比赛。',
  translationFocus: '参加',
  reviewedSentence: 'I took part in the race.',
  reviewedTranslation: '我参加了比赛。',
  reviewedTranslationFocus: '参加',
};

describe('teaching chunk example adjudication', () => {
  it('collects only flagged review items', () => {
    expect(collectAdjudicationTargets({
      items: [{ key: 'pass', verdict: 'pass' }, { key: 'revise', verdict: 'revise' }],
    })).toEqual([{ key: 'revise', verdict: 'revise' }]);
  });

  it('selects a valid reviewer revision', () => {
    expect(normalizeAdjudication(target, {
      decision: 'revision',
      reason: 'better tense alignment',
      sentence: '',
      translation: '',
      translationFocus: '',
    })).toEqual(expect.objectContaining({
      decision: 'revision',
      finalSentence: 'I took part in the race.',
      finalTranslation: '我参加了比赛。',
    }));
  });

  it('falls back to manual when a rewrite drops the fixed expression', () => {
    expect(normalizeAdjudication(target, {
      decision: 'rewrite',
      reason: 'rewrite it',
      sentence: 'I watched the race.',
      translation: '我观看了比赛。',
      translationFocus: '观看',
    })).toEqual(expect.objectContaining({
      decision: 'manual',
      finalSentence: target.sentence,
    }));
  });
});
