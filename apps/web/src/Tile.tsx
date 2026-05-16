import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { ClientMessage, Device } from '@phone-remote/protocol';
import { Check, Lock, Smartphone } from 'lucide-react';
import { ExpandIcon } from './icons/Expand';

import { useScrcpyStream, type StreamHealth, type StreamRes, type StreamStats } from './hooks/useScrcpyStream';
import type { VideoMeta } from './hooks/useScrcpyStream';
import { useReconnectStore } from './stores/reconnect';
import { colorBgClass, useColorsStore } from './stores/colors';
import { RotateCw } from 'lucide-react';
import { useControlsStore } from './stores/controls';
import { useContextMenuStore } from './stores/contextMenu';
import { useDevicesStore } from './stores/devices';
import { useInputLockStore } from './stores/inputLock';
import { useLabelsStore } from './stores/labels';
import { useSettingsStore } from './stores/settings';
import { promptDialog } from './stores/dialog';
import { broadcastFrom } from './lib/fanout';
import { deviceContextMenuItems } from './lib/deviceContextMenu';
import { notifyMany, subscribe as subscribeRipples } from './lib/ripples';
import { buildTouchMessage } from './lib/touch';

type Props = {
  serial: string;
  res: StreamRes;
  className?: string;
  /** When true (Detail/modal), the tile fills its parent; otherwise it imposes a device-aware aspect ratio. */
  fill?: boolean;
};

export function Tile({ serial, res, className, fill = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const device = useDevicesStore((s) => s.devices.find((d) => d.serial === serial));
  const selected = useDevicesStore((s) => s.selectedSerials.has(serial));
  const cursor = useDevicesStore((s) => s.cursorSerial === serial);
  const toggleSelected = useDevicesStore((s) => s.toggleSelected);
  const enterDetail = useDevicesStore((s) => s.enterDetail);
  const sync = useControlsStore((s) => s.sync);
  const locked = useInputLockStore((s) => s.lockedSerials.includes(serial));
  const showStatsInGrid = useSettingsStore((s) => s.showStatsInGrid);
  const pauseOffscreenStreams = useSettingsStore((s) => s.pauseOffscreenStreams);

  // Detail mode (`fill`) never pauses — we explicitly opened that tile. Grid
  // tiles pause when scrolled out of view *and* the setting is enabled.
  const [offscreen, setOffscreen] = useState(false);
  const hideTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (fill || !pauseOffscreenStreams) {
      setOffscreen(false);
      return;
    }
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            // Resume immediately — operator just scrolled the tile into view.
            if (hideTimerRef.current) {
              window.clearTimeout(hideTimerRef.current);
              hideTimerRef.current = undefined;
            }
            setOffscreen(false);
          } else {
            // Debounce going-offscreen so quick scroll-throughs don't churn
            // WS reconnects. 500ms feels right — long enough to ignore flicks,
            // short enough that abandoned tiles release resources quickly.
            if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
            hideTimerRef.current = window.setTimeout(() => setOffscreen(true), 500);
          }
        }
      },
      // Pre-load tiles slightly before they enter the viewport so the operator
      // sees pixels by the time the tile is centered.
      { rootMargin: '200px 0px' },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = undefined;
      }
    };
  }, [fill, pauseOffscreenStreams]);

  const paused = !fill && pauseOffscreenStreams && offscreen;
  const { meta, error, send, health, stats } = useScrcpyStream({ serial, res, canvasRef, paused });
  const metaRef = useRef(meta);
  const [lockFlash, setLockFlash] = useState(false);
  const lockFlashTimer = useRef<number | undefined>(undefined);
  const flashLock = () => {
    setLockFlash(true);
    if (lockFlashTimer.current) window.clearTimeout(lockFlashTimer.current);
    lockFlashTimer.current = window.setTimeout(() => setLockFlash(false), 380);
  };
  useEffect(() => () => {
    if (lockFlashTimer.current) window.clearTimeout(lockFlashTimer.current);
  }, []);

  const status = statusOf(device);
  const model = device?.model ?? '';
  const label = useLabelsStore((s) => s.labels[serial]);
  const displayName = label || model || serial;
  const color = useColorsStore((s) => s.colors[serial]);
  const location = device?.tailnet
    ? [device.tailnet.location, device.tailnet.site, device.tailnet.region, device.tailnet.name]
        .filter(Boolean)
        .join(' / ')
    : undefined;

  const sendBroadcasted = (msg: ClientMessage) => {
    send(msg);
    if (!useControlsStore.getState().sync) return;
    broadcastFrom(serial, msg, useDevicesStore.getState().selectedSerials);
  };

  const sendTouch = (
    e: ReactPointerEvent<HTMLCanvasElement>,
    action: 'down' | 'up' | 'move',
  ): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Tango writes real dimensions onto canvas.width/height once it decodes the SPS.
    // metaRef can be stale at {0,0} when the hub sent video-meta before the codec
    // had parsed the first config packet. Prefer the canvas, fall back to meta.
    const videoMeta = {
      width: canvas.width || metaRef.current?.width || 1,
      height: canvas.height || metaRef.current?.height || 1,
    };
    const message = buildTouchMessage(
      action,
      {
        pointerType: e.pointerType,
        pointerId: e.pointerId,
        clientX: e.clientX,
        clientY: e.clientY,
        pressure: e.pressure,
        buttons: e.buttons,
      },
      canvas.getBoundingClientRect(),
      videoMeta,
    );
    if (!message) return;
    sendBroadcasted(message);

    // Tap ripple on down only — burst once per gesture, not on every move sample.
    if (action === 'down') {
      const targets = new Set<string>([serial]);
      if (useControlsStore.getState().sync) {
        for (const t of useDevicesStore.getState().selectedSerials) targets.add(t);
      }
      notifyMany(targets, message.x, message.y);
    }
  };

  useEffect(() => {
    metaRef.current = meta;
  }, [meta]);

  const onCanvasPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.shiftKey) {
      e.preventDefault();
      toggleSelected(serial);
      return;
    }
    if (locked) {
      e.preventDefault();
      flashLock();
      return;
    }
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    sendTouch(e, 'down');
  };

  const onCanvasPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (locked) return;
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    sendTouch(e, 'move');
  };

  const onCanvasPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (locked) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    sendTouch(e, 'up');
  };

  const onContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!device) return;
    e.preventDefault();
    const items = deviceContextMenuItems({
      device,
      label,
      selected,
      onStartRename: async () => {
        const next = await promptDialog({
          title: `Rename ${device.model || serial}`,
          body: 'A friendly label visible everywhere this device shows up. Leave empty to clear.',
          defaultValue: label ?? '',
          placeholder: device.model || serial,
          confirmLabel: 'Save',
          maxLength: 48,
        });
        if (next === null) return;
        useLabelsStore.getState().setLabel(serial, next);
      },
    });
    useContextMenuStore.getState().open(items, e.clientX, e.clientY);
  };

  // Cursor and selection layered as outline (offset 2px) instead of fighting
  // for the border itself: cursor outlines cyan, selection outlines emerald,
  // both can coexist visually with the base zinc-800 border.
  const stateClass = (() => {
    const base = 'border-zinc-800 hover:border-zinc-700';
    if (cursor) {
      return `${base} outline outline-2 outline-offset-2 outline-cyan-400`;
    }
    if (selected && sync) {
      return `${base} outline outline-2 outline-offset-2 outline-emerald-500 shadow-[0_0_24px_-6px_rgba(16,185,129,0.4)]`;
    }
    if (selected) {
      return `${base} outline outline-2 outline-offset-2 outline-emerald-600`;
    }
    return base;
  })();

  const aspectStyle = fill ? undefined : { aspectRatio: '9 / 16' };

  return (
    <div
      ref={rootRef}
      className={`group relative flex flex-col rounded-md overflow-hidden bg-zinc-900 ui-modal-surface border transition-colors duration-[140ms] ${stateClass} ${className ?? ''}`}
      style={aspectStyle}
      onContextMenu={onContextMenu}
    >
      <div className="relative flex-1 bg-black overflow-hidden">
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-red-400 text-xs p-2 text-center z-10 pointer-events-none">
            {error}
          </div>
        )}
        <canvas
          ref={canvasRef}
          width={meta?.width ?? 1080}
          height={meta?.height ?? 1920}
          aria-label={`${displayName} screen`}
          style={{ touchAction: 'none' }}
          className={`w-full h-full object-contain touch-none ${locked ? 'cursor-not-allowed' : 'cursor-touch'}`}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerCancel={onCanvasPointerUp}
        />
        <RippleLayer serial={serial} />
        <StatusBadge kind={status} />
        {selected && <SelectedBadge sync={sync} />}
        {locked && <LockedBadge flash={lockFlash} />}
        <HealthPulse health={health} selected={selected} serial={serial} />
        {color && (
          <span
            aria-hidden
            className={`absolute top-1.5 left-1.5 z-10 h-2 w-2 rounded-full ${colorBgClass(color)} shadow-[0_0_0_2px_rgba(0,0,0,0.4)]`}
          />
        )}
        {(fill || showStatsInGrid) && <StatsBadge stats={stats} meta={meta} compact={!fill} />}

        <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />
        <div className="absolute top-1.5 left-1.5 right-1.5 text-[10px] text-zinc-200 font-medium pointer-events-none flex justify-between">
          <span className="truncate" title={displayName}>{displayName}</span>
          {location ? (
            <span className="truncate text-zinc-500 max-w-[45%] text-right" title={location}>
              {location}
            </span>
          ) : null}
          {cursor && <span className="text-cyan-200 font-mono uppercase tracking-wider">focused</span>}
        </div>
        {(status === 'offline' || status === 'unauthorized' || status === 'unknown') && !meta && (
          <EmptyTileGlyph status={status} />
        )}
      </div>
      <button
        type="button"
        onClick={() => enterDetail(serial)}
        title="Open in Detail (or press f)"
        className="flex items-center gap-1.5 px-2 py-1.5 border-t border-zinc-800 bg-zinc-900 ui-chip-surface hover:bg-zinc-800 transition-colors duration-[120ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-inset"
      >
        <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${statusDotClass(status)}`} aria-label={status} />
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">{status}</span>
        <span className="text-[10px] truncate flex-1 text-left text-zinc-200">{displayName}</span>
        <span className="text-[10px] font-mono text-zinc-500 truncate">
          {serial.replace(/^\d+\.\d+\.\d+\./, '').replace(/:5555$/, '')}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-cyan-300 inline-flex items-center gap-1">
          Open
          <ExpandIcon size={11} />
        </span>
      </button>
    </div>
  );
}

type StatusKind = 'online' | 'offline' | 'unauthorized' | 'unknown';

function statusOf(device: Device | undefined): StatusKind {
  if (!device) return 'unknown';
  if (device.state === 'device') return 'online';
  if (device.state === 'unauthorized') return 'unauthorized';
  return 'offline';
}

function statusDotClass(kind: StatusKind): string {
  if (kind === 'online') return 'bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.18)]';
  if (kind === 'unauthorized') return 'bg-amber-500 shadow-[0_0_0_2px_rgba(245,158,11,0.18)]';
  return 'bg-zinc-600';
}

function StatusBadge({ kind }: { kind: StatusKind }) {
  if (kind === 'online') return null;
  const label = kind === 'unauthorized' ? 'UNAUTH' : kind === 'offline' ? 'OFFLINE' : '';
  if (!label) return null;
  // Refined pill: bordered + tinted bg + dot + tighter geometry — matches the
  // convergence pattern across the rest of the topbar / pane chrome.
  const tone =
    kind === 'unauthorized'
      ? 'border-amber-500/40 bg-amber-500/15 text-amber-200'
    : 'border-zinc-700 bg-zinc-900/85 ui-chip-surface text-zinc-300';
  const dot = kind === 'unauthorized' ? 'bg-amber-400' : 'bg-zinc-500';
  return (
    <span
      className={`absolute top-1.5 left-1.5 inline-flex h-5 items-center gap-1 rounded-sm border px-1.5 font-mono text-[9px] uppercase tracking-[0.12em] backdrop-blur-sm ${tone}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function EmptyTileGlyph({ status }: { status: StatusKind }) {
  const caption =
    status === 'unauthorized'
      ? 'pending authorization'
      : status === 'offline'
        ? 'offline'
        : 'no signal';
  return (
    <div className="absolute inset-0 z-[3] flex flex-col items-center justify-center gap-2 text-zinc-700 pointer-events-none">
      <Smartphone size={32} strokeWidth={1.25} />
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
        {caption}
      </span>
    </div>
  );
}

function LockedBadge({ flash }: { flash: boolean }) {
  return (
    <>
      <span
        className={`absolute bottom-1.5 left-1.5 z-10 inline-flex h-4 items-center gap-1 rounded px-1.5 border font-mono text-[9px] uppercase tracking-[0.18em] backdrop-blur-sm transition-colors duration-[140ms] ${
          flash
            ? 'border-rose-400/80 bg-rose-500/30 text-rose-50'
            : 'border-amber-400/55 bg-amber-500/15 text-amber-200'
        }`}
        aria-label="Input locked — taps and swipes are swallowed"
        title="Input locked — press Shift+L to unlock"
        style={flash ? { animation: 'lock-flash 380ms cubic-bezier(0.16, 1, 0.3, 1)' } : undefined}
      >
        <Lock size={9} strokeWidth={2.5} />
        <span>LOCKED</span>
      </span>
      {flash && (
        <span
          aria-hidden
          className="absolute inset-0 z-[6] pointer-events-none"
          style={{
            background: 'radial-gradient(circle at center, rgba(244,63,94,0.18), transparent 60%)',
            animation: 'lock-flash 380ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />
      )}
    </>
  );
}

function SelectedBadge({ sync }: { sync: boolean }) {
  const color = sync ? 'bg-emerald-500 text-zinc-950' : 'bg-zinc-700 ui-chip-surface text-zinc-100';
  return (
    <span
      className={`absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-semibold ${color}`}
      aria-label={sync ? 'selected, sync on' : 'selected'}
    >
      <Check size={11} strokeWidth={3} />
    </span>
  );
}

function RippleLayer({ serial }: { serial: string }) {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const nextIdRef = useRef(0);
  useEffect(() => {
    return subscribeRipples(serial, (x, y) => {
      const id = nextIdRef.current++;
      setRipples((cur) => [...cur, { id, x, y }]);
      window.setTimeout(() => {
        setRipples((cur) => cur.filter((r) => r.id !== id));
      }, 700);
    });
  }, [serial]);
  return (
    <div className="absolute inset-0 pointer-events-none z-[5]" aria-hidden>
      {ripples.map((r) => (
        <span
          key={r.id}
          className="absolute block rounded-full border-2 border-cyan-300"
          style={{
            left: `${r.x * 100}%`,
            top: `${r.y * 100}%`,
            width: '14%',
            paddingBottom: '14%',
            transform: 'translate(-50%, -50%) scale(0.25)',
            animation: 'ripple-out 700ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
            boxShadow: '0 0 12px rgba(34, 211, 238, 0.4)',
          }}
        />
      ))}
    </div>
  );
}

function StatsBadge({
  stats,
  meta,
  compact = false,
}: {
  stats: StreamStats;
  meta: VideoMeta | null;
  /** Compact mode drops codec/dim so the badge fits on small grid tiles. */
  compact?: boolean;
}) {
  // Mbps with 1 decimal when ≥ 1; kbps int otherwise.
  const bandwidth = stats.kbps >= 1000 ? `${(stats.kbps / 1000).toFixed(1)} Mbps` : `${stats.kbps} kbps`;
  const codec = meta ? codecLabel(meta.codec) : '—';
  const dim = meta ? `${meta.width}×${meta.height}` : '—';
  const sparkWidth = compact ? 22 : 36;
  const padClass = compact ? 'px-1.5 py-0.5 gap-1 text-[9px]' : 'px-2 py-1 gap-2 text-[10px]';
  return (
    <div
      className={`absolute bottom-1 right-1 z-10 inline-flex items-center rounded border border-zinc-700/70 bg-zinc-950/85 ui-popover-surface backdrop-blur-sm font-mono tabular-nums text-zinc-300 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.5)] ${padClass}`}
      aria-label={`Stream ${stats.fps} FPS, ${bandwidth}${compact ? '' : `, ${codec}, ${dim}`}`}
    >
      <span className="inline-flex items-center gap-1">
        <Sparkline values={stats.fpsSamples} color="rgb(34 211 238)" width={sparkWidth} height={compact ? 10 : 12} />
        <span className="text-zinc-100">{stats.fps}</span>
        {!compact && <span className="text-zinc-500">FPS</span>}
      </span>
      <span className="text-zinc-700">·</span>
      <span className="inline-flex items-center gap-1">
        <Sparkline values={stats.kbpsSamples} color="rgb(110 231 183)" width={sparkWidth} height={compact ? 10 : 12} />
        <span className="text-cyan-200">{bandwidth}</span>
      </span>
      {!compact && (
        <>
          <span className="text-zinc-700">·</span>
          <span className="text-zinc-500">{codec}</span>
          <span className="text-zinc-700">·</span>
          <span className="text-zinc-500">{dim}</span>
        </>
      )}
    </div>
  );
}

function Sparkline({
  values,
  color,
  width,
  height,
}: {
  values: number[];
  color: string;
  width: number;
  height: number;
}) {
  if (values.length < 2) {
    return (
      <svg width={width} height={height} aria-hidden className="overflow-visible">
        <line x1={0} y1={height - 0.5} x2={width} y2={height - 0.5} stroke="rgb(82 82 91)" strokeWidth={1} strokeDasharray="1 2" />
      </svg>
    );
  }
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);
  // Pad top/bottom so the line never clips at 0 or max.
  const top = 1;
  const bottom = height - 1;
  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = top + (1 - v / max) * (bottom - top);
      return `${x.toFixed(1)},${y.toFixed(2)}`;
    })
    .join(' ');
  // Fill under the line as a soft gradient backdrop for visual weight.
  const fillPoints = `0,${bottom} ${points} ${width},${bottom}`;
  const fillId = `spark-fill-${color.replace(/\W+/g, '')}`;
  return (
    <svg width={width} height={height} aria-hidden className="overflow-visible">
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={fillPoints} fill={`url(#${fillId})`} stroke="none" />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function codecLabel(code: number): string {
  // Magic-byte codec IDs from scrcpy: 'h264', 'h265', 'av01'.
  const chars = String.fromCharCode((code >> 24) & 0xff, (code >> 16) & 0xff, (code >> 8) & 0xff, code & 0xff);
  if (chars === 'h264') return 'H.264';
  if (chars === 'h265') return 'H.265';
  if (chars === 'av01') return 'AV1';
  return chars.toUpperCase();
}

function HealthPulse({ health, selected, serial }: { health: StreamHealth; selected: boolean; serial: string }) {
  if (health === 'live') return null; // green ring on every tile is visual noise; only flag deviations
  const offsetClass = selected ? 'right-6' : 'right-1.5';
  const label =
    health === 'connecting'
      ? 'CONNECTING'
      : health === 'stalled'
        ? 'STALLED'
        : health === 'paused'
          ? 'PAUSED'
          : 'NO STREAM';
  const tone =
    health === 'connecting'
      ? 'bg-cyan-500/80 ring-cyan-400/30 text-cyan-50'
      : health === 'stalled'
        ? 'bg-amber-500/85 ring-amber-400/30 text-amber-50'
        : health === 'paused'
          ? 'bg-zinc-700/85 ring-zinc-500/30 text-zinc-200 ui-chip-surface'
          : 'bg-rose-500/85 ring-rose-400/30 text-rose-50';

  // Stalled/dead → clickable retry. Connecting → spinner (not actionable).
  // Paused → expected state, not actionable (scroll to resume).
  const actionable = health === 'stalled' || health === 'dead';

  const content = (
    <>
          {health === 'connecting' ? (
        <span
          className="block w-1 h-1 rounded-full bg-zinc-200/95"
          aria-hidden
          style={{ animation: 'health-pulse 1400ms ease-in-out infinite' }}
        />
      ) : health === 'paused' ? (
        <span className="inline-flex items-center gap-[1px]" aria-hidden>
          <span className="block w-[2px] h-[7px] bg-zinc-200 rounded-[1px]" />
          <span className="block w-[2px] h-[7px] bg-zinc-200 rounded-[1px]" />
        </span>
      ) : (
        <RotateCw size={9} className="text-zinc-200/95 transition-transform group-hover/health:rotate-180 duration-300" aria-hidden />
      )}
      <span className="font-mono text-[8px] uppercase tracking-[0.16em] leading-none">{label}</span>
    </>
  );

  const className = `absolute top-1.5 ${offsetClass} z-10 inline-flex h-3.5 items-center gap-1 rounded-full px-1.5 ring-2 ${tone}`;

  if (!actionable) {
    return (
      <span
        className={className}
        style={{ animation: health === 'connecting' ? 'health-pulse 1400ms ease-in-out infinite' : undefined }}
        aria-label={`Stream ${label.toLowerCase()}`}
        title={`Stream ${label.toLowerCase()}`}
      >
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        useReconnectStore.getState().bump(serial);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={`group/health hover:brightness-110 active:scale-95 transition-transform focus:outline-none focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${className}`}
      aria-label={`Stream ${label.toLowerCase()} — click to retry`}
      title="Click to retry connection"
    >
      {content}
    </button>
  );
}
