export const IPAD_STAGE_WIDTH = 1194;
export const IPAD_STAGE_HEIGHT = 834;

export interface IpadEnvironment {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  standalone: boolean;
  displayModeInstalled: boolean;
}

export function getConservativeViewportLength(...values: Array<number | undefined>) {
  const validValues = values.filter(
    (value): value is number => Number.isFinite(value) && (value ?? 0) > 0,
  );
  return validValues.length > 0 ? Math.min(...validValues) : 0;
}

export function getStableViewportLength(...values: Array<number | undefined>) {
  const validValues = values.filter(
    (value): value is number => Number.isFinite(value) && (value ?? 0) > 0,
  );
  return validValues.length > 0 ? Math.max(...validValues) : 0;
}

export function isStandaloneIpad(environment: IpadEnvironment) {
  const isIpad = /\biPad\b/i.test(environment.userAgent)
    || (environment.platform === 'MacIntel' && environment.maxTouchPoints > 1);
  return isIpad && (environment.standalone || environment.displayModeInstalled);
}

export function calculateIpadStageScale(
  viewportWidth: number,
  viewportHeight: number,
  fitMode: 'contain' | 'landscape-width' = 'contain',
) {
  if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight)) {
    return 1;
  }

  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return 1;
  }

  if (fitMode === 'landscape-width') {
    return Math.min(1, viewportWidth / IPAD_STAGE_WIDTH);
  }

  return Math.min(1, viewportWidth / IPAD_STAGE_WIDTH, viewportHeight / IPAD_STAGE_HEIGHT);
}
