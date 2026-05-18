import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  ArrowLeft,
  Camera,
  Home,
  Keyboard,
  Lock,
  LockKeyhole,
  LockOpen,
  RotateCw,
  Send,
  Smartphone,
  Volume1,
  Volume2,
} from 'lucide-react';
import { logActivity } from './stores/activity';
import { useControlsStore } from './stores/controls';
import { useDevicesStore } from './stores/devices';
import { useInputLockStore } from './stores/inputLock';
import { useLabelsStore } from './stores/labels';
import { useDeviceActionsStore } from './stores/deviceActions';
import { confirmDialog } from './stores/dialog';
import { toast } from './stores/toasts';
import { useTextHistoryStore } from './stores/inputHistory';
import { useNotesStore } from './stores/notes';
import { useInputHistory } from './hooks/useInputHistory';
import { rebootDevice, sendDeviceKey } from './lib/api';
import { downloadDeviceScreenshot } from './lib/download';
import { broadcastTo } from './lib/fanout';
import { KEYCODE } from './lib/keycodes';

type Shortcut = {
  title: string;
  key: number;
  icon: ReactNode;
};

const SHORTCUTS: Shortcut[] = [
  { title: 'Home', key: KEYCODE.HOME, icon: <Home size={16} /> },
  { title: 'Back', key: KEYCODE.BACK, icon: <ArrowLeft size={16} /> },
  { title: 'Recents', key: KEYCODE.APP_SWITCH, icon: <Smartphone size={16} /> },
  { title: 'Vol up', key: KEYCODE.VOLUME_UP, icon: <Volume2 size={16} /> },
  { title: 'Vol down', key: KEYCODE.VOLUME_DOWN, icon: <Volume1 size={16} /> },
  { title: 'Power', key: KEYCODE.POWER, icon: <LockKeyhole size={16} /> },
];

export function StreamToolbar({ serial }: { serial: string }) {
  const sync = useControlsStore((s) => s.sync);
  const selectedSerials = useDevicesStore((s) => s.selectedSerials);
  const [text, setText] = useState('');
  const currentTargets = useMemo(
    () => (sync ? Array.from(new Set([serial, ...selectedSerials])) : [serial]),
    [selectedSerials, serial, sync],
  );
  const busy = useDeviceActionsStore((s) => s.busyForTargets(currentTargets));
  const textRecall = useInputHistory(useTextHistoryStore, text, setText);
  const locked = useInputLockStore((s) => s.lockedSerials.includes(serial));

  const toggleLock = () => {
    const next = useInputLockStore.getState().toggle(serial);
    const device = useDevicesStore.getState().devices.find((d) => d.serial === serial);
    const display = useLabelsStore.getState().labels[serial] || device?.model || serial;
    toast.info(next ? `Input locked · ${display}` : `Input unlocked · ${display}`, {
      description: next ? 'Taps and swipes will be swallowed.' : 'Device will receive input again.',
    });
    logActivity({
      kind: 'lock',
      target: display,
      outcome: 'ok',
      detail: next ? 'locked' : 'unlocked',
    });
  };

  const targets = (): string[] => currentTargets;

  const sendKey = async (keyCode: number) => {
    const list = targets();
    const token = useDeviceActionsStore.getState().begin('key', list);
    if (!token) return;
    try {
      await Promise.all(list.map((s) => sendDeviceKey(s, keyCode).catch(() => {})));
    } finally {
      useDeviceActionsStore.getState().finish(token);
    }
  };

  const reboot = async () => {
    const list = targets();
    const ok = await confirmDialog({
      title: `Reboot ${list.length} device${list.length === 1 ? '' : 's'}?`,
      body: list.length === 1 ? list[0] : `${list.length} devices will reboot simultaneously.`,
      confirmLabel: 'Reboot',
      danger: true,
    });
    if (!ok) return;
    const token = useDeviceActionsStore.getState().begin('reboot', list);
    if (!token) return;
    try {
      const results = await Promise.allSettled(list.map((s) => rebootDevice(s)));
      const fails = results.filter((r) => r.status === 'rejected').length;
      if (fails === 0) toast.success(`Reboot issued (${list.length})`);
      else toast.error(`Reboot partial: ${list.length - fails}/${list.length} OK`);
    } finally {
      useDeviceActionsStore.getState().finish(token);
    }
  };

  const screenshot = async () => {
    const list = targets();
    const token = useDeviceActionsStore.getState().begin('screenshot', list);
    if (!token) return;
    try {
      let saved = 0;
      let failed = 0;
      for (const s of list) {
        try {
          await downloadDeviceScreenshot(s);
          saved += 1;
        } catch {
          failed += 1;
        }
      }
      if (failed === 0) toast.success(`Screenshot saved (${saved})`, { description: 'Check your Downloads folder.' });
      else toast.error(`Screenshot partial: ${saved}/${list.length}`);
    } finally {
      useDeviceActionsStore.getState().finish(token);
    }
  };

  const submitText = (e: FormEvent) => {
    e.preventDefault();
    if (!text || busy) return;
    const list = targets();
    const token = useDeviceActionsStore.getState().begin('text', list);
    if (!token) return;
    try {
      broadcastTo(list, { kind: 'text', text });
      textRecall.commit();
      setText('');
    } finally {
      useDeviceActionsStore.getState().finish(token);
    }
  };

  return (
    <div className="space-y-4 text-xs">
      <header className="pb-2 border-b border-zinc-800 ui-popover-surface flex items-start justify-between gap-2">
        <div>
          <p className="text-[0.6875rem] uppercase tracking-[0.14em] text-zinc-400">Device controls</p>
          <p className="mt-1 text-zinc-500">
            Targeting {targets().length} device{targets().length === 1 ? '' : 's'}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleLock}
          aria-pressed={locked}
          title={locked ? 'Input locked — click or press Shift+L to unlock' : 'Lock input (Shift+L)'}
          className={`h-8 inline-flex items-center gap-1.5 rounded-md border px-2.5 text-[0.6875rem] uppercase tracking-[0.14em] transition-colors duration-[120ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
            locked
              ? 'border-amber-400/55 bg-amber-500/15 text-amber-200'
              : 'border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700'
          }`}
        >
          {locked ? <Lock size={13} /> : <LockOpen size={13} />}
          {locked ? 'Locked' : 'Lock input'}
          <kbd className="ml-1 inline-flex h-4 items-center rounded border border-current/40 px-1 font-mono text-[0.5625rem] opacity-70">⇧L</kbd>
        </button>
      </header>

      <section className="space-y-2">
        <p className="text-[0.6875rem] uppercase tracking-[0.14em] text-zinc-500">Shortcuts</p>
        <div className="grid grid-cols-2 gap-2">
          {SHORTCUTS.map((shortcut) => (
            <ToolbarButton
              key={shortcut.title}
              label={shortcut.title}
              onClick={() => sendKey(shortcut.key)}
              disabled={busy !== null}
            >
              {shortcut.icon}
            </ToolbarButton>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-[0.6875rem] uppercase tracking-[0.14em] text-zinc-500">Actions</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={screenshot}
            disabled={busy !== null}
            className="h-10 inline-flex items-center justify-center gap-2 rounded-md ui-chip-surface disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Camera size={15} />
            {busy === 'screenshot' ? 'Capturing…' : 'Screenshot'}
          </button>
          <button
            type="button"
            onClick={reboot}
            disabled={busy !== null}
            className="h-10 inline-flex items-center justify-center gap-2 rounded-md ui-chip-surface disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCw size={15} />
            {busy === 'reboot' ? 'Rebooting…' : 'Reboot'}
          </button>
        </div>
      </section>

      <form onSubmit={submitText} className="space-y-2">
        <label htmlFor={`stream-text-${serial}`} className="block text-[0.6875rem] uppercase tracking-[0.14em] text-zinc-500">
          Type text
        </label>
        <div className="flex items-center gap-2">
          <span className="relative min-w-0 flex-1">
            <input
              id={`stream-text-${serial}`}
              name="streamText"
              type="text"
              value={text}
              onChange={(e) => textRecall.onChange(e.target.value)}
              onKeyDown={textRecall.onKeyDown}
              placeholder="text input · ↑/↓ history"
              aria-label="Type text on device"
              className="w-full ui-popover-surface border border-zinc-800 rounded-md pl-3 pr-14 py-2 text-zinc-100 text-sm focus:outline-none focus:border-cyan-500 focus-visible:ring-2 focus-visible:ring-cyan-500"
            />
            {textRecall.position && (
              <span
                aria-hidden="true"
                className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 rounded px-1 py-0.5"
                title="Esc to return to your draft"
              >
                {textRecall.position.current}/{textRecall.position.total}
              </span>
            )}
          </span>
          <button
            type="submit"
            disabled={busy !== null || !text}
            aria-label="Send text"
            className="h-10 w-10 inline-flex items-center justify-center rounded-md ui-chip-surface text-zinc-100 disabled:opacity-50"
          >
            <Send size={15} />
          </button>
        </div>
      </form>

      <NotesSection serial={serial} />

      <div className="rounded-md border border-zinc-800 ui-popover-surface p-2 text-zinc-500 text-[0.6875rem] inline-flex items-center gap-2">
        <Keyboard size={13} />
        <span>Tip: press "f" in grid to jump into detail and "Esc" to close.</span>
      </div>
    </div>
  );
}

function NotesSection({ serial }: { serial: string }) {
  const initialNote = useNotesStore((s) => s.notes[serial] ?? '');
  const setNote = useNotesStore((s) => s.setNote);
  const [draft, setDraft] = useState(initialNote);
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);

  // Sync draft when serial changes (modal reopens for different device).
  useEffect(() => {
    setDraft(initialNote);
  }, [serial, initialNote]);

  const onChange = (next: string) => {
    setDraft(next);
    setSaved(false);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      setNote(serial, next);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1400);
    }, 400);
  };

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        setNote(serial, draft);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serial]);

  return (
    <section className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <p className="text-[0.6875rem] uppercase tracking-[0.14em] text-zinc-500">Notes</p>
        <span
          className={`font-mono text-[0.625rem] tabular-nums transition-opacity duration-[180ms] ${
            saved ? 'text-emerald-300 opacity-100' : 'text-zinc-600 opacity-100'
          }`}
        >
          {saved ? 'saved' : `${draft.length}/4096`}
        </span>
      </div>
      <textarea
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Owner, expiration, promo code, last action…"
        aria-label="Device notes"
        maxLength={4096}
        rows={4}
      className="w-full ui-popover-surface border border-zinc-800 rounded-md px-2.5 py-2 text-zinc-100 text-[0.75rem] leading-relaxed font-mono placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500 focus-visible:ring-2 focus-visible:ring-cyan-500/40 resize-none"
      />
    </section>
  );
}

function ToolbarButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="h-10 inline-flex items-center justify-center gap-2 rounded-md ui-chip-surface disabled:opacity-50 disabled:cursor-not-allowed text-zinc-200"
    >
      {children}
      <span>{label}</span>
    </button>
  );
}
