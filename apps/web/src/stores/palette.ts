import { create } from 'zustand';

type State = {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
};

export const usePaletteStore = create<State>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
