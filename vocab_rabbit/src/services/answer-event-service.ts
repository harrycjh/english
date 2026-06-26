import type { AnswerEvent } from '../models/answer-event';
import type { QuestionKind } from './question-service';

export interface WrongWordSummary {
  wordId: string;
  wrongCount: number;
  totalCount: number;
}

export interface QuestionKindSummary {
  questionKind: QuestionKind;
  totalCount: number;
  correctCount: number;
  wrongCount: number;
  accuracy: number;
}

export interface AnswerEventSummary {
  wrongWordRanking: WrongWordSummary[];
  byQuestionKind: QuestionKindSummary[];
}

export interface WordAnswerStats {
  totalCount: number;
  correctCount: number;
  wrongCount: number;
  accuracy: number;
  recentEvents: AnswerEvent[];
}

export function createAnswerEventId(wordId: string, answeredAt: string): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${answeredAt}-${wordId}-${randomPart}`;
}

export function summarizeAnswerEvents(events: AnswerEvent[]): AnswerEventSummary {
  const byWord = new Map<string, { wrongCount: number; totalCount: number }>();
  const byQuestionKind = new Map<QuestionKind, { correctCount: number; totalCount: number }>();

  for (const event of events) {
    const wordStats = byWord.get(event.wordId) ?? { wrongCount: 0, totalCount: 0 };
    wordStats.totalCount += 1;
    if (!event.isCorrect) {
      wordStats.wrongCount += 1;
    }
    byWord.set(event.wordId, wordStats);

    const kindStats = byQuestionKind.get(event.questionKind) ?? { correctCount: 0, totalCount: 0 };
    kindStats.totalCount += 1;
    if (event.isCorrect) {
      kindStats.correctCount += 1;
    }
    byQuestionKind.set(event.questionKind, kindStats);
  }

  return {
    wrongWordRanking: [...byWord.entries()]
      .map(([wordId, stats]) => ({ wordId, ...stats }))
      .filter((stats) => stats.wrongCount > 0)
      .sort((left, right) => right.wrongCount - left.wrongCount || right.totalCount - left.totalCount || left.wordId.localeCompare(right.wordId)),
    byQuestionKind: [...byQuestionKind.entries()]
      .map(([questionKind, stats]) => {
        const wrongCount = stats.totalCount - stats.correctCount;
        return {
          questionKind,
          totalCount: stats.totalCount,
          correctCount: stats.correctCount,
          wrongCount,
          accuracy: stats.totalCount > 0 ? Math.round((stats.correctCount / stats.totalCount) * 100) : 0,
        };
      })
      .sort((left, right) => left.questionKind.localeCompare(right.questionKind)),
  };
}

export function getWordAnswerStats(events: AnswerEvent[], wordId: string): WordAnswerStats {
  const wordEvents = events
    .filter((event) => event.wordId === wordId)
    .sort((left, right) => right.answeredAt.localeCompare(left.answeredAt));
  const correctCount = wordEvents.filter((event) => event.isCorrect).length;
  const totalCount = wordEvents.length;

  return {
    totalCount,
    correctCount,
    wrongCount: totalCount - correctCount,
    accuracy: totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0,
    recentEvents: wordEvents.slice(0, 5),
  };
}

export function getWrongPracticeWordIds(events: AnswerEvent[], limit = 10): string[] {
  return summarizeAnswerEvents(events).wrongWordRanking.slice(0, limit).map((item) => item.wordId);
}
