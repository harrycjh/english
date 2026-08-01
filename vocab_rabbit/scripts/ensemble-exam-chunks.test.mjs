import { describe, expect, it } from 'vitest';
import {
  ensembleEntries,
  phrasesEquivalent,
  removeCanonicalDuplicates,
  requiresIndependentVote,
  shouldKeepChunk,
} from './ensemble-exam-chunks.mjs';

const detailedChunk = (phrase, sources = ['wiktionary-kaikki']) => ({
  phrase,
  chinese: '测试',
  sense: 'test sense',
  type: 'fixed_expression',
  cefr: 'B1',
  sources,
});

describe('exam chunk ensemble', () => {
  it('matches normal inflections and limited canonical teaching forms', () => {
    expect(phrasesEquivalent('suppose to', 'be supposed to')).toBe(true);
    expect(phrasesEquivalent('good at', 'be good at')).toBe(true);
    expect(phrasesEquivalent('good weather', 'have good weather today')).toBe(false);
  });

  it('keeps a candidate accepted by either independent model vote', () => {
    const chunk = detailedChunk('change of heart');
    expect(shouldKeepChunk(chunk, {
      chunks: [{ phrase: 'change of heart' }],
    }, { chunks: [] })).toBe(true);
    expect(shouldKeepChunk(chunk, {
      chunks: [],
    }, { chunks: [{ phrase: 'change of hearts' }] })).toBe(true);
  });

  it('keeps trusted and multi-source evidence without another vote', () => {
    expect(shouldKeepChunk(
      detailedChunk('after a while', ['phrase-list']),
      { chunks: [] },
      { chunks: [] },
    )).toBe(true);
    expect(shouldKeepChunk(
      detailedChunk('change hands', ['oewn-2025', 'wiktionary-kaikki']),
      { chunks: [] },
      { chunks: [] },
    )).toBe(true);
    expect(requiresIndependentVote(
      detailedChunk('change of heart', ['wiktionary-kaikki']),
    )).toBe(true);
  });

  it('keeps productive repeated exam frames but rejects unsupported free combinations', () => {
    expect(shouldKeepChunk(
      detailedChunk('day after day'),
      { chunks: [] },
      { chunks: [] },
    )).toBe(true);
    expect(shouldKeepChunk(
      detailedChunk('can swim'),
      { chunks: [] },
      { chunks: [] },
    )).toBe(false);
  });

  it('prefers complete canonical teaching forms and merges their evidence', () => {
    expect(removeCanonicalDuplicates([
      detailedChunk('good at', ['phrase-list']),
      detailedChunk('be good at', ['wiktionary-kaikki']),
      detailedChunk('good for', ['oewn-2025']),
    ])).toEqual([
      detailedChunk('be good at', ['phrase-list', 'wiktionary-kaikki']),
      detailedChunk('good for', ['oewn-2025']),
    ]);
  });

  it('preserves all word entries including words with no accepted chunks', () => {
    expect(ensembleEntries([
      { id: 'good', chunks: [detailedChunk('be good at')] },
      { id: 'can', chunks: [detailedChunk('can swim')] },
    ], [
      { id: 'good', chunks: [{ phrase: 'be good at' }] },
      { id: 'can', chunks: [] },
    ], [
      { id: 'good', chunks: [] },
      { id: 'can', chunks: [] },
    ])).toEqual([
      { id: 'good', chunks: [detailedChunk('be good at')] },
      { id: 'can', chunks: [] },
    ]);
  });

  it('hard-rejects known free combinations even when a model votes for them', () => {
    expect(ensembleEntries([{
      id: 'change',
      chunks: [
        detailedChunk('change of heart'),
        detailedChunk('change of clothes'),
      ],
    }], [{
      id: 'change',
      chunks: [
        { phrase: 'change of heart' },
        { phrase: 'change of clothes' },
      ],
    }], [{
      id: 'change',
      chunks: [],
    }])).toEqual([{
      id: 'change',
      chunks: [detailedChunk('change of heart')],
    }]);
  });
});
