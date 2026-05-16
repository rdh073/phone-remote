import type { ReactNode } from 'react';
import { create } from 'zustand';

type DialogKind = 'confirm' | 'alert' | 'prompt';

export type DialogRequest = {
  id: string;
  kind: DialogKind;
  title: string;
  body?: string | ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  // Prompt-only fields:
  defaultValue?: string;
  placeholder?: string;
  maxLength?: number;
  resolve: (value: boolean | string | null) => void;
};

type State = {
  queue: DialogRequest[];
  push: (req: DialogRequest) => void;
  resolveTop: (value: boolean | string | null) => void;
};

export const useDialogStore = create<State>()((set, get) => ({
  queue: [],
  push: (req) => set((s) => ({ queue: [...s.queue, req] })),
  resolveTop: (value) => {
    const top = get().queue[0];
    if (!top) return;
    top.resolve(value);
    set((s) => ({ queue: s.queue.slice(1) }));
  },
}));

function nextId(): string {
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export type ConfirmOptions = {
  title: string;
  body?: string | ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    useDialogStore.getState().push({
      id: nextId(),
      kind: 'confirm',
      title: opts.title,
      body: opts.body,
      confirmLabel: opts.confirmLabel ?? 'Confirm',
      cancelLabel: opts.cancelLabel ?? 'Cancel',
      danger: opts.danger ?? false,
      resolve: (v) => resolve(v === true),
    });
  });
}

export type AlertOptions = {
  title: string;
  body?: string | ReactNode;
  confirmLabel?: string;
};

export function alertDialog(opts: AlertOptions): Promise<void> {
  return new Promise<void>((resolve) => {
    useDialogStore.getState().push({
      id: nextId(),
      kind: 'alert',
      title: opts.title,
      body: opts.body,
      confirmLabel: opts.confirmLabel ?? 'OK',
      resolve: () => resolve(),
    });
  });
}

export type PromptOptions = {
  title: string;
  body?: string | ReactNode;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  maxLength?: number;
};

/** Resolves to the trimmed string on commit, or null on cancel/escape. */
export function promptDialog(opts: PromptOptions): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    useDialogStore.getState().push({
      id: nextId(),
      kind: 'prompt',
      title: opts.title,
      body: opts.body,
      defaultValue: opts.defaultValue ?? '',
      placeholder: opts.placeholder,
      maxLength: opts.maxLength,
      confirmLabel: opts.confirmLabel ?? 'Save',
      cancelLabel: opts.cancelLabel ?? 'Cancel',
      resolve: (value) => {
        if (typeof value === 'string') resolve(value);
        else resolve(null);
      },
    });
  });
}
