"use client";

import { useState } from "react";

/**
 * A small "copy to clipboard" affordance for a block of text output (e.g. a
 * coach reply). Copies the raw text — the same markdown the model emitted, so
 * what lands on the clipboard is clean source rather than rendered DOM. Shows a
 * brief "Copied" confirmation, then reverts.
 *
 * `navigator.clipboard` is only available in secure contexts; if the write
 * fails (or the API is missing) we surface nothing destructive — the label just
 * stays "Copy". The timeout is cleared implicitly because flipping `copied`
 * back is idempotent and the component is cheap to re-render.
 */
export function CopyButton({
  text,
  className = "",
  label = "Copy",
}: {
  text: string;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (insecure context / denied). Leave label as-is.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : label}
      className={`inline-flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-ink ${className}`}
    >
      {copied ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M4 10.5 L8 14.5 L16 5.5" />
        </svg>
      ) : (
        <svg
          width="14"
          height="14"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="7" y="7" width="9" height="9" rx="2" />
          <path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
        </svg>
      )}
      {copied ? "Copied" : label}
    </button>
  );
}
