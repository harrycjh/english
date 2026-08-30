import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import {
  connectDeviceForBackgroundSync,
  hasConnectedDevice,
  installResumeSyncListeners,
  performStartupSyncWithRetry,
  restoreEmptyDeviceFromCloud,
  type StartupSyncProgress,
  type StartupSyncResult,
} from '../services/startup-sync-service';

type StartupSyncViewState = StartupSyncResult | { kind: 'checking' } | { kind: 'connecting' };

interface StartupSyncPanelProps {
  state: StartupSyncViewState;
  code: string;
  onCodeChange: (value: string) => void;
  onConnect: () => void;
  onRetry: () => void;
  onEnterOffline: () => void;
  progress?: StartupSyncProgress | null;
  elapsedSeconds?: number;
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function getProgressCopy(progress: StartupSyncProgress): string {
  if (progress.phase === 'downloading') return '正在下载云端学习记录';
  if (progress.phase === 'applying') return '正在写入本地学习空间';
  return '服务器正在整理学习记录';
}

export function StartupSyncPanel({
  state,
  code,
  onCodeChange,
  onConnect,
  onRetry,
  onEnterOffline,
  progress = null,
  elapsedSeconds = 0,
}: StartupSyncPanelProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onConnect();
  }

  if (state.kind === 'checking' || state.kind === 'connecting') {
    const percentage = progress?.phase === 'downloading' && progress.totalBytes
      ? Math.min(100, Math.round((progress.loadedBytes / progress.totalBytes) * 100))
      : null;
    return (
      <main className="page page--status sync-gate-page">
        <section className="status-card sync-gate-card" aria-live="polite">
          <span className="sync-gate-card__mark" aria-hidden="true">VR</span>
          <h1>{progress ? '正在恢复云端学习进度' : state.kind === 'connecting' ? '正在验证设备' : '正在打开学习空间'}</h1>
          {progress ? (
            <div className="sync-gate-progress-wrap">
              <p>{getProgressCopy(progress)}</p>
              <div
                className={`sync-gate-progress${percentage === null ? ' is-indeterminate' : ''}`}
                role="progressbar"
                aria-label={getProgressCopy(progress)}
                aria-valuemin={0}
                aria-valuemax={100}
                {...(percentage === null ? {} : { 'aria-valuenow': percentage })}
              >
                <span style={percentage === null ? undefined : { width: `${percentage}%` }} />
              </div>
              <div className="sync-gate-progress__meta">
                <span>{percentage === null ? `第 ${progress.attempt}/3 次尝试` : `${percentage}%`}</span>
                <span>
                  {progress.phase === 'downloading' && progress.totalBytes
                    ? `${formatMegabytes(progress.loadedBytes)} / ${formatMegabytes(progress.totalBytes)}`
                    : `已等待 ${elapsedSeconds} 秒`}
                </span>
              </div>
              {progress.phase === 'downloading' && progress.totalBytes && (
                <p className="sync-gate-progress__elapsed">已等待 {elapsedSeconds} 秒</p>
              )}
            </div>
          ) : (
            <>
              <p>{state.kind === 'connecting' ? '验证成功后立即进入，同步会在后台继续。' : '正在读取这台设备的连接状态。'}</p>
              <span className="sync-gate-spinner" aria-hidden="true" />
            </>
          )}
        </section>
      </main>
    );
  }

  if (state.kind === 'needs-code') {
    return (
      <main className="page page--status sync-gate-page">
        <section className="status-card sync-gate-card">
          <span className="sync-gate-card__mark" aria-hidden="true">VR</span>
          <h1>连接学习进度</h1>
          <p>首次在这台设备使用，请输入家庭验证码。验证码只用于连接设备，不会保存在本地。</p>
          <form className="sync-gate-form" onSubmit={handleSubmit}>
            <label htmlFor="family-sync-code">家庭验证码</label>
            <input
              id="family-sync-code"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => onCodeChange(event.currentTarget.value)}
            />
            {state.message && <p className="sync-gate-message sync-gate-message--error" role="alert">{state.message}</p>}
            <button className="primary-button" type="submit" disabled={!code.trim()}>连接并进入</button>
          </form>
          <button className="secondary-button" type="button" onClick={onEnterOffline}>暂时离线进入</button>
        </section>
      </main>
    );
  }

  if (state.kind === 'unavailable') {
    return (
      <main className="page page--status sync-gate-page">
        <section className="status-card status-card--error sync-gate-card" role="alert">
          <span className="sync-gate-card__mark" aria-hidden="true">VR</span>
          <h1>服务器暂时不可用</h1>
          <p>{state.message}</p>
          <p>可以离线进入并继续学习，新进度会留在本机，下次连接成功时自动合并。</p>
          <div className="sync-gate-actions">
            <button className="primary-button" type="button" onClick={onRetry}>重试同步</button>
            <button className="secondary-button" type="button" onClick={onEnterOffline}>离线进入</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page page--status sync-gate-page">
      <section className="status-card status-card--error sync-gate-card" role="alert">
        <span className="sync-gate-card__mark" aria-hidden="true">VR</span>
        <h1>暂时无法同步</h1>
        <p>{state.kind === 'blocked' ? state.message : '同步状态异常，请重试。'}</p>
        <button className="primary-button" type="button" onClick={onRetry}>重试同步</button>
      </section>
    </main>
  );
}

export type BackgroundSyncState = StartupSyncResult;

export function BackgroundSyncNotice({
  state,
  onRetry,
  onReconnect,
}: {
  state: BackgroundSyncState;
  onRetry: () => void;
  onReconnect: () => void;
}) {
  if (state.kind === 'synced') {
    return null;
  }

  if (state.kind === 'needs-code') {
    return (
      <aside className="background-sync-notice background-sync-notice--error" role="status" aria-live="polite">
        <span>云端连接已失效，本地学习不受影响。</span>
        <button type="button" onClick={onReconnect}>重新连接</button>
      </aside>
    );
  }

  return (
    <aside className="background-sync-notice background-sync-notice--error" role="status" aria-live="polite">
      <span>{state.message} 本地学习不受影响。</span>
      <button type="button" onClick={onRetry}>重试</button>
    </aside>
  );
}

interface StartupSyncGateProps {
  children: (
    syncRevision: number,
    requestSync: () => Promise<StartupSyncResult>,
  ) => ReactNode;
}

export function StartupSyncGate({ children }: StartupSyncGateProps) {
  const [state, setState] = useState<StartupSyncViewState>({ kind: 'checking' });
  const [code, setCode] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [backgroundState, setBackgroundState] = useState<BackgroundSyncState | null>(null);
  const [syncRevision, setSyncRevision] = useState(0);
  const [restoreProgress, setRestoreProgress] = useState<StartupSyncProgress | null>(null);
  const [restoreElapsedSeconds, setRestoreElapsedSeconds] = useState(0);
  const activeSync = useRef<Promise<StartupSyncResult> | null>(null);
  const queuedSync = useRef<Promise<StartupSyncResult> | null>(null);

  async function runBackgroundSync(): Promise<StartupSyncResult> {
    if (activeSync.current) {
      if (!queuedSync.current) {
        const currentSync = activeSync.current;
        queuedSync.current = currentSync.then(() => {
          queuedSync.current = null;
          return runBackgroundSync();
        });
      }
      return queuedSync.current;
    }

    setBackgroundState(null);
    const syncTask = performStartupSyncWithRetry();
    activeSync.current = syncTask;
    try {
      const result = await syncTask;
      if (result.kind === 'synced') {
        setSyncRevision((revision) => revision + 1);
      } else {
        setBackgroundState(result);
      }
      return result;
    } finally {
      activeSync.current = null;
    }
  }

  async function checkConnection() {
    setState({ kind: 'checking' });
    if (await hasConnectedDevice()) {
      await enterConnectedDevice();
      return;
    }
    setState({ kind: 'needs-code' });
  }

  async function enterConnectedDevice() {
    setRestoreElapsedSeconds(0);
    setRestoreProgress({ phase: 'requesting', attempt: 1, loadedBytes: 0, totalBytes: null });
    const restoreResult = await restoreEmptyDeviceFromCloud(fetch, setRestoreProgress);
    setRestoreProgress(null);
    if (restoreResult) {
      if (restoreResult.kind === 'synced') {
        setSyncRevision((revision) => revision + 1);
        setIsReady(true);
      } else {
        setState(restoreResult);
      }
      return;
    }

    setIsReady(true);
    void runBackgroundSync();
  }

  useEffect(() => {
    void checkConnection();
  }, []);

  useEffect(() => {
    if (!restoreProgress) return undefined;
    const timer = window.setInterval(() => {
      setRestoreElapsedSeconds((seconds) => seconds + 1);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [Boolean(restoreProgress)]);

  useEffect(() => {
    if (!isReady) return undefined;
    const removeResumeListeners = installResumeSyncListeners(() => runBackgroundSync());
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && window.navigator.onLine) void runBackgroundSync();
    }, 60_000);
    return () => {
      removeResumeListeners();
      window.clearInterval(timer);
    };
  }, [isReady]);

  async function handleConnect() {
    if (!code.trim()) return;
    setState({ kind: 'connecting' });
    const result = await connectDeviceForBackgroundSync(code.trim());
    if (result.kind === 'connected') {
      setCode('');
      await enterConnectedDevice();
      return;
    }
    setState(result);
  }

  if (isReady) {
    return (
      <>
        {children(syncRevision, runBackgroundSync)}
        {backgroundState && (
          <BackgroundSyncNotice
            state={backgroundState}
            onRetry={() => void runBackgroundSync()}
            onReconnect={() => {
              setBackgroundState(null);
              setState({ kind: 'needs-code', message: '请重新输入家庭验证码。' });
              setIsReady(false);
            }}
          />
        )}
      </>
    );
  }

  return (
    <StartupSyncPanel
      state={state}
      code={code}
      onCodeChange={setCode}
      onConnect={() => void handleConnect()}
      onRetry={() => code.trim() ? void handleConnect() : void checkConnection()}
      onEnterOffline={() => setIsReady(true)}
      progress={restoreProgress}
      elapsedSeconds={restoreElapsedSeconds}
    />
  );
}
