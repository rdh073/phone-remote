import { useEffect } from 'react';
import { useDevicesStore } from '../stores/devices';
import { useLastSeenStore } from '../stores/lastSeen';

/**
 * Subscribes to the device list; every time it changes, marks `lastSeen[serial] = now`
 * for every device currently in the `device` (online) state. Run once at app shell.
 */
export function useLastSeenTracker(): void {
  useEffect(() => {
    const tick = () => {
      const devices = useDevicesStore.getState().devices;
      const online = devices.filter((d) => d.state === 'device').map((d) => d.serial);
      if (online.length === 0) return;
      useLastSeenStore.getState().markBatch(online);
    };
    // Catch initial state in case devices already loaded before mount.
    tick();
    return useDevicesStore.subscribe(tick);
  }, []);
}
