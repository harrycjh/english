import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StartupSyncPanel } from './StartupSyncGate';

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
});
