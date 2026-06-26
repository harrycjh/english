import { describe, expect, it } from 'vitest';
import type { WordRecord } from '../models/word';
import { defaultParentSetting } from '../models/parent-setting';
import { createEmptyRecord } from './spaced-repetition';
import { buildQuestion } from './question-service';

function makeWord(overrides: Partial<WordRecord>): WordRecord {
  return {
    id: 'ket_test_n',
    english: 'test',
    partOfSpeech: 'n',
    chinese: '测试',
    category: '测试分类',
    difficulty: 1,
    imagePath: '/content/images/words/ket_test_n.webp',
    imageApproved: true,
    oxfordRefs: [],
    ...overrides,
  };
}

describe('buildQuestion', () => {
  it('falls back to text choice when image questions are enabled but the word image is not approved', () => {
    const target = makeWord({ id: 'ket_target_n', chinese: '目标', imageApproved: false });
    const allWords = [
      target,
      makeWord({ id: 'ket_a_n', chinese: '甲' }),
      makeWord({ id: 'ket_b_n', chinese: '乙' }),
      makeWord({ id: 'ket_c_n', chinese: '丙' }),
    ];

    const question = buildQuestion(
      target,
      allWords,
      createEmptyRecord(target.id),
      { ...defaultParentSetting, showImages: true }
    );

    expect(question.kind).toBe('text-choice');
  });

  it('uses partial fill blank for mastery level 5', () => {
    const target = makeWord({ id: 'ket_rabbit_n', english: 'rabbit', chinese: '兔子' });
    const record = { ...createEmptyRecord(target.id), masteryLevel: 5, reviewStage: 5 };

    const question = buildQuestion(target, [target], record, defaultParentSetting);

    expect(question.kind).toBe('fill-blank');
    if (question.kind === 'fill-blank') {
      expect(question.missingLetters.length).toBeGreaterThan(0);
      expect(question.missingLetters.length).toBeLessThan(target.english.length);
    }
  });

  it('uses full-word fill blank for mastery level 6', () => {
    const target = makeWord({ id: 'ket_rabbit_n', english: 'rabbit', chinese: '兔子' });
    const record = { ...createEmptyRecord(target.id), masteryLevel: 6, reviewStage: 6 };

    const question = buildQuestion(target, [target], record, defaultParentSetting);

    expect(question.kind).toBe('fill-blank');
    if (question.kind === 'fill-blank') {
      expect(question.maskedCharacters).toEqual(['_', '_', '_', '_', '_', '_']);
      expect(question.missingLetters).toEqual(['r', 'a', 'b', 'b', 'i', 't']);
    }
  });
});
