import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import {
  useAssistantStore,
  type AssistantProviderId,
  type AssistantProviderMeta,
} from '../stores/assistant';

export function AssistantProviderSwitch() {
  const catalog = useAssistantStore((s) => s.catalog);
  const defaultProvider = useAssistantStore((s) => s.defaultProvider);
  const provider = useAssistantStore((s) => s.provider);
  const model = useAssistantStore((s) => s.model);
  const setSelection = useAssistantStore((s) => s.setSelection);
  const catalogError = useAssistantStore((s) => s.catalogError);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const active: AssistantProviderId | null = provider ?? defaultProvider;
  const activeMeta = catalog?.find((p) => p.id === active) ?? null;
  const displayedModel =
    provider && active === provider && model ? model : (activeMeta?.defaultModel ?? '');

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!catalog}
        title="Switch assistant provider / model"
        className="grid h-6 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-sm ui-chip-surface px-1.5 font-mono text-[0.625rem] text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate normal-case text-zinc-200">
            {shortProvider(activeMeta?.label)}
          </span>
          {displayedModel && (
            <span className="min-w-0 truncate text-zinc-500">/ {shortModel(displayedModel)}</span>
          )}
        </span>
        <span aria-hidden className="shrink-0 text-zinc-500">▾</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 w-[min(22rem,calc(100vw-2rem))] max-h-[70vh] overflow-auto rounded-md border border-zinc-700 ui-popover-surface p-1 shadow-xl"
        >
          {catalogError && (
            <div className="mb-1 rounded-sm border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[0.625rem] text-amber-200">
              Catalog unavailable: {catalogError}
            </div>
          )}
          {!catalog && (
            <div className="px-2 py-1.5 font-mono text-[0.625rem] text-zinc-500">loading…</div>
          )}
          {catalog && catalog.length === 0 && (
            <div className="px-2 py-2 font-mono text-[0.625rem] leading-[1.6] text-zinc-500">
              No providers configured. Set one of{' '}
              <span className="text-zinc-300">ANTHROPIC_API_KEY</span>,{' '}
              <span className="text-zinc-300">OPENAI_API_KEY</span>,{' '}
              <span className="text-zinc-300">GOOGLE_GENERATIVE_AI_API_KEY</span>,{' '}
              <span className="text-zinc-300">DEEPSEEK_API_KEY</span>,{' '}
              <span className="text-zinc-300">OPENAI_COMPATIBLE_BASE_URL</span>, run{' '}
              <span className="text-zinc-300">claude</span> to log Claude OAuth, or start
              Ollama at <span className="text-zinc-300">127.0.0.1:11434</span>.
            </div>
          )}
          {catalog?.map((p) => (
            <ProviderRow
              key={p.id}
              meta={p}
              active={active === p.id}
              activeModel={active === p.id ? displayedModel : null}
              onSelectProvider={() => {
                setSelection(p.id, p.defaultModel);
                // Provider with no suggested + no default model needs a custom
                // string — keep the menu open so the user can type one without
                // having to reopen it.
                if (p.models.length === 0 && !p.defaultModel) return;
                setOpen(false);
              }}
              onSelectModel={(m) => {
                setSelection(p.id, m);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderRow({
  meta,
  active,
  activeModel,
  onSelectProvider,
  onSelectModel,
}: {
  meta: AssistantProviderMeta;
  active: boolean;
  activeModel: string | null;
  onSelectProvider: () => void;
  onSelectModel: (model: string) => void;
}) {
  const [custom, setCustom] = useState('');

  function commitCustom() {
    const v = custom.trim();
    if (!v) return;
    onSelectModel(v);
    setCustom('');
  }

  function onCustomKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitCustom();
    }
  }

  return (
    <div className="px-1">
      <button
        type="button"
        role="menuitem"
        onClick={onSelectProvider}
        className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs ui-chip-surface transition ${
          active ? 'bg-cyan-500/15 text-cyan-100' : 'text-zinc-200 hover:bg-zinc-800/70 hover:text-zinc-100'
        }`}
      >
        <span className="min-w-0 truncate">{meta.label}</span>
      </button>
      {active && (
        <div className="mb-1 ml-2 mt-0.5 border-l border-zinc-800 pl-2">
          {meta.models.length === 0 && (
            <p className="px-2 py-1 font-mono text-[0.625rem] text-zinc-500">
              No suggested models — type one below.
            </p>
          )}
          {meta.models.length > 0 && (
            <ul>
              {meta.models.map((m) => (
                <li key={m}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => onSelectModel(m)}
                    className={`block w-full rounded px-2 py-1 text-left font-mono text-[0.6875rem] ui-chip-surface transition ${
                      m === activeModel
                        ? 'bg-cyan-500/10 text-cyan-200'
                        : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100'
                    }`}
                  >
                    {m}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1 flex items-center gap-1 rounded-sm border border-zinc-800 bg-zinc-950 ui-popover-surface px-1.5">
            <span className="font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-zinc-500">
              custom
            </span>
            <input
              type="text"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={onCustomKey}
              placeholder="e.g. llama3.3:70b-instruct"
              aria-label={`Custom ${meta.label} model`}
              className="block w-full bg-transparent py-1 font-mono text-[0.6875rem] text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
            />
            <button
              type="button"
              onClick={commitCustom}
              disabled={!custom.trim()}
              className="rounded-sm px-1.5 py-0.5 ui-chip-surface font-mono text-[0.625rem] uppercase tracking-[0.08em] text-cyan-300 transition hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              set
            </button>
          </div>
          {activeModel && !meta.models.includes(activeModel) && (
            <p className="mt-0.5 px-2 font-mono text-[0.625rem] text-zinc-500">
              current: <span className="text-zinc-300">{activeModel}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function shortProvider(label: string | undefined): string {
  if (!label) return '—';
  // Strip trailing parens, e.g. "Foo (Bar)" → "Foo"
  return label.replace(/\s*\(.*?\)\s*$/, '');
}

function shortModel(m: string): string {
  return m.replace(/^claude-/, '').replace(/^gemini-/, '').replace(/^deepseek-/, 'ds-');
}
