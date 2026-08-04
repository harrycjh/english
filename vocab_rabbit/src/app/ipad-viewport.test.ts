import { describe, expect, it } from 'vitest';
import {
  calculateIpadStageScale,
  calculateShellRotation,
  calculateStageLayout,
  getConservativeViewportLength,
  getStableViewportLength,
  isStandaloneIpad,
  MAX_STAGE_GROWTH,
  measureShellViewport,
} from './ipad-viewport';

describe('getConservativeViewportLength', () => {
  it('uses the smallest valid measurement when WebKit viewport APIs disagree', () => {
    expect(getConservativeViewportLength(834, 784, 834)).toBe(784);
  });

  it('ignores temporary invalid measurements during app restoration', () => {
    expect(getConservativeViewportLength(undefined, 0, 784)).toBe(784);
  });
});

describe('getStableViewportLength', () => {
  it('keeps the full device measurement when a restored WebKit viewport is temporarily shorter', () => {
    expect(getStableViewportLength(1194, 1122, 1194)).toBe(1194);
  });
});

describe('isStandaloneIpad', () => {
  it('recognizes an installed iPad app even when iPadOS reports MacIntel', () => {
    expect(isStandaloneIpad({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit',
      platform: 'MacIntel',
      maxTouchPoints: 5,
      standalone: true,
      displayModeInstalled: false,
    })).toBe(true);
  });

  it('does not use the installed-iPad sizing path for a desktop browser', () => {
    expect(isStandaloneIpad({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit',
      platform: 'MacIntel',
      maxTouchPoints: 0,
      standalone: false,
      displayModeInstalled: false,
    })).toBe(false);
  });
});

describe('calculateIpadStageScale', () => {
  it('keeps the fixed iPad stage at full size when it fits', () => {
    expect(calculateIpadStageScale(1194, 834)).toBe(1);
    expect(calculateIpadStageScale(1210, 964)).toBe(1);
  });

  it('shrinks the whole stage when an iPad resume leaves less visible height', () => {
    expect(calculateIpadStageScale(1194, 784)).toBeCloseTo(784 / 834);
  });

  it('keeps an installed iPad stage edge-to-edge when only the restored height is short', () => {
    expect(calculateIpadStageScale(1194, 784, 'landscape-width')).toBe(1);
  });

  it('also keeps the stage inside a narrower viewport', () => {
    expect(calculateIpadStageScale(1024, 834)).toBeCloseTo(1024 / 1194);
  });

  it('falls back safely while the viewport is being restored', () => {
    expect(calculateIpadStageScale(0, 0)).toBe(1);
  });
});

describe('calculateShellRotation', () => {
  it('leaves a landscape screen upright', () => {
    expect(calculateShellRotation(1194, 834)).toBe(0);
    expect(calculateShellRotation(832, 741)).toBe(0);
    expect(calculateShellRotation(835, 360)).toBe(0);
  });

  it('turns the stage a quarter turn so a portrait screen still shows landscape', () => {
    expect(calculateShellRotation(834, 1194)).toBe(90);
    expect(calculateShellRotation(741, 832)).toBe(90);
    expect(calculateShellRotation(360, 835)).toBe(90);
  });

  it('stays upright while the viewport is being restored', () => {
    expect(calculateShellRotation(0, 0)).toBe(0);
    expect(calculateShellRotation(Number.NaN, Number.NaN)).toBe(0);
  });
});

describe('calculateStageLayout', () => {
  it('fills an M1 iPad Pro 11 landscape screen exactly', () => {
    expect(calculateStageLayout(1194, 834)).toEqual({
      rotation: 0, scale: 1, stageWidth: 1194, stageHeight: 834,
    });
  });

  it('fills an M1 iPad Pro 11 portrait screen exactly once rotated', () => {
    expect(calculateStageLayout(834, 1194)).toEqual({
      rotation: 90, scale: 1, stageWidth: 1194, stageHeight: 834,
    });
  });

  it('leaves the authored stage alone on a screen roomier than the design', () => {
    // Growing here would stretch the layout for no reason: it already fits.
    expect(calculateStageLayout(1600, 900)).toEqual({
      rotation: 0, scale: 1, stageWidth: 1194, stageHeight: 834,
    });
  });

  it('fits the rotated stage against the swapped axes on an unfolded Mate X5', () => {
    // Mate X5 unfolded is 2224 x 2496 at dpr 3, i.e. 741 x 832 CSS pixels.
    const layout = calculateStageLayout(741, 832);
    expect(layout.rotation).toBe(90);
    expect(layout.scale).toBeCloseTo(832 / 1194);
    // The 160px the old uniform fit spent on letterbox bars becomes real layout
    // height instead: 741 / 0.697 = 1063.
    expect(layout.stageWidth).toBe(1194);
    expect(layout.stageHeight).toBe(1063);
  });

  it('gives an unfolded Mate X5 the same stage in landscape and portrait', () => {
    const portrait = calculateStageLayout(741, 832);
    const landscape = calculateStageLayout(832, 741);
    expect(landscape.stageWidth).toBe(portrait.stageWidth);
    expect(landscape.stageHeight).toBe(portrait.stageHeight);
    expect(landscape.scale).toBeCloseTo(portrait.scale);
  });

  it('covers the screen exactly with the grown stage on an unfolded Mate X5', () => {
    const { scale, stageWidth, stageHeight } = calculateStageLayout(832, 741);
    expect(stageWidth * scale).toBeCloseTo(832, 0);
    expect(stageHeight * scale).toBeCloseTo(741, 0);
  });

  it('never shrinks the stage below the authored design', () => {
    const layout = calculateStageLayout(835, 360);
    expect(layout.stageWidth).toBeGreaterThanOrEqual(1194);
    expect(layout.stageHeight).toBeGreaterThanOrEqual(834);
  });

  it('caps how far the stage may stretch past the authored design', () => {
    const layout = calculateStageLayout(835, 360);
    expect(layout.stageWidth).toBe(Math.round(1194 * MAX_STAGE_GROWTH));
  });

  it('fits the rotated stage on a folded Mate X5 cover screen', () => {
    const layout = calculateStageLayout(360, 835);
    expect(layout.rotation).toBe(90);
    expect(layout.scale).toBeCloseTo(360 / 834);
  });

  it('contains a rotated stage even when the installed iPad width shortcut is requested', () => {
    // Rotated, the stage's 834 edge runs across a 810px-wide screen, so the
    // 'landscape-width' shortcut would scale to 1 and overflow it sideways.
    const layout = calculateStageLayout(810, 1194, 'landscape-width');
    expect(layout.rotation).toBe(90);
    expect(layout.scale).toBeCloseTo(810 / 834);
  });

  it('still keeps an installed iPad edge-to-edge when only the restored height is short', () => {
    expect(calculateStageLayout(1194, 784, 'landscape-width')).toEqual({
      rotation: 0, scale: 1, stageWidth: 1194, stageHeight: 834,
    });
  });
});

describe('measureShellViewport', () => {
  const foldable = {
    visualWidth: 741,
    visualHeight: 832,
    innerWidth: 741,
    innerHeight: 832,
    clientWidth: 741,
    clientHeight: 832,
    screenWidth: 741,
    screenHeight: 832,
  };

  it('measures a regular browser conservatively', () => {
    expect(measureShellViewport(foldable, false)).toEqual({ width: 741, height: 832 });
  });

  it('restores the full screen height of an installed iPad resuming in landscape', () => {
    expect(measureShellViewport({
      visualWidth: 1194,
      visualHeight: 784,
      innerWidth: 1194,
      innerHeight: 834,
      clientWidth: 1194,
      clientHeight: 834,
      screenWidth: 1194,
      screenHeight: 834,
    }, true)).toEqual({ width: 1194, height: 834 });
  });

  it('does not report an installed iPad in portrait as landscape', () => {
    // The screen long edge must not be forced onto the width, otherwise the
    // stage is measured as landscape and never rotates.
    expect(measureShellViewport({
      visualWidth: 834,
      visualHeight: 1144,
      innerWidth: 834,
      innerHeight: 1194,
      clientWidth: 834,
      clientHeight: 1194,
      screenWidth: 1194,
      screenHeight: 834,
    }, true)).toEqual({ width: 834, height: 1194 });
  });
});
