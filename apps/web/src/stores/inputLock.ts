import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type State = {
  /** Serials whose taps/swipes are swallowed before reaching the device. */
  lockedSerials: string[];
  isLocked: (serial: string) => boolean;
  toggle: (serial: string) => boolean;
  setLocked: (serial: string, next: boolean) => void;
  unlockAll: () => void;
};

export const useInputLockStore = create<State>()(
  persist(
    (set, get) => ({
      lockedSerials: [],
      isLocked: (serial) => get().lockedSerials.includes(serial),
      toggle: (serial) => {
        const set_ = new Set(get().lockedSerials);
        const next = !set_.has(serial);
        if (next) set_.add(serial);
        else set_.delete(serial);
        set({ lockedSerials: Array.from(set_) });
        return next;
      },
      setLocked: (serial, next) => {
        const set_ = new Set(get().lockedSerials);
        if (next) set_.add(serial);
        else set_.delete(serial);
        set({ lockedSerials: Array.from(set_) });
      },
      unlockAll: () => set({ lockedSerials: [] }),
    }),
    { name: 'phone-remote-input-lock' },
  ),
);
