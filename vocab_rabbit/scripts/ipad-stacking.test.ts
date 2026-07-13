import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles/ipad.css', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/app/App.tsx', import.meta.url), 'utf8');
const reviewSource = readFileSync(new URL('../src/screens/HomePage.tsx', import.meta.url), 'utf8');

function getZIndex(selector: string): number {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = css.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*z-index:\\s*(\\d+)`, 's'));
  if (!rule) {
    throw new Error(`No numeric z-index found for ${selector}`);
  }
  return Number(rule[1]);
}

describe('modal stacking', () => {
  it('keeps the word detail drawer above the fixed bottom dock', () => {
    expect(getZIndex('.word-detail-drawer-backdrop')).toBeGreaterThan(
      getZIndex('.app-bottom-dock'),
    );
  });
});

describe('fixed iPad shell', () => {
  it('uses one 1024 by 768 canvas for every device', () => {
    expect(css).toMatch(
      /:root\s*\{[^}]*--ipad-pro-11-landscape-width:\s*1024px;[^}]*--ipad-pro-11-landscape-height:\s*768px;[^}]*--ipad-shell-padding:\s*0px;[^}]*--ipad-shell-stage-width:\s*var\(--ipad-pro-11-landscape-width\);[^}]*--ipad-shell-stage-height:\s*var\(--ipad-pro-11-landscape-height\);/s,
    );
    expect(appSource).toContain('const shouldLockIpadShell = true;');
  });

  it('aligns every route dock to the review page baseline', () => {
    expect(css).toMatch(
      /html\[data-shell-mode='ipad-fixed'\] \.app-bottom-dock\s*\{[^}]*bottom:\s*28px;[^}]*width:\s*975px;[^}]*height:\s*77px;/s,
    );
    expect(css).toMatch(
      /html\[data-shell-mode='ipad-fixed'\] \.app-bottom-dock__button\s*\{[^}]*top:\s*14px;[^}]*width:\s*140px;[^}]*height:\s*48px;/s,
    );
  });

  it('uses the shared fixed dock on the review route too', () => {
    expect(appSource).toMatch(/<BottomDock\s+active="review"/s);
    expect(reviewSource).not.toContain('<nav className="home-dock review-dock"');
  });

  it('enlarges the active dock button without moving its anchor', () => {
    expect(css).toMatch(
      /html\[data-shell-mode='ipad-fixed'\] \.app-bottom-dock__button\.is-active\s*\{[^}]*z-index:\s*1;[^}]*transform:\s*scale\(1\.5\);/s,
    );
  });

  it('compensates for the wider settings active artwork', () => {
    expect(css).toMatch(
      /html\[data-shell-mode='ipad-fixed'\] \.app-bottom-dock__button:nth-child\(4\)\.is-active\s*\{[^}]*background-size:\s*auto 100%;/s,
    );
  });

  it('reduces inactive dock buttons by ten percent', () => {
    expect(css).toMatch(
      /html\[data-shell-mode='ipad-fixed'\] \.app-bottom-dock__button:not\(\.is-active\)\s*\{[^}]*transform:\s*scale\(0\.9\);/s,
    );
  });
});

describe('review preview atlas rendering', () => {
  it('uses cover-style atlas sizing in the portrait preview slot', () => {
    expect(css).toMatch(
      /\.page--review \.review-preview-card__word-image\.word-image--atlas\s*\{[^}]*background-size:\s*auto 300% !important;/s,
    );
  });

  it('centers preview images at seventy percent of the art slot', () => {
    expect(css).toMatch(
      /\.page--review \.review-preview-card__art\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s,
    );
    expect(css).toMatch(
      /\.page--review \.review-preview-card__word-image\s*\{[^}]*width:\s*70%;[^}]*height:\s*70%;[^}]*transform:\s*translateY\(-10px\);/s,
    );
    expect(css).toMatch(
      /\.page--review \.review-preview-card__art\s*\{[^}]*background:\s*transparent;/s,
    );
  });
});

describe('selection card image rendering', () => {
  it('centers images at seventy percent while preserving atlas proportions', () => {
    expect(css).toMatch(
      /\.page--selection \.selection-word-card__art img,\s*\.page--selection \.selection-word-card__art \.word-image--atlas\s*\{[^}]*width:\s*70%;[^}]*height:\s*70%;/s,
    );
    expect(css).toMatch(
      /\.page--selection \.selection-word-card__art \.word-image--atlas\s*\{[^}]*background-size:\s*auto 300% !important;/s,
    );
  });
});
