import { useEffect, useMemo, useRef, useState } from 'react';

import type { Device } from '@phone-remote/protocol';

import { useDevicesStore } from '../stores/devices';

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (mention: string) => void;
  /** Free-text query the operator already typed after the `@`, e.g. "pix" from "@pix". */
  query: string;
}

/**
 * `@` mention popup — pick a device serial to insert into the composer.
 *
 * Selected devices appear first under a "selected" group, followed by everything
 * else grouped by state. Pick with Enter or click; Esc closes without inserting.
 * Mirrors cliper's @ context popup but scoped to phone-remote's device store.
 */
export function AssistantDevicePicker({ open, onClose, onPick, query }: Props) {
  const devices = useDevicesStore((s) => s.devices);
  const selectedSerials = useDevicesStore((s) => s.selectedSerials);
  const [activeIdx, setActiveIdx] = useState(0);
  const itemsRef = useRef<HTMLUListElement | null>(null);

  const groups = useMemo(() => buildGroups(devices, selectedSerials, query), [devices, selectedSerials, query]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => {
    if (activeIdx >= flat.length) setActiveIdx(Math.max(0, flat.length - 1));
  }, [activeIdx, flat.length]);

  useEffect(() => {
    if (!open) return;
    setActiveIdx(0);
  }, [open, query]);

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
        if (flat.length === 0) return;
        setActiveIdx((i) => (i + 1) % flat.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (flat.length === 0) return;
        setActiveIdx((i) => (i - 1 + flat.length) % flat.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const picked = flat[activeIdx];
        if (picked) {
          onPick(mentionFor(picked.device));
          onClose();
        }
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, flat, activeIdx, onClose, onPick]);

  if (!open) return null;

  return (
    <div
      role="listbox"
      aria-label="Mention a device"
      className="absolute bottom-full left-2 right-2 z-50 mb-1 overflow-hidden rounded-md border border-zinc-700 ui-popover-surface shadow-2xl"
    >
      <p className="border-b border-zinc-800 px-3 py-1.5 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-zinc-500">
        Mention a device {query ? <span className="text-zinc-300">·  filter: {query}</span> : null}
      </p>
      {flat.length === 0 && (
        <p className="px-3 py-3 text-sm text-zinc-500">
          No devices match.{' '}
          {devices.length === 0 ? 'Pair one first.' : 'Type to filter by model/serial.'}
        </p>
      )}
      <ul ref={itemsRef} className="max-h-60 overflow-auto py-1">
        {groups.map((group) => (
          <li key={group.label}>
            <p className="px-3 pt-1.5 pb-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-zinc-500">
              {group.label}
            </p>
            <ul>
              {group.items.map((item) => {
                const idx = flat.indexOf(item);
                const active = idx === activeIdx;
                return (
                  <li key={item.device.serial}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => {
                        onPick(mentionFor(item.device));
                        onClose();
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                        active
                          ? 'bg-cyan-500/10 text-cyan-100'
                          : 'text-zinc-200 hover:bg-zinc-800/80'
                      }`}
                    >
                      <StateDot state={item.device.state} />
                      <span className="min-w-0 flex-1 truncate">
                        {item.device.model ? (
                          <>
                            <span className="text-zinc-200">{item.device.model}</span>{' '}
                            <span className="text-zinc-500 font-mono">{item.device.serial}</span>
                          </>
                        ) : (
                          <span className="font-mono text-zinc-200">{item.device.serial}</span>
                        )}
                      </span>
                      <span className="font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-zinc-500">
                        {item.device.source}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface PickerItem {
  device: Device;
}

interface PickerGroup {
  label: string;
  items: PickerItem[];
}

function buildGroups(
  devices: readonly Device[],
  selectedSerials: ReadonlySet<string>,
  query: string,
): PickerGroup[] {
  const q = query.trim().toLowerCase();
  const matches = (d: Device) =>
    !q ||
    d.serial.toLowerCase().includes(q) ||
    (d.model ?? '').toLowerCase().includes(q);

  const selected: PickerItem[] = [];
  const online: PickerItem[] = [];
  const other: PickerItem[] = [];
  for (const device of devices) {
    if (!matches(device)) continue;
    if (selectedSerials.has(device.serial)) selected.push({ device });
    else if (device.state === 'device') online.push({ device });
    else other.push({ device });
  }
  const groups: PickerGroup[] = [];
  if (selected.length > 0) groups.push({ label: 'selected', items: selected });
  if (online.length > 0) groups.push({ label: 'online', items: online });
  if (other.length > 0) groups.push({ label: 'other', items: other });
  return groups;
}

function mentionFor(device: Device): string {
  // Serial is what the assistant tools actually accept, so the mention is the
  // raw serial. Model name (if any) goes in the picker label but not the text.
  return `@${device.serial}`;
}

function StateDot({ state }: { state: Device['state'] }) {
  const cls =
    state === 'device'
      ? 'bg-emerald-400'
      : state === 'unauthorized'
        ? 'bg-amber-400'
        : 'bg-zinc-500';
  return <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${cls}`} />;
}
