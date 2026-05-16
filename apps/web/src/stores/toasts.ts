import type { ReactNode } from 'react';
import { create } from 'zustand';
import { useSettingsStore } from './settings';

export type ToastKind = 'success' | 'error' | 'info';

export type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string | ReactNode;
  durationMs: number;
  action?: { label: string; onClick: () => void };
  /** When set, a progress bar renders at the bottom of the card. */
  progress?: { current: number; total: number };
  /** Toasts with pinned=true ignore the auto-dismiss timer. */
  pinned?: boolean;
};

type State = {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id' | 'durationMs'> & { durationMs?: number }) => string;
  update: (id: string, patch: Partial<Omit<Toast, 'id'>>) => void;
  dismiss: (id: string) => void;
};

export const useToastsStore = create<State>()((set) => ({
  toasts: [],
  push: (toast) => {
    const id = `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const settingsDuration = useSettingsStore.getState().toastDurationMs;
    const full: Toast = {
      id,
      durationMs: toast.durationMs ?? settingsDuration,
      // 0 means "sticky" — never auto-dismiss.
      pinned: toast.pinned ?? (toast.durationMs ?? settingsDuration) === 0,
      ...toast,
    };
    set((s) => ({ toasts: [...s.toasts, full] }));
    return id;
  },
  update: (id, patch) =>
    set((s) => ({
      toasts: s.toasts.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (title: string, opts?: Partial<Omit<Toast, 'id' | 'kind' | 'title'>>) =>
    useToastsStore.getState().push({ kind: 'success', title, ...opts }),
  error: (title: string, opts?: Partial<Omit<Toast, 'id' | 'kind' | 'title'>>) =>
    useToastsStore.getState().push({ kind: 'error', title, ...opts }),
  info: (title: string, opts?: Partial<Omit<Toast, 'id' | 'kind' | 'title'>>) =>
    useToastsStore.getState().push({ kind: 'info', title, ...opts }),
};

/**
 * High-level helper for bulk operations that emit live-updating progress.
 * Returns an in-flight handle; call `ok()` / `fail()` per device, then
 * `done({success, error})` to swap the toast to its terminal state and let
 * auto-dismiss kick in.
 */
export function trackBulk<T = unknown>(opts: {
  title: string;
  total: number;
  /** Initial description shown alongside the progress bar. */
  description?: string;
}): {
  id: string;
  ok: (target?: T) => void;
  fail: (target?: T, err?: unknown) => void;
  done: (final: { success?: { title: string; description?: string }; error?: { title: string; description?: string } }) => void;
} {
  let okCount = 0;
  let failCount = 0;
  const id = useToastsStore.getState().push({
    kind: 'info',
    title: opts.title,
    description: opts.description ?? `0 / ${opts.total}`,
    progress: { current: 0, total: opts.total },
    pinned: true,
    durationMs: 0,
  });

  const tick = () => {
    const current = okCount + failCount;
    useToastsStore.getState().update(id, {
      progress: { current, total: opts.total },
      description: failCount > 0
        ? `${okCount} ok · ${failCount} failed · ${opts.total - current} pending`
        : `${current} / ${opts.total}`,
    });
  };

  return {
    id,
    ok: () => {
      okCount += 1;
      tick();
    },
    fail: () => {
      failCount += 1;
      tick();
    },
    done: (final) => {
      const allOk = failCount === 0;
      const target = allOk ? final.success : final.error;
      useToastsStore.getState().update(id, {
        kind: allOk ? 'success' : 'error',
        title: target?.title ?? (allOk ? 'Done' : `Partial: ${okCount}/${opts.total} OK`),
        description: target?.description ?? (allOk ? undefined : `${failCount} failed`),
        progress: undefined,
        pinned: false,
        durationMs: 4000,
      });
    },
  };
}
