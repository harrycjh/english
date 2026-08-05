import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles/ipad.css', import.meta.url), 'utf8');
const reviewSource = readFileSync(new URL('../src/screens/HomePage.tsx', import.meta.url), 'utf8');

function selectorsForChevron(): string[] {
  // The chevron is one shared rule, drawn as two rotated borders. Read back
  // whatever it is currently attached to rather than assuming the shape of
  // the selector list.
  const rules = /((?:\.page--review [^{}]*::after,?\s*)+)\{([^}]*)\}/g;
  const selectors: string[] = [];
  for (let match = rules.exec(css); match; match = rules.exec(css)) {
    const cardRule = /review-(?:metric|advice)-card/.test(match[1]);
    const chevron = match[2].includes('rotate(45deg)') && match[2].includes('border-right');
    if (!cardRule || !chevron) continue;
    selectors.push(...match[1].split(',').map((selector) => selector.trim()).filter(Boolean));
  }
  if (selectors.length === 0) {
    throw new Error('Could not find the review-page chevron rule');
  }
  return selectors;
}

describe('review card affordances', () => {
  it('only draws the chevron on cards that open something', () => {
    // The heatmap card is an <article> with no onClick. A chevron on it is a
    // promise the card cannot keep, and it costs the picture 95px of room.
    const selectors = selectorsForChevron();

    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(`${selector} → ${selector.includes('.is-actionable')}`).toBe(`${selector} → true`);
    }
  });

  it('centres the heatmap inside its card', () => {
    const rule = /\.page--review \.review-metric-card--heatmap \{([^}]*)\}/.exec(css)?.[1] ?? '';

    expect(rule).toMatch(/display:\s*flex/);
    expect(rule).toMatch(/align-items:\s*center/);
    expect(rule).toMatch(/justify-content:\s*center/);
    // Asymmetric padding would pull the block off centre no matter what the
    // flexbox says.
    const padding = /padding:\s*([^;]+);/.exec(rule)?.[1].trim().split(/\s+/) ?? [];
    expect(padding).toHaveLength(2);
  });

  it('lets the heatmap grid take its own width instead of stretching', () => {
    // `1fr` columns make the grid as wide as the card was authored, which is
    // what left the picture hugging the left edge.
    const grid = /\.page--review \.review-reference-heatmap__grid \{([^}]*)\}/.exec(css)?.[1] ?? '';
    const weekdays = /\.page--review \.review-reference-heatmap__weekdays \{([^}]*)\}/.exec(css)?.[1] ?? '';

    expect(grid).toMatch(/grid-template-columns:\s*repeat\(7,\s*(\d+)px\)/);
    expect(weekdays).toMatch(/grid-template-columns:\s*repeat\(7,\s*(\d+)px\)/);
    // Both rows have to keep the same rhythm or the weekday letters drift off
    // the squares they label.
    expect(/grid-template-columns:\s*repeat\(7,\s*(\d+)px\)/.exec(grid)?.[1]).toBe(
      /grid-template-columns:\s*repeat\(7,\s*(\d+)px\)/.exec(weekdays)?.[1],
    );
  });

  it('renders the wrapper the centring rules are written against', () => {
    // Nothing at runtime connects the markup to the stylesheet: rename one
    // side and the card silently goes back to sitting on the left.
    const centred = [...css.matchAll(/\.page--review (\.review-metric-card__[\w-]+)/g)]
      .map((match) => match[1])
      .filter((selector) => selector.includes('heatmap'));

    expect(centred.length).toBeGreaterThan(0);
    for (const selector of new Set(centred)) {
      const className = selector.slice(1);
      expect(`${className} → ${reviewSource.includes(className)}`).toBe(`${className} → true`);
    }
  });
});
