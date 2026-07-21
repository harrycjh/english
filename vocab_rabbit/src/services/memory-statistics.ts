import type { AnswerEvent } from '../models/answer-event';
import type { LearningRecord } from '../models/learning-record';
import { createStudyDateKey } from './study-day';

const DAY_MS = 24 * 60 * 60 * 1000;
const TARGET_RETENTION_AT_DUE = 0.75;
const FALLBACK_INTERVAL_DAYS = [0.25, 2, 4, 7, 14, 30, 60];
const CURVE_INTERVAL_DAYS = [
  0,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  14,
  21,
  30,
  60,
  90,
  180,
  365,
];
const OBSERVED_INTERVAL_LIMITS = [0.25, 0.5, 1, 2, 3, 7, 14, 21, 30, 60, 90, 180, 365];
const DURABILITY_THRESHOLDS = [10, 30, 60, 90];
const MIN_PERSONAL_MODEL_SAMPLES = 6;
const MIN_PERSONAL_MODEL_BUCKETS = 2;
const EBBINGHAUS_LONG_TERM_ANCHORS = [
  { intervalDays: 30, retention: 21 },
  { intervalDays: 60, retention: 18 },
  { intervalDays: 90, retention: 15 },
  { intervalDays: 180, retention: 12 },
  { intervalDays: 365, retention: 5 },
];

export interface WordMemoryEstimate {
  wordId: string;
  halfLifeDays: number;
  retentionNow: number;
  lastStudiedAt: string;
  nextDueAt: string | null;
  masteryLevel: number;
  reviewStage: number;
}

export interface RetentionPoint {
  intervalDays: number;
  retention: number;
  sampleCount?: number;
}

export interface DurabilityThresholdPoint {
  thresholdDays: number;
  count: number;
  color: string;
}

export interface DurabilityTimelinePoint {
  dateKey: string;
  counts: Record<number, number>;
}

export interface PersonalCurveModel {
  source: 'default' | 'answer-data';
  alpha: number | null;
  stabilityDays: number | null;
  sampleCount: number;
  intervalBucketCount: number;
  rmse: number | null;
}

export interface MemoryStatistics {
  estimates: WordMemoryEstimate[];
  predictedCurve: RetentionPoint[];
  ebbinghausCurve: RetentionPoint[];
  observedRecallPoints: RetentionPoint[];
  personalCurveModel: PersonalCurveModel;
  durabilityThresholds: DurabilityThresholdPoint[];
  durabilityTimeline: DurabilityTimelinePoint[];
  averageHalfLifeDays: number;
  medianHalfLifeDays: number;
  averageRetentionNow: number;
  atRiskCount: number;
  durableCount: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getFallbackIntervalDays(reviewStage: number): number {
  const index = clamp(Math.round(reviewStage), 0, FALLBACK_INTERVAL_DAYS.length - 1);
  return FALLBACK_INTERVAL_DAYS[index];
}

export function estimateHalfLifeDays(record: LearningRecord): number {
  let scheduledIntervalDays = getFallbackIntervalDays(record.reviewStage);
  if (record.lastStudiedAt && record.nextDueAt) {
    const interval = (new Date(record.nextDueAt).getTime() - new Date(record.lastStudiedAt).getTime()) / DAY_MS;
    if (Number.isFinite(interval) && interval > 0) {
      scheduledIntervalDays = interval;
    }
  }

  return Math.max(0.25, scheduledIntervalDays / Math.log2(1 / TARGET_RETENTION_AT_DUE));
}

export function estimateRetention(record: LearningRecord, at: Date = new Date()): number {
  if (!record.lastStudiedAt) return 0;
  const elapsedDays = Math.max(0, (at.getTime() - new Date(record.lastStudiedAt).getTime()) / DAY_MS);
  return clamp(2 ** (-elapsedDays / estimateHalfLifeDays(record)), 0, 1);
}

export function estimateEbbinghausSavings(intervalDays: number): number {
  if (intervalDays <= 0) return 100;
  const minutes = Math.max(1, intervalDays * 24 * 60);
  const formulaRetention = 100 * 1.84 / (Math.log10(minutes) ** 1.25 + 1.84);
  if (intervalDays < 30) return formulaRetention;

  const anchors = EBBINGHAUS_LONG_TERM_ANCHORS;
  const upperIndex = anchors.findIndex((anchor) => intervalDays <= anchor.intervalDays);
  if (upperIndex < 0) {
    return EBBINGHAUS_LONG_TERM_ANCHORS.at(-1)!.retention;
  }
  if (upperIndex === 0) return anchors[0].retention;

  const upper = anchors[upperIndex];
  const lower = anchors[upperIndex - 1];
  const progress = (intervalDays - lower.intervalDays) / (upper.intervalDays - lower.intervalDays);
  return lower.retention + ((upper.retention - lower.retention) * progress);
}

interface RecallSample {
  intervalDays: number;
  recalled: boolean;
}

function buildRecallSamples(answerEvents: AnswerEvent[]): RecallSample[] {
  const eventsByWord = new Map<string, AnswerEvent[]>();
  for (const event of answerEvents) {
    const events = eventsByWord.get(event.wordId) ?? [];
    events.push(event);
    eventsByWord.set(event.wordId, events);
  }

  const samples: RecallSample[] = [];
  for (const events of eventsByWord.values()) {
    events.sort((left, right) => left.answeredAt.localeCompare(right.answeredAt));
    const firstEventByDay = new Map<string, AnswerEvent>();
    for (const event of events) {
      if (!firstEventByDay.has(event.dateKey)) {
        firstEventByDay.set(event.dateKey, event);
      }
    }

    const dailyEvents = [...firstEventByDay.values()];
    for (let index = 1; index < dailyEvents.length; index += 1) {
      const previousTime = new Date(dailyEvents[index - 1].answeredAt).getTime();
      const currentTime = new Date(dailyEvents[index].answeredAt).getTime();
      const gapDays = (currentTime - previousTime) / DAY_MS;
      if (!Number.isFinite(gapDays) || gapDays < 1 / 144 || gapDays > 365) continue;
      samples.push({ intervalDays: gapDays, recalled: dailyEvents[index].isCorrect });
    }
  }

  return samples;
}

function buildObservedRecallPoints(samples: RecallSample[]): RetentionPoint[] {
  const buckets = OBSERVED_INTERVAL_LIMITS.map((limit) => ({ limit, gaps: [] as number[], correct: 0, total: 0 }));
  for (const sample of samples) {
    const bucket = buckets.find((candidate) => sample.intervalDays <= candidate.limit);
    if (!bucket) continue;
    bucket.gaps.push(sample.intervalDays);
    bucket.total += 1;
    bucket.correct += sample.recalled ? 1 : 0;
  }

  return buckets
    .filter((bucket) => bucket.total > 0)
    .map((bucket) => ({
      intervalDays: bucket.gaps.reduce((sum, value) => sum + value, 0) / bucket.gaps.length,
      retention: (bucket.correct / bucket.total) * 100,
      sampleCount: bucket.total,
    }));
}

function predictMaiMemoRetention(intervalDays: number, alpha: number, stabilityDays: number): number {
  if (intervalDays <= 0) return 100;
  const decayBase = 1 - 0.1 / alpha;
  const retention = alpha * Math.exp(Math.log(decayBase) * intervalDays / stabilityDays) + (1 - alpha);
  return clamp(retention * 100, 0, 100);
}

function fitPersonalCurve(points: RetentionPoint[]): PersonalCurveModel {
  const sampleCount = points.reduce((sum, point) => sum + (point.sampleCount ?? 0), 0);
  const intervalBucketCount = points.filter((point) => (point.sampleCount ?? 0) > 0).length;
  if (sampleCount < MIN_PERSONAL_MODEL_SAMPLES || intervalBucketCount < MIN_PERSONAL_MODEL_BUCKETS) {
    return {
      source: 'default',
      alpha: null,
      stabilityDays: null,
      sampleCount,
      intervalBucketCount,
      rmse: null,
    };
  }

  let bestAlpha = 1;
  let bestStabilityDays = 1;
  let bestMeanSquaredError = Number.POSITIVE_INFINITY;
  const minStabilityDays = 1 / 24;
  const maxStabilityDays = 365;

  for (let alphaStep = 0; alphaStep <= 89; alphaStep += 1) {
    const alpha = 0.11 + alphaStep * 0.01;
    for (let stabilityStep = 0; stabilityStep <= 240; stabilityStep += 1) {
      const ratio = stabilityStep / 240;
      const stabilityDays = minStabilityDays * (maxStabilityDays / minStabilityDays) ** ratio;
      let weightedSquaredError = 0;

      for (const point of points) {
        const weight = point.sampleCount ?? 0;
        const error = predictMaiMemoRetention(point.intervalDays, alpha, stabilityDays) - point.retention;
        weightedSquaredError += error * error * weight;
      }

      const meanSquaredError = weightedSquaredError / sampleCount;
      if (meanSquaredError < bestMeanSquaredError) {
        bestMeanSquaredError = meanSquaredError;
        bestAlpha = alpha;
        bestStabilityDays = stabilityDays;
      }
    }
  }

  return {
    source: 'answer-data',
    alpha: bestAlpha,
    stabilityDays: bestStabilityDays,
    sampleCount,
    intervalBucketCount,
    rmse: Math.sqrt(bestMeanSquaredError),
  };
}

function createDurabilityThresholds(estimates: WordMemoryEstimate[]): DurabilityThresholdPoint[] {
  const colors = ['#f0a23f', '#65b991', '#569ee4', '#8a78d4'];
  return DURABILITY_THRESHOLDS.map((thresholdDays, index) => ({
    thresholdDays,
    color: colors[index],
    count: estimates.filter((estimate) => estimate.halfLifeDays >= thresholdDays).length,
  }));
}

function createDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return createDateKey(date);
}

function createTimelineCounts(records: Iterable<LearningRecord>): Record<number, number> {
  const estimates = [...records]
    .filter((record): record is LearningRecord & { lastStudiedAt: string } => Boolean(record.lastStudiedAt))
    .map((record) => ({
      wordId: record.wordId,
      halfLifeDays: estimateHalfLifeDays(record),
      retentionNow: 0,
      lastStudiedAt: record.lastStudiedAt,
      nextDueAt: record.nextDueAt,
      masteryLevel: record.masteryLevel,
      reviewStage: record.reviewStage,
    }));
  return Object.fromEntries(
    createDurabilityThresholds(estimates).map((point) => [point.thresholdDays, point.count]),
  );
}

export function buildDurabilityTimeline(
  recordsById: Record<string, LearningRecord>,
  answerEvents: AnswerEvent[],
  now: Date = new Date(),
  historyDays = 90,
): DurabilityTimelinePoint[] {
  const todayKey = createStudyDateKey(now);
  const startKey = addDays(todayKey, -Math.max(0, historyDays));
  const snapshots = answerEvents
    .filter((event): event is AnswerEvent & { learningStateAfter: LearningRecord } => Boolean(event.learningStateAfter))
    .sort((left, right) => left.answeredAt.localeCompare(right.answeredAt));
  const stateByWord = new Map<string, LearningRecord>();
  const timeline: DurabilityTimelinePoint[] = [];
  let snapshotIndex = 0;

  for (let dateKey = startKey; dateKey <= todayKey; dateKey = addDays(dateKey, 1)) {
    while (snapshotIndex < snapshots.length && snapshots[snapshotIndex].dateKey <= dateKey) {
      const snapshot = snapshots[snapshotIndex].learningStateAfter;
      stateByWord.set(snapshot.wordId, snapshot);
      snapshotIndex += 1;
    }

    if (dateKey === todayKey) {
      for (const record of Object.values(recordsById)) {
        stateByWord.set(record.wordId, record);
      }
    }

    timeline.push({ dateKey, counts: createTimelineCounts(stateByWord.values()) });
  }

  return timeline;
}

export function buildMemoryStatistics(
  recordsById: Record<string, LearningRecord>,
  answerEvents: AnswerEvent[],
  now: Date = new Date(),
): MemoryStatistics {
  const estimates = Object.values(recordsById)
    .filter((record): record is LearningRecord & { lastStudiedAt: string } => Boolean(record.lastStudiedAt))
    .map((record) => ({
      wordId: record.wordId,
      halfLifeDays: estimateHalfLifeDays(record),
      retentionNow: estimateRetention(record, now) * 100,
      lastStudiedAt: record.lastStudiedAt,
      nextDueAt: record.nextDueAt,
      masteryLevel: record.masteryLevel,
      reviewStage: record.reviewStage,
    }))
    .sort((left, right) => left.retentionNow - right.retentionNow);

  const recallSamples = buildRecallSamples(answerEvents);
  const observedRecallPoints = buildObservedRecallPoints(recallSamples);
  const personalCurveModel = fitPersonalCurve(observedRecallPoints);
  const ebbinghausCurve = CURVE_INTERVAL_DAYS.map((intervalDays) => ({
    intervalDays,
    retention: estimateEbbinghausSavings(intervalDays),
  }));
  const predictedCurve = ebbinghausCurve.map((point) => ({
    intervalDays: point.intervalDays,
    retention: personalCurveModel.source === 'answer-data'
      ? predictMaiMemoRetention(
        point.intervalDays,
        personalCurveModel.alpha!,
        personalCurveModel.stabilityDays!,
      )
      : Math.min(100, point.retention * 1.15),
  }));

  const halfLives = estimates.map((estimate) => estimate.halfLifeDays).sort((left, right) => left - right);
  const middle = Math.floor(halfLives.length / 2);
  const medianHalfLifeDays = halfLives.length === 0
    ? 0
    : halfLives.length % 2 === 0
      ? (halfLives[middle - 1] + halfLives[middle]) / 2
      : halfLives[middle];

  return {
    estimates,
    predictedCurve,
    ebbinghausCurve,
    observedRecallPoints,
    personalCurveModel,
    durabilityThresholds: createDurabilityThresholds(estimates),
    durabilityTimeline: buildDurabilityTimeline(recordsById, answerEvents, now),
    averageHalfLifeDays: estimates.length > 0
      ? estimates.reduce((sum, estimate) => sum + estimate.halfLifeDays, 0) / estimates.length
      : 0,
    medianHalfLifeDays,
    averageRetentionNow: estimates.length > 0
      ? estimates.reduce((sum, estimate) => sum + estimate.retentionNow, 0) / estimates.length
      : 0,
    atRiskCount: estimates.filter((estimate) => estimate.retentionNow < TARGET_RETENTION_AT_DUE * 100).length,
    durableCount: estimates.filter((estimate) => estimate.halfLifeDays > 30).length,
  };
}
