/**
 * Tile-size slider for the responsive grid.
 *
 * Slider value (1-32) → tile min-width in px. The grid renders
 *   grid-template-columns: repeat(auto-fit, minmax(<n>px, 1fr))
 * so the actual column count auto-derives from viewport / tileMinPx, and
 * tiles stretch (auto-fit collapses empty tracks) when device count is
 * smaller than what fits. Rows wrap automatically when devices overflow.
 *
 * The curve is biased dense: default value 5 yields ~140px tiles
 * (~10 cols on a 1400px desktop), which matches the operator's "many
 * devices visible at once" expectation. Drag left for big tiles, right
 * for tiny dense.
 */

export const SLIDER_MIN = 1;
export const SLIDER_MAX = 32;

const TILE_MIN_PX = 80;
const TILE_MAX_PX = 480;
// Notional container width used to map slider → tile min. At this width the
// effective col count ≈ slider value, so the slider still reads like a
// "preferred cols" knob on a typical 1280-1600px desktop.
const WIDTH_BUDGET_PX = 700;

export function tileMinPxFromCols(value: number): number {
  const safe = Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, Math.floor(value) || SLIDER_MIN));
  return Math.max(TILE_MIN_PX, Math.min(TILE_MAX_PX, Math.round(WIDTH_BUDGET_PX / safe)));
}
