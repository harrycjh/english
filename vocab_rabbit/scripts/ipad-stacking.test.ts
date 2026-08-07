import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles/ipad.css', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/app/App.tsx', import.meta.url), 'utf8');
const reviewSource = readFileSync(new URL('../src/screens/HomePage.tsx', import.meta.url), 'utf8');
const checkInPageSource = readFileSync(new URL('../src/screens/CheckInPage.tsx', import.meta.url), 'utf8');
const selectionSource = readFileSync(new URL('../src/screens/SelectionPage.tsx', import.meta.url), 'utf8');
const wordDetailSource = readFileSync(new URL('../src/components/WordDetailDrawer.tsx', import.meta.url), 'utf8');
const newWordQueueSource = readFileSync(new URL('../src/components/NewWordQueueDrawer.tsx', import.meta.url), 'utf8');
const reviewQueueSource = readFileSync(new URL('../src/components/ReviewQueueDrawer.tsx', import.meta.url), 'utf8');
const inertialScrollSource = readFileSync(
  new URL('../src/hooks/useInertialHorizontalScroll.ts', import.meta.url),
  'utf8',
);

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
  it('renders preview source tags as colored outlines without a fill', () => {
    expect(css).toMatch(
      /\.page--review \.review-preview-card__source-tag\s*\{[^}]*height:\s*18px;[^}]*border:\s*1\.5px solid currentColor;[^}]*background:\s*transparent;[^}]*text-shadow:\s*none;[^}]*box-shadow:\s*none;/s,
    );
    expect(css).toMatch(
      /\.review-preview-card__source-tag--yellow\s*\{[^}]*color:\s*#[0-9a-f]{6};[^}]*\}/s,
    );
    expect(css).toMatch(
      /\.review-preview-card__source-tag--green\s*\{[^}]*color:\s*#[0-9a-f]{6};[^}]*\}/s,
    );
    expect(css).toMatch(
      /\.review-preview-card__source-tag--red\s*\{[^}]*color:\s*#[0-9a-f]{6};[^}]*\}/s,
    );
    expect(css).toMatch(
      /\.review-preview-card__source-tag--blue\s*\{[^}]*color:\s*#[0-9a-f]{6};[^}]*\}/s,
    );
  });

  it('leaves room for English descenders above the Chinese subtitle', () => {
    expect(css).toMatch(
      /\.page--review \.review-preview-card__body strong\s*\{[^}]*line-height:\s*1\.12;[^}]*\}/s,
    );
    expect(css).toMatch(
      /\.page--review \.review-preview-card__body p\s*\{[^}]*margin:\s*7px 0 0;[^}]*\}/s,
    );
  });

  it('uses one 1194 by 834 iPad Pro canvas for every device', () => {
    expect(css).toMatch(
      /:root\s*\{[^}]*--ipad-pro-11-landscape-width:\s*1194px;[^}]*--ipad-pro-11-landscape-height:\s*834px;[^}]*--ipad-shell-padding:\s*0px;[^}]*--ipad-shell-stage-width:\s*var\(--ipad-pro-11-landscape-width\);[^}]*--ipad-shell-stage-height:\s*var\(--ipad-pro-11-landscape-height\);/s,
    );
    expect(appSource).toContain('const shouldLockIpadShell = true;');
    expect(css).toMatch(
      /\.page--selection \.selection-layout\s*\{[^}]*grid-template-columns:\s*250px minmax\(0, 1fr\) 242px;[^}]*gap:\s*18px;/s,
    );
    expect(css).not.toMatch(
      /html\[data-shell-mode='ipad-fixed'\] \.page::after\s*\{/,
    );
  });

  it('pins every route dock to the fixed iPad canvas instead of the browser viewport', () => {
    expect(css).toMatch(
      /html\[data-shell-mode='ipad-fixed'\] \.app-bottom-dock\s*\{[^}]*top:\s*calc\(var\(--ipad-shell-stage-height\) - 93px\);[^}]*bottom:\s*auto;[^}]*width:\s*var\(--ipad-shell-stage-width\);[^}]*height:\s*90px;[^}]*border-radius:\s*0;/s,
    );
    expect(css).toMatch(
      /html\[data-shell-mode='ipad-fixed'\] \.app-bottom-dock__button\s*\{[^}]*top:\s*13px;[^}]*width:\s*215px;[^}]*height:\s*64px;/s,
    );
  });

  it('uses the shared fixed dock on the review route too', () => {
    expect(appSource.match(/<BottomDock\b/g)).toHaveLength(1);
    expect(appSource).toContain("const activeDock = currentMainRoute === 'home' ? 'review' : currentMainRoute;");
    expect(appSource).toMatch(/<BottomDock\s+active=\{activeDock\}/s);
    expect(reviewSource).not.toContain('<nav className="home-dock review-dock"');
  });

  it('shows the external home button only on the review route', () => {
    expect(appSource).toContain("root.dataset.appRoute = loading || error ? 'status' : route;");
    expect(css).toMatch(
      /html\[data-app-route='home'\] #homeBtn\s*\{[^}]*display:\s*flex;/s,
    );
  });

  it('opens check-in as a full route instead of a side drawer', () => {
    expect(reviewSource).not.toContain('<CheckInCalendarDrawer');
    expect(reviewSource).toContain('onClick={onOpenCheckIn}');
    expect(appSource).toMatch(
      /async function handleComplete[\s\S]*?setSessionResult\(result\);[\s\S]*?setRoute\('checkIn'\)/,
    );
    expect(appSource).toMatch(
      /async function handleCheckIn[\s\S]*?checkedInAt:[\s\S]*?saveDailyTask\(checkedInTask\)/,
    );
    expect(css).toMatch(
      /\.page--check-in\s*\{[^}]*width:\s*100%;[^}]*min-height:\s*100%;[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;/s,
    );
    expect(css).toMatch(
      /\.check-in-page__stamp-button\s*\{[^}]*border-radius:\s*50%;[^}]*cursor:\s*pointer;/s,
    );
    expect(css).toMatch(
      /\.check-in-page__back\s*\{[^}]*transform:\s*translate\(20px, 20px\);/s,
    );
    expect(css).toMatch(
      /\.check-in-page__stamp-wrap\s*\{[^}]*transform:\s*translateY\(30px\);/s,
    );
    expect(css).toMatch(
      /\.check-in-page__totals\s*\{[^}]*transform:\s*translateY\(60px\);/s,
    );
    expect(css).toMatch(
      /\.check-in-page__action-stack\s*\{[^}]*transform:\s*translateY\(40px\);/s,
    );
    expect(css).toMatch(
      /\.check-in-page__reward-timeline\s*\{[^}]*position:\s*relative;[^}]*display:\s*grid;/s,
    );
    expect(css).toMatch(
      /\.check-in-page__reward-timeline\s*\{[^}]*margin-top:\s*24px;/s,
    );
    expect(css).toMatch(
      /\.check-in-page__reward-track\s*\{[^}]*overflow-x:\s*auto;[^}]*touch-action:\s*pan-x;[^}]*cursor:\s*grab;/s,
    );
    expect(css).toMatch(
      /\.check-in-page__reward-track\s*\{[^}]*-webkit-overflow-scrolling:\s*touch;/s,
    );
    expect(css).toMatch(
      /\.check-in-page__reward-track\s*\{[^}]*scrollbar-width:\s*none;/s,
    );
    expect(checkInPageSource).not.toContain('ZoomIn');
    expect(css).toMatch(
      /\.check-in-page__reward-thumb\s*\{[^}]*width:\s*120px;[^}]*\}/s,
    );
    expect(css).toMatch(
      /\.check-in-page__reward-thumb img\s*\{[^}]*display:\s*block;[^}]*width:\s*100%;[^}]*height:\s*auto;[^}]*object-fit:\s*contain;/s,
    );
    expect(css).toMatch(
      /\.check-in-page__reward-copy\s*\{[^}]*justify-items:\s*center;[^}]*text-align:\s*center;/s,
    );
    expect(css).toMatch(
      /\.check-in-page__reward-preview\s*\{[^}]*grid-template-rows:\s*auto auto;/s,
    );
    expect(css).toMatch(
      /\.check-in-page__reward-preview > img\s*\{[^}]*height:\s*auto;[^}]*object-fit:\s*contain;/s,
    );
    expect(css).toMatch(
      /\.check-in-page__reward-preview > div\s*\{[^}]*align-items:\s*center;[^}]*text-align:\s*center;/s,
    );
    expect(css).toMatch(
      /\.check-in-page__reward-strip\s*\{[^}]*display:\s*grid;/s,
    );
    expect(css).toMatch(
      /\.check-in-page__reward-stops\s*\{[^}]*display:\s*flex;/s,
    );
    expect(css).toMatch(
      /\.check-in-page__reward-progress\s*\{[^}]*width:\s*100%;[^}]*height:\s*22px;/s,
    );
    expect(css).toMatch(
      /\.check-in-page__reward-progress > strong\s*\{[^}]*top:\s*8px;[^}]*line-height:\s*1\.2;/s,
    );
    expect(checkInPageSource).toMatch(
      /className="check-in-page__reward-strip"[\s\S]*className="check-in-page__reward-stops"[\s\S]*className="check-in-page__reward-progress"/s,
    );
    expect(inertialScrollSource).toContain('window.requestAnimationFrame(glide)');
    expect(inertialScrollSource).toContain('velocity *= Math.pow(0.96');
    expect(inertialScrollSource).toContain("window.matchMedia('(prefers-reduced-motion: reduce)')");
    const pointerDownSource = /function handlePointerDown[\s\S]*?\n  \}/
      .exec(inertialScrollSource)?.[0] ?? '';
    expect(pointerDownSource).not.toContain('setPointerCapture');
    expect(inertialScrollSource).toMatch(
      /function handlePointerMove[\s\S]*?if \(!didMouseDragRef\.current && Math\.abs\(totalDistance\) > 4\) \{[\s\S]*?setPointerCapture\(event\.pointerId\)/,
    );
    expect(css).toMatch(
      /\.check-in-page__layout\s*\{[^}]*align-items:\s*start;[^}]*min-height:\s*526px;/s,
    );
    expect(css).toMatch(
      /\.check-in-page__reward-lightbox\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;/s,
    );
  });

  it('keeps one shared top chrome outside the moving route layers', () => {
    expect(appSource.match(/<MainShellChrome\b/g)).toHaveLength(1);
    expect(appSource).toMatch(/<MainShellChrome[\s\S]*?<div className="main-route-stage"/);
    expect(css).toMatch(
      /\.main-route-stage :is\([\s\S]*?\.settings-shell__chrome[\s\S]*?visibility:\s*hidden !important;/,
    );
    expect(css).toMatch(
      /\.main-shell-chrome\s*\{[^}]*position:\s*fixed;[^}]*top:\s*18px;[^}]*z-index:\s*120;/s,
    );
  });

  it('does not leave the previous route page background covering the incoming page', () => {
    expect(css).toMatch(
      /\.main-route-layer--previous\s*>\s*\.page\s*\{[^}]*background:\s*transparent !important;/s,
    );
  });

  it('moves the review mascot feathering layer with the mascot artwork', () => {
    for (const transition of ['enter-forward', 'exit-forward', 'enter-backward', 'exit-backward']) {
      expect(css).toMatch(
        new RegExp(`\\.main-route-layer--${transition} \\.review-dom-surface::before,\\s*\\.main-route-layer--${transition} \\.review-dom-surface::after`),
      );
    }
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

  it('keeps the level 1 answer content lifted and shrinks only portrait level 2 reveals', () => {
    expect(css).toMatch(
      /html\[data-shell-mode='ipad-fixed'\] \.question-panel--level-1 \.question-panel__answer-column\s*\{[^}]*transform:\s*translateY\(-50px\);/s,
    );
    expect(css).toMatch(
      /html\[data-shell-mode='ipad-fixed'\] \.question-panel--level-2\.is-life-photo-reveal\.is-portrait-life-photo \.image-stage__image\s*\{[^}]*inset:\s*7\.5%;[^}]*width:\s*85%;[^}]*height:\s*85%;/s,
    );
  });

  it('stretches the Red Rocket result to match the level 6 word card height', () => {
    expect(css).toMatch(
      /\.question-panel--letter-choice > \.question-red-rocket-result\s*\{[^}]*align-self:\s*stretch;[^}]*height:\s*100%;[^}]*margin:\s*0;/s,
    );
  });

  it('uses one restrained active scale for every dock button', () => {
    expect(css).toMatch(
      /html\[data-shell-mode='ipad-fixed'\] \.app-bottom-dock__button\.is-active\s*\{[^}]*z-index:\s*1;[^}]*transform:\s*scale\(1\.06\);/s,
    );
  });

  it('does not give the settings button a special active size', () => {
    expect(css).not.toMatch(
      /html\[data-shell-mode='ipad-fixed'\] \.app-bottom-dock__button:nth-child\(4\)\.is-active/,
    );
  });

  it('keeps every inactive dock button at the same base size', () => {
    expect(css).toMatch(
      /html\[data-shell-mode='ipad-fixed'\] \.app-bottom-dock__button:not\(\.is-active\)\s*\{[^}]*transform:\s*none;/s,
    );
    expect(css).toMatch(
      /html\[data-shell-mode='ipad-fixed'\] \.app-bottom-dock__icon\s*\{[^}]*width:\s*43px;[^}]*height:\s*43px;/s,
    );
    expect(css).toMatch(
      /html\[data-shell-mode='ipad-fixed'\] \.app-bottom-dock__label\s*\{[^}]*font-size:\s*29px;/s,
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

  it('renders Red Rocket and RAZ pages from compact related-media atlases', () => {
    expect(wordDetailSource).toContain('word-detail-drawer__red-rocket-image');
    expect(wordDetailSource).toContain('<strong>红火箭</strong>');
    expect(wordDetailSource).toContain('word-detail-drawer__raz-image');
    expect(wordDetailSource).toContain('<strong>RAZ</strong>');
    expect(wordDetailSource).toContain('word-detail-drawer__related-heading');
    expect(wordDetailSource).toContain('word-detail-drawer__related-translation');
    expect(css).toMatch(
      /\.word-detail-drawer__red-rocket-image,\s*\.word-detail-drawer__raz-image\s*\{[^}]*width:\s*100%;[^}]*aspect-ratio:\s*1;/s,
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
    expect(selectionSource).toContain('className="selection-source-levels"');
    expect(css).toMatch(
      /\.page--selection \.selection-source-levels\s*\{[^}]*display:\s*grid;[^}]*border-radius:\s*14px;/s,
    );
    expect(css).toMatch(
      /\.page--selection \.selection-source-levels__chip\.is-active\s*\{[^}]*background:/s,
    );
    expect(css).toMatch(
      /\.page--selection \.selection-source-levels__chips\s*\{[^}]*flex-wrap:\s*wrap;[^}]*overflow:\s*visible;/s,
    );
    expect(css).toMatch(
      /\.page--selection \.selection-source-levels__chip\.is-active\s*\{[^}]*background:\s*linear-gradient\(135deg, #ffbd57, #f28b1d\);/s,
    );
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
  it('keeps the hero, unified settings panel, and data panel visible above the dock', () => {
    expect(css).toMatch(
      /\.page--settings \.settings-hero\s*\{[^}]*min-height:\s*280px;[^}]*grid-template-columns:\s*207px minmax\(0, 1fr\) 370px;[^}]*gap:\s*18px;/s,
    );
    expect(css).toMatch(
      /\.page--settings \.settings-panel-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 3fr\) minmax\(0, 1fr\);[^}]*grid-template-areas:\s*'combined danger';[^}]*gap:\s*12px;/s,
    );
    expect(css).toMatch(
      /\.page--settings \.settings-panel\s*\{[^}]*height:\s*390px;[^}]*min-height:\s*390px;[^}]*max-height:\s*390px;[^}]*margin:\s*0;[^}]*padding:\s*14px;/s,
    );
    expect(css).toMatch(
      /\.page--settings \.settings-unified-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/s,
    );
    expect(css).toMatch(
      /\.page--settings \.settings-unified-confirm\s*\{[^}]*position:\s*absolute;[^}]*right:\s*14px;[^}]*bottom:\s*14px;/s,
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
  it('keeps every atlas cell on the shared square image viewport', () => {
    expect(css).not.toMatch(
      /\.page--review \.review-preview-card__word-image\.word-image--atlas\s*\{[^}]*background-size:/s,
    );
  });

  it('centers preview images in a square viewport at seventy percent of the art slot', () => {
    expect(css).toMatch(
      /\.page--review \.review-preview-card__art\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s,
    );
    expect(css).toMatch(
      /\.page--review \.review-preview-card__word-image\s*\{[^}]*width:\s*70%;[^}]*height:\s*auto;[^}]*aspect-ratio:\s*1;[^}]*object-fit:\s*contain;[^}]*transform:\s*translateY\(-10px\) scale\(var\(--review-preview-image-scale, 1\)\);/s,
    );
    expect(css).toMatch(
      /\.page--review \.review-preview-card__art\s*\{[^}]*background:\s*transparent;/s,
    );
  });
});

describe('review focus title sizing', () => {
  it('reduces the focus title by two pixels from the shared title token', () => {
    expect(css).toMatch(
      /\.page--review \.review-focus-card strong\s*\{[^}]*font-size:\s*calc\(var\(--review-size-focus-title\) - 2px\);[^}]*letter-spacing:\s*0;[^}]*white-space:\s*nowrap;/s,
    );
  });
});

describe('unlearned mastery tag alignment', () => {
  it('centers the unlearned label without the shared one-pixel offset', () => {
    expect(css).toMatch(
      /\.mastery-level-icon--level-0 \.mastery-level-icon__label\s*\{[^}]*align-self:\s*stretch;[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;[^}]*transform:\s*none;/s,
    );
  });
});

describe('paired queue and word detail drawers', () => {
  it('anchors queues left and keeps the right detail interactive above them', () => {
    expect(css).toMatch(
      /\.new-word-queue-backdrop\s*\{[^}]*justify-content:\s*flex-start;/s,
    );
    expect(css).toMatch(
      /\.word-detail-drawer-backdrop--queue-companion\s*\{[^}]*z-index:\s*250;[^}]*pointer-events:\s*none;[^}]*background:\s*transparent;/s,
    );
    expect(css).toMatch(
      /\.word-detail-drawer-backdrop--queue-companion \.word-detail-drawer\s*\{[^}]*pointer-events:\s*auto;/s,
    );
  });

  it('keeps both queue drawers sharp and the same width as the word detail drawer', () => {
    expect(css).toMatch(/--word-side-drawer-width:\s*460px;/);
    expect(css).toMatch(
      /\.word-detail-drawer\s*\{[^}]*width:\s*min\(var\(--word-side-drawer-width\), 100%\);/s,
    );
    expect(css).toMatch(
      /\.new-word-queue\s*\{[^}]*width:\s*min\(var\(--word-side-drawer-width\), 100%\);/s,
    );
    expect(css).not.toMatch(
      /\.new-word-queue-backdrop\s*\{[^}]*backdrop-filter:/s,
    );
    expect(newWordQueueSource).toContain("document.querySelector('.ipad-stage-shell')");
    expect(reviewQueueSource).toContain("document.querySelector('.ipad-stage-shell')");
  });

  it('opens the new-word queue on the review sheet and stacks level above stars in review rows', () => {
    expect(reviewSource).toContain("openSideDrawer('newWord')");
    expect(reviewSource).toContain('<NewWordQueueDrawer');
    expect(appSource).not.toContain('function handleOpenNewWordQueue()');
    expect(reviewQueueSource).toMatch(
      /<div className="new-word-queue__progress">[\s\S]*<MasteryLevelIcon[\s\S]*<DifficultyStars/,
    );
    expect(css).toMatch(
      /\.new-word-queue__progress\s*\{[^}]*display:\s*grid;[^}]*gap:\s*4px;[^}]*flex:\s*0 0 54px;/s,
    );
  });

  it('uses only left-side semantic artwork in the advice cards', () => {
    expect(reviewSource).toContain('<CalendarDays');
    expect(reviewSource).not.toContain('review-advice-card__art');
    expect(css).toMatch(
      /\.page--review \.review-advice-card--bag \.review-advice-card__icon\s*\{[^}]*background-image:\s*url\('\/design-reference\/slices\/review-bag-art\.png\?v=4'\);/s,
    );
  });

  it('lists words completed today beneath both pending queues', () => {
    expect(newWordQueueSource).toContain('<h3>今日新学习</h3>');
    expect(newWordQueueSource).toContain('completedTodayWordIds.map');
    expect(reviewQueueSource).toContain('<h3>今日已复习</h3>');
    expect(reviewQueueSource).toContain('completedWordIds.map');
  });
});

describe('review row framing and card copy alignment', () => {
  it('removes the large section border while keeping individual cards', () => {
    expect(css).toMatch(
      /\.page--review \.review-panel\s*\{[^}]*padding:\s*0;[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s,
    );
  });

  it('moves preview copy down five pixels without moving the mastery tag', () => {
    expect(css).toMatch(
      /\.page--review \.review-preview-card__body\s*\{[^}]*transform:\s*translateY\(5px\);/s,
    );
    expect(css).toMatch(
      /\.page--review \.review-preview-card__pos\s*\{[^}]*transform:\s*translateY\(5px\);/s,
    );
    expect(css).not.toMatch(
      /\.page--review \.review-preview-card__favorite\s*\{[^}]*translateY\(5px\)/s,
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
