import { describe, expect, it } from 'vitest';
import type { AnswerEvent } from '../models/answer-event';
import type { ParentSetting } from '../models/parent-setting';
import type {
  LearningCheckpoint,
  VersionedParentSetting,
  VersionedWordSelectionState,
} from '../models/sync';
import {
  mergeAnswerEvents,
  mergeDailyTasks,
  mergeParentSetting,
  mergeWordSelectionStates,
  replayLearningRecords,
} from './sync-merge-service';

function makeEvent(
  id: string,
  wordId: string,
  answeredAt: string,
  isCorrect: boolean,
  deviceId = 'device-a',
): AnswerEvent {
  return {
    id,
    wordId,
    dateKey: answeredAt.slice(0, 10),
    answeredAt,
    questionKind: 'text-choice',
    selectedAnswer: isCorrect ? '正确' : '错误',
    correctAnswer: '正确',
    isCorrect,
    responseTimeMs: 800,
    deviceId,
    schemaVersion: 1,
    generation: 0,
  };
}

describe('mergeAnswerEvents', () => {
  it('deduplicates retries by event id and sorts by answer time then id', () => {
    const later = makeEvent('event-b', 'word-b', '2026-07-14T09:00:00.000Z', true);
    const firstAtSameTime = makeEvent('event-a', 'word-a', '2026-07-14T08:00:00.000Z', true);
    const secondAtSameTime = makeEvent('event-c', 'word-c', '2026-07-14T08:00:00.000Z', false);

    const merged = mergeAnswerEvents(
      [later, firstAtSameTime],
      [secondAtSameTime, { ...later }],
    );

    expect(merged.map((event) => event.id)).toEqual(['event-a', 'event-c', 'event-b']);
  });
});

describe('replayLearningRecords', () => {
  it('replays only events after a migration checkpoint', () => {
    const checkpoint: LearningCheckpoint = {
      capturedAt: '2026-07-14T08:00:00.000Z',
      deviceId: 'legacy-device',
      generation: 0,
      records: [{
        wordId: 'word-a',
        masteryLevel: 3,
        reviewStage: 3,
        correctStreak: 3,
        wrongCount: 1,
        lastStudiedAt: '2026-07-13T08:00:00.000Z',
        nextDueAt: '2026-07-16T08:00:00.000Z',
      }],
    };

    const records = replayLearningRecords([
      makeEvent('old-event', 'word-a', '2026-07-14T07:59:59.000Z', false),
      makeEvent('new-event', 'word-a', '2026-07-14T09:00:00.000Z', true),
      makeEvent('other-word', 'word-b', '2026-07-14T10:00:00.000Z', false),
    ], checkpoint);

    expect(records['word-a']).toMatchObject({
      masteryLevel: 4,
      reviewStage: 4,
      correctStreak: 4,
      wrongCount: 1,
      lastStudiedAt: '2026-07-14T09:00:00.000Z',
    });
    expect(records['word-b']).toMatchObject({
      masteryLevel: 0,
      reviewStage: 0,
      correctStreak: 0,
      wrongCount: 1,
    });
  });

  it('preserves a recorded downgrade when rebuilding local state', () => {
    const downgradeEvent = {
      ...makeEvent('third-wrong', 'word-a', '2026-07-14T09:00:00.000Z', false),
      levelDowngrade: true,
    };
    const checkpoint: LearningCheckpoint = {
      capturedAt: '2026-07-14T08:00:00.000Z',
      deviceId: 'legacy-device',
      generation: 0,
      records: [{
        wordId: 'word-a',
        masteryLevel: 5,
        reviewStage: 5,
        correctStreak: 2,
        wrongCount: 2,
        lastStudiedAt: '2026-07-14T07:00:00.000Z',
        nextDueAt: '2026-07-20T20:00:00.000Z',
      }],
    };

    expect(replayLearningRecords([downgradeEvent], checkpoint)['word-a']).toMatchObject({
      masteryLevel: 4,
      reviewStage: 4,
      wrongCount: 3,
    });
  });
});

describe('mergeWordSelectionStates', () => {
  it('uses device id as a deterministic tie-breaker for equal revisions', () => {
    const local: VersionedWordSelectionState = {
      wordId: 'word-a',
      isEnabled: true,
      isPaused: false,
      updatedAt: '2026-07-14T09:00:00.000Z',
      updatedByDeviceId: 'device-a',
    };
    const remote: VersionedWordSelectionState = {
      ...local,
      isPaused: true,
      updatedByDeviceId: 'device-z',
    };

    expect(mergeWordSelectionStates([local], [remote])).toEqual([remote]);
  });
});

describe('mergeParentSetting', () => {
  it('merges each setting field independently by revision', () => {
    const base: ParentSetting = {
      profileId: 'cute-junjun',
      enableAudio: true,
      dailyNewWordCount: 6,
      dailyReviewLimit: 8,
      showImages: true,
      showExamples: true,
      showHints: true,
      preferLandscape: true,
    };
    const local: VersionedParentSetting = {
      value: { ...base, dailyNewWordCount: 10 },
      fieldRevisions: {
        dailyNewWordCount: { updatedAt: '2026-07-14T10:00:00.000Z', deviceId: 'device-a' },
        showHints: { updatedAt: '2026-07-14T08:00:00.000Z', deviceId: 'device-a' },
      },
    };
    const remote: VersionedParentSetting = {
      value: { ...base, showHints: false },
      fieldRevisions: {
        dailyNewWordCount: { updatedAt: '2026-07-14T09:00:00.000Z', deviceId: 'device-b' },
        showHints: { updatedAt: '2026-07-14T11:00:00.000Z', deviceId: 'device-b' },
      },
    };

    const merged = mergeParentSetting(local, remote);

    expect(merged.value.dailyNewWordCount).toBe(10);
    expect(merged.value.showHints).toBe(false);
    expect(merged.fieldRevisions.dailyNewWordCount).toEqual(local.fieldRevisions.dailyNewWordCount);
    expect(merged.fieldRevisions.showHints).toEqual(remote.fieldRevisions.showHints);
  });
});

describe('mergeDailyTasks', () => {
  it('rebuilds task answer counts from the merged event history', () => {
    const task = {
      dateKey: '2026-07-14',
      newWordIds: ['word-a'],
      reviewWordIds: ['word-b'],
      completedAt: null,
      correctCount: 0,
      wrongCount: 0,
      totalAnswered: 0,
      answeredWordIds: [],
    };
    const events = [
      makeEvent('event-a', 'word-a', '2026-07-14T08:00:00.000Z', true),
      makeEvent('event-b', 'word-b', '2026-07-14T09:00:00.000Z', false),
    ];

    const [merged] = mergeDailyTasks([task], [], events);

    expect(merged).toMatchObject({
      correctCount: 1,
      wrongCount: 1,
      totalAnswered: 2,
      answeredWordIds: ['word-a'],
    });
  });

  it('reopens a completed review-only task when merged new words are still unanswered', () => {
    const completedReviewTask = {
      dateKey: '2026-07-16',
      newWordIds: [],
      reviewWordIds: ['review-a', 'review-b'],
      completedAt: '2026-07-16T09:00:00.000Z',
      correctCount: 2,
      wrongCount: 0,
      totalAnswered: 2,
      answeredWordIds: ['review-a', 'review-b'],
    };
    const expandedTask = {
      ...completedReviewTask,
      newWordIds: ['new-a', 'new-b'],
      reviewWordIds: [],
      completedAt: null,
      correctCount: 0,
      totalAnswered: 0,
      answeredWordIds: [],
    };
    const events = [
      makeEvent('review-event-a', 'review-a', '2026-07-16T08:00:00.000Z', true),
      makeEvent('review-event-b', 'review-b', '2026-07-16T08:30:00.000Z', true),
    ];

    const [merged] = mergeDailyTasks([completedReviewTask], [expandedTask], events);

    expect(merged).toMatchObject({
      newWordIds: ['new-a', 'new-b'],
      reviewWordIds: ['review-a', 'review-b'],
      answeredWordIds: ['review-a', 'review-b'],
      completedAt: null,
    });
  });

  it('replaces fabricated answered ids with the actual event word ids', () => {
    const task = {
      dateKey: '2026-07-16',
      newWordIds: ['new-a', 'new-b'],
      reviewWordIds: ['review-a'],
      completedAt: '2026-07-16T09:00:00.000Z',
      correctCount: 1,
      wrongCount: 0,
      totalAnswered: 1,
      answeredWordIds: ['review-a', 'new-a', 'new-b'],
    };
    const events = [makeEvent('review-event', 'review-a', '2026-07-16T08:00:00.000Z', true)];

    const [merged] = mergeDailyTasks([task], [], events);

    expect(merged).toMatchObject({
      answeredWordIds: ['review-a'],
      completedAt: null,
    });
  });
});
