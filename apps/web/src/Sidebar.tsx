import { useMemo, type ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Eraser,
  Filter,
  Lock,
  MapPin,
  PanelLeftClose,
  GripVertical,
  Pencil,
  Pin,
  Plus,
  Search,
  StickyNote,
  Tag as TagIcon,
  Trash2,
  Type,
  Unplug,
} from 'lucide-react';
import { ExpandIcon } from './icons/Expand';

import { useDevicesStore } from './stores/devices';
import { useDeviceOrderStore, compareBySavedOrder } from './stores/deviceOrder';
import { useFiltersStore, type AttrFilter } from './stores/filters';
import { useInputLockStore } from './stores/inputLock';
import { useLabelsStore } from './stores/labels';
import { useLayoutStore } from './stores/layout';
import { useNotesStore } from './stores/notes';
import { useProvisioningStore } from './stores/provisioning';
import { useScenesStore } from './stores/scenes';
import { disconnectDevice } from './lib/api';
import { confirmDialog } from './stores/dialog';
import { toast } from './stores/toasts';
import { useContextMenuStore } from './stores/contextMenu';
import { deviceContextMenuItems } from './lib/deviceContextMenu';
import { FilterPresetsMenu } from './components/FilterPresetsMenu';
import { COLOR_TAGS, colorBgClass, useColorsStore, type ColorTag } from './stores/colors';
import { relTime, useLastSeenStore } from './stores/lastSeen';
import {
  UNKNOWN_LOCATION,
  getDeviceLocationKeys,
  getDeviceTags,
  getStateKey,
  matchesLocationFilters,
  matchesSearch,
  matchesTagFilters,
} from './deviceFilters';
import type { Device } from '@phone-remote/protocol';

export function Sidebar() {
  const devices = useDevicesStore((s) => s.devices);
  const selectedSerials = useDevicesStore((s) => s.selectedSerials);
  const cursorSerial = useDevicesStore((s) => s.cursorSerial);
  const toggleSelected = useDevicesStore((s) => s.toggleSelected);
  const selectAll = useDevicesStore((s) => s.selectAll);
  const clearSelection = useDevicesStore((s) => s.clearSelection);
  const enterDetail = useDevicesStore((s) => s.enterDetail);
  const refresh = useDevicesStore((s) => s.refresh);
  const labels = useLabelsStore((s) => s.labels);
  const setLabel = useLabelsStore((s) => s.setLabel);
  const notes = useNotesStore((s) => s.notes);
  const colors = useColorsStore((s) => s.colors);
  const setColor = useColorsStore((s) => s.setColor);
  const lastSeen = useLastSeenStore((s) => s.lastSeen);
  const savedOrder = useDeviceOrderStore((s) => s.order);
  const pinned = useDeviceOrderStore((s) => s.pinned);
  const reorder = useDeviceOrderStore((s) => s.reorder);
  const lockedSerials = useInputLockStore((s) => s.lockedSerials);

  const search = useFiltersStore((s) => s.search);
  const stateFilter = useFiltersStore((s) => s.stateFilter);
  const locationFilter = useFiltersStore((s) => s.locationFilter);
  const tagFilter = useFiltersStore((s) => s.tagFilter);
  const attrFilter = useFiltersStore((s) => s.attrFilter);
  const setAttrFilter = useFiltersStore((s) => s.setAttrFilter);
  const setSearch = useFiltersStore((s) => s.setSearch);
  const setStateFilter = useFiltersStore((s) => s.setStateFilter);
  const setLocationFilter = useFiltersStore((s) => s.setLocationFilter);
  const setTagFilter = useFiltersStore((s) => s.setTagFilter);

  const scenes = useScenesStore((s) => s.scenes);
  const activeSceneId = useScenesStore((s) => s.activeId);
  const setActiveScene = useScenesStore((s) => s.setActive);
  const createScene = useScenesStore((s) => s.create);
  const updateScene = useScenesStore((s) => s.update);
  const removeScene = useScenesStore((s) => s.remove);
  const reorderScene = useScenesStore((s) => s.reorder);
  const startProvision = useProvisioningStore((s) => s.start);
  const collapsed = useLayoutStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);

  const visible = useMemo(() => {
    const lockedSet = new Set(lockedSerials);
    const filtered = devices.filter((d) => {
      const status = getStateKey(d.state);
      if (!stateFilter[status]) return false;
      if (!matchesLocationFilters(d, locationFilter)) return false;
      if (!matchesTagFilters(d, tagFilter)) return false;
      if (attrFilter.locked && !lockedSet.has(d.serial)) return false;
      if (attrFilter.withNotes && !(notes[d.serial]?.trim())) return false;
      return matchesSearch(d, search, labels);
    });
    if (savedOrder.length === 0 && pinned.length === 0) return filtered;
    return [...filtered].sort(compareBySavedOrder(pinned, savedOrder));
  }, [devices, search, stateFilter, locationFilter, tagFilter, attrFilter, lockedSerials, notes, labels, savedOrder, pinned]);

  const counts = useMemo(
    () =>
      devices.reduce(
        (acc, d) => {
          const status = getStateKey(d.state);
          if (status === 'online') acc.online += 1;
          else if (status === 'unauthorized') acc.unauthorized += 1;
          else acc.offline += 1;
          return acc;
        },
        { online: 0, unauthorized: 0, offline: 0 },
      ),
    [devices],
  );

  const attrCounts = useMemo(() => {
    const lockedSet = new Set(lockedSerials);
    let locked = 0;
    let withNotes = 0;
    for (const d of devices) {
      if (lockedSet.has(d.serial)) locked += 1;
      if (notes[d.serial]?.trim()) withNotes += 1;
    }
    return { locked, withNotes };
  }, [devices, lockedSerials, notes]);

  const locationChips = useMemo(() => {
    const byValue = new Map<string, number>();
    for (const device of devices) {
      for (const value of getDeviceLocationKeys(device)) {
        byValue.set(value, (byValue.get(value) ?? 0) + 1);
      }
    }
    return [...byValue.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [devices]);

  const tagChips = useMemo(() => {
    const byValue = new Map<string, number>();
    for (const device of devices) {
      for (const value of getDeviceTags(device)) {
        byValue.set(value, (byValue.get(value) ?? 0) + 1);
      }
    }
    return [...byValue.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [devices]);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label="Expand devices sidebar"
        title="Expand devices"
        className="w-9 shrink-0 border-r border-zinc-800 ui-modal-surface hover:bg-zinc-900 transition-colors duration-[120ms] flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
      >
        <span className="[writing-mode:vertical-rl] rotate-180 text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
          devices
        </span>
      </button>
    );
  }

  return (
    <aside className="w-[300px] shrink-0 border-r border-zinc-800 ui-modal-surface flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-zinc-800 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-mono">devices</span>
          <span className="flex-1" />
          <FilterPresetsMenu />
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Collapse devices sidebar"
            title="Collapse sidebar (B)"
            className="h-7 w-7 inline-flex items-center justify-center rounded ui-chip-surface text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          >
            <PanelLeftClose size={14} />
          </button>
        </div>
        <SceneTabs
          scenes={scenes}
          activeId={activeSceneId}
          onPick={setActiveScene}
          onCreate={createScene}
          onRename={(id, name) => updateScene(id, { name })}
          onRemove={removeScene}
          onReorder={reorderScene}
        />

        <button
          type="button"
          onClick={() => startProvision()}
          className="h-9 w-full inline-flex items-center justify-center gap-2 rounded border border-cyan-400/45 bg-cyan-500/10 text-cyan-100 px-3 text-xs font-medium hover:bg-cyan-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
        >
          <Plus size={14} />
          Add device
        </button>

        <label className="relative block">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            id="sidebar-filter"
            name="filter"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search serial, model, host…"
            aria-label="Filter devices"
            className="h-9 w-full ui-popover-surface border border-zinc-800 rounded-md pl-8 pr-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500 focus-visible:ring-2 focus-visible:ring-cyan-500"
          />
        </label>

        <StateChips counts={counts} value={stateFilter} onChange={setStateFilter} />

        <AttrChips counts={attrCounts} value={attrFilter} onChange={setAttrFilter} />

        {locationChips.length > 0 && (
          <FilterRow
            label="Location"
            icon={<MapPin size={12} />}
            values={locationChips}
            value={locationFilter}
            onChange={setLocationFilter}
            formatter={(v) => (v === UNKNOWN_LOCATION ? 'unassigned' : v)}
            emptyLabel={UNKNOWN_LOCATION}
          />
        )}

        {tagChips.length > 0 && (
          <FilterRow
            label="Tags"
            icon={<TagIcon size={12} />}
            values={tagChips}
            value={tagFilter}
            onChange={setTagFilter}
          />
        )}

        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <button
            type="button"
            onClick={() => selectAll(visible.map((d) => d.serial))}
            className="flex-1 h-7 inline-flex items-center justify-center gap-1 rounded ui-chip-surface hover:text-zinc-100 hover:border-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          >
            All visible
          </button>
          <button
            type="button"
            onClick={() => clearSelection()}
            className="flex-1 h-7 inline-flex items-center justify-center gap-1 rounded ui-chip-surface hover:text-zinc-100 hover:border-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          >
            <Eraser size={11} />
            Clear
          </button>
        </div>

        <div className="text-[11px] text-zinc-500 tabular-nums">
          {visible.length} visible • {selectedSerials.size} selected
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {visible.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-zinc-500">
            No devices match.
          </div>
        ) : (
          <ul className="space-y-0.5 px-1.5">
            {visible.map((device) => (
              <DeviceRow
                key={device.serial}
                device={device}
                label={labels[device.serial]}
                note={notes[device.serial]}
                color={colors[device.serial]}
                lastSeen={lastSeen[device.serial]}
                onSetColor={(c) => setColor(device.serial, c)}
                pinned={pinned.includes(device.serial)}
                locked={lockedSerials.includes(device.serial)}
                selected={selectedSerials.has(device.serial)}
                cursor={cursorSerial === device.serial}
                onToggle={() => toggleSelected(device.serial)}
                onExpand={() => enterDetail(device.serial)}
                onRelabel={(name) => setLabel(device.serial, name)}
                onReorder={(sourceSerial, position) => reorder(sourceSerial, device.serial, position)}
                onDisconnect={async () => {
                  const ok = await confirmDialog({
                    title: `Disconnect ${device.model || device.serial}?`,
                    body: 'Runs `adb disconnect`. If the device is Tailscale-managed, its node is also deleted from Headscale.',
                    confirmLabel: 'Disconnect',
                    danger: true,
                  });
                  if (!ok) return;
                  const name = labels[device.serial] || device.model || device.serial;
                  try {
                    const result = await disconnectDevice(device.serial);
                    toast.success(`Disconnected ${name}`, {
                      description: result.tailnetRemoved
                        ? 'Removed from Headscale tailnet'
                        : result.disconnected
                          ? 'ADB disconnect issued'
                          : 'Nothing to disconnect',
                    });
                  } catch (err) {
                    toast.error(`Failed to disconnect ${name}`, {
                      description: err instanceof Error ? err.message : String(err),
                    });
                  } finally {
                    refresh();
                  }
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function DeviceRow({
  device,
  label,
  note,
  color,
  lastSeen,
  pinned,
  locked,
  selected,
  cursor,
  onToggle,
  onExpand,
  onRelabel,
  onSetColor,
  onReorder,
  onDisconnect,
}: {
  device: Device;
  label?: string;
  note?: string;
  color?: ColorTag;
  lastSeen?: number;
  pinned: boolean;
  locked: boolean;
  selected: boolean;
  cursor: boolean;
  onToggle: () => void;
  onExpand: () => void;
  onRelabel: (name: string) => void;
  onSetColor: (c: ColorTag | null) => void;
  onReorder: (sourceSerial: string, position: 'before' | 'after') => void;
  onDisconnect: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [dropEdge, setDropEdge] = useState<'before' | 'after' | null>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      labelInputRef.current?.focus();
      labelInputRef.current?.select();
    }
  }, [editing]);

  const startEditing = () => {
    setDraft(label ?? '');
    setEditing(true);
  };
  const commitLabel = () => {
    onRelabel(draft);
    setEditing(false);
  };
  const cancelLabel = () => {
    setDraft('');
    setEditing(false);
  };
  const status = getStateKey(device.state);
  const dotClass =
    status === 'online'
      ? 'bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.18)]'
      : status === 'unauthorized'
        ? 'bg-amber-500 shadow-[0_0_0_2px_rgba(245,158,11,0.18)]'
        : 'bg-zinc-600';
  const location = device.tailnet
    ? [device.tailnet.location, device.tailnet.site, device.tailnet.region, device.tailnet.name]
        .filter(Boolean)
        .join(' / ')
    : undefined;
  const serialTail = device.serial.replace(/^\d+\.\d+\.\d+\./, '').replace(/:5555$/, '');

  const displayName = label || device.model || device.serial;
  const baseSubtitle = label
    ? location
      ? `${device.model || serialTail} • ${location}`
      : device.model || serialTail
    : location
      ? `${location} • ${serialTail}`
      : serialTail;
  const offline = status !== 'online';
  const lastSeenLabel = offline && lastSeen ? relTime(Date.now() - lastSeen) : null;
  const subtitle = lastSeenLabel ? `${baseSubtitle} • offline ${lastSeenLabel}` : baseSubtitle;

  return (
    <li
      className="relative"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('application/x-device-serial')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        setDropEdge(e.clientY < mid ? 'before' : 'after');
      }}
      onDragLeave={(e) => {
        // Only clear when the cursor actually exits the li, not when it crosses children.
        const next = e.relatedTarget as Node | null;
        if (next && (e.currentTarget as HTMLElement).contains(next)) return;
        setDropEdge(null);
      }}
      onDrop={(e) => {
        const source = e.dataTransfer.getData('application/x-device-serial');
        if (!source) return;
        e.preventDefault();
        const edge = dropEdge ?? 'before';
        setDropEdge(null);
        if (source === device.serial) return;
        onReorder(source, edge);
      }}
    >
      {dropEdge === 'before' && (
        <span aria-hidden className="pointer-events-none absolute left-1.5 right-1.5 top-0 h-0.5 rounded bg-cyan-400" />
      )}
      <div
        className={`group relative flex items-center gap-1 rounded-md border pl-2.5 pr-2 py-1.5 transition-colors duration-[120ms] ${
          cursor
            ? 'border-cyan-400/70 bg-cyan-500/10'
            : selected
              ? 'border-emerald-500/40 bg-emerald-500/10'
              : 'ui-chip-surface border-transparent hover:border-zinc-700 hover:bg-zinc-900'
        }`}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          e.preventDefault();
          startEditing();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          const items = deviceContextMenuItems({
            device,
            label,
            selected,
            pinned,
            onStartRename: startEditing,
          });
          useContextMenuStore.getState().open(items, e.clientX, e.clientY);
        }}
      >
        {color && (
          <span
            aria-hidden
            className={`pointer-events-none absolute left-0 top-1 bottom-1 w-0.5 rounded-r ${colorBgClass(color)}`}
          />
        )}
        {editing ? (
          <span className="flex-1 min-w-0 flex items-center gap-2">
            <span className={`shrink-0 w-2 h-2 rounded-full ${dotClass}`} aria-hidden />
            <span className="relative flex-1 min-w-0 h-7 inline-flex items-center rounded border border-cyan-500/45 bg-cyan-500/[0.06] focus-within:ring-2 focus-within:ring-cyan-500/50">
              <input
                ref={labelInputRef}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={(e) => {
                  if (e.relatedTarget && (e.relatedTarget as HTMLElement).dataset?.role === 'color-swatch') return;
                  commitLabel();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitLabel();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelLabel();
                  }
                }}
                placeholder={device.model || device.serial}
                aria-label={`Rename ${device.model || device.serial}`}
                maxLength={48}
                className="h-full w-full bg-transparent pl-2 pr-1 text-xs text-cyan-100 placeholder:text-zinc-600 focus:outline-none font-mono"
              />
              <ColorSwatchRow color={color} onSetColor={onSetColor} />
              <span aria-hidden="true" className="pr-2 text-[9px] uppercase tracking-[0.16em] text-cyan-300/70">
                ⏎
              </span>
            </span>
          </span>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            className="flex-1 min-w-0 flex items-center gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded"
            aria-pressed={selected}
            title="Click to select · Double-click to rename"
          >
            <span className={`shrink-0 w-2 h-2 rounded-full ${dotClass}`} aria-hidden />
            <span className="flex-1 min-w-0">
              <span className="block text-xs text-zinc-100 truncate flex items-center gap-1">
                {pinned && (
                  <Pin
                    size={9}
                    className="shrink-0 text-cyan-300 -rotate-45"
                    aria-label="pinned"
                  />
                )}
                <span className="truncate">{displayName}</span>
                {locked && (
                  <Lock
                    size={9}
                    className="shrink-0 text-amber-300"
                    aria-label="input locked"
                  >
                    <title>Input locked — press Shift+L to unlock</title>
                  </Lock>
                )}
                {note && (
                  <StickyNote
                    size={9}
                    className="shrink-0 text-amber-300/80"
                    aria-label="has note"
                  >
                    <title>{note.length > 120 ? `${note.slice(0, 117)}…` : note}</title>
                  </StickyNote>
                )}
              </span>
              <span className="block text-[10px] text-zinc-500 truncate font-mono">
                {subtitle}
              </span>
            </span>
            {selected && (
              <Check size={12} className="text-emerald-300 shrink-0" aria-label="selected" />
            )}
          </button>
        )}
        {!editing && (
          <>
            <span
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-device-serial', device.serial);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => setDropEdge(null)}
              role="button"
              tabIndex={-1}
              aria-label={`Reorder ${device.model || device.serial}`}
              title="Drag to reorder"
              className="shrink-0 h-7 w-5 inline-flex items-center justify-center ui-chip-surface text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-cyan-200 cursor-grab active:cursor-grabbing transition-opacity duration-[120ms]"
            >
              <GripVertical size={12} />
            </span>
            <button
              type="button"
              onClick={startEditing}
              className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded ui-chip-surface text-zinc-500 opacity-0 group-hover:opacity-100 hover:text-cyan-200 hover:bg-zinc-800 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-cyan-500 transition-opacity duration-[120ms]"
              aria-label={`Rename ${device.model || device.serial}`}
              title="Rename (double-click row also works)"
            >
              <Type size={12} />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onDisconnect();
                } finally {
                  setBusy(false);
                }
              }}
              className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-rose-300 hover:bg-rose-500/10 disabled:opacity-40 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-rose-500/60 transition-opacity duration-[120ms]"
              aria-label={`Disconnect ${device.model || device.serial}`}
              title="Disconnect device"
            >
              <Unplug size={12} />
            </button>
            <button
              type="button"
              onClick={onExpand}
              className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded ui-chip-surface text-zinc-500 hover:text-cyan-200 hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
              aria-label={`Open ${device.model || device.serial} in detail`}
              title="Open detail"
            >
              <ExpandIcon size={13} />
            </button>
          </>
        )}
      </div>
      {dropEdge === 'after' && (
        <span aria-hidden className="pointer-events-none absolute left-1.5 right-1.5 bottom-0 h-0.5 rounded bg-cyan-400" />
      )}
    </li>
  );
}

function ColorSwatchRow({
  color,
  onSetColor,
}: {
  color: ColorTag | undefined;
  onSetColor: (c: ColorTag | null) => void;
}) {
  return (
    <span className="inline-flex items-center gap-0.5 pr-1.5 border-l border-zinc-800 ml-1 pl-1.5">
      <button
        type="button"
        data-role="color-swatch"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onSetColor(null)}
        title="Clear color"
        aria-label="Clear color tag"
        className={`h-3.5 w-3.5 rounded-full border border-zinc-700 inline-flex items-center justify-center text-[9px] text-zinc-500 hover:border-zinc-500 ${
          !color ? 'ring-1 ring-zinc-400/50' : ''
        }`}
      >
        ⌀
      </button>
      {COLOR_TAGS.map((c) => (
        <button
          key={c}
          type="button"
          data-role="color-swatch"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSetColor(c)}
          title={c}
          aria-label={`Set color ${c}`}
          className={`h-3.5 w-3.5 rounded-full ${colorBgClass(c)} hover:scale-110 transition-transform ${
            color === c ? 'ring-1 ring-zinc-100' : ''
          }`}
        />
      ))}
    </span>
  );
}

type SceneEdit = null | { kind: 'new' } | { kind: 'rename'; id: string };

const DEFAULT_SCENE_ID = 'default';

function SceneTabs({
  scenes,
  activeId,
  onPick,
  onCreate,
  onRename,
  onRemove,
  onReorder,
}: {
  scenes: { id: string; name: string }[];
  activeId: string;
  onPick: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onReorder: (id: string, beforeId: string | null) => void;
}) {
  const [edit, setEdit] = useState<SceneEdit>(null);
  const [draft, setDraft] = useState('');

  const startCreate = () => {
    setDraft('');
    setEdit({ kind: 'new' });
  };

  const startRename = (id: string, original: string) => {
    if (id === DEFAULT_SCENE_ID) return;
    setDraft(original);
    setEdit({ kind: 'rename', id });
  };

  const commit = () => {
    const name = draft.trim();
    if (edit?.kind === 'new' && name) onCreate(name);
    if (edit?.kind === 'rename' && name) onRename(edit.id, name);
    setDraft('');
    setEdit(null);
  };

  const cancel = () => {
    setDraft('');
    setEdit(null);
  };

  const remove = async (id: string, name: string) => {
    if (id === DEFAULT_SCENE_ID) return;
    const ok = await confirmDialog({
      title: `Delete scene "${name}"?`,
      body: 'The scene and its saved selection set will be removed. Devices are not affected.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    onRemove(id);
    setEdit(null);
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {scenes.map((sc, idx) => {
        if (edit?.kind === 'rename' && edit.id === sc.id) {
          return (
            <SceneEditor
              key={sc.id}
              draft={draft}
              onDraft={setDraft}
              onCommit={commit}
              onCancel={cancel}
              onDelete={sc.id === DEFAULT_SCENE_ID ? undefined : () => remove(sc.id, sc.name)}
              ariaLabel={`Rename scene ${sc.name}`}
              widthClass="w-[9rem]"
            />
          );
        }
        const active = sc.id === activeId;
        const editable = sc.id !== DEFAULT_SCENE_ID;
        // Number-key shortcut hint. idx 0 = default 'All' = key `0`; idx 1..9
        // = scene keys `1`-`9`. Beyond idx 9, no shortcut.
        const hotkey = idx <= 9 ? String(idx) : null;
        return (
          <button
            key={sc.id}
            type="button"
            draggable={editable}
            onDragStart={(e) => {
              if (!editable) return;
              e.dataTransfer.setData('application/x-phone-remote-scene', sc.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              const types = e.dataTransfer.types;
              if (!types.includes('application/x-phone-remote-scene')) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e) => {
              const src = e.dataTransfer.getData('application/x-phone-remote-scene');
              if (!src || src === sc.id) return;
              e.preventDefault();
              onReorder(src, sc.id);
            }}
            onClick={() => onPick(sc.id)}
            onDoubleClick={editable ? () => startRename(sc.id, sc.name) : undefined}
            title={
              hotkey != null
                ? `Press ${hotkey} to activate · ${editable ? 'double-click to rename' : 'default scene'}`
                : editable
                  ? 'Click to activate · double-click to rename'
                  : 'Default scene'
            }
            className={`group relative h-7 inline-flex items-center gap-1 rounded border pl-2 pr-1.5 text-[11px] transition-colors duration-[120ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
              active
                ? 'bg-cyan-500/12 border-cyan-500/45 text-cyan-100'
                : 'border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700'
            }`}
          >
            {hotkey != null && (
              <kbd
                aria-hidden
                className={`inline-flex h-4 min-w-[1rem] items-center justify-center rounded border px-1 font-mono text-[9px] tabular-nums ${
                  active
                    ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200'
                    : 'border-zinc-800 ui-chip-surface text-zinc-500 group-hover:text-zinc-300'
                }`}
              >
                {hotkey}
              </kbd>
            )}
            <span>{sc.name}</span>
            {editable && (
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  startRename(sc.id, sc.name);
                }}
                aria-label={`Edit scene ${sc.name}`}
                title="Rename / delete"
                className={`inline-flex h-4 w-4 items-center justify-center rounded text-zinc-500 hover:text-cyan-200 transition-opacity duration-[120ms] ${
                  active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
              >
                <Pencil size={10} />
              </span>
            )}
          </button>
        );
      })}

      {edit?.kind === 'new' ? (
        <SceneEditor
          draft={draft}
          onDraft={setDraft}
          onCommit={commit}
          onCancel={cancel}
          ariaLabel="New scene name"
          placeholder="scene name"
          widthClass="w-[8.5rem]"
        />
      ) : (
        <button
          type="button"
          onClick={startCreate}
          className="h-7 w-7 inline-flex items-center justify-center rounded ui-chip-surface text-zinc-400 hover:text-cyan-200 hover:border-cyan-500/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 transition-colors duration-[120ms]"
          aria-label="New scene"
          title="New scene"
        >
          <Plus size={12} />
        </button>
      )}
    </div>
  );
}

function SceneEditor({
  draft,
  onDraft,
  onCommit,
  onCancel,
  onDelete,
  ariaLabel,
  placeholder,
  widthClass,
}: {
  draft: string;
  onDraft: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  ariaLabel: string;
  placeholder?: string;
  widthClass: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <span className="relative h-7 inline-flex items-center rounded border border-cyan-500/45 bg-cyan-500/[0.06] focus-within:ring-2 focus-within:ring-cyan-500/50">
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => onDraft(e.target.value)}
        onBlur={(e) => {
          // Don't commit if focus moved to the inline delete affordance.
          if (e.relatedTarget && (e.relatedTarget as HTMLElement).dataset.role === 'scene-delete') return;
          onCommit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onCommit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        maxLength={32}
        className={`h-full bg-transparent pl-2 pr-1 text-[11px] text-cyan-100 placeholder:text-zinc-600 focus:outline-none font-mono ${widthClass}`}
      />
      {onDelete && (
        <button
          type="button"
          data-role="scene-delete"
          onMouseDown={(e) => e.preventDefault() /* keep input focused; commit-on-blur won't fire */}
          onClick={onDelete}
          aria-label="Delete scene"
          title="Delete scene"
          className="h-5 w-5 inline-flex items-center justify-center rounded text-zinc-500 hover:text-rose-300 hover:bg-rose-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 transition-colors"
        >
          <Trash2 size={10} />
        </button>
      )}
      <span aria-hidden="true" className="px-1.5 text-[9px] uppercase tracking-[0.16em] text-cyan-300/70">
        ⏎
      </span>
    </span>
  );
}

function StateChips({
  counts,
  value,
  onChange,
}: {
  counts: { online: number; unauthorized: number; offline: number };
  value: Record<string, boolean>;
  onChange: (v: Record<string, boolean>) => void;
}) {
  const toggle = (key: string) => onChange({ ...value, [key]: !value[key] });
  const chip = (key: 'online' | 'unauthorized' | 'offline', dot: string, label: string, count: number) => (
    <button
      type="button"
      onClick={() => toggle(key)}
      className={`flex-1 h-7 inline-flex items-center justify-center gap-1.5 rounded border text-[11px] ui-chip-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
        value[key]
          ? 'ui-chip-surface-active text-zinc-100'
          : 'border-zinc-900 text-zinc-500 hover:text-zinc-300'
      }`}
      aria-pressed={value[key]}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <span>{label}</span>
      <span className="tabular-nums">{count}</span>
    </button>
  );

  return (
    <div className="flex items-center gap-1" aria-label="Filter by state">
      {chip('online', 'bg-emerald-500', 'online', counts.online)}
      {chip('unauthorized', 'bg-amber-500', 'unauth', counts.unauthorized)}
      {chip('offline', 'bg-zinc-500', 'offline', counts.offline)}
    </div>
  );
}

function AttrChips({
  counts,
  value,
  onChange,
}: {
  counts: { locked: number; withNotes: number };
  value: AttrFilter;
  onChange: (v: AttrFilter) => void;
}) {
  // Hide the whole row when neither attribute exists anywhere — no point
  // showing chips that can only match zero devices.
  if (counts.locked === 0 && counts.withNotes === 0 && !value.locked && !value.withNotes) return null;
  const chip = (
    key: keyof AttrFilter,
    Icon: typeof Lock,
    label: string,
    count: number,
    activeTone: string,
  ) => {
    const active = value[key];
    const inert = count === 0 && !active;
    return (
      <button
        type="button"
        onClick={() => onChange({ ...value, [key]: !value[key] })}
        disabled={inert}
        aria-pressed={active}
        title={active ? `Showing only ${label} (click to clear)` : `Show only ${label}`}
        className={`flex-1 h-7 inline-flex items-center justify-center gap-1.5 rounded border text-[11px] ui-chip-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed ${
          active
            ? activeTone
            : 'border-zinc-900 text-zinc-500 hover:text-zinc-300'
        }`}
      >
        <Icon size={11} />
        <span>{label}</span>
        <span className="tabular-nums">{count}</span>
      </button>
    );
  };
  return (
    <div className="flex items-center gap-1" aria-label="Filter by attribute">
      {chip('locked', Lock, 'locked', counts.locked, 'border-amber-500/45 bg-amber-500/10 text-amber-200')}
      {chip('withNotes', StickyNote, 'has notes', counts.withNotes, 'border-cyan-500/45 bg-cyan-500/10 text-cyan-200')}
    </div>
  );
}

function FilterRow({
  label,
  icon,
  values,
  value,
  onChange,
  formatter,
  emptyLabel,
}: {
  label: string;
  icon: ReactNode;
  values: Array<[string, number]>;
  value: Record<string, boolean>;
  onChange: (v: Record<string, boolean>) => void;
  formatter?: (v: string) => string;
  emptyLabel?: string;
}) {
  if (values.length === 0) return null;
  const toggle = (key: string) => onChange({ ...value, [key]: !value[key] });
  const rendered = values.filter(([key]) => key !== UNKNOWN_LOCATION || Boolean(emptyLabel));

  return (
    <div className="flex flex-wrap items-center gap-1" aria-label={`Filter by ${label.toLowerCase()}`}>
      {rendered.length > 0 ? (
        rendered.map(([key, count]) => {
          const text = formatter ? formatter(key) : key;
          return (
            <button
              type="button"
              key={`${label}-${key}`}
              onClick={() => toggle(key)}
              className={`h-7 inline-flex items-center gap-1 px-2 rounded border text-[11px] ui-chip-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
                value[key]
                  ? 'ui-chip-surface-active text-zinc-100'
                  : 'border-zinc-900 text-zinc-500 hover:text-zinc-300'
              }`}
              aria-pressed={value[key]}
            >
              {icon}
              <span className="max-w-[8rem] truncate">{text}</span>
              <span className="tabular-nums">{count}</span>
            </button>
          );
        })
      ) : emptyLabel ? (
        <span className="inline-flex items-center gap-1 px-2 h-7 rounded border border-zinc-900 text-zinc-600 text-[11px]">
          <Filter size={11} />
          {emptyLabel}
        </span>
      ) : null}
    </div>
  );
}
