import { CloudSyncError, connectDevice, synchronizeDevice } from './cloud-sync-service';
import {
  applySyncResponse,
  buildLocalSyncRequest,
  getOrCreateSyncMetadata,
  saveDeviceToken,
} from './storage-service';

export type StartupSyncResult =
  | { kind: 'needs-code'; message?: string }
  | { kind: 'synced'; serverTime: string }
  | { kind: 'unavailable'; message: string }
  | { kind: 'blocked'; message: string };

export type DeviceConnectionResult =
  | { kind: 'connected'; deviceToken: string }
  | Exclude<StartupSyncResult, { kind: 'synced'; serverTime: string }>;

async function syncWithToken(deviceToken: string, fetchImpl: typeof fetch): Promise<StartupSyncResult> {
  try {
    let request = await buildLocalSyncRequest();
    let response;
    try {
      response = await synchronizeDevice(deviceToken, request, fetchImpl);
    } catch (error) {
      if (!(error instanceof CloudSyncError) || error.kind !== 'full-snapshot-required') throw error;
      request = await buildLocalSyncRequest({ forceFull: true });
      response = await synchronizeDevice(deviceToken, request, fetchImpl);
    }
    await applySyncResponse(response, request);
    return { kind: 'synced', serverTime: response.serverTime };
  } catch (error) {
    if (error instanceof CloudSyncError) {
      if (error.kind === 'unauthorized') {
        await saveDeviceToken(null);
        return { kind: 'needs-code', message: error.message };
      }
      if (error.kind === 'schema' || error.kind === 'invalid-response') {
        return { kind: 'blocked', message: error.message };
      }
      return { kind: 'unavailable', message: error.message };
    }
    return {
      kind: 'unavailable',
      message: error instanceof Error ? error.message : '同步服务器暂时不可用。',
    };
  }
}

export async function hasConnectedDevice(): Promise<boolean> {
  return Boolean((await getOrCreateSyncMetadata()).deviceToken);
}

export async function connectDeviceForBackgroundSync(
  familyCode: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DeviceConnectionResult> {
  const metadata = await getOrCreateSyncMetadata();
  try {
    const { deviceToken } = await connectDevice(familyCode, metadata.deviceId, fetchImpl);
    await saveDeviceToken(deviceToken);
    return { kind: 'connected', deviceToken };
  } catch (error) {
    if (error instanceof CloudSyncError) {
      if (error.kind === 'invalid-code' || error.kind === 'unauthorized') {
        return { kind: 'needs-code', message: error.message };
      }
      if (error.kind === 'schema' || error.kind === 'invalid-response') {
        return { kind: 'blocked', message: error.message };
      }
      return { kind: 'unavailable', message: error.message };
    }
    return {
      kind: 'unavailable',
      message: error instanceof Error ? error.message : '同步服务器暂时不可用。',
    };
  }
}

export async function performStartupSync(fetchImpl: typeof fetch = fetch): Promise<StartupSyncResult> {
  const metadata = await getOrCreateSyncMetadata();
  if (!metadata.deviceToken) {
    return { kind: 'needs-code' };
  }
  return syncWithToken(metadata.deviceToken, fetchImpl);
}

export async function performStartupSyncWithRetry(
  sync: () => Promise<StartupSyncResult> = () => performStartupSync(),
  wait: (delayMs: number) => Promise<void> = (delayMs) => new Promise((resolve) => globalThis.setTimeout(resolve, delayMs)),
): Promise<StartupSyncResult> {
  let lastResult: StartupSyncResult = { kind: 'unavailable', message: '同步服务器暂时不可用。' };
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    lastResult = await sync();
    if (lastResult.kind === 'synced') return lastResult;
    if (attempt < 3) await wait(attempt * 1_000);
  }
  return lastResult;
}

export async function connectAndSynchronize(
  familyCode: string,
  fetchImpl: typeof fetch = fetch,
): Promise<StartupSyncResult> {
  const connection = await connectDeviceForBackgroundSync(familyCode, fetchImpl);
  if (connection.kind !== 'connected') return connection;
  return syncWithToken(connection.deviceToken, fetchImpl);
}
