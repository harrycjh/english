import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { SYNC_SCHEMA_VERSION, type SyncRequest } from '../models/sync';
import {
  clearLocalDeviceData,
  getOrCreateSyncMetadata,
  saveDeviceToken,
} from './storage-service';
import {
  connectAndSynchronize,
  connectDeviceForBackgroundSync,
  hasConnectedDevice,
  performStartupSync,
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
