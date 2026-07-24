import { describe, expect, it } from 'vitest';
import type { WordRecord } from '../models/word';
import { defaultParentSetting } from '../models/parent-setting';
import { createEmptyRecord, evaluateAnswer } from './spaced-repetition';
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

const target = makeWord({ id: 'ket_rabbit_n', english: 'rabbit', chinese: '兔子' });
const allWords = [
  target,
  makeWord({ id: 'ket_cat_n', english: 'cat', chinese: '猫' }),
  makeWord({ id: 'ket_dog_n', english: 'dog', chinese: '狗' }),
  makeWord({ id: 'ket_bird_n', english: 'bird', chinese: '鸟' }),
];

function questionAt(level: number) {
  return buildQuestion(
    target,
    allWords,
    { ...createEmptyRecord(target.id), masteryLevel: level, reviewStage: level },
    defaultParentSetting,
  );
}

function missingPositions(maskedCharacters: string[]): number[] {
  return maskedCharacters.flatMap((character, index) => character === '_' ? [index] : []);
}

describe('buildQuestion', () => {
  it('starts at level 0 with the recognition screen and the Comfy image', () => {
    const question = questionAt(0);
    expect(question).toMatchObject({
      kind: 'recognition',
      options: ['认识', '不认识'],
      imageStrategy: 'comfy',
    });
  });

  it('uses Comfy at level 1 and prioritized related media at level 2', () => {
    expect(questionAt(1)).toMatchObject({ kind: 'image-choice', imageStrategy: 'comfy' });
    expect(questionAt(2)).toMatchObject({ kind: 'image-choice', imageStrategy: 'related-priority' });
  });

  it('uses four image answers at level 3 and Chinese answers at level 4', () => {
    const imageQuestion = questionAt(3);
    expect(imageQuestion.kind).toBe('image-answer-choice');
    if (imageQuestion.kind === 'image-answer-choice') {
      expect(imageQuestion.imageStrategy).toBe('comfy');
      expect(imageQuestion.options).toHaveLength(4);
      expect(imageQuestion.correctAnswer).toBe(target.id);
    }
    expect(questionAt(4).kind).toBe('text-choice');
  });

  it.each([
    [5, 1, 2],
    [6, 2, 4],
  ])('masks one continuous run at level %i', (level, minimum, maximum) => {
    const question = questionAt(level);
    expect(question.kind).toBe('fill-blank');
    if (question.kind !== 'fill-blank') return;
    const positions = missingPositions(question.maskedCharacters);
    expect(positions.length).toBeGreaterThanOrEqual(minimum);
    expect(positions.length).toBeLessThanOrEqual(Math.min(maximum, target.english.length));
    expect(positions.every((position, index) => index === 0 || position === positions[index - 1] + 1)).toBe(true);
  });

  it('uses four keyboard choices for the level 5 spelling prompt', () => {
    const question = questionAt(5);
    expect(question.kind).toBe('fill-blank');
    if (question.kind === 'fill-blank') {
      expect(question.keyboardLetters).toHaveLength(4);
    }
  });

  it('uses full-word spelling from level 7 onward', () => {
    for (const level of [7, 8, 9, 10]) {
      const question = questionAt(level);
      expect(question.kind).toBe('fill-blank');
      if (question.kind === 'fill-blank') {
        expect(question.maskedCharacters).toEqual(['_', '_', '_', '_', '_', '_']);
        expect(question.missingLetters).toEqual(['r', 'a', 'b', 'b', 'i', 't']);
      }
    }
  });

  it('uses the selected study sense for Chinese choices and spelling prompts', () => {
    const polysemousWord = makeWord({
      id: 'ket_can_n_mv',
      english: 'can',
      partOfSpeech: 'n & mv',
      chinese: '能；会；罐；罐头',
      studySense: {
        partOfSpeech: 'mv',
        chinese: '能；会',
        examples: ['The boy can ride a bike.'],
      },
    });
    const vocabulary = [polysemousWord, ...allWords];
    const choiceQuestion = buildQuestion(
      polysemousWord,
      vocabulary,
      { ...createEmptyRecord(polysemousWord.id), masteryLevel: 1, reviewStage: 1 },
      defaultParentSetting,
    );
    expect(choiceQuestion).toMatchObject({
      kind: 'image-choice',
      correctAnswer: '能；会',
    });
    if (choiceQuestion.kind === 'image-choice') {
      expect(choiceQuestion.options).toContain('能；会');
      expect(choiceQuestion.options).not.toContain('能；会；罐；罐头');
    }

    const spellingQuestion = buildQuestion(
      polysemousWord,
      vocabulary,
      { ...createEmptyRecord(polysemousWord.id), masteryLevel: 8, reviewStage: 8 },
      defaultParentSetting,
    );
    expect(spellingQuestion.prompt).toBe('能；会 的英语怎么拼？');
  });

  it('uses the downgraded level question when verifying after three wrong answers', () => {
    const levelFiveRecord = {
      ...createEmptyRecord(target.id),
      masteryLevel: 5,
      reviewStage: 5,
    };
    const downgradedRecord = evaluateAnswer(
      levelFiveRecord,
      false,
      new Date('2026-07-21T08:00:00.000Z'),
      'answer',
      true,
    );

    expect(downgradedRecord.masteryLevel).toBe(4);
    expect(buildQuestion(target, allWords, downgradedRecord, defaultParentSetting).kind).toBe('text-choice');
  });
});
