import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  Volume1,
  Volume2,
  Camera,
  CheckSquare,
  Eraser,
  Home,
  Keyboard,
  Layers,
  Lock,
  LockOpen,
  LockKeyhole,
  MonitorSmartphone,
  Plus,
  Power,
  Radio,
  Search,
  Send,
  ShieldAlert,
  Type,
  Unplug,
  Wand2,
} from 'lucide-react';
import { logActivity } from '../stores/activity';
import { useControlsStore } from '../stores/controls';
import { useDevicesStore } from '../stores/devices';
import { useInputLockStore } from '../stores/inputLock';
import { useLabelsStore } from '../stores/labels';
import { useLayoutStore } from '../stores/layout';
import { usePaletteStore } from '../stores/palette';
import { useProvisioningStore } from '../stores/provisioning';
import { useRecentDevicesStore } from '../stores/recentDevices';
import { useScenesStore } from '../stores/scenes';
import { useVisibleDevices } from '../hooks/useVisibleDevices';
import { COLOR_TAGS, colorBgClass, useColorsStore, type ColorTag } from '../stores/colors';
import { confirmDialog, promptDialog } from '../stores/dialog';
import { toast, trackBulk } from '../stores/toasts';
import { disconnectDevice, rebootDevice, sendDeviceKey } from '../lib/api';
import { selectedPreview } from '../lib/devicePreview';
import { downloadDeviceScreenshot } from '../lib/download';
import { resolveBulkRename } from '../lib/bulkRename';
import { broadcastTo } from '../lib/fanout';
import { KEYCODE } from '../lib/keycodes';
import { getStateKey } from '../deviceFilters';

type Entry = {
  id: string;
  group: 'Recent' | 'Devices' | 'Scenes' | 'Actions' | 'Help';
  label: string;
  hint?: string;
  keywords?: string;
  icon: ReactNode;
  rightHint?: string;
  perform: () => void | Promise<void>;
};

export function CommandPalette() {
  const open = usePaletteStore((s) => s.open);
  const setOpen = usePaletteStore((s) => s.setOpen);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const entries = useEntries({ close: () => setOpen(false) });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const hay = `${e.label} ${e.hint ?? ''} ${e.keywords ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [entries, query]);

  // Reset state every open
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setHighlight(0);
    inputRef.current?.focus();
  }, [open]);

  // Clamp highlight when results shrink/grow
  useEffect(() => {
    if (highlight >= filtered.length) setHighlight(Math.max(0, filtered.length - 1));
  }, [filtered.length, highlight]);

  // Keep highlight in view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  // Esc closes, arrows navigate, Enter commits
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => Math.min(h + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => Math.max(h - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const target = filtered[highlight];
        if (!target) return;
        void target.perform();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, highlight, setOpen]);

  if (!open) return null;

  return (
      <div
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
        className="fixed inset-0 z-[60] flex items-start justify-center ui-modal-overlay ui-modal-overlay-72 backdrop-blur-sm p-4 pt-[12vh]"
      >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        style={{
          animation: 'cols-menu-in 140ms cubic-bezier(0.16, 1, 0.3, 1)',
          boxShadow:
            '0 24px 60px -16px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.03)',
        }}
        className="w-full max-w-xl rounded-lg border border-zinc-700/80 ui-modal-surface backdrop-blur-md overflow-hidden"
      >
        <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-zinc-800/70">
          <Search size={14} className="text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to jump to a device, scene, or action…"
            aria-label="Command palette query"
            className="flex-1 h-7 bg-transparent text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none font-mono"
          />
          <kbd className="inline-flex h-5 items-center rounded ui-chip-surface px-1.5 font-mono text-[10px] text-zinc-400">
            esc
          </kbd>
        </div>
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-zinc-500">No matches for "{query}".</div>
          ) : (
            renderGrouped(filtered, highlight, setHighlight)
          )}
        </div>
        <footer className="flex items-center justify-between px-3 py-1.5 border-t border-zinc-800/70 text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-600">
          <span className="flex items-center gap-3">
            <kbd className="inline-flex h-4 items-center rounded ui-chip-surface px-1 text-[9px] text-zinc-400">↑↓</kbd>
            navigate
            <kbd className="inline-flex h-4 items-center rounded ui-chip-surface px-1 text-[9px] text-zinc-400">⏎</kbd>
            commit
          </span>
          <span>{filtered.length} result{filtered.length === 1 ? '' : 's'}</span>
        </footer>
      </div>
    </div>
  );
}

function renderGrouped(entries: Entry[], highlight: number, setHighlight: (n: number) => void): ReactNode {
  let i = -1;
  const groups: { name: Entry['group']; rows: { entry: Entry; idx: number }[] }[] = [];
  for (const entry of entries) {
    i += 1;
    const last = groups[groups.length - 1];
    if (last && last.name === entry.group) {
      last.rows.push({ entry, idx: i });
    } else {
      groups.push({ name: entry.group, rows: [{ entry, idx: i }] });
    }
  }
  return groups.map((g) => (
    <section key={g.name} className="py-0.5">
      <div className="px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">{g.name}</div>
      <ul>
        {g.rows.map(({ entry, idx }) => (
          <li key={entry.id}>
            <button
              type="button"
              data-idx={idx}
              onMouseEnter={() => setHighlight(idx)}
              onClick={() => entry.perform()}
              className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition-colors duration-[100ms] ${
                idx === highlight ? 'bg-cyan-500/10 text-cyan-100' : 'text-zinc-300 hover:bg-zinc-800/60'
              }`}
            >
              <span className={`shrink-0 ${idx === highlight ? 'text-cyan-300' : 'text-zinc-500'}`}>{entry.icon}</span>
              <span className="flex-1 min-w-0 flex items-baseline gap-2">
                <span className="truncate">{entry.label}</span>
                {entry.hint && (
                  <span className="truncate text-[11px] text-zinc-500 font-mono">{entry.hint}</span>
                )}
              </span>
              {entry.rightHint && (
                <span className="shrink-0 text-[10px] font-mono uppercase tracking-[0.14em] text-zinc-500">
                  {entry.rightHint}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  ));
}

function useEntries({ close }: { close: () => void }): Entry[] {
  const devices = useDevicesStore((s) => s.devices);
  const labels = useLabelsStore((s) => s.labels);
  const enterDetail = useDevicesStore((s) => s.enterDetail);
  const setCursor = useDevicesStore((s) => s.setCursor);
  const clearSelection = useDevicesStore((s) => s.clearSelection);
  const selectAll = useDevicesStore((s) => s.selectAll);
  const refresh = useDevicesStore((s) => s.refresh);
  const selectedSerials = useDevicesStore((s) => s.selectedSerials);
  const visible = useVisibleDevices();

  const scenes = useScenesStore((s) => s.scenes);
  const setActiveScene = useScenesStore((s) => s.setActive);
  const createScene = useScenesStore((s) => s.create);

  const sync = useControlsStore((s) => s.sync);
  const toggleSync = useControlsStore((s) => s.toggleSync);

  const startProvision = useProvisioningStore((s) => s.start);
  const toggleShortcuts = useLayoutStore((s) => s.toggleShortcuts);

  const lockedSerials = useInputLockStore((s) => s.lockedSerials);
  const recent = useRecentDevicesStore((s) => s.recent);

  const selectedCount = selectedSerials.size;
  const selected = useMemo(() => Array.from(selectedSerials), [selectedSerials]);

  return useMemo(() => {
    const out: Entry[] = [];

    // Recent — last opened in Detail. Skip serials no longer in the device list
    // (disconnected since), de-dupe is already handled by the LRU push.
    const deviceBySerial = new Map(devices.map((d) => [d.serial, d]));
    const shownRecent = new Set<string>();
    let rank = 1;
    for (const serial of recent) {
      const device = deviceBySerial.get(serial);
      if (!device) continue;
      const label = labels[serial];
      const display = label || device.model || serial;
      const status = getStateKey(device.state);
      const tail = serial.replace(/^\d+\.\d+\.\d+\./, '').replace(/:5555$/, '');
      const r = rank;
      out.push({
        id: `recent:${serial}`,
        group: 'Recent',
        label: display,
        hint: label && device.model ? `${device.model} · ${tail}` : tail,
        keywords: `recent last opened ${serial} ${device.model ?? ''} ${label ?? ''} ${status}`,
        icon: <MonitorSmartphone size={14} />,
        rightHint: `#${r}`,
        perform: () => {
          setCursor(serial);
          enterDetail(serial);
          close();
        },
      });
      shownRecent.add(serial);
      rank += 1;
      if (rank > 5) break; // cap at 5 in palette; full 8 stays in store for LRU semantics
    }

    // Devices — skip ones already pinned in Recent above; the Recent entry's keywords
    // include serial/model/label so search still finds them.
    for (const device of devices) {
      if (shownRecent.has(device.serial)) continue;
      const label = labels[device.serial];
      const display = label || device.model || device.serial;
      const status = getStateKey(device.state);
      const tail = device.serial.replace(/^\d+\.\d+\.\d+\./, '').replace(/:5555$/, '');
      out.push({
        id: `dev:${device.serial}`,
        group: 'Devices',
        label: display,
        hint: label && device.model ? `${device.model} · ${tail}` : tail,
        keywords: `${device.serial} ${device.model ?? ''} ${label ?? ''} ${status}`,
        icon: <MonitorSmartphone size={14} />,
        rightHint: status,
        perform: () => {
          setCursor(device.serial);
          enterDetail(device.serial);
          close();
        },
      });
    }

    // Scenes
    for (const scene of scenes) {
      out.push({
        id: `scene:${scene.id}`,
        group: 'Scenes',
        label: scene.name,
        hint: `${scene.serials.length} device${scene.serials.length === 1 ? '' : 's'}`,
        keywords: scene.id,
        icon: <Layers size={14} />,
        perform: () => {
          setActiveScene(scene.id);
          close();
        },
      });
    }

    // Actions
    out.push({
      id: 'act:add',
      group: 'Actions',
      label: 'Add device…',
      icon: <Plus size={14} />,
      keywords: 'pair provision tailscale qr',
      perform: () => {
        startProvision();
        close();
      },
    });
    out.push({
      id: 'act:sync',
      group: 'Actions',
      label: sync ? 'Turn sync mode OFF' : 'Turn sync mode ON',
      hint: sync ? 'broadcast input · ON' : 'input scoped to focused tile',
      keywords: 'broadcast fan-out multi',
      icon: <Radio size={14} />,
      perform: () => {
        toggleSync();
        toast.info(sync ? 'Sync mode OFF' : 'Sync mode ON', {
          description: sync
            ? 'Input is now scoped to the focused tile.'
            : `Input will broadcast to ${Math.max(1, selectedCount)} device${selectedCount === 1 ? '' : 's'}.`,
        });
        close();
      },
    });
    out.push({
      id: 'act:refresh',
      group: 'Actions',
      label: 'Refresh device list',
      icon: <Wand2 size={14} />,
      perform: () => {
        void refresh();
        close();
      },
    });

    // Select-by-condition. All bucket counts come from the *visible* set so
    // operator filters (location/tag/search) constrain the action — matches
    // expectations from clicking 'Select all visible' in the sidebar.
    const visibleSerials = visible.map((d) => d.serial);
    const onlineSerials = visible.filter((d) => d.state === 'device').map((d) => d.serial);
    const unauthSerials = visible.filter((d) => d.state === 'unauthorized').map((d) => d.serial);
    if (visibleSerials.length > 0) {
      out.push({
        id: 'act:select-visible',
        group: 'Actions',
        label: `Select all visible (${visibleSerials.length})`,
        keywords: 'mark filter rack',
        icon: <CheckSquare size={14} />,
        perform: () => {
          selectAll(visibleSerials);
          toast.info(`Selected ${visibleSerials.length} device${visibleSerials.length === 1 ? '' : 's'}`);
          close();
        },
      });
    }
    if (onlineSerials.length > 0 && onlineSerials.length !== visibleSerials.length) {
      out.push({
        id: 'act:select-online',
        group: 'Actions',
        label: `Select all online (${onlineSerials.length})`,
        keywords: 'live ready healthy',
        icon: <Radio size={14} />,
        perform: () => {
          selectAll(onlineSerials);
          toast.info(`Selected ${onlineSerials.length} online device${onlineSerials.length === 1 ? '' : 's'}`);
          close();
        },
      });
    }
    if (unauthSerials.length > 0) {
      out.push({
        id: 'act:select-unauth',
        group: 'Actions',
        label: `Select all unauthorized (${unauthSerials.length})`,
        keywords: 'auth pending pair approve',
        icon: <ShieldAlert size={14} />,
        perform: () => {
          selectAll(unauthSerials);
          toast.info(`Selected ${unauthSerials.length} unauthorized device${unauthSerials.length === 1 ? '' : 's'}`);
          close();
        },
      });
    }
    if (visibleSerials.length > 0 && selectedCount > 0) {
      const inverted = visibleSerials.filter((s) => !selectedSerials.has(s));
      out.push({
        id: 'act:invert',
        group: 'Actions',
        label: `Invert selection (→ ${inverted.length})`,
        keywords: 'toggle flip not complement',
        icon: <ArrowLeftRight size={14} />,
        perform: () => {
          selectAll(inverted);
          toast.info(`Inverted: ${inverted.length} now selected`);
          close();
        },
      });
    }

    if (selectedCount > 0) {
      out.push({
        id: 'act:clear',
        group: 'Actions',
        label: `Clear selection (${selectedCount})`,
        icon: <Eraser size={14} />,
        perform: () => {
          clearSelection();
          close();
        },
      });
      out.push({
        id: 'act:lock-selected',
        group: 'Actions',
        label: `Lock input on selected (${selectedCount})`,
        hint: 'swallow taps/swipes',
        keywords: 'lock input freeze readonly',
        icon: <Lock size={14} />,
        perform: () => {
          const setLocked = useInputLockStore.getState().setLocked;
          for (const s of selected) setLocked(s, true);
          toast.info(`Input locked (${selected.length})`);
          logActivity({
            kind: 'lock',
            target: `${selected.length} device${selected.length === 1 ? '' : 's'}`,
            outcome: 'ok',
            detail: 'locked',
          });
          close();
        },
      });
      out.push({
        id: 'act:unlock-selected',
        group: 'Actions',
        label: `Unlock input on selected (${selectedCount})`,
        keywords: 'unlock input release',
        icon: <LockOpen size={14} />,
        perform: () => {
          const setLocked = useInputLockStore.getState().setLocked;
          for (const s of selected) setLocked(s, false);
          toast.info(`Input unlocked (${selected.length})`);
          logActivity({
            kind: 'lock',
            target: `${selected.length} device${selected.length === 1 ? '' : 's'}`,
            outcome: 'ok',
            detail: 'unlocked',
          });
          close();
        },
      });

      // Bulk color tag. Renders the actual color dot as the icon so the palette
      // doubles as a swatch picker — much faster than a separate dialog.
      const colorEntry = (color: ColorTag): Entry => ({
        id: `act:color-${color}`,
        group: 'Actions',
        label: `Color selected as ${color} (${selectedCount})`,
        keywords: `tag mark rack group ${color}`,
        icon: <span className={`block h-3 w-3 rounded-full ${colorBgClass(color)}`} aria-hidden />,
        perform: () => {
          const setColor = useColorsStore.getState().setColor;
          for (const s of selected) setColor(s, color);
          toast.success(`Colored ${selectedCount} device${selectedCount === 1 ? '' : 's'} ${color}`);
          close();
        },
      });
      for (const color of COLOR_TAGS) out.push(colorEntry(color));
      out.push({
        id: 'act:color-clear',
        group: 'Actions',
        label: `Clear color on selected (${selectedCount})`,
        keywords: 'tag untag remove uncolor',
        icon: (
          <span
            className="block h-3 w-3 rounded-full border border-zinc-700 bg-transparent"
            aria-hidden
          />
        ),
        perform: () => {
          const setColor = useColorsStore.getState().setColor;
          for (const s of selected) setColor(s, null);
          toast.info(`Cleared color on ${selectedCount} device${selectedCount === 1 ? '' : 's'}`);
          close();
        },
      });

      out.push({
        id: 'act:screenshot',
        group: 'Actions',
        label: `Screenshot selected (${selectedCount})`,
        icon: <Camera size={14} />,
        perform: async () => {
          close();
          let saved = 0;
          let failed = 0;
          for (const s of selected) {
            try {
              await downloadDeviceScreenshot(s);
              saved += 1;
            } catch {
              failed += 1;
            }
          }
          if (failed === 0) toast.success(`Screenshot saved (${saved})`, { description: 'Check your Downloads folder.' });
          else toast.error(`Screenshot partial: ${saved}/${selectedCount}`);
        },
      });
      out.push({
        id: 'act:reboot',
        group: 'Actions',
        label: `Reboot selected (${selectedCount})`,
        icon: <Power size={14} />,
        perform: async () => {
          close();
          const ok = await confirmDialog({
            title: `Reboot ${selectedCount} device${selectedCount === 1 ? '' : 's'}?`,
            body: selectedPreview(selected, useDevicesStore.getState().devices, labels, {
              intro: 'They will reboot simultaneously.',
            }),
            confirmLabel: 'Reboot',
            danger: true,
          });
          if (!ok) return;
          const results = await Promise.allSettled(selected.map((s) => rebootDevice(s)));
          const fails = results.filter((r) => r.status === 'rejected').length;
          if (fails === 0) toast.success(`Reboot issued (${selectedCount})`);
          else toast.error(`Reboot partial: ${selectedCount - fails}/${selectedCount} OK`);
        },
      });
      out.push({
        id: 'act:disconnect',
        group: 'Actions',
        label: `Disconnect selected (${selectedCount})`,
        icon: <Unplug size={14} />,
        perform: async () => {
          close();
          const ok = await confirmDialog({
            title: `Disconnect ${selectedCount} device${selectedCount === 1 ? '' : 's'}?`,
            body: selectedPreview(selected, useDevicesStore.getState().devices, labels, {
              intro: 'Runs `adb disconnect` on each. Tailscale-managed nodes are also removed from Headscale.',
            }),
            confirmLabel: 'Disconnect',
            danger: true,
          });
          if (!ok) return;
          await Promise.allSettled(selected.map((s) => disconnectDevice(s)));
          toast.success(`Disconnected (${selectedCount})`);
          void refresh();
        },
      });
      out.push({
        id: 'act:save-scene',
        group: 'Actions',
        label: `Save selection as scene… (${selectedCount})`,
        keywords: 'scene save preset snapshot bookmark group',
        icon: <Layers size={14} />,
        perform: async () => {
          close();
          const existing = useScenesStore.getState().scenes.map((sc) => sc.name.toLowerCase());
          const name = await promptDialog({
            title: 'Save scene',
            body: `Captures ${selectedCount} device${selectedCount === 1 ? '' : 's'} as a named selection. Recall it later from the sidebar or this palette.`,
            placeholder: 'rack-7 night shift',
            confirmLabel: 'Save',
            maxLength: 48,
          });
          if (!name) return;
          const trimmed = name.trim();
          if (!trimmed) return;
          if (existing.includes(trimmed.toLowerCase())) {
            toast.error('Scene name already used', { description: 'Pick a different name.' });
            return;
          }
          const id = createScene(trimmed);
          toast.success(`Scene "${trimmed}" saved`, {
            description: `${selectedCount} device${selectedCount === 1 ? '' : 's'} captured.`,
          });
          logActivity({
            kind: 'scene',
            target: trimmed,
            outcome: 'ok',
            detail: `${selectedCount} device${selectedCount === 1 ? '' : 's'} · id=${id}`,
          });
        },
      });
      out.push({
        id: 'act:type-selected',
        group: 'Actions',
        label: `Type text on selected (${selectedCount})`,
        keywords: 'text input keyboard broadcast inject',
        icon: <Send size={14} />,
        perform: async () => {
          close();
          const text = await promptDialog({
            title: `Type on ${selectedCount} device${selectedCount === 1 ? '' : 's'}`,
            body: 'Sent verbatim as keyboard text. Locked devices are skipped.',
            placeholder: 'message text…',
            confirmLabel: 'Send',
            maxLength: 1024,
          });
          if (!text) return;
          const lockedSet = new Set(useInputLockStore.getState().lockedSerials);
          const recipients = selected.filter((s) => !lockedSet.has(s));
          const skipped = selected.length - recipients.length;
          if (recipients.length === 0) {
            toast.error('All selected devices are locked', {
              description: 'Unlock at least one device to send text.',
            });
            return;
          }
          broadcastTo(recipients, { kind: 'text', text });
          toast.success(`Text sent to ${recipients.length} device${recipients.length === 1 ? '' : 's'}`, {
            description: skipped > 0 ? `${skipped} locked · skipped` : undefined,
          });
          logActivity({
            kind: 'type',
            target: `${recipients.length} device${recipients.length === 1 ? '' : 's'}`,
            outcome: skipped > 0 ? 'partial' : 'ok',
            detail: `${text.length} char${text.length === 1 ? '' : 's'}${skipped > 0 ? ` · ${skipped} locked` : ''}`,
          });
        },
      });
      // Bulk media keys. HTTP fan-out via sendDeviceKey, skips locked devices,
      // shows a live progress toast.
      const mediaKeyEntry = (
        id: string,
        label: string,
        keyCode: number,
        icon: ReactNode,
        keywords: string,
      ): Entry => ({
        id,
        group: 'Actions',
        label: `${label} on selected (${selectedCount})`,
        icon,
        keywords,
        perform: async () => {
          close();
          const lockedSet = new Set(useInputLockStore.getState().lockedSerials);
          const recipients = selected.filter((s) => !lockedSet.has(s));
          const skipped = selected.length - recipients.length;
          if (recipients.length === 0) {
            toast.error('All selected devices are locked', {
              description: 'Unlock at least one device to send the key.',
            });
            return;
          }
          const tracker = trackBulk({
            title: `${label} on ${recipients.length} device${recipients.length === 1 ? '' : 's'}…`,
            total: recipients.length,
            description: skipped > 0 ? `${skipped} locked · skipped` : undefined,
          });
          for (const s of recipients) {
            try {
              await sendDeviceKey(s, keyCode);
              tracker.ok();
            } catch {
              tracker.fail();
            }
          }
          tracker.done({
            success: { title: `${label} sent (${recipients.length})`, description: skipped > 0 ? `${skipped} locked · skipped` : undefined },
            error: { title: `${label} partial`, description: 'Some keys did not land.' },
          });
          logActivity({
            kind: 'shell',
            target: `${recipients.length} device${recipients.length === 1 ? '' : 's'}`,
            outcome: skipped > 0 ? 'partial' : 'ok',
            detail: `keyevent ${keyCode} (${label})${skipped > 0 ? ` · ${skipped} locked` : ''}`,
          });
        },
      });
      out.push(mediaKeyEntry('act:key-power', 'Press Power', KEYCODE.POWER, <LockKeyhole size={14} />, 'sleep wake lock screen'));
      out.push(mediaKeyEntry('act:key-home', 'Press Home', KEYCODE.HOME, <Home size={14} />, 'launcher dismiss'));
      out.push(mediaKeyEntry('act:key-back', 'Press Back', KEYCODE.BACK, <ArrowLeft size={14} />, 'navigate back escape'));
      out.push(mediaKeyEntry('act:key-vol-up', 'Volume up', KEYCODE.VOLUME_UP, <Volume2 size={14} />, 'louder media speaker'));
      out.push(mediaKeyEntry('act:key-vol-down', 'Volume down', KEYCODE.VOLUME_DOWN, <Volume1 size={14} />, 'quieter media speaker'));
      out.push({
        id: 'act:bulk-rename',
        group: 'Actions',
        label: `Bulk rename selected (${selectedCount})`,
        icon: <Type size={14} />,
        keywords: 'template label sequential numbering',
        perform: async () => {
          close();
          const template = await promptDialog({
            title: `Rename ${selectedCount} device${selectedCount === 1 ? '' : 's'}`,
            body: (
              <>
                Use a template with placeholders. Devices are numbered in their current order.
                <br />
                <span className="font-mono text-[11px] text-zinc-400">
                  {'{i}'} 1-indexed · {'{n}'} 0-indexed · {'{model}'} · {'{serial-tail}'} · {'{label}'}
                </span>
                <br />
                Example: <span className="font-mono text-cyan-300">rack-7-{'{i}'}</span> → rack-7-01, rack-7-02, …
              </>
            ),
            defaultValue: 'rack-{i}',
            placeholder: 'rack-{i}',
            confirmLabel: 'Apply',
            maxLength: 80,
          });
          if (!template) return;
          const resolved = resolveBulkRename({
            serials: selected,
            template,
            devices: useDevicesStore.getState().devices,
            labels: useLabelsStore.getState().labels,
          });
          const setLabel = useLabelsStore.getState().setLabel;
          for (const { serial, next } of resolved) setLabel(serial, next);
          toast.success(`Renamed ${resolved.length} device${resolved.length === 1 ? '' : 's'}`, {
            description: resolved.slice(0, 3).map((r) => r.next).join(', ') + (resolved.length > 3 ? '…' : ''),
          });
          logActivity({
            kind: 'rename',
            target: `${resolved.length} device${resolved.length === 1 ? '' : 's'}`,
            outcome: 'ok',
            detail: `Template: ${template}`,
          });
        },
      });
    }

    if (lockedSerials.length > 0) {
      out.push({
        id: 'act:unlock-all',
        group: 'Actions',
        label: `Unlock all input (${lockedSerials.length})`,
        keywords: 'release every',
        icon: <LockOpen size={14} />,
        perform: () => {
          useInputLockStore.getState().unlockAll();
          toast.info(`Input unlocked (${lockedSerials.length})`);
          logActivity({
            kind: 'lock',
            target: `${lockedSerials.length} device${lockedSerials.length === 1 ? '' : 's'}`,
            outcome: 'ok',
            detail: 'unlock-all',
          });
          close();
        },
      });
    }

    // Help
    out.push({
      id: 'help:shortcuts',
      group: 'Help',
      label: 'Keyboard shortcuts',
      hint: 'press ?',
      icon: <Keyboard size={14} />,
      perform: () => {
        toggleShortcuts();
        close();
      },
    });

    return out;
  }, [
    devices,
    labels,
    scenes,
    sync,
    selectedSerials,
    selectedCount,
    selected,
    lockedSerials,
    recent,
    visible,
    setCursor,
    enterDetail,
    setActiveScene,
    createScene,
    toggleSync,
    startProvision,
    refresh,
    clearSelection,
    selectAll,
    toggleShortcuts,
    close,
  ]);
}
