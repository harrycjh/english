import type { AnswerEvent } from '../models/answer-event';
import type { DailyTaskSummary } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import type { ParentSetting } from '../models/parent-setting';
import type { WordSelectionState } from '../models/word-selection-state';
import type { WordRecord } from '../models/word';
import type { QuestionKind } from './question-service';
import { isWordEnabledForStudy } from './selection-service';
import {
  getMasteredReviewDelayDays,
  MAX_MASTERY_LEVEL,
  REVIEW_INTERVAL_DAYS,
} from './spaced-repetition';
import { getReviewFirstPlanLimits } from './task-service';
import {
  addDaysToStudyDateKey,
  createStudyDateKey,
  getReviewDueAt,
} from './study-day';

const LEARNING_TIMELINE_RANGE_DAYS = 90;
const DEFAULT_FORECAST_ACCURACY = 0.85;
const ACCURACY_PRIOR_SAMPLE_COUNT = 10;
const QUESTION_KIND_PRIOR_SAMPLE_COUNT = 8;
const STAGE_KIND_PRIOR_SAMPLE_COUNT = 5;
const MAX_RETRY_LOAD_PER_WORD = 4;

export interface HistoricalLearningPoint {
  dateKey: string;
  newCount: number;
  reviewCount: number;
  retryCount: number;
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
  retryCount: number;
  deferredReviewCount: number;
  totalCount: number;
}

export interface LearningLoadPoint {
  dateKey: string;
  newCount: number;
  reviewCount: number;
  retryCount: number;
  totalCount: number;
  deferredReviewCount: number;
  kind: 'history' | 'today' | 'forecast';
}

export interface LearningForecastModel {
  dailyNewTarget: number;
  dailyReviewBaseline: number;
  expectedAccuracy: number;
  historicalAnswerSamples: number;
  completionRate: number;
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
  masteryLevel: number;
  nextDueAt: number;
}

function advanceProjectedState(
  state: ProjectedWordState,
  forecastDate: Date,
): ProjectedWordState {
  const nextLevel = state.masteryLevel === 0
    ? 2
    : Math.min(state.masteryLevel + 1, MAX_MASTERY_LEVEL);
  const delayDays = nextLevel >= MAX_MASTERY_LEVEL
    ? getMasteredReviewDelayDays(state.wordId, forecastDate)
    : REVIEW_INTERVAL_DAYS[nextLevel];
  return {
    ...state,
    masteryLevel: nextLevel,
    nextDueAt: getReviewDueAt(forecastDate, delayDays).getTime(),
  };
}

function getProjectedQuestionKind(masteryLevel: number): QuestionKind {
  if (masteryLevel <= 0) return 'recognition';
  if (masteryLevel <= 2) return 'image-choice';
  if (masteryLevel === 3) return 'image-answer-choice';
  if (masteryLevel === 4) return 'text-choice';
  return 'fill-blank';
}

interface ForecastAccuracyProfile {
  expectedAccuracy: number;
  historicalAnswerSamples: number;
  byQuestionKind: Map<QuestionKind, number>;
  byStageAndKind: Map<string, number>;
}

function stageKindKey(masteryLevel: number, questionKind: QuestionKind): string {
  return `${masteryLevel}|${questionKind}`;
}

function estimateForecastAccuracy(answerEvents: AnswerEvent[], todayKey: string): ForecastAccuracyProfile {
  const historicalEvents = answerEvents
    .filter((event) => event.dateKey <= todayKey)
    .sort((left, right) => left.answeredAt.localeCompare(right.answeredAt))
    .slice(-500);
  const historicalCorrect = historicalEvents.filter((event) => event.isCorrect).length;
  const expectedAccuracy = (
    historicalCorrect + DEFAULT_FORECAST_ACCURACY * ACCURACY_PRIOR_SAMPLE_COUNT
  ) / (historicalEvents.length + ACCURACY_PRIOR_SAMPLE_COUNT);

  const byQuestionKind = new Map<QuestionKind, number>();
  for (const questionKind of ['recognition', 'image-choice', 'image-answer-choice', 'text-choice', 'fill-blank'] as QuestionKind[]) {
    const events = historicalEvents.filter((event) => event.questionKind === questionKind);
    const correct = events.filter((event) => event.isCorrect).length;
    byQuestionKind.set(
      questionKind,
      (correct + expectedAccuracy * QUESTION_KIND_PRIOR_SAMPLE_COUNT)
        / (events.length + QUESTION_KIND_PRIOR_SAMPLE_COUNT),
    );
  }

  const byStageAndKind = new Map<string, number>();
  const stageGroups = new Map<string, AnswerEvent[]>();
  for (const event of historicalEvents) {
    const masteryLevel = event.learningStateBefore?.masteryLevel;
    if (masteryLevel === undefined) continue;
    const key = stageKindKey(masteryLevel, event.questionKind);
    const events = stageGroups.get(key) ?? [];
    events.push(event);
    stageGroups.set(key, events);
  }
  for (const [key, events] of stageGroups) {
    const questionKind = events[0].questionKind;
    const questionKindAccuracy = byQuestionKind.get(questionKind) ?? expectedAccuracy;
    const correct = events.filter((event) => event.isCorrect).length;
    byStageAndKind.set(
      key,
      (correct + questionKindAccuracy * STAGE_KIND_PRIOR_SAMPLE_COUNT)
        / (events.length + STAGE_KIND_PRIOR_SAMPLE_COUNT),
    );
  }

  return {
    expectedAccuracy,
    historicalAnswerSamples: historicalEvents.length,
    byQuestionKind,
    byStageAndKind,
  };
}

function getProjectedAccuracy(state: ProjectedWordState, profile: ForecastAccuracyProfile): number {
  const questionKind = getProjectedQuestionKind(state.masteryLevel);
  return Math.min(0.98, Math.max(
    0.2,
    profile.byStageAndKind.get(stageKindKey(state.masteryLevel, questionKind))
      ?? profile.byQuestionKind.get(questionKind)
      ?? profile.expectedAccuracy,
  ));
}

function estimateRetryCount(states: ProjectedWordState[], profile: ForecastAccuracyProfile): number {
  const expectedRetries = states.reduce((sum, state) => {
    const accuracy = getProjectedAccuracy(state, profile);
    return sum + Math.min(MAX_RETRY_LOAD_PER_WORD, (1 - accuracy) / accuracy);
  }, 0);
  return Math.round(expectedRetries);
}

function getStudyDate(dateKeyValue: string): Date {
  return new Date(`${dateKeyValue}T04:00:00.000+08:00`);
}

function getStudyDayCutoff(dateKeyValue: string): number {
  const nextDateKey = addDaysToStudyDateKey(dateKeyValue, 1);
  return getStudyDate(nextDateKey).getTime();
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
  const todayKey = createStudyDateKey(now);
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
    const retryCount = Math.max(0, answerCount - learnedWordCount);
    return {
      dateKey: historyDateKey,
      newCount,
      reviewCount,
      retryCount,
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
  const accuracyProfile = estimateForecastAccuracy(answerEvents, todayKey);
  const { expectedAccuracy, historicalAnswerSamples } = accuracyProfile;
  const completionRate = 1;
  const projectedStates = new Map<string, ProjectedWordState>();
  for (const record of Object.values(recordsById)) {
    if (!activeWordIds.has(record.wordId)) continue;
    projectedStates.set(record.wordId, {
      wordId: record.wordId,
      masteryLevel: record.masteryLevel,
      nextDueAt: record.nextDueAt
        ? new Date(record.nextDueAt).getTime()
        : getStudyDate(todayKey).getTime(),
    });
  }

  const todayDate = getStudyDate(todayKey);
  const answeredTodayIds = new Set(currentTask.answeredWordIds);
  const studiedTodayIds = new Set(Object.values(recordsById)
    .filter((record) => record.lastStudiedAt && createStudyDateKey(new Date(record.lastStudiedAt)) === todayKey)
    .map((record) => record.wordId));
  const completedTodayIds = new Set([...answeredTodayIds, ...studiedTodayIds]);
  const plannedTodayIds = new Set([...currentTask.reviewWordIds, ...currentTask.newWordIds]);
  const expectedCompletedToday = currentTask.completedAt
    ? plannedTodayIds.size
    : Math.max(completedTodayIds.size, Math.round(plannedTodayIds.size * completionRate));
  let remainingTodayCapacity = Math.max(0, expectedCompletedToday - completedTodayIds.size);

  const pendingTodayReviews = currentTask.reviewWordIds.filter((wordId) => (
    !completedTodayIds.has(wordId) && projectedStates.has(wordId)
  ));
  for (const wordId of pendingTodayReviews.slice(0, remainingTodayCapacity)) {
    const state = projectedStates.get(wordId)!;
    projectedStates.set(wordId, advanceProjectedState(state, todayDate));
  }
  remainingTodayCapacity = Math.max(0, remainingTodayCapacity - pendingTodayReviews.length);

  const pendingTodayNewWords = currentTask.newWordIds.filter((wordId) => (
    !completedTodayIds.has(wordId) && !projectedStates.has(wordId)
  ));
  for (const wordId of pendingTodayNewWords.slice(0, remainingTodayCapacity)) {
    const state = { wordId, masteryLevel: 0, nextDueAt: todayDate.getTime() };
    projectedStates.set(wordId, advanceProjectedState(state, todayDate));
  }

  const unseenWordIds = words
    .filter((word) => (
      activeWordIds.has(word.id)
      && !projectedStates.has(word.id)
    ))
    .map((word) => word.id);
  const unseenQueue = [...unseenWordIds];

  const forecast = Array.from({ length: LEARNING_TIMELINE_RANGE_DAYS }, (_, index): FutureLearningPoint => {
    const offset = index + 1;
    const forecastDateKey = addDaysToStudyDateKey(todayKey, offset);
    const forecastDate = getStudyDate(forecastDateKey);
    const cutoff = getStudyDayCutoff(forecastDateKey);
    const dueReviews = [...projectedStates.values()]
      .filter((state) => state.nextDueAt < cutoff)
      .sort((left, right) => left.nextDueAt - right.nextDueAt || left.wordId.localeCompare(right.wordId));
    const limits = getReviewFirstPlanLimits(dueReviews.length, setting);
    const plannedReviews = dueReviews.slice(0, limits.reviewCount);
    const plannedNewCount = Math.min(limits.newWordCount, unseenQueue.length);
    const expectedCompletedCount = Math.round((plannedReviews.length + plannedNewCount) * completionRate);
    const completedReviews = plannedReviews.slice(0, expectedCompletedCount);
    const completedNewCount = Math.min(
      plannedNewCount,
      Math.max(0, expectedCompletedCount - completedReviews.length),
    );
    const completedNewWordIds = unseenQueue.splice(0, completedNewCount);
    const attemptedStates = [...completedReviews];

    for (const state of completedReviews) {
      projectedStates.set(state.wordId, advanceProjectedState(state, forecastDate));
    }

    for (const wordId of completedNewWordIds) {
      const state = {
        wordId,
        masteryLevel: 0,
        nextDueAt: forecastDate.getTime(),
      };
      attemptedStates.push(state);
      projectedStates.set(wordId, advanceProjectedState(state, forecastDate));
    }
    const retryCount = estimateRetryCount(attemptedStates, accuracyProfile);
    return {
      dateKey: forecastDateKey,
      newCount: completedNewWordIds.length,
      reviewCount: completedReviews.length,
      retryCount,
      deferredReviewCount: dueReviews.length - completedReviews.length,
      totalCount: completedNewWordIds.length + completedReviews.length,
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
    const retryCount = futurePoint?.retryCount ?? historicalPoint?.retryCount ?? 0;
    return {
      dateKey: timelineDateKey,
      newCount,
      reviewCount,
      retryCount,
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
      completionRate,
    },
  };
}
