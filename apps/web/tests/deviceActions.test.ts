import { beforeEach, describe, expect, it } from 'vitest';

import { busyForTargets, useDeviceActionsStore } from '../src/stores/deviceActions';

beforeEach(() => {
  useDeviceActionsStore.setState({ inFlight: {} });
});

describe('useDeviceActionsStore', () => {
  it('marks overlapping target actions as busy', () => {
    const token = useDeviceActionsStore.getState().begin('reboot', ['b', 'a']);

    expect(token).toBeTruthy();
    expect(useDeviceActionsStore.getState().busyForTargets(['a'])).toBe('reboot');
    expect(useDeviceActionsStore.getState().begin('screenshot', ['a'])).toBeNull();

    useDeviceActionsStore.getState().finish(token!);
    expect(useDeviceActionsStore.getState().busyForTargets(['a'])).toBeNull();
  });

  it('allows non-overlapping actions', () => {
    const first = useDeviceActionsStore.getState().begin('reboot', ['a']);
    const second = useDeviceActionsStore.getState().begin('screenshot', ['b']);

    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
  });

  it('exposes a pure busy selector for component tests', () => {
    expect(
      busyForTargets(
        {
          x: { kind: 'shell', targets: ['device-1'] },
        },
        ['device-1', 'device-2'],
      ),
    ).toBe('shell');
  });
});
