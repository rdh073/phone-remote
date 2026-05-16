import { create } from 'zustand';

type State = {
  /** Per-serial generation counter. Tile streams use this as an effect dep
   *  to force teardown + reconnect when bumped. */
  counters: Record<string, number>;
  bump: (serial: string) => void;
  get: (serial: string) => number;
};

export const useReconnectStore = create<State>()((set, get) => ({
  counters: {},
  bump: (serial) =>
    set((s) => ({
      counters: { ...s.counters, [serial]: (s.counters[serial] ?? 0) + 1 },
    })),
  get: (serial) => get().counters[serial] ?? 0,
}));
