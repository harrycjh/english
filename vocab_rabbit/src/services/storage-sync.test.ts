import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { AnswerEvent } from '../models/answer-event';
import type { LearningRecord } from '../models/learning-record';
import { defaultParentSetting } from '../models/parent-setting';
import { SYNC_SCHEMA_VERSION, type SyncRequest, type SyncResponse } from '../models/sync';
import {
  applySyncResponse,
  clearLocalDeviceData,
  getOrCreateSyncMetadata,
  buildLocalSyncRequest,
  listAnswerEvents,
  listDailyTasks,
  listLearningRecords,
  saveAnswerAndLearningRecord,
  savePronunciationResult,
  saveDailyTask,
  saveParentSetting,
  saveWordSelectionState,
} from './storage-service';

function makeEvent(): AnswerEvent {
  return {
    id: 'event-a',
    wordId: 'word-a',
    dateKey: '2026-07-14',
    answeredAt: '2026-07-14T09:00:00.000Z',
    questionKind: 'text-choice',
    selectedAnswer: '家庭',
    correctAnswer: '家庭',
    isCorrect: true,
    responseTimeMs: 750,
  };
}

function makeRecord(): LearningRecord {
  return {
    wordId: 'word-a',
    masteryLevel: 1,
    reviewStage: 1,
    correctStreak: 1,
    wrongCount: 0,
    lastStudiedAt: '2026-07-14T09:00:00.000Z',
    nextDueAt: '2026-07-14T21:00:00.000Z',
  };
}

afterEach(async () => {
  await clearLocalDeviceData();
});

describe('sync metadata storage', () => {
  it('creates one stable device id for the browser database', async () => {
    const first = await getOrCreateSyncMetadata();
    const second = await getOrCreateSyncMetadata();

    expect(first.deviceId).toBeTruthy();
    expect(second.deviceId).toBe(first.deviceId);
    expect(second.deviceToken).toBeNull();
  });

  it('includes updated learning limits and the new-word queue in the pending cloud snapshot', async () => {
    const nextSetting = {
      ...defaultParentSetting,
      dailyNewWordCount: 15,
      dailyReviewLimit: 30,
      newWordQueue: ['word-b', 'word-a'],
    };

    await saveParentSetting(nextSetting);
    const request = await buildLocalSyncRequest();

    expect(request.hasLocalChanges).toBe(true);
    expect(request.snapshot?.parentSetting.value).toMatchObject({
      dailyNewWordCount: 15,
      dailyReviewLimit: 30,
      newWordQueue: ['word-b', 'word-a'],
    });
    expect(request.snapshot?.parentSetting.fieldRevisions.dailyNewWordCount).toBeDefined();
    expect(request.snapshot?.parentSetting.fieldRevisions.dailyReviewLimit).toBeDefined();
    expect(request.snapshot?.parentSetting.fieldRevisions.newWordQueue).toBeDefined();
    expect((await getOrCreateSyncMetadata()).pendingSince).not.toBeNull();
  });
});

describe('answer persistence', () => {
  it('stores the answer and resulting learning record and marks local data pending', async () => {
    const metadata = await getOrCreateSyncMetadata();

    await saveAnswerAndLearningRecord(makeEvent(), makeRecord());

    expect(await listAnswerEvents()).toHaveLength(1);
    expect((await listLearningRecords())['word-a']).toEqual(makeRecord());
    expect((await getOrCreateSyncMetadata()).pendingSince).not.toBeNull();
    expect((await listAnswerEvents())[0]).toMatchObject({
      deviceId: metadata.deviceId,
      schemaVersion: SYNC_SCHEMA_VERSION,
      generation: 0,
    });
  });

  it('creates a one-time checkpoint for learning state that predates complete event history', async () => {
    await saveAnswerAndLearningRecord(makeEvent(), makeRecord());

    const request = await buildLocalSyncRequest();
    const secondRequest = await buildLocalSyncRequest();

    expect(request.snapshot?.checkpoint?.records).toEqual([makeRecord()]);
    expect(secondRequest.snapshot?.checkpoint?.capturedAt).toBe(request.snapshot?.checkpoint?.capturedAt);
    expect(request.snapshot?.events).toHaveLength(1);
  });

  it('adds pronunciation results to the original answer without creating another answer', async () => {
    await saveAnswerAndLearningRecord(makeEvent(), makeRecord());

    await savePronunciationResult('event-a', {
      targetType: 'word',
      targetText: 'family',
      provider: 'aliyun-ssecp',
      status: 'scored',
      overallScore: 82,
      attemptedAt: '2026-07-14T09:00:04.000Z',
      recordId: 'record-a',
    });

    const events = await listAnswerEvents();
    expect(events).toHaveLength(1);
    expect(events[0].pronunciation).toMatchObject({
      targetText: 'family',
      status: 'scored',
      overallScore: 82,
    });
    expect((await listLearningRecords())['word-a']).toEqual(makeRecord());
    expect((await getOrCreateSyncMetadata()).pendingEventIds).toContain('event-a');
  });
});

describe('cloud merge persistence', () => {
  it('normalizes nullable arrays from legacy cloud tasks on a new device', async () => {
    const legacyTask = {
      dateKey: '2026-07-13',
      newWordIds: null,
      reviewWordIds: null,
      completedAt: null,
      correctCount: 0,
      wrongCount: null,
      totalAnswered: 0,
      answeredWordIds: null,
    };

    await applySyncResponse({
      schemaVersion: SYNC_SCHEMA_VERSION,
      cursor: 'cursor-legacy-task',
      serverTime: '2026-07-14T10:00:00.000Z',
      snapshot: {
        schemaVersion: SYNC_SCHEMA_VERSION,
        generation: 0,
        events: [],
        checkpoint: null,
        dailyTasks: [legacyTask as never],
        wordSelectionStates: [],
        parentSetting: { value: defaultParentSetting, fieldRevisions: {} },
      },
    });

    expect(await listDailyTasks()).toEqual([{
      dateKey: '2026-07-13',
      newWordIds: [],
      reviewWordIds: [],
      completedAt: null,
      checkedInAt: null,
      correctCount: 0,
      wrongCount: 0,
      totalAnswered: 0,
      answeredWordIds: [],
    }]);
  });

  it('applies the merged snapshot and acknowledged cursor together', async () => {
    const metadata = await getOrCreateSyncMetadata();
    const response: SyncResponse = {
      schemaVersion: SYNC_SCHEMA_VERSION,
      cursor: 'cursor-2',
      serverTime: '2026-07-14T10:00:00.000Z',
      snapshot: {
        schemaVersion: SYNC_SCHEMA_VERSION,
        generation: 0,
        events: [{ ...makeEvent(), deviceId: 'remote-device', schemaVersion: 1, generation: 0 }],
        checkpoint: null,
        dailyTasks: [],
        wordSelectionStates: [],
        parentSetting: { value: defaultParentSetting, fieldRevisions: {} },
      },
    };

    await applySyncResponse(response);

    const nextMetadata = await getOrCreateSyncMetadata();
    expect(nextMetadata.deviceId).toBe(metadata.deviceId);
    expect(nextMetadata.serverCursor).toBe('cursor-2');
    expect(nextMetadata.pendingSince).toBeNull();
    expect((await listLearningRecords())['word-a']).toMatchObject({ masteryLevel: 1, reviewStage: 1 });
  });

  it('builds a cursor-only request after a successful sync with no new local changes', async () => {
    await applySyncResponse({
      schemaVersion: SYNC_SCHEMA_VERSION,
      cursor: 'cursor-2',
      serverTime: '2026-07-14T10:00:00.000Z',
      upToDate: false,
      snapshot: {
        schemaVersion: SYNC_SCHEMA_VERSION,
        generation: 0,
        events: [],
        checkpoint: null,
        dailyTasks: [],
        wordSelectionStates: [],
        parentSetting: { value: defaultParentSetting, fieldRevisions: {} },
      },
    });

    const request = await buildLocalSyncRequest();

    expect(request).toMatchObject({
      cursor: 'cursor-2',
      hasLocalChanges: false,
      snapshot: null,
    });
  });

  it('sends only locally changed rows after the initial full synchronization', async () => {
    await applySyncResponse({
      schemaVersion: SYNC_SCHEMA_VERSION,
      cursor: 'cursor-initial',
      serverTime: '2026-07-14T10:00:00.000Z',
      upToDate: false,
      snapshot: {
        schemaVersion: SYNC_SCHEMA_VERSION,
        generation: 0,
        events: [],
        checkpoint: null,
        dailyTasks: [],
        wordSelectionStates: [],
        parentSetting: { value: defaultParentSetting, fieldRevisions: {} },
      },
    });
    await saveAnswerAndLearningRecord(makeEvent(), makeRecord());
    await saveDailyTask({
      dateKey: '2026-07-14',
      newWordIds: ['word-a'],
      reviewWordIds: [],
      completedAt: null,
      checkedInAt: '2026-07-14T10:01:30.000Z',
      correctCount: 1,
      wrongCount: 0,
      totalAnswered: 1,
      answeredWordIds: ['word-a'],
    });
    await saveWordSelectionState({
      wordId: 'word-a',
      isEnabled: true,
      isPaused: true,
      updatedAt: '2026-07-14T10:01:00.000Z',
    });
    await saveParentSetting({ ...defaultParentSetting, dailyNewWordCount: 25 });

    const request = await buildLocalSyncRequest();

    expect(request).toMatchObject({
      cursor: 'cursor-initial',
      hasLocalChanges: true,
      snapshot: null,
    });
    expect(request.delta?.events.map((event) => event.id)).toEqual(['event-a']);
    expect(request.delta?.dailyTasks.map((task) => task.dateKey)).toEqual(['2026-07-14']);
    expect(request.delta?.dailyTasks[0].checkedInAt).toBe('2026-07-14T10:01:30.000Z');
    expect(request.delta?.wordSelectionStates.map((state) => state.wordId)).toEqual(['word-a']);
    expect(request.delta?.parentSetting?.value.dailyNewWordCount).toBe(25);

    await applySyncResponse({
      schemaVersion: SYNC_SCHEMA_VERSION,
      cursor: 'cursor-after-delta',
      serverTime: '2026-07-14T10:02:00.000Z',
      upToDate: true,
      snapshot: null,
    }, request);
    expect(await buildLocalSyncRequest()).toMatchObject({
      cursor: 'cursor-after-delta',
      hasLocalChanges: false,
      snapshot: null,
      delta: null,
    });
  });

  it('keeps changes created while an incremental request is in flight', async () => {
    await applySyncResponse({
      schemaVersion: SYNC_SCHEMA_VERSION,
      cursor: 'cursor-initial',
      serverTime: '2026-07-14T10:00:00.000Z',
      upToDate: false,
      snapshot: {
        schemaVersion: SYNC_SCHEMA_VERSION,
        generation: 0,
        events: [],
        checkpoint: null,
        dailyTasks: [],
        wordSelectionStates: [],
        parentSetting: { value: defaultParentSetting, fieldRevisions: {} },
      },
    });
    await saveAnswerAndLearningRecord(makeEvent(), makeRecord());
    const request = await buildLocalSyncRequest();
    const lateEvent = {
      ...makeEvent(),
      id: 'event-late',
      wordId: 'word-late',
      answeredAt: '2026-07-14T10:01:00.000Z',
    };
    await saveAnswerAndLearningRecord(lateEvent, { ...makeRecord(), wordId: 'word-late' });

    await applySyncResponse({
      schemaVersion: SYNC_SCHEMA_VERSION,
      cursor: 'cursor-after-delta',
      serverTime: '2026-07-14T10:02:00.000Z',
      upToDate: true,
      snapshot: null,
    }, request);

    const nextRequest = await buildLocalSyncRequest();
    expect(nextRequest.hasLocalChanges).toBe(true);
    expect(nextRequest.delta?.events.map((event) => event.id)).toContain('event-late');
  });

  it('re-uploads a local check-in when a stale cloud snapshot does not contain it', async () => {
    const baseTask = {
      dateKey: '2026-07-14',
      newWordIds: ['word-a'],
      reviewWordIds: [],
      completedAt: null,
      checkedInAt: null,
      correctCount: 0,
      wrongCount: 0,
      totalAnswered: 0,
      answeredWordIds: [],
    };
    await applySyncResponse({
      schemaVersion: SYNC_SCHEMA_VERSION,
      cursor: 'cursor-before-check-in',
      serverTime: '2026-07-14T10:00:00.000Z',
      snapshot: {
        schemaVersion: SYNC_SCHEMA_VERSION,
        generation: 0,
        events: [],
        checkpoint: null,
        dailyTasks: [baseTask],
        wordSelectionStates: [],
        parentSetting: { value: defaultParentSetting, fieldRevisions: {} },
      },
    });

    const checkedInAt = '2026-07-14T10:01:30.000Z';
    await saveDailyTask({ ...baseTask, checkedInAt });
    const request = await buildLocalSyncRequest();

    await applySyncResponse({
      schemaVersion: SYNC_SCHEMA_VERSION,
      cursor: 'cursor-from-other-device',
      serverTime: '2026-07-14T10:02:00.000Z',
      snapshot: {
        schemaVersion: SYNC_SCHEMA_VERSION,
        generation: 0,
        events: [],
        checkpoint: null,
        dailyTasks: [baseTask],
        wordSelectionStates: [],
        parentSetting: { value: defaultParentSetting, fieldRevisions: {} },
      },
    }, request);

    expect((await listDailyTasks())[0].checkedInAt).toBe(checkedInAt);
    const retryRequest = await buildLocalSyncRequest();
    expect(retryRequest.hasLocalChanges).toBe(true);
    expect(retryRequest.delta?.dailyTasks).toEqual([
      expect.objectContaining({ dateKey: '2026-07-14', checkedInAt }),
    ]);
  });

  it('acknowledges an unchanged cursor without replacing local learning data', async () => {
    await saveAnswerAndLearningRecord(makeEvent(), makeRecord());
    const before = await listLearningRecords();

    await applySyncResponse({
      schemaVersion: SYNC_SCHEMA_VERSION,
      cursor: 'cursor-3',
      serverTime: '2026-07-14T11:00:00.000Z',
      upToDate: true,
      snapshot: null,
    });

    expect(await listLearningRecords()).toEqual(before);
    expect(await getOrCreateSyncMetadata()).toMatchObject({
      serverCursor: 'cursor-3',
      lastSyncedAt: '2026-07-14T11:00:00.000Z',
      pendingSince: null,
    });
  });

  it('preserves answers saved after a background sync request was created', async () => {
    await saveAnswerAndLearningRecord(makeEvent(), makeRecord());
    const request = await buildLocalSyncRequest() as SyncRequest;
    const capturedAt = request.snapshot?.checkpoint?.capturedAt ?? new Date().toISOString();
    const lateEvent: AnswerEvent = {
      ...makeEvent(),
      id: 'event-b',
      wordId: 'word-b',
      answeredAt: new Date(new Date(capturedAt).getTime() + 1_000).toISOString(),
    };
    const lateRecord: LearningRecord = { ...makeRecord(), wordId: 'word-b', lastStudiedAt: lateEvent.answeredAt };
    await saveAnswerAndLearningRecord(lateEvent, lateRecord);

    await applySyncResponse({
      schemaVersion: SYNC_SCHEMA_VERSION,
      cursor: 'cursor-background',
      serverTime: '2026-07-14T12:00:00.000Z',
      snapshot: request.snapshot,
    }, request);

    expect((await listAnswerEvents()).map((event) => event.id)).toEqual(['event-a', 'event-b']);
    expect((await listLearningRecords())['word-b']).toBeDefined();
    expect((await getOrCreateSyncMetadata()).pendingSince).not.toBeNull();
  });
});
