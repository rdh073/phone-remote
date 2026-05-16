import { useEffect, useRef } from 'react';
import { useFiltersStore, type AttrFilter } from '../stores/filters';

/**
 * Two-way sync between the filters store and the URL query string.
 *
 * Read direction: on mount, parse `?q=...&state=...&loc=...&tag=...&attr=...`
 * and seed the filters store. Empty params leave defaults alone.
 *
 * Write direction: on each filters-store change, encode the *deltas from
 * default* into the URL via `history.replaceState` (so it doesn't pollute
 * browser history). Debounced 200 ms to coalesce rapid edits.
 *
 * Encoding choices, optimized for short URLs and human-readability:
 *  - `q=<text>`   — search query, omitted when empty
 *  - `state=<csv>` — DISABLED states only (default = all on, so a tight URL
 *    `?state=offline` means "online + unauth only"; omitted when nothing
 *    is filtered out)
 *  - `loc=<csv>`  — ENABLED location keys (default = none = no filter)
 *  - `tag=<csv>`  — ENABLED tag keys
 *  - `attr=<csv>` — comma-joined of `locked`, `notes`
 */

const STATE_KEYS = ['online', 'unauthorized', 'offline'] as const;
const ATTR_KEYS = ['locked', 'notes'] as const;
type AttrKey = (typeof ATTR_KEYS)[number];

function setFromCsv(csv: string | null): Record<string, boolean> {
  if (!csv) return {};
  const out: Record<string, boolean> = {};
  for (const k of csv.split(',')) {
    const trimmed = k.trim();
    if (trimmed) out[trimmed] = true;
  }
  return out;
}

function csvFromEnabled(map: Record<string, boolean>): string {
  return Object.entries(map)
    .filter(([, on]) => on)
    .map(([k]) => k)
    .sort()
    .join(',');
}

function attrToCsv(attr: AttrFilter): string {
  const parts: AttrKey[] = [];
  if (attr.locked) parts.push('locked');
  if (attr.withNotes) parts.push('notes');
  return parts.join(',');
}

function attrFromCsv(csv: string | null): AttrFilter {
  const set = new Set((csv ?? '').split(',').map((s) => s.trim()));
  return { locked: set.has('locked'), withNotes: set.has('notes') };
}

export function useFilterUrlSync(): void {
  const search = useFiltersStore((s) => s.search);
  const stateFilter = useFiltersStore((s) => s.stateFilter);
  const locationFilter = useFiltersStore((s) => s.locationFilter);
  const tagFilter = useFiltersStore((s) => s.tagFilter);
  const attrFilter = useFiltersStore((s) => s.attrFilter);

  // One-time initial read from URL. Each individual param applies only if
  // present, so a partial URL (`?attr=locked`) doesn't reset everything else.
  const readDone = useRef(false);
  useEffect(() => {
    if (readDone.current || typeof window === 'undefined') return;
    readDone.current = true;
    const params = new URLSearchParams(window.location.search);
    const store = useFiltersStore.getState();
    if (params.has('q')) store.setSearch(params.get('q') ?? '');
    if (params.has('state')) {
      const disabled = setFromCsv(params.get('state'));
      const next: Record<string, boolean> = {};
      for (const k of STATE_KEYS) next[k] = !disabled[k];
      store.setStateFilter(next);
    }
    if (params.has('loc')) store.setLocationFilter(setFromCsv(params.get('loc')));
    if (params.has('tag')) store.setTagFilter(setFromCsv(params.get('tag')));
    if (params.has('attr')) store.setAttrFilter(attrFromCsv(params.get('attr')));
  }, []);

  // Debounced writeback. Only after the initial read has happened, so we don't
  // clobber the URL before applying it.
  useEffect(() => {
    if (!readDone.current || typeof window === 'undefined') return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      const trimmed = search.trim();
      if (trimmed) params.set('q', trimmed);
      // State filter: encode the disabled set (smaller URL — defaults are all on).
      const disabled = STATE_KEYS.filter((k) => stateFilter[k] === false);
      if (disabled.length > 0) params.set('state', disabled.join(','));
      const loc = csvFromEnabled(locationFilter);
      if (loc) params.set('loc', loc);
      const tag = csvFromEnabled(tagFilter);
      if (tag) params.set('tag', tag);
      const attr = attrToCsv(attrFilter);
      if (attr) params.set('attr', attr);
      const qs = params.toString();
      const next = qs ? `?${qs}` : '';
      const current = window.location.search;
      if (next !== current) {
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${next}${window.location.hash}`,
        );
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [search, stateFilter, locationFilter, tagFilter, attrFilter]);
}
