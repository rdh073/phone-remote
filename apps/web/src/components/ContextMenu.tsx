import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useContextMenuStore, type ContextMenuItem } from '../stores/contextMenu';

const MENU_WIDTH_PX = 240;
const ITEM_HEIGHT_PX = 30;
const VIEWPORT_GUTTER_PX = 8;

export function ContextMenuHost() {
  const items = useContextMenuStore((s) => s.items);
  const x = useContextMenuStore((s) => s.x);
  const y = useContextMenuStore((s) => s.y);
  const close = useContextMenuStore((s) => s.close);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState(0);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    if (!items) return;
    // Clamp to viewport so the menu never clips off-screen.
    const menuH = items.length * ITEM_HEIGHT_PX + 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const safeX = Math.min(x, vw - MENU_WIDTH_PX - VIEWPORT_GUTTER_PX);
    const safeY = Math.min(y, vh - menuH - VIEWPORT_GUTTER_PX);
    setPos({ x: Math.max(VIEWPORT_GUTTER_PX, safeX), y: Math.max(VIEWPORT_GUTTER_PX, safeY) });
    setHighlight(0);
  }, [items, x, y]);

  useEffect(() => {
    if (!items) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => Math.min(h + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => Math.max(h - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const target = items[highlight];
        if (target) {
          void target.onSelect();
          close();
        }
      }
    };
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    const onContext = (e: MouseEvent) => {
      // A second right-click anywhere closes the current menu (the originating
      // call site is responsible for reopening at the new coords if needed).
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('contextmenu', onContext);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('contextmenu', onContext);
    };
  }, [items, highlight, close]);

  if (!items) return null;

  return (
    <div
      ref={wrapRef}
      role="menu"
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: MENU_WIDTH_PX,
        animation: 'cols-menu-in 140ms cubic-bezier(0.16, 1, 0.3, 1)',
        boxShadow:
          '0 18px 50px -12px rgba(0,0,0,0.72), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.03)',
      }}
      className="z-[58] rounded-md border border-zinc-700/80 ui-popover-surface backdrop-blur-md p-1"
    >
      {items.map((item, idx) => (
        <ContextMenuRow
          key={item.id}
          item={item}
          active={idx === highlight}
          onHover={() => setHighlight(idx)}
          onCommit={() => {
            void item.onSelect();
            close();
          }}
        />
      ))}
    </div>
  );
}

function ContextMenuRow({
  item,
  active,
  onHover,
  onCommit,
}: {
  item: ContextMenuItem;
  active: boolean;
  onHover: () => void;
  onCommit: () => void;
}) {
  const tone = item.danger
    ? active
      ? 'bg-rose-500/15 text-rose-100'
      : 'text-rose-200/85 hover:bg-rose-500/10'
    : active
      ? 'bg-cyan-500/12 text-cyan-100'
      : 'text-zinc-300 hover:bg-zinc-800/70';
  return (
    <button
      type="button"
      role="menuitem"
      onMouseEnter={onHover}
      onClick={onCommit}
      className={`flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-[0.78125rem] transition-colors duration-[100ms] ${tone}`}
    >
      <span className={`shrink-0 ${item.danger ? 'text-rose-300' : active ? 'text-cyan-300' : 'text-zinc-500'}`}>
        {item.icon}
      </span>
      <span className="flex-1 min-w-0 truncate">{item.label}</span>
      {item.hint && (
        <span className="shrink-0 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-zinc-500">{item.hint}</span>
      )}
    </button>
  );
}
