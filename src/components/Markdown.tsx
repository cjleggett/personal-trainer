import ReactMarkdown from "react-markdown";

/**
 * Renders model-authored chat text (coach + plan chat) as formatted markdown.
 * The model replies in markdown — bold, bullet/numbered lists, the occasional
 * nested list — so rendering it raw leaked `**` and `-` into the UI.
 *
 * Styling is deliberately tight (small gaps, no heading chrome) to sit inside a
 * chat bubble, and inherits the bubble's text color. We only map the handful of
 * elements the coach actually produces; anything unmapped falls back to sane
 * defaults. No raw HTML is enabled, so untrusted model output can't inject markup.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
        ul: ({ children }) => (
          <ul className="my-2 list-disc space-y-1 pl-5 first:mt-0 last:mb-0">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="my-2 list-decimal space-y-1 pl-5 first:mt-0 last:mb-0">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="pl-0.5">{children}</li>,
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            {children}
          </a>
        ),
        code: ({ children }) => (
          <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.85em]">
            {children}
          </code>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
