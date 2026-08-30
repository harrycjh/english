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

  it('shows measurable cloud restore progress instead of an indefinite spinner', () => {
    const markup = renderToStaticMarkup(
      <StartupSyncPanel
        state={{ kind: 'checking' }}
        code=""
        progress={{
          phase: 'downloading',
          attempt: 1,
          loadedBytes: 524_288,
          totalBytes: 1_048_576,
        }}
        elapsedSeconds={12}
        onCodeChange={() => undefined}
        onConnect={() => undefined}
        onRetry={() => undefined}
        onEnterOffline={() => undefined}
      />,
    );

    expect(markup).toContain('正在恢复云端学习进度');
    expect(markup).toContain('50%');
    expect(markup).toContain('0.5 MB / 1.0 MB');
    expect(markup).toContain('已等待 12 秒');
    expect(markup).toContain('role="progressbar"');
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
