import type { DailyTaskSummary } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import { defaultParentSetting, type ParentSetting } from '../models/parent-setting';
import type { WordSelectionState } from '../models/word-selection-state';
import type { WordRecord } from '../models/word';
import { getActiveStudyWords } from './selection-service';
import {
  addDaysToStudyDateKey,
  createDateTimeForStudyDateKey,
  createStudyDateKey,
  getStudyDayReviewCutoff,
} from './study-day';

export function createDateKey(date: Date = new Date()): string {
  return createStudyDateKey(date);
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  return addDaysToStudyDateKey(dateKey, days);
}

export function createDateTimeForDateKey(dateKey: string, clock: Date = new Date()): Date {
  return createDateTimeForStudyDateKey(dateKey, clock);
}

function isDue(record: LearningRecord, cutoff: Date): boolean {
  if (!record.nextDueAt) {
    return true;
  }
  return new Date(record.nextDueAt) < cutoff;
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
  const cutoff = getStudyDayReviewCutoff(date);
  return studyWords
    .filter((word) => {
      const record = recordsById[word.id];
      return record && isDue(record, cutoff);
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

export function normalizeDailyTaskPlan(
  task: DailyTaskSummary,
  words: WordRecord[],
  recordsById: Record<string, LearningRecord>,
  setting: ParentSetting = defaultParentSetting,
  date: Date = new Date(),
  selectionById: Record<string, WordSelectionState> = {},
  authoritativeAnsweredWordIds: string[] = task.answeredWordIds,
): DailyTaskSummary {
  const studyWords = getActiveStudyWords(words, selectionById);
  const activeWordIds = new Set(studyWords.map((word) => word.id));
  const answeredWordIds = [...new Set(authoritativeAnsweredWordIds)];
  const answeredWordIdSet = new Set(answeredWordIds);
  const uniqueIds = (ids: string[]) => [...new Set(ids)];

  const answeredReviewWordIds = uniqueIds(task.reviewWordIds)
    .filter((wordId) => answeredWordIdSet.has(wordId));
  const dueReviewWordIds = getOrderedDueReviewWords(studyWords, recordsById, date)
    .map((word) => word.id);
  const dueReviewWordIdSet = new Set(dueReviewWordIds);
  const reviewCandidates = uniqueIds([
    ...answeredReviewWordIds,
    ...task.reviewWordIds.filter((wordId) => (
      activeWordIds.has(wordId) && dueReviewWordIdSet.has(wordId)
    )),
    ...dueReviewWordIds,
  ]);
  const limits = getReviewFirstPlanLimits(reviewCandidates.length, setting);
  const reviewTarget = Math.max(answeredReviewWordIds.length, limits.reviewCount);
  const reviewWordIds = uniqueIds([
    ...answeredReviewWordIds,
    ...reviewCandidates.filter((wordId) => !answeredWordIdSet.has(wordId)),
  ]).slice(0, reviewTarget);
  const reviewWordIdSet = new Set(reviewWordIds);

  const answeredNewWordIds = uniqueIds(task.newWordIds)
    .filter((wordId) => answeredWordIdSet.has(wordId) && !reviewWordIdSet.has(wordId));
  const newWordTarget = Math.max(answeredNewWordIds.length, limits.newWordCount);
  const existingUnansweredNewWordIds = uniqueIds(task.newWordIds)
    .filter((wordId) => (
      !answeredWordIdSet.has(wordId)
      && !reviewWordIdSet.has(wordId)
      && activeWordIds.has(wordId)
      && !recordsById[wordId]
    ));
  const reservedWordIds = new Set([
    ...reviewWordIds,
    ...answeredNewWordIds,
    ...existingUnansweredNewWordIds,
  ]);
  const freshNewWordIds = pickBalancedNewWords(
    studyWords.filter((word) => !recordsById[word.id] && !reservedWordIds.has(word.id)),
    Math.max(0, newWordTarget - answeredNewWordIds.length - existingUnansweredNewWordIds.length),
  );
  const newWordIds = uniqueIds([
    ...answeredNewWordIds,
    ...existingUnansweredNewWordIds,
    ...freshNewWordIds,
  ]).slice(0, newWordTarget);

  const plannedWordIds = new Set([...reviewWordIds, ...newWordIds]);
  const isFullyAnswered = [...plannedWordIds].every((wordId) => answeredWordIdSet.has(wordId));
  const completedAt = task.completedAt && isFullyAnswered ? task.completedAt : null;
  const planUnchanged = reviewWordIds.length === task.reviewWordIds.length
    && reviewWordIds.every((wordId, index) => wordId === task.reviewWordIds[index])
    && newWordIds.length === task.newWordIds.length
    && newWordIds.every((wordId, index) => wordId === task.newWordIds[index]);
  const answersUnchanged = answeredWordIds.length === task.answeredWordIds.length
    && answeredWordIds.every((wordId, index) => wordId === task.answeredWordIds[index]);

  if (planUnchanged && answersUnchanged && completedAt === task.completedAt) {
    return task;
  }

  return {
    ...task,
    reviewWordIds,
    newWordIds,
    answeredWordIds,
    completedAt,
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
  const answeredWordIds = isCorrect && wordId && !task.answeredWordIds.includes(wordId)
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
