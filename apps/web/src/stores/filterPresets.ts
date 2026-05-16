import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AttrFilter } from './filters';

export type FilterSnapshot = {
  search: string;
  stateFilter: Record<string, boolean>;
  locationFilter: Record<string, boolean>;
  tagFilter: Record<string, boolean>;
  /** Optional for back-compat with presets saved before attr filters existed. */
  attrFilter?: AttrFilter;
};

export type FilterPreset = {
  id: string;
  name: string;
  filters: FilterSnapshot;
  createdAt: number;
};

type State = {
  presets: FilterPreset[];
  save: (name: string, filters: FilterSnapshot) => string;
  remove: (id: string) => void;
};

export const useFilterPresetsStore = create<State>()(
  persist(
    (set) => ({
      presets: [],
      save: (name, filters) => {
        const id = `fp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        set((s) => ({
          presets: [...s.presets, { id, name, filters, createdAt: Date.now() }],
        }));
        return id;
      },
      remove: (id) => set((s) => ({ presets: s.presets.filter((p) => p.id !== id) })),
    }),
    { name: 'phone-remote-filter-presets' },
  ),
);

/** True when any axis differs from the empty/default state. */
export function isNonDefault(filters: FilterSnapshot): boolean {
  if (filters.search.trim().length > 0) return true;
  if (Object.values(filters.stateFilter).some((v) => !v)) return true; // any disabled state
  if (Object.values(filters.locationFilter).some((v) => v)) return true;
  if (Object.values(filters.tagFilter).some((v) => v)) return true;
  if (filters.attrFilter?.locked || filters.attrFilter?.withNotes) return true;
  return false;
}

/** Compact mono-label like `online+unauth · loc:rack-7 · q:"promo"` */
export function summarize(filters: FilterSnapshot): string {
  const parts: string[] = [];
  const states = Object.entries(filters.stateFilter)
    .filter(([, on]) => !on)
    .map(([k]) => `-${k}`);
  if (states.length > 0) parts.push(states.join(','));
  const locations = Object.entries(filters.locationFilter)
    .filter(([, on]) => on)
    .map(([k]) => k);
  if (locations.length > 0) parts.push(`loc:${locations.join(',')}`);
  const tags = Object.entries(filters.tagFilter)
    .filter(([, on]) => on)
    .map(([k]) => k);
  if (tags.length > 0) parts.push(`tag:${tags.join(',')}`);
  const attrs: string[] = [];
  if (filters.attrFilter?.locked) attrs.push('locked');
  if (filters.attrFilter?.withNotes) attrs.push('notes');
  if (attrs.length > 0) parts.push(`attr:${attrs.join(',')}`);
  if (filters.search.trim()) parts.push(`q:"${filters.search.trim().slice(0, 24)}"`);
  return parts.join(' · ') || 'all online';
}
