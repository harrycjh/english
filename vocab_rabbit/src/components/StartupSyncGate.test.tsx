import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BackgroundSyncNotice, StartupSyncPanel } from './StartupSyncGate';

describe('StartupSyncPanel', () => {
  it('asks for the family code on a new device', () => {
    const markup = renderToStaticMarkup(
      <StartupSyncPanel
        state={{ kind: 'needs-code' }}
        code=""
        onCodeChange={() => undefined}
        onConnect={() => undefined}
        onRetry={() => undefined}
        onEnterOffline={() => undefined}
      />,
    );

    expect(markup).toContain('连接学习进度');
    expect(markup).toContain('家庭验证码');
    expect(markup).toContain('暂时离线进入');
  });

  it('offers retry and offline entry when the server is unavailable', () => {
    const markup = renderToStaticMarkup(
      <StartupSyncPanel
        state={{ kind: 'unavailable', message: '服务器不可用' }}
        code=""
        onCodeChange={() => undefined}
        onConnect={() => undefined}
        onRetry={() => undefined}
        onEnterOffline={() => undefined}
      />,
    );

    expect(markup).toContain('服务器暂时不可用');
    expect(markup).toContain('重试同步');
    expect(markup).toContain('离线进入');
  });

  it('renders background sync failure as a non-blocking retry notice', () => {
    const markup = renderToStaticMarkup(
      <BackgroundSyncNotice
        state={{ kind: 'unavailable', message: '服务器不可用' }}
        onRetry={() => undefined}
        onReconnect={() => undefined}
      />,
    );

    expect(markup).toContain('本地学习不受影响');
    expect(markup).toContain('重试');
    expect(markup).not.toContain('离线进入');
  });

  it('does not render syncing progress or success notices', () => {
    const markup = renderToStaticMarkup(
      <BackgroundSyncNotice
        state={{ kind: 'synced', serverTime: '2026-07-22T10:00:00.000Z' }}
        onRetry={() => undefined}
        onReconnect={() => undefined}
      />,
    );

    expect(markup).toBe('');
    expect(markup).not.toContain('正在后台同步学习进度');
    expect(markup).not.toContain('学习进度已合并');
  });
});
