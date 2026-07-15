import { describe, expect, it } from 'vitest';
import {
  createHandler,
  createMemoryRepository,
  hashFamilyCode,
  mergeSnapshots,
} from './index.mjs';

const env = {
  FAMILY_CODE_SALT: 'test-salt',
  FAMILY_CODE_HASH: hashFamilyCode('2468', 'test-salt'),
  TOKEN_SIGNING_SECRET: 'test-signing-secret-at-least-32-characters',
  FIXED_USER_ID: 'xiaojunjun',
  ALLOWED_ORIGIN: 'https://www.cw2017.com',
};

function event(path, body, token) {
  return Buffer.from(JSON.stringify({
    rawPath: path,
    requestContext: { http: { method: 'POST', path } },
    headers: {
      origin: 'https://www.cw2017.com',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    isBase64Encoded: false,
  }));
}

function parseResponse(response) {
  return { ...response, json: JSON.parse(response.body) };
}

function emptySnapshot() {
  return {
    schemaVersion: 1,
    generation: 0,
    events: [],
    checkpoint: null,
    dailyTasks: [],
    wordSelectionStates: [],
    parentSetting: {
      value: {
        profileId: 'cute-junjun',
        enableAudio: true,
        dailyNewWordCount: 6,
        dailyReviewLimit: 8,
        showImages: true,
        showExamples: true,
        showHints: true,
        preferLandscape: true,
      },
      fieldRevisions: {},
    },
  };
}

describe('vocab sync Function Compute handler', () => {
  it('rejects an incorrect family code', async () => {
    const handler = createHandler(createMemoryRepository(), env);

    const response = parseResponse(await handler(event('/api/device/connect', {
      familyCode: '0000',
      deviceId: 'device-a',
    })));

    expect(response.statusCode).toBe(403);
    expect(response.json.code).toBe('INVALID_FAMILY_CODE');
  });

  it('issues a device token and requires it for synchronization', async () => {
    const handler = createHandler(createMemoryRepository(), env);
    const connect = parseResponse(await handler(event('/api/device/connect', {
      familyCode: '2468',
      deviceId: 'device-a',
    })));

    const unauthorized = await handler(event('/api/sync', {}));

    expect(connect.statusCode).toBe(200);
    expect(connect.json.deviceToken).toBeTruthy();
    expect(unauthorized.statusCode).toBe(401);
  });

  it('rejects a previously issued token after the device is revoked in cloud storage', async () => {
    const repository = createMemoryRepository();
    const handler = createHandler(repository, env);
    const connect = parseResponse(await handler(event('/api/device/connect', {
      familyCode: '2468',
      deviceId: 'device-a',
    })));

    repository.revokeDevice('xiaojunjun', 'device-a');
    const response = await handler(event('/api/sync', {
      schemaVersion: 1,
      deviceId: 'device-a',
      cursor: null,
      snapshot: emptySnapshot(),
    }, connect.json.deviceToken));

    expect(response.statusCode).toBe(401);
  });

  it('merges duplicate retries idempotently', async () => {
    const repository = createMemoryRepository();
    const handler = createHandler(repository, env);
    const connect = parseResponse(await handler(event('/api/device/connect', {
      familyCode: '2468',
      deviceId: 'device-a',
    })));
    const snapshot = emptySnapshot();
    snapshot.events.push({
      id: 'event-a',
      wordId: 'word-a',
      dateKey: '2026-07-14',
      answeredAt: '2026-07-14T09:00:00.000Z',
      questionKind: 'text-choice',
      selectedAnswer: '家庭',
      correctAnswer: '家庭',
      isCorrect: true,
      responseTimeMs: 700,
      deviceId: 'device-a',
      schemaVersion: 1,
      generation: 0,
    });
    const request = { schemaVersion: 1, deviceId: 'device-a', cursor: null, snapshot };

    await handler(event('/api/sync', request, connect.json.deviceToken));
    const retry = parseResponse(await handler(event('/api/sync', request, connect.json.deviceToken)));

    expect(retry.statusCode).toBe(200);
    expect(retry.json.snapshot.events).toHaveLength(1);
    expect(repository.getEventCount()).toBe(1);
  });

  it('rebuilds daily counts from events learned on two devices', async () => {
    const repository = createMemoryRepository();
    const handler = createHandler(repository, env);
    async function connect(deviceId) {
      const result = await handler(event('/api/device/connect', { familyCode: '2468', deviceId }));
      return parseResponse(result).json.deviceToken;
    }
    const tokenA = await connect('device-a');
    const tokenB = await connect('device-b');
    const baseTask = {
      dateKey: '2026-07-14',
      newWordIds: ['word-a', 'word-b'],
      reviewWordIds: [],
      completedAt: null,
      correctCount: 0,
      wrongCount: 0,
      totalAnswered: 0,
      answeredWordIds: [],
    };
    function deviceRequest(deviceId, eventId, wordId, isCorrect) {
      const snapshot = emptySnapshot();
      snapshot.dailyTasks = [baseTask];
      snapshot.events = [{
        id: eventId,
        wordId,
        dateKey: '2026-07-14',
        answeredAt: `2026-07-14T0${eventId === 'event-a' ? 8 : 9}:00:00.000Z`,
        questionKind: 'text-choice',
        selectedAnswer: isCorrect ? 'yes' : 'no',
        correctAnswer: 'yes',
        isCorrect,
        responseTimeMs: 500,
        deviceId,
        schemaVersion: 1,
        generation: 0,
      }];
      return { schemaVersion: 1, deviceId, cursor: null, snapshot };
    }

    await handler(event('/api/sync', deviceRequest('device-a', 'event-a', 'word-a', true), tokenA));
    const merged = parseResponse(await handler(
      event('/api/sync', deviceRequest('device-b', 'event-b', 'word-b', false), tokenB),
    ));

    expect(merged.json.snapshot.dailyTasks[0]).toMatchObject({
      correctCount: 1,
      wrongCount: 1,
      totalAnswered: 2,
      answeredWordIds: ['word-a', 'word-b'],
    });
  });

  it('merges legacy daily tasks that do not have answered word ids', () => {
    const legacy = emptySnapshot();
    legacy.dailyTasks = [{
      dateKey: '2026-07-14',
      newWordIds: ['word-a'],
      reviewWordIds: [],
      completedAt: null,
      correctCount: 0,
      wrongCount: 0,
      totalAnswered: 0,
    }];
    const current = emptySnapshot();
    current.dailyTasks = [{
      dateKey: '2026-07-14',
      newWordIds: ['word-b'],
      reviewWordIds: [],
      completedAt: null,
      correctCount: 0,
      wrongCount: 0,
      totalAnswered: 0,
      answeredWordIds: ['word-b'],
    }];

    const merged = mergeSnapshots(legacy, current);

    expect(merged.dailyTasks[0]).toMatchObject({
      newWordIds: ['word-a', 'word-b'],
      answeredWordIds: [],
    });
  });

  it('unions legacy checkpoints from two previously offline devices', async () => {
    const repository = createMemoryRepository();
    const first = emptySnapshot();
    first.checkpoint = {
      capturedAt: '2026-07-14T08:00:00.000Z',
      deviceId: 'device-a',
      generation: 0,
      records: [{
        wordId: 'word-a', masteryLevel: 2, reviewStage: 2, correctStreak: 2, wrongCount: 0,
        lastStudiedAt: '2026-07-13T08:00:00.000Z', nextDueAt: '2026-07-14T08:00:00.000Z',
      }],
    };
    const second = emptySnapshot();
    second.checkpoint = {
      capturedAt: '2026-07-14T09:00:00.000Z',
      deviceId: 'device-b',
      generation: 0,
      records: [{
        wordId: 'word-b', masteryLevel: 3, reviewStage: 3, correctStreak: 3, wrongCount: 1,
        lastStudiedAt: '2026-07-13T09:00:00.000Z', nextDueAt: '2026-07-15T09:00:00.000Z',
      }],
    };

    await repository.mergeSnapshot('xiaojunjun', first);
    const merged = await repository.mergeSnapshot('xiaojunjun', second);

    expect(merged.snapshot.checkpoint.records.map((record) => record.wordId)).toEqual(['word-a', 'word-b']);
  });
});
