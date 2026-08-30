import type { PronunciationResult } from '../models/answer-event';
import {
  requestSpeechEvaluationWarrant,
  type SpeechEvaluationWarrant,
} from './cloud-sync-service';
import { getOrCreateSyncMetadata } from './storage-service';

export type PronunciationPracticeState =
  | { kind: 'ready' }
  | { kind: 'preparing' }
  | { kind: 'recording'; volume: number }
  | { kind: 'evaluating' }
  | { kind: 'complete'; score: number; feedback?: string }
  | { kind: 'unavailable'; message: string };

interface SpeechEvaluationPayload {
  applicationId?: string;
  recordId?: string;
  result?: {
    overall?: number | string;
    wavetime?: number | string;
    info?: {
      volume?: number | string;
      snr?: number | string;
      tipId?: number | string;
    };
    details?: Array<{
      score?: number | string;
      dp_type?: number | string;
    }>;
  };
}

interface SpeechEvaluationFailurePayload {
  errId?: number | string;
  error?: string;
}

interface AliyunEngineInstance {
  startRecord: (params: Record<string, unknown>) => void;
  cancelRecord?: () => void;
}

type AliyunEngineConstructor = new (options: Record<string, unknown>) => AliyunEngineInstance;

declare global {
  interface Window {
    EngineEvaluat?: AliyunEngineConstructor;
  }
}

export interface WordPronunciationEvaluation {
  score: number;
  recordId?: string;
  audioDurationMs?: number;
  inputVolume?: number;
  signalToNoise?: number;
  tipId?: number;
  wordScore?: number;
  omissionType?: number;
}

const WORD_PRONUNCIATION_CORE_TYPE = 'en.word_kid.score';

export function shouldRequireWordPronunciation(_level: number, _correct: boolean): boolean {
  return false;
}

export function createUnavailablePronunciationResult(
  targetText: string,
  status: 'skipped' | 'unavailable' = 'unavailable',
): PronunciationResult {
  return {
    targetType: 'word',
    targetText,
    provider: 'aliyun-ssecp',
    status,
    overallScore: null,
    attemptedAt: new Date().toISOString(),
  };
}

export function createScoredPronunciationResult(
  targetText: string,
  evaluation: WordPronunciationEvaluation,
): PronunciationResult {
  return {
    targetType: 'word',
    targetText,
    provider: 'aliyun-ssecp',
    status: 'scored',
    overallScore: evaluation.score,
    attemptedAt: new Date().toISOString(),
    recordId: evaluation.recordId,
  };
}

export function parseWordPronunciationEvaluation(raw: unknown): WordPronunciationEvaluation {
  const payload = (typeof raw === 'string' ? JSON.parse(raw) : raw) as SpeechEvaluationPayload;
  const score = Number(payload?.result?.overall);
  if (!Number.isFinite(score)) {
    throw new Error('语音评测没有返回有效分数。');
  }
  const numberOrUndefined = (value: unknown): number | undefined => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const detail = payload.result?.details?.[0];
  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    recordId: payload.recordId,
    audioDurationMs: numberOrUndefined(payload.result?.wavetime),
    inputVolume: numberOrUndefined(payload.result?.info?.volume),
    signalToNoise: numberOrUndefined(payload.result?.info?.snr),
    tipId: numberOrUndefined(payload.result?.info?.tipId),
    wordScore: numberOrUndefined(detail?.score),
    omissionType: numberOrUndefined(detail?.dp_type),
  };
}

export function buildWordPronunciationRequest(
  word: string,
  warrantId: string,
): Record<string, unknown> {
  return {
    coreType: WORD_PRONUNCIATION_CORE_TYPE,
    refText: word.trim(),
    rank: 100,
    precision: 0.5,
    attachAudioUrl: 0,
    typeThres: 2,
    accent: 'am',
    evalTime: 5_000,
    warrantId,
  };
}

export function describeWordPronunciationEvaluation(
  evaluation: WordPronunciationEvaluation,
): string {
  if (evaluation.tipId === 10000) return '没有录到声音，请靠近麦克风再读一次。';
  if (evaluation.tipId === 10004) return '声音有点小，请靠近麦克风再读一次。';
  if (evaluation.tipId === 10005 || evaluation.tipId === 10008) {
    return '声音有点大，请离麦克风稍远一点再读一次。';
  }
  if (evaluation.tipId === 10006) return '周围有点吵，请在安静一点的地方再读一次。';
  if (evaluation.omissionType === 1 || evaluation.score === 0) {
    return '没有识别到完整的单词，请听清标准发音后再读一次。';
  }
  if (evaluation.score >= 85) return '读得很棒！';
  if (evaluation.score >= 75) return '读得很好！';
  if (evaluation.score >= 60) return '已经听清了，再读一次会更好。';
  return '已经识别到单词，再听一遍标准发音后重试吧。';
}

export function describeSpeechEvaluationFailure(raw: unknown): string {
  let payload: SpeechEvaluationFailurePayload = {};
  try {
    payload = (typeof raw === 'string' ? JSON.parse(raw) : raw) as SpeechEvaluationFailurePayload;
  } catch {
    return '这次发音没有评测成功，请重试。';
  }
  const errorCode = Number(payload?.errId);
  if (errorCode === 41030) return '语音评测授权无效（41030），请关闭后重新打开。';
  if (errorCode === 41035) return '当前应用尚未开通单词评测能力（41035）。';
  if (errorCode === 16385) return '无法连接语音评分服务器（16385），请重试。';
  if (errorCode === 16386) return '语音评分服务器响应超时（16386），请重试。';
  if (errorCode === 70001) return '语音评测组件需要升级（70001）。';
  if (Number.isFinite(errorCode)) return `这次发音没有评测成功（${errorCode}），请重试。`;
  return payload?.error?.trim() || '这次发音没有评测成功，请重试。';
}

let engineScriptPromise: Promise<AliyunEngineConstructor> | null = null;
let cachedWarrant: { deviceToken: string; warrant: SpeechEvaluationWarrant } | null = null;
let warrantRequest: { deviceToken: string; promise: Promise<SpeechEvaluationWarrant> } | null = null;

const PREPARATION_TIMEOUT_MS = 12_000;
const WARRANT_EXPIRY_MARGIN_MS = 60_000;

function expiryTimeMs(expiresAt: number): number {
  return expiresAt > 10_000_000_000 ? expiresAt : expiresAt * 1_000;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function loadAliyunEngine(): Promise<AliyunEngineConstructor> {
  if (window.EngineEvaluat) return Promise.resolve(window.EngineEvaluat);
  if (engineScriptPromise) return engineScriptPromise;

  const loadingPromise = new Promise<AliyunEngineConstructor>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-aliyun-speech-engine]');
    const script = existing ?? document.createElement('script');
    const finish = () => {
      if (window.EngineEvaluat) resolve(window.EngineEvaluat);
      else reject(new Error('阿里语音评测 SDK 未加载。'));
    };
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', () => reject(new Error('阿里语音评测 SDK 暂时不可用。')), { once: true });
    if (!existing) {
      script.src = `${import.meta.env.BASE_URL}sdk/engine.js`;
      script.async = true;
      script.dataset.aliyunSpeechEngine = 'true';
      document.head.append(script);
    }
  }).catch((error) => {
    engineScriptPromise = null;
    throw error;
  });
  engineScriptPromise = loadingPromise;
  return loadingPromise;
}

export async function getCachedSpeechEvaluationWarrant(
  deviceToken: string,
  requestImpl: (token: string) => Promise<SpeechEvaluationWarrant> = requestSpeechEvaluationWarrant,
  nowMs = Date.now(),
): Promise<SpeechEvaluationWarrant> {
  if (
    cachedWarrant?.deviceToken === deviceToken
    && expiryTimeMs(cachedWarrant.warrant.expiresAt) > nowMs + WARRANT_EXPIRY_MARGIN_MS
  ) {
    return cachedWarrant.warrant;
  }
  if (warrantRequest?.deviceToken === deviceToken) return warrantRequest.promise;

  const promise = requestImpl(deviceToken).then((warrant) => {
    cachedWarrant = { deviceToken, warrant };
    warrantRequest = null;
    return warrant;
  }).catch((error) => {
    warrantRequest = null;
    throw error;
  });
  warrantRequest = { deviceToken, promise };
  return promise;
}

export function resetPronunciationPreparationCacheForTests(): void {
  cachedWarrant = null;
  warrantRequest = null;
}

function invalidateCachedSpeechEvaluationWarrant(): void {
  cachedWarrant = null;
  warrantRequest = null;
}

export async function prepareWordPronunciation(): Promise<{
  EngineEvaluat: AliyunEngineConstructor;
  warrant: SpeechEvaluationWarrant;
}> {
  const metadata = await getOrCreateSyncMetadata();
  if (!metadata.deviceToken) {
    throw new Error('这台设备尚未连接学习服务器。');
  }
  const [EngineEvaluat, warrant] = await withTimeout(
    Promise.all([
      loadAliyunEngine(),
      getCachedSpeechEvaluationWarrant(metadata.deviceToken),
    ]),
    PREPARATION_TIMEOUT_MS,
    '连接语音老师超时，请检查网络后重试。',
  );
  return { EngineEvaluat, warrant };
}

export async function evaluateWordPronunciation(
  word: string,
  onState: (state: PronunciationPracticeState) => void,
): Promise<WordPronunciationEvaluation> {
  onState({ kind: 'preparing' });
  const { EngineEvaluat, warrant } = await prepareWordPronunciation();

  return new Promise((resolve, reject) => {
    let settled = false;
    let engine: AliyunEngineInstance | null = null;
    let engineReady = false;
    let microphoneReady = false;
    let recordingStarted = false;
    const settleFailure = (message: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      engine?.cancelRecord?.();
      reject(new Error(message));
    };
    const timeout = window.setTimeout(
      () => settleFailure('语音评测等待超时，请重试。'),
      18_000,
    );
    const settleSuccess = (raw: unknown) => {
      if (settled) return;
      try {
        const evaluation = parseWordPronunciationEvaluation(raw);
        console.info('[speech-evaluation]', {
          word,
          coreType: WORD_PRONUNCIATION_CORE_TYPE,
          ...evaluation,
        });
        settled = true;
        window.clearTimeout(timeout);
        resolve(evaluation);
      } catch (error) {
        settleFailure(error instanceof Error ? error.message : '语音评测结果无法识别。');
      }
    };

    const startWhenReady = () => {
      if (settled || recordingStarted || !engineReady || !microphoneReady || !engine) return;
      recordingStarted = true;
      onState({ kind: 'recording', volume: 0 });
      engine.startRecord(buildWordPronunciationRequest(word, warrant.warrantId));
      window.setTimeout(() => {
        if (!settled) onState({ kind: 'evaluating' });
      }, 5_200);
    };

    engine = new EngineEvaluat({
      applicationId: warrant.applicationId,
      userId: warrant.userId,
      warrantId: warrant.warrantId,
      logIsOpen: false,
      allowDynamicService: false,
      autoConnect: false,
      coreType: WORD_PRONUNCIATION_CORE_TYPE,
      engineFirstInitDone: () => {
        engineReady = true;
        startWhenReady();
      },
      engineBackResultDone: settleSuccess,
      engineBackResultFail: (raw: unknown) => {
        const message = describeSpeechEvaluationFailure(raw);
        if (message.includes('41030')) invalidateCachedSpeechEvaluationWarrant();
        settleFailure(message);
      },
      engineConnectTimeOut: () => settleFailure('连接语音评分服务器超时，请重试。'),
      engineServerTimeOut: () => settleFailure('语音评分服务器响应超时，请重试。'),
      micAllowCallback: () => {
        microphoneReady = true;
        startWhenReady();
      },
      micForbidCallback: () => settleFailure('麦克风权限未开启。'),
      micVolumeCallback: (value: unknown) => {
        const volume = Number(value);
        onState({ kind: 'recording', volume: Number.isFinite(volume) ? volume : 0 });
      },
      JSSDKNotSupport: () => settleFailure('当前浏览器不支持语音评测。'),
      noNetwork: () => settleFailure('网络暂时不可用。'),
      noWebsocketAddress: () => settleFailure('没有可用的语音评分服务器。'),
    });
  });
}
