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
  PHOTO_ACCESS_CODE_SALT: 'test-photo-salt',
  PHOTO_ACCESS_CODE_HASH: hashFamilyCode('photo-code', 'test-photo-salt'),
  PHOTO_TOKEN_SIGNING_SECRET: 'test-photo-signing-secret-at-least-32-characters',
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

async function connectPhotoAccess(handler, deviceToken, deviceId = 'device-a') {
  return parseResponse(await handler(event('/api/media/connect', {
    photoAccessCode: 'photo-code',
    deviceId,
  }, deviceToken)));
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
        newWordQueue: [],
        showImages: true,
        showExamples: true,
        showHints: true,
        preferLandscape: true,
      },
      fieldRevisions: {},
    },
  };
}

function emptyDelta() {
  return {
    schemaVersion: 1,
    generation: 0,
    events: [],
    dailyTasks: [],
    wordSelectionStates: [],
    parentSetting: null,
  };
}

function answerEvent(id, wordId, deviceId, answeredAt) {
  return {
    id,
    wordId,
    dateKey: answeredAt.slice(0, 10),
    answeredAt,
    questionKind: 'text-choice',
    selectedAnswer: '家庭',
    correctAnswer: '家庭',
    isCorrect: true,
    responseTimeMs: 700,
    deviceId,
    schemaVersion: 1,
    generation: 0,
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

  it('signs only requested private life photos for an active device', async () => {
    const repository = createMemoryRepository();
    const photoService = {
      async sign(wordIds) {
        return {
          expiresAt: '2026-07-28T12:00:00.000Z',
          photos: wordIds.map((wordId) => ({
            wordId,
            objectKey: `life-photos/${wordId}.webp`,
            url: `https://private.example/${wordId}`,
          })),
        };
      },
    };
    const handler = createHandler(repository, env, { photoService });
    const connect = parseResponse(await handler(event('/api/device/connect', {
      familyCode: '2468',
      deviceId: 'device-a',
    })));
    const photoConnect = await connectPhotoAccess(handler, connect.json.deviceToken);

    const response = parseResponse(await handler(event('/api/media/sign', {
      wordIds: ['ket_family_n'],
    }, photoConnect.json.photoDeviceToken)));

    expect(response.statusCode).toBe(200);
    expect(response.json.photos).toEqual([
      expect.objectContaining({ wordId: 'ket_family_n' }),
    ]);
  });

  it('rejects oversized or malformed private photo signing requests', async () => {
    const repository = createMemoryRepository();
    const handler = createHandler(repository, env, {
      photoService: { sign: async () => ({ photos: [] }) },
    });
    const connect = parseResponse(await handler(event('/api/device/connect', {
      familyCode: '2468',
      deviceId: 'device-a',
    })));
    const photoConnect = await connectPhotoAccess(handler, connect.json.deviceToken);

    const response = parseResponse(await handler(event('/api/media/sign', {
      wordIds: ['../../secret'],
    }, photoConnect.json.photoDeviceToken)));

    expect(response.statusCode).toBe(400);
    expect(response.json.code).toBe('INVALID_PHOTO_WORD_IDS');
  });

  it('reports a configuration error instead of crashing when photo access env vars are missing', async () => {
    const {
      PHOTO_ACCESS_CODE_SALT: _salt,
      PHOTO_ACCESS_CODE_HASH: _hash,
      PHOTO_TOKEN_SIGNING_SECRET: _secret,
      ...envWithoutPhoto
    } = env;
    const handler = createHandler(createMemoryRepository(), envWithoutPhoto, {
      photoService: { sign: async () => ({ photos: [] }) },
    });
    const connect = parseResponse(await handler(event('/api/device/connect', {
      familyCode: '2468',
      deviceId: 'device-a',
    })));

    const connectPhotos = parseResponse(await handler(event('/api/media/connect', {
      photoAccessCode: 'photo-code',
      deviceId: 'device-a',
    }, connect.json.deviceToken)));
    const signPhotos = parseResponse(await handler(event('/api/media/sign', {
      wordIds: ['ket_family_n'],
    }, connect.json.deviceToken)));

    expect(connectPhotos.statusCode).toBe(503);
    expect(connectPhotos.json.code).toBe('PHOTO_ACCESS_NOT_CONFIGURED');
    expect(signPhotos.statusCode).toBe(503);
    expect(signPhotos.json.code).toBe('PHOTO_ACCESS_NOT_CONFIGURED');
  });

  it('keeps syncing when photo access env vars are missing', async () => {
    const {
      PHOTO_ACCESS_CODE_SALT: _salt,
      PHOTO_ACCESS_CODE_HASH: _hash,
      PHOTO_TOKEN_SIGNING_SECRET: _secret,
      ...envWithoutPhoto
    } = env;
    const handler = createHandler(createMemoryRepository(), envWithoutPhoto);
    const connect = parseResponse(await handler(event('/api/device/connect', {
      familyCode: '2468',
      deviceId: 'device-a',
    })));
    const response = parseResponse(await handler(event('/api/sync', {
      schemaVersion: 1,
      deviceId: 'device-a',
      cursor: null,
      snapshot: emptySnapshot(),
    }, connect.json.deviceToken)));

    expect(response.statusCode).toBe(200);
  });

  it('rejects the family code without crashing when the code hash is missing', async () => {
    const { FAMILY_CODE_HASH: _hash, ...envWithoutFamilyHash } = env;
    const handler = createHandler(createMemoryRepository(), envWithoutFamilyHash);

    const response = parseResponse(await handler(event('/api/device/connect', {
      familyCode: '2468',
      deviceId: 'device-a',
    })));

    expect(response.statusCode).toBe(403);
    expect(response.json.code).toBe('INVALID_FAMILY_CODE');
  });

  it('keeps study and private-photo credentials separate', async () => {
    const repository = createMemoryRepository();
    const handler = createHandler(repository, env, {
      photoService: { sign: async () => ({ photos: [] }) },
    });
    const connect = parseResponse(await handler(event('/api/device/connect', {
      familyCode: '2468',
      deviceId: 'device-a',
    })));
    const wrongPhotoCode = parseResponse(await handler(event('/api/media/connect', {
      photoAccessCode: '000000',
      deviceId: 'device-a',
    }, connect.json.deviceToken)));
    const studyTokenForPhoto = parseResponse(await handler(event('/api/media/sign', {
      wordIds: ['ket_family_n'],
    }, connect.json.deviceToken)));
    const photoConnect = await connectPhotoAccess(handler, connect.json.deviceToken);
    const photoTokenForStudy = parseResponse(await handler(event('/api/sync', {
      schemaVersion: 1,
      deviceId: 'device-a',
      cursor: null,
      snapshot: emptySnapshot(),
    }, photoConnect.json.photoDeviceToken)));

    expect(wrongPhotoCode.statusCode).toBe(403);
    expect(wrongPhotoCode.json.code).toBe('INVALID_PHOTO_ACCESS_CODE');
    expect(studyTokenForPhoto.statusCode).toBe(401);
    expect(studyTokenForPhoto.json.code).toBe('PHOTO_TOKEN_INVALID');
    expect(photoTokenForStudy.statusCode).toBe(401);
    expect(photoTokenForStudy.json.code).toBe('DEVICE_TOKEN_INVALID');
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

  it('returns a cursor-only response without merging when local and cloud cursors match', async () => {
    const repository = createMemoryRepository();
    const handler = createHandler(repository, env);
    const connect = parseResponse(await handler(event('/api/device/connect', {
      familyCode: '2468',
      deviceId: 'device-a',
    })));
    const first = parseResponse(await handler(event('/api/sync', {
      schemaVersion: 1,
      deviceId: 'device-a',
      cursor: null,
      snapshot: emptySnapshot(),
    }, connect.json.deviceToken)));

    const fast = parseResponse(await handler(event('/api/sync', {
      schemaVersion: 1,
      deviceId: 'device-a',
      cursor: first.json.cursor,
      hasLocalChanges: false,
      snapshot: null,
    }, connect.json.deviceToken)));

    expect(fast.statusCode).toBe(200);
    expect(fast.json).toMatchObject({
      cursor: first.json.cursor,
      upToDate: true,
      snapshot: null,
    });
    expect(repository.getMergeCount()).toBe(1);
  });

  it('acknowledges an incremental update without returning the full snapshot', async () => {
    const repository = createMemoryRepository();
    const handler = createHandler(repository, env);
    const connect = parseResponse(await handler(event('/api/device/connect', {
      familyCode: '2468',
      deviceId: 'device-a',
    })));
    const initial = parseResponse(await handler(event('/api/sync', {
      schemaVersion: 1,
      deviceId: 'device-a',
      cursor: null,
      snapshot: emptySnapshot(),
    }, connect.json.deviceToken)));
    const delta = emptyDelta();
    delta.events = [answerEvent('event-delta', 'word-delta', 'device-a', '2026-07-14T09:00:00.000Z')];

    const response = parseResponse(await handler(event('/api/sync', {
      schemaVersion: 1,
      deviceId: 'device-a',
      cursor: initial.json.cursor,
      hasLocalChanges: true,
      snapshot: null,
      delta,
    }, connect.json.deviceToken)));

    expect(response.statusCode).toBe(200);
    expect(response.json).toMatchObject({ upToDate: true, snapshot: null });
    expect(repository.getEventCount()).toBe(1);
  });

  it('falls back to a full merged snapshot when another device changed the cursor', async () => {
    const repository = createMemoryRepository();
    const handler = createHandler(repository, env);
    async function connect(deviceId) {
      const result = await handler(event('/api/device/connect', { familyCode: '2468', deviceId }));
      return parseResponse(result).json.deviceToken;
    }
    const tokenA = await connect('device-a');
    const tokenB = await connect('device-b');
    const initial = parseResponse(await handler(event('/api/sync', {
      schemaVersion: 1,
      deviceId: 'device-a',
      cursor: null,
      snapshot: emptySnapshot(),
    }, tokenA)));
    const deltaA = emptyDelta();
    deltaA.events = [answerEvent('event-a', 'word-a', 'device-a', '2026-07-14T09:00:00.000Z')];
    await handler(event('/api/sync', {
      schemaVersion: 1,
      deviceId: 'device-a',
      cursor: initial.json.cursor,
      hasLocalChanges: true,
      snapshot: null,
      delta: deltaA,
    }, tokenA));
    const deltaB = emptyDelta();
    deltaB.events = [answerEvent('event-b', 'word-b', 'device-b', '2026-07-14T09:01:00.000Z')];

    const response = parseResponse(await handler(event('/api/sync', {
      schemaVersion: 1,
      deviceId: 'device-b',
      cursor: initial.json.cursor,
      hasLocalChanges: true,
      snapshot: null,
      delta: deltaB,
    }, tokenB)));

    expect(response.statusCode).toBe(200);
    expect(response.json.upToDate).toBe(false);
    expect(response.json.snapshot.events.map((item) => item.id)).toEqual(['event-a', 'event-b']);
  });

  it('stores daily learning limits and the new-word queue in the cloud snapshot', async () => {
    const repository = createMemoryRepository();
    const handler = createHandler(repository, env);
    const connect = parseResponse(await handler(event('/api/device/connect', {
      familyCode: '2468',
      deviceId: 'device-a',
    })));
    const snapshot = emptySnapshot();
    snapshot.parentSetting.value.dailyNewWordCount = 15;
    snapshot.parentSetting.value.dailyReviewLimit = 30;
    snapshot.parentSetting.value.newWordQueue = ['word-b', 'word-a'];
    snapshot.parentSetting.fieldRevisions = {
      dailyNewWordCount: { updatedAt: '2026-07-20T03:00:00.000Z', deviceId: 'device-a' },
      dailyReviewLimit: { updatedAt: '2026-07-20T03:00:00.000Z', deviceId: 'device-a' },
      newWordQueue: { updatedAt: '2026-07-20T03:00:00.000Z', deviceId: 'device-a' },
    };

    const response = parseResponse(await handler(event('/api/sync', {
      schemaVersion: 1,
      deviceId: 'device-a',
      cursor: null,
      hasLocalChanges: true,
      snapshot,
    }, connect.json.deviceToken)));

    expect(response.statusCode).toBe(200);
    expect(response.json.snapshot.parentSetting.value).toMatchObject({
      dailyNewWordCount: 15,
      dailyReviewLimit: 30,
      newWordQueue: ['word-b', 'word-a'],
    });
  });

  it('carries a backpack scene from the device that equipped it to the next one', async () => {
    // The scene ids are stored on the parent setting, which the server merges
    // by iterating whatever keys it is handed — this pins that a field the
    // server has never been told about still makes it to the other device.
    const repository = createMemoryRepository();
    const handler = createHandler(repository, env);
    const connectA = parseResponse(await handler(event('/api/device/connect', {
      familyCode: '2468',
      deviceId: 'device-a',
    })));
    const connectB = parseResponse(await handler(event('/api/device/connect', {
      familyCode: '2468',
      deviceId: 'device-b',
    })));

    const equipped = emptySnapshot();
    equipped.parentSetting.value.mascotSceneId = 'cyber';
    equipped.parentSetting.value.focusSceneId = 'cottage';
    equipped.parentSetting.fieldRevisions = {
      mascotSceneId: { updatedAt: '2026-08-05T03:00:00.000Z', deviceId: 'device-a' },
      focusSceneId: { updatedAt: '2026-08-05T03:00:00.000Z', deviceId: 'device-a' },
    };
    await handler(event('/api/sync', {
      schemaVersion: 1,
      deviceId: 'device-a',
      cursor: null,
      hasLocalChanges: true,
      snapshot: equipped,
    }, connectA.json.deviceToken));

    const response = parseResponse(await handler(event('/api/sync', {
      schemaVersion: 1,
      deviceId: 'device-b',
      cursor: null,
      snapshot: emptySnapshot(),
    }, connectB.json.deviceToken)));

    expect(response.statusCode).toBe(200);
    expect(response.json.snapshot.parentSetting.value).toMatchObject({
      mascotSceneId: 'cyber',
      focusSceneId: 'cottage',
    });
  });

  it('carries a finished day from the device that finished it to the next one', async () => {
    // The server rebuilds task counts from the event log on the way through,
    // so a finished day has to survive that rebuild on the second device.
    const repository = createMemoryRepository();
    const handler = createHandler(repository, env);
    const connectA = parseResponse(await handler(event('/api/device/connect', {
      familyCode: '2468',
      deviceId: 'device-a',
    })));
    const connectB = parseResponse(await handler(event('/api/device/connect', {
      familyCode: '2468',
      deviceId: 'device-b',
    })));

    const finished = emptySnapshot();
    finished.dailyTasks = [{
      dateKey: '2026-08-03',
      newWordIds: ['word-a'],
      reviewWordIds: [],
      completedAt: '2026-08-03T09:30:00.000Z',
      correctCount: 1,
      wrongCount: 0,
      totalAnswered: 1,
      answeredWordIds: ['word-a'],
    }];
    finished.events = [answerEvent('event-a', 'word-a', 'device-a', '2026-08-03T09:29:00.000Z')];
    await handler(event('/api/sync', {
      schemaVersion: 1,
      deviceId: 'device-a',
      cursor: null,
      hasLocalChanges: true,
      snapshot: finished,
    }, connectA.json.deviceToken));

    const response = parseResponse(await handler(event('/api/sync', {
      schemaVersion: 1,
      deviceId: 'device-b',
      cursor: null,
      hasLocalChanges: true,
      snapshot: (() => {
        // B opened the same day but never finished it. An unfinished copy must
        // not erase the stamp the other device earned.
        const open = emptySnapshot();
        open.dailyTasks = [{
          dateKey: '2026-08-03',
          newWordIds: ['word-a'],
          reviewWordIds: [],
          completedAt: null,
          correctCount: 0,
          wrongCount: 0,
          totalAnswered: 0,
          answeredWordIds: [],
        }];
        return open;
      })(),
    }, connectB.json.deviceToken)));

    expect(response.statusCode).toBe(200);
    const day = response.json.snapshot.dailyTasks.find((task) => task.dateKey === '2026-08-03');
    expect(day?.completedAt).toBe('2026-08-03T09:30:00.000Z');
    expect(day?.answeredWordIds).toEqual(['word-a']);
  });

  it('keeps a finished day stamped after its answers age out of the log', async () => {
    // Events are what the rebuild counts from, so a day whose answers are no
    // longer in the log must keep the word list it already had rather than
    // being rebuilt down to zero — an empty answeredWordIds is what makes the
    // client drop completedAt, which un-stamps the calendar.
    const repository = createMemoryRepository();
    const handler = createHandler(repository, env);
    const connect = parseResponse(await handler(event('/api/device/connect', {
      familyCode: '2468',
      deviceId: 'device-a',
    })));
    const connectB = parseResponse(await handler(event('/api/device/connect', {
      familyCode: '2468',
      deviceId: 'device-b',
    })));

    const finished = emptySnapshot();
    finished.dailyTasks = [{
      dateKey: '2026-08-03',
      newWordIds: ['word-a'],
      reviewWordIds: [],
      completedAt: '2026-08-03T09:30:00.000Z',
      correctCount: 1,
      wrongCount: 0,
      totalAnswered: 1,
      answeredWordIds: ['word-a'],
    }];
    // No events: the day is old enough that its answers are gone.
    await handler(event('/api/sync', {
      schemaVersion: 1,
      deviceId: 'device-a',
      cursor: null,
      hasLocalChanges: true,
      snapshot: finished,
    }, connect.json.deviceToken));

    // A second device pushing forces a real merge, and with it the rebuild.
    const response = parseResponse(await handler(event('/api/sync', {
      schemaVersion: 1,
      deviceId: 'device-b',
      cursor: null,
      hasLocalChanges: true,
      snapshot: emptySnapshot(),
    }, connectB.json.deviceToken)));

    const day = response.json.snapshot.dailyTasks.find((task) => task.dateKey === '2026-08-03');
    expect(day?.completedAt).toBe('2026-08-03T09:30:00.000Z');
    expect(day?.answeredWordIds).toEqual(['word-a']);
  });

  it('returns the cloud snapshot without rewriting it when a clean device has a stale cursor', async () => {
    const repository = createMemoryRepository();
    const handler = createHandler(repository, env);
    const connect = parseResponse(await handler(event('/api/device/connect', {
      familyCode: '2468',
      deviceId: 'device-a',
    })));
    const first = parseResponse(await handler(event('/api/sync', {
      schemaVersion: 1,
      deviceId: 'device-a',
      cursor: null,
      snapshot: emptySnapshot(),
    }, connect.json.deviceToken)));

    const pull = parseResponse(await handler(event('/api/sync', {
      schemaVersion: 1,
      deviceId: 'device-a',
      cursor: 'stale-cursor',
      hasLocalChanges: false,
      snapshot: null,
    }, connect.json.deviceToken)));

    expect(pull.statusCode).toBe(200);
    expect(pull.json.cursor).toBe(first.json.cursor);
    expect(pull.json.upToDate).toBe(false);
    expect(pull.json.snapshot).toEqual(emptySnapshot());
    expect(repository.getMergeCount()).toBe(1);
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
      answeredWordIds: ['word-a'],
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

    // Neither side carries events for the day, so the merge keeps the answered
    // list it was handed instead of rebuilding it down to nothing — and the
    // word already answered stays at the front of the plan.
    expect(merged.dailyTasks[0]).toMatchObject({
      newWordIds: ['word-b', 'word-a'],
      answeredWordIds: ['word-b'],
    });
  });

  it('caps divergent device plans while retaining every answered new word', () => {
    const local = emptySnapshot();
    const remote = emptySnapshot();
    local.parentSetting.value.dailyNewWordCount = 3;
    remote.parentSetting.value.dailyNewWordCount = 3;
    const baseTask = {
      dateKey: '2026-07-20',
      reviewWordIds: ['review-a', 'review-b'],
      completedAt: '2026-07-20T09:00:00.000Z',
      correctCount: 0,
      wrongCount: 0,
      totalAnswered: 0,
      answeredWordIds: [],
    };
    local.dailyTasks = [{ ...baseTask, newWordIds: ['new-a', 'new-b', 'new-c'] }];
    remote.dailyTasks = [{ ...baseTask, newWordIds: ['new-d', 'new-e', 'new-f'] }];
    remote.events = ['new-b', 'new-d', 'new-e'].map((wordId, index) => ({
      id: `event-${index}`,
      wordId,
      dateKey: '2026-07-20',
      answeredAt: `2026-07-20T0${index + 7}:00:00.000Z`,
      isCorrect: true,
      generation: 0,
    }));

    const merged = mergeSnapshots(local, remote);

    expect(merged.dailyTasks[0]).toMatchObject({
      newWordIds: ['new-b', 'new-d', 'new-e'],
      reviewWordIds: ['review-a', 'review-b'],
      answeredWordIds: ['new-b', 'new-d', 'new-e'],
      completedAt: null,
    });
  });

  it('caps review backlog without consuming the new-word allowance', () => {
    const local = emptySnapshot();
    const remote = emptySnapshot();
    local.parentSetting.value.dailyNewWordCount = 3;
    local.parentSetting.value.dailyReviewLimit = 2;
    remote.parentSetting.value.dailyNewWordCount = 3;
    remote.parentSetting.value.dailyReviewLimit = 2;
    local.dailyTasks = [{
      dateKey: '2026-07-20',
      newWordIds: ['new-a', 'new-b', 'new-c'],
      reviewWordIds: ['review-a', 'review-b', 'review-c', 'review-d'],
      completedAt: null,
      correctCount: 0,
      wrongCount: 0,
      totalAnswered: 0,
      answeredWordIds: [],
    }];

    const merged = mergeSnapshots(local, remote);

    expect(merged.dailyTasks[0]).toMatchObject({
      newWordIds: ['new-a', 'new-b', 'new-c'],
      reviewWordIds: ['review-a', 'review-b'],
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
