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

/**
 * The summary column's category breakdown is authored as six bars. It sits in a
 * fixed-height aside, so a taller stage leaves the card floating over empty
 * space; measured at 1194 x 834 the list runs 402 -> 704 inside an aside that
 * ends at 716, and at 1063 the same card still ends at 714 with 231px spare.
 */
export const BREAKDOWN_ROW_HEIGHT = 47;
export const BREAKDOWN_ROW_GAP = 4;
export const BREAKDOWN_MIN_ROWS = 6;
export const BREAKDOWN_MAX_ROWS = 12;

/**
 * Stage height above the first bar (401) plus the aside's bottom inset (118)
 * plus the card's bottom padding (11).
 */
export const BREAKDOWN_CHROME = 530;

export function calculateBreakdownRows(stageHeight: number): number {
  if (!Number.isFinite(stageHeight)) {
    return BREAKDOWN_MIN_ROWS;
  }

  const available = stageHeight - BREAKDOWN_CHROME;
  const pitch = BREAKDOWN_ROW_HEIGHT + BREAKDOWN_ROW_GAP;
  const rows = Math.floor((available + BREAKDOWN_ROW_GAP) / pitch);
  return Math.min(BREAKDOWN_MAX_ROWS, Math.max(BREAKDOWN_MIN_ROWS, rows));
}
