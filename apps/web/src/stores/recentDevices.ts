import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const CAP = 8;

type State = {
  /** Most-recently-opened first. */
  recent: string[];
  push: (serial: string) => void;
  remove: (serial: string) => void;
  clear: () => void;
};

export const useRecentDevicesStore = create<State>()(
  persist(
    (set) => ({
      recent: [],
      push: (serial) =>
        set((s) => {
          const next = [serial, ...s.recent.filter((x) => x !== serial)].slice(0, CAP);
          return { recent: next };
        }),
      remove: (serial) =>
        set((s) => ({ recent: s.recent.filter((x) => x !== serial) })),
      clear: () => set({ recent: [] }),
    }),
    { name: 'phone-remote-recent-devices' },
  ),
);
