import { describe, expect, it } from 'vitest';
import {
  buildTeachingChunkEntries,
  isChildSafeChunk,
  selectTeachingChunks,
} from './select-teaching-chunks.mjs';

function chunk(phrase, cefr = 'A2', sources = ['wiktionary-kaikki']) {
  return {
    phrase,
    chinese: '测试',
    sense: 'test',
    type: 'fixed_expression',
    cefr,
    sources,
  };
}

describe('teaching chunk frequency selection', () => {
  it('selects no more than ten chunks by descending usage frequency', () => {
    const chunks = Array.from({ length: 12 }, (_, index) => chunk(`take item ${index}`));
    const scores = new Map(chunks.map((item, index) => [item.phrase, index]));
    const selected = selectTeachingChunks({ examChunks: chunks }, null, scores);
    expect(selected).toHaveLength(10);
    expect(selected.map((item) => item.phrase)).toEqual(
      chunks.slice(2).reverse().map((item) => item.phrase),
    );
  });

  it('boosts corpus frequency with direct PHRASE List evidence', () => {
    const word = {
      examChunks: [chunk('be good at'), chunk('good morning')],
    };
    const source = {
      candidates: [{
        phrase: 'good at',
        evidence: [{
          source: 'phrase-list',
          rank: 3847,
          frequencyPer100Million: 1562,
        }],
      }],
    };
    const selected = selectTeachingChunks(word, source, new Map([
      ['be good at', 5.8],
      ['good morning', 5.2],
    ]));
    expect(selected[0]).toMatchObject({
      phrase: 'be good at',
      usageFrequency: {
        zipf: 5.8,
        source: 'wordfreq-estimate',
        phraseListPer100Million: 1562,
      },
    });
    expect(selected[0].usageFrequency.selectionScore).toBeGreaterThan(
      selected[1].usageFrequency.selectionScore,
    );
    expect(selected[1]).toMatchObject({
      phrase: 'good morning',
      usageFrequency: { zipf: 5.2, source: 'wordfreq-estimate' },
    });
  });

  it('keeps entries for words with no fixed chunks', () => {
    expect(buildTeachingChunkEntries({
      words: [{ id: 'word-a', examChunks: [] }],
    }, { entries: [] }, {}, 10)).toEqual([{
      id: 'word-a',
      teachingChunks: [],
    }]);
  });

  it('removes child-inappropriate chunks before ranking', () => {
    expect(isChildSafeChunk(chunk('make love'))).toBe(false);
    expect(isChildSafeChunk(chunk('machine gun'))).toBe(false);
    expect(isChildSafeChunk(chunk('to your health'))).toBe(false);
    expect(isChildSafeChunk(chunk('in sickness and in health'))).toBe(false);
    expect(isChildSafeChunk(chunk('look after'))).toBe(true);
    const selected = selectTeachingChunks({
      examChunks: [chunk('make love'), chunk('fall in love')],
    }, null, new Map([['make love', 9], ['fall in love', 5]]));
    expect(selected.map((item) => item.phrase)).toEqual(['fall in love']);
  });

  it('keeps representative high-frequency teaching expressions in the top ten', () => {
    const word = {
      examChunks: [
        chunk('take to'),
        chunk('take in'),
        chunk('take on'),
        chunk('take over'),
        chunk('take up'),
        chunk('take off'),
        chunk('take place'),
        chunk('take part in'),
        chunk('take out'),
        chunk('take care of'),
        chunk('take back'),
      ],
    };
    const source = {
      candidates: [
        {
          phrase: 'take place',
          evidence: [{ source: 'phrase-list', frequencyPer100Million: 1200 }],
        },
        {
          phrase: 'take care of',
          evidence: [{ source: 'phrase-list', frequencyPer100Million: 900 }],
        },
      ],
    };
    const scores = new Map(word.examChunks.map((item, index) => [
      item.phrase,
      5.9 - index * 0.03,
    ]));

    const selected = selectTeachingChunks(word, source, scores);
    expect(selected.map((item) => item.phrase)).toEqual(expect.arrayContaining([
      'take place',
      'take care of',
    ]));
  });
});
