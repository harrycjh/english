import type { AnswerEvent } from '../models/answer-event';
import type { DailyTaskSummary } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import type { ParentSetting } from '../models/parent-setting';
import type { WordSelectionState } from '../models/word-selection-state';
import type { WordRecord } from '../models/word';
import { isWordEnabledForStudy } from './selection-service';
import { getInitialReviewDelayDays } from './spaced-repetition';
import { getReviewFirstPlanLimits } from './task-service';

const LEARNING_TIMELINE_RANGE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const REVIEW_INTERVAL_DAYS = [0, 1, 4, 7, 14, 30, 60];
const DEFAULT_FORECAST_ACCURACY = 0.85;
const ACCURACY_PRIOR_SAMPLE_COUNT = 10;

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
  deferredReviewCount: number;
  totalCount: number;
}

export interface LearningLoadPoint {
  dateKey: string;
  newCount: number;
  reviewCount: number;
  totalCount: number;
  deferredReviewCount: number;
  kind: 'history' | 'today' | 'forecast';
}

export interface LearningForecastModel {
  dailyNewTarget: number;
  dailyReviewBaseline: number;
  expectedAccuracy: number;
  historicalAnswerSamples: number;
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
  forecastModel: LearningForecastModel;
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

interface ProjectedWordState {
  wordId: string;
  reviewStage: number;
  nextDueAt: number;
}

function hashFraction(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function predictCorrect(
  state: ProjectedWordState,
  forecastDateKey: string,
  expectedAccuracy: number,
): boolean {
  return hashFraction(`${state.wordId}|${forecastDateKey}|${state.reviewStage}`) < expectedAccuracy;
}

function advanceProjectedState(
  state: ProjectedWordState,
  forecastDate: Date,
  expectedAccuracy: number,
): ProjectedWordState {
  const forecastDateKey = dateKey(forecastDate);
  const correct = predictCorrect(state, forecastDateKey, expectedAccuracy);
  const nextStage = correct
    ? Math.min(state.reviewStage + 1, REVIEW_INTERVAL_DAYS.length - 1)
    : Math.max(state.reviewStage - 1, 0);
  const delayDays = correct && state.reviewStage === 0 && nextStage === 1
    ? getInitialReviewDelayDays(state.wordId, forecastDate)
    : REVIEW_INTERVAL_DAYS[nextStage];
  return {
    ...state,
    reviewStage: nextStage,
    nextDueAt: forecastDate.getTime() + Math.max(1, delayDays) * DAY_MS,
  };
}

function estimateForecastAccuracy(answerEvents: AnswerEvent[], todayKey: string) {
  const historicalEvents = answerEvents
    .filter((event) => event.dateKey <= todayKey)
    .sort((left, right) => left.answeredAt.localeCompare(right.answeredAt))
    .slice(-200);
  const historicalCorrect = historicalEvents.filter((event) => event.isCorrect).length;
  const expectedAccuracy = (
    historicalCorrect + DEFAULT_FORECAST_ACCURACY * ACCURACY_PRIOR_SAMPLE_COUNT
  ) / (historicalEvents.length + ACCURACY_PRIOR_SAMPLE_COUNT);
  return {
    expectedAccuracy,
    historicalAnswerSamples: historicalEvents.length,
  };
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
  const { expectedAccuracy, historicalAnswerSamples } = estimateForecastAccuracy(answerEvents, todayKey);
  const projectedStates = new Map<string, ProjectedWordState>();
  for (const record of Object.values(recordsById)) {
    if (!activeWordIds.has(record.wordId)) continue;
    projectedStates.set(record.wordId, {
      wordId: record.wordId,
      reviewStage: record.reviewStage,
      nextDueAt: record.nextDueAt
        ? new Date(record.nextDueAt).getTime()
        : new Date(`${todayKey}T12:00:00.000Z`).getTime(),
    });
  }

  const todayDate = new Date(`${todayKey}T12:00:00.000Z`);
  const answeredTodayIds = new Set(currentTask.answeredWordIds);
  for (const wordId of currentTask.reviewWordIds) {
    const state = projectedStates.get(wordId);
    const studiedToday = recordsById[wordId]?.lastStudiedAt?.slice(0, 10) === todayKey;
    if (!state || answeredTodayIds.has(wordId) || studiedToday) continue;
    projectedStates.set(wordId, advanceProjectedState(state, todayDate, expectedAccuracy));
  }
  for (const wordId of currentTask.newWordIds) {
    if (projectedStates.has(wordId)) continue;
    projectedStates.set(wordId, advanceProjectedState({
      wordId,
      reviewStage: 0,
      nextDueAt: todayDate.getTime(),
    }, todayDate, expectedAccuracy));
  }

  const unseenWordIds = words
    .filter((word) => (
      activeWordIds.has(word.id)
      && !projectedStates.has(word.id)
      && !currentTask.newWordIds.includes(word.id)
    ))
    .map((word) => word.id);
  let unseenCursor = 0;

  const forecast = Array.from({ length: LEARNING_TIMELINE_RANGE_DAYS }, (_, index): FutureLearningPoint => {
    const offset = index + 1;
    const forecastDate = addDays(new Date(`${todayKey}T12:00:00.000Z`), offset);
    const forecastDateKey = dateKey(forecastDate);
    const endOfDay = addDays(forecastDate, 1).getTime() - 1;
    const dueReviews = [...projectedStates.values()]
      .filter((state) => state.nextDueAt <= endOfDay)
      .sort((left, right) => left.nextDueAt - right.nextDueAt || left.wordId.localeCompare(right.wordId));
    const limits = getReviewFirstPlanLimits(dueReviews.length, setting);
    const scheduledReviews = dueReviews.slice(0, limits.reviewCount);
    for (const state of scheduledReviews) {
      projectedStates.set(state.wordId, advanceProjectedState(state, forecastDate, expectedAccuracy));
    }

    const newCount = Math.min(limits.newWordCount, unseenWordIds.length - unseenCursor);
    const newWordIds = unseenWordIds.slice(unseenCursor, unseenCursor + newCount);
    unseenCursor += newCount;
    for (const wordId of newWordIds) {
      projectedStates.set(wordId, advanceProjectedState({
        wordId,
        reviewStage: 0,
        nextDueAt: forecastDate.getTime(),
      }, forecastDate, expectedAccuracy));
    }
    return {
      dateKey: forecastDateKey,
      newCount,
      reviewCount: scheduledReviews.length,
      deferredReviewCount: dueReviews.length - scheduledReviews.length,
      totalCount: newCount + scheduledReviews.length,
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
      deferredReviewCount: futurePoint?.deferredReviewCount ?? 0,
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
    forecastModel: {
      dailyNewTarget: setting.dailyNewWordCount,
      dailyReviewBaseline: setting.dailyReviewLimit,
      expectedAccuracy,
      historicalAnswerSamples,
    },
  };
}
