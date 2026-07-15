import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { AnswerEvent } from '../models/answer-event';
import type { LearningRecord } from '../models/learning-record';
import { defaultParentSetting } from '../models/parent-setting';
import { SYNC_SCHEMA_VERSION, type SyncResponse } from '../models/sync';
import {
  applySyncResponse,
  clearLocalDeviceData,
  getOrCreateSyncMetadata,
  buildLocalSyncRequest,
  listAnswerEvents,
  listLearningRecords,
  saveAnswerAndLearningRecord,
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

    expect(request.snapshot.checkpoint?.records).toEqual([makeRecord()]);
    expect(secondRequest.snapshot.checkpoint?.capturedAt).toBe(request.snapshot.checkpoint?.capturedAt);
    expect(request.snapshot.events).toHaveLength(1);
  });
});

describe('cloud merge persistence', () => {
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
});
