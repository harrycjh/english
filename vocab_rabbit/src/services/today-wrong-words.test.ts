import { describe, expect, it } from 'vitest';
import type { AnswerEvent } from '../models/answer-event';
import { buildTodayWrongWords } from './today-wrong-words';

function event(id: string, wordId: string, answeredAt: string, isCorrect = false): AnswerEvent {
  return {
    id,
    wordId,
    dateKey: answeredAt.slice(0, 10),
    answeredAt,
    questionKind: 'text-choice',
    selectedAnswer: '',
    correctAnswer: '',
    isCorrect,
    responseTimeMs: 1_000,
  };
}

describe('today wrong words', () => {
  it('sorts words by wrong frequency, then by the most recent wrong answer', () => {
    const events = [
      event('a-1', 'word-a', '2026-08-12T08:00:00.000Z'),
      event('b-1', 'word-b', '2026-08-12T09:00:00.000Z'),
      event('a-2', 'word-a', '2026-08-12T10:00:00.000Z'),
      event('c-1', 'word-c', '2026-08-12T11:00:00.000Z'),
      event('a-correct', 'word-a', '2026-08-12T12:00:00.000Z', true),
      event('other-day', 'word-d', '2026-08-11T12:00:00.000Z'),
    ];

    expect(buildTodayWrongWords(events, '2026-08-12')).toEqual([
      { wordId: 'word-a', wrongCount: 2, lastWrongAt: '2026-08-12T10:00:00.000Z' },
      { wordId: 'word-c', wrongCount: 1, lastWrongAt: '2026-08-12T11:00:00.000Z' },
      { wordId: 'word-b', wrongCount: 1, lastWrongAt: '2026-08-12T09:00:00.000Z' },
    ]);
  });
});
