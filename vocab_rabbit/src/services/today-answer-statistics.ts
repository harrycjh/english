import type { AnswerEvent } from '../models/answer-event';

export interface TodayAnswerStatistics {
  eventCount: number;
  totalCount: number;
  correctCount: number;
  wrongCount: number;
  accuracy: number | null;
}

export interface TodayUnfamiliarNewWord {
  wordId: string;
  unfamiliarCount: number;
  lastMarkedAt: string;
}

/** Lv0 is a self-assessment, not a knowledge check, so it must not affect accuracy. */
export function countsTowardTodayAccuracy(event: AnswerEvent): boolean {
  const levelBeforeAnswer = event.learningStateBefore?.masteryLevel;
  if (levelBeforeAnswer !== undefined) return levelBeforeAnswer > 0;

  // Older recognition events predate learningStateBefore but were only used by Lv0.
  return event.questionKind !== 'recognition';
}

export function buildTodayAnswerStatistics(
  events: AnswerEvent[],
  dateKey: string,
): TodayAnswerStatistics {
  const todayEvents = events.filter((event) => event.dateKey === dateKey);
  const countedEvents = todayEvents.filter(countsTowardTodayAccuracy);
  const correctCount = countedEvents.filter((event) => event.isCorrect).length;
  const totalCount = countedEvents.length;

  return {
    eventCount: todayEvents.length,
    totalCount,
    correctCount,
    wrongCount: totalCount - correctCount,
    accuracy: totalCount > 0 ? (correctCount / totalCount) * 100 : null,
  };
}

function isUnfamiliarRecognition(event: AnswerEvent): boolean {
  if (event.questionKind !== 'recognition') return false;

  // Synced and legacy events may not carry learningAction. The answer itself is
  // the durable record of the child's Lv0 "认识 / 不认识" choice.
  return event.learningAction === 'unknown'
    || event.selectedAnswer === '不认识'
    || !event.isCorrect;
}

export function buildTodayUnfamiliarNewWords(
  events: AnswerEvent[],
  dateKey: string,
): TodayUnfamiliarNewWord[] {
  const byWordId = new Map<string, TodayUnfamiliarNewWord>();

  for (const event of events) {
    if (
      event.dateKey !== dateKey
      || !isUnfamiliarRecognition(event)
    ) continue;

    const current = byWordId.get(event.wordId);
    byWordId.set(event.wordId, {
      wordId: event.wordId,
      unfamiliarCount: (current?.unfamiliarCount ?? 0) + 1,
      lastMarkedAt: !current || event.answeredAt > current.lastMarkedAt
        ? event.answeredAt
        : current.lastMarkedAt,
    });
  }

  return [...byWordId.values()].sort((left, right) => (
    right.unfamiliarCount - left.unfamiliarCount
    || right.lastMarkedAt.localeCompare(left.lastMarkedAt)
    || left.wordId.localeCompare(right.wordId)
  ));
}
