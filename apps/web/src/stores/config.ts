import { create } from 'zustand';

import { getHealth } from '../lib/api';

type ConfigState = {
  tailnet: boolean | null;
  load: () => Promise<void>;
};

export const useConfigStore = create<ConfigState>()((set) => ({
  tailnet: null,

  load: async () => {
    try {
      const data = await getHealth();
      set({ tailnet: Boolean(data.tailnet) });
    } catch {
      set({ tailnet: false });
    }
  },
}));
