import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { persist } from 'zustand/middleware';

const CAP = 50;

export type InputHistoryStore = {
  history: string[];
  push: (entry: string) => void;
  clear: () => void;
};

function makeStore(persistKey: string): UseBoundStore<StoreApi<InputHistoryStore>> {
  return create<InputHistoryStore>()(
    persist(
      (set) => ({
        history: [],
        push: (entry) =>
          set((s) => {
            const trimmed = entry.trim();
            if (!trimmed) return s;
            if (s.history[0] === trimmed) return s;
            return { history: [trimmed, ...s.history.filter((c) => c !== trimmed)].slice(0, CAP) };
          }),
        clear: () => set({ history: [] }),
      }),
      { name: persistKey },
    ),
  );
}

// Legacy key for shell — preserves any history collected before the refactor.
export const useShellHistoryStore = makeStore('phone-remote-shell-history');
export const useTextHistoryStore = makeStore('phone-remote-text-history');
