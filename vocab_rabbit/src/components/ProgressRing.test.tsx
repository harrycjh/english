import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProgressRing } from './ProgressRing';

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
});
