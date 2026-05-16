import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type State = {
  /** User-defined drag-reorder list (does NOT include pinned items). */
  order: string[];
  /** Pinned-to-top list, newest-pin-first. Always sorted above `order`. */
  pinned: string[];
  reorder: (sourceSerial: string, targetSerial: string, position: 'before' | 'after') => void;
  pin: (serial: string) => void;
  unpin: (serial: string) => void;
  togglePin: (serial: string) => void;
  isPinned: (serial: string) => boolean;
  clear: () => void;
};

export const useDeviceOrderStore = create<State>()(
  persist(
    (set, get) => ({
      order: [],
      pinned: [],
      reorder: (sourceSerial, targetSerial, position) =>
        set((s) => {
          if (sourceSerial === targetSerial) return s;
          // Reordering removes pin state — operator chose a specific slot for it.
          const pinned = s.pinned.filter((x) => x !== sourceSerial && x !== targetSerial);
          const seeded = Array.from(new Set([...s.order, sourceSerial, targetSerial]));
          const without = seeded.filter((x) => x !== sourceSerial);
          const targetIdx = without.indexOf(targetSerial);
          if (targetIdx < 0) return { pinned, order: [sourceSerial, ...without] };
          const insertAt = position === 'before' ? targetIdx : targetIdx + 1;
          const next = [...without.slice(0, insertAt), sourceSerial, ...without.slice(insertAt)];
          return { pinned, order: next };
        }),
      pin: (serial) =>
        set((s) => ({
          pinned: [serial, ...s.pinned.filter((x) => x !== serial)],
          order: s.order.filter((x) => x !== serial),
        })),
      unpin: (serial) => set((s) => ({ pinned: s.pinned.filter((x) => x !== serial) })),
      togglePin: (serial) => {
        const { pinned, pin, unpin } = get();
        if (pinned.includes(serial)) unpin(serial);
        else pin(serial);
      },
      isPinned: (serial) => get().pinned.includes(serial),
      clear: () => set({ order: [], pinned: [] }),
    }),
    { name: 'phone-remote-device-order' },
  ),
);

/**
 * Sort comparator: pinned items first (in pin insertion order), then user-ordered,
 * then untouched devices (which retain their incoming order).
 */
export function compareBySavedOrder(pinned: string[], order: string[]) {
  const pinRank = new Map<string, number>();
  pinned.forEach((serial, idx) => pinRank.set(serial, idx));
  const ordRank = new Map<string, number>();
  order.forEach((serial, idx) => ordRank.set(serial, idx));

  return (a: { serial: string }, b: { serial: string }) => {
    const pa = pinRank.get(a.serial);
    const pb = pinRank.get(b.serial);
    if (pa != null || pb != null) {
      if (pa != null && pb != null) return pa - pb;
      return pa != null ? -1 : 1;
    }
    const oa = ordRank.get(a.serial);
    const ob = ordRank.get(b.serial);
    if (oa == null && ob == null) return 0;
    if (oa == null) return 1;
    if (ob == null) return -1;
    return oa - ob;
  };
}
