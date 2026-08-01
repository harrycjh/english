import { describe, expect, it } from 'vitest';
import {
  combineReviewEntries,
  indexReviewEntries,
  packReviewEntries,
  seedEmptyReviewTasks,
  splitReviewEntries,
  validateReviewResult,
} from './review-exam-chunks.mjs';

describe('exam chunk final review', () => {
  it('packs without splitting a word entry', () => {
    const entries = [
      { chunks: new Array(60).fill({}) },
      { chunks: new Array(40).fill({}) },
      { chunks: new Array(5).fill({}) },
    ];
    expect(packReviewEntries(entries, {
      maxWordsPerRequest: 6,
      maxChunksPerRequest: 90,
    }).map((batch) => batch.length)).toEqual([1, 2]);
  });

  it('splits oversized words and combines reviewed parts without duplicates', () => {
    const entries = [{
      id: 'ket_out_adv',
      chunks: [{ phrase: 'find out' }, { phrase: 'go out' }, { phrase: 'look out' }],
    }];
    const tasks = splitReviewEntries(entries, 2);
    expect(tasks.map((task) => [task.id, task.chunks.length])).toEqual([
      ['ket_out_adv#0', 2],
      ['ket_out_adv#1', 1],
    ]);
    const reviewed = new Map([
      ['ket_out_adv#0', {
        id: 'ket_out_adv#0',
        wordId: 'ket_out_adv',
        chunks: [{ phrase: 'find out', sources: ['phave'] }],
      }],
      ['ket_out_adv#1', {
        id: 'ket_out_adv#1',
        wordId: 'ket_out_adv',
        chunks: [{ phrase: 'find out', sources: ['oewn-2025'] }],
      }],
    ]);
    expect(combineReviewEntries(entries, reviewed)).toEqual([{
      id: 'ket_out_adv',
      chunks: [{
        phrase: 'find out',
        sources: ['oewn-2025', 'phave'],
      }],
    }]);
  });

  it('preserves source evidence while accepting corrected metadata', () => {
    const input = {
      id: 'ket_good_adj',
      chunks: [{
        phrase: 'good at',
        chinese: '擅长',
        sense: 'skilled in an activity',
        type: 'fixed_expression',
        cefr: 'A1',
        sources: ['phrase-list'],
      }],
    };
    const result = validateReviewResult(input, {
      id: input.id,
      chunks: [{
        phrase: 'good at',
        chinese: '擅长',
        sense: 'skilled in an activity or subject',
        type: 'preposition_pattern',
        cefr: 'A1',
      }],
    });
    expect(result).toMatchObject({ valid: true });
    expect(result.chunks[0]).toMatchObject({
      type: 'preposition_pattern',
      sources: ['phrase-list'],
    });
  });

  it('rejects phrases that were not in the reviewed input', () => {
    const input = { id: 'ket_can_n_mv', chunks: [] };
    const response = {
      id: 'ket_can_n_mv',
      chunks: [{
        phrase: 'can swim',
        chinese: '会游泳',
        sense: 'be able to swim',
        type: 'lexical_collocation',
        cefr: 'A1',
      }],
    };
    expect(validateReviewResult(input, response).valid).toBe(false);
    expect(validateReviewResult(input, response, false, true)).toMatchObject({
      valid: true,
      chunks: [],
    });
  });

  it('supports a phrase-only filtering pass and preserves evidence', () => {
    const input = {
      id: 'ket_after_adv_prep',
      chunks: [{
        phrase: 'look after',
        sources: ['phave'],
      }],
    };
    const result = validateReviewResult(input, {
      id: input.id,
      chunks: [{ phrase: 'look after' }],
    }, true);
    expect(result).toEqual({
      valid: true,
      errors: [],
      chunks: [{
        phrase: 'look after',
        sources: ['phave'],
      }],
    });
  });

  it('allows a limited canonical teaching-form expansion', () => {
    const input = {
      id: 'ket_good_adj',
      chunks: [{
        phrase: 'good at',
        sources: ['phrase-list'],
      }],
    };
    const result = validateReviewResult(input, {
      id: input.id,
      chunks: [{ phrase: 'be good at' }],
    }, true);
    expect(result).toMatchObject({
      valid: true,
      chunks: [{
        phrase: 'be good at',
        sources: ['phrase-list'],
      }],
    });
  });

  it('normalizes an omitted empty single-task review', () => {
    const pending = [{ id: 'ket_grandpa_n#0' }];
    expect(indexReviewEntries(pending, []).get(pending[0].id)).toEqual({
      id: pending[0].id,
      chunks: [],
    });
  });

  it('records empty candidate tasks without calling the model', () => {
    const reviewed = seedEmptyReviewTasks([
      { id: 'ket_aunt_n#0', wordId: 'ket_aunt_n', chunks: [{ phrase: 'great-aunt' }] },
      { id: 'ket_can_n_mv#0', wordId: 'ket_can_n_mv', chunks: [] },
    ], new Map());
    expect([...reviewed.values()]).toEqual([{
      id: 'ket_can_n_mv#0',
      wordId: 'ket_can_n_mv',
      chunks: [],
    }]);
  });

  it('validates canonical spelling against the complete word candidate set', () => {
    const input = {
      id: 'ket_body_n#0',
      chunks: [{ phrase: 'body language', sources: ['oewn-2025'] }],
      validationChunks: [
        { phrase: 'body language', sources: ['oewn-2025'] },
        { phrase: 'body guard', sources: ['wiktionary-kaikki'] },
      ],
    };
    const result = validateReviewResult(input, {
      id: input.id,
      chunks: [{ phrase: 'bodyguard' }],
    }, true);
    expect(result).toMatchObject({
      valid: true,
      chunks: [{
        phrase: 'bodyguard',
        sources: ['wiktionary-kaikki'],
      }],
    });
  });

  it('accepts a canonical teaching form with a normal inflection', () => {
    const input = {
      id: 'ket_suppose_v#0',
      chunks: [{ phrase: 'suppose to', sources: ['wiktionary-kaikki'] }],
    };
    const result = validateReviewResult(input, {
      id: input.id,
      chunks: [{ phrase: 'be supposed to' }],
    }, true);
    expect(result).toMatchObject({
      valid: true,
      chunks: [{
        phrase: 'be supposed to',
        sources: ['wiktionary-kaikki'],
      }],
    });
  });
});
