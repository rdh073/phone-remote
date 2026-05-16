import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MAX = 8192;

type State = {
  text: string;
  open: boolean;
  setText: (text: string) => void;
  toggle: () => void;
  setOpen: (v: boolean) => void;
  clear: () => void;
};

export const useScratchpadStore = create<State>()(
  persist(
    (set) => ({
      text: '',
      open: false,
      setText: (text) => set({ text: text.slice(0, MAX) }),
      toggle: () => set((s) => ({ open: !s.open })),
      setOpen: (open) => set({ open }),
      clear: () => set({ text: '' }),
    }),
    {
      name: 'phone-remote-scratchpad',
      // Only persist the text; `open` is session-local so the widget doesn't
      // pop open on every page load.
      partialize: (s) => ({ text: s.text }),
    },
  ),
);

export const SCRATCHPAD_MAX = MAX;
