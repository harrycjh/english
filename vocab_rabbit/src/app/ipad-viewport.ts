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

export type ShellRotation = 0 | 90;

export interface ShellViewportInput {
  visualWidth?: number;
  visualHeight?: number;
  innerWidth?: number;
  innerHeight?: number;
  clientWidth?: number;
  clientHeight?: number;
  screenWidth?: number;
  screenHeight?: number;
}

// Installed iPad apps can briefly report a visual viewport about 50px shorter
// after resume. Restoring the physical screen edge keeps the stage edge-to-edge,
// but the floor has to follow the current orientation, otherwise a portrait
// screen is measured as landscape and the stage overflows sideways.
export function measureShellViewport(input: ShellViewportInput, installedIpad: boolean) {
  const rawWidth = getConservativeViewportLength(input.visualWidth, input.innerWidth, input.clientWidth);
  const rawHeight = getConservativeViewportLength(input.visualHeight, input.innerHeight, input.clientHeight);

  if (!installedIpad) {
    return { width: rawWidth, height: rawHeight };
  }

  const screenEdges = [input.screenWidth, input.screenHeight]
    .filter((value): value is number => Number.isFinite(value) && (value ?? 0) > 0);
  if (screenEdges.length === 0) {
    return { width: rawWidth, height: rawHeight };
  }

  const longEdge = Math.max(...screenEdges);
  const shortEdge = Math.min(...screenEdges);
  const isPortrait = rawHeight > rawWidth;

  return {
    width: getStableViewportLength(
      input.visualWidth,
      input.innerWidth,
      input.clientWidth,
      isPortrait ? shortEdge : longEdge,
    ),
    height: getStableViewportLength(
      input.visualHeight,
      input.innerHeight,
      input.clientHeight,
      isPortrait ? longEdge : shortEdge,
    ),
  };
}

export interface ShellStageLayout {
  rotation: ShellRotation;
  scale: number;
  stageWidth: number;
  stageHeight: number;
}

// A stage that grew without bound would stretch the layout past anything the
// design was drawn for, so cap how much slack it is allowed to absorb.
export const MAX_STAGE_GROWTH = 1.5;

function growStageLength(available: number, scale: number, authored: number) {
  const grown = available / scale;
  if (!Number.isFinite(grown) || grown <= 0) {
    return authored;
  }

  return Math.round(Math.min(Math.max(grown, authored), authored * MAX_STAGE_GROWTH));
}

export function calculateStageLayout(
  viewportWidth: number,
  viewportHeight: number,
  fitMode: 'contain' | 'landscape-width' = 'contain',
): ShellStageLayout {
  const rotation = calculateShellRotation(viewportWidth, viewportHeight);
  // A rotated stage spans the viewport height horizontally and the viewport
  // width vertically, so the axes have to be swapped before fitting it.
  const availableWidth = rotation === 90 ? viewportHeight : viewportWidth;
  const availableHeight = rotation === 90 ? viewportWidth : viewportHeight;
  // The landscape-width shortcut exists for installed iPads whose restored
  // viewport is briefly too short. A rotated stage must always stay contained,
  // otherwise it overflows the narrow edge of a folded screen.
  const effectiveFitMode = rotation === 90 ? 'contain' : fitMode;
  const scale = calculateIpadStageScale(availableWidth, availableHeight, effectiveFitMode);

  // At scale 1 the screen already fits the authored stage, so leave the stage
  // exactly as drawn. Only a screen that forces the stage to shrink has slack
  // worth reclaiming, and handing that slack to the layout as real pixels beats
  // spending it on letterbox bars.
  if (scale >= 1) {
    return {
      rotation,
      scale,
      stageWidth: IPAD_STAGE_WIDTH,
      stageHeight: IPAD_STAGE_HEIGHT,
    };
  }

  return {
    rotation,
    scale,
    stageWidth: growStageLength(availableWidth, scale, IPAD_STAGE_WIDTH),
    stageHeight: growStageLength(availableHeight, scale, IPAD_STAGE_HEIGHT),
  };
}

// The whole app is authored as a fixed 1194 x 834 landscape stage. Rather than
// hiding it on a portrait screen, rotate the stage a quarter turn so foldables
// and phones still get the landscape experience.
export function calculateShellRotation(
  viewportWidth: number,
  viewportHeight: number,
): ShellRotation {
  if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight)) {
    return 0;
  }

  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return 0;
  }

  return viewportHeight > viewportWidth ? 90 : 0;
}

