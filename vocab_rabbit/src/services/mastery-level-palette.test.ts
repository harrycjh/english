import { describe, expect, it } from 'vitest';
import { getMasteryLevelColor, MASTERY_LEVEL_COLORS } from './mastery-level-palette';

describe('mastery level palette', () => {
  it('uses the shared statistics colors for every learning level', () => {
    expect(MASTERY_LEVEL_COLORS).toHaveLength(11);
    expect(getMasteryLevelColor(0)).toBe('#b8ad9b');
    expect(getMasteryLevelColor(2)).toBe('#72b86b');
    expect(getMasteryLevelColor(3)).toBe('#51a8d8');
    expect(getMasteryLevelColor(10)).toBe('#2f8f46');
  });

  it('clamps levels outside the supported range', () => {
    expect(getMasteryLevelColor(-1)).toBe(MASTERY_LEVEL_COLORS[0]);
    expect(getMasteryLevelColor(99)).toBe(MASTERY_LEVEL_COLORS[10]);
  });
});
