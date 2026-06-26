import { describe, expect, it } from 'vitest';
import type { AnswerEvent } from '../models/answer-event';
import { getWordAnswerStats, getWrongPracticeWordIds, summarizeAnswerEvents } from './answer-event-service';

function event(overrides: Partial<AnswerEvent>): AnswerEvent {
  return {
    id: 'event-1',
    wordId: 'ket_word_n',
    dateKey: '2026-06-26',
    answeredAt: '2026-06-26T10:00:00.000Z',
    questionKind: 'text-choice',
    selectedAnswer: '错',
    correctAnswer: '对',
    isCorrect: false,
    responseTimeMs: 1200,
    ...overrides,
  };
}

describe('summarizeAnswerEvents', () => {
  it('summarizes wrong word ranking and accuracy by question kind', () => {
    const summary = summarizeAnswerEvents([
      event({ id: '1', wordId: 'ket_a_n', questionKind: 'image-choice', isCorrect: false }),
      event({ id: '2', wordId: 'ket_a_n', questionKind: 'image-choice', isCorrect: true }),
      event({ id: '3', wordId: 'ket_b_n', questionKind: 'fill-blank', isCorrect: false }),
      event({ id: '4', wordId: 'ket_a_n', questionKind: 'fill-blank', isCorrect: false }),
    ]);

    expect(summary.wrongWordRanking[0]).toEqual({ wordId: 'ket_a_n', wrongCount: 2, totalCount: 3 });
    expect(summary.byQuestionKind).toEqual([
      { questionKind: 'fill-blank', totalCount: 2, correctCount: 0, wrongCount: 2, accuracy: 0 },
      { questionKind: 'image-choice', totalCount: 2, correctCount: 1, wrongCount: 1, accuracy: 50 },
    ]);
  });
});

describe('getWordAnswerStats', () => {
  it('returns recent events and counts for one word', () => {
    const stats = getWordAnswerStats([
      event({ id: '1', wordId: 'ket_a_n', answeredAt: '2026-06-26T10:00:00.000Z', isCorrect: false }),
      event({ id: '2', wordId: 'ket_b_n', answeredAt: '2026-06-26T10:01:00.000Z', isCorrect: false }),
      event({ id: '3', wordId: 'ket_a_n', answeredAt: '2026-06-26T10:02:00.000Z', isCorrect: true }),
    ], 'ket_a_n');

    expect(stats.totalCount).toBe(2);
    expect(stats.wrongCount).toBe(1);
    expect(stats.accuracy).toBe(50);
    expect(stats.recentEvents.map((item) => item.id)).toEqual(['3', '1']);
  });
});

describe('getWrongPracticeWordIds', () => {
  it('selects highest-priority wrong words within the requested limit', () => {
    const wordIds = getWrongPracticeWordIds([
      event({ id: '1', wordId: 'ket_a_n', isCorrect: false }),
      event({ id: '2', wordId: 'ket_a_n', isCorrect: false }),
      event({ id: '3', wordId: 'ket_b_n', isCorrect: false }),
      event({ id: '4', wordId: 'ket_b_n', isCorrect: true }),
      event({ id: '5', wordId: 'ket_c_n', isCorrect: true }),
    ], 1);

    expect(wordIds).toEqual(['ket_a_n']);
  });
});
