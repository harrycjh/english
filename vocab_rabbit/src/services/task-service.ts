import type { DailyTaskSummary } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import type { WordRecord } from '../models/word';

const DEFAULT_NEW_WORD_LIMIT = 6;
const DEFAULT_REVIEW_LIMIT = 8;

export function createDateKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function isDue(record: LearningRecord, date: Date): boolean {
  if (!record.nextDueAt) {
    return true;
  }
  return new Date(record.nextDueAt) <= date;
}

function pickBalancedNewWords(words: WordRecord[], limit: number): string[] {
  const buckets = new Map<string, WordRecord[]>();

  for (const word of words) {
    const bucket = buckets.get(word.category) ?? [];
    bucket.push(word);
    buckets.set(word.category, bucket);
  }

  const orderedBuckets = [...buckets.values()].map((bucket) =>
    bucket.sort((left, right) => left.difficulty - right.difficulty || left.english.localeCompare(right.english))
  );

  const selected: string[] = [];
  let cursor = 0;
  while (selected.length < limit && orderedBuckets.some((bucket) => bucket.length > 0)) {
    const bucket = orderedBuckets[cursor % orderedBuckets.length];
    const nextWord = bucket.shift();
    if (nextWord) {
      selected.push(nextWord.id);
    }
    cursor += 1;
  }

  return selected;
}

export function buildDailyTask(
  words: WordRecord[],
  recordsById: Record<string, LearningRecord>,
  date: Date = new Date()
): DailyTaskSummary {
  const dueReviewWordIds = words
    .filter((word) => {
      const record = recordsById[word.id];
      return record && isDue(record, date);
    })
    .sort((left, right) => {
      const leftRecord = recordsById[left.id];
      const rightRecord = recordsById[right.id];
      const leftDue = leftRecord?.nextDueAt ?? '';
      const rightDue = rightRecord?.nextDueAt ?? '';
      return leftDue.localeCompare(rightDue) || left.difficulty - right.difficulty;
    })
    .slice(0, DEFAULT_REVIEW_LIMIT)
    .map((word) => word.id);

  const unseenWords = words.filter((word) => !recordsById[word.id]);
  const newWordIds = pickBalancedNewWords(unseenWords, DEFAULT_NEW_WORD_LIMIT);

  return {
    dateKey: createDateKey(date),
    newWordIds,
    reviewWordIds: dueReviewWordIds,
    completedAt: null,
    correctCount: 0,
    totalAnswered: 0,
  };
}