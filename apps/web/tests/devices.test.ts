import { beforeEach, describe, expect, it } from 'vitest';
import { useDevicesStore } from '../src/stores/devices';

beforeEach(() => {
  useDevicesStore.setState({
    devices: [],
    error: null,
    loading: false,
    selectedSerials: new Set(),
    detailSerial: null,
    cursorSerial: null,
    cols: 5,
  });
});

describe('useDevicesStore', () => {
  it('toggleSelected adds and removes', () => {
    const { toggleSelected } = useDevicesStore.getState();
    toggleSelected('a');
    toggleSelected('b');
    expect(useDevicesStore.getState().selectedSerials).toEqual(new Set(['a', 'b']));
    toggleSelected('a');
    expect(useDevicesStore.getState().selectedSerials).toEqual(new Set(['b']));
  });

  it('selectAll replaces the set', () => {
    useDevicesStore.setState({ selectedSerials: new Set(['a', 'b']) });
    useDevicesStore.getState().selectAll(['x', 'y', 'z']);
    expect(useDevicesStore.getState().selectedSerials).toEqual(new Set(['x', 'y', 'z']));
  });

  it('clearSelection empties the set', () => {
    useDevicesStore.setState({ selectedSerials: new Set(['a']) });
    useDevicesStore.getState().clearSelection();
    expect(useDevicesStore.getState().selectedSerials.size).toBe(0);
  });

  it('enterDetail sets the detail serial', () => {
    useDevicesStore.getState().enterDetail('a');
    expect(useDevicesStore.getState().detailSerial).toBe('a');
  });

  it('exitDetail clears the detail serial', () => {
    useDevicesStore.setState({ detailSerial: 'a' });
    useDevicesStore.getState().exitDetail();
    expect(useDevicesStore.getState().detailSerial).toBeNull();
  });
});
