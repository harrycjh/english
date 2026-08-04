import { describe, expect, it } from 'vitest';
import {
  BREAKDOWN_CHROME,
  BREAKDOWN_ROW_GAP,
  BREAKDOWN_ROW_HEIGHT,
  SELECTION_COLUMNS,
  SELECTION_GRID_CHROME,
  SELECTION_ROW_GAP,
  SELECTION_ROW_HEIGHT,
  calculateBreakdownRows,
  calculateSelectionPageSize,
  calculateSelectionRows,
} from './selection-density';

const IPAD_STAGE_HEIGHT = 834;
const MATE_X5_STAGE_HEIGHT = 1063;

describe('calculateSelectionRows', () => {
  it('reserves exactly the chrome measured on the authored stage', () => {
    // Measured in the browser at 1194 x 834: the grid starts at y280, the panel
    // ends at y716 (118px above the stage bottom) and the pager runs 652 -> 692
    // with a 10px gap above it and 10px of panel padding below.
    const GRID_TOP = 280;
    const PANEL_BOTTOM_INSET = 834 - 716;
    const PAGER_HEIGHT = 692 - 652;
    const PAGER_GAPS = 20;

    expect(SELECTION_GRID_CHROME).toBe(GRID_TOP + PANEL_BOTTOM_INSET + PAGER_HEIGHT + PAGER_GAPS);
  });

  it('keeps the authored two rows on an iPad Pro 11 stage', () => {
    expect(calculateSelectionRows(IPAD_STAGE_HEIGHT)).toBe(2);
  });

  it('fits a third row on a Mate X5 unfolded stage', () => {
    expect(calculateSelectionRows(MATE_X5_STAGE_HEIGHT)).toBe(3);
  });

  it('only adds a row once a full-height card fits', () => {
    const pitch = SELECTION_ROW_HEIGHT + SELECTION_ROW_GAP;
    // Exactly three rows worth of grid: 3 cards plus the 2 gaps between them.
    const exactlyThree = SELECTION_GRID_CHROME + (SELECTION_ROW_HEIGHT * 3) + (SELECTION_ROW_GAP * 2);

    expect(calculateSelectionRows(exactlyThree)).toBe(3);
    expect(calculateSelectionRows(exactlyThree - 1)).toBe(2);
    expect(calculateSelectionRows(exactlyThree + pitch)).toBe(4);
  });

  it('never drops below the authored two rows on a short stage', () => {
    expect(calculateSelectionRows(400)).toBe(2);
    expect(calculateSelectionRows(0)).toBe(2);
  });

  it('caps the grid so an extreme stage does not page hundreds of cards', () => {
    expect(calculateSelectionRows(100_000)).toBe(4);
  });

  it('falls back to the authored rows when the stage has not been measured', () => {
    expect(calculateSelectionRows(Number.NaN)).toBe(2);
  });
});

describe('calculateSelectionPageSize', () => {
  it('pages a full grid so no row is ever half empty', () => {
    expect(calculateSelectionPageSize(IPAD_STAGE_HEIGHT)).toBe(2 * SELECTION_COLUMNS);
    expect(calculateSelectionPageSize(MATE_X5_STAGE_HEIGHT)).toBe(3 * SELECTION_COLUMNS);
  });
});

describe('calculateBreakdownRows', () => {
  it('reserves exactly the chrome measured on the authored stage', () => {
    // Measured at 1194 x 834: the first bar starts at y401, the aside ends 118px
    // above the stage bottom and the card keeps 11px of padding under the list.
    const LIST_TOP = 401;
    const ASIDE_BOTTOM_INSET = 834 - 716;
    const CARD_BOTTOM_PADDING = 11;

    expect(BREAKDOWN_CHROME).toBe(LIST_TOP + ASIDE_BOTTOM_INSET + CARD_BOTTOM_PADDING);
  });

  it('keeps the authored six bars on an iPad Pro 11 stage', () => {
    expect(calculateBreakdownRows(IPAD_STAGE_HEIGHT)).toBe(6);
  });

  it('fills the summary column on a Mate X5 unfolded stage', () => {
    expect(calculateBreakdownRows(MATE_X5_STAGE_HEIGHT)).toBe(10);
  });

  it('only adds a bar once a whole row plus its gap fits', () => {
    const pitch = BREAKDOWN_ROW_HEIGHT + BREAKDOWN_ROW_GAP;
    const exactlySeven = BREAKDOWN_CHROME + (BREAKDOWN_ROW_HEIGHT * 7) + (BREAKDOWN_ROW_GAP * 6);

    expect(calculateBreakdownRows(exactlySeven)).toBe(7);
    expect(calculateBreakdownRows(exactlySeven - 1)).toBe(6);
    expect(calculateBreakdownRows(exactlySeven + pitch)).toBe(8);
  });

  it('never drops below the authored six bars on a short stage', () => {
    expect(calculateBreakdownRows(400)).toBe(6);
    expect(calculateBreakdownRows(0)).toBe(6);
    expect(calculateBreakdownRows(Number.NaN)).toBe(6);
  });

  it('caps the list so an extreme stage does not run the whole category table', () => {
    expect(calculateBreakdownRows(100_000)).toBe(12);
  });
});
