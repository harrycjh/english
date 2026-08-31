import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { formatElapsedTime, ProgressRing } from './ProgressRing';

describe('ProgressRing', () => {
  it('renders the shared learning progress as a horizontal bar', () => {
    const markup = renderToStaticMarkup(<ProgressRing value={3} total={10} />);

    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-label="学习进度"');
    expect(markup).toContain('aria-valuenow="3"');
    expect(markup).toContain('progress-ring__bar');
    expect(markup).toContain('width:30%');
    expect(markup).not.toContain('<svg');
  });

  it('renders the current session elapsed time beside the question count', () => {
    const markup = renderToStaticMarkup(<ProgressRing value={20} total={48} elapsedSeconds={125} />);

    expect(markup).toContain('20');
    expect(markup).toContain('/ 48');
    expect(markup).toContain('aria-label="本轮累计耗时 02:05"');
    expect(markup).toContain('lucide-clock-3');
    expect(markup).not.toContain('本次 02:05');
  });

  it('keeps hours when a session lasts longer than one hour', () => {
    expect(formatElapsedTime(3_661)).toBe('1:01:01');
  });
});
