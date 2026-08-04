/**
 * The review comp is authored as a single 1158 x 808 frame with one row of four
 * preview cards. On a screen whose aspect ratio hands the shell a taller stage
 * (a Mate X5 unfolded, for example) that leaves real empty space under the comp,
 * so the preview grid can carry more rows of the *same* card instead.
 *
 * Rows are only added when a full authored-height row fits. The preview card is
 * laid out in absolute pixels internally, so shrinking a row to squeeze one more
 * in would clip its footer text rather than scale it.
 */
export const PREVIEW_COLUMNS = 4;
export const MAX_PREVIEW_ROWS = 3;
export const PREVIEW_ROW_GAP = 10;

export interface PreviewRowInput {
  /** Height the comp may occupy, in authored units. */
  availableHeight: number;
  /** Authored height of the comp as designed (one preview row). */
  authoredHeight: number;
  /** Authored height of a single preview card. */
  rowHeight: number;
  rowGap?: number;
  maxRows?: number;
}

export function calculatePreviewRows({
  availableHeight,
  authoredHeight,
  rowHeight,
  rowGap = PREVIEW_ROW_GAP,
  maxRows = MAX_PREVIEW_ROWS,
}: PreviewRowInput): number {
  const pitch = rowHeight + rowGap;
  if (!Number.isFinite(availableHeight) || pitch <= 0) {
    return 1;
  }

  const spare = availableHeight - authoredHeight;
  const extraRows = spare > 0 ? Math.floor(spare / pitch) : 0;
  return Math.min(maxRows, Math.max(1, 1 + extraRows));
}

/**
 * Deep-copies a design-comp node, shifting every `y` it finds. Preview card
 * layouts nest bounds several levels down (art slot, badges, text blocks), and
 * all of them are absolute frame coordinates, so a repeated row has to move as
 * a whole.
 */
export function shiftLayoutY<T>(node: T, dy: number): T {
  if (dy === 0) {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map((child) => shiftLayoutY(child, dy)) as unknown as T;
  }
  if (node !== null && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>).map(([key, value]) => [
        key,
        key === 'y' && typeof value === 'number' ? value + dy : shiftLayoutY(value, dy),
      ]),
    ) as unknown as T;
  }
  return node;
}
