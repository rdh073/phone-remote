import { create } from 'zustand';

type State = {
  sync: boolean;
  toggleSync: () => void;
  setSync: (v: boolean) => void;
};

export const useControlsStore = create<State>()((set) => ({
  sync: false,
  toggleSync: () => set((s) => ({ sync: !s.sync })),
  setSync: (v) => set({ sync: v }),
}));
