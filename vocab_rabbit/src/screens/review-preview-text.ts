const DEFAULT_MIN_FONT_SIZE = 14;
const FIT_GUTTER = 2;
const FONT_SIZE_STEP = 0.5;

export function calculateAutoFitFontSize(
  availableWidth: number,
  contentWidth: number,
  baseFontSize: number,
  minFontSize = DEFAULT_MIN_FONT_SIZE,
): number {
  if (availableWidth <= 0 || contentWidth <= availableWidth || baseFontSize <= minFontSize) {
    return baseFontSize;
  }

  const fittedSize = baseFontSize * Math.max(0, availableWidth - FIT_GUTTER) / contentWidth;
  const steppedSize = Math.floor(fittedSize / FONT_SIZE_STEP) * FONT_SIZE_STEP;
  return Math.max(minFontSize, Math.min(baseFontSize, steppedSize));
}
