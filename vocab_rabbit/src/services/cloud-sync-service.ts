import type { SyncRequest, SyncResponse } from '../models/sync';

export type CloudSyncErrorKind = 'unavailable' | 'unauthorized' | 'invalid-code' | 'schema' | 'invalid-response';

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

async function postJson<T>(
  path: string,
  body: unknown,
  token: string | null,
  fetchImpl: typeof fetch,
): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new CloudSyncError(
      'unavailable',
      error instanceof Error ? error.message : '无法连接同步服务器。',
    );
  }

  if (response.status === 401) {
    throw new CloudSyncError('unauthorized', '此设备连接已失效，请重新输入家庭验证码。', response.status);
  }
  if (response.status === 403) {
    throw new CloudSyncError('invalid-code', '家庭验证码不正确。', response.status);
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
  if (!result.cursor || !result.snapshot || !result.serverTime) {
    throw new CloudSyncError('invalid-response', '同步服务器返回的数据不完整。');
  }
  return result;
}
