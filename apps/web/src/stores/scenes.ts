import { create } from 'zustand';
import { useDevicesStore } from './devices';

export type Scene = { id: string; name: string; serials: string[] };

const STORAGE_KEY = 'phone-remote.scenes';

type State = {
  scenes: Scene[];
  activeId: string;
  load: () => void;
  setActive: (id: string) => void;
  create: (name: string) => string;
  update: (id: string, patch: Partial<Omit<Scene, 'id'>>) => void;
  remove: (id: string) => void;
  saveCurrent: (serials: Set<string>) => void;
  /** Move scene `id` to land before scene `beforeId` (or to the end if null).
   * The default 'All' scene is locked at index 0 — operations targeting it or
   * trying to land before it are clamped. */
  reorder: (id: string, beforeId: string | null) => void;
};

const DEFAULT_SCENE: Scene = { id: 'default', name: 'All', serials: [] };
const DEFAULT_SCENES: Scene[] = [DEFAULT_SCENE];

function read(): { scenes: Scene[]; activeId: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { scenes: Scene[]; activeId: string };
      if (Array.isArray(parsed.scenes) && parsed.scenes.length > 0) return parsed;
    }
  } catch {
    // fall through
  }
  return { scenes: DEFAULT_SCENES, activeId: DEFAULT_SCENE.id };
}

function persist(state: Pick<State, 'scenes' | 'activeId'>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ scenes: state.scenes, activeId: state.activeId }));
  } catch {
    // ignore quota errors
  }
}

function applyToDevices(scene: Scene): void {
  useDevicesStore.setState({
    selectedSerials: new Set(scene.serials),
    detailSerial: null,
  });
}

export const useScenesStore = create<State>()((set, get) => ({
  scenes: DEFAULT_SCENES,
  activeId: DEFAULT_SCENE.id,

  load: () => {
    const loaded = read();
    set(loaded);
    const active = loaded.scenes.find((s) => s.id === loaded.activeId) ?? loaded.scenes[0];
    if (active) applyToDevices(active);
  },

  setActive: (id) => {
    const scene = get().scenes.find((s) => s.id === id);
    if (!scene) return;
    set({ activeId: id });
    persist(get());
    applyToDevices(scene);
  },

  create: (name) => {
    const id = `s-${Date.now().toString(36)}`;
    const { selectedSerials } = useDevicesStore.getState();
    const scene: Scene = { id, name, serials: Array.from(selectedSerials) };
    set((s) => ({ scenes: [...s.scenes, scene], activeId: id }));
    persist(get());
    return id;
  },

  update: (id, patch) => {
    set((s) => ({ scenes: s.scenes.map((sc) => (sc.id === id ? { ...sc, ...patch } : sc)) }));
    persist(get());
  },

  remove: (id) => {
    set((s) => {
      const scenes = s.scenes.filter((sc) => sc.id !== id);
      const activeId = s.activeId === id ? (scenes[0]?.id ?? DEFAULT_SCENE.id) : s.activeId;
      return { scenes: scenes.length ? scenes : DEFAULT_SCENES, activeId };
    });
    persist(get());
  },

  saveCurrent: (serials) => {
    const { activeId } = get();
    set((s) => ({
      scenes: s.scenes.map((sc) =>
        sc.id === activeId ? { ...sc, serials: Array.from(serials) } : sc,
      ),
    }));
    persist(get());
  },

  reorder: (id, beforeId) => {
    if (id === DEFAULT_SCENE.id) return; // default 'All' is anchored at index 0
    set((s) => {
      const moving = s.scenes.find((sc) => sc.id === id);
      if (!moving) return s;
      const remaining = s.scenes.filter((sc) => sc.id !== id);
      if (beforeId == null) return { scenes: [...remaining, moving] };
      let beforeIdx = remaining.findIndex((sc) => sc.id === beforeId);
      // Trying to land before the default scene? Snap to right after it.
      if (beforeIdx === -1) beforeIdx = remaining.length;
      if (beforeIdx === 0) beforeIdx = 1;
      return {
        scenes: [...remaining.slice(0, beforeIdx), moving, ...remaining.slice(beforeIdx)],
      };
    });
    persist(get());
  },
}));
