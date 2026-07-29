import { describe, expect, it } from 'vitest';
import type { WordRecord } from '../models/word';
import { defaultParentSetting } from '../models/parent-setting';
import { createEmptyRecord, evaluateAnswer } from './spaced-repetition';
import { buildQuestion, buildSimilarLetterOptions } from './question-service';

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

const target = makeWord({
  id: 'ket_rabbit_n',
  english: 'rabbit',
  chinese: '兔子',
  examples: [
    'The rabbit eats a fresh carrot.',
    'The rabbit sleeps under the table.',
    'The rabbit hops across the garden.',
  ],
  exampleTranslations: [
    '这只兔子吃了一根新鲜的胡萝卜。',
    '这只兔子睡在桌子下面。',
    '这只兔子跳过花园。',
  ],
  exampleTranslationFocus: ['兔子', '兔子', '兔子'],
});
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

  it('uses Comfy image questions with Chinese answers at level 1 and English answers at level 2', () => {
    expect(questionAt(1)).toMatchObject({ kind: 'image-choice', imageStrategy: 'comfy' });
    const englishQuestion = questionAt(2);
    expect(englishQuestion).toMatchObject({
      kind: 'image-english-choice',
      imageStrategy: 'comfy',
      correctAnswer: 'rabbit',
    });
    if (englishQuestion.kind === 'image-english-choice') {
      expect(englishQuestion.options).toHaveLength(4);
    }
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

  it('uses a validated sentence cloze with four word choices at level 5', () => {
    const question = questionAt(5);
    expect(question.kind).toBe('sentence-choice');
    if (question.kind !== 'sentence-choice') return;
    expect(question.maskedSentence).toContain('_____');
    expect(question.sentence).toBe('The rabbit sleeps under the table.');
    expect(question.sentenceTranslation).toBe('这只兔子睡在桌子下面。');
    expect(question.sentenceTranslationFocus).toBe('兔子');
    expect(question.options).toHaveLength(4);
    expect(question.correctAnswer).toBe('rabbit');
  });

  it('uses the sentence tense for every regular-verb option at level 5', () => {
    const discovered = makeWord({
      id: 'ket_discover_v',
      english: 'discover',
      partOfSpeech: 'v',
      chinese: '发现',
      category: '动作',
      examples: ['I discovered a new toy.'],
      exampleTranslations: ['我发现了一个新玩具。'],
      exampleTranslationFocus: ['发现'],
    });
    const verbOptions = [
      discovered,
      makeWord({ id: 'ket_answer_v', english: 'answer', partOfSpeech: 'v', category: '动作' }),
      makeWord({ id: 'ket_study_v', english: 'study', partOfSpeech: 'v', category: '动作' }),
      makeWord({ id: 'ket_stop_v', english: 'stop', partOfSpeech: 'v', category: '动作' }),
    ];
    const question = buildQuestion(
      discovered,
      verbOptions,
      { ...createEmptyRecord(discovered.id), masteryLevel: 5, reviewStage: 5 },
      defaultParentSetting,
    );

    expect(question.kind).toBe('sentence-choice');
    if (question.kind !== 'sentence-choice') return;
    expect(question.correctAnswer).toBe('discovered');
    expect(new Set(question.options)).toEqual(new Set(['discovered', 'answered', 'studied', 'stopped']));
  });

  it('uses matching irregular past forms for every option at level 5', () => {
    const went = makeWord({
      id: 'ket_go_v',
      english: 'go',
      partOfSpeech: 'v',
      chinese: '去',
      category: '动作',
      examples: ['We went to the park yesterday.'],
      exampleTranslations: ['我们昨天去了公园。'],
      exampleTranslationFocus: ['去'],
    });
    const verbOptions = [
      went,
      makeWord({ id: 'ket_eat_v', english: 'eat', partOfSpeech: 'v', category: '动作' }),
      makeWord({ id: 'ket_see_v', english: 'see', partOfSpeech: 'v', category: '动作' }),
      makeWord({ id: 'ket_take_v', english: 'take', partOfSpeech: 'v', category: '动作' }),
    ];
    const question = buildQuestion(
      went,
      verbOptions,
      { ...createEmptyRecord(went.id), masteryLevel: 5, reviewStage: 5 },
      defaultParentSetting,
    );

    expect(question.kind).toBe('sentence-choice');
    if (question.kind !== 'sentence-choice') return;
    expect(question.correctAnswer).toBe('went');
    expect(new Set(question.options)).toEqual(new Set(['went', 'ate', 'saw', 'took']));
  });

  it('masks one or two continuous letters with four choices at level 6', () => {
    const question = questionAt(6);
    expect(question.kind).toBe('letter-choice');
    if (question.kind !== 'letter-choice') return;
    const positions = missingPositions(question.maskedCharacters);
    expect(positions.length).toBeGreaterThanOrEqual(1);
    expect(positions.length).toBeLessThanOrEqual(2);
    expect(positions.every((position, index) => index === 0 || position === positions[index - 1] + 1)).toBe(true);
    expect(question.options).toHaveLength(4);
  });

  it('builds same-length, case-preserving letter distractors from nearby or similar keys', () => {
    const lowercaseOptions = buildSimilarLetterOptions('ac');
    const uppercaseOptions = buildSimilarLetterOptions('M');

    expect(lowercaseOptions).toHaveLength(4);
    expect(new Set(lowercaseOptions).size).toBe(4);
    expect(lowercaseOptions).toContain('ac');
    expect(lowercaseOptions.every((option) => option.length === 2)).toBe(true);
    expect(uppercaseOptions).toContain('M');
    expect(uppercaseOptions.every((option) => option === option.toUpperCase())).toBe(true);
  });

  it('uses a two-to-four-letter text entry at level 7', () => {
    const question = questionAt(7);
    expect(question.kind).toBe('fill-blank');
    if (question.kind !== 'fill-blank') return;
    const positions = missingPositions(question.maskedCharacters);
    expect(positions.length).toBeGreaterThanOrEqual(2);
    expect(positions.length).toBeLessThanOrEqual(4);
    expect(question.inputMode).toBe('partial');
  });

  it('uses full-word spelling from level 8 onward', () => {
    for (const level of [8, 9, 10]) {
      const question = questionAt(level);
      expect(question.kind).toBe('fill-blank');
      if (question.kind === 'fill-blank') {
        expect(question.maskedCharacters).toEqual(['_', '_', '_', '_', '_', '_']);
        expect(question.missingLetters).toEqual(['r', 'a', 'b', 'b', 'i', 't']);
        expect(question.inputMode).toBe('full');
      }
    }
  });

  it('preserves the original letter case when revealing an uppercase spelling answer', () => {
    const uppercaseWord = makeWord({
      id: 'ket_dvd_n',
      english: 'DVD',
      chinese: 'DVD',
    });
    const question = buildQuestion(
      uppercaseWord,
      [uppercaseWord, ...allWords],
      { ...createEmptyRecord(uppercaseWord.id), masteryLevel: 8, reviewStage: 8 },
      defaultParentSetting,
    );

    expect(question.kind).toBe('fill-blank');
    if (question.kind !== 'fill-blank') return;
    expect(question.missingLetters).toEqual(['D', 'V', 'D']);
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
    expect(spellingQuestion.prompt).toBe('');
  });

  it('keeps the selected shopping sense of change in the visible choices', () => {
    const change = makeWord({
      id: 'ket_change_v_n',
      english: 'change',
      partOfSpeech: 'v & n',
      chinese: '改变；零钱',
      category: '购物买东西',
      studySense: {
        partOfSpeech: 'n',
        chinese: '零钱',
        examples: ['I gave her some change for the coffee.'],
      },
    });
    const question = buildQuestion(
      change,
      [change, ...allWords],
      { ...createEmptyRecord(change.id), masteryLevel: 4, reviewStage: 4 },
      defaultParentSetting,
    );

    expect(question).toMatchObject({ kind: 'text-choice', correctAnswer: '零钱' });
    if (question.kind === 'text-choice') expect(question.options).toContain('零钱');
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
