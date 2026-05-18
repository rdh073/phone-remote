import { useEffect, useMemo, useRef, useState } from 'react';
import { Grid2x2, LayoutGrid, MonitorSmartphone, Plus, Square, Terminal, X } from 'lucide-react';

import { useDevicesStore } from './stores/devices';
import { useLabelsStore } from './stores/labels';
import { useLayoutStore } from './stores/layout';
import { useProvisioningStore } from './stores/provisioning';
import { alertDialog, confirmDialog } from './stores/dialog';
import { toast, trackBulk } from './stores/toasts';
import { logActivity } from './stores/activity';
import { useShellHistoryStore, useTextHistoryStore } from './stores/inputHistory';
import { useDeviceActionsStore } from './stores/deviceActions';
import { Tile } from './Tile';
import { broadcastTo } from './lib/fanout';
import { rebootDevice, runShell } from './lib/api';
import { selectedPreview } from './lib/devicePreview';
import { downloadDeviceScreenshot } from './lib/download';
import { useGridKeyboard } from './hooks/useGridKeyboard';
import { useInputHistory } from './hooks/useInputHistory';
import { useVisibleDevices } from './hooks/useVisibleDevices';
import { COL_OPTIONS } from './lib/colOptions';

export function Grid() {
  const devices = useDevicesStore((s) => s.devices);
  const selectedSerials = useDevicesStore((s) => s.selectedSerials);
  const cols = useDevicesStore((s) => s.cols);
  const setCols = useDevicesStore((s) => s.setCols);
  const startProvision = useProvisioningStore((s) => s.start);

  const visible = useVisibleDevices();
  const visibleSerials = useMemo(() => visible.map((d) => d.serial), [visible]);
  useGridKeyboard(visibleSerials);
  const wallboard = useLayoutStore((s) => s.wallboard);

  return (
    <section
      id="main-content"
      tabIndex={-1}
      aria-label="Devices"
      className="flex-1 min-w-0 overflow-hidden ui-popover-surface text-zinc-100 flex flex-col focus:outline-none"
    >
      {!wallboard && (
        <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2 text-xs text-zinc-400">
          <span className="text-zinc-500">{visible.length} tile{visible.length === 1 ? '' : 's'}</span>
          <span className="flex-1" />
          <TileSizeSlider value={cols} onChange={setCols} />
          <ColsSelect value={cols} onChange={setCols} />
        </div>
      )}

      <div className={`flex-1 min-h-0 overflow-y-auto ${wallboard ? 'p-1' : 'p-3'}`}>
        {visible.length === 0 ? (
          <EmptyState onAdd={() => startProvision()} hasDevices={devices.length > 0} />
        ) : (
          <div
            className={wallboard ? 'grid gap-1' : 'grid gap-2'}
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {visible.map((d) => (
              <Tile key={d.serial} serial={d.serial} res="thumb" />
            ))}
          </div>
        )}
      </div>

      {!wallboard && selectedSerials.size > 0 && <ActionBar selectedSerials={selectedSerials} />}
    </section>
  );
}

function EmptyState({ onAdd, hasDevices }: { onAdd: () => void; hasDevices: boolean }) {
  return (
    <div className="h-full min-h-[340px] flex items-center justify-center">
      <div className="w-full max-w-xl border border-zinc-800 ui-modal-surface rounded-md p-8 text-center space-y-4">
        <h2 className="text-sm text-zinc-300 font-normal">
          {hasDevices ? 'No devices match your current filters.' : 'No devices have been paired yet.'}
        </h2>
        <p className="text-xs text-zinc-500">
          Pair one now to start remote stream control and monitoring.
        </p>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-2 rounded-md ui-chip-surface border-cyan-400/45 bg-cyan-500/15 text-cyan-100 px-3 py-2 text-xs"
        >
          <Plus size={14} />
          Add your first device
        </button>
      </div>
    </div>
  );
}

function ColsSelect({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number>(value);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset highlight to the current value every time we open.
  useEffect(() => {
    if (open) setHighlight(value);
  }, [open, value]);

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
      const idx = COL_OPTIONS.indexOf(highlight as (typeof COL_OPTIONS)[number]);
      const last = COL_OPTIONS.length - 1;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight(COL_OPTIONS[Math.min(idx + 1, last)]!);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight(COL_OPTIONS[Math.max(idx - 1, 0)]!);
      } else if (e.key === 'Home') {
        e.preventDefault();
        setHighlight(COL_OPTIONS[0]!);
      } else if (e.key === 'End') {
        e.preventDefault();
        setHighlight(COL_OPTIONS[last]!);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onChange(highlight);
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, highlight, onChange]);

  // Keep the highlighted row in view when the user arrows past the fold.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLButtonElement>(`[data-cols="${highlight}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, highlight]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Grid columns: ${value}`}
        title="Grid columns"
        className={`group h-8 inline-flex items-center gap-2 rounded-md border pl-2 pr-1.5 font-mono text-[0.7rem] tabular-nums transition-colors duration-[140ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 ${
          open
            ? 'border-cyan-500/45 text-cyan-100'
            : 'ui-chip-surface text-zinc-200 hover:border-zinc-700'
        }`}
      >
        <LayoutGrid
          size={12}
          className={open ? 'text-cyan-300' : 'text-zinc-500 group-hover:text-zinc-300 transition-colors'}
        />
        <span className="min-w-[1.25rem] text-right">{value}</span>
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
            aria-label="Close columns menu"
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
            className="absolute right-0 top-full z-40 mt-1.5 min-w-[10rem] origin-top-right rounded-md border border-zinc-700/80 ui-modal-surface backdrop-blur-md p-1"
          >
            <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-0.5">
              {COL_OPTIONS.map((n) => {
                const active = n === value;
                const hovered = n === highlight;
                const density = n <= 5 ? 'large' : n <= 10 ? 'medium' : n <= 16 ? 'dense' : 'fleet';
                return (
                  <button
                    key={n}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    data-cols={n}
                    onMouseEnter={() => setHighlight(n)}
                    onClick={() => {
                      onChange(n);
                      setOpen(false);
                    }}
                    className={`relative flex w-full items-center justify-between rounded-sm pl-3 pr-2 py-1.5 text-left font-mono text-[0.72rem] tabular-nums transition-colors duration-[100ms] ${
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
                    <span>{n} cols</span>
                    <span
                      className={`text-[0.55rem] uppercase tracking-[0.16em] ${
                        active ? 'text-cyan-300/70' : 'text-zinc-500'
                      }`}
                    >
                      {density}
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

function TileSizeSlider({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  // Slider semantics: drag LEFT  → tiles grow   → fewer per row (cols↓)
  //                   drag RIGHT → tiles shrink → more per row  (cols↑)
  // Value === cols directly. Left icon is the "big tile" end; right is the
  // dense-grid end.
  const MIN = 1;
  const MAX = 32;
  return (
    <div className="inline-flex items-center gap-1.5" title="Tile size — drag right to fit more tiles per row, left to grow them">
      <Square size={11} className="text-zinc-500" aria-hidden />
      <input
        type="range"
        min={MIN}
        max={MAX}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Tile size"
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={value}
        aria-valuetext={`${value} columns`}
        className="h-1 w-32 accent-cyan-500 cursor-pointer"
      />
      <Grid2x2 size={11} className="text-zinc-500" aria-hidden />
    </div>
  );
}

function ActionBar({ selectedSerials }: { selectedSerials: Set<string> }) {
  const clearSelection = useDevicesStore((s) => s.clearSelection);
  const serials = useMemo(() => Array.from(selectedSerials), [selectedSerials]);
  const busy = useDeviceActionsStore((s) => s.busyForTargets(serials));
  const [typed, setTyped] = useState('');
  const [shellCommand, setShellCommand] = useState('');
  const shellRecall = useInputHistory(useShellHistoryStore, shellCommand, setShellCommand);
  const textRecall = useInputHistory(useTextHistoryStore, typed, setTyped);

  const reboot = async () => {
    const devices = useDevicesStore.getState().devices;
    const labels = useLabelsStore.getState().labels;
    const ok = await confirmDialog({
      title: `Reboot ${serials.length} device${serials.length === 1 ? '' : 's'}?`,
      body:
        serials.length === 1
          ? serials[0]
          : selectedPreview(serials, devices, labels, {
              intro: 'They will reboot simultaneously.',
            }),
      confirmLabel: 'Reboot',
      danger: true,
    });
    if (!ok) return;
    const token = useDeviceActionsStore.getState().begin('reboot', serials);
    if (!token) return;
    const tracker = trackBulk({
      title: `Rebooting ${serials.length} device${serials.length === 1 ? '' : 's'}…`,
      total: serials.length,
    });
    try {
      await Promise.all(
        serials.map((s) =>
          rebootDevice(s).then(
            () => tracker.ok(),
            () => tracker.fail(),
          ),
        ),
      );
      tracker.done({
        success: { title: `Reboot issued (${serials.length})` },
        error: { title: `Reboot partial`, description: `Some devices failed to accept the command.` },
      });
    } finally {
      useDeviceActionsStore.getState().finish(token);
    }
  };

  const screenshot = async () => {
    const token = useDeviceActionsStore.getState().begin('screenshot', serials);
    if (!token) return;
    const tracker = trackBulk({
      title: `Capturing ${serials.length} screenshot${serials.length === 1 ? '' : 's'}…`,
      total: serials.length,
    });
    try {
      for (const s of serials) {
        try {
          await downloadDeviceScreenshot(s);
          tracker.ok();
        } catch {
          tracker.fail();
        }
      }
      tracker.done({
        success: { title: `Screenshot saved (${serials.length})`, description: 'Check your Downloads folder.' },
        error: { title: 'Screenshot partial', description: 'Some captures failed.' },
      });
    } finally {
      useDeviceActionsStore.getState().finish(token);
    }
  };

  const shell = async () => {
    if (!shellCommand) return;
    const command = shellCommand.trim();
    if (!command) return;
    const token = useDeviceActionsStore.getState().begin('shell', serials);
    if (!token) return;
    shellRecall.commit();
    try {
      const results = await Promise.allSettled(
        serials.map((s) =>
          runShell(s, command).then(
            (output) => ({ serial: s, output }),
            () => ({ serial: s, output: 'HTTP error' }),
          ),
        ),
      );
      const fails = results.filter((r) => r.status === 'rejected').length;
      const summary = results
        .map((r, i) =>
          `${serials[i]}: ${r.status === 'fulfilled' ? (r.value as { output: string }).output.trim() : 'failed'}`,
        )
        .join('\n\n');
      await alertDialog({
        title: `Shell output (${serials.length} device${serials.length === 1 ? '' : 's'})`,
        body: (
          <pre className="font-mono text-[11px] leading-relaxed text-zinc-200 whitespace-pre-wrap break-words">
            {summary || 'no output'}
          </pre>
        ),
      });
      logActivity({
        kind: 'shell',
        target: `${serials.length} device${serials.length === 1 ? '' : 's'}`,
        outcome: fails === 0 ? 'ok' : fails === serials.length ? 'error' : 'partial',
        detail: command.length > 80 ? `${command.slice(0, 78)}…` : command,
      });
      setShellCommand('');
    } finally {
      useDeviceActionsStore.getState().finish(token);
    }
  };


  const typeText = () => {
    if (!typed) return;
    const token = useDeviceActionsStore.getState().begin('text', serials);
    if (!token) return;
    try {
      broadcastTo(serials, { kind: 'text', text: typed });
      textRecall.commit();
      setTyped('');
    } finally {
      useDeviceActionsStore.getState().finish(token);
    }
  };

  return (
      <div className="border-t border-zinc-800 ui-modal-surface backdrop-blur px-3 py-3">
      <div className="mx-auto flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-2 rounded border border-emerald-500/35 bg-emerald-500/10 px-3 h-9 text-emerald-200">
          <MonitorSmartphone size={14} />
          <span className="font-semibold">{serials.length}</span>
          <span className="text-emerald-200/80">selected</span>
        </span>

        <button
          type="button"
          onClick={reboot}
          disabled={busy !== null}
          className="h-9 inline-flex items-center gap-1.5 px-3 rounded-md ui-chip-surface text-zinc-200 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
        >
          <Terminal size={13} />
          {busy === 'reboot' ? 'Rebooting…' : 'Reboot'}
        </button>

        <button
          type="button"
          onClick={screenshot}
          disabled={busy !== null}
          className="h-9 inline-flex items-center gap-1.5 px-3 rounded-md ui-chip-surface text-zinc-200 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
        >
          {busy === 'screenshot' ? 'Capturing…' : 'Screenshot'}
        </button>

        <div className="flex-1 min-w-0 flex items-center gap-2">
          <label className="relative flex-1 min-w-0">
            <input
              type="text"
              value={typed}
              onChange={(e) => textRecall.onChange(e.target.value)}
              onKeyDown={textRecall.onKeyDown}
              placeholder="Type text · ↑/↓ history"
              aria-label="Type text on selected devices"
              className="h-9 w-full min-w-0 ui-popover-surface border border-zinc-800 rounded-md pl-3 pr-14 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500 focus-visible:ring-2 focus-visible:ring-cyan-500"
            />
            {textRecall.position && (
              <span
                aria-hidden="true"
                className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 rounded px-1 py-0.5"
                title="Esc to return to your draft"
              >
                {textRecall.position.current}/{textRecall.position.total}
              </span>
            )}
          </label>
          <button
            type="button"
            onClick={typeText}
            disabled={!typed || busy !== null}
          className="h-9 px-3 rounded-md ui-chip-surface text-zinc-100 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          >
            Send text
          </button>
        </div>

        <div className="flex-1 min-w-[280px] flex items-center gap-2">
          <label className="relative flex-1 min-w-0">
            <input
              type="text"
              value={shellCommand}
              onChange={(e) => shellRecall.onChange(e.target.value)}
              onKeyDown={shellRecall.onKeyDown}
              placeholder="Run shell command · ↑/↓ history"
              aria-label="Shell command"
              className="h-9 w-full ui-popover-surface border border-zinc-800 rounded-md pl-3 pr-12 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500 focus-visible:ring-2 focus-visible:ring-cyan-500 font-mono text-xs"
            />
            {shellRecall.position && (
              <span
                aria-hidden="true"
                className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 rounded px-1 py-0.5"
                title="Esc to return to your draft"
              >
                {shellRecall.position.current}/{shellRecall.position.total}
              </span>
            )}
          </label>
          <button
            type="button"
            onClick={shell}
            disabled={busy !== null || !shellCommand.trim()}
          className="h-9 px-3 rounded-md ui-chip-surface disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          >
            {busy === 'shell' ? 'Running…' : 'Run shell'}
          </button>
        </div>

        <button
          type="button"
          onClick={() => clearSelection()}
          className="h-9 inline-flex items-center gap-1.5 px-3 rounded-md ui-chip-surface text-zinc-400 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
        >
          <X size={14} />
          <span className="hidden sm:inline">Clear</span>
        </button>
      </div>
    </div>
  );
}
