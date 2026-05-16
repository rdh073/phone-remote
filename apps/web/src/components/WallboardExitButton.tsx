import { Minimize2, Minus, Plus } from 'lucide-react';
import { useDevicesStore } from '../stores/devices';
import { useLayoutStore } from '../stores/layout';
import { COL_OPTIONS } from '../lib/colOptions';

/**
 * Floating control for wallboard mode. Hosts density steppers and the Exit
 * button. Sits top-right at low opacity so it stays out of the way until the
 * operator reaches for it. Wallboard's "chrome-free" promise stays intact: any
 * affordance here has to be a direct manipulation that can't be done from the
 * keyboard mid-flow (cols ±, exit).
 */
export function WallboardExitButton() {
  const setWallboard = useLayoutStore((s) => s.setWallboard);
  const cols = useDevicesStore((s) => s.cols);
  const setCols = useDevicesStore((s) => s.setCols);

  // Snap to the nearest COL_OPTION before stepping so prior non-conforming
  // values (eg cols=7 from an older persisted state) don't strand us.
  const stepCols = (delta: number) => {
    let idx = COL_OPTIONS.indexOf(cols as (typeof COL_OPTIONS)[number]);
    if (idx === -1) {
      // Find nearest in-list neighbor as starting point.
      let best = 0;
      let bestDelta = Math.abs(cols - COL_OPTIONS[0]);
      for (let i = 0; i < COL_OPTIONS.length; i += 1) {
        const d = Math.abs(cols - COL_OPTIONS[i]!);
        if (d < bestDelta) {
          best = i;
          bestDelta = d;
        }
      }
      idx = best;
    }
    const next = COL_OPTIONS[Math.min(Math.max(idx + delta, 0), COL_OPTIONS.length - 1)]!;
    if (next !== cols) setCols(next);
  };

  const canStepDown = (COL_OPTIONS.indexOf(cols as (typeof COL_OPTIONS)[number]) > 0) || cols > COL_OPTIONS[0];
  const canStepUp =
    (COL_OPTIONS.indexOf(cols as (typeof COL_OPTIONS)[number]) < COL_OPTIONS.length - 1) ||
    cols < COL_OPTIONS[COL_OPTIONS.length - 1]!;

  return (
    <div
      className="fixed top-3 right-3 z-[59] inline-flex h-8 items-stretch rounded-md border border-zinc-700/80 ui-popover-surface backdrop-blur-md opacity-30 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-[180ms] shadow-[0_4px_12px_-4px_rgba(0,0,0,0.5)] overflow-hidden"
      role="toolbar"
      aria-label="Wallboard controls"
    >
      <button
        type="button"
        onClick={() => stepCols(-1)}
        disabled={!canStepDown}
        aria-label="Fewer columns"
        title="Fewer columns (larger tiles)"
        className="h-full w-8 inline-flex items-center justify-center rounded border border-zinc-800 ui-chip-surface text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400 focus:outline-none focus-visible:bg-zinc-800/70"
      >
        <Minus size={12} />
      </button>
      <div
        className="h-full inline-flex items-center justify-center px-2 font-mono text-[10px] tabular-nums text-zinc-300 border-l border-r border-zinc-800/70"
        title={`${cols} columns`}
        aria-live="polite"
      >
        <span className="text-zinc-100">{cols}</span>
        <span className="ml-0.5 text-zinc-500 text-[9px] uppercase tracking-[0.14em]">cols</span>
      </div>
      <button
        type="button"
        onClick={() => stepCols(+1)}
        disabled={!canStepUp}
        aria-label="More columns"
        title="More columns (smaller tiles)"
        className="h-full w-8 inline-flex items-center justify-center rounded border border-zinc-800 ui-chip-surface text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400 focus:outline-none focus-visible:bg-zinc-800/70"
      >
        <Plus size={12} />
      </button>
      <button
        type="button"
        onClick={() => setWallboard(false)}
        title="Exit wallboard (W)"
        aria-label="Exit wallboard"
        className="h-full inline-flex items-center gap-1.5 px-2.5 font-mono text-[10px] uppercase tracking-[0.16em] border-l border-zinc-800/70 hover:bg-zinc-800/70 hover:text-cyan-100 focus:outline-none focus-visible:bg-zinc-800/70"
      >
        <Minimize2 size={11} />
        <span>exit</span>
        <kbd className="ml-0.5 inline-flex h-4 items-center rounded border border-zinc-700 bg-zinc-900 ui-chip-surface px-1 text-[9px] text-zinc-400">
          W
        </kbd>
      </button>
    </div>
  );
}
