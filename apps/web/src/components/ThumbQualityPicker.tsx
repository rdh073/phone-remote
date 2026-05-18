import { useEffect, useRef, useState } from 'react';
import { Gauge } from 'lucide-react';

import {
  THUMB_QUALITY_LABELS,
  THUMB_QUALITY_ORDER,
  useVideoQualityStore,
  type ThumbQualityTier,
} from '../stores/videoQuality';

/**
 * YouTube-style quality picker for the grid (thumb) stream. Picking a tier
 * persists to localStorage and force-reconnects every active thumb WS so the
 * new encode params take effect within a sub-second blip.
 *
 * The focused-tile (main) stream is not affected — operators want the detail
 * view at the highest the hub will serve.
 */
export function ThumbQualityPicker() {
  const tier = useVideoQualityStore((s) => s.tier);
  const setTier = useVideoQualityStore((s) => s.setTier);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<ThumbQualityTier>(tier);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setHighlight(tier);
  }, [open, tier]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
      const idx = THUMB_QUALITY_ORDER.indexOf(highlight);
      const last = THUMB_QUALITY_ORDER.length - 1;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight(THUMB_QUALITY_ORDER[Math.min(idx + 1, last)]!);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight(THUMB_QUALITY_ORDER[Math.max(idx - 1, 0)]!);
      } else if (e.key === 'Home') {
        e.preventDefault();
        setHighlight(THUMB_QUALITY_ORDER[0]!);
      } else if (e.key === 'End') {
        e.preventDefault();
        setHighlight(THUMB_QUALITY_ORDER[last]!);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setTier(highlight);
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, highlight, setTier]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLButtonElement>(`[data-tier="${highlight}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, highlight]);

  const activeLabel = THUMB_QUALITY_LABELS[tier].label;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Grid thumbnail quality: ${activeLabel}`}
        title={`Thumbnail quality (${activeLabel}). Click to change.`}
        className={`group h-9 inline-flex items-center gap-1.5 rounded border px-2.5 text-xs transition-colors duration-[140ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
          open
            ? 'border-cyan-500/45 bg-cyan-500/10 text-cyan-100'
            : 'ui-chip-surface text-zinc-300 hover:text-zinc-100 hover:border-zinc-700'
        }`}
      >
        <Gauge size={15} className={open ? 'text-cyan-300' : 'text-zinc-500 group-hover:text-zinc-300 transition-colors'} />
        <span className="tabular-nums">{activeLabel}</span>
        <span
          aria-hidden="true"
          className={`text-[0.7rem] leading-none -mt-0.5 transition-transform duration-[180ms] ${
            open ? 'rotate-180 text-cyan-300' : 'text-zinc-500'
          }`}
        >
          ▾
        </span>
      </button>

      {open && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Close quality menu"
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            style={{
              animation: 'cols-menu-in 140ms cubic-bezier(0.16, 1, 0.3, 1)',
              boxShadow:
                '0 18px 50px -12px rgba(0,0,0,0.72), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.03)',
            }}
            className="absolute right-0 top-full z-40 mt-1.5 min-w-[14rem] origin-top-right rounded-md border border-zinc-700/80 ui-modal-surface backdrop-blur-md p-1"
          >
            <div className="px-2 py-1.5 border-b border-zinc-800 text-[0.625rem] uppercase tracking-[0.16em] text-zinc-500">
              Thumbnail quality
            </div>
            <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-0.5">
              {THUMB_QUALITY_ORDER.map((t) => {
                const meta = THUMB_QUALITY_LABELS[t];
                const active = t === tier;
                const hovered = t === highlight;
                return (
                  <button
                    key={t}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    data-tier={t}
                    onMouseEnter={() => setHighlight(t)}
                    onClick={() => {
                      setTier(t);
                      setOpen(false);
                    }}
                    className={`relative flex w-full items-center justify-between rounded-sm pl-3 pr-2 py-1.5 text-left transition-colors duration-[100ms] ${
                      active
                        ? 'text-cyan-100'
                        : hovered
                          ? 'bg-zinc-800/60 text-zinc-100'
                          : 'text-zinc-300'
                    }`}
                  >
                    {active && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-cyan-400"
                      />
                    )}
                    <span className="text-xs font-medium">{meta.label}</span>
                    <span
                      className={`font-mono text-[0.625rem] tabular-nums ${
                        active ? 'text-cyan-300/70' : 'text-zinc-500'
                      }`}
                    >
                      {meta.sublabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
