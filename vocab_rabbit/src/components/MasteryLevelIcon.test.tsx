import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MasteryLevelIcon } from './MasteryLevelIcon';

describe('MasteryLevelIcon', () => {
  it('renders all nine learning-level variants', () => {
    for (let level = 1; level <= 9; level += 1) {
      const markup = renderToStaticMarkup(<MasteryLevelIcon level={level} />);
      expect(markup).toContain(`mastery-level-icon--level-${level}`);
      expect(markup).toContain(`aria-label="学习等级 ${level}"`);
      expect(markup).toContain(`/mastery-levels/level-${level}.webp?v=2`);
      expect(markup).toContain(`>Lv.${level}</span>`);
    }
  });

  it('uses a neutral new-word icon before level one', () => {
    const markup = renderToStaticMarkup(<MasteryLevelIcon level={0} />);
    expect(markup).toContain('mastery-level-icon--level-0');
    expect(markup).toContain('aria-label="尚未学习"');
    expect(markup).toContain('>未学</span>');
  });
});
