import { describe, expect, it } from 'vitest';

import {
  collectQwenExamples,
  deterministicReview,
} from './review-teaching-chunk-examples.mjs';

describe('teaching chunk example review', () => {
  it('collects only Qwen-generated examples with their teaching context', () => {
    const vocabulary = {
      words: [{
        id: 'ket_take_v',
        english: 'take',
        chinese: '拿',
        partOfSpeech: 'v',
        teachingChunks: [
          { phrase: 'take part in', chinese: '参加', sense: 'join an activity', cefr: 'A2' },
          { phrase: 'take place', chinese: '发生', sense: 'happen', cefr: 'A2' },
        ],
      }],
    };
    const examples = {
      entries: [{
        id: 'ket_take_v',
        examples: [
          {
            phrase: 'take part in',
            sentence: 'We took part in the race.',
            translation: '我们参加了比赛。',
            translationFocus: '参加',
            sentenceSource: 'qwen',
          },
          {
            phrase: 'take place',
            sentence: 'The show took place yesterday.',
            translation: '演出昨天举行了。',
            translationFocus: '举行',
            sentenceSource: 'phrase-list',
          },
        ],
      }],
    };

    expect(collectQwenExamples(vocabulary, examples)).toEqual([
      expect.objectContaining({
        key: 'ket_take_v::0',
        phrase: 'take part in',
        phraseChinese: '参加',
      }),
    ]);
  });

  it('flags deterministic sentence and translation failures', () => {
    const target = {
      phrase: 'take part in',
      sentence: 'I watched the race',
      translation: 'I watched the race.',
      translationFocus: '比赛',
    };
    expect(deterministicReview(target)).toEqual(expect.arrayContaining([
      'missing_chunk',
      'english_format',
      'missing_chinese',
      'chinese_format',
      'focus_mismatch',
    ]));
  });

  it('accepts normal inflection and an aligned translation focus', () => {
    expect(deterministicReview({
      phrase: 'take part in',
      sentence: 'Our class took part in the race.',
      translation: '我们班参加了比赛。',
      translationFocus: '参加',
    })).toEqual([]);
  });
});
