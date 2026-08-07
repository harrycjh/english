import { describe, expect, it } from 'vitest';
import { calculateAutoFitFontSize } from './review-preview-text';

describe('calculateAutoFitFontSize', () => {
  it('keeps the authored font size when the word already fits', () => {
    expect(calculateAutoFitFontSize(99, 90, 22)).toBe(22);
  });

  it('shrinks an overflowing word with a small safety gutter', () => {
    expect(calculateAutoFitFontSize(99, 120, 22)).toBe(17.5);
  });

  it('does not shrink below the readable minimum', () => {
    expect(calculateAutoFitFontSize(99, 300, 22)).toBe(14);
  });
});
