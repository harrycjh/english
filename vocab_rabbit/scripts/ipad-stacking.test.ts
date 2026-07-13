import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles/ipad.css', import.meta.url), 'utf8');

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
