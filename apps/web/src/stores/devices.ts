import { create } from 'zustand';

import { listDevices } from '../lib/api';
import type { Device } from '@phone-remote/protocol';
import { useScenesStore } from './scenes';

type DevicesState = {
  devices: Device[];
  error: string | null;
  loading: boolean;
  selectedSerials: Set<string>;
  detailSerial: string | null;
  cursorSerial: string | null;
  cols: number;
  refresh: () => Promise<void>;
  toggleSelected: (serial: string) => void;
  selectAll: (serials: string[]) => void;
  clearSelection: () => void;
  enterDetail: (serial: string) => void;
  exitDetail: () => void;
  setCursor: (serial: string | null) => void;
  setCols: (n: number) => void;
};

function notifyScenes(serials: Set<string>): void {
  useScenesStore.getState().saveCurrent(serials);
}

export const useDevicesStore = create<DevicesState>()((set, get) => ({
  devices: [],
  error: null,
  loading: false,
  selectedSerials: new Set(),
  detailSerial: null,
  cursorSerial: null,
  cols: 5,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const data = await listDevices();
      set({ devices: data.devices, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  toggleSelected: (serial) => {
    const s = get();
    const next = new Set(s.selectedSerials);
    if (next.has(serial)) next.delete(serial);
    else next.add(serial);
    set({ selectedSerials: next });
    notifyScenes(next);
  },

  selectAll: (serials) => {
    const next = new Set(serials);
    set({ selectedSerials: next });
    notifyScenes(next);
  },

  clearSelection: () => {
    const next: Set<string> = new Set();
    set({ selectedSerials: next });
    notifyScenes(next);
  },

  enterDetail: (serial) => set({ detailSerial: serial }),
  exitDetail: () => set({ detailSerial: null }),

  setCursor: (cursorSerial) => set({ cursorSerial }),
  setCols: (cols) => set({ cols }),
}));
