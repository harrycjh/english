import type { SyncRequest, SyncResponse } from '../models/sync';

export type CloudSyncErrorKind = 'unavailable' | 'unauthorized' | 'invalid-code' | 'schema' | 'full-snapshot-required' | 'invalid-response';

export class CloudSyncError extends Error {
  constructor(
    public readonly kind: CloudSyncErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'CloudSyncError';
  }
}

interface ConnectResponse {
  deviceToken: string;
}

interface VerifyResponse {
  valid: boolean;
}

const RETRY_DELAYS_MS = [0, 250, 750];
const RETRYABLE_GATEWAY_STATUSES = new Set([502, 503, 504]);

export function resolveSyncApiUrl(
  path: string,
  baseUrl: string = import.meta.env.VITE_SYNC_API_BASE_URL ?? '',
): string {
  return baseUrl ? `${baseUrl.replace(/\/$/, '')}${path}` : path;
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
}

async function postJson<T>(
  path: string,
  body: unknown,
  token: string | null,
  fetchImpl: typeof fetch,
): Promise<T> {
  const requestInit: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  };
  let response: Response | null = null;
  let networkError: unknown;

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    if (RETRY_DELAYS_MS[attempt] > 0) {
      await wait(RETRY_DELAYS_MS[attempt]);
    }
    try {
      response = await fetchImpl(resolveSyncApiUrl(path), requestInit);
      networkError = null;
      if (!RETRYABLE_GATEWAY_STATUSES.has(response.status) || attempt === RETRY_DELAYS_MS.length - 1) {
        break;
      }
    } catch (error) {
      networkError = error;
      if (attempt === RETRY_DELAYS_MS.length - 1) {
        break;
      }
    }
  }

  if (!response) {
    throw new CloudSyncError('unavailable', networkError instanceof Error
      ? networkError.message
      : '无法连接同步服务器。');
  }

  if (response.status === 401) {
    throw new CloudSyncError('unauthorized', '此设备连接已失效，请重新输入家庭验证码。', response.status);
  }
  if (response.status === 403) {
    throw new CloudSyncError('invalid-code', '家庭验证码不正确。', response.status);
  }
  if (response.status === 400 || response.status === 409) {
    const payload = await response.clone().json().catch(() => null) as { code?: string } | null;
    if (payload?.code === 'FULL_SNAPSHOT_REQUIRED' || payload?.code === 'SNAPSHOT_REQUIRED') {
      throw new CloudSyncError('full-snapshot-required', '同步服务器要求重新发送完整数据。', response.status);
    }
  }
  if (response.status === 409 || response.status === 426) {
    throw new CloudSyncError('schema', '云端数据版本不兼容，请先升级应用。', response.status);
  }
  if (!response.ok) {
    throw new CloudSyncError('unavailable', `同步服务器暂时不可用（${response.status}）。`, response.status);
  }

  try {
    return await response.json() as T;
  } catch {
    throw new CloudSyncError('invalid-response', '同步服务器返回了无法识别的数据。', response.status);
  }
}

export async function connectDevice(
  familyCode: string,
  deviceId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ConnectResponse> {
  const result = await postJson<ConnectResponse>(
    '/api/device/connect',
    { familyCode, deviceId },
    null,
    fetchImpl,
  );
  if (!result.deviceToken) {
    throw new CloudSyncError('invalid-response', '同步服务器没有返回设备令牌。');
  }
  return result;
}

export function verifyFamilyCode(
  familyCode: string,
  deviceToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VerifyResponse> {
  return postJson('/api/device/verify', { familyCode }, deviceToken, fetchImpl);
}

export async function synchronizeDevice(
  deviceToken: string,
  request: SyncRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<SyncResponse> {
  const result = await postJson<SyncResponse>('/api/sync', request, deviceToken, fetchImpl);
  if (!result.cursor || !result.serverTime || (!result.snapshot && result.upToDate !== true)) {
    throw new CloudSyncError('invalid-response', '同步服务器返回的数据不完整。');
  }
  return result;
}
