import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DifficultyStars, formatDifficultyStars } from './DifficultyStars';

describe('DifficultyStars', () => {
  it('formats vocabulary difficulty as one to five stars', () => {
    expect(formatDifficultyStars(1)).toBe('★');
    expect(formatDifficultyStars(3)).toBe('★★★');
    expect(formatDifficultyStars(5)).toBe('★★★★★');
  });

  it('renders filled and empty stars with an accessible label', () => {
    const markup = renderToStaticMarkup(<DifficultyStars difficulty={3} />);

    expect(markup).toContain('aria-label="词库难度 3 星"');
    expect(markup).toContain('★★★');
    expect(markup).toContain('☆☆');
    expect(markup).not.toContain('Lv.3');
  });
});
