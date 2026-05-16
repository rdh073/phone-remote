import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Download,
  Eraser,
  Info,
  Keyboard,
  Layers,
  Lock,
  Power,
  Radio,
  Search,
  Terminal,
  Type,
  Unplug,
  X,
} from 'lucide-react';
import { useActivityStore, type ActivityEvent, type ActivityKind, type ActivityOutcome } from '../stores/activity';

const OUTCOME_KEYS: ActivityOutcome[] = ['ok', 'partial', 'error', 'info'];

export function ActivityDrawer() {
  const open = useActivityStore((s) => s.drawerOpen);
  const close = useActivityStore((s) => s.setDrawerOpen);
  const events = useActivityStore((s) => s.events);
  const clear = useActivityStore((s) => s.clear);

  const [kindFilter, setKindFilter] = useState<Set<ActivityKind>>(new Set());
  const [outcomeFilter, setOutcomeFilter] = useState<Set<ActivityOutcome>>(new Set());
  const [targetFilter, setTargetFilter] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState<number>(-1);

  // Kinds shown in the chip rail are derived from what's actually been logged.
  const availableKinds = useMemo<ActivityKind[]>(() => {
    const set = new Set<ActivityKind>();
    for (const ev of events) set.add(ev.kind);
    const order: ActivityKind[] = ['reboot', 'disconnect', 'screenshot', 'shell', 'rename', 'sync', 'scene', 'pair', 'lock', 'type'];
    return order.filter((k) => set.has(k));
  }, [events]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((ev) => {
      if (kindFilter.size > 0 && !kindFilter.has(ev.kind)) return false;
      if (outcomeFilter.size > 0 && !outcomeFilter.has(ev.outcome)) return false;
      if (targetFilter && ev.target !== targetFilter) return false;
      if (q) {
        const hay = `${ev.kind} ${ev.target ?? ''} ${typeof ev.detail === 'string' ? ev.detail : ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, kindFilter, outcomeFilter, targetFilter, query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
        return;
      }
      // Skip nav keys while the operator is typing into the drawer's search box.
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (filtered.length === 0) return;
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setFocused((i) => (i < 0 ? 0 : Math.min(i + 1, filtered.length - 1)));
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocused((i) => Math.max((i < 0 ? 0 : i) - 1, 0));
      } else if (e.key === 'Enter') {
        if (focused < 0) return;
        const ev = filtered[focused];
        if (!ev?.target) return;
        e.preventDefault();
        setTargetFilter((cur) => (cur === ev.target ? null : ev.target!));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close, filtered, focused]);

  // Clamp focused index when filters shrink the list.
  useEffect(() => {
    if (focused >= filtered.length) setFocused(filtered.length > 0 ? filtered.length - 1 : -1);
  }, [filtered.length, focused]);

  // Reset focus when the drawer opens fresh.
  useEffect(() => {
    if (open) setFocused(-1);
  }, [open]);

  if (!open) return null;

  const filtersActive = kindFilter.size > 0 || outcomeFilter.size > 0 || query.trim().length > 0 || targetFilter !== null;
  const toggle = <T,>(set: Set<T>, value: T, setter: (v: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  };

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) close(false);
      }}
      className="fixed inset-0 z-[57] ui-modal-overlay ui-modal-overlay-40 backdrop-blur-[2px]"
    >
      <aside
        role="dialog"
        aria-label="Activity"
        style={{ animation: 'drawer-in 180ms cubic-bezier(0.16, 1, 0.3, 1)' }}
        className="absolute right-0 top-0 bottom-0 w-[360px] max-w-[calc(100vw-2rem)] border-l border-zinc-800 bg-zinc-950 ui-modal-surface backdrop-blur-md shadow-[0_0_0_1px_rgba(255,255,255,0.04),-24px_0_60px_-16px_rgba(0,0,0,0.7)] flex flex-col"
      >
        <header className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-zinc-800/70">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold text-zinc-100">Activity</h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              last {Math.min(events.length, 100)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {events.length > 0 && (
              <button
                type="button"
                onClick={() => exportCsv(filtered)}
                className="h-7 inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 ui-chip-surface px-2 text-[11px] text-zinc-400 hover:text-cyan-200 hover:border-cyan-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60"
                title="Export as CSV"
              >
                <Download size={11} />
                csv
              </button>
            )}
            {events.length > 0 && (
              <button
                type="button"
                onClick={clear}
                className="h-7 inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 ui-chip-surface px-2 text-[11px] text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60"
                title="Clear all"
              >
                <Eraser size={11} />
                clear
              </button>
            )}
            <button
              type="button"
              onClick={() => close(false)}
              aria-label="Close activity"
              className="h-7 w-7 inline-flex items-center justify-center rounded border border-zinc-800 bg-zinc-900 ui-chip-surface text-zinc-500 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60"
            >
              <X size={14} />
            </button>
          </div>
        </header>
        {events.length > 0 && (
          <div className="px-3 pt-2 pb-2 border-b border-zinc-800/70 space-y-1.5">
            <label className="relative block">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && query) {
                    e.preventDefault();
                    e.stopPropagation();
                    setQuery('');
                  }
                }}
                placeholder="Filter target, detail, kind…"
                aria-label="Search activity"
              className="h-7 w-full bg-zinc-900 ui-popover-surface border border-zinc-800 rounded pl-7 pr-2 text-[11px] font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/45 focus-visible:ring-2 focus-visible:ring-cyan-500/40"
              />
            </label>
            <div className="flex flex-wrap gap-1">
              {availableKinds.map((k) => {
                const active = kindFilter.has(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggle(kindFilter, k, setKindFilter)}
                    aria-pressed={active}
                    className={`h-6 inline-flex items-center gap-1 rounded border px-1.5 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors duration-[100ms] ${
                      active
                    ? 'border-cyan-500/45 bg-cyan-500/10 text-cyan-100'
                    : 'border-zinc-800 bg-zinc-900 ui-chip-surface text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {kindLabel(k)}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1">
              {OUTCOME_KEYS.map((o) => {
                const active = outcomeFilter.has(o);
                const tone = outcomeTone(o);
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => toggle(outcomeFilter, o, setOutcomeFilter)}
                    aria-pressed={active}
                    className={`h-6 inline-flex items-center gap-1.5 rounded border px-1.5 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors duration-[100ms] ${
                    active
                        ? 'border-zinc-700 bg-zinc-900 ui-chip-surface text-zinc-100'
                        : 'border-zinc-800 bg-zinc-900 ui-chip-surface text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                    {o}
                  </button>
                );
              })}
              {filtersActive && (
                <button
                  type="button"
                  onClick={() => {
                    setKindFilter(new Set());
                    setOutcomeFilter(new Set());
                    setQuery('');
                    setTargetFilter(null);
                  }}
                  className="h-6 inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 ui-chip-surface px-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500 hover:text-rose-200 hover:border-rose-500/40"
                  title="Clear filters"
                >
                  reset
                </button>
              )}
            </div>
            {targetFilter && (
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">target</span>
                <button
                  type="button"
                  onClick={() => setTargetFilter(null)}
                  title="Click to clear target filter"
                  className="group inline-flex max-w-full items-center gap-1 rounded border border-cyan-500/45 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] text-cyan-100 hover:border-rose-500/45 hover:bg-rose-500/10 hover:text-rose-100"
                >
                  <span className="truncate max-w-[200px]">{targetFilter}</span>
                  <X size={10} className="opacity-60 group-hover:opacity-100" />
                </button>
              </div>
            )}
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
          {events.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center px-6">
              <div>
                <p className="text-xs text-zinc-400">No activity yet.</p>
                <p className="mt-1 text-[11px] text-zinc-600">
                  Actions like reboot, disconnect, and scene changes land here.
                </p>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center px-6">
              <p className="text-[11px] text-zinc-500">
                No events match the current filters.
                {query && <span className="block mt-1 font-mono text-[10px] text-zinc-600">query: "{query}"</span>}
              </p>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((ev, i) => (
                <li key={ev.id}>
                  <Row
                    event={ev}
                    onPickTarget={setTargetFilter}
                    activeTarget={targetFilter}
                    focused={i === focused}
                    onHover={() => setFocused(i)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function Row({
  event,
  onPickTarget,
  activeTarget,
  focused,
  onHover,
}: {
  event: ActivityEvent;
  onPickTarget: (target: string | null) => void;
  activeTarget: string | null;
  focused: boolean;
  onHover: () => void;
}) {
  const Icon = kindIcon(event.kind);
  const tone = outcomeTone(event.outcome);
  const label = useRelativeTime(event.at);
  const isActive = event.target && activeTarget === event.target;
  const ref = useRef<HTMLDivElement | null>(null);
  // Keep the keyboard-focused row scrolled into view as j/k advance past the edge.
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [focused]);
  return (
    <div
      ref={ref}
      onMouseEnter={onHover}
      className={`flex items-start gap-2.5 rounded px-2 py-2 transition-colors duration-[100ms] ui-chip-surface ${
        focused ? 'bg-cyan-500/10 ring-1 ring-cyan-500/30' : 'hover:bg-zinc-900/60'
      }`}
      title={new Date(event.at).toLocaleString()}
    >
      <span className={`mt-0.5 shrink-0 ${tone.icon}`}>
        <Icon size={13} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-zinc-200 leading-tight flex items-baseline flex-wrap gap-x-1">
          <span className="font-medium">{kindLabel(event.kind)}</span>
          {event.target && (
            <>
              <span className="text-zinc-600">·</span>
              <button
                type="button"
                onClick={() => onPickTarget(isActive ? null : event.target!)}
                title={isActive ? 'Click to clear target filter' : `Filter activity to ${event.target}`}
                className={`font-mono rounded px-1 -mx-1 ui-chip-surface transition-colors duration-[120ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 ${
                  isActive
                    ? 'bg-cyan-500/15 text-cyan-100'
                    : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
                }`}
              >
                {event.target}
              </button>
            </>
          )}
        </p>
        {event.detail && (
          <p className="mt-0.5 text-[11px] text-zinc-500 leading-snug break-words">{event.detail}</p>
        )}
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-label={event.outcome} />
        <span className="font-mono text-[10px] text-zinc-600 tabular-nums">{label}</span>
      </div>
    </div>
  );
}

function useRelativeTime(at: number): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, []);
  return useMemo(() => relTime(now - at), [now, at]);
}

function relTime(deltaMs: number): string {
  const s = Math.floor(deltaMs / 1000);
  if (s < 5) return 'now';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function kindIcon(kind: ActivityKind): (props: { size: number }) => ReactNode {
  switch (kind) {
    case 'reboot': return Power;
    case 'disconnect': return Unplug;
    case 'screenshot': return Camera;
    case 'shell': return Terminal;
    case 'rename': return Type;
    case 'sync': return Radio;
    case 'scene': return Layers;
    case 'pair': return CheckCircle2;
    case 'lock': return Lock;
    case 'type': return Keyboard;
  }
}

function kindLabel(kind: ActivityKind): string {
  switch (kind) {
    case 'reboot': return 'Reboot';
    case 'disconnect': return 'Disconnect';
    case 'screenshot': return 'Screenshot';
    case 'shell': return 'Shell';
    case 'rename': return 'Rename';
    case 'sync': return 'Sync';
    case 'scene': return 'Scene';
    case 'pair': return 'Pair';
    case 'lock': return 'Lock';
    case 'type': return 'Type';
  }
}

function outcomeTone(outcome: ActivityOutcome): { icon: string; dot: string } {
  switch (outcome) {
    case 'ok': return { icon: 'text-emerald-300', dot: 'bg-emerald-400' };
    case 'partial': return { icon: 'text-amber-300', dot: 'bg-amber-400' };
    case 'error': return { icon: 'text-rose-300', dot: 'bg-rose-400' };
    case 'info': return { icon: 'text-cyan-300', dot: 'bg-cyan-400' };
  }
}

// Re-export so callers can switch icons via JSX easily.
const AlertTriangleNamed = AlertTriangle;
const InfoNamed = Info;
void AlertTriangleNamed;
void InfoNamed;

function exportCsv(events: ActivityEvent[]): void {
  if (events.length === 0) return;
  const header = ['timestamp_iso', 'kind', 'target', 'outcome', 'detail'];
  const rows = events.map((ev) => [
    new Date(ev.at).toISOString(),
    ev.kind,
    ev.target ?? '',
    ev.outcome,
    typeof ev.detail === 'string' ? ev.detail : '',
  ]);
  const csv = [header, ...rows]
    .map((cols) => cols.map(csvField).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace(/T/, '-')
    .replace(/Z$/, '');
  a.href = url;
  a.download = `phone-remote-activity-${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvField(value: string): string {
  if (value === '') return '';
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
