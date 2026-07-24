import { describe, expect, it } from 'vitest';
import {
  calculateIpadStageScale,
  getConservativeViewportLength,
  getStableViewportLength,
  isStandaloneIpad,
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
