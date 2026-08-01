import { describe, expect, it } from 'vitest';

import { finalExampleFor } from './apply-teaching-chunk-example-review.mjs';

describe('apply teaching chunk example review', () => {
  it('keeps the original when adjudication rejects the revision', () => {
    const target = {
      key: 'ket_take_v::0',
      sentence: 'We take part in the race.',
      translation: '我们参加比赛。',
      translationFocus: '参加',
    };
    expect(finalExampleFor(target, { decision: 'original' })).toEqual({
      sentence: target.sentence,
      translation: target.translation,
      translationFocus: target.translationFocus,
    });
  });

  it('uses an adjudicated revision', () => {
    const target = {
      key: 'ket_take_v::0',
      sentence: 'Old sentence.',
      translation: '旧句子。',
      translationFocus: '旧',
    };
    expect(finalExampleFor(target, {
      decision: 'revision',
      finalSentence: 'We took part in the race.',
      finalTranslation: '我们参加了比赛。',
      finalTranslationFocus: '参加',
    })).toEqual({
      sentence: 'We took part in the race.',
      translation: '我们参加了比赛。',
      translationFocus: '参加',
    });
  });

  it('prefers a manual override for a known invalid model suggestion', () => {
    const target = {
      key: 'ket_traffic_n::0',
      sentence: 'The officer managed traffic control.',
      translation: '警官管理交通控制。',
      translationFocus: '交通控制',
    };
    expect(finalExampleFor(target, { decision: 'rewrite' })).toEqual({
      sentence: 'Traffic control kept cars moving safely.',
      translation: '交通管制让车辆安全通行。',
      translationFocus: '交通管制',
    });
  });
});
