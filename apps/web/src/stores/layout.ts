import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type State = {
  sidebarCollapsed: boolean;
  shortcutsOpen: boolean;
  settingsOpen: boolean;
  wallboard: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  toggleShortcuts: () => void;
  setShortcutsOpen: (v: boolean) => void;
  toggleSettings: () => void;
  setSettingsOpen: (v: boolean) => void;
  toggleWallboard: () => void;
  setWallboard: (v: boolean) => void;
};

export const useLayoutStore = create<State>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      shortcutsOpen: false,
      settingsOpen: false,
      // Wallboard is a session-only focus mode — never persisted. Each load starts
      // with the full operator console so the operator isn't surprised.
      wallboard: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleShortcuts: () => set((s) => ({ shortcutsOpen: !s.shortcutsOpen })),
      setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
      toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      toggleWallboard: () => set((s) => ({ wallboard: !s.wallboard })),
      setWallboard: (wallboard) => set({ wallboard }),
    }),
    {
      name: 'phone-remote-layout',
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }),
    },
  ),
);
