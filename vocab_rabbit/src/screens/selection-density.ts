/**
 * The vocabulary grid is authored as three columns x two rows inside the
 * 1194 x 834 stage. A taller stage (a Mate X5 unfolded hands the shell 1063
 * logical px) leaves the panel with real empty space below the pager, so it can
 * carry more rows of the *same* card.
 *
 * Rows are only added when a full-height card fits: the card is a fixed 137px
 * body plus its action row, and squeezing an extra row in would have to shrink
 * the word illustration, which is the whole point of the card.
 */
export const SELECTION_COLUMNS = 3;
export const SELECTION_MIN_ROWS = 2;
export const SELECTION_MAX_ROWS = 4;
export const SELECTION_ROW_HEIGHT = 176;
export const SELECTION_ROW_GAP = 10;

/**
 * Stage height consumed by everything that is not the card grid: the page top
 * inset, the panel's toolbar rows, the pager beneath the grid and the dock.
 * Measured against the authored stage, where the grid runs 280 -> 642 inside a
 * panel that ends at 716.
 */
export const SELECTION_GRID_CHROME = 458;

export function calculateSelectionRows(stageHeight: number): number {
  if (!Number.isFinite(stageHeight)) {
    return SELECTION_MIN_ROWS;
  }

  const available = stageHeight - SELECTION_GRID_CHROME;
  const pitch = SELECTION_ROW_HEIGHT + SELECTION_ROW_GAP;
  const rows = Math.floor((available + SELECTION_ROW_GAP) / pitch);
  return Math.min(SELECTION_MAX_ROWS, Math.max(SELECTION_MIN_ROWS, rows));
}

export function calculateSelectionPageSize(stageHeight: number): number {
  return calculateSelectionRows(stageHeight) * SELECTION_COLUMNS;
}
