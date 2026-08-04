import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IPAD_STAGE_HEIGHT, IPAD_STAGE_WIDTH, type ShellStageLayout } from './ipad-viewport';
import {
  LAYOUT_PREVIEW_EVENT,
  LAYOUT_PREVIEW_OPTIONS,
  LAYOUT_PREVIEW_STORAGE_KEY,
  applyLayoutPreview,
  isLayoutPreview,
  readLayoutPreview,
  writeLayoutPreview,
} from './layout-preview';

const MATE_X5_STAGE_HEIGHT = 1063;

function baseLayout(overrides: Partial<ShellStageLayout> = {}): ShellStageLayout {
  return {
    rotation: 0,
    scale: 1,
    stageWidth: IPAD_STAGE_WIDTH,
    stageHeight: IPAD_STAGE_HEIGHT,
    ...overrides,
  };
}

describe('LAYOUT_PREVIEW_OPTIONS', () => {
  it('offers the two stages the app actually produces', () => {
    expect(LAYOUT_PREVIEW_OPTIONS.map((option) => [option.id, option.stageWidth, option.stageHeight])).toEqual([
      ['ipad', 1194, 834],
      ['mate-x5', 1194, 1063],
    ]);
  });
});

describe('applyLayoutPreview', () => {
  it('leaves the measured layout alone on auto', () => {
    const layout = baseLayout({ scale: 0.7, stageHeight: 900 });
    expect(applyLayoutPreview(layout, 'auto', 832, 741)).toBe(layout);
  });

  it('pins the iPad stage and refits it to a Mate X5 screen', () => {
    const measured = baseLayout({ scale: 0.697, stageHeight: MATE_X5_STAGE_HEIGHT });
    const previewed = applyLayoutPreview(measured, 'ipad', 832, 741);

    expect(previewed.stageWidth).toBe(1194);
    expect(previewed.stageHeight).toBe(834);
    // Width-bound, exactly the letterboxed fit the app had before it grew.
    expect(previewed.scale).toBeCloseTo(832 / 1194, 6);
  });

  it('pins the Mate X5 stage and refits it to an iPad screen', () => {
    const previewed = applyLayoutPreview(baseLayout(), 'mate-x5', 1194, 834);

    expect(previewed.stageHeight).toBe(MATE_X5_STAGE_HEIGHT);
    // Height-bound now: the taller stage no longer fits the iPad's short edge.
    expect(previewed.scale).toBeCloseTo(834 / MATE_X5_STAGE_HEIGHT, 6);
  });

  it('never upscales a stage past its authored size', () => {
    expect(applyLayoutPreview(baseLayout(), 'ipad', 3000, 2000).scale).toBe(1);
  });

  it('swaps the axes for a rotated stage so a portrait screen still fits', () => {
    const rotated = baseLayout({ rotation: 90 });
    const previewed = applyLayoutPreview(rotated, 'mate-x5', 741, 832);

    expect(previewed.rotation).toBe(90);
    // 741x832 rotated means 832 of width and 741 of height are available.
    expect(previewed.scale).toBeCloseTo(Math.min(832 / 1194, 741 / MATE_X5_STAGE_HEIGHT), 6);
  });

  it('keeps the measured layout when the viewport has not been measured', () => {
    const layout = baseLayout();
    expect(applyLayoutPreview(layout, 'mate-x5', 0, 0)).toBe(layout);
  });
});

describe('isLayoutPreview', () => {
  it('accepts only the known modes', () => {
    expect(isLayoutPreview('auto')).toBe(true);
    expect(isLayoutPreview('ipad')).toBe(true);
    expect(isLayoutPreview('mate-x5')).toBe(true);
    expect(isLayoutPreview('iphone')).toBe(false);
    expect(isLayoutPreview(null)).toBe(false);
  });
});

describe('readLayoutPreview / writeLayoutPreview', () => {
  const store = new Map<string, string>();
  let dispatched: Event[] = [];

  beforeEach(() => {
    // The suite runs in node, so stand in for just the bits of `window` the
    // override touches rather than pulling in a DOM implementation.
    store.clear();
    dispatched = [];
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
      dispatchEvent: (event: Event) => {
        dispatched.push(event);
        return true;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to auto and round-trips a device', () => {
    expect(readLayoutPreview()).toBe('auto');

    writeLayoutPreview('mate-x5');
    expect(store.get(LAYOUT_PREVIEW_STORAGE_KEY)).toBe('mate-x5');
    expect(readLayoutPreview()).toBe('mate-x5');
  });

  it('clears the key on auto so a stale override cannot survive', () => {
    writeLayoutPreview('ipad');
    writeLayoutPreview('auto');

    expect(store.has(LAYOUT_PREVIEW_STORAGE_KEY)).toBe(false);
    expect(readLayoutPreview()).toBe('auto');
  });

  it('ignores a corrupted stored value', () => {
    store.set(LAYOUT_PREVIEW_STORAGE_KEY, 'macbook');
    expect(readLayoutPreview()).toBe('auto');
  });

  it('falls back to auto when storage throws', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
      },
      dispatchEvent: () => true,
    });

    expect(readLayoutPreview()).toBe('auto');
  });

  it('still announces the change when storage refuses to persist', () => {
    const seen: Event[] = [];
    vi.stubGlobal('window', {
      localStorage: {
        setItem: () => {
          throw new Error('blocked');
        },
      },
      dispatchEvent: (event: Event) => {
        seen.push(event);
        return true;
      },
    });

    writeLayoutPreview('ipad');
    expect(seen).toHaveLength(1);
  });

  it('announces the change so the shell can resync without a reload', () => {
    writeLayoutPreview('ipad');

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].type).toBe(LAYOUT_PREVIEW_EVENT);
  });
});
