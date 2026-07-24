import { describe, expect, it } from 'vitest';
import type { AnswerEvent } from '../models/answer-event';
import type { LearningRecord } from '../models/learning-record';
import {
  buildMemoryStatistics,
  estimateEbbinghausSavings,
  estimateHalfLifeDays,
  estimateRetention,
} from './memory-statistics';

const now = new Date('2026-07-15T12:00:00.000Z');

function createRecord(overrides: Partial<LearningRecord> = {}): LearningRecord {
  return {
    wordId: 'word-a',
    masteryLevel: 3,
    reviewStage: 3,
    correctStreak: 2,
    wrongCount: 0,
    lastStudiedAt: '2026-07-14T12:00:00.000Z',
    nextDueAt: '2026-07-17T12:00:00.000Z',
    ...overrides,
  };
}

function createEvent(id: string, answeredAt: string, isCorrect: boolean): AnswerEvent {
  return {
    id,
    wordId: 'word-a',
    dateKey: answeredAt.slice(0, 10),
    answeredAt,
    questionKind: 'text-choice',
    selectedAnswer: '',
    correctAnswer: '',
    isCorrect,
    responseTimeMs: 1000,
  };
}

function createRepeatedAnswerSample(
  wordId: string,
  intervalDays: number,
  isCorrect: boolean,
  index: number,
): AnswerEvent[] {
  const startedAt = new Date('2026-07-01T08:00:00.000Z');
  const answeredAt = new Date(startedAt.getTime() + intervalDays * 86_400_000);
  return [
    { ...createEvent(`${index}-start`, startedAt.toISOString(), true), wordId },
    { ...createEvent(`${index}-recall`, answeredAt.toISOString(), isCorrect), wordId },
  ];
}

describe('memory statistics', () => {
  it('uses the public half-life curve and reaches 75% retention at the scheduled due interval', () => {
    const record = createRecord();
    const halfLife = estimateHalfLifeDays(record);
    expect(halfLife).toBeCloseTo(7.23, 1);
    expect(estimateRetention(record, new Date(record.nextDueAt!))).toBeCloseTo(0.75, 4);
  });

  it('keeps the default prediction until enough repeated formal answers are available', () => {
    const events = [
      createEvent('1', '2026-07-12T12:00:00.000Z', true),
      createEvent('2', '2026-07-13T12:00:00.000Z', false),
      createEvent('3', '2026-07-14T12:00:00.000Z', true),
    ];
    const statistics = buildMemoryStatistics({ 'word-a': createRecord() }, events, now);
    expect(statistics.predictedCurve[0]).toMatchObject({ intervalDays: 0, retention: 100 });
    expect(statistics.predictedCurve
      .map((point) => point.intervalDays)
      .filter((days) => Number.isInteger(days) && days <= 14))
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7, 14]);
    expect(statistics.predictedCurve.at(-1)?.intervalDays).toBe(365);
    expect(statistics.personalCurveModel).toMatchObject({
      source: 'default',
      sampleCount: 2,
      intervalBucketCount: 1,
    });
    expect(statistics.averageRetentionNow).toBeGreaterThan(0);
    expect(statistics.masteryLevels.map((point) => point.level)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('uses the Ebbinghaus savings formula with calibrated long-term anchors', () => {
    expect(estimateEbbinghausSavings(20 / 1440)).toBeCloseTo(56.99, 1);
    expect(estimateEbbinghausSavings(1)).toBeCloseTo(30.4, 1);
    expect(estimateEbbinghausSavings(30)).toBe(21);
    expect(estimateEbbinghausSavings(31)).toBeLessThan(21);
    expect(estimateEbbinghausSavings(31)).toBeGreaterThan(18);
    expect(estimateEbbinghausSavings(60)).toBe(18);
    expect(estimateEbbinghausSavings(90)).toBe(15);
    expect(estimateEbbinghausSavings(180)).toBe(12);
    expect(estimateEbbinghausSavings(365)).toBe(5);
  });

  it('uses a slightly higher default curve until repeated formal answers are available', () => {
    const statistics = buildMemoryStatistics({ 'word-a': createRecord() }, [], now);
    expect(statistics.personalCurveModel).toMatchObject({
      source: 'default',
      alpha: null,
      stabilityDays: null,
      sampleCount: 0,
    });
    expect(statistics.predictedCurve[0].retention).toBe(100);
    expect(statistics.predictedCurve.slice(1).every((point, index) => (
      point.retention > statistics.ebbinghausCurve[index + 1].retention
    ))).toBe(true);
  });

  it('builds observed recall points from actual repeated-answer intervals', () => {
    const events = [
      createEvent('1', '2026-07-12T12:00:00.000Z', true),
      createEvent('2', '2026-07-13T12:00:00.000Z', false),
      createEvent('3', '2026-07-14T12:00:00.000Z', true),
    ];
    const statistics = buildMemoryStatistics({ 'word-a': createRecord() }, events, now);
    expect(statistics.observedRecallPoints).toHaveLength(1);
    expect(statistics.observedRecallPoints[0]).toMatchObject({ intervalDays: 1, retention: 50, sampleCount: 2 });
  });

  it('uses only the first formal answer for the same word on each calendar day', () => {
    const events = [
      createEvent('1', '2026-07-12T08:00:00.000Z', true),
      createEvent('2', '2026-07-12T08:05:00.000Z', false),
      createEvent('3', '2026-07-13T08:00:00.000Z', true),
    ];
    const statistics = buildMemoryStatistics({ 'word-a': createRecord() }, events, now);
    expect(statistics.observedRecallPoints).toEqual([
      expect.objectContaining({ intervalDays: 1, retention: 100, sampleCount: 1 }),
    ]);
  });

  it('switches to a fitted MaiMemo-style curve when enough real-interval samples exist', () => {
    const outcomes = [
      ...[true, true, true, false].map((isCorrect, index) => ({ intervalDays: 1, isCorrect, index })),
      ...[true, true, false, false].map((isCorrect, index) => ({ intervalDays: 2, isCorrect, index: index + 4 })),
      ...[true, false, false, false].map((isCorrect, index) => ({ intervalDays: 3, isCorrect, index: index + 8 })),
    ];
    const events = outcomes.flatMap(({ intervalDays, isCorrect, index }) => (
      createRepeatedAnswerSample(`word-${index}`, intervalDays, isCorrect, index)
    ));
    const statistics = buildMemoryStatistics({}, events, now);
    const model = statistics.personalCurveModel;

    expect(model).toMatchObject({
      source: 'answer-data',
      sampleCount: 12,
      intervalBucketCount: 3,
    });
    expect(model?.alpha).toBeGreaterThan(0.1);
    expect(model?.alpha).toBeLessThanOrEqual(1);
    expect(model?.stabilityDays).toBeGreaterThan(0);
    expect(statistics.predictedCurve.find((point) => point.intervalDays === 1)!.retention)
      .toBeGreaterThan(statistics.predictedCurve.find((point) => point.intervalDays === 3)!.retention);
  });

  it('counts studied words at each exact mastery level', () => {
    const records = Object.fromEntries([0, 1, 1, 10].map((masteryLevel, index) => {
      const wordId = `word-${index}`;
      return [wordId, createRecord({
        wordId,
        masteryLevel,
        reviewStage: masteryLevel,
      })];
    }));
    const statistics = buildMemoryStatistics(records, [], now);
    expect(statistics.masteryLevels.map((point) => point.count)).toEqual([1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  });

  it('rebuilds daily mastery-level counts from saved answer snapshots', () => {
    const shortMemory = createRecord({
      wordId: 'word-short',
      masteryLevel: 2,
      reviewStage: 2,
      lastStudiedAt: '2026-07-13T08:00:00.000Z',
      nextDueAt: '2026-07-18T08:00:00.000Z',
    });
    const longMemory = createRecord({
      wordId: 'word-long',
      masteryLevel: 6,
      reviewStage: 6,
      lastStudiedAt: '2026-07-14T08:00:00.000Z',
      nextDueAt: '2026-08-28T08:00:00.000Z',
    });
    const events = [
      { ...createEvent('short', '2026-07-13T08:00:00.000Z', true), wordId: shortMemory.wordId, learningStateAfter: shortMemory },
      { ...createEvent('long', '2026-07-14T08:00:00.000Z', true), wordId: longMemory.wordId, learningStateAfter: longMemory },
    ];

    const statistics = buildMemoryStatistics({
      [shortMemory.wordId]: shortMemory,
      [longMemory.wordId]: longMemory,
    }, events, now);

    expect(statistics.masteryLevelTimeline.find((point) => point.dateKey === '2026-07-12')?.counts)
      .toMatchObject({ 2: 0, 6: 0 });
    expect(statistics.masteryLevelTimeline.find((point) => point.dateKey === '2026-07-13')?.counts)
      .toMatchObject({ 2: 1, 6: 0 });
    expect(statistics.masteryLevelTimeline.find((point) => point.dateKey === '2026-07-14')?.counts)
      .toMatchObject({ 2: 1, 6: 1 });
  });
});
