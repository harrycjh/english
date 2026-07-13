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
  it('uses one 1194 by 834 iPad Pro canvas for every device', () => {
    expect(css).toMatch(
      /:root\s*\{[^}]*--ipad-pro-11-landscape-width:\s*1194px;[^}]*--ipad-pro-11-landscape-height:\s*834px;[^}]*--ipad-shell-padding:\s*0px;[^}]*--ipad-shell-stage-width:\s*var\(--ipad-pro-11-landscape-width\);[^}]*--ipad-shell-stage-height:\s*var\(--ipad-pro-11-landscape-height\);/s,
    );
    expect(appSource).toContain('const shouldLockIpadShell = true;');
    expect(css).toMatch(
      /\.page--selection \.selection-layout\s*\{[^}]*grid-template-columns:\s*250px minmax\(0, 1fr\) 242px;[^}]*gap:\s*18px;/s,
    );
    expect(css).toMatch(
      /html\[data-shell-mode='ipad-fixed'\] \.page::after\s*\{[^}]*inset:\s*0;[^}]*z-index:\s*70;[^}]*border:\s*3px solid rgba\(65, 43, 23, 0\.78\);[^}]*border-radius:\s*22px;/s,
    );
  });

  it('pins every route dock to the fixed iPad canvas instead of the browser viewport', () => {
    expect(css).toMatch(
      /html\[data-shell-mode='ipad-fixed'\] \.app-bottom-dock\s*\{[^}]*top:\s*calc\(var\(--ipad-shell-stage-height\) - 90px\);[^}]*bottom:\s*auto;[^}]*width:\s*1137px;[^}]*height:\s*90px;/s,
    );
    expect(css).toMatch(
      /html\[data-shell-mode='ipad-fixed'\] \.app-bottom-dock__button\s*\{[^}]*top:\s*16px;[^}]*width:\s*163px;[^}]*height:\s*56px;/s,
    );
  });

  it('uses the shared fixed dock on the review route too', () => {
    expect(appSource).toMatch(/<BottomDock\s+active="review"/s);
    expect(reviewSource).not.toContain('<nav className="home-dock review-dock"');
  });

  it('does not reserve a colored spacer beneath scrollable main-page content', () => {
    expect(css).not.toMatch(
      /html\[data-shell-mode='ipad-fixed'\] \.selection-mockup-frame,\s*html\[data-shell-mode='ipad-fixed'\] \.stats-mockup-frame,\s*html\[data-shell-mode='ipad-fixed'\] \.settings-mockup-frame\s*\{[^}]*padding-bottom:\s*96px;/s,
    );
  });

  it('does not cast a translucent overlay above the fixed dock', () => {
    expect(css).toMatch(
      /\.app-bottom-dock\s*\{[^}]*box-shadow:\s*inset 0 1px 0 rgba\(241, 214, 171, 0\.62\);/s,
    );
  });

  it('enlarges the active dock button without moving its anchor', () => {
    expect(css).toMatch(
      /html\[data-shell-mode='ipad-fixed'\] \.app-bottom-dock__button\.is-active\s*\{[^}]*z-index:\s*1;[^}]*transform:\s*scale\(1\.5\);/s,
    );
  });

  it('compensates for the wider settings active artwork', () => {
    expect(css).toMatch(
      /html\[data-shell-mode='ipad-fixed'\] \.app-bottom-dock__button:nth-child\(4\)\.is-active\s*\{[^}]*transform:\s*scale\(1\.725\);[^}]*background-size:\s*auto 100%;/s,
    );
  });

  it('reduces inactive dock buttons by twenty percent', () => {
    expect(css).toMatch(
      /html\[data-shell-mode='ipad-fixed'\] \.app-bottom-dock__button:not\(\.is-active\)\s*\{[^}]*transform:\s*scale\(0\.8\);/s,
    );
  });
});

describe('selection card actions', () => {
  it('keeps the action buttons clear after removing the Oxford Tree source line', () => {
    expect(css).toMatch(
      /\.page--selection \.selection-word-card__body\s*\{[^}]*height:\s*137px;/s,
    );
    expect(css).not.toContain('.page--selection .selection-word-card footer');
    expect(css).toMatch(
      /\.page--selection \.selection-word-card__actions\s*\{[^}]*padding:\s*0 11px 5px;/s,
    );
    expect(css).toMatch(
      /\.page--selection \.selection-word-card__actions \.secondary-button\s*\{[^}]*border:\s*1px solid rgba\(229, 198, 145, 0\.86\);[^}]*background:\s*rgba\(255, 255, 255, 0\.96\);/s,
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
