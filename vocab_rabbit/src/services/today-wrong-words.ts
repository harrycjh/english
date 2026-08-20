import type { AnswerEvent } from '../models/answer-event';
import { countsTowardTodayAccuracy } from './today-answer-statistics';

export interface TodayWrongWord {
  wordId: string;
  wrongCount: number;
  lastWrongAt: string;
}

export function buildTodayWrongWords(events: AnswerEvent[], dateKey: string): TodayWrongWord[] {
  const byWordId = new Map<string, TodayWrongWord>();

  for (const event of events) {
    if (event.dateKey !== dateKey || event.isCorrect || !countsTowardTodayAccuracy(event)) continue;
    const current = byWordId.get(event.wordId);
    byWordId.set(event.wordId, {
      wordId: event.wordId,
      wrongCount: (current?.wrongCount ?? 0) + 1,
      lastWrongAt: !current || event.answeredAt > current.lastWrongAt
        ? event.answeredAt
        : current.lastWrongAt,
    });
  }

  return [...byWordId.values()].sort((left, right) => (
    right.wrongCount - left.wrongCount
    || right.lastWrongAt.localeCompare(left.lastWrongAt)
    || left.wordId.localeCompare(right.wordId)
  ));
}
