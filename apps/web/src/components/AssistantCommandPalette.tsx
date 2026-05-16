import { useEffect, useMemo, useRef, useState } from 'react';

import {
  filterSlashCommands,
  parseSlashCommand,
  SLASH_COMMANDS,
  type SlashCommand,
} from './AssistantSlashCommands';

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (command: SlashCommand, args: string) => void;
  /** Optional seed query string, e.g. when the user already typed `/scr` in the composer. */
  initialQuery?: string;
}

/**
 * Slash command palette — modal that mirrors cliper's CommandPalette UX:
 * type to filter, arrow keys to navigate, Enter to pick, Esc to close.
 */
export function AssistantCommandPalette({ open, onClose, onPick, initialQuery = '' }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => filterSlashCommands(query, SLASH_COMMANDS), [query]);

  useEffect(() => {
    if (activeIdx >= filtered.length) setActiveIdx(Math.max(0, filtered.length - 1));
  }, [activeIdx, filtered.length]);

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setActiveIdx(0);
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open, initialQuery]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (filtered.length === 0) return;
        setActiveIdx((i) => (i + 1) % filtered.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filtered.length === 0) return;
        setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const direct = parseSlashCommand(query);
        const picked = direct ?? (filtered[activeIdx] ? { command: filtered[activeIdx]!, args: '' } : null);
        if (picked) {
          onPick(picked.command, picked.args);
          onClose();
        }
      }
    }
    // Capture phase so we beat the Assistant's window-level Esc handler that
    // would otherwise close the panel underneath the palette.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, filtered, activeIdx, query, onClose, onPick]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center ui-modal-overlay ui-modal-overlay-60 px-4 pt-[18vh]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Slash commands"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-md border border-zinc-700 ui-modal-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-zinc-800 px-3 py-2">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
            Slash commands
          </p>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            placeholder="Type a command…"
            className="block w-full bg-transparent font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />
        </div>
        <ul className="max-h-72 overflow-auto py-1.5">
          {filtered.length === 0 && (
            <li className="px-3 py-3 text-sm text-zinc-500">No matching commands.</li>
          )}
          {filtered.map((c, i) => (
            <li key={c.command}>
              <button
                type="button"
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => {
                  onPick(c, '');
                  onClose();
                }}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors ${
                  i === activeIdx
                    ? 'bg-cyan-500/10 text-cyan-100'
                    : 'text-zinc-200 hover:bg-zinc-800/80'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono text-zinc-300">{c.command}</span>
                  {c.local && (
                    <span className="rounded-sm border border-zinc-700 px-1 font-mono text-[9px] uppercase tracking-[0.08em] text-zinc-500">
                      local
                    </span>
                  )}
                </span>
                <span className="ml-3 truncate text-[11px] text-zinc-500">{c.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
