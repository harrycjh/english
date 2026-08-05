import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BACKPACK_ITEMS, DEFAULT_ITEM_ID } from '../src/services/backpack';

const css = readFileSync(new URL('../src/styles/ipad.css', import.meta.url), 'utf8');

/**
 * The catalogue names an art file and the stylesheet paints one, and nothing at
 * runtime connects the two — equip an item whose CSS rule was never written and
 * the page silently keeps the old picture. These read both sides and compare.
 */
describe('backpack art', () => {
  it('is painted by the stylesheet it claims to be painted by', () => {
    for (const item of BACKPACK_ITEMS) {
      if (item.id === DEFAULT_ITEM_ID) continue;
      const attribute = item.slot === 'mascot' ? 'data-mascot-scene' : 'data-focus-scene';
      const selector = `[${attribute}='${item.id}']`;
      const ruleStart = css.indexOf(selector);
      expect(ruleStart, `${item.id} has no ${attribute} rule`).toBeGreaterThan(-1);

      const rule = css.slice(ruleStart, css.indexOf('}', ruleStart));
      expect(rule, `${item.id} rule does not use ${item.artFile}`).toContain(item.artFile!);
    }
  });

  it('paints equipped items after the per-profile art, so a choice wins', () => {
    // Equal specificity, so this is decided by source order alone.
    const lastProfileRule = css.lastIndexOf("[data-profile='stinky-dog'] .review-dom-surface::before");
    const firstSceneRule = css.indexOf('[data-mascot-scene=');

    expect(lastProfileRule).toBeGreaterThan(-1);
    expect(firstSceneRule).toBeGreaterThan(lastProfileRule);
  });

  it('ships every art file it advertises', () => {
    for (const item of BACKPACK_ITEMS) {
      if (!item.artFile) continue;
      const path = new URL(`../public/design-reference/slices/${item.artFile}`, import.meta.url);
      expect(() => readFileSync(path), `${item.id} art is missing`).not.toThrow();
    }
  });
});
