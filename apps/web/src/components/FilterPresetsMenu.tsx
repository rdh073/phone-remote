import { useEffect, useRef, useState } from 'react';
import { Bookmark, BookmarkPlus, Link2, Trash2 } from 'lucide-react';
import { useFiltersStore } from '../stores/filters';
import {
  useFilterPresetsStore,
  isNonDefault,
  summarize,
  type FilterSnapshot,
} from '../stores/filterPresets';
import { promptDialog, confirmDialog } from '../stores/dialog';
import { toast } from '../stores/toasts';

export function FilterPresetsMenu() {
  const presets = useFilterPresetsStore((s) => s.presets);
  const save = useFilterPresetsStore((s) => s.save);
  const remove = useFilterPresetsStore((s) => s.remove);

  const search = useFiltersStore((s) => s.search);
  const stateFilter = useFiltersStore((s) => s.stateFilter);
  const locationFilter = useFiltersStore((s) => s.locationFilter);
  const tagFilter = useFiltersStore((s) => s.tagFilter);
  const attrFilter = useFiltersStore((s) => s.attrFilter);
  const setSearch = useFiltersStore((s) => s.setSearch);
  const setStateFilter = useFiltersStore((s) => s.setStateFilter);
  const setLocationFilter = useFiltersStore((s) => s.setLocationFilter);
  const setTagFilter = useFiltersStore((s) => s.setTagFilter);
  const setAttrFilter = useFiltersStore((s) => s.setAttrFilter);

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current: FilterSnapshot = { search, stateFilter, locationFilter, tagFilter, attrFilter };
  const dirty = isNonDefault(current);

  const apply = (snap: FilterSnapshot) => {
    setSearch(snap.search);
    setStateFilter(snap.stateFilter);
    setLocationFilter(snap.locationFilter);
    setTagFilter(snap.tagFilter);
    // Back-compat: presets saved before attrFilter existed default to "off both".
    setAttrFilter(snap.attrFilter ?? { locked: false, withNotes: false });
    setOpen(false);
  };

  const onSave = async () => {
    if (!dirty) {
      toast.info('Nothing to save', { description: 'Set a filter first.' });
      return;
    }
    const name = await promptDialog({
      title: 'Save filter preset',
      body: (
        <span className="font-mono text-[0.6875rem] text-zinc-400">
          {summarize(current)}
        </span>
      ),
      defaultValue: '',
      placeholder: 'online · promo fleet',
      confirmLabel: 'Save',
      maxLength: 40,
    });
    if (!name) return;
    save(name, current);
    toast.success(`Saved "${name}"`);
    setOpen(false);
  };

  const onDelete = async (id: string, name: string) => {
    const ok = await confirmDialog({
      title: `Delete preset "${name}"?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    remove(id);
  };

  const dotClass = dirty ? 'bg-cyan-400' : 'bg-zinc-500';

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Filter presets"
        className={`h-7 w-7 inline-flex items-center justify-center rounded ui-chip-surface text-zinc-500 hover:text-cyan-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 transition-colors duration-[120ms] ${
          open ? 'text-cyan-200 bg-zinc-900' : ''
        }`}
      >
        <Bookmark size={13} />
        <span className={`absolute top-1 right-1 h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            animation: 'cols-menu-in 140ms cubic-bezier(0.16, 1, 0.3, 1)',
            boxShadow:
              '0 18px 50px -12px rgba(0,0,0,0.72), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.03)',
          }}
          className="absolute left-0 top-full z-40 mt-1.5 w-[260px] origin-top-left rounded-md border border-zinc-700/80 ui-popover-surface backdrop-blur-md p-1"
        >
          <div className="px-2 py-1 font-mono text-[0.625rem] uppercase tracking-[0.18em] text-zinc-500 border-b border-zinc-800/60">
            saved filters
          </div>
          <div className="max-h-[40vh] overflow-y-auto py-0.5">
            {presets.length === 0 ? (
              <p className="px-3 py-2 text-[0.6875rem] text-zinc-500 italic">No saved presets yet.</p>
            ) : (
              presets.map((p) => (
                <div
                  key={p.id}
                  className="group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-zinc-800/70"
                >
                  <button
                    type="button"
                    onClick={() => apply(p.filters)}
                    className="flex-1 min-w-0 text-left focus:outline-none"
                  >
                    <span className="block text-[0.75rem] text-zinc-100 truncate">{p.name}</span>
                    <span className="block font-mono text-[0.625rem] text-zinc-500 truncate">
                      {summarize(p.filters)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(p.id, p.name)}
                    className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-rose-300 hover:bg-rose-500/10 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-rose-500/60 transition-opacity"
                    aria-label={`Delete preset ${p.name}`}
                    title="Delete preset"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="mt-0.5 pt-1 border-t border-zinc-800/60 space-y-0.5">
            <button
              type="button"
              onClick={onSave}
              disabled={!dirty}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[0.75rem] text-zinc-300 hover:bg-cyan-500/10 hover:text-cyan-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-zinc-300 focus:outline-none focus-visible:bg-cyan-500/10 focus-visible:text-cyan-100"
            >
              <BookmarkPlus size={13} className="text-zinc-500" />
              <span>Save current filter…</span>
              {dirty && (
                <span className="ml-auto font-mono text-[0.625rem] uppercase tracking-[0.12em] text-cyan-300">
                  ready
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href);
                  toast.success('Filter URL copied', {
                    description: 'Paste anywhere to share this rack view.',
                  });
                  setOpen(false);
                } catch (err) {
                  toast.error('Clipboard blocked', {
                    description: err instanceof Error ? err.message : String(err),
                  });
                }
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[0.75rem] text-zinc-300 hover:bg-cyan-500/10 hover:text-cyan-100 focus:outline-none focus-visible:bg-cyan-500/10 focus-visible:text-cyan-100"
            >
              <Link2 size={13} className="text-zinc-500" />
              <span>Copy share URL</span>
              <span className="ml-auto font-mono text-[0.625rem] uppercase tracking-[0.12em] text-zinc-500">
                bookmarkable
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
