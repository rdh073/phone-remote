import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MonitorSmartphone, X } from 'lucide-react';
import { useDevicesStore } from './stores/devices';
import { useLabelsStore } from './stores/labels';
import { useRecentDevicesStore } from './stores/recentDevices';
import { Tile } from './Tile';
import { StreamToolbar } from './StreamToolbar';
import { CollapseIcon, ExpandIcon } from './icons/Expand';
import { useVisibleDevices } from './hooks/useVisibleDevices';

export function Detail() {
  const detailSerial = useDevicesStore((s) => s.detailSerial);
  const exitDetail = useDevicesStore((s) => s.exitDetail);
  const enterDetail = useDevicesStore((s) => s.enterDetail);
  const setCursor = useDevicesStore((s) => s.setCursor);
  const device = useDevicesStore((s) =>
    detailSerial ? s.devices.find((d) => d.serial === detailSerial) : undefined,
  );
  const label = useLabelsStore((s) => (detailSerial ? s.labels[detailSerial] : undefined));
  const displayName = label || device?.model || detailSerial || '';
  const visible = useVisibleDevices();

  const { idx, prevSerial, nextSerial } = useMemo(() => {
    if (!detailSerial || visible.length === 0) return { idx: -1, prevSerial: null, nextSerial: null };
    const idx = visible.findIndex((d) => d.serial === detailSerial);
    if (idx < 0) return { idx: -1, prevSerial: null, nextSerial: null };
    const len = visible.length;
    // Single device: nav buttons are inert (no wrap-to-self surprise).
    if (len <= 1) return { idx, prevSerial: null, nextSerial: null };
    return {
      idx,
      prevSerial: visible[(idx - 1 + len) % len]!.serial,
      nextSerial: visible[(idx + 1) % len]!.serial,
    };
  }, [detailSerial, visible]);

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const goTo = useCallback(
    (serial: string | null) => {
      if (!serial) return;
      setCursor(serial);
      enterDetail(serial);
    },
    [enterDetail, setCursor],
  );

  useEffect(() => {
    if (!detailSerial) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) return; // browser handles Esc → exit fullscreen
        exitDetail();
        return;
      }
      // Skip nav while typing into the toolbar text input / notes textarea.
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowLeft' || e.key === 'p' || e.key === 'P') {
        if (!prevSerial) return;
        e.preventDefault();
        goTo(prevSerial);
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'n' || e.key === 'N') {
        if (!nextSerial) return;
        e.preventDefault();
        goTo(nextSerial);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailSerial, exitDetail, goTo, nextSerial, prevSerial]);

  useEffect(() => {
    function onChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Push to the recents LRU each time Detail (re)opens for a serial — including
  // prev/next nav within the modal, since each step is a deliberate visit.
  useEffect(() => {
    if (!detailSerial) return;
    useRecentDevicesStore.getState().push(detailSerial);
  }, [detailSerial]);

  if (!detailSerial) return null;

  const toggleFullscreen = async () => {
    const el = surfaceRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen().catch(() => {});
    } else {
      await document.exitFullscreen().catch(() => {});
    }
  };

  const status = device?.state === 'device' ? 'online' : device?.state ?? 'unknown';
  const location = device?.tailnet
    ? [device.tailnet.location, device.tailnet.site, device.tailnet.region, device.tailnet.name, device.tailnet.hostname]
        .filter(Boolean)
        .join(' / ')
    : undefined;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center ui-modal-overlay ui-modal-overlay-72 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${displayName} detail`}
      onClick={(e) => {
        if (e.target === e.currentTarget) exitDetail();
      }}
    >
      <div
        ref={surfaceRef}
        className="relative flex flex-col w-full max-w-[1280px] h-[min(92vh,900px)] rounded-lg border border-zinc-800 ui-modal-surface shadow-2xl overflow-hidden"
      >
        <header className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2 text-xs flex-shrink-0 ui-modal-surface">
          <div className="h-8 w-8 rounded bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 flex items-center justify-center shrink-0">
            <MonitorSmartphone size={16} />
          </div>
          <div className="min-w-0">
            <div className="text-zinc-200 truncate font-medium">{displayName}</div>
            {label && device?.model && (
              <div className="text-[11px] text-zinc-500 truncate">{device.model}</div>
            )}
            {location ? <div className="text-[11px] text-zinc-500 truncate">{location}</div> : null}
            <div className="font-mono text-zinc-500 truncate">{detailSerial}</div>
          </div>
          <span className={`h-7 inline-flex items-center rounded border px-2.5 ${
            status === 'online'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              : status === 'unauthorized'
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                : 'ui-chip-surface text-zinc-400'
          }`}>
            {status}
          </span>
          <div className="flex-1" />
          {idx >= 0 && visible.length > 1 && (
            <div className="inline-flex items-center gap-1 mr-1" role="group" aria-label="Device navigation">
              <button
                type="button"
                onClick={() => goTo(prevSerial)}
                disabled={!prevSerial}
                className="h-8 w-8 inline-flex items-center justify-center rounded ui-chip-surface text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 disabled:opacity-40 disabled:hover:text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                aria-label="Previous device"
                title="Previous device (←, P)"
              >
                <ChevronLeft size={14} />
              </button>
              <span
                className="h-8 inline-flex items-center rounded ui-chip-surface px-2 font-mono text-[10px] tabular-nums text-zinc-300"
                title={`Device ${idx + 1} of ${visible.length} visible`}
                aria-label={`Device ${idx + 1} of ${visible.length}`}
              >
                <span className="text-zinc-100">{idx + 1}</span>
                <span className="px-1 text-zinc-600">/</span>
                <span className="text-zinc-400">{visible.length}</span>
              </span>
              <button
                type="button"
                onClick={() => goTo(nextSerial)}
                disabled={!nextSerial}
                className="h-8 w-8 inline-flex items-center justify-center rounded ui-chip-surface text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 disabled:opacity-40 disabled:hover:text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                aria-label="Next device"
                title="Next device (→, N)"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="h-8 inline-flex items-center gap-1.5 rounded ui-chip-surface text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 px-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <CollapseIcon size={13} /> : <ExpandIcon size={13} />}
            <span className="hidden sm:inline">{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
          </button>
          <button
            type="button"
            onClick={() => exitDetail()}
            className="h-8 w-8 inline-flex items-center justify-center rounded ui-chip-surface text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            aria-label="Close detail"
          >
            <X size={14} />
          </button>
        </header>

        <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_300px] overflow-hidden ui-modal-surface">
          <div className="flex items-center justify-center bg-black overflow-hidden p-2 min-h-0">
            <div className="relative h-full max-h-full max-w-full">
              <Tile key={detailSerial} serial={detailSerial} res="main" fill className="h-full" />
            </div>
          </div>
          <aside className="border-l border-zinc-800 p-3 overflow-y-auto ui-modal-surface">
            <div className="mb-3 border border-zinc-800 rounded p-2 text-[11px] text-zinc-400 leading-relaxed">
              <span className="text-zinc-200">←/→</span> or <span className="text-zinc-200">P/N</span> step
              between devices · <span className="text-zinc-200">S</span> sync · <span className="text-zinc-200">⇧L</span> lock input ·
              <span className="text-zinc-200"> Esc</span> close.
            </div>
            <StreamToolbar serial={detailSerial} />
          </aside>
        </div>
      </div>
    </div>
  );
}
