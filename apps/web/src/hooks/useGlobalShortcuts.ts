import { useEffect } from 'react';
import { logActivity, useActivityStore } from '../stores/activity';
import { useDevicesStore } from '../stores/devices';
import { useInputLockStore } from '../stores/inputLock';
import { useLabelsStore } from '../stores/labels';
import { useLayoutStore } from '../stores/layout';
import { usePaletteStore } from '../stores/palette';
import { useReconnectStore } from '../stores/reconnect';
import { useScenesStore } from '../stores/scenes';
import { useScratchpadStore } from '../stores/scratchpad';
import { toast } from '../stores/toasts';

/**
 * Global keyboard handlers that work everywhere (independent of the grid cursor).
 * `?` toggles the shortcuts overlay; `/` focuses the sidebar search input.
 * Skipped when the user is typing into a form field.
 */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Cmd/Ctrl+K opens the command palette — works even from inside inputs.
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        usePaletteStore.getState().toggle();
        return;
      }

      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }

      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        useLayoutStore.getState().toggleShortcuts();
        return;
      }

      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const input = document.getElementById('sidebar-filter') as HTMLInputElement | null;
        input?.focus();
        input?.select();
        return;
      }

      if ((e.key === 'w' || e.key === 'W') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        useLayoutStore.getState().toggleWallboard();
        return;
      }

      if ((e.key === 'b' || e.key === 'B') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        useLayoutStore.getState().toggleSidebar();
        return;
      }

      if ((e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const cursor = useDevicesStore.getState().cursorSerial;
        if (!cursor) return;
        e.preventDefault();
        useReconnectStore.getState().bump(cursor);
        return;
      }

      // Capital L only — lowercase 'l' is vim-style cursor-right in the grid.
      if (e.key === 'L' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const cursor = useDevicesStore.getState().cursorSerial;
        if (!cursor) return;
        e.preventDefault();
        const next = useInputLockStore.getState().toggle(cursor);
        const device = useDevicesStore.getState().devices.find((d) => d.serial === cursor);
        const display = useLabelsStore.getState().labels[cursor] || device?.model || cursor;
        toast.info(next ? `Input locked · ${display}` : `Input unlocked · ${display}`, {
          description: next ? 'Taps and swipes will be swallowed.' : 'Device will receive input again.',
        });
        logActivity({
          kind: 'lock',
          target: display,
          outcome: 'ok',
          detail: next ? 'locked' : 'unlocked',
        });
        return;
      }

      if (e.key === ',' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        useActivityStore.getState().toggleDrawer();
        return;
      }

      // Apostrophe toggles the operator scratchpad. Single key, no shift, no
      // collision with any vim-style nav letter.
      if (e.key === "'" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        useScratchpadStore.getState().toggle();
        return;
      }

      // Number keys switch to saved scene. `1`-`9` map to scenes[0..8] (skipping
      // the default 'All' scene which always lives at index 0); `0` falls back
      // to that default. Modifier-combos pass through to the browser so Cmd+1
      // (tab nav) still works.
      if (/^[0-9]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        const scenes = useScenesStore.getState().scenes;
        if (scenes.length <= 1) return; // only the default 'All' scene exists — nothing to cycle
        const setActive = useScenesStore.getState().setActive;
        let scene: { id: string; name: string } | undefined;
        if (e.key === '0') {
          scene = scenes[0];
        } else {
          // Operator scenes start after the default 'All' at index 0; key '1'
          // targets scenes[1], etc.
          const idx = Number(e.key);
          scene = scenes[idx];
        }
        if (!scene) return;
        e.preventDefault();
        setActive(scene.id);
        const sceneCount = scenes.length - 1; // exclude the default 'All'
        toast.info(`Scene · ${scene.name}`, {
          description: e.key === '0'
            ? 'Press 1-9 to switch to a saved scene.'
            : `Scene ${e.key} of ${sceneCount} · 0 for All.`,
        });
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
