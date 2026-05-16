import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { InputHistoryStore } from '../stores/inputHistory';

/**
 * Wires bash-style ↑/↓ recall into a controlled text input. Returns the
 * keyboard handler, position chip metadata, and a `commit()` to call when the
 * input runs (pushes the value into history and resets the recall pointer).
 */
export function useInputHistory(
  useStore: UseBoundStore<StoreApi<InputHistoryStore>>,
  value: string,
  setValue: (v: string) => void,
) {
  const history = useStore((s) => s.history);
  const push = useStore((s) => s.push);
  const [idx, setIdx] = useState<number>(-1);
  const draftRef = useRef<string>('');

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      if (history.length === 0) return;
      e.preventDefault();
      if (idx === -1) draftRef.current = value;
      const next = Math.min(idx + 1, history.length - 1);
      setIdx(next);
      setValue(history[next] ?? '');
    } else if (e.key === 'ArrowDown') {
      if (idx === -1) return;
      e.preventDefault();
      const next = idx - 1;
      setIdx(next);
      setValue(next < 0 ? draftRef.current : history[next] ?? '');
    } else if (e.key === 'Escape') {
      if (idx !== -1) {
        e.preventDefault();
        setIdx(-1);
        setValue(draftRef.current);
      }
    }
  };

  const onChange = (next: string) => {
    setValue(next);
    if (idx !== -1) {
      setIdx(-1);
      draftRef.current = next;
    }
  };

  const commit = () => {
    push(value);
    setIdx(-1);
    draftRef.current = '';
  };

  return {
    onKeyDown,
    onChange,
    commit,
    recalling: idx >= 0,
    position: idx >= 0 ? { current: idx + 1, total: history.length } : null,
  };
}
