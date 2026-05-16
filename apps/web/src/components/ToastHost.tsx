import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useToastsStore, type Toast } from '../stores/toasts';

export function ToastHost() {
  const toasts = useToastsStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-4 right-4 z-[65] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  const dismiss = useToastsStore((s) => s.dismiss);
  const [exiting, setExiting] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const pausedRef = useRef(false);

  const startTimer = (ms: number) => {
    if (ms <= 0) return;
    timer.current = window.setTimeout(() => {
      setExiting(true);
      window.setTimeout(() => dismiss(toast.id), 160);
    }, ms);
  };
  const clearTimer = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = undefined;
  };

  // Re-derive the auto-dismiss timer on every duration change. A pinned toast
  // never auto-dismisses; once unpinned (e.g. progress completes), the timer
  // resumes against the new duration.
  useEffect(() => {
    clearTimer();
    if (!toast.pinned && !pausedRef.current) startTimer(toast.durationMs);
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.durationMs, toast.pinned]);

  const onMouseEnter = () => {
    if (pausedRef.current) return;
    pausedRef.current = true;
    clearTimer();
  };
  const onMouseLeave = () => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    if (!toast.pinned) startTimer(toast.durationMs);
  };

  const close = () => {
    setExiting(true);
    clearTimer();
    window.setTimeout(() => dismiss(toast.id), 140);
  };

  const { tone, Icon, ring } = byKind[toast.kind];

  return (
    <div
      role="status"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        animation: exiting
          ? 'toast-out 140ms cubic-bezier(0.4, 0, 1, 1) forwards'
          : 'toast-in 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        boxShadow: `0 12px 30px -10px rgba(0,0,0,0.6), 0 0 0 1px ${ring}, inset 0 1px 0 rgba(255,255,255,0.04)`,
      }}
      className={`pointer-events-auto relative w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border ${tone.border} ui-modal-surface backdrop-blur-md`}
    >
      <span aria-hidden className={`absolute left-0 top-2 bottom-2 w-0.5 rounded-r ${tone.bar}`} />
      <div className="flex items-start gap-2.5 pl-3 pr-2 py-2.5">
        <Icon size={14} className={`mt-0.5 shrink-0 ${tone.icon}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-[12.5px] leading-tight font-medium ${tone.title}`}>{toast.title}</p>
          {toast.description && (
            <div className="mt-0.5 text-[11px] leading-relaxed text-zinc-400 break-words">
              {toast.description}
            </div>
          )}
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action!.onClick();
                close();
              }}
              className={`mt-1.5 inline-flex h-6 items-center rounded border px-2 text-[10.5px] font-mono uppercase tracking-[0.08em] ${tone.action} focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60`}
            >
              {toast.action.label}
            </button>
          )}
          {toast.progress && (
            <div className="mt-2">
              <div className="h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full ${tone.bar} transition-[width] duration-[180ms] ease-out`}
                  style={{
                    width: `${Math.min(100, Math.round((toast.progress.current / Math.max(1, toast.progress.total)) * 100))}%`,
                  }}
                  role="progressbar"
                  aria-valuenow={toast.progress.current}
                  aria-valuemin={0}
                  aria-valuemax={toast.progress.total}
                />
              </div>
              <div className="mt-1 flex items-baseline justify-between font-mono text-[10px] tabular-nums text-zinc-500">
                <span>{toast.progress.current} / {toast.progress.total}</span>
                <span>{Math.round((toast.progress.current / Math.max(1, toast.progress.total)) * 100)}%</span>
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Dismiss"
          className="shrink-0 h-5 w-5 inline-flex items-center justify-center rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/60"
        >
          <X size={11} />
        </button>
      </div>
    </div>
  );
}

const byKind = {
  success: {
    tone: {
      border: 'border-emerald-500/30',
      bar: 'bg-emerald-400',
      icon: 'text-emerald-300',
      title: 'text-emerald-50',
      action: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20',
    },
    Icon: CheckCircle2,
    ring: 'rgba(16,185,129,0.18)',
  },
  error: {
    tone: {
      border: 'border-rose-500/35',
      bar: 'bg-rose-400',
      icon: 'text-rose-300',
      title: 'text-rose-50',
      action: 'border-rose-500/40 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20',
    },
    Icon: AlertTriangle,
    ring: 'rgba(244,63,94,0.20)',
  },
  info: {
    tone: {
      border: 'border-cyan-500/30',
      bar: 'bg-cyan-400',
      icon: 'text-cyan-300',
      title: 'text-zinc-50',
      action: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20',
    },
    Icon: Info,
    ring: 'rgba(6,182,212,0.18)',
  },
} as const;
