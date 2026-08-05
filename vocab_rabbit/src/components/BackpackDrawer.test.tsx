import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BackpackDrawer } from './BackpackDrawer';

function render(totalCheckInDays: number, mascotSceneId = 'default', focusSceneId = 'default'): string {
  return renderToStaticMarkup(
    <BackpackDrawer
      isOpen
      profileId="cute-junjun"
      totalCheckInDays={totalCheckInDays}
      mascotSceneId={mascotSceneId}
      focusSceneId={focusSceneId}
      onEquip={() => {}}
      onClose={() => {}}
    />,
  );
}

describe('BackpackDrawer', () => {
  it('stays out of the way until it is opened', () => {
    const markup = renderToStaticMarkup(
      <BackpackDrawer
        isOpen={false}
        profileId="cute-junjun"
        totalCheckInDays={99}
        mascotSceneId="default"
        focusSceneId="default"
        onEquip={() => {}}
        onClose={() => {}}
      />,
    );

    expect(markup).toBe('');
  });

  it('sorts items into the two things they dress', () => {
    const markup = render(99);

    // Matched against the heading itself: `toContain('伙伴')` would also pass
    // on 小屋伙伴 or 每日伙伴, which is the string this test exists to pin.
    expect(markup).toMatch(/<h3[^>]*>伙伴<\/h3>/);
    expect(markup).toMatch(/<h3[^>]*>小屋背景<\/h3>/);
    expect(markup).toContain('data-slot="mascot"');
    expect(markup).toContain('data-slot="focus"');
  });

  it('shows locked art with the days still to go, rather than hiding it', () => {
    const markup = render(0);
    const reading = /<button[^>]*data-item-id="reading"[\s\S]*?<\/button>/.exec(markup)?.[0] ?? '';

    expect(reading).toContain('is-locked');
    expect(reading).toContain('disabled');
    expect(reading).toContain('还需 3 天签到');
    // The picture is the reason to come back, so it is still painted.
    expect(reading).toContain('stats-rabbit-reading-v1.webp');
  });

  it('counts down the days left, not the price', () => {
    const reading = /<button[^>]*data-item-id="reading"[\s\S]*?<\/button>/.exec(render(1))?.[0] ?? '';

    expect(reading).toContain('还需 2 天签到');
  });

  it('opens a locked item up the day it is earned', () => {
    const reading = /<button[^>]*data-item-id="reading"[\s\S]*?<\/button>/.exec(render(3))?.[0] ?? '';

    expect(reading).not.toContain('is-locked');
    expect(reading).not.toContain('disabled');
    expect(reading).toContain('在窗边把绘本读完');
  });

  it('marks the item each slot is wearing', () => {
    const markup = render(99, 'cyber', 'kennel');
    const cyber = /<button[^>]*data-item-id="cyber"[\s\S]*?<\/button>/.exec(markup)?.[0] ?? '';
    const kennel = /<button[^>]*data-item-id="kennel"[\s\S]*?<\/button>/.exec(markup)?.[0] ?? '';
    const meadow = /<button[^>]*data-item-id="meadow"[\s\S]*?<\/button>/.exec(markup)?.[0] ?? '';

    expect(cyber).toContain('aria-pressed="true"');
    expect(kennel).toContain('aria-pressed="true"');
    expect(meadow).toContain('aria-pressed="false"');
  });

  it('does not mark an unearned item as worn, whatever the settings say', () => {
    const cyber = /<button[^>]*data-item-id="cyber"[\s\S]*?<\/button>/.exec(render(3, 'cyber'))?.[0] ?? '';

    expect(cyber).toContain('aria-pressed="false"');
  });

  it('counts the collection against everything there is to collect', () => {
    expect(render(0)).toContain('已收集 2 / 7 件');
    expect(render(99)).toContain('已收集 7 / 7 件');
  });

  it('previews the free companion with the art the current profile wears', () => {
    const markup = renderToStaticMarkup(
      <BackpackDrawer
        isOpen
        profileId="stinky-dog"
        totalCheckInDays={0}
        mascotSceneId="default"
        focusSceneId="default"
        onEquip={() => {}}
        onClose={() => {}}
      />,
    );

    expect(markup).toContain('review-dog-scene-v1.webp');
  });
});
