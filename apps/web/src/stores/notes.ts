import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type State = {
  notes: Record<string, string>;
  setNote: (serial: string, text: string) => void;
  removeNote: (serial: string) => void;
};

export const useNotesStore = create<State>()(
  persist(
    (set) => ({
      notes: {},
      setNote: (serial, text) =>
        set((s) => {
          const trimmed = text;
          if (!trimmed.trim()) {
            const { [serial]: _drop, ...rest } = s.notes;
            return { notes: rest };
          }
          // Cap at 4 KB per device — generous for ops memos, bounded for localStorage.
          return { notes: { ...s.notes, [serial]: trimmed.slice(0, 4096) } };
        }),
      removeNote: (serial) =>
        set((s) => {
          const { [serial]: _drop, ...rest } = s.notes;
          return { notes: rest };
        }),
    }),
    { name: 'phone-remote-notes' },
  ),
);
