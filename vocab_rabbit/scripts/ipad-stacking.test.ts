import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles/ipad.css', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/app/App.tsx', import.meta.url), 'utf8');
const reviewSource = readFileSync(new URL('../src/screens/HomePage.tsx', import.meta.url), 'utf8');
const selectionSource = readFileSync(new URL('../src/screens/SelectionPage.tsx', import.meta.url), 'utf8');
const wordDetailSource = readFileSync(new URL('../src/components/WordDetailDrawer.tsx', import.meta.url), 'utf8');

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

describe('shared word detail drawer', () => {
  it('places a half-size primary image beside the word summary', () => {
    expect(wordDetailSource).toMatch(
      /const primaryMedia = \([\s\S]*word-detail-drawer__primary-media[\s\S]*const wordSummary = \([\s\S]*word-detail-drawer__summary[\s\S]*<h2>\{getStudyText\(word\)\}<\/h2>/,
    );
    expect(wordDetailSource).toMatch(
      /<section className="word-detail-drawer__hero">[\s\S]*\{primaryMedia\}[\s\S]*\{wordSummary\}/,
    );
    expect(css).toMatch(
      /\.word-detail-drawer__hero\s*\{[^}]*grid-template-columns:\s*150px minmax\(0, 1fr\);[^}]*gap:\s*20px;/s,
    );
    expect(css).toMatch(
      /\.word-detail-drawer__image,\s*\.word-detail-drawer__placeholder\s*\{[^}]*width:\s*150px;[^}]*height:\s*150px;[^}]*margin:\s*0;/s,
    );
  });

  it('does not repeat the Oxford Tree location below related media', () => {
    expect(wordDetailSource).not.toContain('牛津树定位');
    expect(wordDetailSource).not.toContain('getOxfordRefLabels');
  });

  it('renders Red Rocket pages from the compact related-media atlas', () => {
    expect(wordDetailSource).toContain('word-detail-drawer__red-rocket-image');
    expect(wordDetailSource).toContain('<strong>红火箭图</strong>');
    expect(css).toMatch(
      /\.word-detail-drawer__red-rocket-image\s*\{[^}]*width:\s*100%;[^}]*aspect-ratio:\s*1;/s,
    );
  });

  it('uses the review detail layout in both contexts', () => {
    expect(wordDetailSource).not.toContain('word-detail-drawer--selection');
    expect(wordDetailSource).not.toContain('word-detail-drawer__selection-overview');
    expect(wordDetailSource).not.toContain('word-detail-drawer__inline-examples');
    expect(css).not.toContain('.word-detail-drawer--selection');
    expect(css).not.toContain('.word-detail-drawer__selection-overview');
  });

  it('keeps learning and answer metrics on one compact row', () => {
    expect(css).toMatch(
      /\.word-detail-drawer__stats\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);[^}]*gap:\s*8px;/s,
    );
    expect(css).toMatch(
      /\.word-detail-drawer__stats article\s*\{[^}]*padding:\s*10px 8px;[^}]*border-radius:\s*14px;/s,
    );
    expect(css).toMatch(
      /\.word-detail-drawer__stats strong\s*\{[^}]*margin-top:\s*5px;[^}]*font-size:\s*18px;/s,
    );
  });
});

describe('selection one-screen layout', () => {
  it('keeps the complete vocabulary workspace above the fixed dock', () => {
    expect(css).toMatch(
      /html\[data-shell-mode='ipad-fixed'\] \.page--selection \.selection-layout\s*\{[^}]*flex:\s*0 0 654px;[^}]*height:\s*654px;[^}]*max-height:\s*654px;[^}]*overflow:\s*hidden;/s,
    );
    expect(css).toMatch(
      /\.page--selection \.selection-layout > \.section-block\s*\{[^}]*height:\s*644px;[^}]*max-height:\s*644px;[^}]*margin-top:\s*10px;[^}]*overflow:\s*hidden;/s,
    );
    expect(css).toMatch(
      /\.page--selection \.selection-bulk-actions\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*gap:\s*8px;[^}]*margin-top:\s*10px;/s,
    );
    expect(css).toMatch(
      /\.page--selection \.selection-word-row\s*\{[^}]*display:\s*grid;[^}]*height:\s*56px;[^}]*min-height:\s*56px;/s,
    );
    expect(css).toMatch(
      /\.page--selection \.selection-word-row__main\s*\{[^}]*grid-template-columns:\s*144px 44px minmax\(0, 1fr\) 32px;/s,
    );
    expect(selectionSource).not.toContain('getPrimaryOxfordRefLabel');
  });
});

describe('statistics reference layout', () => {
  it('keeps overview and diagnostics in a compact dashboard above the dock', () => {
    expect(css).toMatch(
      /\.page--stats \.stats-hero\s*\{[^}]*min-height:\s*176px;/s,
    );
    expect(css).toMatch(
      /\.page--stats \.stats-hero__art\s*\{[^}]*stats-rabbit-reading-v1\.webp[^}]*center\s*\/\s*cover\s+no-repeat/s,
    );
    expect(css).toMatch(
      /\.page--stats \.stats-hero__art\s*\{[^}]*-webkit-mask-image:\s*radial-gradient\([^;]+#000 0 56%[^;]+transparent 100%\);[^}]*mask-image:\s*radial-gradient\([^;]+#000 0 56%[^;]+transparent 100%\);/s,
    );
    expect(css).toMatch(
      /\.page--stats \.stats-hero__art\s*\{[^}]*box-shadow:\s*inset 0 0 34px 22px rgba\(255, 250, 240, 0\.97\);/s,
    );
    expect(css).toMatch(
      /\.page--stats \.stats-hero__aside\s*\{[^}]*stats-rhythm-house-v1\.webp[^}]*center\s*\/\s*cover\s+no-repeat;/s,
    );
    expect(css).toMatch(
      /\.page--stats \.stats-hero__focus-art\s*\{[^}]*display:\s*none;/s,
    );
    expect(css).toMatch(
      /\.page--stats \.review-dashboard,\s*\.page--stats \.stats-panel-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);[^}]*gap:\s*12px;/s,
    );
    expect(css).toMatch(
      /\.page--stats \.stats-panel\s*\{[^}]*height:\s*215px;[^}]*min-height:\s*215px;[^}]*max-height:\s*215px;[^}]*padding:\s*10px;[^}]*overflow:\s*hidden;/s,
    );
    expect(css).toMatch(
      /\.page--stats \.stats-panel-grid--events\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s,
    );
    expect(css).toMatch(
      /\.page--stats \.stats-panel-grid--events \.stats-panel\s*\{[^}]*height:\s*155px;[^}]*min-height:\s*155px;[^}]*max-height:\s*155px;/s,
    );
  });
});

describe('settings reference layout', () => {
  it('keeps the hero and all four settings groups visible above the dock', () => {
    expect(css).toMatch(
      /\.page--settings \.settings-hero\s*\{[^}]*min-height:\s*280px;[^}]*grid-template-columns:\s*207px minmax\(0, 1fr\) 370px;[^}]*gap:\s*18px;/s,
    );
    expect(css).toMatch(
      /\.page--settings \.settings-panel-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);[^}]*grid-template-areas:\s*'volume experience device danger';[^}]*gap:\s*12px;/s,
    );
    expect(css).toMatch(
      /\.page--settings \.settings-panel\s*\{[^}]*height:\s*390px;[^}]*min-height:\s*390px;[^}]*max-height:\s*390px;[^}]*margin:\s*0;[^}]*padding:\s*14px;/s,
    );
  });

  it('uses compact switch controls that preserve the existing setting actions', () => {
    expect(css).toMatch(
      /\.page--settings \.settings-toggle-button\s*\{[^}]*min-width:\s*36px;[^}]*width:\s*36px;[^}]*min-height:\s*20px;[^}]*height:\s*20px;/s,
    );
    expect(css).toMatch(
      /\.page--settings \.settings-toggle-button\.is-on::before\s*\{[^}]*transform:\s*translateX\(16px\);/s,
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
  it('uses the enlarged art slot while preserving atlas proportions', () => {
    expect(css).toMatch(
      /\.page--selection \.selection-word-card__content\s*\{[^}]*grid-template-columns:\s*78px minmax\(0, 1fr\);[^}]*margin-top:\s*7px;/s,
    );
    expect(css).toMatch(
      /\.page--selection \.selection-word-card__art\s*\{[^}]*height:\s*90px;/s,
    );
    expect(css).toMatch(
      /\.page--selection \.selection-word-card__copy\s*\{[^}]*margin-left:\s*10px;/s,
    );
    expect(css).toMatch(
      /\.page--selection \.selection-word-card__art img,\s*\.page--selection \.selection-word-card__art \.word-image--atlas\s*\{[^}]*width:\s*87\.5%;[^}]*height:\s*87\.5%;/s,
    );
    expect(css).toMatch(
      /\.page--selection \.selection-word-card__art \.word-image--atlas\s*\{[^}]*background-size:\s*auto 300% !important;/s,
    );
  });
});
