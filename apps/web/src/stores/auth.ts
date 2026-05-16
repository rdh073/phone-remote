import { create } from 'zustand';

import { ApiError, getAuthMe, postAuthLogin, postAuthLogout } from '../lib/api';

type Status = 'checking' | 'unauthed' | 'authed';

type State = {
  status: Status;
  user: string | null;
  error: string | null;
  check: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<State>()((set) => ({
  status: 'checking',
  user: null,
  error: null,

  check: async () => {
    try {
      const { user } = await getAuthMe();
      set({ status: 'authed', user, error: null });
    } catch {
      set({ status: 'unauthed', user: null });
    }
  },

  login: async (username, password) => {
    set({ error: null });
    try {
      const { user } = await postAuthLogin(username, password);
      set({ status: 'authed', user, error: null });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        set({ error: 'Invalid credentials' });
        return;
      }
      set({ error: err instanceof Error ? err.message : 'Login failed' });
    }
  },

  logout: async () => {
    await postAuthLogout().catch(() => {});
    set({ status: 'unauthed', user: null });
  },
}));
