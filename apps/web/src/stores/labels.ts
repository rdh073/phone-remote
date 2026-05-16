import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type State = {
  labels: Record<string, string>;
  setLabel: (serial: string, label: string) => void;
  removeLabel: (serial: string) => void;
};

export const useLabelsStore = create<State>()(
  persist(
    (set) => ({
      labels: {},
      setLabel: (serial, label) =>
        set((s) => {
          const trimmed = label.trim();
          if (!trimmed) {
            const { [serial]: _drop, ...rest } = s.labels;
            return { labels: rest };
          }
          return { labels: { ...s.labels, [serial]: trimmed.slice(0, 48) } };
        }),
      removeLabel: (serial) =>
        set((s) => {
          const { [serial]: _drop, ...rest } = s.labels;
          return { labels: rest };
        }),
    }),
    { name: 'phone-remote-labels' },
  ),
);
