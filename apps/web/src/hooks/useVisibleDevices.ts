import { useMemo } from 'react';
import type { Device } from '@phone-remote/protocol';
import { useDevicesStore } from '../stores/devices';
import { useFiltersStore } from '../stores/filters';
import { useInputLockStore } from '../stores/inputLock';
import { useLabelsStore } from '../stores/labels';
import { useNotesStore } from '../stores/notes';
import {
  getStateKey,
  matchesLocationFilters,
  matchesSearch,
  matchesTagFilters,
} from '../deviceFilters';

/**
 * Returns devices currently visible in the grid — the same filter set Grid/Sidebar
 * apply. Lives in its own hook so Detail can navigate prev/next through the same
 * list the operator is looking at, instead of inventing a separate iteration order.
 */
export function useVisibleDevices(): Device[] {
  const devices = useDevicesStore((s) => s.devices);
  const search = useFiltersStore((s) => s.search);
  const stateFilter = useFiltersStore((s) => s.stateFilter);
  const locationFilter = useFiltersStore((s) => s.locationFilter);
  const tagFilter = useFiltersStore((s) => s.tagFilter);
  const attrFilter = useFiltersStore((s) => s.attrFilter);
  const labels = useLabelsStore((s) => s.labels);
  const lockedSerials = useInputLockStore((s) => s.lockedSerials);
  const notes = useNotesStore((s) => s.notes);

  return useMemo(() => {
    const lockedSet = new Set(lockedSerials);
    return devices.filter((d) => {
      const status = getStateKey(d.state);
      if (!stateFilter[status]) return false;
      if (!matchesLocationFilters(d, locationFilter)) return false;
      if (!matchesTagFilters(d, tagFilter)) return false;
      if (attrFilter.locked && !lockedSet.has(d.serial)) return false;
      if (attrFilter.withNotes && !(notes[d.serial]?.trim())) return false;
      return matchesSearch(d, search, labels);
    });
  }, [devices, search, stateFilter, locationFilter, tagFilter, attrFilter, labels, lockedSerials, notes]);
}
