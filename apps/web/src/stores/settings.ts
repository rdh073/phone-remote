import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AutoRefreshSec = 0 | 5 | 10 | 30 | 60;

type State = {
  /** 0 = disabled, otherwise N seconds between device-list polls. */
  autoRefreshSec: AutoRefreshSec;
  /** Default-collapsed sidebar on app load (when not overridden). */
  sidebarDefaultCollapsed: boolean;
  /** Default toast duration in ms. */
  toastDurationMs: number;
  /** When true, every grid tile shows the FPS/bandwidth/codec overlay (not just Detail). */
  showStatsInGrid: boolean;
  /** When true, grid tiles scrolled out of view tear down their WS + decoder
   * and resume when scrolled back. Big bandwidth/CPU saver on 50-device farms;
   * incurs a ~1s reconnect when a tile re-enters view. Detail mode always stays
   * connected regardless. */
  pauseOffscreenStreams: boolean;
  setAutoRefreshSec: (v: AutoRefreshSec) => void;
  setSidebarDefaultCollapsed: (v: boolean) => void;
  setToastDurationMs: (v: number) => void;
  setShowStatsInGrid: (v: boolean) => void;
  setPauseOffscreenStreams: (v: boolean) => void;
};

export const useSettingsStore = create<State>()(
  persist(
    (set) => ({
      autoRefreshSec: 10,
      sidebarDefaultCollapsed: false,
      toastDurationMs: 4000,
      showStatsInGrid: false,
      // Default off — surprising "stream went away when I scrolled" is worse
      // than the bandwidth cost. Operators with large farms opt in via settings.
      pauseOffscreenStreams: false,
      setAutoRefreshSec: (autoRefreshSec) => set({ autoRefreshSec }),
      setSidebarDefaultCollapsed: (sidebarDefaultCollapsed) => set({ sidebarDefaultCollapsed }),
      setToastDurationMs: (toastDurationMs) => set({ toastDurationMs }),
      setShowStatsInGrid: (showStatsInGrid) => set({ showStatsInGrid }),
      setPauseOffscreenStreams: (pauseOffscreenStreams) => set({ pauseOffscreenStreams }),
    }),
    { name: 'phone-remote-settings' },
  ),
);
