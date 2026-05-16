import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Markdown renderer for assistant text. GFM enabled (tables, strikethrough,
 * autolinks, task lists). Components are styled to match the panel's dark
 * theme; code uses the zinc-950 mono treatment we use elsewhere; links open
 * in a new tab with rel=noreferrer so the assistant can safely surface URLs.
 */
const COMPONENTS: Components = {
  p: ({ children }) => (
    <p className="whitespace-pre-wrap break-words text-[13.5px] leading-[1.65] text-zinc-200 [overflow-wrap:anywhere]">
      {children}
    </p>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-cyan-300 underline decoration-cyan-500/40 underline-offset-2 hover:decoration-cyan-300"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-zinc-100">{children}</strong>,
  em: ({ children }) => <em className="italic text-zinc-100">{children}</em>,
  code: ({ inline, children, className }: CodeProps) => {
    if (inline) {
      return (
        <code className="rounded-sm bg-zinc-900 ui-chip-surface px-1 py-0.5 font-mono text-[12px] text-cyan-200">
          {children}
        </code>
      );
    }
    const lang = /language-(\w+)/.exec(className ?? '')?.[1];
    return (
      <code className={`block whitespace-pre-wrap break-words font-mono text-[11.5px] leading-normal text-zinc-200 ${lang ? `language-${lang}` : ''}`}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-sm border border-zinc-800/70 bg-zinc-950 ui-popover-surface px-2.5 py-2 font-mono text-[11.5px] leading-normal text-zinc-200">
      {children}
    </pre>
  ),
  ul: ({ children }) => (
    <ul className="list-disc space-y-0.5 pl-5 text-[13.5px] leading-[1.65] text-zinc-200 marker:text-zinc-500">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal space-y-0.5 pl-5 text-[13.5px] leading-[1.65] text-zinc-200 marker:text-zinc-500">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="[overflow-wrap:anywhere]">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-cyan-500/40 pl-3 text-[13px] italic text-zinc-300">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-zinc-800" />,
  h1: ({ children }) => (
    <h1 className="text-[15px] font-semibold text-zinc-100">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-[14px] font-semibold text-zinc-100">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-[13px] font-semibold text-zinc-100">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-[12.5px] font-semibold text-zinc-100">{children}</h4>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="my-1 border-collapse text-[12px] text-zinc-200">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-zinc-700">{children}</thead>,
  th: ({ children }) => (
    <th className="px-2 py-1 text-left font-mono text-[10px] uppercase tracking-[0.06em] text-zinc-400">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-t border-zinc-800/60 px-2 py-1 align-top">{children}</td>
  ),
};

// react-markdown 9's typed Components omits `inline` (it's now derived from the
// presence of a parent <pre>). Casting through a local interface lets us keep
// the inline-vs-block fork while staying on the published types.
type CodeProps = React.HTMLAttributes<HTMLElement> & { inline?: boolean };

export function AssistantMarkdown({ children }: { children: string }) {
  return (
    <div className="space-y-2">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
