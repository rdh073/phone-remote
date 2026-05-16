/**
 * Allowed grid column counts. Non-uniform spacing past 12 to skip values that
 * never produce readable tiles (eg 13, 14, 15 between 12 and 16).
 */
export const COL_OPTIONS = [3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 28, 32] as const;
export type ColOption = (typeof COL_OPTIONS)[number];

/** Nearest neighbor in `COL_OPTIONS` for an arbitrary cols value. */
export function nearestColOption(cols: number): ColOption {
  let best: ColOption = COL_OPTIONS[0];
  let bestDelta = Math.abs(cols - best);
  for (const c of COL_OPTIONS) {
    const d = Math.abs(cols - c);
    if (d < bestDelta) {
      best = c;
      bestDelta = d;
    }
  }
  return best;
}
