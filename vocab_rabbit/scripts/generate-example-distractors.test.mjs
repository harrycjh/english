import { describe, expect, it } from 'vitest';

import {
  applyDistractors,
  buildDistractorCandidateIds,
  collectDistractorTargets,
  maskHeadword,
} from './generate-example-distractors.mjs';

function word(id, english, partOfSpeech = 'v') {
  return {
    id,
    english,
    chinese: english,
    partOfSpeech,
    category: '动作',
    difficulty: 1,
    examples: [`I ${english} today.`, `We ${english} after school.`],
    exampleTranslations: ['示例。', '示例。'],
    exampleCollocations: ['', `${english} after school`],
  };
}

describe('example distractor generation', () => {
  const words = [word('target', 'play'), word('a', 'walk'), word('b', 'read'), word('c', 'sleep')];

  it('builds deterministic same-part-of-speech candidate pools', () => {
    expect(buildDistractorCandidateIds(words[0], words, 1)).toEqual(
      buildDistractorCandidateIds(words[0], words, 1),
    );
    expect(new Set(buildDistractorCandidateIds(words[0], words, 1))).toEqual(new Set(['a', 'b', 'c']));
  });

  it('excludes candidates with the same locked Chinese meaning', () => {
    const target = { ...word('target', 'mom', 'n'), chinese: '妈妈' };
    const synonym = { ...word('synonym', 'mother', 'n'), chinese: '妈妈' };
    const unrelated = { ...word('unrelated', 'chair', 'n'), chinese: '椅子' };
    expect(buildDistractorCandidateIds(target, [target, synonym, unrelated], 1)).toEqual(['unrelated']);
  });

  it('infers malformed source part-of-speech values from word IDs', () => {
    const target = { ...word('ket_mum_n_br_eng', 'mum', 'Br Eng'), chinese: '妈妈' };
    const noun = { ...word('ket_chair_n', 'chair', 'n'), chinese: '椅子' };
    const verb = { ...word('ket_walk_v', 'walk', 'v'), chinese: '走路' };
    expect(buildDistractorCandidateIds(target, [target, noun, verb], 1, 1)).toEqual(['ket_chair_n']);
  });

  it('shows the model the actual inflected cloze', () => {
    expect(maskHeadword('My great-aunt lives nearby.', 'aunt')).toBe('My great-_____ lives nearby.');
    expect(maskHeadword('We went to the park.', 'go')).toBe('We _____ to the park.');
  });

  it('collects only added collocation examples', () => {
    expect(collectDistractorTargets({ words })).toEqual([
      expect.objectContaining({ key: 'target::1', collocation: 'play after school' }),
      expect.objectContaining({ key: 'a::1' }),
      expect.objectContaining({ key: 'b::1' }),
      expect.objectContaining({ key: 'c::1' }),
    ]);
  });

  it('stores selections at their source example indexes', () => {
    const vocabulary = { words: [structuredClone(words[0])] };
    applyDistractors(vocabulary, [{ key: 'target::1', distractorIds: ['a', 'b', 'c'] }]);
    expect(vocabulary.words[0].exampleDistractorIds).toEqual([[], ['a', 'b', 'c']]);
  });
});
