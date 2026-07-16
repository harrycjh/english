import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BottomDock } from './BottomDock';

describe('BottomDock', () => {
  it('renders every navigation item with the same icon and live-label structure', () => {
    const markup = renderToStaticMarkup(
      <BottomDock
        active="review"
        onOpenReview={() => undefined}
        onOpenSelection={() => undefined}
        onOpenStats={() => undefined}
        onOpenSettings={() => undefined}
      />,
    );

    expect(markup.match(/app-bottom-dock__button/g)).toHaveLength(4);
    expect(markup.match(/app-bottom-dock__icon/g)).toHaveLength(4);
    expect(markup.match(/app-bottom-dock__label/g)).toHaveLength(4);
    expect(markup.match(/app-bottom-dock__indicator"/g)).toHaveLength(1);
    expect(markup).toContain('--dock-active-index:0');
    expect(markup).toContain('aria-current="page"');
    expect(markup).not.toContain('review-dock-');
  });
});
