import { useEffect, useRef, useState } from 'react';
import { useDialogStore, type DialogRequest } from '../stores/dialog';

export function DialogHost() {
  const top = useDialogStore((s) => s.queue[0]);
  const resolveTop = useDialogStore((s) => s.resolveTop);

  if (!top) return null;
  return <DialogShell key={top.id} req={top} onResolve={resolveTop} />;
}

function DialogShell({
  req,
  onResolve,
}: {
  req: DialogRequest;
  onResolve: (v: boolean | string | null) => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(req.defaultValue ?? '');

  useEffect(() => {
    if (req.kind === 'prompt') {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      confirmRef.current?.focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onResolve(req.kind === 'prompt' ? null : false);
      } else if (e.key === 'Enter') {
        const tag = (document.activeElement as HTMLElement | null)?.tagName;
        if (req.kind === 'prompt' && tag === 'INPUT') {
          e.preventDefault();
          onResolve(draft.trim());
          return;
        }
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        onResolve(req.kind === 'prompt' ? draft.trim() : true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onResolve, req.kind, draft]);

  const danger = req.danger;
  const confirmTone = danger
    ? 'bg-rose-500/15 border-rose-500/45 text-rose-100 hover:bg-rose-500/25 focus-visible:ring-rose-500/60'
    : 'bg-cyan-500/15 border-cyan-500/45 text-cyan-100 hover:bg-cyan-500/25 focus-visible:ring-cyan-500/60';

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onResolve(req.kind === 'prompt' ? null : false);
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center ui-modal-overlay ui-modal-overlay-72 backdrop-blur-sm p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${req.id}-title`}
        style={{
          animation: 'cols-menu-in 140ms cubic-bezier(0.16, 1, 0.3, 1)',
          boxShadow:
            '0 24px 60px -16px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.03)',
        }}
        className="w-full max-w-md rounded-lg border border-zinc-700/80 ui-modal-surface backdrop-blur-md"
      >
        <div className="px-5 pt-4 pb-3 border-b border-zinc-800/70">
          <h2 id={`${req.id}-title`} className="text-sm font-semibold text-zinc-100">
            {req.title}
          </h2>
        </div>
        {req.body && (
          <div className="px-5 py-3 text-[0.8125rem] leading-relaxed text-zinc-300 whitespace-pre-wrap break-words max-h-[60vh] overflow-y-auto">
            {req.body}
          </div>
        )}
        {req.kind === 'prompt' && (
          <div className="px-5 pb-3 pt-1">
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={req.placeholder}
              maxLength={req.maxLength}
              className="w-full h-9 rounded border border-zinc-700/80 ui-popover-surface px-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 font-mono focus:outline-none focus:border-cyan-500 focus-visible:ring-2 focus-visible:ring-cyan-500/40"
            />
          </div>
        )}
        <div className="flex items-center justify-end gap-2 px-5 pt-2 pb-4">
          {(req.kind === 'confirm' || req.kind === 'prompt') && (
            <button
              type="button"
              onClick={() => onResolve(req.kind === 'prompt' ? null : false)}
              className="h-8 rounded ui-chip-surface px-3 text-xs text-zinc-300 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 transition-colors"
            >
              {req.cancelLabel}
            </button>
          )}
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onResolve(req.kind === 'prompt' ? draft.trim() : true)}
            className={`h-8 rounded border px-3 text-xs font-medium focus:outline-none focus-visible:ring-2 transition-colors ${confirmTone}`}
          >
            {req.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
