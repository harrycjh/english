import { describe, expect, it } from 'vitest';
import { SYNC_SCHEMA_VERSION, type SyncRequest } from '../models/sync';
import {
  CloudSyncError,
  connectDevice,
  connectPrivateLifePhotos,
  resolveSyncApiUrl,
  synchronizeDevice,
  verifyFamilyCode,
} from './cloud-sync-service';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeRequest(): SyncRequest {
  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    deviceId: 'device-a',
    cursor: null,
    snapshot: {
      schemaVersion: SYNC_SCHEMA_VERSION,
      generation: 0,
      events: [],
      checkpoint: null,
      dailyTasks: [],
      wordSelectionStates: [],
      parentSetting: {
        value: {
          profileId: 'cute-junjun',
          enableAudio: true,
          englishVoiceURI: '',
          chineseVoiceURI: '',
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
    },
  };
}

describe('connectDevice', () => {
  it('posts the family code and local device id to the same-origin API', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return jsonResponse({ deviceToken: 'token-a' });
    };

    const result = await connectDevice('2468', 'device-a', fetchImpl);

    expect(capturedUrl).toBe('/api/device/connect');
    expect(capturedInit?.method).toBe('POST');
    expect(JSON.parse(String(capturedInit?.body))).toEqual({ familyCode: '2468', deviceId: 'device-a' });
    expect(result.deviceToken).toBe('token-a');
  });

  it('retries a transient gateway timeout before reporting success', async () => {
    let attempts = 0;
    const fetchImpl: typeof fetch = async () => {
      attempts += 1;
      return attempts === 1
        ? jsonResponse({ message: 'gateway timeout' }, 504)
        : jsonResponse({ deviceToken: 'token-a' });
    };

    const result = await connectDevice('2468', 'device-a', fetchImpl);

    expect(attempts).toBe(2);
    expect(result.deviceToken).toBe('token-a');
  });
});

describe('resolveSyncApiUrl', () => {
  it('uses the direct Function Compute endpoint only when a base URL is configured', () => {
    expect(resolveSyncApiUrl('/api/sync', '')).toBe('/api/sync');
    expect(resolveSyncApiUrl('/api/sync', 'https://sync.example.com/')).toBe(
      'https://sync.example.com/api/sync',
    );
  });
});

describe('verifyFamilyCode', () => {
  it('uses the connected device token when authorizing local deletion', async () => {
    let capturedHeaders: HeadersInit | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      capturedHeaders = init?.headers;
      return jsonResponse({ valid: true });
    };

    await verifyFamilyCode('2468', 'token-a', fetchImpl);

    expect(new Headers(capturedHeaders).get('Authorization')).toBe('Bearer token-a');
  });
});

describe('connectPrivateLifePhotos', () => {
  it('uses the study device token to exchange the separate photo password', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return jsonResponse({ photoDeviceToken: 'photo-token-a' });
    };

    const result = await connectPrivateLifePhotos('photo-code', 'device-a', 'study-token-a', fetchImpl);

    expect(capturedUrl).toBe('/api/media/connect');
    expect(new Headers(capturedInit?.headers).get('Authorization')).toBe('Bearer study-token-a');
    expect(JSON.parse(String(capturedInit?.body))).toEqual({
      photoAccessCode: 'photo-code',
      deviceId: 'device-a',
    });
    expect(result.photoDeviceToken).toBe('photo-token-a');
  });

  it('reports an incorrect photo password distinctly', async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse({
      code: 'INVALID_PHOTO_ACCESS_CODE',
    }, 403);

    await expect(connectPrivateLifePhotos('wrong', 'device-a', 'study-token-a', fetchImpl))
      .rejects.toMatchObject({ kind: 'invalid-code', message: '生活照片密码不正确。' });
  });
});

describe('synchronizeDevice', () => {
  it('accepts a cursor-only up-to-date response without a full snapshot', async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse({
      schemaVersion: SYNC_SCHEMA_VERSION,
      cursor: 'cursor-1',
      serverTime: '2026-07-14T10:00:00.000Z',
      upToDate: true,
      snapshot: null,
    });

    await expect(synchronizeDevice('token-a', makeRequest(), fetchImpl)).resolves.toMatchObject({
      cursor: 'cursor-1',
      upToDate: true,
      snapshot: null,
    });
  });

  it('classifies a server outage separately from a revoked token', async () => {
    const unavailableFetch: typeof fetch = async () => jsonResponse({ message: 'busy' }, 503);
    const revokedFetch: typeof fetch = async () => jsonResponse({ message: 'revoked' }, 401);

    await expect(synchronizeDevice('token-a', makeRequest(), unavailableFetch)).rejects.toMatchObject({
      kind: 'unavailable',
    } satisfies Partial<CloudSyncError>);
    await expect(synchronizeDevice('token-a', makeRequest(), revokedFetch)).rejects.toMatchObject({
      kind: 'unauthorized',
    } satisfies Partial<CloudSyncError>);
  });
});
