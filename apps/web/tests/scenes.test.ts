// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { useScenesStore } from '../src/stores/scenes';
import { useDevicesStore } from '../src/stores/devices';

beforeEach(() => {
  localStorage.clear();
  useScenesStore.setState({
    scenes: [{ id: 'default', name: 'All', serials: [] }],
    activeId: 'default',
  });
  useDevicesStore.setState({
    devices: [],
    selectedSerials: new Set(),
    detailSerial: null,
  });
});

describe('useScenesStore', () => {
  it('create adds a scene and makes it active', () => {
    const id = useScenesStore.getState().create('QA');
    const { scenes, activeId } = useScenesStore.getState();
    expect(scenes.find((s) => s.id === id)?.name).toBe('QA');
    expect(activeId).toBe(id);
  });

  it('persists scenes to localStorage', () => {
    useScenesStore.getState().create('Prod');
    const raw = localStorage.getItem('phone-remote.scenes');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.scenes.find((s: { name: string }) => s.name === 'Prod')).toBeTruthy();
  });

  it('update patches scene fields', () => {
    const id = useScenesStore.getState().create('Tmp');
    useScenesStore.getState().update(id, { name: 'Renamed', serials: ['a', 'b'] });
    const scene = useScenesStore.getState().scenes.find((s) => s.id === id);
    expect(scene?.name).toBe('Renamed');
    expect(scene?.serials).toEqual(['a', 'b']);
  });

  it('remove drops a scene and falls back to first remaining', () => {
    const a = useScenesStore.getState().create('A');
    const b = useScenesStore.getState().create('B');
    useScenesStore.getState().setActive(b);
    useScenesStore.getState().remove(b);
    expect(useScenesStore.getState().scenes.find((s) => s.id === b)).toBeUndefined();
    expect(useScenesStore.getState().activeId).not.toBe(b);
    expect([a, 'default']).toContain(useScenesStore.getState().activeId);
  });

  it('load restores from localStorage', () => {
    localStorage.setItem(
      'phone-remote.scenes',
      JSON.stringify({
        scenes: [
          { id: 'd', name: 'Default', serials: [] },
          { id: 'x', name: 'Custom', serials: ['s1'] },
        ],
        activeId: 'x',
      }),
    );
    useScenesStore.getState().load();
    const { scenes, activeId } = useScenesStore.getState();
    expect(scenes).toHaveLength(2);
    expect(activeId).toBe('x');
  });

  it('load uses default when localStorage is empty', () => {
    useScenesStore.setState({ scenes: [], activeId: '' });
    useScenesStore.getState().load();
    expect(useScenesStore.getState().scenes.length).toBeGreaterThan(0);
  });

  it('setActive loads the scene serials into devices store', () => {
    useScenesStore.setState({
      scenes: [
        { id: 'default', name: 'All', serials: [] },
        { id: 'floor1', name: 'Floor 1', serials: ['a', 'b'] },
      ],
      activeId: 'default',
    });
    useScenesStore.getState().setActive('floor1');
    const { selectedSerials, detailSerial } = useDevicesStore.getState();
    expect(selectedSerials).toEqual(new Set(['a', 'b']));
    expect(detailSerial).toBeNull();
  });

  it('saveCurrent writes serials to the active scene', () => {
    useScenesStore.getState().saveCurrent(new Set(['x', 'y']));
    const scene = useScenesStore.getState().scenes.find((s) => s.id === 'default');
    expect(scene?.serials).toEqual(['x', 'y']);
  });
});
