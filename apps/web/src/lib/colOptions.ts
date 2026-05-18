/**
 * Tile-size slider mapping for the auto-fill grid.
 *
 * The slider's integer value (1-32, stored as `cols` in the devices store
 * for historical reasons) is interpreted as a tile-size *index* — 1 = biggest,
 * 32 = densest. Layout uses
 *   grid-template-columns: repeat(auto-fill, minmax(<n>px, 1fr))
 * so tiles wrap to additional rows once the row is full, instead of forcing
 * an exact column count.
 *
 * The formula `min-width = WIDTH_BUDGET / cols` preserves the previous
 * fixed-cols feel at a notional 1400px-wide grid container (sidebar +
 * assistant chrome out), so the default value 5 still produces ~280px tiles
 * (≈ 5 per row on a typical desktop). Auto-fill then handles wider/narrower
 * viewports gracefully.
 */

const WIDTH_BUDGET_PX = 1400;
const TILE_MIN_PX = 80;
const TILE_MAX_PX = 600;
export const SLIDER_MIN = 1;
export const SLIDER_MAX = 32;

export function tileMinPxFromCols(cols: number): number {
  const safe = Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, Math.floor(cols) || SLIDER_MIN));
  const raw = Math.round(WIDTH_BUDGET_PX / safe);
  return Math.max(TILE_MIN_PX, Math.min(TILE_MAX_PX, raw));
}
