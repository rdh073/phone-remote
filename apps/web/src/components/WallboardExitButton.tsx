import { Grid2x2, Minimize2, Square } from 'lucide-react';
import { useDevicesStore } from '../stores/devices';
import { useLayoutStore } from '../stores/layout';
import { SLIDER_MAX, SLIDER_MIN, tileMinPxFromCols } from '../lib/colOptions';

/**
 * Floating control for wallboard mode. Hosts the tile-size slider and Exit.
 * Sits top-right at low opacity so it stays out of the way until the operator
 * reaches for it. Wallboard's "chrome-free" promise stays intact — the slider
 * is the only direct-manipulation affordance not covered by the keyboard.
 */
export function WallboardExitButton() {
  const setWallboard = useLayoutStore((s) => s.setWallboard);
  const cols = useDevicesStore((s) => s.cols);
  const setCols = useDevicesStore((s) => s.setCols);
  const tileMinPx = tileMinPxFromCols(cols);

  return (
    <div
      className="fixed top-3 right-3 z-[59] inline-flex h-8 items-stretch rounded-md border border-zinc-700/80 ui-popover-surface backdrop-blur-md opacity-30 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-[180ms] shadow-[0_4px_12px_-4px_rgba(0,0,0,0.5)] overflow-hidden"
      role="toolbar"
      aria-label="Wallboard controls"
    >
      <div
        className="inline-flex h-full items-center gap-1.5 px-2.5"
        title="Tile size — drag right to shrink tiles (more per row), left to grow them"
      >
        <Square size={11} className="text-zinc-500" aria-hidden />
        <input
          type="range"
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          step={1}
          value={cols}
          onChange={(e) => setCols(Number(e.target.value))}
          aria-label="Tile size"
          aria-valuemin={SLIDER_MIN}
          aria-valuemax={SLIDER_MAX}
          aria-valuenow={cols}
          aria-valuetext={`${tileMinPx} pixels minimum tile width`}
          className="w-28 accent-cyan-500 cursor-pointer touch-target-range"
        />
        <Grid2x2 size={11} className="text-zinc-500" aria-hidden />
        <span
          className="ml-1 inline-flex items-baseline gap-0.5 font-mono text-[0.625rem] tabular-nums text-zinc-300"
          aria-live="polite"
        >
          <span className="text-zinc-100">{tileMinPx}</span>
          <span className="text-zinc-500 text-[0.5625rem] uppercase tracking-[0.14em]">px</span>
        </span>
      </div>
      <button
        type="button"
        onClick={() => setWallboard(false)}
        title="Exit wallboard (W)"
        aria-label="Exit wallboard"
        className="h-full inline-flex items-center gap-1.5 px-2.5 font-mono text-[0.625rem] uppercase tracking-[0.16em] border-l border-zinc-800/70 hover:bg-zinc-800/70 hover:text-cyan-100 focus:outline-none focus-visible:bg-zinc-800/70"
      >
        <Minimize2 size={11} />
        <span>exit</span>
        <kbd className="ml-0.5 inline-flex h-4 items-center rounded border border-zinc-700 bg-zinc-900 ui-chip-surface px-1 text-[0.5625rem] text-zinc-400">
          W
        </kbd>
      </button>
    </div>
  );
}
