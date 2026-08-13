"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ComboOption = { value: string; label: string; hint?: string };

/**
 * Type-ahead combobox: filters options as you type. Two modes:
 *  - allowFreeText: the typed text is itself a valid value (workout type).
 *    Controlled via `value`/`onChange`; picking an option sets the text.
 *  - selection-only (default): the user must pick an option; `onSelect` fires
 *    with the chosen value. With `resetOnSelect`, the field clears after a pick
 *    (used as an "add exercise" control).
 */
export function Combobox({
  options,
  placeholder,
  allowFreeText = false,
  resetOnSelect = false,
  value,
  onChange,
  onSelect,
}: {
  options: ComboOption[];
  placeholder?: string;
  allowFreeText?: boolean;
  resetOnSelect?: boolean;
  value?: string;
  onChange?: (text: string) => void;
  onSelect?: (value: string) => void;
}) {
  // In free-text mode the parent owns the value, so derive the query from the
  // prop (no duplicate state, no sync effect). Otherwise keep it internally.
  const [internalQuery, setInternalQuery] = useState("");
  const controlled = allowFreeText && value !== undefined;
  const query = controlled ? value : internalQuery;
  const setQuery = (q: string) => {
    if (!controlled) setInternalQuery(q);
  };

  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.hint?.toLowerCase().includes(q),
    );
  }, [options, query]);

  // Close on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function choose(opt: ComboOption) {
    onSelect?.(opt.value);
    if (allowFreeText) {
      onChange?.(opt.label);
      setQuery(opt.label);
    } else if (resetOnSelect) {
      setQuery("");
    } else {
      setQuery(opt.label);
    }
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && filtered[activeIdx]) {
        e.preventDefault();
        choose(filtered[activeIdx]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIdx(0);
          setOpen(true);
          if (allowFreeText) onChange?.(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {filtered.map((opt, idx) => (
            <li key={opt.value}>
              <button
                type="button"
                // onMouseDown (not onClick) so selection beats input blur.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(opt);
                }}
                onMouseEnter={() => setActiveIdx(idx)}
                className={`block w-full px-3 py-2 text-left text-base ${
                  idx === activeIdx
                    ? "bg-zinc-100 dark:bg-zinc-800"
                    : ""
                }`}
              >
                {opt.label}
                {opt.hint ? (
                  <span className="text-zinc-500"> — {opt.hint}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
