import { Activity, Bot, ChevronRight, Handshake, Keyboard, LogOut, MapPin, Maximize, Moon, Plus, RefreshCw, Radio, Settings, ShieldAlert, Smartphone, StickyNote, Sun, UserRound, Wifi, WifiOff } from 'lucide-react';
import { useMemo } from 'react';
import { useActivityStore } from './stores/activity';
import { useAssistantStore } from './stores/assistant';
import { useAuthStore } from './stores/auth';
import { useConfigStore } from './stores/config';
import { useControlsStore } from './stores/controls';
import { useDevicesStore } from './stores/devices';
import { useLayoutStore } from './stores/layout';
import { useProvisioningStore } from './stores/provisioning';
import { useScratchpadStore } from './stores/scratchpad';
import { getDeviceLocationKeys } from './deviceFilters';
import { useThemeStore } from './stores/theme';

export function Topbar() {
  const selectedCount = useDevicesStore((s) => s.selectedSerials.size);
  const devices = useDevicesStore((s) => s.devices);
  const loading = useDevicesStore((s) => s.loading);
  const refresh = useDevicesStore((s) => s.refresh);
  const sync = useControlsStore((s) => s.sync);
  const toggleSync = useControlsStore((s) => s.toggleSync);
  const tailnet = useConfigStore((s) => s.tailnet);
  const startProvision = useProvisioningStore((s) => s.start);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const toggleShortcuts = useLayoutStore((s) => s.toggleShortcuts);
  const toggleSettings = useLayoutStore((s) => s.toggleSettings);
  const toggleWallboard = useLayoutStore((s) => s.toggleWallboard);
  const toggleActivity = useActivityStore((s) => s.toggleDrawer);
  const unread = useActivityStore((s) => s.unread);
  const toggleScratchpad = useScratchpadStore((s) => s.toggle);
  const scratchpadOpen = useScratchpadStore((s) => s.open);
  const scratchpadHasContent = useScratchpadStore((s) => s.text.length > 0);
  const toggleAssistant = useAssistantStore((s) => s.toggle);
  const assistantOpen = useAssistantStore((s) => s.open);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  const counts = useMemo(
    () =>
      devices.reduce(
        (acc, d) => {
          if (d.state === 'device') acc.online += 1;
          else if (d.state === 'unauthorized') acc.unauthorized += 1;
          else acc.offline += 1;
          acc.total += 1;
          return acc;
        },
        { online: 0, unauthorized: 0, offline: 0, total: 0 },
      ),
    [devices],
  );

  const locationCounts = useMemo(
    () =>
      devices.reduce<Record<string, number>>((acc, device) => {
        for (const location of getDeviceLocationKeys(device)) {
          acc[location] = (acc[location] ?? 0) + 1;
        }
        return acc;
      }, {}),
    [devices],
  );

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800 ui-popover-surface [--tw-bg-opacity:0.85] backdrop-blur supports-[backdrop-filter]:bg-zinc-950/75">
      <div className="px-4 py-3">
        <div className="mx-auto flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-3 min-w-[210px]">
            <div className="h-9 w-9 rounded-md bg-cyan-400/90 text-zinc-950 flex items-center justify-center shadow-[0_10px_30px_-20px_rgba(34,211,238,0.8)]">
              <Smartphone size={18} />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight">phone-remote</h1>
              <p className="text-[11px] text-zinc-400">operator command center</p>
            </div>
          </div>

          <div
            className="hidden lg:flex items-center gap-2"
            role="status"
            aria-live="polite"
            aria-label="Device counts"
          >
            <Metric icon={<Radio size={14} />} label="online" value={counts.online} tone="emerald" />
            <Metric icon={<ShieldAlert size={14} />} label="unauthorized" value={counts.unauthorized} tone="amber" />
            <Metric icon={<WifiOff size={14} />} label="offline" value={counts.offline} tone="zinc" />
          </div>

          <div
            className="hidden sm:flex items-center gap-2 text-xs"
            role="status"
            aria-live="polite"
            aria-label="Tailnet and device summary"
          >
            <span
              className={`h-8 inline-flex items-center gap-2 rounded border px-2.5 ${
                tailnet
                  ? 'border-cyan-500/45 bg-cyan-500/10 text-cyan-200'
                  : 'border-zinc-800 ui-chip-surface bg-zinc-900 text-zinc-400'
              }`}
            >
              <Wifi size={13} />
              <span>{tailnet ? 'tailnet ready' : 'LAN mode'}</span>
            </span>
            <span className="h-8 inline-flex items-center gap-1.5 px-2.5 rounded border border-zinc-800 ui-chip-surface text-zinc-500">
              <Handshake size={13} />
              <span>
                {counts.total} total / {counts.online} online / {counts.unauthorized} unauth / {counts.offline} offline
              </span>
            </span>
            {Object.entries(locationCounts).map(([location, total]) => (
              <span
                key={location}
                className="h-8 inline-flex items-center gap-1.5 px-2.5 rounded border border-zinc-800 ui-chip-surface text-zinc-500"
              >
                <MapPin size={12} />
                <span>{location}</span>
                <span className="tabular-nums text-zinc-300">{total}</span>
              </span>
            ))}
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refresh()}
              disabled={loading}
              className="h-9 w-9 inline-flex items-center justify-center rounded ui-chip-surface text-zinc-500 hover:text-zinc-100 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
              aria-label="Refresh device list"
              title="Refresh device list"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>

            <button
              type="button"
              onClick={() => startProvision()}
              className="h-9 inline-flex items-center gap-2 rounded border border-cyan-400/45 bg-cyan-400 text-zinc-950 px-3 text-xs font-medium hover:bg-cyan-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            >
              <Plus size={15} />
              Add device
            </button>

            <button
              type="button"
              onClick={toggleSync}
              aria-pressed={sync}
              title={sync ? 'Sync is ON — input broadcasts to selected devices' : 'Sync is OFF'}
              className={`h-9 inline-flex items-center gap-1.5 rounded border px-3 text-xs transition-colors duration-[120ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
                sync
                  ? 'bg-emerald-500/15 border-emerald-500/45 text-emerald-200'
                  : 'border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:border-zinc-700'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${sync ? 'bg-emerald-400 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]' : 'bg-zinc-600'}`}
              />
              Sync {sync ? 'ON' : 'OFF'}
              {sync && selectedCount > 0 && (
                <span className="tabular-nums text-emerald-100">({selectedCount})</span>
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={toggleWallboard}
            className="h-9 w-9 inline-flex items-center justify-center rounded ui-chip-surface text-zinc-500 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 transition-colors duration-[120ms]"
            aria-label="Wallboard mode"
            title="Wallboard mode (press W)"
          >
            <Maximize size={15} />
          </button>

          <button
            type="button"
            onClick={toggleActivity}
            className="relative h-9 w-9 inline-flex items-center justify-center rounded ui-chip-surface text-zinc-500 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 transition-colors duration-[120ms]"
            aria-label="Activity log"
            title="Activity log"
          >
            <Activity size={15} />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-[1rem] inline-flex items-center justify-center rounded-full bg-cyan-400 text-zinc-950 text-[9px] font-mono font-semibold tabular-nums px-1">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={toggleAssistant}
            aria-pressed={assistantOpen}
            className={`relative h-9 w-9 inline-flex items-center justify-center rounded ui-chip-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 transition-colors duration-[120ms] ${
              assistantOpen
                ? 'border-cyan-500/55 bg-cyan-500/15 text-cyan-200'
                : 'border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700'
            }`}
            aria-label="Assistant"
            title="Operator assistant"
          >
            <Bot size={15} />
          </button>

          <button
            type="button"
            onClick={toggleScratchpad}
            aria-pressed={scratchpadOpen}
            className={`relative h-9 w-9 inline-flex items-center justify-center rounded ui-chip-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 transition-colors duration-[120ms] ${
              scratchpadOpen
                ? 'border-amber-400/55 bg-amber-500/15 text-amber-200'
                : 'border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700'
            }`}
            aria-label="Scratchpad"
            title="Scratchpad (press ')"
          >
            <StickyNote size={15} />
            {!scratchpadOpen && scratchpadHasContent && (
              <span
                aria-hidden
                className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_0_2px_rgba(0,0,0,0.6)]"
              />
            )}
          </button>

          <button
            type="button"
            onClick={toggleSettings}
            className="h-9 w-9 inline-flex items-center justify-center rounded ui-chip-surface text-zinc-500 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 transition-colors duration-[120ms]"
            aria-label="Settings"
            title="Settings"
          >
            <Settings size={15} />
          </button>

          <button
            type="button"
            onClick={toggleShortcuts}
            className="h-9 w-9 inline-flex items-center justify-center rounded ui-chip-surface text-zinc-500 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 transition-colors duration-[120ms]"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (press ?)"
          >
            <Keyboard size={15} />
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className="h-9 w-9 inline-flex items-center justify-center rounded ui-chip-surface text-zinc-500 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 transition-colors duration-[120ms]"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          <div className="flex items-center gap-2 text-xs text-zinc-300 pl-1 border-l border-zinc-800 min-w-0">
            <UserRound size={15} className="text-zinc-400 shrink-0" />
            <span className="max-w-28 truncate">{user}</span>
            <button
              type="button"
              onClick={() => logout()}
              className="h-9 w-9 inline-flex items-center justify-center rounded ui-chip-surface hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 transition-colors duration-[120ms]"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>

        {selectedCount > 0 && !sync && (
          <div className="mx-auto mt-2 max-w-full flex items-center justify-between border-t border-zinc-800/90 pt-2 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-2">
              <span className="inline-flex h-6 items-center rounded border border-zinc-700 ui-chip-surface bg-zinc-900 px-2 text-zinc-300">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-200 mr-2" />
                {selectedCount} selected
              </span>
              <span className="text-zinc-500">Tip: press F to open detail, S to toggle sync.</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-zinc-500">
              <Keyboard size={13} />
              Keyboard mode active
              <ChevronRight size={13} />
            </span>
          </div>
        )}
      </div>
    </header>
  );
}

function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'emerald' | 'amber' | 'zinc';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : tone === 'amber'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
      : 'border-zinc-800 ui-chip-surface bg-zinc-900 text-zinc-300';
  return (
    <span className={`h-8 inline-flex items-center gap-2 rounded border px-2.5 text-xs ${toneClass}`}>
      {icon}
      <span className="tabular-nums font-medium">{value}</span>
      <span className="text-zinc-500">{label}</span>
    </span>
  );
}
