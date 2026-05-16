import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { AtSign, Bot, X, Plus, Square as SquareIcon, Send, Paperclip, Maximize2, Minimize2 } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

import { AssistantCommandPalette } from './components/AssistantCommandPalette';
import { AssistantDevicePicker } from './components/AssistantDevicePicker';
import { AssistantMarkdown } from './components/AssistantMarkdown';
import { AssistantProviderSwitch } from './components/AssistantProviderSwitch';
import { composeSlashPrompt, type SlashCommand } from './components/AssistantSlashCommands';
import { useAssistantStore, type AssistantSize } from './stores/assistant';
import { useDevicesStore } from './stores/devices';

const TRANSPORT = new DefaultChatTransport({
  api: '/api/assistant/chat',
  credentials: 'include',
  prepareSendMessagesRequest: ({ messages, body }) => {
    // Pull the current selection from the store at submit time so the user can
    // change provider/model between turns without re-creating the transport.
    const eff = useAssistantStore.getState().effective();
    return {
      body: {
        ...(body ?? {}),
        messages,
        ...(eff ? { provider: eff.provider, model: eff.model } : {}),
      },
    };
  },
});

const COMPOSER_MIN_PX = 56;
const COMPOSER_MAX_PX = 220;

export function Assistant() {
  const open = useAssistantStore((s) => s.open);
  const setOpen = useAssistantStore((s) => s.set);
  const size = useAssistantStore((s) => s.size);
  const setSize = useAssistantStore((s) => s.setSize);
  const catalog = useAssistantStore((s) => s.catalog);
  const loadCatalog = useAssistantStore((s) => s.loadCatalog);
  const storedMessages = useAssistantStore((s) => s.messages);
  const setStoredMessages = useAssistantStore((s) => s.setMessages);
  const draft = useAssistantStore((s) => s.draft);
  const setDraft = useAssistantStore((s) => s.setDraft);

  const { messages, sendMessage, setMessages: setChatMessages, status, error, stop, regenerate } = useChat({
    transport: TRANSPORT,
    messages: storedMessages,
  });

  const [slashOpen, setSlashOpen] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const busy = status === 'streaming' || status === 'submitted';
  const agentState: 'connecting' | 'ready' | 'running' = busy ? 'running' : 'ready';

  const handleSlashPick = useCallback(
    (command: SlashCommand, args: string) => {
      if (command.local) {
        if (command.command === '/clear') {
          setChatMessages([]);
          setStoredMessages([]);
        }
        return;
      }
      const base = composeSlashPrompt(command, args);
      if (!base) return;
      // Insert into the composer instead of sending — the operator can add /
      // edit @-mentions before pressing Enter. When the command targets a
      // device and the grid already has a selection, pre-fill those serials
      // as @mentions so the common case is one keystroke away from sending.
      let next = base;
      if (command.needsTarget) {
        const selected = Array.from(useDevicesStore.getState().selectedSerials);
        if (selected.length > 0) {
          next = `${base} ${selected.map((s) => `@${s}`).join(' ')}`;
        }
      }
      const sep = draft.length === 0 || /\s$/.test(draft) ? '' : ' ';
      setDraft(`${draft}${draft ? sep : ''}${next} `);
      requestAnimationFrame(() => {
        const el = composerRef.current;
        if (!el) return;
        el.focus();
        const pos = el.value.length;
        el.setSelectionRange(pos, pos);
      });
    },
    [setChatMessages, setStoredMessages, draft, setDraft],
  );

  useEffect(() => {
    setStoredMessages(messages);
  }, [messages, setStoredMessages]);

  // Lazy-load the provider/model catalog the first time the operator opens
  // the panel — avoids hitting the hub on every page load.
  useEffect(() => {
    if (open && !catalog) void loadCatalog();
  }, [open, catalog, loadCatalog]);

  // Progressive escape: fullscreen → expanded → compact → hidden. Each Esc
  // shrinks one size step; from compact it hides the panel. Fires regardless
  // of which child has focus so Esc inside the composer also closes the
  // dialog (Cursor / Linear convention).
  useEffect(() => {
    if (!open) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key !== 'Escape') return;
      const store = useAssistantStore.getState();
      if (store.shrinkSize()) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      store.set(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  function handleNewChat() {
    if (busy) return;
    setChatMessages([]);
    setStoredMessages([]);
  }

  const content = (
    <>
      <PaneChyron
        fullscreen={size === 'fullscreen'}
        onCollapse={() => setSize('collapsed')}
        onClose={() => setOpen(false)}
      />
      <PanelHeader
        agentState={agentState}
        fullscreen={size === 'fullscreen'}
        onToggleFullscreen={() =>
          setSize(size === 'fullscreen' ? 'expanded' : 'fullscreen')
        }
        onNewChat={messages.length > 0 ? handleNewChat : undefined}
      />

      <MessageStream messages={messages} status={status} />

      {error && (
        <div
          role="alert"
          className="mx-4 mb-2 shrink-0 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-200"
        >
          {error.message}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => regenerate()}
              className="ml-2 font-mono text-[11px] uppercase tracking-[0.06em] underline decoration-rose-300/40 hover:decoration-rose-200"
            >
              retry
            </button>
          )}
        </div>
      )}

      <Composer
        busy={busy}
        fullscreen={size === 'fullscreen'}
        textareaRef={composerRef}
        value={draft}
        onValueChange={setDraft}
        onSubmit={(text) => {
          sendMessage({ parts: [{ type: 'text', text }] });
          setDraft('');
        }}
        onStop={stop}
        onOpenSlash={() => setSlashOpen(true)}
      />

      <AssistantCommandPalette
        open={slashOpen}
        onClose={() => setSlashOpen(false)}
        onPick={handleSlashPick}
      />
    </>
  );

  // Three layout modes match cliper's pane behaviour:
  //   collapsed  → 36px rail with a rotated label. Click anywhere to expand.
  //   expanded   → flex column inside the main row, peer of Sidebar + Grid.
  //   fullscreen → fixed overlay covering the viewport, escapes the flex row.
  if (size === 'collapsed') {
    // Matches cliper's PaneStrip: 36px rail, just a rotated label, click anywhere to expand.
    return (
      <button
        type="button"
        onClick={() => setSize('expanded')}
        aria-label="Expand assistant"
        title="Expand assistant"
        className="flex h-full w-9 shrink-0 items-center justify-center border-l border-zinc-800 ui-assistant-surface text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 focus-visible:ring-inset"
      >
        <span className="origin-center -rotate-90 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.18em]">
          Assistant
        </span>
      </button>
    );
  }

  if (size === 'fullscreen') {
    return (
      <div
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) setSize('expanded');
        }}
        className="fixed inset-0 z-40 flex items-stretch ui-modal-overlay ui-modal-overlay-72 backdrop-blur-sm"
      >
        <aside
          role="dialog"
          aria-label="Operator assistant"
          className="flex h-screen w-screen flex-col overflow-hidden ui-assistant-surface shadow-2xl"
        >
          {content}
        </aside>
      </div>
    );
  }

  return (
    <aside
      role="complementary"
      aria-label="Operator assistant"
      className="flex h-full w-full max-w-[560px] shrink-0 flex-col overflow-hidden border-l border-zinc-800 ui-assistant-surface"
      style={{ width: '560px' }}
    >
      {content}
    </aside>
  );
}

// Cliper PaneHeader equivalent — thin 32 px chyron above the panel body. Just
// the pane label, a collapse-to-strip "Hide" button, and a close ("×") that
// fully hides the column from the layout.
function PaneChyron({
  fullscreen,
  onCollapse,
  onClose,
}: {
  fullscreen: boolean;
  onCollapse: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex h-8 shrink-0 items-center border-b border-zinc-800 ui-assistant-surface px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
      <div
        className={`flex w-full items-center justify-between gap-2 ${
          fullscreen ? 'mx-auto max-w-[760px]' : ''
        }`}
      >
        <span className="truncate text-zinc-300">Assistant</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onCollapse}
            title="Collapse to strip"
            className="rounded px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-zinc-400 ui-chip-surface transition hover:bg-zinc-800/80 hover:text-zinc-100"
          >
            Hide
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close assistant"
            title="Close assistant"
            className="inline-flex h-6 w-6 items-center justify-center rounded-sm ui-chip-surface text-zinc-500 transition hover:bg-zinc-800/80 hover:text-zinc-100"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

// Cliper AgentPanel header equivalent — provider switch fills width, status
// pill on the right, then single Fullscreen/Dock toggle and an optional New
// Chat button. No bot icon, no title (the chyron already labels the pane).
function PanelHeader({
  agentState,
  fullscreen,
  onToggleFullscreen,
  onNewChat,
}: {
  agentState: 'connecting' | 'ready' | 'running';
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onNewChat?: () => void;
}) {
  return (
    <header className="shrink-0 border-b border-zinc-800 ui-assistant-surface px-3 py-2">
      <div
        className={`flex w-full items-center gap-2 ${
          fullscreen ? 'mx-auto max-w-[760px]' : ''
        }`}
      >
      <AssistantProviderSwitch />
      <span
        role="status"
        className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-sm border px-1.5 font-mono text-[10px] uppercase tracking-[0.08em] ${
          agentState === 'running'
            ? 'border-amber-500/45 bg-amber-500/10 text-amber-200'
            : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
        }`}
      >
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full ${
            agentState === 'running' ? 'bg-amber-400 motion-safe:animate-pulse' : 'bg-emerald-400'
          }`}
        />
        {agentState}
      </span>
      <button
        type="button"
        onClick={onToggleFullscreen}
        aria-pressed={fullscreen}
        aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border ui-chip-surface text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-100"
      >
        {fullscreen ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
      </button>
      {onNewChat && (
        <button
          type="button"
          onClick={onNewChat}
          title="Start a new chat (clears the current conversation)"
          className="inline-flex h-6 shrink-0 items-center gap-1 rounded-sm border ui-chip-surface px-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-100"
        >
          <Plus size={11} aria-hidden />
          new
        </button>
      )}
      </div>
    </header>
  );
}

function MessageStream({ messages, status }: { messages: UIMessage[]; status: ReturnType<typeof useChat>['status'] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const programmaticRef = useRef(false);
  const [stick, setStick] = useState(true);

  const setSticky = useCallback((next: boolean) => {
    stickRef.current = next;
    setStick((prev) => (prev === next ? prev : next));
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    programmaticRef.current = true;
    el.scrollTop = el.scrollHeight;
    setSticky(true);
    requestAnimationFrame(() => {
      programmaticRef.current = false;
    });
  }, [setSticky]);

  useLayoutEffect(() => {
    if (stickRef.current) scrollToBottom();
  }, [messages, status, scrollToBottom]);

  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(() => {
      if (stickRef.current) scrollToBottom();
    });
    obs.observe(node);
    return () => obs.disconnect();
  }, [scrollToBottom]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    if (programmaticRef.current) return;
    const t = e.currentTarget;
    setSticky(t.scrollHeight - t.scrollTop - t.clientHeight < 80);
  }

  if (messages.length === 0) return <EmptyState />;

  // 'submitted' = request in flight, but first chunk hasn't arrived. We render
  // a placeholder assistant turn so the gutter rule + pulsing line indicator
  // appears immediately under the user's message (cliper-style continuity)
  // instead of leaving the operator staring at a still UI.
  const lastMessage = messages[messages.length - 1];
  const showPending = status === 'submitted' && lastMessage?.role !== 'assistant';

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div
        ref={containerRef}
        onScroll={onScroll}
        aria-live="polite"
        aria-relevant="additions text"
        className="h-full overflow-y-auto overflow-x-hidden px-3 py-4"
      >
        <div ref={contentRef} className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
          {messages.map((m) =>
            m.role === 'user' ? (
              <UserTurn key={m.id} message={m} />
            ) : (
              <AssistantTurn key={m.id} message={m} streaming={status === 'streaming' && m === messages[messages.length - 1]} />
            ),
          )}
          {showPending && <PendingTurn />}
        </div>
      </div>
      {!stick && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-sm border ui-chip-surface px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-zinc-400 shadow-lg backdrop-blur transition hover:text-zinc-100"
        >
          latest
        </button>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div className="h-full overflow-y-auto px-3 pt-6 pb-3">
        <div className="mx-auto flex w-full max-w-[760px] items-start gap-3">
          <span className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
            <Bot size={16} strokeWidth={1.75} />
          </span>
          <div className="relative min-w-0 flex-1 border-l border-zinc-800 pl-4">
            <p className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-cyan-300">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
              standby
            </p>
            <p className="max-w-prose text-[13px] leading-[1.6] text-zinc-300">
              Ask about devices, screenshot a phone, drive a UI flow, or run a shell command.
            </p>
            <p className="mt-2 max-w-prose text-[11px] leading-[1.6] text-zinc-500">
              Try: <span className="text-zinc-300">"list my devices"</span> ·{' '}
              <span className="text-zinc-300">"screenshot the first online phone"</span> ·{' '}
              <span className="text-zinc-300">"open settings on 100.64.0.5:5555"</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function UserTurn({ message }: { message: UIMessage }) {
  const text = textOf(message);
  return (
    <div className="flex justify-end pl-8" aria-label="Your message">
      <div className="max-w-[88%]">
        <p className="mb-1 text-right font-mono text-[10px] uppercase tracking-[0.08em] text-zinc-500">you</p>
        <p className="whitespace-pre-wrap break-words rounded-md border border-zinc-700/70 ui-popover-surface px-3 py-2 text-left text-[13.5px] leading-[1.55] text-zinc-100 [overflow-wrap:anywhere]">
          {renderUserText(text)}
        </p>
      </div>
    </div>
  );
}

// @100.64.0.5:5555 / @ABCD1234 → highlighted mono chip so device references stand
// out from the rest of the prompt. Recognises @ followed by IP:port, USB id,
// or any kebab/snake serial — anything we'd reasonably let the device picker
// insert.
const MENTION_RE = /(@[A-Za-z0-9._:-]+)/g;
function renderUserText(text: string): React.ReactNode {
  if (!text) return null;
  // String#split with a captured group alternates non-match / match tokens,
  // so any element starting with "@" here came from MENTION_RE and is safe to
  // wrap as a chip without re-testing.
  return text.split(MENTION_RE).map((part, i) =>
    part.startsWith('@') ? (
      <span
        key={i}
        className="inline rounded-sm border border-cyan-500/30 bg-cyan-500/10 px-1 font-mono text-[12.5px] text-cyan-200"
      >
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function PendingTurn() {
  // Skeleton turn used while we're waiting for the first chunk after submit.
  // Shape matches AssistantTurn (gutter rule + dot + content card) so the
  // streaming line indicator and "thinking" caption appear in the same spot
  // the real reply will eventually land — no layout jump on first chunk.
  return (
    <article className="grid grid-cols-[18px_minmax(0,1fr)] gap-3" aria-label="Assistant is thinking" role="status">
      <div className="relative flex justify-center pt-2" aria-hidden>
        <span className="absolute bottom-0 top-5 w-px bg-zinc-800" />
        <span className="assistant-loading-dot relative z-10 h-2 w-2 rounded-full motion-safe:animate-pulse" />
      </div>
      <div className="min-w-0 rounded-md border border-zinc-800/70 ui-popover-surface px-3 py-2.5">
        <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-cyan-300">
          <span>assistant</span>
          <span className="text-zinc-500 normal-case tracking-normal">· thinking</span>
        </p>
        <div className="assistant-loading-line w-40 max-w-full motion-safe:animate-pulse motion-reduce:opacity-80" />
      </div>
    </article>
  );
}

function AssistantTurn({ message, streaming }: { message: UIMessage; streaming: boolean }) {
  const toolParts = useMemo(
    () => message.parts.filter((p): p is ToolPart => isToolPart(p)),
    [message.parts],
  );

  return (
    <article className="grid grid-cols-[18px_minmax(0,1fr)] gap-3" aria-label="Assistant message">
      <div className="relative flex justify-center pt-2" aria-hidden>
        <span className="absolute bottom-0 top-5 w-px bg-zinc-800" />
        <span
          className={`relative z-10 h-2 w-2 rounded-full ${
            streaming ? 'assistant-loading-dot motion-safe:animate-pulse' : 'bg-cyan-400'
          }`}
        />
      </div>

      <div className="min-w-0 rounded-md border border-zinc-800/70 ui-popover-surface px-3 py-2.5">
        <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-cyan-300">
          <span>assistant</span>
          {toolParts.length > 0 && (
            <span className="rounded-sm bg-cyan-500/10 px-1.5 py-0.5 text-zinc-400">
              {toolParts.length} tool{toolParts.length === 1 ? '' : 's'}
            </span>
          )}
        </p>

        <div className="space-y-2">
          {message.parts.map((part, i) => (
            <PartView key={`${message.id}-${i}`} part={part} />
          ))}
        </div>

        {streaming && (
          <div
            role="status"
            aria-label="Agent is responding"
            className="assistant-loading-line mt-3 w-40 max-w-full motion-safe:animate-pulse motion-reduce:opacity-80"
          />
        )}
      </div>
    </article>
  );
}

type Part = UIMessage['parts'][number];
type ToolPart = Part & {
  type: `tool-${string}`;
  toolCallId: string;
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

function isToolPart(part: Part): part is ToolPart {
  return typeof part.type === 'string' && part.type.startsWith('tool-');
}

function PartView({ part }: { part: Part }) {
  if (part.type === 'text') {
    return <AssistantMarkdown>{part.text}</AssistantMarkdown>;
  }
  if (part.type === 'reasoning') {
    return (
      <details className="rounded-sm ui-popover-surface text-[11px] text-zinc-500">
        <summary className="cursor-pointer select-none px-2 py-1 font-mono uppercase tracking-[0.08em]">reasoning</summary>
        <p className="whitespace-pre-wrap break-words border-t border-zinc-800/60 px-2 py-1.5 leading-[1.6] text-zinc-400">
          {part.text}
        </p>
      </details>
    );
  }
  if (isToolPart(part)) return <ToolRow part={part} />;
  return null;
}

function ToolRow({ part }: { part: ToolPart }) {
  const name = part.type.slice('tool-'.length);
  const dotTone =
    part.state === 'output-error'
      ? 'bg-rose-400'
      : part.state === 'output-available'
        ? 'bg-emerald-400'
        : 'bg-amber-400 motion-safe:animate-pulse';
  const statusText =
    part.state === 'output-error' ? 'error' : part.state === 'output-available' ? 'done' : 'running';
  const summary = summarizeInput(part.input);

  return (
    <details className="group rounded-sm ui-popover-surface hover:bg-zinc-900/60 [&>summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-2 py-1 font-mono text-[12px] leading-normal">
        <span
          aria-hidden
          className={`h-1.5 w-1.5 shrink-0 rounded-full opacity-80 transition-opacity duration-[120ms] group-hover:opacity-100 ${dotTone}`}
        />
        <span className="shrink-0 text-zinc-200">{name}</span>
        {summary && <span className="min-w-0 flex-1 truncate text-zinc-500">{summary}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-2 text-[10px] text-zinc-500">
          <span>{statusText}</span>
          <span aria-hidden className="transition-transform group-open:rotate-90">▸</span>
        </span>
      </summary>
      <div className="space-y-2 border-t border-zinc-800/60 px-2 py-2 text-[11.5px]">
        {part.input != null && <Block label="input" body={safeStringify(part.input)} />}
        {part.output != null && <Block label="output" body={safeStringify(part.output)} />}
        {part.errorText && (
          <p role="alert" className="rounded-sm border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 font-mono text-rose-300">
            {part.errorText}
          </p>
        )}
      </div>
    </details>
  );
}

function Block({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.08em] text-zinc-500">{label}</p>
      <pre className="overflow-x-auto rounded-sm ui-popover-surface px-2 py-1.5 font-mono text-[11px] leading-normal text-zinc-300 whitespace-pre-wrap break-words">
        {body}
      </pre>
    </div>
  );
}

function Composer({
  busy,
  fullscreen,
  value,
  onValueChange,
  onSubmit,
  onStop,
  onOpenSlash,
  textareaRef,
}: {
  busy: boolean;
  fullscreen: boolean;
  value: string;
  onValueChange: (v: string) => void;
  onSubmit: (text: string) => void;
  onStop: () => void;
  onOpenSlash: () => void;
  textareaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
}) {
  const [mentionOpen, setMentionOpen] = useState(false);

  const autoSize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(COMPOSER_MIN_PX, Math.min(el.scrollHeight, COMPOSER_MAX_PX))}px`;
  }, [textareaRef]);

  useEffect(() => {
    autoSize();
  }, [autoSize, value]);

  // Refocus the textarea when an in-flight request finishes so the operator
  // can keep typing without reaching for the mouse. Triggers on busy → !busy
  // transitions only — first paint doesn't steal focus from elsewhere.
  const prevBusyRef = useRef(busy);
  useEffect(() => {
    if (prevBusyRef.current && !busy) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
    prevBusyRef.current = busy;
  }, [busy, textareaRef]);

  function submit() {
    const v = value.trim();
    if (!v || busy) return;
    onSubmit(v);
    if (textareaRef.current) textareaRef.current.style.height = `${COMPOSER_MIN_PX}px`;
  }

  function insertMention(mention: string) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const after = value.slice(end);
    // Pad with a space if we'd otherwise land adjacent to a non-space char.
    const lead = before.length && !/\s$/.test(before) ? ' ' : '';
    const insertion = `${lead}${mention} `;
    const next = before + insertion + after;
    onValueChange(next);
    requestAnimationFrame(() => {
      autoSize();
      el.focus();
      const pos = before.length + insertion.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !mentionOpen) {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === '/' && value.length === 0) {
      e.preventDefault();
      onOpenSlash();
      return;
    }
    if (e.key === '@' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      setMentionOpen(true);
    }
  }

  function onFormSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mentionOpen) return; // Enter inside the picker is handled by the picker itself.
    submit();
  }

  const canSend = value.trim().length > 0 && !busy;

  return (
      <form onSubmit={onFormSubmit} className="relative shrink-0 border-t border-zinc-800 ui-popover-surface px-3 py-2.5">
      <AssistantDevicePicker
        open={mentionOpen}
        onClose={() => setMentionOpen(false)}
        onPick={insertMention}
        query=""
      />
      <div
        className={`rounded-md border border-zinc-800 ui-popover-surface transition-colors focus-within:border-cyan-500/60 ${
          fullscreen ? 'mx-auto w-full max-w-[760px]' : ''
        }`}
      >
        <textarea
          ref={textareaRef}
          rows={2}
          value={value}
          onChange={(e) => {
            onValueChange(e.target.value);
            autoSize();
          }}
          onKeyDown={onKey}
          aria-label="Message assistant"
          placeholder="Ask the assistant…  /  for commands, @  to mention a device"
          disabled={busy}
          className="block w-full resize-none bg-transparent px-3 py-2.5 text-[13.5px] leading-[1.55] text-zinc-100 placeholder:text-zinc-600 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          style={{ minHeight: `${COMPOSER_MIN_PX}px`, maxHeight: `${COMPOSER_MAX_PX}px` }}
        />
        <div className="flex items-center gap-2 border-t border-zinc-800 px-2 py-1.5">
          <button
            type="button"
            onClick={onOpenSlash}
            aria-label="Slash commands"
            title="Slash commands (/)"
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm border ui-chip-surface font-mono text-[14px] text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
          >
            /
          </button>
          <button
            type="button"
            onClick={() => setMentionOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={mentionOpen}
            aria-label="Mention a device"
            title="Mention a device (@)"
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm border ui-chip-surface text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
          >
            <AtSign size={14} />
          </button>
          <button
            type="button"
            disabled
            aria-label="Attachments (coming soon)"
            title="Attachments (coming soon)"
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm border ui-chip-surface text-zinc-600"
          >
            <Paperclip size={14} />
          </button>
          <span className="font-mono text-[10px] text-zinc-500" aria-live="polite">
            {busy ? (
              <span className="inline-flex items-center gap-1.5">
              <span className="assistant-loading-dot inline-block h-2 w-2 rounded-full animate-pulse" />
                waiting
              </span>
            ) : (
              `${value.trim().length}`
            )}
          </span>
          {busy ? (
            <button
              type="button"
              onClick={onStop}
              className="ml-auto inline-flex h-7 items-center gap-1 rounded-sm border ui-chip-surface px-2 font-mono text-[11px] uppercase tracking-[0.06em] text-zinc-300 transition hover:border-rose-500/50 hover:text-rose-200"
            >
              <SquareIcon size={11} className="fill-current" />
              stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              className="ml-auto inline-flex h-7 items-center gap-1 rounded-sm border border-cyan-500/50 bg-cyan-500/15 px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-cyan-100 transition hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send size={13} />
              send
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

function textOf(message: UIMessage): string {
  return message.parts
    .map((p) => (p.type === 'text' ? p.text : ''))
    .join('')
    .trim();
}

function summarizeInput(input: unknown): string {
  if (input == null) return '';
  if (typeof input !== 'object') return String(input);
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0) return '';
  return entries
    .slice(0, 3)
    .map(([k, v]) => `${k}=${shortValue(v)}`)
    .join(' ');
}

function shortValue(v: unknown): string {
  if (typeof v === 'string') return v.length > 24 ? `${v.slice(0, 22)}…` : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return Array.isArray(v) ? `[${v.length}]` : '{…}';
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
