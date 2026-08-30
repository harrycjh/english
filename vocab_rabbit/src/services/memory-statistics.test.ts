import { describe, expect, it } from 'vitest';
import type { AnswerEvent } from '../models/answer-event';
import type { LearningRecord } from '../models/learning-record';
import {
  buildMasteryLevelAccuracy,
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

  it('excludes Lv0 self-assessments, same-day retries, and practice sessions from recall samples', () => {
    const formalEvents = createRepeatedAnswerSample('formal-word', 2, true, 0).map((event, index) => ({
      ...event,
      learningStateBefore: createRecord({
        wordId: event.wordId,
        masteryLevel: index + 1,
        reviewStage: index + 1,
      }),
    }));
    const lv0Events = createRepeatedAnswerSample('lv0-word', 1, false, 1).map((event) => ({
      ...event,
      questionKind: 'recognition' as const,
      learningStateBefore: createRecord({ wordId: event.wordId, masteryLevel: 0, reviewStage: 0 }),
    }));
    const retryEvents = createRepeatedAnswerSample('retry-word', 3, false, 2).map((event, index) => ({
      ...event,
      isSessionRetry: index === 1,
      learningStateBefore: createRecord({ wordId: event.wordId, masteryLevel: 2, reviewStage: 2 }),
    }));
    const practiceEvents = createRepeatedAnswerSample('practice-word', 7, true, 3).map((event) => ({
      ...event,
      sessionKind: 'practice',
      learningStateBefore: createRecord({ wordId: event.wordId, masteryLevel: 3, reviewStage: 3 }),
    })) as AnswerEvent[];

    const statistics = buildMemoryStatistics(
      {},
      [...formalEvents, ...lv0Events, ...retryEvents, ...practiceEvents],
      now,
    );

    expect(statistics.personalCurveModel).toMatchObject({
      source: 'default',
      sampleCount: 1,
      intervalBucketCount: 1,
    });
    expect(statistics.observedRecallPoints).toEqual([
      expect.objectContaining({ intervalDays: 2, retention: 100, sampleCount: 1 }),
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

  it('counts every word that has reached a level, not just the ones sitting there', () => {
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
      .toMatchObject({ 0: 0, 2: 0, 6: 0 });
    expect(statistics.masteryLevelTimeline.find((point) => point.dateKey === '2026-07-13')?.counts)
      .toMatchObject({ 0: 1, 2: 1, 3: 0, 6: 0 });
    // The Lv6 word passed through Lv2 to get there, so it is counted at both.
    expect(statistics.masteryLevelTimeline.find((point) => point.dateKey === '2026-07-14')?.counts)
      .toMatchObject({ 0: 2, 2: 2, 3: 1, 6: 1, 7: 0 });
  });

  it('keeps a word at its best level after it slips back down', () => {    const peak = createRecord({
      wordId: 'word-peaked',
      masteryLevel: 6,
      reviewStage: 6,
      lastStudiedAt: '2026-07-13T08:00:00.000Z',
    });
    const slipped = { ...peak, masteryLevel: 3, reviewStage: 3, lastStudiedAt: '2026-07-14T08:00:00.000Z' };
    const events = [
      { ...createEvent('peak', '2026-07-13T08:00:00.000Z', true), wordId: peak.wordId, learningStateAfter: peak },
      { ...createEvent('slip', '2026-07-14T08:00:00.000Z', false), wordId: peak.wordId, learningStateAfter: slipped },
    ];

    const statistics = buildMemoryStatistics({ [peak.wordId]: slipped }, events, now);

    expect(statistics.masteryLevelTimeline.at(-1)?.counts).toMatchObject({ 3: 1, 6: 1, 7: 0 });
  });

  it('counts progress that predates the answer log, and skips words never studied', () => {
    const studied = Object.fromEntries([0, 1, 1, 10].map((masteryLevel, index) => {
      const wordId = `word-${index}`;
      return [wordId, createRecord({ wordId, masteryLevel, reviewStage: masteryLevel })];
    }));
    const untouched = createRecord({
      wordId: 'word-untouched',
      masteryLevel: 5,
      reviewStage: 5,
      lastStudiedAt: null,
      nextDueAt: null,
    });

    const statistics = buildMemoryStatistics({ ...studied, [untouched.wordId]: untouched }, [], now);

    // No answer events at all — an imported or synced history still has to show
    // up, and Lv5 holds only the Lv10 word because the Lv5 one was never studied.
    expect(statistics.masteryLevelTimeline.at(-1)?.counts)
      .toMatchObject({ 0: 4, 1: 3, 2: 1, 5: 1, 10: 1 });
  });

  it('calculates formal answer accuracy from the level before each answer', () => {
    const levelRecord = (masteryLevel: number): LearningRecord => createRecord({
      masteryLevel,
      reviewStage: masteryLevel,
    });
    const events = [
      { ...createEvent('level-0-correct', '2026-07-12T08:00:00.000Z', true), learningStateBefore: levelRecord(0) },
      { ...createEvent('level-0-wrong', '2026-07-12T08:05:00.000Z', false), learningStateBefore: levelRecord(0) },
      { ...createEvent('level-3-correct', '2026-07-13T08:00:00.000Z', true), learningStateBefore: levelRecord(3) },
      createEvent('legacy-without-level', '2026-07-14T08:00:00.000Z', false),
    ];

    const accuracy = buildMasteryLevelAccuracy(events);

    expect(accuracy).toHaveLength(11);
    expect(accuracy[0]).toMatchObject({
      level: 0,
      correctCount: 1,
      answerCount: 2,
      accuracy: 50,
    });
    expect(accuracy[3]).toMatchObject({
      level: 3,
      correctCount: 1,
      answerCount: 1,
      accuracy: 100,
    });
    expect(accuracy[10]).toMatchObject({
      level: 10,
      correctCount: 0,
      answerCount: 0,
      accuracy: null,
    });
  });

  it('reads accuracy from the last seven study days only', () => {
    const levelRecord = (masteryLevel: number): LearningRecord => createRecord({
      masteryLevel,
      reviewStage: masteryLevel,
    });
    const events = ['07', '08', '09', '10', '11', '12', '13', '14'].map((day, index) => ({
      ...createEvent(`day-${day}`, `2026-07-${day}T08:00:00.000Z`, index > 0),
      learningStateBefore: levelRecord(0),
    }));

    const accuracy = buildMasteryLevelAccuracy(events);

    // Eight days of answers, one of them wrong — and the wrong one is the oldest.
    expect(accuracy[0]).toMatchObject({ correctCount: 7, answerCount: 7, accuracy: 100 });
  });

  it('counts the last seven days she studied, not the last seven on the calendar', () => {
    const levelRecord = (masteryLevel: number): LearningRecord => createRecord({
      masteryLevel,
      reviewStage: masteryLevel,
    });
    const events = [
      { ...createEvent('old-correct', '2026-05-02T08:00:00.000Z', true), learningStateBefore: levelRecord(5) },
      { ...createEvent('old-wrong', '2026-05-03T08:00:00.000Z', false), learningStateBefore: levelRecord(5) },
    ];

    // Ten weeks stale, but it is still the most recent thing she did.
    expect(buildMasteryLevelAccuracy(events)[5]).toMatchObject({ answerCount: 2, accuracy: 50 });
  });

  it('chooses the recent days by date, not by the order the log arrives in', () => {
    const levelRecord = (masteryLevel: number): LearningRecord => createRecord({
      masteryLevel,
      reviewStage: masteryLevel,
    });
    // Dexie hands events back in key order, which is not date order.
    const events = ['07', '08', '09', '10', '11', '12', '13', '14'].map((day, index) => ({
      ...createEvent(`day-${day}`, `2026-07-${day}T08:00:00.000Z`, index > 0),
      learningStateBefore: levelRecord(0),
    })).reverse();

    expect(buildMasteryLevelAccuracy(events)[0]).toMatchObject({ answerCount: 7, accuracy: 100 });
  });
});
