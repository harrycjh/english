export const IPAD_STAGE_WIDTH = 1194;
export const IPAD_STAGE_HEIGHT = 834;

export function getConservativeViewportLength(...values: Array<number | undefined>) {
  const validValues = values.filter(
    (value): value is number => Number.isFinite(value) && (value ?? 0) > 0,
  );
  return validValues.length > 0 ? Math.min(...validValues) : 0;
}

export function calculateIpadStageScale(viewportWidth: number, viewportHeight: number) {
  if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight)) {
    return 1;
  }

  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return 1;
  }

  return Math.min(1, viewportWidth / IPAD_STAGE_WIDTH, viewportHeight / IPAD_STAGE_HEIGHT);
}
