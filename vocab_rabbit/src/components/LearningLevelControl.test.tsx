import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LearningLevelControl } from './LearningLevelControl';

describe('LearningLevelControl', () => {
  it('shows the current level beside the audio action', () => {
    const markup = renderToStaticMarkup(
      <LearningLevelControl level={3} onAudio={() => undefined} />,
    );

    expect(markup).toContain('当前等级 3');
    expect(markup).toContain('Lv.3');
    expect(markup).toContain('播放英文发音');
    expect(markup).toContain('data-level="3"');
    expect(markup).toContain('/mastery-levels/level-3.webp?v=2');
  });

  it('overlays the next level without an arrow or upgrade badge', () => {
    const markup = renderToStaticMarkup(
      <LearningLevelControl level={3} upgradeTo={4} onAudio={() => undefined} />,
    );

    expect(markup).toContain('等级从 3 升级到 4');
    expect(markup).toContain('Lv.3');
    expect(markup).toContain('Lv.4');
    expect(markup).toContain('is-upgrading');
    expect(markup).toContain('data-next-level="4"');
    expect(markup).toContain('/mastery-levels/level-3.webp?v=2');
    expect(markup).toContain('/mastery-levels/level-4.webp?v=2');
    expect(markup).toContain('learning-level-control__level--current');
    expect(markup).toContain('learning-level-control__level--next');
    expect(markup).not.toContain('learning-level-control__arrow');
    expect(markup).not.toContain('>升级</i>');
  });
});
