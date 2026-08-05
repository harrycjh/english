import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BACKPACK_ITEMS, DEFAULT_ITEM_ID, getFocusSceneBackground } from '../src/services/backpack';

const css = readFileSync(new URL('../src/styles/ipad.css', import.meta.url), 'utf8');
const reviewSource = readFileSync(new URL('../src/screens/HomePage.tsx', import.meta.url), 'utf8');

/**
 * The catalogue names an art file and the stylesheet paints one, and nothing at
 * runtime connects the two — equip an item whose CSS rule was never written and
 * the page silently keeps the old picture. These read both sides and compare.
 */
describe('backpack art', () => {
  it('paints every mascot scene from the stylesheet', () => {
    // Mascot art sits behind a feathered mask, so each picture is framed by
    // hand and earns its own rule. Focus scenes are drawn to one spec and are
    // driven from the catalogue instead — see below.
    for (const item of BACKPACK_ITEMS) {
      if (item.slot !== 'mascot' || item.id === DEFAULT_ITEM_ID) continue;
      const selector = `[data-mascot-scene='${item.id}']`;
      const ruleStart = css.indexOf(selector);
      expect(ruleStart, `${item.id} has no data-mascot-scene rule`).toBeGreaterThan(-1);

      const rule = css.slice(ruleStart, css.indexOf('}', ruleStart));
      expect(rule, `${item.id} rule does not use ${item.artFile}`).toContain(item.artFile!);
    }
  });

  it('builds every focus scene from the catalogue, with no rule to forget', () => {
    for (const item of BACKPACK_ITEMS) {
      if (item.slot !== 'focus') continue;
      const background = getFocusSceneBackground(item, 'cute-junjun');
      if (item.id === DEFAULT_ITEM_ID) {
        // The free scene is the card's own art; overriding it would only
        // repaint what is already there.
        expect(background).toBeNull();
        continue;
      }
      expect(background, `${item.id} paints nothing`).toContain(item.artFile!);
      expect(background).toContain('cover');
    }
  });

  it('hands that background to the card through the variable the rule reads', () => {
    // A rename on either side leaves the card painting the default art for
    // every scene, which looks like nothing happened rather than like a bug.
    expect(reviewSource).toContain('--focus-scene-background');
    expect(css).toMatch(/\.review-focus-card \{[^}]*background:\s*var\(--focus-scene-background/);
  });

  it('scrims borrowed art, and leaves art drawn to spec alone', () => {
    // The scrim exists to keep the text legible over a picture that was never
    // asked to leave room. Art that was asked does not need it, and laying one
    // over it only washes the picture out.
    for (const item of BACKPACK_ITEMS) {
      if (item.slot !== 'focus' || item.id === DEFAULT_ITEM_ID) continue;
      const background = getFocusSceneBackground(item, 'cute-junjun')!;
      const scrimmed = background.includes('96deg');
      expect(`${item.id}: ${scrimmed}`).toBe(`${item.id}: ${!item.hasBuiltInMargin}`);
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
