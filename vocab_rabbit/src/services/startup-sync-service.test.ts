import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { SYNC_SCHEMA_VERSION, type SyncRequest } from '../models/sync';
import {
  applySyncResponse,
  clearLocalDeviceData,
  getOrCreateSyncMetadata,
  listAnswerEvents,
  saveDailyTask,
  saveAnswerAndLearningRecord,
  saveDeviceToken,
} from './storage-service';
import { defaultParentSetting } from '../models/parent-setting';
import {
  connectAndSynchronize,
  connectDeviceForBackgroundSync,
  hasConnectedDevice,
  installResumeSyncListeners,
  performStartupSync,
  performStartupSyncWithRetry,
  restoreEmptyDeviceFromCloud,
} from './startup-sync-service';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function syncResponse(request: SyncRequest) {
  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    cursor: 'cursor-1',
    serverTime: '2026-07-14T10:00:00.000Z',
    snapshot: request.snapshot,
  };
}

afterEach(async () => {
  await clearLocalDeviceData();
});

describe('performStartupSync', () => {
  it('requires the family code before the first device connection', async () => {
    const result = await performStartupSync(async () => {
      throw new Error('fetch must not run before connection');
    });

    expect(result.kind).toBe('needs-code');
  });

  it('offers offline entry when a connected device cannot reach the server', async () => {
    await saveDeviceToken('token-a');
    const result = await performStartupSync(async () => {
      throw new TypeError('network failed');
    });

    expect(result).toMatchObject({ kind: 'unavailable' });
  });

  it('falls back to a full snapshot when the server does not accept a delta yet', async () => {
    await applySyncResponse({
      schemaVersion: SYNC_SCHEMA_VERSION,
      cursor: 'cursor-old',
      serverTime: '2026-07-14T08:00:00.000Z',
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
    await saveDeviceToken('token-a');
    await saveAnswerAndLearningRecord({
      id: 'event-a',
      wordId: 'word-a',
      dateKey: '2026-07-14',
      answeredAt: '2026-07-14T09:00:00.000Z',
      questionKind: 'text-choice',
      selectedAnswer: '家庭',
      correctAnswer: '家庭',
      isCorrect: true,
      responseTimeMs: 500,
    }, {
      wordId: 'word-a',
      masteryLevel: 2,
      reviewStage: 2,
      correctStreak: 1,
      wrongCount: 0,
      lastStudiedAt: '2026-07-14T09:00:00.000Z',
      nextDueAt: '2026-07-16T20:00:00.000Z',
    });
    const requests: SyncRequest[] = [];
    const result = await performStartupSync(async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as SyncRequest;
      requests.push(request);
      if (request.delta) return jsonResponse({ code: 'SNAPSHOT_REQUIRED' }, 400);
      return jsonResponse({
        schemaVersion: SYNC_SCHEMA_VERSION,
        cursor: 'cursor-new',
        serverTime: '2026-07-14T10:00:00.000Z',
        upToDate: false,
        snapshot: request.snapshot,
      });
    });

    expect(result.kind).toBe('synced');
    expect(requests).toHaveLength(2);
    expect(requests[0].delta?.events).toHaveLength(1);
    expect(requests[0].snapshot).toBeNull();
    expect(requests[1].delta).toBeNull();
    expect(requests[1].snapshot?.events).toHaveLength(1);
  });

  it('applies a newer cloud snapshot when this device resumes with an older cursor', async () => {
    await applySyncResponse({
      schemaVersion: SYNC_SCHEMA_VERSION,
      cursor: 'cursor-old',
      serverTime: '2026-07-14T08:00:00.000Z',
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
    await saveDeviceToken('token-a');

    const result = await performStartupSync(async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as SyncRequest;
      expect(request).toMatchObject({
        cursor: 'cursor-old:force-cloud-pull',
        hasLocalChanges: false,
        snapshot: null,
      });
      return jsonResponse({
        schemaVersion: SYNC_SCHEMA_VERSION,
        cursor: 'cursor-new',
        serverTime: '2026-07-15T10:00:00.000Z',
        upToDate: false,
        snapshot: {
          schemaVersion: SYNC_SCHEMA_VERSION,
          generation: 0,
          events: [{
            id: 'event-from-cloud',
            wordId: 'word-cloud',
            dateKey: '2026-07-15',
            answeredAt: '2026-07-15T09:00:00.000Z',
            questionKind: 'recognition',
            selectedAnswer: '认识',
            correctAnswer: '认识',
            isCorrect: true,
            responseTimeMs: 400,
            deviceId: 'ipad-cloud',
            schemaVersion: 1,
            generation: 0,
          }],
          checkpoint: null,
          dailyTasks: [],
          wordSelectionStates: [],
          parentSetting: { value: defaultParentSetting, fieldRevisions: {} },
        },
      });
    });

    expect(result.kind).toBe('synced');
    expect((await getOrCreateSyncMetadata()).serverCursor).toBe('cursor-new');
    expect((await listAnswerEvents()).map((event) => event.id)).toContain('event-from-cloud');
  });

  it('forces a cloud pull when the saved cursor exists but local learning data is empty', async () => {
    await applySyncResponse({
      schemaVersion: SYNC_SCHEMA_VERSION,
      cursor: 'cursor-claims-current',
      serverTime: '2026-07-14T08:00:00.000Z',
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
    await saveDeviceToken('token-a');

    const result = await performStartupSync(async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as SyncRequest;
      expect(request).toMatchObject({
        hasLocalChanges: false,
        snapshot: null,
      });
      expect(request.cursor).not.toBe('cursor-claims-current');
      return jsonResponse({
        schemaVersion: SYNC_SCHEMA_VERSION,
        cursor: 'cursor-cloud-current',
        serverTime: '2026-07-15T10:00:00.000Z',
        upToDate: false,
        snapshot: {
          schemaVersion: SYNC_SCHEMA_VERSION,
          generation: 0,
          events: [{
            id: 'event-restored-from-cloud',
            wordId: 'word-cloud',
            dateKey: '2026-07-15',
            answeredAt: '2026-07-15T09:00:00.000Z',
            questionKind: 'recognition',
            selectedAnswer: '认识',
            correctAnswer: '认识',
            isCorrect: true,
            responseTimeMs: 400,
            deviceId: 'ipad-cloud',
            schemaVersion: 1,
            generation: 0,
          }],
          checkpoint: null,
          dailyTasks: [],
          wordSelectionStates: [],
          parentSetting: { value: defaultParentSetting, fieldRevisions: {} },
        },
      });
    });

    expect(result.kind).toBe('synced');
    expect((await listAnswerEvents()).map((event) => event.id)).toContain('event-restored-from-cloud');
  });
});

describe('performStartupSyncWithRetry', () => {
  it('immediately uploads local data preserved from a stale cloud snapshot', async () => {
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
      serverTime: '2026-07-14T08:00:00.000Z',
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
    await saveDeviceToken('token-a');
    await saveDailyTask({ ...baseTask, checkedInAt: '2026-07-14T09:00:00.000Z' });

    const requests: SyncRequest[] = [];
    const result = await performStartupSyncWithRetry(
      () => performStartupSync(async (_input, init) => {
        const request = JSON.parse(String(init?.body)) as SyncRequest;
        requests.push(request);
        if (requests.length === 1) {
          return jsonResponse({
            schemaVersion: SYNC_SCHEMA_VERSION,
            cursor: 'cursor-from-other-device',
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
        }
        return jsonResponse({
          schemaVersion: SYNC_SCHEMA_VERSION,
          cursor: 'cursor-after-repair',
          serverTime: '2026-07-14T10:00:01.000Z',
          upToDate: true,
          snapshot: null,
        });
      }),
      async () => undefined,
    );

    expect(result.kind).toBe('synced');
    expect(requests).toHaveLength(2);
    expect(requests[1].delta?.dailyTasks).toEqual([
      expect.objectContaining({
        dateKey: '2026-07-14',
        checkedInAt: '2026-07-14T09:00:00.000Z',
      }),
    ]);
  });

  it('retries silently until the third attempt succeeds', async () => {
    let attempts = 0;
    const delays: number[] = [];
    const result = await performStartupSyncWithRetry(
      async () => {
        attempts += 1;
        return attempts < 3
          ? { kind: 'unavailable', message: 'temporary failure' }
          : { kind: 'synced', serverTime: '2026-07-22T10:00:00.000Z' };
      },
      async (delayMs) => { delays.push(delayMs); },
    );

    expect(result.kind).toBe('synced');
    expect(attempts).toBe(3);
    expect(delays).toEqual([1_000, 2_000]);
  });

  it('returns the third failure after exhausting automatic retries', async () => {
    let attempts = 0;
    const result = await performStartupSyncWithRetry(
      async () => {
        attempts += 1;
        return { kind: 'unavailable', message: `failure ${attempts}` };
      },
      async () => undefined,
    );

    expect(result).toEqual({ kind: 'unavailable', message: 'failure 3' });
    expect(attempts).toBe(3);
  });

  it('does not download the cloud snapshot again after a local apply failure', async () => {
    let attempts = 0;
    const result = await performStartupSyncWithRetry(
      async () => {
        attempts += 1;
        return { kind: 'blocked', message: '本地写入失败' };
      },
      async () => undefined,
    );

    expect(result).toEqual({ kind: 'blocked', message: '本地写入失败' });
    expect(attempts).toBe(1);
  });
});

describe('restoreEmptyDeviceFromCloud', () => {
  it('waits for a cloud snapshot before an empty connected device enters the app', async () => {
    await saveDeviceToken('token-a');
    const result = await restoreEmptyDeviceFromCloud(async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as SyncRequest;
      return jsonResponse({
        schemaVersion: SYNC_SCHEMA_VERSION,
        cursor: 'cursor-restored',
        serverTime: '2026-07-15T10:00:00.000Z',
        upToDate: false,
        snapshot: {
          schemaVersion: SYNC_SCHEMA_VERSION,
          generation: 0,
          events: [{
            id: 'event-required-restore',
            wordId: 'word-cloud',
            dateKey: '2026-07-15',
            answeredAt: '2026-07-15T09:00:00.000Z',
            questionKind: 'recognition',
            selectedAnswer: '认识',
            correctAnswer: '认识',
            isCorrect: true,
            responseTimeMs: 400,
            deviceId: 'ipad-cloud',
            schemaVersion: 1,
            generation: 0,
          }],
          checkpoint: null,
          dailyTasks: [],
          wordSelectionStates: [],
          parentSetting: { value: defaultParentSetting, fieldRevisions: {} },
        },
      } satisfies ReturnType<typeof syncResponse> & { upToDate: boolean });
    });

    expect(result?.kind).toBe('synced');
    expect((await listAnswerEvents()).map((event) => event.id)).toContain('event-required-restore');
  });
});

describe('installResumeSyncListeners', () => {
  it('pulls cloud progress again when an installed app resumes or reconnects', () => {
    const windowTarget = new EventTarget();
    const documentTarget = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
    documentTarget.visibilityState = 'visible';
    let syncCount = 0;
    const cleanup = installResumeSyncListeners(
      () => { syncCount += 1; },
      windowTarget,
      documentTarget,
    );

    windowTarget.dispatchEvent(new Event('pageshow'));
    documentTarget.dispatchEvent(new Event('visibilitychange'));
    windowTarget.dispatchEvent(new Event('online'));

    expect(syncCount).toBe(3);
    cleanup();
    windowTarget.dispatchEvent(new Event('pageshow'));
    expect(syncCount).toBe(3);
  });

  it('does not sync while the app is still hidden', () => {
    const windowTarget = new EventTarget();
    const documentTarget = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
    documentTarget.visibilityState = 'hidden';
    let syncCount = 0;
    const cleanup = installResumeSyncListeners(
      () => { syncCount += 1; },
      windowTarget,
      documentTarget,
    );

    documentTarget.dispatchEvent(new Event('visibilitychange'));
    expect(syncCount).toBe(0);
    cleanup();
  });
});

describe('background startup connection', () => {
  it('checks the saved device token without contacting the server', async () => {
    expect(await hasConnectedDevice()).toBe(false);
    await saveDeviceToken('token-a');
    expect(await hasConnectedDevice()).toBe(true);
  });

  it('validates and saves a new device without waiting for the sync endpoint', async () => {
    const paths: string[] = [];
    const result = await connectDeviceForBackgroundSync('2468', async (input) => {
      paths.push(String(input));
      return jsonResponse({ deviceToken: 'token-a' });
    });

    expect(result.kind).toBe('connected');
    expect(paths).toEqual(['/api/device/connect']);
    expect((await getOrCreateSyncMetadata()).deviceToken).toBe('token-a');
  });
});

describe('connectAndSynchronize', () => {
  it('connects the device and completes the first sync before returning ready', async () => {
    const paths: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const path = String(input);
      paths.push(path);
      if (path.endsWith('/device/connect')) {
        return jsonResponse({ deviceToken: 'token-a' });
      }
      return jsonResponse(syncResponse(JSON.parse(String(init?.body)) as SyncRequest));
    };

    const result = await connectAndSynchronize('2468', fetchImpl);

    expect(result.kind).toBe('synced');
    expect(paths).toEqual(['/api/device/connect', '/api/sync']);
    expect((await getOrCreateSyncMetadata()).deviceToken).toBe('token-a');
    expect((await getOrCreateSyncMetadata()).serverCursor).toBe('cursor-1');
  });
});
