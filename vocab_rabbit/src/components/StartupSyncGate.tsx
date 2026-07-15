import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import {
  connectAndSynchronize,
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
          <h1>{state.kind === 'connecting' ? '正在连接学习进度' : '正在同步学习进度'}</h1>
          <p>完成本地与云端合并后再进入今天的学习。</p>
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
            <button className="primary-button" type="submit" disabled={!code.trim()}>连接并同步</button>
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

export function StartupSyncGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StartupSyncViewState>({ kind: 'checking' });
  const [code, setCode] = useState('');
  const [isReady, setIsReady] = useState(false);

  async function runSync() {
    setState({ kind: 'checking' });
    const result = await performStartupSync();
    if (result.kind === 'synced') {
      setIsReady(true);
      return;
    }
    setState(result);
  }

  useEffect(() => {
    void runSync();
  }, []);

  async function handleConnect() {
    if (!code.trim()) return;
    setState({ kind: 'connecting' });
    const result = await connectAndSynchronize(code.trim());
    if (result.kind === 'synced') {
      setIsReady(true);
      return;
    }
    setState(result);
  }

  if (isReady) {
    return children;
  }

  return (
    <StartupSyncPanel
      state={state}
      code={code}
      onCodeChange={setCode}
      onConnect={() => void handleConnect()}
      onRetry={() => void runSync()}
      onEnterOffline={() => setIsReady(true)}
    />
  );
}
