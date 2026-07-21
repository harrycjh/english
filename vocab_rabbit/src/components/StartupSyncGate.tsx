import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import {
  connectDeviceForBackgroundSync,
  hasConnectedDevice,
  performStartupSync,
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
}

export function StartupSyncPanel({
  state,
  code,
  onCodeChange,
  onConnect,
  onRetry,
  onEnterOffline,
}: StartupSyncPanelProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onConnect();
  }

  if (state.kind === 'checking' || state.kind === 'connecting') {
    return (
      <main className="page page--status sync-gate-page">
        <section className="status-card sync-gate-card" aria-live="polite">
          <span className="sync-gate-card__mark" aria-hidden="true">VR</span>
          <h1>{state.kind === 'connecting' ? '正在验证设备' : '正在打开学习空间'}</h1>
          <p>{state.kind === 'connecting' ? '验证成功后立即进入，同步会在后台继续。' : '正在读取这台设备的连接状态。'}</p>
          <span className="sync-gate-spinner" aria-hidden="true" />
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

export type BackgroundSyncState = StartupSyncResult | { kind: 'syncing' };

export function BackgroundSyncNotice({
  state,
  onRetry,
  onReconnect,
}: {
  state: BackgroundSyncState;
  onRetry: () => void;
  onReconnect: () => void;
}) {
  if (state.kind === 'syncing') {
    return (
      <aside className="background-sync-notice" role="status" aria-live="polite">
        <span className="background-sync-notice__spinner" aria-hidden="true" />
        <span>正在后台同步学习进度…</span>
      </aside>
    );
  }

  if (state.kind === 'synced') {
    return (
      <aside className="background-sync-notice background-sync-notice--success" role="status" aria-live="polite">
        <span aria-hidden="true">✓</span>
        <span>学习进度已合并</span>
      </aside>
    );
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
  const hideNoticeTimer = useRef<number | null>(null);

  function clearNoticeTimer() {
    if (hideNoticeTimer.current !== null) {
      window.clearTimeout(hideNoticeTimer.current);
      hideNoticeTimer.current = null;
    }
  }

  async function runBackgroundSync(): Promise<StartupSyncResult> {
    clearNoticeTimer();
    setBackgroundState({ kind: 'syncing' });
    const result = await performStartupSync();
    setBackgroundState(result);
    if (result.kind === 'synced') {
      setSyncRevision((revision) => revision + 1);
      hideNoticeTimer.current = window.setTimeout(() => setBackgroundState(null), 2_500);
    }
    return result;
  }

  async function checkConnection() {
    setState({ kind: 'checking' });
    if (await hasConnectedDevice()) {
      setIsReady(true);
      void runBackgroundSync();
      return;
    }
    setState({ kind: 'needs-code' });
  }

  useEffect(() => {
    void checkConnection();
    return clearNoticeTimer;
  }, []);

  async function handleConnect() {
    if (!code.trim()) return;
    setState({ kind: 'connecting' });
    const result = await connectDeviceForBackgroundSync(code.trim());
    if (result.kind === 'connected') {
      setIsReady(true);
      setCode('');
      void runBackgroundSync();
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
              clearNoticeTimer();
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
    />
  );
}
