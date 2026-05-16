import type { ReactNode } from 'react';
import { Camera, Check, Copy, Lock, LockOpen, Maximize2, Pin, PinOff, Power, Type, Unplug } from 'lucide-react';
import type { Device } from '@phone-remote/protocol';

import { logActivity } from '../stores/activity';
import { useDeviceOrderStore } from '../stores/deviceOrder';
import { useDevicesStore } from '../stores/devices';
import { useInputLockStore } from '../stores/inputLock';
import { useLabelsStore } from '../stores/labels';
import { confirmDialog } from '../stores/dialog';
import { toast } from '../stores/toasts';
import { disconnectDevice, rebootDevice } from './api';
import { downloadDeviceScreenshot } from './download';
import type { ContextMenuItem } from '../stores/contextMenu';

const icon = (Icon: typeof Camera): ReactNode => <Icon size={13} />;

export function deviceContextMenuItems(opts: {
  device: Device;
  label?: string;
  selected: boolean;
  pinned?: boolean;
  onStartRename: () => void;
}): ContextMenuItem[] {
  const { device, label, selected, pinned, onStartRename } = opts;
  const display = label || device.model || device.serial;
  const isPinned = pinned ?? useDeviceOrderStore.getState().isPinned(device.serial);
  const isLocked = useInputLockStore.getState().lockedSerials.includes(device.serial);

  return [
    {
      id: 'open',
      label: 'Open in detail',
      hint: 'F',
      icon: icon(Maximize2),
      onSelect: () => {
        useDevicesStore.getState().setCursor(device.serial);
        useDevicesStore.getState().enterDetail(device.serial);
      },
    },
    {
      id: 'pin',
      label: isPinned ? 'Unpin' : 'Pin to top',
      icon: icon(isPinned ? PinOff : Pin),
      onSelect: () => useDeviceOrderStore.getState().togglePin(device.serial),
    },
    {
      id: 'rename',
      label: 'Rename…',
      icon: icon(Type),
      onSelect: () => {
        onStartRename();
      },
    },
    {
      id: 'select',
      label: selected ? 'Unselect' : 'Select',
      hint: '⇧·click',
      icon: icon(Check),
      onSelect: () => useDevicesStore.getState().toggleSelected(device.serial),
    },
    {
      id: 'input-lock',
      label: isLocked ? 'Unlock input' : 'Lock input',
      hint: '⇧·L',
      icon: icon(isLocked ? LockOpen : Lock),
      onSelect: () => {
        const next = useInputLockStore.getState().toggle(device.serial);
        toast.info(next ? `Input locked · ${display}` : `Input unlocked · ${display}`, {
          description: next ? 'Taps and swipes will be swallowed.' : 'Device will receive input again.',
        });
        logActivity({
          kind: 'lock',
          target: display,
          outcome: 'ok',
          detail: next ? 'locked' : 'unlocked',
        });
      },
    },
    {
      id: 'copy',
      label: 'Copy serial',
      icon: icon(Copy),
      onSelect: async () => {
        try {
          await navigator.clipboard.writeText(device.serial);
          toast.success('Serial copied', { description: device.serial });
        } catch (err) {
          toast.error('Clipboard blocked', { description: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    {
      id: 'screenshot',
      label: 'Screenshot',
      icon: icon(Camera),
      onSelect: async () => {
        try {
          await downloadDeviceScreenshot(device.serial);
          toast.success('Screenshot saved', { description: 'Check your Downloads folder.' });
          logActivity({ kind: 'screenshot', target: display, outcome: 'ok' });
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          toast.error('Screenshot failed', { description: detail });
          logActivity({ kind: 'screenshot', target: display, outcome: 'error', detail });
        }
      },
    },
    {
      id: 'reboot',
      label: 'Reboot',
      icon: icon(Power),
      danger: true,
      onSelect: async () => {
        const ok = await confirmDialog({
          title: `Reboot ${display}?`,
          body: device.serial,
          confirmLabel: 'Reboot',
          danger: true,
        });
        if (!ok) return;
        try {
          await rebootDevice(device.serial);
          toast.success(`Reboot issued`, { description: display });
          logActivity({ kind: 'reboot', target: display, outcome: 'ok' });
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          toast.error('Reboot failed', { description: detail });
          logActivity({ kind: 'reboot', target: display, outcome: 'error', detail });
        }
      },
    },
    {
      id: 'disconnect',
      label: 'Disconnect…',
      icon: icon(Unplug),
      danger: true,
      onSelect: async () => {
        const ok = await confirmDialog({
          title: `Disconnect ${display}?`,
          body: 'Runs `adb disconnect`. If Tailscale-managed, the node is also removed from Headscale.',
          confirmLabel: 'Disconnect',
          danger: true,
        });
        if (!ok) return;
        try {
          const result = await disconnectDevice(device.serial);
          const detail = result.tailnetRemoved ? 'Removed from Headscale tailnet' : 'ADB disconnect issued';
          toast.success(`Disconnected ${display}`, { description: detail });
          logActivity({ kind: 'disconnect', target: display, outcome: 'ok', detail });
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          toast.error('Disconnect failed', { description: detail });
          logActivity({ kind: 'disconnect', target: display, outcome: 'error', detail });
        } finally {
          void useDevicesStore.getState().refresh();
          useLabelsStore.getState().removeLabel(device.serial);
        }
      },
    },
  ];
}
