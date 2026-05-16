import { useEffect } from 'react';
import { useDevicesStore } from '../stores/devices';
import { useSettingsStore } from '../stores/settings';

/**
 * Keeps the device list fresh without operator action.
 *
 * - Polls every `autoRefreshSec` seconds (operator-configurable; 0 = disabled).
 * - Refreshes immediately when the tab regains visibility/focus.
 * - Skips polling while hidden — no point burning fetches on a backgrounded tab.
 */
export function useDeviceAutoRefresh(enabled: boolean): void {
  const intervalSec = useSettingsStore((s) => s.autoRefreshSec);
  useEffect(() => {
    if (!enabled || intervalSec <= 0) return;
    const pollMs = intervalSec * 1000;
    let timer: number | undefined;

    const refresh = () => void useDevicesStore.getState().refresh();

    const start = () => {
      if (timer) return;
      timer = window.setInterval(refresh, pollMs);
    };
    const stop = () => {
      if (!timer) return;
      window.clearInterval(timer);
      timer = undefined;
    };

    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        refresh();
        start();
      }
    };
    const onFocus = () => {
      refresh();
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled, intervalSec]);
}
