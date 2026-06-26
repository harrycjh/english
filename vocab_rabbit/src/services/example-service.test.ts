import { describe, expect, it } from 'vitest';
import type { WordRecord } from '../models/word';
import { getExampleSentences } from './example-service';

function makeWord(overrides: Partial<WordRecord>): WordRecord {
  return {
    id: 'ket_cat_n',
    english: 'cat',
    partOfSpeech: 'n',
    chinese: '猫',
    category: '动物',
    difficulty: 1,
    imagePath: '/content/images/words/ket_cat_n.webp',
    imageApproved: true,
    oxfordRefs: [],
    ...overrides,
  };
}

describe('getExampleSentences', () => {
  it('returns curated examples before generated fallback examples', () => {
    const word = makeWord({ examples: ['The cat is sleeping.'] });

    expect(getExampleSentences(word)).toEqual(['The cat is sleeping.']);
  });

  it('generates a fallback sentence when the word has no curated examples', () => {
    const word = makeWord({ english: 'bike' });

    expect(getExampleSentences(word)[0]).toContain('bike');
  });
});
