import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useLayoutStore } from '../stores/layout';

type Chord = { keys: string[]; label: string };
type Group = { title: string; chords: Chord[] };

const GROUPS: Group[] = [
  {
    title: 'Navigation',
    chords: [
      { keys: ['H'], label: 'Move cursor left' },
      { keys: ['J'], label: 'Move cursor down (by row)' },
      { keys: ['K'], label: 'Move cursor up (by row)' },
      { keys: ['L'], label: 'Move cursor right' },
      { keys: ['↑', '↓', '←', '→'], label: 'Same as H/J/K/L' },
      { keys: ['/'], label: 'Focus device search' },
    ],
  },
  {
    title: 'Selection',
    chords: [
      { keys: ['Space'], label: 'Toggle selection on cursor device' },
      { keys: ['Shift', '·', 'Click'], label: 'Toggle selection on a tile or row' },
      { keys: ['Esc'], label: 'Clear selection' },
      { keys: ['S'], label: 'Toggle sync mode (broadcast input to selected)' },
    ],
  },
  {
    title: 'Scenes',
    chords: [
      { keys: ['1-9'], label: 'Switch to saved scene 1–9' },
      { keys: ['0'], label: 'Switch to All (default scene)' },
    ],
  },
  {
    title: 'Detail / streaming',
    chords: [
      { keys: ['F'], label: 'Open cursor device in detail modal' },
      { keys: ['Esc'], label: 'Close detail modal' },
      { keys: ['←', '/', 'P'], label: 'Prev device (in detail)' },
      { keys: ['→', '/', 'N'], label: 'Next device (in detail)' },
      { keys: ['R'], label: 'Retry cursor device stream' },
      { keys: ['Shift', '·', 'L'], label: 'Lock/unlock input on cursor device' },
      { keys: ['Click', '↗'], label: 'Open tile in detail (expand icon)' },
    ],
  },
  {
    title: 'Command palette',
    chords: [
      { keys: ['⌘', '·', 'K'], label: 'Open command palette (or Ctrl+K)' },
    ],
  },
  {
    title: 'Display modes',
    chords: [
      { keys: ['B'], label: 'Toggle sidebar' },
      { keys: ['W'], label: 'Toggle wallboard mode (chrome-free grid)' },
      { keys: [','], label: 'Toggle activity drawer' },
      { keys: ["'"], label: 'Toggle scratchpad (shift notes)' },
    ],
  },
  {
    title: 'Help',
    chords: [
      { keys: ['?'], label: 'Toggle this overlay' },
    ],
  },
];

export function ShortcutsOverlay() {
  const open = useLayoutStore((s) => s.shortcutsOpen);
  const setOpen = useLayoutStore((s) => s.setShortcutsOpen);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      className="fixed inset-0 z-[55] flex items-center justify-center ui-modal-overlay ui-modal-overlay-72 backdrop-blur-sm p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        style={{
          animation: 'cols-menu-in 140ms cubic-bezier(0.16, 1, 0.3, 1)',
          boxShadow:
            '0 24px 60px -16px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.03)',
        }}
        className="w-full max-w-xl rounded-lg border border-zinc-700/80 ui-modal-surface backdrop-blur-md overflow-hidden"
      >
        <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-zinc-800/70">
          <div className="flex items-baseline gap-2">
            <h2 id="shortcuts-title" className="text-sm font-semibold text-zinc-100">
              Keyboard shortcuts
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              press ? to toggle
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close shortcuts"
            className="h-7 w-7 inline-flex items-center justify-center rounded ui-chip-surface hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60"
          >
            <X size={14} />
          </button>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 px-5 py-4 max-h-[70vh] overflow-y-auto">
          {GROUPS.map((group) => (
            <section key={group.title} className="space-y-1.5">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                {group.title}
              </h3>
              <dl className="space-y-1">
                {group.chords.map((chord, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-3 py-0.5">
                    <dt className="flex items-center gap-1">
                      {chord.keys.map((k, i) =>
                        k === '·' ? (
                          <span key={i} className="text-zinc-600 text-[10px] mx-0.5">
                            +
                          </span>
                        ) : (
                          <kbd
                            key={i}
                            className="inline-flex min-w-[1.4rem] h-5 items-center justify-center rounded ui-chip-surface px-1.5 font-mono text-[10px] text-zinc-200 tabular-nums"
                          >
                            {k}
                          </kbd>
                        ),
                      )}
                    </dt>
                    <dd className="text-[12px] text-zinc-400 text-right leading-tight">
                      {chord.label}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
