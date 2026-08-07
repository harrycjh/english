import { describe, expect, it } from 'vitest';
import type { WordRecord } from '../models/word';
import type { Question } from './question-service';
import {
  getStudyAudioPlan,
  splitRelatedResultAudio,
  WORD_TO_SENTENCE_PAUSE_MS,
} from './study-audio-plan';

const word: WordRecord = {
  id: 'ket_rabbit_n',
  english: 'rabbit',
  chinese: '兔子',
  partOfSpeech: 'n',
  category: '动物',
  difficulty: 1,
  imagePath: '/rabbit.webp',
  imageApproved: true,
  oxfordRefs: [],
  examples: [
    'The rabbit eats a carrot.',
    'The rabbit sleeps under the table.',
    'The rabbit hops across the garden.',
  ],
  exampleTranslations: [
    '兔子吃了一根胡萝卜。',
    '兔子睡在桌子下面。',
    '兔子跳过花园。',
  ],
  relatedMedia: {
    oxford: {
      imagePath: '/content/images/oxford-tree/level-1/book-1/page-4.webp',
      label: 'Level 1, Book 1, Page 4',
      level: 1,
      book: 1,
      page: 4,
      sentence: 'The rabbit ran into the garden.',
      sentenceTranslation: '兔子跑进了花园。',
    },
    redRocket: {
      atlasPath: '/content/images/red-rocket-atlases/atlas-001.webp',
      row: 0,
      column: 1,
      label: 'Early Level 1, Rabbits, Page 4',
      level: 'Early Level 1',
      title: 'Rabbits',
      page: 4,
      matchKind: 'exact',
      matchedTerm: 'rabbit',
      confidence: 0.94,
      sentence: 'The rabbit hops across the grass.',
      sentenceTranslation: '兔子跳过草地。',
    },
    raz: {
      atlasPath: '/content/images/raz-atlases/atlas-001.webp',
      row: 1,
      column: 2,
      label: 'Level E, E08 Rabbits, Page 6',
      bookId: 'E08',
      level: 'E',
      sequence: 8,
      title: 'Rabbits',
      page: 6,
      matchKind: 'exact',
      matchedTerm: 'rabbit',
      matchedForm: 'rabbit',
      sentence: 'A rabbit can hear danger coming.',
      sentenceTranslation: '兔子能听到危险正在靠近。',
    },
  },
};

function question(kind: Question['kind'] = 'text-choice'): Question {
  if (kind === 'sentence-choice') {
    return {
      kind,
      prompt: '',
      studyText: 'rabbit',
      word,
      sentence: 'The rabbit eats a carrot.',
      sentenceTranslation: '兔子吃了一根胡萝卜。',
      sentenceTranslationFocus: '兔子',
      maskedSentence: 'The _____ eats a carrot.',
      options: ['rabbit', 'cat', 'dog', 'bird'],
      correctAnswer: 'rabbit',
    };
  }
  return {
    kind: 'text-choice',
    prompt: '',
    studyText: 'rabbit',
    word,
    options: ['兔子', '猫', '狗', '鸟'],
    correctAnswer: '兔子',
  };
}

describe('study audio plan', () => {
  it.each([0, 1])('reads the word before and the Chinese meaning plus bilingual example after level %i', (level) => {
    expect(getStudyAudioPlan(level, question())).toEqual({
      beforeAnswer: [{ text: 'rabbit', lang: 'en-GB' }],
      afterAnswer: [
        { text: '兔子', lang: 'zh-CN' },
        { text: 'The rabbit eats a carrot.', lang: 'en-GB', rate: 0.86 },
        { text: '兔子吃了一根胡萝卜。', lang: 'zh-CN' },
      ],
    });
  });

  it('also reads the bilingual example after a wrong level 1 answer', () => {
    expect(getStudyAudioPlan(1, question(), false).afterAnswer).toEqual([
      { text: '兔子', lang: 'zh-CN' },
      { text: 'The rabbit eats a carrot.', lang: 'en-GB', rate: 0.86 },
      { text: '兔子吃了一根胡萝卜。', lang: 'zh-CN' },
    ]);
  });

  it('reads Chinese before level 2 and the word plus bilingual example after it', () => {
    expect(getStudyAudioPlan(2, question())).toEqual({
      beforeAnswer: [{ text: '兔子', lang: 'zh-CN' }],
      afterAnswer: [
        { text: 'rabbit', lang: 'en-GB', pauseAfterMs: WORD_TO_SENTENCE_PAUSE_MS },
        { text: 'The rabbit sleeps under the table.', lang: 'en-GB', rate: 0.86 },
        { text: '兔子睡在桌子下面。', lang: 'zh-CN' },
      ],
    });
  });

  it('reads English before and an example sentence after a correct level 3 answer', () => {
    expect(getStudyAudioPlan(3, question(), true)).toEqual({
      beforeAnswer: [{ text: 'rabbit', lang: 'en-GB' }],
      afterAnswer: [
        { text: 'The rabbit hops across the garden.', lang: 'en-GB', rate: 0.86 },
        { text: '兔子跳过花园。', lang: 'zh-CN' },
      ],
    });
  });

  it('reads the word and bilingual example after a wrong level 3 answer', () => {
    expect(getStudyAudioPlan(3, question(), false)).toEqual({
      beforeAnswer: [{ text: 'rabbit', lang: 'en-GB' }],
      afterAnswer: [
        { text: 'rabbit', lang: 'en-GB', pauseAfterMs: WORD_TO_SENTENCE_PAUSE_MS },
        { text: 'The rabbit hops across the garden.', lang: 'en-GB', rate: 0.86 },
        { text: '兔子跳过花园。', lang: 'zh-CN' },
      ],
    });
  });

  it('reads the normal example before the Oxford sentence after a correct level 4 answer', () => {
    expect(getStudyAudioPlan(4, question(), true)).toEqual({
      beforeAnswer: [{ text: 'rabbit', lang: 'en-GB' }],
      afterAnswer: [
        { text: '兔子', lang: 'zh-CN' },
        { text: 'The rabbit eats a carrot.', lang: 'en-GB', rate: 0.86 },
        { text: '兔子吃了一根胡萝卜。', lang: 'zh-CN' },
        { text: 'The rabbit ran into the garden.', lang: 'en-GB', rate: 0.86 },
        { text: '兔子跑进了花园。', lang: 'zh-CN' },
      ],
    });
  });

  it('reads the English word and Chinese meaning after a wrong level 4 answer', () => {
    expect(getStudyAudioPlan(4, question(), false)).toEqual({
      beforeAnswer: [{ text: 'rabbit', lang: 'en-GB' }],
      afterAnswer: [
        { text: 'rabbit', lang: 'en-GB' },
        { text: '兔子', lang: 'zh-CN' },
      ],
    });
  });

  it('reads the completed English and Chinese example after a correct level 5 answer', () => {
    expect(getStudyAudioPlan(5, question('sentence-choice'), true)).toEqual({
      beforeAnswer: [],
      afterAnswer: [
        { text: 'The rabbit eats a carrot.', lang: 'en-GB', rate: 0.86 },
        { text: '兔子吃了一根胡萝卜。', lang: 'zh-CN' },
      ],
    });
  });

  it('reads the correct bilingual sentence after a wrong level 5 answer', () => {
    expect(getStudyAudioPlan(5, question('sentence-choice'), false)).toEqual({
      beforeAnswer: [],
      afterAnswer: [
        { text: 'The rabbit eats a carrot.', lang: 'en-GB', rate: 0.86 },
        { text: '兔子吃了一根胡萝卜。', lang: 'zh-CN' },
      ],
    });
  });

  it('reads the normal example before the Red Rocket sentence after a correct level 6 answer', () => {
    expect(getStudyAudioPlan(6, question(), true)).toEqual({
      beforeAnswer: [{ text: '兔子', lang: 'zh-CN' }],
      afterAnswer: [
        { text: 'rabbit', lang: 'en-GB', pauseAfterMs: WORD_TO_SENTENCE_PAUSE_MS },
        { text: 'The rabbit hops across the garden.', lang: 'en-GB', rate: 0.86 },
        { text: '兔子跳过花园。', lang: 'zh-CN' },
        { text: 'The rabbit hops across the grass.', lang: 'en-GB', rate: 0.86 },
        { text: '兔子跳过草地。', lang: 'zh-CN' },
      ],
    });
  });

  it('reads the normal example before the RAZ sentence after a correct level 8 answer', () => {
    expect(getStudyAudioPlan(8, question(), true).afterAnswer).toEqual([
      { text: 'rabbit', lang: 'en-GB', pauseAfterMs: WORD_TO_SENTENCE_PAUSE_MS },
      { text: 'The rabbit sleeps under the table.', lang: 'en-GB', rate: 0.86 },
      { text: '兔子睡在桌子下面。', lang: 'zh-CN' },
      { text: 'A rabbit can hear danger coming.', lang: 'en-GB', rate: 0.86 },
      { text: '兔子能听到危险正在靠近。', lang: 'zh-CN' },
    ]);
    expect(splitRelatedResultAudio(8, question(), getStudyAudioPlan(8, question(), true).afterAnswer))
      .toEqual({
        beforeReveal: [
          { text: 'rabbit', lang: 'en-GB', pauseAfterMs: WORD_TO_SENTENCE_PAUSE_MS },
          { text: 'The rabbit sleeps under the table.', lang: 'en-GB', rate: 0.86 },
          { text: '兔子睡在桌子下面。', lang: 'zh-CN' },
        ],
        afterReveal: [
          { text: 'A rabbit can hear danger coming.', lang: 'en-GB', rate: 0.86 },
          { text: '兔子能听到危险正在靠近。', lang: 'zh-CN' },
        ],
      });
  });

  it('reads the word and Chinese meaning after a wrong level 6 answer', () => {
    expect(getStudyAudioPlan(6, question(), false)).toEqual({
      beforeAnswer: [{ text: '兔子', lang: 'zh-CN' }],
      afterAnswer: [
        { text: 'rabbit', lang: 'en-GB' },
        { text: '兔子', lang: 'zh-CN' },
      ],
    });
  });

  it('reads the bilingual example after a correct level 7 answer', () => {
    expect(getStudyAudioPlan(7, question(), true)).toEqual({
      beforeAnswer: [{ text: '兔子', lang: 'zh-CN' }],
      afterAnswer: [
        { text: 'The rabbit eats a carrot.', lang: 'en-GB', rate: 0.86 },
        { text: '兔子吃了一根胡萝卜。', lang: 'zh-CN' },
      ],
    });
  });

  it('reads the word, meaning, and bilingual example after a wrong level 7 answer', () => {
    expect(getStudyAudioPlan(7, question(), false).afterAnswer).toEqual([
      { text: 'rabbit', lang: 'en-GB' },
      { text: '兔子', lang: 'zh-CN' },
      { text: 'The rabbit eats a carrot.', lang: 'en-GB', rate: 0.86 },
      { text: '兔子吃了一根胡萝卜。', lang: 'zh-CN' },
    ]);
  });

  it('reads the word and bilingual example after a correct level 8 answer', () => {
    expect(getStudyAudioPlan(8, question(), true)).toEqual({
      beforeAnswer: [{ text: '兔子', lang: 'zh-CN' }],
      afterAnswer: [
        { text: 'rabbit', lang: 'en-GB', pauseAfterMs: WORD_TO_SENTENCE_PAUSE_MS },
        { text: 'The rabbit sleeps under the table.', lang: 'en-GB', rate: 0.86 },
        { text: '兔子睡在桌子下面。', lang: 'zh-CN' },
        { text: 'A rabbit can hear danger coming.', lang: 'en-GB', rate: 0.86 },
        { text: '兔子能听到危险正在靠近。', lang: 'zh-CN' },
      ],
    });
  });

  it('reads only the correct word after a wrong level 8 answer', () => {
    expect(getStudyAudioPlan(8, question(), false)).toEqual({
      beforeAnswer: [{ text: '兔子', lang: 'zh-CN' }],
      afterAnswer: [{ text: 'rabbit', lang: 'en-GB' }],
    });
  });

  it('reads the word and bilingual example after a correct level 9 answer', () => {
    expect(getStudyAudioPlan(9, question(), true)).toEqual({
      beforeAnswer: [],
      afterAnswer: [
        { text: 'rabbit', lang: 'en-GB', pauseAfterMs: WORD_TO_SENTENCE_PAUSE_MS },
        { text: 'The rabbit hops across the garden.', lang: 'en-GB', rate: 0.86 },
        { text: '兔子跳过花园。', lang: 'zh-CN' },
      ],
    });
  });

  it('reads the word, Chinese meaning, and bilingual example after a wrong level 9 answer', () => {
    expect(getStudyAudioPlan(9, question(), false)).toEqual({
      beforeAnswer: [],
      afterAnswer: [
        { text: 'rabbit', lang: 'en-GB' },
        { text: '兔子', lang: 'zh-CN' },
        { text: 'The rabbit hops across the garden.', lang: 'en-GB', rate: 0.86 },
        { text: '兔子跳过花园。', lang: 'zh-CN' },
      ],
    });
  });

  it('splits level 6 normal speech from the Red Rocket reveal speech', () => {
    const currentQuestion = question();
    const items = getStudyAudioPlan(6, currentQuestion, true).afterAnswer;
    expect(splitRelatedResultAudio(6, currentQuestion, items)).toEqual({
      beforeReveal: [
        { text: 'rabbit', lang: 'en-GB', pauseAfterMs: WORD_TO_SENTENCE_PAUSE_MS },
        { text: 'The rabbit hops across the garden.', lang: 'en-GB', rate: 0.86 },
        { text: '兔子跳过花园。', lang: 'zh-CN' },
      ],
      afterReveal: [
        { text: 'The rabbit hops across the grass.', lang: 'en-GB', rate: 0.86 },
        { text: '兔子跳过草地。', lang: 'zh-CN' },
      ],
    });
  });

  it('splits level 4 normal-example speech from the Oxford reveal speech', () => {
    const currentQuestion = question();
    const items = getStudyAudioPlan(4, currentQuestion, true).afterAnswer;
    expect(splitRelatedResultAudio(4, currentQuestion, items)).toEqual({
      beforeReveal: [
        { text: '兔子', lang: 'zh-CN' },
        { text: 'The rabbit eats a carrot.', lang: 'en-GB', rate: 0.86 },
        { text: '兔子吃了一根胡萝卜。', lang: 'zh-CN' },
      ],
      afterReveal: [
        { text: 'The rabbit ran into the garden.', lang: 'en-GB', rate: 0.86 },
        { text: '兔子跑进了花园。', lang: 'zh-CN' },
      ],
    });
  });
});
