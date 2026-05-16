import { create } from 'zustand';

export type ActivityKind =
  | 'reboot'
  | 'disconnect'
  | 'screenshot'
  | 'shell'
  | 'rename'
  | 'sync'
  | 'scene'
  | 'pair'
  | 'lock'
  | 'type';

export type ActivityOutcome = 'ok' | 'partial' | 'error' | 'info';

export type ActivityEvent = {
  id: string;
  at: number; // Date.now()
  kind: ActivityKind;
  target?: string;
  outcome: ActivityOutcome;
  detail?: string;
};

const CAP = 100;

type State = {
  events: ActivityEvent[];
  unread: number;
  drawerOpen: boolean;
  log: (event: Omit<ActivityEvent, 'id' | 'at'>) => void;
  clear: () => void;
  setDrawerOpen: (v: boolean) => void;
  toggleDrawer: () => void;
  markRead: () => void;
};

export const useActivityStore = create<State>()((set) => ({
  events: [],
  unread: 0,
  drawerOpen: false,
  log: (event) =>
    set((s) => ({
      events: [
        { id: `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), ...event },
        ...s.events,
      ].slice(0, CAP),
      unread: s.drawerOpen ? s.unread : s.unread + 1,
    })),
  clear: () => set({ events: [], unread: 0 }),
  setDrawerOpen: (drawerOpen) => set((s) => ({ drawerOpen, unread: drawerOpen ? 0 : s.unread })),
  toggleDrawer: () =>
    set((s) => {
      const next = !s.drawerOpen;
      return { drawerOpen: next, unread: next ? 0 : s.unread };
    }),
  markRead: () => set({ unread: 0 }),
}));

export function logActivity(event: Omit<ActivityEvent, 'id' | 'at'>): void {
  useActivityStore.getState().log(event);
}
