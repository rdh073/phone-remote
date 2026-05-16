import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UIMessage } from 'ai';
import type { ProviderId } from '@phone-remote/protocol';

export type AssistantProviderId = ProviderId;

export interface AssistantProviderMeta {
  id: AssistantProviderId;
  label: string;
  available: boolean;
  defaultModel: string;
  models: string[];
}

/**
 * Pane size — mirrors cliper's three states:
 *  - collapsed  : 36px-wide strip rail; click to expand
 *  - expanded   : normal third column in the main flex row
 *  - fullscreen : overlay covers the viewport
 */
export type AssistantSize = 'collapsed' | 'expanded' | 'fullscreen';

interface State {
  open: boolean;
  toggle: () => void;
  set: (v: boolean) => void;

  size: AssistantSize;
  setSize: (s: AssistantSize) => void;
  /** Step-down: fullscreen → expanded → compact. Returns true when a step happened. */
  shrinkSize: () => boolean;

  messages: UIMessage[];
  draft: string;
  setMessages: (messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => void;
  clearMessages: () => void;
  setDraft: (draft: string) => void;

  catalog: AssistantProviderMeta[] | null;
  defaultProvider: AssistantProviderId | null;
  catalogLoading: boolean;
  catalogError: string | null;
  loadCatalog: () => Promise<void>;

  // User-selected provider + model. null means "use the hub default for this session".
  provider: AssistantProviderId | null;
  model: string | null;
  setSelection: (provider: AssistantProviderId, model: string) => void;

  /**
   * Resolved (provider, model) pair the next request will send. Falls back to the
   * hub's default provider + that provider's default model when nothing is set.
   * Returns null when no provider is available.
   */
  effective: () => { provider: AssistantProviderId; model: string } | null;
}

export const useAssistantStore = create<State>()(
  persist(
    (set, get) => ({
      open: false,
      toggle: () => set((s) => ({ open: !s.open })),
      set: (open) => set({ open }),

      size: 'expanded',
      setSize: (size) => set({ size }),
      shrinkSize: () => {
        const { size } = get();
        if (size === 'fullscreen') {
          set({ size: 'expanded' });
          return true;
        }
        if (size === 'expanded') {
          set({ size: 'collapsed' });
          return true;
        }
        return false;
      },

      messages: [],
      draft: '',
      setMessages: (messages) =>
        set((state) => ({
          messages: typeof messages === 'function' ? messages(state.messages) : messages,
        })),
      clearMessages: () => set({ messages: [] }),
      setDraft: (draft) => set({ draft }),

      catalog: null,
      defaultProvider: null,
      catalogLoading: false,
      catalogError: null,
      loadCatalog: async () => {
        set({ catalogLoading: true, catalogError: null });
        try {
          const res = await fetch('/api/assistant/catalog', { credentials: 'include' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const body = (await res.json()) as {
            providers: AssistantProviderMeta[];
            defaultProvider: AssistantProviderId | null;
          };
          set({
            catalog: body.providers,
            defaultProvider: body.defaultProvider,
            catalogLoading: false,
          });
        } catch (err) {
          set({ catalogError: (err as Error).message, catalogLoading: false });
        }
      },

      provider: null,
      model: null,
      setSelection: (provider, model) => set({ provider, model }),

      effective: () => {
        const s = get();
        const candidate = s.provider ?? s.defaultProvider;
        if (!candidate) return null;
        const meta = s.catalog?.find((p) => p.id === candidate);
        if (!meta || !meta.available) return null;
        // Custom (user-typed) models are allowed for every provider, since
        // Ollama tag names and OpenAI-compat catalog vary per deployment.
        const model = s.provider === candidate && s.model ? s.model : meta.defaultModel;
        if (!model) return null;
        return { provider: candidate, model };
      },
    }),
    {
      name: 'phone-remote-assistant',
      partialize: (s) => ({
        provider: s.provider,
        model: s.model,
        size: s.size,
      }),
      version: 3,
      migrate: (persisted, fromVersion) => {
        // v1 used a boolean `fullscreen` flag.
        // v2 introduced `size: 'compact' | 'expanded' | 'fullscreen'`.
        // v3 renames 'compact' → 'collapsed' (now a 36px strip, not a small modal).
        if (!persisted || typeof persisted !== 'object') return persisted as State;
        const p = persisted as Record<string, unknown>;
        if (fromVersion < 2 && p.size === undefined) {
          p.size = p.fullscreen ? 'fullscreen' : 'expanded';
          delete p.fullscreen;
        }
        if (p.size === 'compact') p.size = 'collapsed';
        if (p.size !== 'collapsed' && p.size !== 'expanded' && p.size !== 'fullscreen') {
          p.size = 'expanded';
        }
        return p as unknown as State;
      },
    },
  ),
);
