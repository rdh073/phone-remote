import { useEffect, type ReactNode } from 'react';
import { Check, Loader2, X, AlertTriangle, RotateCcw, XCircle, Sliders, KeySquare, Bot, Server, Video, type LucideIcon } from 'lucide-react';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  client: Sliders,
  providers: KeySquare,
  assistant: Bot,
  video: Video,
  hub: Server,
};

import { useSettingsStore, type AutoRefreshSec } from '../stores/settings';
import { useLayoutStore } from '../stores/layout';
import {
  type ServerSettingMeta,
  type ServerSettingValue,
  type ServerSettingsResponse,
} from '../lib/api';
import {
  dirtyKeysByCategory,
  dirtyKeysForDraft,
  useServerSettingsStore,
  type SettingsCategory,
} from '../stores/serverSettings';

const AUTO_REFRESH_OPTIONS: { value: AutoRefreshSec; label: string }[] = [
  { value: 0, label: 'off' },
  { value: 5, label: '5s' },
  { value: 10, label: '10s' },
  { value: 30, label: '30s' },
  { value: 60, label: '60s' },
];

const TOAST_OPTIONS = [
  { value: 2000, label: '2s' },
  { value: 4000, label: '4s' },
  { value: 8000, label: '8s' },
  { value: 0, label: 'sticky' },
] as const;

const CLIENT_CATEGORY = { id: 'client' as const, label: 'Client', hint: 'UI preferences stored in this browser.' };

export function SettingsModal() {
  const open = useLayoutStore((s) => s.settingsOpen);
  const setOpen = useLayoutStore((s) => s.setSettingsOpen);
  const active = useServerSettingsStore((s) => s.active);
  const setActive = useServerSettingsStore((s) => s.setActive);
  const server = useServerSettingsStore((s) => s.server);
  const serverErr = useServerSettingsStore((s) => s.error);
  const serverLoading = useServerSettingsStore((s) => s.loading);
  const draft = useServerSettingsStore((s) => s.draft);
  const saving = useServerSettingsStore((s) => s.saving);
  const saveErr = useServerSettingsStore((s) => s.saveError);
  const loadServerSettings = useServerSettingsStore((s) => s.load);
  const setDraftValue = useServerSettingsStore((s) => s.setDraftValue);
  const resetDraftKey = useServerSettingsStore((s) => s.resetDraftKey);
  const discardServerDraft = useServerSettingsStore((s) => s.discard);
  const saveServerSettings = useServerSettingsStore((s) => s.save);

  // Load server settings on first open per session.
  useEffect(() => {
    if (open) void loadServerSettings();
  }, [open, loadServerSettings]);

  // Esc closes the modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  // Reset draft on close — unsaved changes are silently discarded.
  useEffect(() => {
    if (!open) {
      discardServerDraft();
    }
  }, [discardServerDraft, open]);

  const dirtyKeys = dirtyKeysForDraft(draft);

  if (!open) return null;

  async function save() {
    await saveServerSettings();
  }

  const categories: { id: SettingsCategory; label: string; hint: string }[] = [
    CLIENT_CATEGORY,
    ...(server?.categories ?? []),
  ];

  const activeCategory = categories.find((c) => c.id === active) ?? CLIENT_CATEGORY;

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center ui-modal-overlay ui-modal-overlay-72 backdrop-blur-sm p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        style={{
          animation: 'cols-menu-in 140ms cubic-bezier(0.16, 1, 0.3, 1)',
          boxShadow:
            '0 24px 60px -16px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.03)',
        }}
        className="w-full max-w-3xl h-[min(640px,calc(100vh-2rem))] rounded-lg border border-zinc-700/80 bg-zinc-950 ui-modal-surface backdrop-blur-md overflow-hidden grid grid-rows-[auto_minmax(0,1fr)_auto]"
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-zinc-800/70">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold text-zinc-100">Settings</h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              {activeCategory.label}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close settings"
            className="h-7 w-7 inline-flex items-center justify-center rounded border border-zinc-800 bg-zinc-900 ui-chip-surface text-zinc-500 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60"
          >
            <X size={14} />
          </button>
        </header>

        <div className="grid grid-cols-[180px_minmax(0,1fr)] min-h-0">
          <CategoryRail
            categories={categories}
            active={active}
            onSelect={setActive}
            dirty={dirtyKeysByCategory(dirtyKeys, server)}
          />
          <div className="overflow-y-auto px-5 py-4">
            {active === 'client' && <ClientPanel />}
            {active !== 'client' && (
              <ServerPanel
                category={active}
                server={server}
                loading={serverLoading}
                error={serverErr}
                draft={draft}
                onChange={setDraftValue}
                onResetKey={resetDraftKey}
              />
            )}
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 px-5 py-3 border-t border-zinc-800/70">
          {active === 'client' ? (
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">
              changes save automatically · stored in browser
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                {dirtyKeys.length === 0 ? (
                  <span>no unsaved changes</span>
                ) : (
                  <span className="text-amber-300/90">
                    {dirtyKeys.length} unsaved change{dirtyKeys.length === 1 ? '' : 's'} · written
                    to <span className="font-mono">.env.local</span>
                  </span>
                )}
                {saveErr && (
                  <span className="inline-flex items-center gap-1 rounded-sm border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 font-mono text-[10px] text-rose-300">
                    <AlertTriangle size={10} />
                    {saveErr}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={discardServerDraft}
                  disabled={dirtyKeys.length === 0 || saving}
                  className="inline-flex h-7 items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-900 ui-chip-surface px-2 font-mono text-[11px] uppercase tracking-[0.06em] text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={dirtyKeys.length === 0 || saving}
                  className={`inline-flex h-7 items-center gap-1 rounded-sm border border-cyan-500/50 bg-cyan-500/15 px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-cyan-100 transition hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-40 ${
                    dirtyKeys.length > 0 && !saving
                      ? 'shadow-[0_0_0_1px_rgba(34,211,238,0.25),0_0_18px_-4px_rgba(34,211,238,0.45)]'
                      : ''
                  }`}
                >
                  {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                  Save & apply
                </button>
              </div>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function CategoryRail({
  categories,
  active,
  onSelect,
  dirty,
}: {
  categories: { id: SettingsCategory; label: string; hint: string }[];
  active: SettingsCategory;
  onSelect: (id: SettingsCategory) => void;
  dirty: Record<string, number>;
}) {
  return (
      <nav className="border-r border-zinc-800/70 bg-zinc-900/30 ui-popover-surface py-3" aria-label="Settings categories">
      <ul className="space-y-0.5 px-1.5">
        {categories.map((c) => {
          const count = dirty[c.id] ?? 0;
          const on = c.id === active;
          const Icon = CATEGORY_ICONS[c.id];
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                aria-current={on}
                className={`relative flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[12px] transition-colors ${
                  on
                    ? 'bg-cyan-500/10 ui-chip-surface-active text-cyan-100'
                    : 'bg-zinc-900 ui-chip-surface text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100'
                }`}
              >
                {count > 0 && (
                  <span
                    aria-hidden
                    className="absolute inset-y-1 left-0 w-[3px] rounded-r-sm bg-amber-400/70"
                  />
                )}
                <span className="inline-flex items-center gap-2 min-w-0">
                  {Icon && <Icon size={13} aria-hidden className={on ? 'text-cyan-300' : 'text-zinc-500'} />}
                  <span className="truncate">{c.label}</span>
                </span>
                {count > 0 && (
                  <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500/20 px-1 font-mono text-[9px] tabular-nums text-amber-200">
                    {count}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function ClientPanel() {
  return (
    <div className="space-y-5">
      <AutoRefreshSection />
      <ToastDurationSection />
      <SidebarDefaultSection />
      <GridStatsSection />
      <PauseOffscreenSection />
    </div>
  );
}

function ServerPanel({
  category,
  server,
  loading,
  error,
  draft,
  onChange,
  onResetKey,
}: {
  category: SettingsCategory;
  server: ServerSettingsResponse | null;
  loading: boolean;
  error: string | null;
  draft: Record<string, string | null | undefined>;
  onChange: (key: string, value: string | null) => void;
  onResetKey: (key: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-zinc-500">
        <Loader2 size={12} className="animate-spin" />
        loading hub settings…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
        Failed to load settings: {error}
      </div>
    );
  }
  if (!server) return null;

  const cat = server.categories.find((c) => c.id === category);
  if (!cat) return null;

  const keys = server.keys.filter((m) => m.category === category);
  const valueByKey = new Map(server.values.map((v) => [v.key, v]));

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-zinc-500">{cat.hint}</p>
      <div className="space-y-3">
        {keys.map((meta) => {
          const stored = valueByKey.get(meta.key);
          const drafted = draft[meta.key];
          const isDirty = drafted !== undefined;
          return (
            <ServerField
              key={meta.key}
              meta={meta}
              stored={stored}
              draft={drafted}
              isDirty={isDirty}
              onChange={(v) => onChange(meta.key, v)}
              onReset={() => onResetKey(meta.key)}
            />
          );
        })}
      </div>
    </div>
  );
}

function ServerField({
  meta,
  stored,
  draft,
  isDirty,
  onChange,
  onReset,
}: {
  meta: ServerSettingMeta;
  stored?: ServerSettingValue;
  draft: string | null | undefined;
  isDirty: boolean;
  onChange: (value: string | null) => void;
  onReset: () => void;
}) {
  const storedValue = stored?.value ?? '';
  const definedNow = stored?.defined ?? false;

  return (
    <div className={`rounded-md border bg-zinc-900/40 ui-popover-surface px-3 py-2.5 transition-colors ${isDirty ? 'border-amber-500/55 shadow-[inset_2px_0_0_rgba(245,158,11,0.65)]' : 'border-zinc-800/70'}`}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-zinc-200">{meta.label}</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-zinc-500">{meta.key}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {meta.restartRequired && (
            <span
              title="Change requires hub restart to take effect"
              className="font-mono text-[9px] uppercase tracking-[0.08em] text-amber-300/80"
            >
              restart-required
            </span>
          )}
          {isDirty && (
            <button
              type="button"
              onClick={onReset}
              title="Revert this field to its saved value"
              className="inline-flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:text-zinc-100"
            >
              <RotateCcw size={10} />
            </button>
          )}
        </div>
      </div>
      <p className="mb-2 text-[11px] leading-snug text-zinc-500">{meta.description}</p>
      <ServerFieldInput meta={meta} stored={stored} draft={draft} storedValue={storedValue} definedNow={definedNow} onChange={onChange} />
    </div>
  );
}

function ServerFieldInput({
  meta,
  stored,
  draft,
  storedValue,
  definedNow,
  onChange,
}: {
  meta: ServerSettingMeta;
  stored?: ServerSettingValue;
  draft: string | null | undefined;
  storedValue: string;
  definedNow: boolean;
  onChange: (value: string | null) => void;
}) {
  if (meta.type === 'boolean') {
    const liveValue = draft !== undefined ? draft : storedValue;
    const on = liveValue === '1' || liveValue === 'true';
    return (
      <button
        type="button"
        onClick={() => onChange(on ? '0' : '1')}
        aria-pressed={on}
        className={`inline-flex h-7 items-center gap-2 rounded-md border px-2 font-mono text-[11px] transition ${
          on
            ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-100'
    : 'border-zinc-700 bg-zinc-900 ui-chip-surface text-zinc-400 hover:text-zinc-100'
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${on ? 'bg-cyan-400' : 'bg-zinc-600'}`} />
        {on ? 'enabled' : 'disabled'}
      </button>
    );
  }

  if (meta.secret) {
    return <SecretInput meta={meta} stored={stored} draft={draft} definedNow={definedNow} onChange={onChange} />;
  }

  const liveValue = draft !== undefined ? (draft ?? '') : storedValue;

  if (meta.options && meta.options.length > 0) {
    return (
      <select
        value={liveValue}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === '' ? null : v);
        }}
        className="block w-full rounded border border-zinc-800 bg-zinc-950 ui-popover-surface px-2 py-1.5 font-mono text-[12px] text-zinc-100 focus:outline-none focus:border-cyan-500/60"
      >
        {/* Placeholder when neither stored nor drafted — clearing also lands here. */}
        {liveValue === '' && (
          <option value="" disabled>
            {meta.placeholder ? `unset (default: ${meta.placeholder})` : 'unset'}
          </option>
        )}
        {!meta.options.some((o) => o.value === liveValue) && liveValue !== '' && (
          // Surface a stale / unknown value so the operator can see it before they pick a new one.
          <option value={liveValue} disabled>
            {liveValue} (unknown)
          </option>
        )}
        {liveValue !== '' && <option value="">— clear —</option>}
        {meta.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label ?? opt.value}
          </option>
        ))}
      </select>
    );
  }

  const inputType = meta.type === 'number' ? 'number' : 'text';
  return (
    <input
      type={inputType}
      value={liveValue}
      placeholder={meta.placeholder}
      onChange={(e) => {
        const v = e.target.value;
        // empty string + nothing stored: treat as not-dirty
        if (v === '' && storedValue === '') {
          onChange(null);
        } else {
          onChange(v === '' ? null : v);
        }
      }}
      className="block w-full rounded border border-zinc-800 bg-zinc-950 ui-popover-surface px-2 py-1.5 font-mono text-[12px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/60"
    />
  );
}

function SecretInput({
  meta,
  stored,
  draft,
  definedNow,
  onChange,
}: {
  meta: ServerSettingMeta;
  stored?: ServerSettingValue;
  draft: string | null | undefined;
  definedNow: boolean;
  onChange: (value: string | null) => void;
}) {
  const editing = draft !== undefined;
  const currentValue = (draft ?? '') as string;

  return (
    <div className="space-y-1.5">
      {!editing && definedNow && (
        <div className="flex items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-950 ui-popover-surface px-2 py-1.5 font-mono text-[12px] text-zinc-400">
          <span>{stored?.preview ?? '••••'}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onChange('')}
              title="Replace — enter a new value"
              aria-label="Replace value"
              className="inline-flex h-6 w-6 items-center justify-center rounded border border-zinc-800 ui-chip-surface text-zinc-400 transition hover:bg-zinc-800/70 hover:text-zinc-100"
            >
              <RotateCcw size={12} />
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              title="Clear — remove this value"
              aria-label="Clear value"
              className="inline-flex h-6 w-6 items-center justify-center rounded text-rose-300/80 transition hover:bg-rose-500/15 hover:text-rose-200"
            >
              <XCircle size={12} />
            </button>
          </div>
        </div>
      )}
      {(editing || !definedNow) && (
        <input
          type="password"
          value={currentValue}
          placeholder={meta.placeholder ?? 'paste secret'}
          autoComplete="off"
          spellCheck={false}
          autoFocus={editing && currentValue === ''}
          onChange={(e) => onChange(e.target.value === '' ? '' : e.target.value)}
          className="block w-full rounded border border-zinc-800 bg-zinc-950 ui-popover-surface px-2 py-1.5 font-mono text-[12px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/60"
        />
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[12px] font-medium text-zinc-200">{title}</h3>
        {hint && <span className="font-mono text-[10px] text-zinc-500">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function ChipGroup<T>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
}) {
  return (
    <div className="inline-flex h-8 items-center gap-0.5 rounded-md border border-zinc-800 bg-zinc-900 ui-chip-surface p-0.5">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={opt.value === value}
          className={`h-7 px-2 rounded text-[11px] font-mono tabular-nums transition-colors duration-[120ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 ${
            opt.value === value
              ? 'bg-cyan-500/15 text-cyan-100'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function AutoRefreshSection() {
  const value = useSettingsStore((s) => s.autoRefreshSec);
  const setValue = useSettingsStore((s) => s.setAutoRefreshSec);
  return (
    <Section title="Device list refresh" hint="while tab is visible">
      <p className="text-[11px] text-zinc-500">
        How often the hub is polled for device state changes. Disabling falls back to manual refresh.
      </p>
      <ChipGroup value={value} onChange={setValue} options={AUTO_REFRESH_OPTIONS} />
    </Section>
  );
}

function ToastDurationSection() {
  const value = useSettingsStore((s) => s.toastDurationMs);
  const setValue = useSettingsStore((s) => s.setToastDurationMs);
  return (
    <Section title="Toast dismiss" hint="hover always pauses">
      <p className="text-[11px] text-zinc-500">
        How long success / info / error toasts linger before sliding away. "Sticky" requires manual dismiss.
      </p>
      <ChipGroup value={value} onChange={setValue} options={TOAST_OPTIONS} />
    </Section>
  );
}

function SidebarDefaultSection() {
  const value = useSettingsStore((s) => s.sidebarDefaultCollapsed);
  const setValue = useSettingsStore((s) => s.setSidebarDefaultCollapsed);
  return (
    <Section title="Sidebar default" hint="on app load">
      <p className="text-[11px] text-zinc-500">
        Whether the device sidebar starts collapsed. Toggle in-session with{' '}
        <kbd className="inline-block px-1 rounded bg-zinc-800 ui-chip-surface border border-zinc-700 text-zinc-300 font-mono text-[10px]">
          B
        </kbd>
        .
      </p>
      <ChipGroup
        value={value}
        onChange={setValue}
        options={[
          { value: false, label: 'expanded' },
          { value: true, label: 'collapsed' },
        ]}
      />
    </Section>
  );
}

function GridStatsSection() {
  const value = useSettingsStore((s) => s.showStatsInGrid);
  const setValue = useSettingsStore((s) => s.setShowStatsInGrid);
  return (
    <Section title="Grid stats overlay" hint="FPS · bandwidth">
      <p className="text-[11px] text-zinc-500">
        Show a compact FPS / bandwidth sparkline on every grid tile. Useful when monitoring a large rack for stalls or
        throttling at a glance. Detail view always shows the full overlay.
      </p>
      <ChipGroup
        value={value}
        onChange={setValue}
        options={[
          { value: false, label: 'off' },
          { value: true, label: 'on' },
        ]}
      />
    </Section>
  );
}

function PauseOffscreenSection() {
  const value = useSettingsStore((s) => s.pauseOffscreenStreams);
  const setValue = useSettingsStore((s) => s.setPauseOffscreenStreams);
  return (
    <Section title="Pause offscreen streams" hint="bandwidth saver">
      <p className="text-[11px] text-zinc-500">
        Tiles scrolled out of view tear down their WebSocket and video decoder, then resume when scrolled back. Big win
        on large racks but adds a ~1s reconnect each time a tile re-enters view. Detail mode is never paused.
      </p>
      <ChipGroup
        value={value}
        onChange={setValue}
        options={[
          { value: false, label: 'off' },
          { value: true, label: 'on' },
        ]}
      />
    </Section>
  );
}
