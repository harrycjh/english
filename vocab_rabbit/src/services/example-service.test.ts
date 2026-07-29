import { describe, expect, it } from 'vitest';
import type { WordRecord } from '../models/word';
import {
  getExamplePairForLevel,
  getExampleSentences,
  getExampleSlotForLevel,
  getExampleTranslationFocus,
  getExampleTranslations,
} from './example-service';

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

  it('keeps up to three curated examples for staged learning', () => {
    const word = makeWord({
      examples: [
        'The cat is sleeping.',
        'The cat climbed a tree.',
        'The cat sat by the window.',
        'The cat found a toy.',
      ],
    });

    expect(getExampleSentences(word)).toEqual([
      'The cat is sleeping.',
      'The cat climbed a tree.',
      'The cat sat by the window.',
    ]);
  });

  it('does not invent a generic fallback when the word has no curated examples', () => {
    const word = makeWord({ english: 'bike' });

    expect(getExampleSentences(word)).toEqual([]);
  });

  it('uses examples from the selected study sense instead of a conflicting general example', () => {
    const word = makeWord({
      english: 'can',
      partOfSpeech: 'n & mv',
      chinese: '能；会；罐；罐头',
      examples: ['She opened a can of soup.'],
      studySense: {
        partOfSpeech: 'mv',
        chinese: '能；会',
        examples: ['The boy can ride a bike.'],
      },
    });

    expect(getExampleSentences(word)).toEqual(['The boy can ride a bike.']);
  });
});

describe('getExampleTranslations', () => {
  it('returns trimmed curated translations', () => {
    expect(getExampleTranslations(makeWord({
      exampleTranslations: ['  这只猫正在睡觉。  '],
    }))).toEqual(['这只猫正在睡觉。']);
  });

  it('returns no translation when none is stored', () => {
    expect(getExampleTranslations(makeWord({}))).toEqual([]);
  });
});

describe('getExamplePairForLevel', () => {
  const word = makeWord({
    examples: [
      'The cat is sleeping.',
      'The cat climbed a tree.',
      'The cat sat by the window.',
    ],
    exampleTranslations: [
      '这只猫正在睡觉。',
      '这只猫爬上了一棵树。',
      '这只猫坐在窗边。',
    ],
  });

  it('maps review levels to three different example slots', () => {
    expect(getExampleSlotForLevel(0)).toBe(0);
    expect(getExampleSlotForLevel(1)).toBe(0);
    expect(getExampleSlotForLevel(4)).toBe(0);
    expect(getExampleSlotForLevel(7)).toBe(0);
    expect(getExampleSlotForLevel(2)).toBe(1);
    expect(getExampleSlotForLevel(5)).toBe(1);
    expect(getExampleSlotForLevel(8)).toBe(1);
    expect(getExampleSlotForLevel(3)).toBe(2);
    expect(getExampleSlotForLevel(6)).toBe(2);
    expect(getExampleSlotForLevel(9)).toBe(2);
  });

  it('returns the level-specific bilingual example and falls back to the last available one', () => {
    expect(getExamplePairForLevel(word, 5)).toEqual({
      sentence: 'The cat climbed a tree.',
      translation: '这只猫爬上了一棵树。',
    });
    expect(getExamplePairForLevel(word, 9)).toEqual({
      sentence: 'The cat sat by the window.',
      translation: '这只猫坐在窗边。',
    });
    expect(getExamplePairForLevel(makeWord({
      examples: ['The cat is sleeping.'],
      exampleTranslations: ['这只猫正在睡觉。'],
    }), 9)).toEqual({
      sentence: 'The cat is sleeping.',
      translation: '这只猫正在睡觉。',
    });
  });
});

describe('getExampleTranslationFocus', () => {
  it('returns the exact translated phrase to emphasize', () => {
    expect(getExampleTranslationFocus(makeWord({
      exampleTranslationFocus: ['  家人  '],
    }))).toEqual(['家人']);
  });

  it('returns no phrase when none is stored', () => {
    expect(getExampleTranslationFocus(makeWord({}))).toEqual([]);
  });
});
