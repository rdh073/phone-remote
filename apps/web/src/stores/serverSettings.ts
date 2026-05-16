import { create } from 'zustand';

import {
  getServerSettings,
  patchServerSettings,
  type ServerSettingCategory,
  type ServerSettingsResponse,
} from '../lib/api';

export type SettingsCategory = 'client' | ServerSettingCategory;

type Draft = Record<string, string | null | undefined>;

type ServerSettingsState = {
  active: SettingsCategory;
  server: ServerSettingsResponse | null;
  loading: boolean;
  error: string | null;
  draft: Draft;
  saving: boolean;
  saveError: string | null;
  setActive: (active: SettingsCategory) => void;
  load: (force?: boolean) => Promise<void>;
  setDraftValue: (key: string, value: string | null) => void;
  resetDraftKey: (key: string) => void;
  discard: () => void;
  save: () => Promise<void>;
};

export const useServerSettingsStore = create<ServerSettingsState>()((set, get) => ({
  active: 'client',
  server: null,
  loading: false,
  error: null,
  draft: {},
  saving: false,
  saveError: null,

  setActive: (active) => set({ active }),

  load: async (force = false) => {
    const { server, loading } = get();
    if (!force && (server || loading)) return;
    set({ loading: true, error: null });
    try {
      const next = await getServerSettings();
      set({ server: next, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  setDraftValue: (key, value) =>
    set((state) => {
      const next = { ...state.draft };
      const stored = state.server?.values.find((v) => v.key === key);

      if (value === null && !stored?.defined) {
        delete next[key];
      } else if (!stored?.secret && value !== null && value === (stored?.value ?? '')) {
        delete next[key];
      } else {
        next[key] = value;
      }

      return { draft: next, saveError: null };
    }),

  resetDraftKey: (key) =>
    set((state) => {
      const next = { ...state.draft };
      delete next[key];
      return { draft: next, saveError: null };
    }),

  discard: () => set({ draft: {}, saveError: null }),

  save: async () => {
    const { draft, saving } = get();
    const dirtyKeys = Object.keys(draft).filter((key) => draft[key] !== undefined);
    if (saving || dirtyKeys.length === 0) return;

    const patch: Record<string, string | null> = {};
    for (const key of dirtyKeys) patch[key] = draft[key] as string | null;

    set({ saving: true, saveError: null });
    try {
      const result = await patchServerSettings(patch);
      set((state) => ({
        server: state.server ? { ...state.server, values: result.values } : state.server,
        draft: {},
        saving: false,
      }));
    } catch (err) {
      set({ saveError: (err as Error).message, saving: false });
    }
  },
}));

export function dirtyKeysForDraft(draft: Draft): string[] {
  return Object.keys(draft).filter((key) => draft[key] !== undefined);
}

export function dirtyKeysByCategory(
  dirtyKeys: string[],
  server: ServerSettingsResponse | null,
): Record<string, number> {
  if (!server) return {};
  const lookup = new Map(server.keys.map((meta) => [meta.key, meta.category]));
  const out: Record<string, number> = {};
  for (const key of dirtyKeys) {
    const category = lookup.get(key);
    if (!category) continue;
    out[category] = (out[category] ?? 0) + 1;
  }
  return out;
}
