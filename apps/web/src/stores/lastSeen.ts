import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type State = {
  /** Most-recent ms timestamp at which each serial was observed as `state === 'device'`. */
  lastSeen: Record<string, number>;
  mark: (serial: string, at?: number) => void;
  markBatch: (serials: Iterable<string>, at?: number) => void;
  forget: (serial: string) => void;
};

export const useLastSeenStore = create<State>()(
  persist(
    (set) => ({
      lastSeen: {},
      mark: (serial, at = Date.now()) =>
        set((s) => ({ lastSeen: { ...s.lastSeen, [serial]: at } })),
      markBatch: (serials, at = Date.now()) =>
        set((s) => {
          const next = { ...s.lastSeen };
          let dirty = false;
          for (const serial of serials) {
            // Only update if it's actually newer — avoids re-render storms when timestamps match.
            if (next[serial] !== at) {
              next[serial] = at;
              dirty = true;
            }
          }
          return dirty ? { lastSeen: next } : s;
        }),
      forget: (serial) =>
        set((s) => {
          const { [serial]: _drop, ...rest } = s.lastSeen;
          return { lastSeen: rest };
        }),
    }),
    { name: 'phone-remote-last-seen' },
  ),
);

/** Compact relative-time formatter — bash-style short units. */
export function relTime(deltaMs: number): string {
  const s = Math.floor(deltaMs / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
