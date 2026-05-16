import { useEffect, useRef, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { SCRATCHPAD_MAX, useScratchpadStore } from '../stores/scratchpad';

/**
 * Floating shift-level notes widget. Holds operator scratch — TODOs, handoff
 * notes, ad-hoc observations — that doesn't belong on any single device. Text
 * persists across reloads; the open/closed state is session-local so the widget
 * doesn't pop open on every page load.
 */
export function ScratchPad() {
  const open = useScratchpadStore((s) => s.open);
  const setOpen = useScratchpadStore((s) => s.setOpen);
  const text = useScratchpadStore((s) => s.text);
  const setText = useScratchpadStore((s) => s.setText);
  const clear = useScratchpadStore((s) => s.clear);
  const [draft, setDraft] = useState(text);
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync draft when the persisted store changes from elsewhere (e.g., clear).
  useEffect(() => {
    setDraft(text);
  }, [text]);

  // Autofocus the textarea each open so the operator can type immediately.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => textareaRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [open]);

  // Debounced save — same pattern as the device-notes section.
  const onChange = (next: string) => {
    setDraft(next);
    setSaved(false);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      setText(next);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1400);
    }, 400);
  };

  // Flush any pending edit when unmounting so unsaved text isn't lost.
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        setText(draft);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Scratchpad"
      style={{
        animation: 'cols-menu-in 140ms cubic-bezier(0.16, 1, 0.3, 1)',
        boxShadow:
          '0 18px 50px -12px rgba(0,0,0,0.72), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.03)',
      }}
      className="fixed bottom-4 left-4 z-[58] w-[300px] rounded-lg border border-zinc-700/80 ui-popover-surface backdrop-blur-md flex flex-col"
    >
      <header className="flex items-center justify-between px-3 pt-2.5 pb-2 border-b border-zinc-800/70">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[12px] font-semibold text-zinc-100">Scratchpad</h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            shift notes
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => {
              clear();
              setDraft('');
            }}
            aria-label="Clear scratchpad"
            title="Clear all"
            className="h-6 w-6 inline-flex items-center justify-center rounded text-zinc-500 hover:text-rose-200 hover:bg-rose-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60"
          >
            <Trash2 size={12} />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close scratchpad"
            title="Close (apostrophe to reopen)"
            className="h-6 w-6 inline-flex items-center justify-center rounded text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60"
          >
            <X size={12} />
          </button>
        </div>
      </header>
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        placeholder="TODO, handoff, ad-hoc observations…"
        aria-label="Scratchpad text"
        maxLength={SCRATCHPAD_MAX}
        rows={10}
        className="block w-full bg-transparent px-3 py-2.5 text-[12px] leading-relaxed font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none resize-none"
      />
      <footer className="px-3 py-1.5 border-t border-zinc-800/70 flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.14em] text-zinc-600">
        <span>{saved ? <span className="text-emerald-300">saved</span> : 'persists in browser'}</span>
        <span className="tabular-nums">{draft.length}/{SCRATCHPAD_MAX}</span>
      </footer>
    </div>
  );
}
