import { create } from 'zustand';

import { getHealth } from '../lib/api';

type ConfigState = {
  /** Whether a tailnet provider is wired up on the hub. */
  tailnet: boolean | null;
  /** Whether the hub's mDNS multicast socket bound successfully at boot. When
   *  false, QR pairing is structurally unavailable on this host — the UI hides
   *  the QR tab globally and the backend refuses /qr-pair. null = unknown
   *  (pre-load or load failed). */
  mdns: boolean | null;
  load: () => Promise<void>;
};

export const useConfigStore = create<ConfigState>()((set) => ({
  tailnet: null,
  mdns: null,

  load: async () => {
    try {
      const data = await getHealth();
      // Prefer the new shape (capabilities.*); fall back to the deprecated
      // top-level `tailnet` flag for older hubs.
      const caps = data.capabilities;
      set({
        tailnet: caps ? caps.tailnet : Boolean(data.tailnet),
        mdns: caps ? caps.mdns : null,
      });
    } catch {
      set({ tailnet: false, mdns: false });
    }
  },
}));
