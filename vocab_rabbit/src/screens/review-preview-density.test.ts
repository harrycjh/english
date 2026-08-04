import { describe, expect, it } from 'vitest';
import {
  PREVIEW_ROW_GAP,
  calculatePreviewRows,
  shiftLayoutY,
} from './review-preview-density';

const AUTHORED_FRAME_HEIGHT = 808;
const AUTHORED_CARD_HEIGHT = 130;

function rowsFor(availableHeight: number) {
  return calculatePreviewRows({
    availableHeight,
    authoredHeight: AUTHORED_FRAME_HEIGHT,
    rowHeight: AUTHORED_CARD_HEIGHT,
  });
}

describe('calculatePreviewRows', () => {
  it('keeps the authored single row on an iPad Pro 11 stage', () => {
    // 834 logical stage rendered at the width-bound 1.031 scale.
    expect(rowsFor(834 / 1.031)).toBe(1);
  });

  it('adds a second row on a Mate X5 unfolded stage', () => {
    // The shell grows the stage to 1063 logical, i.e. 1031 authored units.
    expect(rowsFor(1063 / 1.031)).toBe(2);
  });

  it('refuses a row that would not fit whole', () => {
    const pitch = AUTHORED_CARD_HEIGHT + PREVIEW_ROW_GAP;
    expect(rowsFor(AUTHORED_FRAME_HEIGHT + pitch - 1)).toBe(1);
    expect(rowsFor(AUTHORED_FRAME_HEIGHT + pitch)).toBe(2);
  });

  it('leaves a real gap between rows, so a row that only fits flush is refused', () => {
    // Room for a second card but only 5px of breathing space: not enough.
    expect(rowsFor(AUTHORED_FRAME_HEIGHT + AUTHORED_CARD_HEIGHT + 5)).toBe(1);
    expect(rowsFor(AUTHORED_FRAME_HEIGHT + AUTHORED_CARD_HEIGHT + 10)).toBe(2);
  });

  it('never drops below one row, even on a stage smaller than the comp', () => {
    expect(rowsFor(400)).toBe(1);
    expect(rowsFor(0)).toBe(1);
  });

  it('caps growth so an extreme stage does not flood the page', () => {
    expect(rowsFor(100_000)).toBe(3);
  });

  it('falls back to one row when the stage has not been measured yet', () => {
    expect(rowsFor(Number.NaN)).toBe(1);
  });
});

describe('shiftLayoutY', () => {
  it('moves every nested y so a repeated row keeps its internal composition', () => {
    const card = {
      id: 'family',
      x: 29,
      y: 448,
      width: 265,
      height: 130,
      artSlot: { x: 29, y: 448, width: 110, height: 130 },
      textBlocks: {
        headline: { x: 151, y: 465, width: 99, height: 24 },
        meta: { x: 151, y: 523, width: 111, height: 22 },
      },
    };

    const moved = shiftLayoutY(card, 140);

    expect(moved.y).toBe(588);
    expect(moved.artSlot.y).toBe(588);
    expect(moved.textBlocks.headline.y).toBe(605);
    expect(moved.textBlocks.meta.y).toBe(663);
  });

  it('leaves x, sizes and non-numeric fields alone', () => {
    const moved = shiftLayoutY({ id: 'family', x: 29, y: 448, width: 265, height: 130 }, 140);

    expect(moved.id).toBe('family');
    expect(moved.x).toBe(29);
    expect(moved.width).toBe(265);
    expect(moved.height).toBe(130);
  });

  it('returns the node untouched for a zero shift', () => {
    const card = { x: 29, y: 448 };
    expect(shiftLayoutY(card, 0)).toBe(card);
  });

  it('walks arrays of bounds', () => {
    const moved = shiftLayoutY([{ y: 10 }, { y: 20 }], 5);
    expect(moved).toEqual([{ y: 15 }, { y: 25 }]);
  });
});
