import { create } from 'zustand';

/** Attribute filters narrow the visible set to devices matching that attribute.
 * They're subtractive: `true` = "only show devices with X", `false` = "don't
 * filter on X" (default). Combine with AND when multiple are on.
 */
export type AttrFilter = {
  locked: boolean;
  withNotes: boolean;
};

type State = {
  search: string;
  stateFilter: Record<string, boolean>;
  locationFilter: Record<string, boolean>;
  tagFilter: Record<string, boolean>;
  attrFilter: AttrFilter;
  setSearch: (v: string) => void;
  setStateFilter: (v: Record<string, boolean>) => void;
  setLocationFilter: (v: Record<string, boolean>) => void;
  setTagFilter: (v: Record<string, boolean>) => void;
  setAttrFilter: (v: AttrFilter) => void;
};

export const useFiltersStore = create<State>()((set) => ({
  search: '',
  stateFilter: { online: true, unauthorized: true, offline: true },
  locationFilter: {},
  tagFilter: {},
  attrFilter: { locked: false, withNotes: false },
  setSearch: (search) => set({ search }),
  setStateFilter: (stateFilter) => set({ stateFilter }),
  setLocationFilter: (locationFilter) => set({ locationFilter }),
  setTagFilter: (tagFilter) => set({ tagFilter }),
  setAttrFilter: (attrFilter) => set({ attrFilter }),
}));
