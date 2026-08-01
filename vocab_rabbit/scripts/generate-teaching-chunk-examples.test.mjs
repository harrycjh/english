import { describe, expect, it } from 'vitest';
import {
  applyGeneratedEntry,
  repairTranslationFocus,
  sentenceUsesChunk,
  validateGeneratedEntry,
} from './generate-teaching-chunk-examples.mjs';

function chunk(phrase, chinese) {
  return {
    phrase,
    chinese,
    sense: chinese,
    type: 'fixed_expression',
    cefr: 'A2',
    sources: ['phrase-list'],
    usageFrequency: { zipf: 5, selectionScore: 6, source: 'wordfreq-estimate' },
  };
}

const word = {
  id: 'ket_take_v',
  english: 'take',
  examples: ['Please take this book to your teacher.'],
  exampleTranslations: ['请把这本书拿给你的老师。'],
  exampleTranslationFocus: ['拿'],
  teachingChunks: [
    chunk('take place', '发生；举行'),
    chunk('take care of', '照顾；处理'),
    chunk('take part in', '参加'),
    chunk('take off', '起飞；脱下'),
  ],
};

const generated = {
  id: word.id,
  examples: [
    {
      phrase: 'take place',
      sentence: 'The school play took place on Friday.',
      translation: '学校演出在星期五举行。',
      translationFocus: '举行',
    },
    {
      phrase: 'take care of',
      sentence: 'Mia takes care of her little brother.',
      translation: '米娅照顾她的弟弟。',
      translationFocus: '照顾',
    },
    {
      phrase: 'take part in',
      sentence: 'Our class took part in the race.',
      translation: '我们班参加了比赛。',
      translationFocus: '参加',
    },
  ],
};

describe('teaching chunk example generation', () => {
  it('repairs a semantically correct focus to the exact contiguous sentence span', () => {
    expect(repairTranslationFocus('我每六个月去看一次牙医。', '去看牙医')).toBe('去看一次牙医');
    expect(repairTranslationFocus('我和父母住在一起。', '与...同住')).toBe('我和父母住在一起');
    expect(repairTranslationFocus('她照顾弟弟。', '照顾;关心')).toBe('照顾');
  });

  it('recognizes fixed expressions with normal verb inflection', () => {
    expect(sentenceUsesChunk('The event took place yesterday.', 'take place')).toBe(true);
    expect(sentenceUsesChunk('She takes care of the puppy.', 'take care of')).toBe(true);
    expect(sentenceUsesChunk("My little girl's at school.", 'little girl')).toBe(true);
    expect(sentenceUsesChunk('The children are running around.', 'run around')).toBe(true);
    expect(sentenceUsesChunk('She loves to read after school.', 'love to do something')).toBe(true);
    expect(sentenceUsesChunk('Have you heard of this game?', 'hear of')).toBe(true);
    expect(sentenceUsesChunk('She collected herself before speaking.', 'collect oneself')).toBe(true);
    expect(sentenceUsesChunk('It was such an exciting game.', 'such a(n)')).toBe(true);
    expect(sentenceUsesChunk('There are two books here.', 'there is/are')).toBe(true);
    expect(sentenceUsesChunk('She meant well when she helped.', 'mean well')).toBe(true);
    expect(sentenceUsesChunk('The puppy stole my heart.', "steal someone's heart")).toBe(true);
    expect(sentenceUsesChunk('She took the bus home.', 'take place')).toBe(false);
    expect(sentenceUsesChunk('The officer controlled traffic.', 'traffic control')).toBe(false);
    expect(sentenceUsesChunk('Traffic control kept cars moving.', 'traffic control')).toBe(true);
  });

  it('validates exactly the top three teaching chunks', () => {
    const validation = validateGeneratedEntry(word, generated);
    expect(validation.valid, validation.errors.join(', ')).toBe(true);
    expect(validation.entry.examples.map((item) => item.phrase)).toEqual([
      'take place',
      'take care of',
      'take part in',
    ]);
  });

  it('preserves an original source sentence and records its provenance', () => {
    const sourceEntry = {
      id: word.id,
      examples: [
        {
          phrase: 'take place',
          status: 'matched',
          source: 'phrase-list',
          sentence: 'The school play took place on Friday.',
        },
      ],
    };
    const validation = validateGeneratedEntry(word, generated, sourceEntry);
    expect(validation.valid, validation.errors.join(', ')).toBe(true);
    expect(validation.entry.examples[0].sentenceSource).toBe('phrase-list');
    expect(validation.entry.examples[1].sentenceSource).toBe('qwen');

    const changed = structuredClone(generated);
    changed.examples[0].sentence = 'The meeting took place on Friday.';
    const protectedResult = validateGeneratedEntry(word, changed, sourceEntry);
    expect(protectedResult.valid).toBe(false);
    expect(protectedResult.errors).toContain('0:source-sentence-changed');
    expect(protectedResult.entry.examples[0].sentence).toBe('The school play took place on Friday.');
  });

  it('preserves the base example and replaces previously generated chunk examples', () => {
    const first = applyGeneratedEntry(structuredClone(word), generated);
    expect(first.examples).toHaveLength(4);
    expect(first.exampleCollocations).toEqual([
      '',
      'take place',
      'take care of',
      'take part in',
    ]);

    const second = applyGeneratedEntry(first, generated);
    expect(second.examples).toHaveLength(4);
    expect(second.examples[0]).toBe('Please take this book to your teacher.');
  });

  it('keeps a locked study sense on its original image-aligned example', () => {
    const locked = structuredClone(word);
    locked.studySense = {
      partOfSpeech: 'v',
      chinese: '拿；取',
      examples: ['Please take this book to your teacher.'],
    };
    const applied = applyGeneratedEntry(locked, generated);
    expect(applied.studySense.examples).toEqual(['Please take this book to your teacher.']);
    expect(applied.examples).toHaveLength(4);
  });
});
