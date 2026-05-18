/**
 * Tile-size slider bounds. The slider's integer value 1-32 is the *target*
 * column count; the grid renders `repeat(min(cols, N), minmax(0, 1fr))` where
 * N is the visible device count, so a slider value above the device count
 * caps at N instead of leaving empty cells. Tiles auto-size to fill the
 * container width / effective cols.
 */
export const SLIDER_MIN = 1;
export const SLIDER_MAX = 32;

export function clampCols(value: number): number {
  return Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, Math.floor(value) || SLIDER_MIN));
}

/**
 * Cap the slider value against the visible device count so high slider
 * positions never produce empty cells / single-row-with-trailing-blanks.
 */
export function effectiveCols(cols: number, deviceCount: number): number {
  const c = clampCols(cols);
  if (deviceCount <= 0) return c;
  return Math.max(1, Math.min(c, deviceCount));
}
