import {
  CloudSyncError,
  connectDevice,
  synchronizeDevice,
  type DownloadProgress,
} from './cloud-sync-service';
import {
  applySyncResponse,
  buildLocalSyncRequest,
  getOrCreateSyncMetadata,
  hasLocalLearningData,
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

export interface StartupSyncProgress extends DownloadProgress {
  phase: 'requesting' | 'downloading' | 'applying';
  attempt: number;
}

interface SyncEventTarget {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}

interface SyncVisibilityTarget extends SyncEventTarget {
  visibilityState: DocumentVisibilityState;
}

export function installResumeSyncListeners(
  runSync: () => void | Promise<unknown>,
  windowTarget: SyncEventTarget = window,
  documentTarget: SyncVisibilityTarget = document,
): () => void {
  const syncWhenVisible: EventListener = () => {
    if (documentTarget.visibilityState === 'visible') {
      void runSync();
    }
  };

  windowTarget.addEventListener('pageshow', syncWhenVisible);
  windowTarget.addEventListener('online', syncWhenVisible);
  documentTarget.addEventListener('visibilitychange', syncWhenVisible);

  return () => {
    windowTarget.removeEventListener('pageshow', syncWhenVisible);
    windowTarget.removeEventListener('online', syncWhenVisible);
    documentTarget.removeEventListener('visibilitychange', syncWhenVisible);
  };
}

async function syncWithToken(
  deviceToken: string,
  fetchImpl: typeof fetch,
  onProgress?: (progress: StartupSyncProgress) => void,
  attempt = 1,
): Promise<StartupSyncResult> {
  try {
    const forceCloudPull = !(await hasLocalLearningData());
    let request = await buildLocalSyncRequest({ forceCloudPull });
    let response;
    try {
      onProgress?.({ phase: 'requesting', attempt, loadedBytes: 0, totalBytes: null });
      response = await synchronizeDevice(deviceToken, request, fetchImpl, (progress) => {
        onProgress?.({ phase: 'downloading', attempt, ...progress });
      });
    } catch (error) {
      if (!(error instanceof CloudSyncError) || error.kind !== 'full-snapshot-required') throw error;
      request = await buildLocalSyncRequest({ forceFull: true });
      onProgress?.({ phase: 'requesting', attempt, loadedBytes: 0, totalBytes: null });
      response = await synchronizeDevice(deviceToken, request, fetchImpl, (progress) => {
        onProgress?.({ phase: 'downloading', attempt, ...progress });
      });
    }
    onProgress?.({
      phase: 'applying',
      attempt,
      loadedBytes: 0,
      totalBytes: null,
    });
    try {
      await applySyncResponse(response, request);
    } catch (error) {
      const detail = error instanceof Error ? error.message : '未知的本地存储错误';
      return {
        kind: 'blocked',
        message: `云端学习记录已下载，但写入本机失败：${detail}`,
      };
    }
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

export async function performStartupSync(
  fetchImpl: typeof fetch = fetch,
  onProgress?: (progress: StartupSyncProgress) => void,
  attempt = 1,
): Promise<StartupSyncResult> {
  const metadata = await getOrCreateSyncMetadata();
  if (!metadata.deviceToken) {
    return { kind: 'needs-code' };
  }
  return syncWithToken(metadata.deviceToken, fetchImpl, onProgress, attempt);
}

export async function performStartupSyncWithRetry(
  sync: () => Promise<StartupSyncResult> = () => performStartupSync(),
  wait: (delayMs: number) => Promise<void> = (delayMs) => new Promise((resolve) => globalThis.setTimeout(resolve, delayMs)),
): Promise<StartupSyncResult> {
  let lastResult: StartupSyncResult = { kind: 'unavailable', message: '同步服务器暂时不可用。' };
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    lastResult = await sync();
    if (lastResult.kind === 'synced') return lastResult;
    if (lastResult.kind !== 'unavailable') return lastResult;
    if (attempt < 3) await wait(attempt * 1_000);
  }
  return lastResult;
}

export async function restoreEmptyDeviceFromCloud(
  fetchImpl: typeof fetch = fetch,
  onProgress?: (progress: StartupSyncProgress) => void,
): Promise<StartupSyncResult | null> {
  if (await hasLocalLearningData()) return null;
  let attempt = 0;
  return performStartupSyncWithRetry(() => {
    attempt += 1;
    return performStartupSync(fetchImpl, onProgress, attempt);
  });
}

export async function connectAndSynchronize(
  familyCode: string,
  fetchImpl: typeof fetch = fetch,
): Promise<StartupSyncResult> {
  const connection = await connectDeviceForBackgroundSync(familyCode, fetchImpl);
  if (connection.kind !== 'connected') return connection;
  return syncWithToken(connection.deviceToken, fetchImpl);
}
