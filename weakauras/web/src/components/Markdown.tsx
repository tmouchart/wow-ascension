import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

// Renders an agent message as GitHub-flavored Markdown (tables, lists, code) + inline HTML
// (the agent sometimes emits <ul>/<br/> inside table cells). Styling is compact to fit the
// chat panel; classes are applied per element rather than via a typography plugin (not installed).
export function Markdown({ children }: { children: string }) {
  return (
    <div className="agent-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          p: (p) => <p className="my-1 leading-snug" {...p} />,
          ul: (p) => <ul className="my-1 ml-4 list-disc space-y-0.5" {...p} />,
          ol: (p) => <ol className="my-1 ml-4 list-decimal space-y-0.5" {...p} />,
          li: (p) => <li className="leading-snug" {...p} />,
          h1: (p) => <h1 className="mb-1 mt-2 text-sm font-semibold" {...p} />,
          h2: (p) => <h2 className="mb-1 mt-2 text-sm font-semibold" {...p} />,
          h3: (p) => <h3 className="mb-1 mt-2 text-[13px] font-semibold" {...p} />,
          strong: (p) => <strong className="font-semibold text-foreground" {...p} />,
          a: (p) => <a className="text-primary underline" target="_blank" rel="noreferrer" {...p} />,
          code: (p) => (
            <code className="rounded bg-muted px-1 py-px font-mono text-[11px]" {...p} />
          ),
          hr: (p) => <hr className="my-2 border-border" {...p} />,
          table: (p) => (
            <div className="my-1.5 overflow-x-auto">
              <table className="w-full border-collapse text-[11px]" {...p} />
            </div>
          ),
          th: (p) => (
            <th className="border border-border bg-muted/50 px-1.5 py-1 text-left font-semibold align-top" {...p} />
          ),
          td: (p) => <td className="border border-border px-1.5 py-1 align-top" {...p} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
