import type { DailyTaskSummary } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import { defaultParentSetting, type ParentSetting } from '../models/parent-setting';
import type { WordSelectionState } from '../models/word-selection-state';
import type { WordRecord } from '../models/word';
import { getActiveStudyWords } from './selection-service';

export function createDateKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function parseDateKey(dateKey: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = parseDateKey(dateKey);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() + days);
  return createDateKey(date);
}

export function createDateTimeForDateKey(dateKey: string, clock: Date = new Date()): Date {
  const [year, month, day] = parseDateKey(dateKey);
  return new Date(Date.UTC(
    year,
    month - 1,
    day,
    clock.getUTCHours(),
    clock.getUTCMinutes(),
    clock.getUTCSeconds(),
    clock.getUTCMilliseconds(),
  ));
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

function getOrderedDueReviewWords(
  studyWords: WordRecord[],
  recordsById: Record<string, LearningRecord>,
  date: Date,
): WordRecord[] {
  return studyWords
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
    });
}

export function getReviewFirstPlanLimits(dueReviewCount: number, setting: ParentSetting) {
  const reviewLimit = Math.max(1, setting.dailyReviewLimit);
  const newWordLimit = Math.max(1, setting.dailyNewWordCount);
  const reviewCount = Math.min(dueReviewCount, reviewLimit + newWordLimit);
  const reviewOverflow = Math.max(0, reviewCount - reviewLimit);
  return {
    reviewCount,
    newWordCount: Math.max(0, newWordLimit - reviewOverflow),
  };
}

export function buildDailyTask(
  words: WordRecord[],
  recordsById: Record<string, LearningRecord>,
  setting: ParentSetting = defaultParentSetting,
  date: Date = new Date(),
  selectionById: Record<string, WordSelectionState> = {}
): DailyTaskSummary {
  const studyWords = getActiveStudyWords(words, selectionById);
  const orderedDueReviewWords = getOrderedDueReviewWords(studyWords, recordsById, date);
  const limits = getReviewFirstPlanLimits(orderedDueReviewWords.length, setting);
  const dueReviewWordIds = orderedDueReviewWords
    .slice(0, limits.reviewCount)
    .map((word) => word.id);

  const unseenWords = studyWords.filter((word) => !recordsById[word.id]);
  const newWordIds = pickBalancedNewWords(unseenWords, limits.newWordCount);

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

export function expandDailyTaskPlan(
  task: DailyTaskSummary,
  words: WordRecord[],
  recordsById: Record<string, LearningRecord>,
  setting: ParentSetting = defaultParentSetting,
  date: Date = new Date(),
  selectionById: Record<string, WordSelectionState> = {},
): DailyTaskSummary {
  const studyWords = getActiveStudyWords(words, selectionById);
  const plannedWordIds = new Set([...task.reviewWordIds, ...task.newWordIds]);
  const unplannedDueReviewWords = getOrderedDueReviewWords(studyWords, recordsById, date)
    .filter((word) => !plannedWordIds.has(word.id));
  const dueReviewCount = task.reviewWordIds.length + unplannedDueReviewWords.length;
  const limits = getReviewFirstPlanLimits(dueReviewCount, setting);
  const reviewTarget = Math.max(task.reviewWordIds.length, limits.reviewCount);
  const additionalReviewWordIds = unplannedDueReviewWords
    .slice(0, reviewTarget - task.reviewWordIds.length)
    .map((word) => word.id);

  const newWordTarget = Math.max(task.newWordIds.length, limits.newWordCount);
  const unplannedUnseenWords = studyWords.filter(
    (word) => !recordsById[word.id] && !plannedWordIds.has(word.id),
  );
  const additionalNewWordIds = pickBalancedNewWords(
    unplannedUnseenWords,
    newWordTarget - task.newWordIds.length,
  );

  if (additionalReviewWordIds.length === 0 && additionalNewWordIds.length === 0) {
    return task;
  }

  return {
    ...task,
    reviewWordIds: [...task.reviewWordIds, ...additionalReviewWordIds],
    newWordIds: [...task.newWordIds, ...additionalNewWordIds],
    completedAt: null,
  };
}

export function getTaskPlannedWordIds(task: DailyTaskSummary): string[] {
  return [...new Set([...task.reviewWordIds, ...task.newWordIds])];
}

export function isTaskFullyAnswered(task: DailyTaskSummary): boolean {
  const answeredWordIds = new Set(task.answeredWordIds);
  return getTaskPlannedWordIds(task).every((wordId) => answeredWordIds.has(wordId));
}

export function reconcileTaskCompletion(
  task: DailyTaskSummary,
  authoritativeAnsweredWordIds: string[] = task.answeredWordIds,
): DailyTaskSummary {
  const answeredWordIds = [...new Set(authoritativeAnsweredWordIds)];
  const reconciledTask = { ...task, answeredWordIds };
  const completedAt = task.completedAt && isTaskFullyAnswered(reconciledTask)
    ? task.completedAt
    : null;
  const answersUnchanged = answeredWordIds.length === task.answeredWordIds.length
    && answeredWordIds.every((wordId, index) => wordId === task.answeredWordIds[index]);
  if (answersUnchanged && completedAt === task.completedAt) {
    return task;
  }
  return { ...reconciledTask, completedAt };
}

export function getTaskStudyQueue(task: DailyTaskSummary): string[] {
  const plannedWordIds = getTaskPlannedWordIds(task);
  if (task.completedAt && isTaskFullyAnswered(task)) {
    return plannedWordIds;
  }
  const answeredWordIds = new Set(task.answeredWordIds);
  return plannedWordIds.filter((wordId) => !answeredWordIds.has(wordId));
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
