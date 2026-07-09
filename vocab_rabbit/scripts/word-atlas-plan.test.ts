import { describe, expect, it } from 'vitest';
import { createWordAtlasPlan } from './word-atlas-plan.mjs';

describe('createWordAtlasPlan', () => {
  it('chunks each category independently into stable 3x3 atlases', () => {
    const words = Array.from({ length: 11 }, (_, index) => ({
      id: `food-${index}`,
      category: '食物和饮料',
      imagePath: `/content/images/words/food-${index}.webp`,
    })).concat({
      id: 'family-0',
      category: '家人和朋友',
      imagePath: '/content/images/words/family-0.webp',
    });

    const plan = createWordAtlasPlan(words);

    expect(plan.atlases.map((atlas) => atlas.entries.length)).toEqual([9, 2, 1]);
    expect(plan.atlases[0].entries[4]).toMatchObject({
      imagePath: '/content/images/words/food-4.webp',
      row: 1,
      column: 1,
      x: 512,
      y: 512,
    });
    expect(plan.atlases[2].category).toBe('家人和朋友');
    expect(plan.entries).toHaveLength(12);
  });
});
