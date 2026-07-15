import { describe, expect, it } from 'vitest';
import { SYNC_SCHEMA_VERSION, type SyncRequest } from '../models/sync';
import {
  CloudSyncError,
  connectDevice,
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
          dailyNewWordCount: 6,
          dailyReviewLimit: 8,
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

describe('synchronizeDevice', () => {
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
