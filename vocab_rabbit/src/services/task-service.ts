import type { DailyTaskSummary } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import { defaultParentSetting, type ParentSetting } from '../models/parent-setting';
import type { WordSelectionState } from '../models/word-selection-state';
import type { WordRecord } from '../models/word';
import { getActiveStudyWords } from './selection-service';

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
  setting: ParentSetting = defaultParentSetting,
  date: Date = new Date(),
  selectionById: Record<string, WordSelectionState> = {}
): DailyTaskSummary {
  const reviewLimit = Math.max(1, setting.dailyReviewLimit);
  const newWordLimit = Math.max(1, setting.dailyNewWordCount);
  const studyWords = getActiveStudyWords(words, selectionById);

  const dueReviewWordIds = studyWords
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
    .slice(0, reviewLimit)
    .map((word) => word.id);

  const unseenWords = studyWords.filter((word) => !recordsById[word.id]);
  const newWordIds = pickBalancedNewWords(unseenWords, newWordLimit);

  return {
    dateKey: createDateKey(date),
    newWordIds,
    reviewWordIds: dueReviewWordIds,
    completedAt: null,
    correctCount: 0,
    wrongCount: 0,
    totalAnswered: 0,
    answeredWordIds: [],
  };
}

export function recordTaskAnswer(task: DailyTaskSummary, isCorrect: boolean, wordId?: string): DailyTaskSummary {
  const answeredWordIds = wordId && !task.answeredWordIds.includes(wordId)
    ? [...task.answeredWordIds, wordId]
    : task.answeredWordIds;

  return {
    ...task,
    correctCount: task.correctCount + (isCorrect ? 1 : 0),
    wrongCount: task.wrongCount + (isCorrect ? 0 : 1),
    totalAnswered: task.totalAnswered + 1,
    answeredWordIds,
  };
}
