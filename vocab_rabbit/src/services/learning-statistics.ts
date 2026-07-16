import type { AnswerEvent } from '../models/answer-event';
import type { DailyTaskSummary } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import type { ParentSetting } from '../models/parent-setting';
import type { WordSelectionState } from '../models/word-selection-state';
import type { WordRecord } from '../models/word';
import { isWordEnabledForStudy } from './selection-service';

const LEARNING_TIMELINE_RANGE_DAYS = 90;

export interface HistoricalLearningPoint {
  dateKey: string;
  newCount: number;
  reviewCount: number;
  learnedWordCount: number;
  answerCount: number;
  correctCount: number;
  accuracy: number;
  completed: boolean;
}

export interface FutureLearningPoint {
  dateKey: string;
  newCount: number;
  reviewCount: number;
  totalCount: number;
}

export interface LearningLoadPoint {
  dateKey: string;
  newCount: number;
  reviewCount: number;
  totalCount: number;
  kind: 'history' | 'today' | 'forecast';
}

export interface LearningStatistics {
  history: HistoricalLearningPoint[];
  forecast: FutureLearningPoint[];
  timeline: LearningLoadPoint[];
  totalLearnedWords: number;
  totalAnswers: number;
  activeDays: number;
  accuracy: number;
  streak: number;
  forecastTotal: number;
}

interface LearningStatisticsInput {
  currentTask: DailyTaskSummary;
  tasks: DailyTaskSummary[];
  answerEvents: AnswerEvent[];
  words: Pick<WordRecord, 'id'>[];
  recordsById: Record<string, LearningRecord>;
  selectionById: Record<string, WordSelectionState>;
  setting: ParentSetting;
  now?: Date;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(source: Date, days: number): Date {
  const result = new Date(source);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function dateRange(startKey: string, endKey: string): string[] {
  const result: string[] = [];
  const end = new Date(`${endKey}T12:00:00.000Z`);
  for (let cursor = new Date(`${startKey}T12:00:00.000Z`); cursor <= end; cursor = addDays(cursor, 1)) {
    result.push(dateKey(cursor));
  }
  return result;
}

function countTaskWords(task: DailyTaskSummary | undefined): number {
  if (!task) return 0;
  if (task.answeredWordIds?.length) return new Set(task.answeredWordIds).size;
  if (task.completedAt) return new Set([...task.newWordIds, ...task.reviewWordIds]).size;
  return Math.min(task.totalAnswered, new Set([...task.newWordIds, ...task.reviewWordIds]).size);
}

export function buildLearningStatistics({
  currentTask,
  tasks,
  answerEvents,
  words,
  recordsById,
  selectionById,
  setting,
  now = new Date(),
}: LearningStatisticsInput): LearningStatistics {
  const todayKey = dateKey(now);
  const taskMap = new Map(tasks.map((task) => [task.dateKey, task]));
  taskMap.set(currentTask.dateKey, currentTask);

  const eventsByDate = new Map<string, AnswerEvent[]>();
  for (const event of answerEvents) {
    const events = eventsByDate.get(event.dateKey) ?? [];
    events.push(event);
    eventsByDate.set(event.dateKey, events);
  }

  const historicalDateKeys = [
    ...taskMap.keys(),
    ...eventsByDate.keys(),
    ...Object.values(recordsById)
      .map((record) => record.lastStudiedAt?.slice(0, 10))
      .filter((value): value is string => Boolean(value)),
  ].filter((value) => value <= todayKey);
  const firstDateKey = historicalDateKeys.sort()[0] ?? todayKey;

  const history = dateRange(firstDateKey, todayKey).map((historyDateKey): HistoricalLearningPoint => {
    const task = taskMap.get(historyDateKey);
    const events = eventsByDate.get(historyDateKey) ?? [];
    const actualWordIds = new Set(events.length > 0
      ? events.map((event) => event.wordId)
      : task?.answeredWordIds ?? []);
    if (actualWordIds.size === 0 && task?.completedAt) {
      [...task.newWordIds, ...task.reviewWordIds].forEach((wordId) => actualWordIds.add(wordId));
    }

    const taskNewWordIds = new Set(task?.newWordIds ?? []);
    const taskReviewWordIds = new Set(task?.reviewWordIds ?? []);
    const eventByWordId = new Map(events.map((event) => [event.wordId, event]));
    let newCount = 0;
    let reviewCount = 0;
    for (const wordId of actualWordIds) {
      if (taskReviewWordIds.has(wordId)) {
        reviewCount += 1;
      } else if (taskNewWordIds.has(wordId)) {
        newCount += 1;
      } else if (eventByWordId.get(wordId)?.learningStateBefore?.lastStudiedAt) {
        reviewCount += 1;
      } else {
        newCount += 1;
      }
    }

    const learnedWordCount = actualWordIds.size || countTaskWords(task);
    const answerCount = events.length || task?.totalAnswered || 0;
    const correctCount = events.length > 0
      ? events.filter((event) => event.isCorrect).length
      : task?.correctCount || 0;
    return {
      dateKey: historyDateKey,
      newCount,
      reviewCount,
      learnedWordCount,
      answerCount,
      correctCount,
      accuracy: answerCount > 0 ? (correctCount / answerCount) * 100 : 0,
      completed: Boolean(task?.completedAt),
    };
  });

  const activeWordIds = new Set(words
    .filter((word) => isWordEnabledForStudy(word.id, selectionById))
    .map((word) => word.id));
  const todayReviewIds = new Set(currentTask.reviewWordIds);
  const reviewCandidates = Object.values(recordsById)
    .filter((record) => activeWordIds.has(record.wordId) && record.nextDueAt && !todayReviewIds.has(record.wordId))
    .sort((left, right) => (left.nextDueAt ?? '').localeCompare(right.nextDueAt ?? ''));
  const assignedReviews = new Set<string>();
  let unseenRemaining = words.filter((word) => activeWordIds.has(word.id) && !recordsById[word.id] && !currentTask.newWordIds.includes(word.id)).length;

  const forecast = Array.from({ length: LEARNING_TIMELINE_RANGE_DAYS }, (_, index): FutureLearningPoint => {
    const offset = index + 1;
    const forecastDate = addDays(new Date(`${todayKey}T12:00:00.000Z`), offset);
    const forecastDateKey = dateKey(forecastDate);
    const endOfDay = addDays(forecastDate, 1).getTime() - 1;
    const dueReviews = reviewCandidates
      .filter((record) => !assignedReviews.has(record.wordId) && new Date(record.nextDueAt!).getTime() <= endOfDay)
      .slice(0, Math.max(0, setting.dailyReviewLimit));
    dueReviews.forEach((record) => assignedReviews.add(record.wordId));

    const newCount = Math.min(Math.max(0, setting.dailyNewWordCount), unseenRemaining);
    unseenRemaining -= newCount;
    return {
      dateKey: forecastDateKey,
      newCount,
      reviewCount: dueReviews.length,
      totalCount: newCount + dueReviews.length,
    };
  });

  const totalAnswers = history.reduce((sum, point) => sum + point.answerCount, 0);
  const totalCorrect = history.reduce((sum, point) => sum + point.correctCount, 0);
  let streak = 0;
  for (const point of [...history].reverse()) {
    if (!point.completed) break;
    streak += 1;
  }

  const historyByDate = new Map(history.map((point) => [point.dateKey, point]));
  const forecastByDate = new Map(forecast.map((point) => [point.dateKey, point]));
  const timeline = Array.from({ length: (LEARNING_TIMELINE_RANGE_DAYS * 2) + 1 }, (_, index): LearningLoadPoint => {
    const offset = index - LEARNING_TIMELINE_RANGE_DAYS;
    const timelineDateKey = dateKey(addDays(new Date(`${todayKey}T12:00:00.000Z`), offset));
    const historicalPoint = historyByDate.get(timelineDateKey);
    const futurePoint = forecastByDate.get(timelineDateKey);
    const newCount = futurePoint?.newCount ?? historicalPoint?.newCount ?? 0;
    const reviewCount = futurePoint?.reviewCount ?? historicalPoint?.reviewCount ?? 0;
    return {
      dateKey: timelineDateKey,
      newCount,
      reviewCount,
      totalCount: newCount + reviewCount,
      kind: offset < 0 ? 'history' : offset === 0 ? 'today' : 'forecast',
    };
  });

  return {
    history,
    forecast,
    timeline,
    totalLearnedWords: Object.values(recordsById).filter((record) => record.lastStudiedAt).length,
    totalAnswers,
    activeDays: history.filter((point) => point.answerCount > 0 || point.learnedWordCount > 0).length,
    accuracy: totalAnswers > 0 ? (totalCorrect / totalAnswers) * 100 : 0,
    streak,
    forecastTotal: forecast.reduce((sum, point) => sum + point.totalCount, 0),
  };
}
