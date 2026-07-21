import { describe, expect, it } from 'vitest';
import { calculateIpadStageScale, getConservativeViewportLength } from './ipad-viewport';

describe('getConservativeViewportLength', () => {
  it('uses the smallest valid measurement when WebKit viewport APIs disagree', () => {
    expect(getConservativeViewportLength(834, 784, 834)).toBe(784);
  });

  it('ignores temporary invalid measurements during app restoration', () => {
    expect(getConservativeViewportLength(undefined, 0, 784)).toBe(784);
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

  it('also keeps the stage inside a narrower viewport', () => {
    expect(calculateIpadStageScale(1024, 834)).toBeCloseTo(1024 / 1194);
  });

  it('falls back safely while the viewport is being restored', () => {
    expect(calculateIpadStageScale(0, 0)).toBe(1);
  });
});
