/**
 * Tile-size slider bounds + visible-tile cap.
 *
 * The slider's integer value is the literal column count. Range is locked
 * 4-8 — operator preference; below 4 tiles get too big to be useful for
 * fleet ops, above 8 they're too small to read.
 *
 * The grid also caps the number of rendered tiles at MAX_VISIBLE_TILES so
 * a fleet larger than 32 doesn't make the page unscrollable / unselectable.
 * Filters in the sidebar still narrow what falls into that window.
 */

export const SLIDER_MIN = 4;
export const SLIDER_MAX = 8;
export const MAX_VISIBLE_TILES = 32;

export function clampCols(value: number): number {
  return Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, Math.floor(value) || SLIDER_MIN));
}
