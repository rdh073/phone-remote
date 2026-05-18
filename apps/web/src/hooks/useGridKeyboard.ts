import { useEffect } from 'react';
import { useDevicesStore } from '../stores/devices';
import { useControlsStore } from '../stores/controls';

const NAV_KEYS = new Set(['j', 'k', 'h', 'l', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

function measureGridCols(): number {
  const root = document.querySelector<HTMLElement>('[data-grid-root]');
  if (!root) return 1;
  const tracks = getComputedStyle(root).gridTemplateColumns.split(/\s+/).filter(Boolean);
  return Math.max(1, tracks.length);
}

export function useGridKeyboard(serials: string[]): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Skip when the user is typing into a form field.
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }

      const state = useDevicesStore.getState();
      // When the Detail modal is open, let it own keyboard input.
      if (state.detailSerial) return;
      if (serials.length === 0) return;

      const cursorIdx = state.cursorSerial
        ? serials.findIndex((serial) => serial === state.cursorSerial)
        : -1;
      // The grid uses repeat(auto-fill, minmax(...)), so the rendered column
      // count depends on container width — derive it from the actual track
      // list instead of trusting the slider value.
      const cols = measureGridCols();

      const moveCursor = (delta: number) => {
        const start = cursorIdx < 0 ? 0 : cursorIdx;
        const next = (start + delta + serials.length) % serials.length;
        state.setCursor(serials[next] ?? null);
      };

      if (NAV_KEYS.has(e.key)) {
        e.preventDefault();
        switch (e.key) {
          case 'j':
          case 'ArrowDown':
            moveCursor(cols);
            return;
          case 'k':
          case 'ArrowUp':
            moveCursor(-cols);
            return;
          case 'h':
          case 'ArrowLeft':
            moveCursor(-1);
            return;
          case 'l':
          case 'ArrowRight':
            moveCursor(1);
            return;
        }
      }

      if (e.key === ' ' && state.cursorSerial) {
        e.preventDefault();
        state.toggleSelected(state.cursorSerial);
        return;
      }

      if ((e.key === 's' || e.key === 'S') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        useControlsStore.getState().toggleSync();
        return;
      }

      if ((e.key === 'f' || e.key === 'F') && state.cursorSerial && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        state.enterDetail(state.cursorSerial);
        return;
      }

      if (e.key === 'Escape') {
        if (state.selectedSerials.size > 0) {
          e.preventDefault();
          state.clearSelection();
        }
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [serials]);
}
