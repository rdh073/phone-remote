import type { ReactNode } from 'react';
import { create } from 'zustand';

export type ContextMenuItem = {
  id: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  danger?: boolean;
  onSelect: () => void | Promise<void>;
};

type State = {
  items: ContextMenuItem[] | null;
  x: number;
  y: number;
  open: (items: ContextMenuItem[], x: number, y: number) => void;
  close: () => void;
};

export const useContextMenuStore = create<State>()((set) => ({
  items: null,
  x: 0,
  y: 0,
  open: (items, x, y) => set({ items, x, y }),
  close: () => set({ items: null }),
}));
