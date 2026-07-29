import { describe, expect, it } from 'vitest';
import {
  createDebugProgressionPlan,
  DEBUG_QUESTION_LIMIT,
  DEBUG_PROGRESSION_LEVELS,
  isQuestionKindForDebugLevel,
  sampleDebugWordIds,
} from './debug-session';

describe('debug session sampling', () => {
  it('selects at most ten unique words', () => {
    const candidates = Array.from({ length: 20 }, (_, index) => `word-${index}`);
    const sampled = sampleDebugWordIds(candidates);

    expect(DEBUG_QUESTION_LIMIT).toBe(10);
    expect(sampled).toHaveLength(10);
    expect(new Set(sampled)).toHaveLength(10);
    expect(sampled.every((wordId) => candidates.includes(wordId))).toBe(true);
  });

  it('keeps every candidate when fewer than ten are available', () => {
    const candidates = ['word-a', 'word-b', 'word-c'];
    const sampled = sampleDebugWordIds(candidates);

    expect(sampled).toHaveLength(candidates.length);
    expect(new Set(sampled)).toEqual(new Set(candidates));
  });

  it('maps every debug level to its intended question kind', () => {
    expect(isQuestionKindForDebugLevel(0, 'recognition')).toBe(true);
    expect(isQuestionKindForDebugLevel(1, 'image-choice')).toBe(true);
    expect(isQuestionKindForDebugLevel(2, 'image-english-choice')).toBe(true);
    expect(isQuestionKindForDebugLevel(3, 'image-answer-choice')).toBe(true);
    expect(isQuestionKindForDebugLevel(4, 'text-choice')).toBe(true);
    expect(isQuestionKindForDebugLevel(5, 'sentence-choice')).toBe(true);
    expect(isQuestionKindForDebugLevel(6, 'letter-choice')).toBe(true);
    for (const level of [7, 8, 9, 10]) {
      expect(isQuestionKindForDebugLevel(level, 'fill-blank')).toBe(true);
    }
    expect(isQuestionKindForDebugLevel(5, 'text-choice')).toBe(false);
  });

  it('defines the complete progression as questions from level zero through nine', () => {
    expect(DEBUG_PROGRESSION_LEVELS).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(createDebugProgressionPlan('word-a')).toEqual({
      levels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      wordIds: Array.from({ length: 10 }, () => 'word-a'),
    });
  });
});
