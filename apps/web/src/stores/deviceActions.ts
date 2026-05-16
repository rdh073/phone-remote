import { create } from 'zustand';

export type DeviceActionKind = 'key' | 'reboot' | 'screenshot' | 'shell' | 'text';

export type InFlightDeviceAction = {
  kind: DeviceActionKind;
  targets: string[];
};

type State = {
  inFlight: Record<string, InFlightDeviceAction>;
  begin: (kind: DeviceActionKind, targets: Iterable<string>) => string | null;
  finish: (token: string) => void;
  busyForTargets: (targets: Iterable<string>) => DeviceActionKind | null;
};

export const useDeviceActionsStore = create<State>()((set, get) => ({
  inFlight: {},

  begin: (kind, targets) => {
    const normalized = normalizeTargets(targets);
    if (normalized.length === 0) return null;
    if (busyForTargets(get().inFlight, normalized)) return null;
    const token = `${kind}:${normalized.join('|')}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
    set((state) => ({
      inFlight: {
        ...state.inFlight,
        [token]: { kind, targets: normalized },
      },
    }));
    return token;
  },

  finish: (token) =>
    set((state) => {
      if (!(token in state.inFlight)) return state;
      const next = { ...state.inFlight };
      delete next[token];
      return { inFlight: next };
    }),

  busyForTargets: (targets) => busyForTargets(get().inFlight, normalizeTargets(targets)),
}));

export function busyForTargets(
  inFlight: Record<string, InFlightDeviceAction>,
  targets: Iterable<string>,
): DeviceActionKind | null {
  const targetSet = new Set(normalizeTargets(targets));
  if (targetSet.size === 0) return null;

  for (const action of Object.values(inFlight)) {
    if (action.targets.some((target) => targetSet.has(target))) return action.kind;
  }
  return null;
}

function normalizeTargets(targets: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(targets).filter(Boolean))).sort();
}
