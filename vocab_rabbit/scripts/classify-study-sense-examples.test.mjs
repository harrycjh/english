import { describe, expect, it } from 'vitest';

import {
  applyStudySenseResults,
  collectStudySenseTargets,
} from './classify-study-sense-examples.mjs';

const word = {
  id: 'ket_back_n_adv',
  english: 'back',
  partOfSpeech: 'n & adv',
  chinese: '背部；回来',
  studySense: { partOfSpeech: 'n', chinese: '背部', examples: ['My back hurts.'] },
  examples: ['My back hurts.', 'Please come back.', 'Lie on your back.'],
  exampleTranslations: ['我的背疼。', '请回来。', '请仰卧。'],
  exampleCollocations: ['', 'come back', 'on your back'],
  teachingChunks: [
    { phrase: 'come back', chinese: '回来', sense: 'return' },
    { phrase: 'on your back', chinese: '仰卧', sense: 'lying with your back down' },
  ],
};

describe('study-sense example classification', () => {
  it('collects added examples from words with a locked study sense', () => {
    expect(collectStudySenseTargets({ words: [word] })).toEqual([
      expect.objectContaining({ key: 'ket_back_n_adv::1', collocation: 'come back' }),
      expect.objectContaining({ key: 'ket_back_n_adv::2', collocation: 'on your back' }),
    ]);
  });

  it('enables only examples accepted by both reviewers', () => {
    const vocabulary = { words: [structuredClone(word)] };
    applyStudySenseResults(vocabulary, [
      { id: word.id, exampleIndex: 1, aligned: false },
      { id: word.id, exampleIndex: 2, aligned: true },
    ]);
    expect(vocabulary.words[0].studySense.exampleIndexes).toEqual([0, 2]);
    expect(vocabulary.words[0].studySense.examples).toEqual(['My back hurts.', 'Lie on your back.']);
  });
});
