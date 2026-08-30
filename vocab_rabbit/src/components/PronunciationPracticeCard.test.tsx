import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PronunciationPracticeCard } from './PronunciationPracticeCard';

describe('PronunciationPracticeCard', () => {
  it('shows the target word and asks the learner to follow-read before continuing', () => {
    const markup = renderToStaticMarkup(
      <PronunciationPracticeCard
        word="rabbit"
        phonetic="/ˈræbɪt/"
        state={{ kind: 'ready' }}
        onStart={() => undefined}
        onRetry={() => undefined}
        onContinue={() => undefined}
        onSkip={() => undefined}
      />,
    );

    expect(markup).toContain('跟着读一遍');
    expect(markup).toContain('rabbit');
    expect(markup).toContain('/ˈræbɪt/');
    expect(markup).toContain('开始跟读');
    expect(markup).not.toContain('>继续<');
  });

  it('allows continuation after one scored attempt even when the score is low', () => {
    const markup = renderToStaticMarkup(
      <PronunciationPracticeCard
        word="rabbit"
        phonetic="/ˈræbɪt/"
        state={{ kind: 'complete', score: 42 }}
        onStart={() => undefined}
        onRetry={() => undefined}
        onContinue={() => undefined}
        onSkip={() => undefined}
      />,
    );

    expect(markup).toContain('42');
    expect(markup).toContain('再读一次');
    expect(markup).toContain('>继续<');
  });

  it('shows the diagnostic feedback returned for a zero score', () => {
    const markup = renderToStaticMarkup(
      <PronunciationPracticeCard
        word="rabbit"
        state={{ kind: 'complete', score: 0, feedback: '没有录到声音，请再读一次。' }}
        onStart={() => undefined}
        onRetry={() => undefined}
        onContinue={() => undefined}
        onSkip={() => undefined}
      />,
    );

    expect(markup).toContain('没有录到声音，请再读一次。');
    expect(markup).not.toContain('已经完成，可以再试一次');
  });

  it('offers retry and skip actions when evaluation is unavailable', () => {
    const markup = renderToStaticMarkup(
      <PronunciationPracticeCard
        word="rabbit"
        state={{ kind: 'unavailable', message: '这次发音没有评测成功，请重试。' }}
        onStart={() => undefined}
        onRetry={() => undefined}
        onContinue={() => undefined}
        onSkip={() => undefined}
      />,
    );

    expect(markup).toContain('重新跟读');
    expect(markup).toContain('暂时跳过');
  });

  it('shows a live multi-bar voice meter while recording', () => {
    const markup = renderToStaticMarkup(
      <PronunciationPracticeCard
        word="rabbit"
        state={{ kind: 'recording', volume: 12 }}
        onStart={() => undefined}
        onRetry={() => undefined}
        onContinue={() => undefined}
        onSkip={() => undefined}
      />,
    );

    expect(markup).toContain('aria-label="已收到声音"');
    expect(markup.match(/animation-delay/g)).toHaveLength(9);
  });
});
