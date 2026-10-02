"use client";

import { Fragment, useState } from "react";
import type { ReactNode } from "react";
import type { Faq } from "./content";

// Matches markdown-style links, e.g. [label](https://example.com), so answer
// strings in content.ts can embed clickable links without any HTML.
const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

/** Render inline markdown in a single line, turning `[text](url)` into links. */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  LINK_RE.lastIndex = 0;
  while ((match = LINK_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <Fragment key={lastIndex}>{text.slice(lastIndex, match.index)}</Fragment>,
      );
    }
    const [, label, href] = match;
    nodes.push(
      <a
        key={match.index}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-rust underline hover:text-ink"
      >
        {label}
      </a>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(<Fragment key={lastIndex}>{text.slice(lastIndex)}</Fragment>);
  }
  return nodes;
}

/**
 * Render an answer string as blocks. Lines starting with `- ` become a bulleted
 * list; everything else renders as a paragraph. Inline links work in both.
 * Split answers across lines in content.ts with `\n`.
 */
function renderAnswer(answer: string): ReactNode[] {
  const blocks: ReactNode[] = [];
  const lines = answer.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trimStart().startsWith("- ")) {
      // Consume a run of consecutive bullet lines into one <ul>.
      const items: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith("- ")) {
        items.push(lines[i].trimStart().slice(2));
        i++;
      }
      blocks.push(
        <ul key={blocks.length} className="list-disc space-y-1 pl-5">
          {items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
    } else {
      if (line.trim() !== "") {
        blocks.push(<p key={blocks.length}>{renderInline(line)}</p>);
      }
      i++;
    }
  }
  return blocks;
}

/**
 * The expandable FAQ list at the bottom of the About page. Client component
 * because each entry toggles open/closed. The questions and answers themselves
 * live in `content.ts` (edit them there, not here).
 */
export function FaqList({ faqs }: { faqs: Faq[] }) {
  // Index of the currently open FAQ, or null when all are collapsed.
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {faqs.map((faq, i) => {
        const open = openIndex === i;
        return (
          <li key={i}>
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : i)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors hover:bg-rust-soft"
            >
              <span className="text-sm font-medium text-ink">{faq.question}</span>
              <span
                aria-hidden="true"
                className={`shrink-0 text-muted transition-transform ${
                  open ? "rotate-180" : ""
                }`}
              >
                ⌄
              </span>
            </button>
            {open && (
              <div className="space-y-3 px-4 pb-4 text-sm leading-relaxed text-muted">
                {renderAnswer(faq.answer)}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
