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
