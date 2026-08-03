import crypto from 'node:crypto';
import { evaluateLearningRecord } from './learning-schedule.mjs';

const SYNC_SCHEMA_VERSION = 1;
const DEVICE_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

export function hashFamilyCode(code, salt) {
  return crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function safeEqual(left, right) {
  if (!isNonEmptyString(left) || !isNonEmptyString(right)) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isPhotoAccessConfigured(env) {
  return isNonEmptyString(env.PHOTO_ACCESS_CODE_SALT)
    && isNonEmptyString(env.PHOTO_ACCESS_CODE_HASH)
    && isNonEmptyString(env.PHOTO_TOKEN_SIGNING_SECRET);
}

function signToken(payload, secret) {
  const encoded = base64Url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyToken(token, secret) {
  if (!isNonEmptyString(secret)) return null;
  const [encoded, signature] = String(token ?? '').split('.');
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  if (!safeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return payload.expiresAt > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function createDeviceToken(userId, deviceId, secret, scope = 'study') {
  return signToken({
    deviceId,
    userId,
    scope,
    expiresAt: Date.now() + DEVICE_TOKEN_TTL_MS,
  }, secret);
}

function mergeEvents(local = [], remote = []) {
  const byId = new Map();
  for (const event of [...local, ...remote]) {
    const current = byId.get(event.id);
    if (!current || JSON.stringify(event).localeCompare(JSON.stringify(current)) > 0) {
      byId.set(event.id, event);
    }
  }
  return [...byId.values()].sort(
    (left, right) => left.answeredAt.localeCompare(right.answeredAt) || left.id.localeCompare(right.id),
  );
}

function mergeSelections(local = [], remote = []) {
  const byWordId = new Map();
  for (const state of [...local, ...remote]) {
    const current = byWordId.get(state.wordId);
    const key = `${state.updatedAt}\u0000${state.updatedByDeviceId ?? ''}`;
    const currentKey = current ? `${current.updatedAt}\u0000${current.updatedByDeviceId ?? ''}` : '';
    if (!current || key.localeCompare(currentKey) > 0) byWordId.set(state.wordId, state);
  }
  return [...byWordId.values()].sort((left, right) => left.wordId.localeCompare(right.wordId));
}

function compareRevision(left, right) {
  const leftKey = left ? `${left.updatedAt}\u0000${left.deviceId}` : '';
  const rightKey = right ? `${right.updatedAt}\u0000${right.deviceId}` : '';
  return leftKey.localeCompare(rightKey);
}

function mergeParentSetting(local, remote) {
  if (!local) return remote;
  if (!remote) return local;
  const value = { ...local.value };
  const fieldRevisions = { ...local.fieldRevisions };
  for (const field of Object.keys(remote.value)) {
    if (compareRevision(remote.fieldRevisions?.[field], local.fieldRevisions?.[field]) > 0) {
      value[field] = remote.value[field];
      fieldRevisions[field] = remote.fieldRevisions[field];
    }
  }
  return { value, fieldRevisions };
}

function mergeTasks(local = [], remote = []) {
  const byDate = new Map();
  const wordIds = (value) => Array.isArray(value) ? value : [];
  for (const task of [...local, ...remote]) {
    const current = byDate.get(task.dateKey);
    if (!current) {
      byDate.set(task.dateKey, task);
      continue;
    }
    byDate.set(task.dateKey, {
      ...current,
      newWordIds: [...new Set([...wordIds(current.newWordIds), ...wordIds(task.newWordIds)])],
      reviewWordIds: [...new Set([...wordIds(current.reviewWordIds), ...wordIds(task.reviewWordIds)])],
      completedAt: [current.completedAt, task.completedAt].filter(Boolean).sort()[0] ?? null,
      correctCount: Math.max(current.correctCount ?? 0, task.correctCount ?? 0),
      wrongCount: Math.max(current.wrongCount ?? 0, task.wrongCount ?? 0),
      totalAnswered: Math.max(current.totalAnswered ?? 0, task.totalAnswered ?? 0),
      answeredWordIds: [
        ...new Set([...wordIds(current.answeredWordIds), ...wordIds(task.answeredWordIds)]),
      ],
    });
  }
  return [...byDate.values()].sort((left, right) => left.dateKey.localeCompare(right.dateKey));
}

function rebuildTaskCounts(tasks, events, generation) {
  const eventsByDate = new Map();
  for (const event of events) {
    if ((event.generation ?? 0) !== generation) continue;
    const dateEvents = eventsByDate.get(event.dateKey) ?? [];
    dateEvents.push(event);
    eventsByDate.set(event.dateKey, dateEvents);
  }
  return tasks.map((task) => {
    const dateEvents = eventsByDate.get(task.dateKey) ?? [];
    return {
      ...task,
      correctCount: dateEvents.filter((event) => event.isCorrect).length,
      wrongCount: dateEvents.filter((event) => !event.isCorrect).length,
      totalAnswered: dateEvents.length,
      answeredWordIds: [...new Set(
        dateEvents.filter((event) => event.isCorrect).map((event) => event.wordId),
      )],
    };
  });
}

function normalizeTaskPlans(tasks, parentSetting) {
  const newWordLimit = Math.max(1, Number(parentSetting?.dailyNewWordCount) || 8);
  const reviewLimit = Math.max(1, Number(parentSetting?.dailyReviewLimit) || 80);
  const uniqueIds = (value) => [...new Set(Array.isArray(value) ? value : [])];
  const keepAnsweredFirst = (ids, answeredWordIds, target) => {
    const answeredIds = ids.filter((wordId) => answeredWordIds.has(wordId));
    const unansweredIds = ids.filter((wordId) => !answeredWordIds.has(wordId));
    return [...answeredIds, ...unansweredIds].slice(0, Math.max(target, answeredIds.length));
  };

  return tasks.map((task) => {
    const answeredWordIds = new Set(uniqueIds(task.answeredWordIds));
    const mergedReviewWordIds = uniqueIds(task.reviewWordIds);
    const reviewCount = Math.min(mergedReviewWordIds.length, reviewLimit);
    const reviewWordIds = keepAnsweredFirst(mergedReviewWordIds, answeredWordIds, reviewCount);
    const reviewWordIdSet = new Set(reviewWordIds);
    const mergedNewWordIds = uniqueIds(task.newWordIds)
      .filter((wordId) => !reviewWordIdSet.has(wordId));
    const newWordIds = keepAnsweredFirst(mergedNewWordIds, answeredWordIds, newWordLimit);
    const plannedWordIds = [...reviewWordIds, ...newWordIds];
    const isFullyAnswered = plannedWordIds.every((wordId) => answeredWordIds.has(wordId));

    return {
      ...task,
      reviewWordIds,
      newWordIds,
      completedAt: task.completedAt && isFullyAnswered ? task.completedAt : null,
    };
  });
}

function emptyLearningRecord(wordId) {
  return {
    wordId,
    masteryLevel: 0,
    reviewStage: 0,
    correctStreak: 0,
    wrongCount: 0,
    lastStudiedAt: null,
    nextDueAt: null,
  };
}

function mergeCheckpoint(local, remote, events, generation) {
  if (!local) return remote ?? null;
  if (!remote) return local;
  if (local.generation !== remote.generation) {
    return local.generation > remote.generation ? local : remote;
  }
  const later = `${remote.capturedAt}\u0000${remote.deviceId}`
    .localeCompare(`${local.capturedAt}\u0000${local.deviceId}`) > 0 ? remote : local;
  const targetAt = later.capturedAt;
  const candidates = new Map();
  for (const [checkpoint, source] of [[local, 'local'], [remote, 'remote']]) {
    for (const record of checkpoint.records) {
      const current = candidates.get(record.wordId);
      const recordKey = `${record.lastStudiedAt ?? ''}\u0000${source}`;
      if (!current || recordKey.localeCompare(current.key) > 0) {
        candidates.set(record.wordId, { record: { ...record }, baseAt: checkpoint.capturedAt, key: recordKey });
      }
    }
  }
  for (const event of events) {
    if ((event.generation ?? 0) !== generation || event.answeredAt > targetAt) continue;
    const candidate = candidates.get(event.wordId) ?? {
      record: emptyLearningRecord(event.wordId),
      baseAt: '',
      key: '',
    };
    if (event.answeredAt > candidate.baseAt) {
      candidate.record = evaluateLearningRecord(candidate.record, event);
      candidates.set(event.wordId, candidate);
    }
  }
  return {
    capturedAt: targetAt,
    deviceId: later.deviceId,
    generation,
    records: [...candidates.values()]
      .map((candidate) => candidate.record)
      .sort((left, right) => left.wordId.localeCompare(right.wordId)),
  };
}

export function mergeSnapshots(local, remote) {
  if (!local) return structuredClone(remote);
  if (remote.generation > local.generation) return structuredClone(remote);
  if (remote.generation < local.generation) return structuredClone(local);
  const events = mergeEvents(local.events, remote.events);
  const generation = local.generation;
  const parentSetting = mergeParentSetting(local.parentSetting, remote.parentSetting);
  const mergedTasks = rebuildTaskCounts(mergeTasks(local.dailyTasks, remote.dailyTasks), events, generation);
  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    generation,
    events,
    checkpoint: mergeCheckpoint(local.checkpoint, remote.checkpoint, events, generation),
    dailyTasks: normalizeTaskPlans(mergedTasks, parentSetting.value),
    wordSelectionStates: mergeSelections(local.wordSelectionStates, remote.wordSelectionStates),
    parentSetting,
  };
}

export function applyDeltaToSnapshot(current, delta, { rebuildCounts = true } = {}) {
  if (!current) return null;
  if (delta.generation !== current.generation) return null;
  const events = mergeEvents(current.events, delta.events);
  const parentSetting = delta.parentSetting
    ? mergeParentSetting(current.parentSetting, delta.parentSetting)
    : current.parentSetting;
  const mergedTasks = mergeTasks(current.dailyTasks, delta.dailyTasks);
  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    generation: current.generation,
    events,
    checkpoint: current.checkpoint,
    dailyTasks: normalizeTaskPlans(
      rebuildCounts ? rebuildTaskCounts(mergedTasks, events, current.generation) : mergedTasks,
      parentSetting.value,
    ),
    wordSelectionStates: mergeSelections(current.wordSelectionStates, delta.wordSelectionStates),
    parentSetting,
  };
}

export function createMemoryRepository() {
  let snapshot = null;
  let cursor = 0;
  let mergeCount = 0;
  const activeDevices = new Set();
  return {
    async registerDevice(userId, deviceId) {
      activeDevices.add(`${userId}\u0000${deviceId}`);
    },
    async isDeviceActive(userId, deviceId) {
      return activeDevices.has(`${userId}\u0000${deviceId}`);
    },
    revokeDevice(userId, deviceId) {
      activeDevices.delete(`${userId}\u0000${deviceId}`);
    },
    async getSyncState(_userId, clientCursor) {
      const serverCursor = snapshot ? String(cursor) : null;
      const isCurrent = Boolean(serverCursor && clientCursor === serverCursor);
      return {
        cursor: serverCursor,
        isCurrent,
        snapshot: isCurrent || !snapshot ? null : structuredClone(snapshot),
      };
    },
    async mergeSnapshot(_userId, incoming) {
      snapshot = mergeSnapshots(snapshot, incoming);
      cursor += 1;
      mergeCount += 1;
      return { snapshot: structuredClone(snapshot), cursor: String(cursor) };
    },
    async mergeDelta(_userId, incoming, clientCursor) {
      if (!snapshot || !clientCursor) return { cursor: null, snapshot: null };
      const wasCurrent = clientCursor === String(cursor);
      const merged = applyDeltaToSnapshot(snapshot, incoming);
      if (!merged) return { cursor: null, snapshot: null };
      snapshot = merged;
      cursor += 1;
      mergeCount += 1;
      return {
        snapshot: wasCurrent ? null : structuredClone(snapshot),
        cursor: String(cursor),
      };
    },
    getEventCount() {
      return snapshot?.events.length ?? 0;
    },
    getMergeCount() {
      return mergeCount;
    },
  };
}

function parseInvocation(event) {
  const value = Buffer.isBuffer(event) ? JSON.parse(event.toString()) : event;
  const bodyText = value.isBase64Encoded
    ? Buffer.from(value.body ?? '', 'base64').toString('utf8')
    : value.body ?? '{}';
  return {
    path: value.rawPath ?? value.requestContext?.http?.path ?? '/',
    method: value.requestContext?.http?.method ?? value.httpMethod ?? 'POST',
    headers: Object.fromEntries(
      Object.entries(value.headers ?? {}).map(([key, headerValue]) => [key.toLowerCase(), headerValue]),
    ),
    body: typeof bodyText === 'string' ? JSON.parse(bodyText || '{}') : bodyText,
  };
}

function response(statusCode, body, origin) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    },
    isBase64Encoded: false,
    body: JSON.stringify(body),
  };
}

function bearerToken(headers) {
  const value = headers.authorization ?? '';
  return value.startsWith('Bearer ') ? value.slice(7) : null;
}

function requestedPhotoWordIds(body) {
  if (!Array.isArray(body.wordIds) || body.wordIds.length === 0 || body.wordIds.length > 50) {
    return null;
  }
  const wordIds = body.wordIds.map((wordId) => String(wordId));
  return wordIds.every((wordId) => /^ket_[a-z0-9_]+$/.test(wordId)) ? wordIds : null;
}

export function createHandler(repository, env, dependencies = {}) {
  return async function handler(event) {
    try {
      const request = parseInvocation(event);
      if (request.method !== 'POST') return response(405, { code: 'METHOD_NOT_ALLOWED' }, env.ALLOWED_ORIGIN);
      const requestOrigin = request.headers.origin;
      if (requestOrigin && env.ALLOWED_ORIGIN && requestOrigin !== env.ALLOWED_ORIGIN) {
        return response(403, { code: 'ORIGIN_NOT_ALLOWED' }, env.ALLOWED_ORIGIN);
      }

      if (request.path === '/api/device/connect') {
        const actualHash = hashFamilyCode(String(request.body.familyCode ?? ''), env.FAMILY_CODE_SALT);
        if (!safeEqual(actualHash, env.FAMILY_CODE_HASH)) {
          return response(403, { code: 'INVALID_FAMILY_CODE', message: '家庭验证码不正确。' }, env.ALLOWED_ORIGIN);
        }
        const deviceId = String(request.body.deviceId ?? '');
        if (!deviceId) return response(400, { code: 'DEVICE_ID_REQUIRED' }, env.ALLOWED_ORIGIN);
        await repository.registerDevice(env.FIXED_USER_ID, deviceId);
        const deviceToken = createDeviceToken(
          env.FIXED_USER_ID,
          deviceId,
          env.TOKEN_SIGNING_SECRET,
          'study',
        );
        return response(200, { deviceToken }, env.ALLOWED_ORIGIN);
      }

      const isPhotoSigningRequest = request.path === '/api/media/sign';
      const isPhotoRequest = isPhotoSigningRequest || request.path === '/api/media/connect';
      if (isPhotoRequest && !isPhotoAccessConfigured(env)) {
        return response(503, {
          code: 'PHOTO_ACCESS_NOT_CONFIGURED',
          message: '生活照片功能尚未在服务器上启用。',
        }, env.ALLOWED_ORIGIN);
      }
      const expectedScope = isPhotoSigningRequest ? 'photo' : 'study';
      const tokenPayload = verifyToken(
        bearerToken(request.headers),
        isPhotoSigningRequest ? env.PHOTO_TOKEN_SIGNING_SECRET : env.TOKEN_SIGNING_SECRET,
      );
      const tokenScope = tokenPayload?.scope ?? 'study';
      if (!tokenPayload || tokenPayload.userId !== env.FIXED_USER_ID || tokenScope !== expectedScope) {
        return response(401, {
          code: isPhotoSigningRequest ? 'PHOTO_TOKEN_INVALID' : 'DEVICE_TOKEN_INVALID',
        }, env.ALLOWED_ORIGIN);
      }
      if (!await repository.isDeviceActive(env.FIXED_USER_ID, tokenPayload.deviceId)) {
        return response(401, { code: 'DEVICE_REVOKED' }, env.ALLOWED_ORIGIN);
      }
      const refreshedDeviceToken = createDeviceToken(
        env.FIXED_USER_ID,
        tokenPayload.deviceId,
        isPhotoSigningRequest ? env.PHOTO_TOKEN_SIGNING_SECRET : env.TOKEN_SIGNING_SECRET,
        expectedScope,
      );

      if (request.path === '/api/media/connect') {
        const actualHash = hashFamilyCode(
          String(request.body.photoAccessCode ?? ''),
          env.PHOTO_ACCESS_CODE_SALT,
        );
        if (!safeEqual(actualHash, env.PHOTO_ACCESS_CODE_HASH)) {
          return response(403, {
            code: 'INVALID_PHOTO_ACCESS_CODE',
            message: '生活照片密码不正确。',
          }, env.ALLOWED_ORIGIN);
        }
        const requestedDeviceId = String(request.body.deviceId ?? '');
        if (!requestedDeviceId || requestedDeviceId !== tokenPayload.deviceId) {
          return response(401, { code: 'DEVICE_TOKEN_MISMATCH' }, env.ALLOWED_ORIGIN);
        }
        const photoDeviceToken = createDeviceToken(
          env.FIXED_USER_ID,
          tokenPayload.deviceId,
          env.PHOTO_TOKEN_SIGNING_SECRET,
          'photo',
        );
        return response(200, { photoDeviceToken }, env.ALLOWED_ORIGIN);
      }

      if (request.path === '/api/device/verify') {
        const actualHash = hashFamilyCode(String(request.body.familyCode ?? ''), env.FAMILY_CODE_SALT);
        const valid = safeEqual(actualHash, env.FAMILY_CODE_HASH);
        return response(
          valid ? 200 : 403,
          valid ? { valid: true, deviceToken: refreshedDeviceToken } : { code: 'INVALID_FAMILY_CODE' },
          env.ALLOWED_ORIGIN,
        );
      }

      if (request.path === '/api/media/sign') {
        const wordIds = requestedPhotoWordIds(request.body);
        if (!wordIds) {
          return response(400, { code: 'INVALID_PHOTO_WORD_IDS' }, env.ALLOWED_ORIGIN);
        }
        if (!dependencies.photoService) {
          return response(503, { code: 'PHOTO_SERVICE_UNAVAILABLE' }, env.ALLOWED_ORIGIN);
        }
        const signedPhotos = await dependencies.photoService.sign(wordIds);
        return response(200, {
          ...signedPhotos,
          photoDeviceToken: refreshedDeviceToken,
        }, env.ALLOWED_ORIGIN);
      }

      if (request.path === '/api/sync') {
        if (request.body.schemaVersion !== SYNC_SCHEMA_VERSION
          || (request.body.snapshot
            && request.body.snapshot.schemaVersion !== SYNC_SCHEMA_VERSION)
          || (request.body.delta
            && request.body.delta.schemaVersion !== SYNC_SCHEMA_VERSION)) {
          return response(409, { code: 'SCHEMA_MISMATCH' }, env.ALLOWED_ORIGIN);
        }
        if (request.body.deviceId !== tokenPayload.deviceId) {
          return response(401, { code: 'DEVICE_TOKEN_MISMATCH' }, env.ALLOWED_ORIGIN);
        }

        if (request.body.hasLocalChanges === false) {
          if (!request.body.cursor) {
            return response(400, { code: 'CURSOR_REQUIRED' }, env.ALLOWED_ORIGIN);
          }
          const current = await repository.getSyncState(env.FIXED_USER_ID, request.body.cursor);
          if (!current.cursor) {
            return response(409, { code: 'FULL_SNAPSHOT_REQUIRED' }, env.ALLOWED_ORIGIN);
          }
          return response(200, {
            schemaVersion: SYNC_SCHEMA_VERSION,
            cursor: current.cursor,
            serverTime: new Date().toISOString(),
            deviceToken: refreshedDeviceToken,
            upToDate: current.isCurrent,
            snapshot: current.snapshot,
          }, env.ALLOWED_ORIGIN);
        }

        if (request.body.delta) {
          if (!request.body.cursor) {
            return response(409, { code: 'FULL_SNAPSHOT_REQUIRED' }, env.ALLOWED_ORIGIN);
          }
          const merged = await repository.mergeDelta(
            env.FIXED_USER_ID,
            request.body.delta,
            request.body.cursor,
          );
          if (!merged.cursor) {
            return response(409, { code: 'FULL_SNAPSHOT_REQUIRED' }, env.ALLOWED_ORIGIN);
          }
          return response(200, {
            schemaVersion: SYNC_SCHEMA_VERSION,
            cursor: merged.cursor,
            serverTime: new Date().toISOString(),
            deviceToken: refreshedDeviceToken,
            upToDate: merged.snapshot ? false : true,
            snapshot: merged.snapshot,
          }, env.ALLOWED_ORIGIN);
        }

        if (!request.body.snapshot) {
          return response(400, { code: 'SNAPSHOT_REQUIRED' }, env.ALLOWED_ORIGIN);
        }
        const merged = await repository.mergeSnapshot(env.FIXED_USER_ID, request.body.snapshot);
        return response(200, {
          schemaVersion: SYNC_SCHEMA_VERSION,
          cursor: merged.cursor,
          serverTime: new Date().toISOString(),
          deviceToken: refreshedDeviceToken,
          upToDate: false,
          snapshot: merged.snapshot,
        }, env.ALLOWED_ORIGIN);
      }

      return response(404, { code: 'NOT_FOUND' }, env.ALLOWED_ORIGIN);
    } catch (error) {
      console.error('vocab-sync request failed', error);
      return response(500, { code: 'INTERNAL_ERROR' }, env.ALLOWED_ORIGIN);
    }
  };
}

export async function handler(event, context) {
  const { createTablestoreRepositoryFromEnv } = await import('./tablestore-repository.mjs');
  const { createOssPhotoServiceFromEnv } = await import('./oss-photo-service.mjs');
  const invocationHandler = createHandler(
    createTablestoreRepositoryFromEnv(process.env, context),
    process.env,
    { photoService: createOssPhotoServiceFromEnv(process.env, context) },
  );
  return invocationHandler(event, context);
}
