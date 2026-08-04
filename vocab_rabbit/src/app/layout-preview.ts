import { IPAD_STAGE_HEIGHT, IPAD_STAGE_WIDTH, type ShellStageLayout } from './ipad-viewport';

/**
 * Debug-only stage override. `auto` measures the real screen; the device values
 * pin the stage box to what that device actually gets, so the layout can be
 * compared side by side without owning both devices.
 */
export type LayoutPreview = 'auto' | 'ipad' | 'mate-x5';

export const LAYOUT_PREVIEW_STORAGE_KEY = 'vocarabbit.layout-preview';
export const LAYOUT_PREVIEW_EVENT = 'vocarabbit:layout-preview';

export interface LayoutPreviewOption {
  id: Exclude<LayoutPreview, 'auto'>;
  label: string;
  note: string;
  stageWidth: number;
  stageHeight: number;
}

/**
 * Mate X5 unfolded reports an 832 x 741 viewport, which scales the stage to
 * 0.697 and lets it grow to 1194 x 1063. Pinning the measured result rather
 * than the raw viewport keeps the preview full screen instead of shrinking the
 * app into a phone-sized box.
 */
export const LAYOUT_PREVIEW_OPTIONS: LayoutPreviewOption[] = [
  {
    id: 'ipad',
    label: 'iPad 布局',
    note: `${IPAD_STAGE_WIDTH} × ${IPAD_STAGE_HEIGHT}`,
    stageWidth: IPAD_STAGE_WIDTH,
    stageHeight: IPAD_STAGE_HEIGHT,
  },
  {
    id: 'mate-x5',
    label: 'Mate X5 布局',
    note: `${IPAD_STAGE_WIDTH} × 1063`,
    stageWidth: IPAD_STAGE_WIDTH,
    stageHeight: 1063,
  },
];

export function isLayoutPreview(value: unknown): value is LayoutPreview {
  return value === 'auto' || value === 'ipad' || value === 'mate-x5';
}

export function readLayoutPreview(): LayoutPreview {
  try {
    const stored = window.localStorage.getItem(LAYOUT_PREVIEW_STORAGE_KEY);
    return isLayoutPreview(stored) ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

export function writeLayoutPreview(preview: LayoutPreview) {
  try {
    if (preview === 'auto') {
      window.localStorage.removeItem(LAYOUT_PREVIEW_STORAGE_KEY);
    } else {
      window.localStorage.setItem(LAYOUT_PREVIEW_STORAGE_KEY, preview);
    }
  } catch {
    // A private-mode browser without storage still gets the live override below.
  }
  window.dispatchEvent(new CustomEvent(LAYOUT_PREVIEW_EVENT, { detail: preview }));
}

/**
 * Swaps the measured stage box for the previewed one and refits it to the real
 * screen. Rotation is left alone: a portrait screen still shows the landscape
 * stage a quarter turn round, exactly as it would without the override.
 */
export function applyLayoutPreview(
  layout: ShellStageLayout,
  preview: LayoutPreview,
  viewportWidth: number,
  viewportHeight: number,
): ShellStageLayout {
  const option = LAYOUT_PREVIEW_OPTIONS.find(({ id }) => id === preview);
  if (!option) {
    return layout;
  }

  const availableWidth = layout.rotation === 90 ? viewportHeight : viewportWidth;
  const availableHeight = layout.rotation === 90 ? viewportWidth : viewportHeight;
  if (!(availableWidth > 0) || !(availableHeight > 0)) {
    return layout;
  }

  return {
    rotation: layout.rotation,
    scale: Math.min(1, availableWidth / option.stageWidth, availableHeight / option.stageHeight),
    stageWidth: option.stageWidth,
    stageHeight: option.stageHeight,
  };
}
