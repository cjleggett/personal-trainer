"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Combobox } from "./Combobox";

export type WorkoutRow = {
  id: string;
  title: string | null;
  workout_type: string | null;
  /** The type's stored emoji (or a default for a typeless workout). */
  emoji: string;
  performed_at: string;
  /** Total distance across the session, in miles. */
  miles: number;
  /** Total duration across the session, in seconds. */
  seconds: number;
};

type SortKey = "type" | "date" | "miles" | "time";
type SortDir = "asc" | "desc";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Seconds → "h:mm:ss" or "m:ss"; blank for zero. */
function formatDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function WorkoutsTable({ rows }: { rows: WorkoutRow[] }) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [typeFilter, setTypeFilter] = useState<string>("");

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Dates feel natural newest-first; everything else low-to-high first.
      setSortDir(key === "date" ? "desc" : "asc");
    }
  }

  // Distinct workout types present in the data, for the filter dropdown.
  const types = [
    ...new Set(rows.map((r) => r.workout_type).filter((t): t is string => !!t)),
  ].sort((a, b) => a.localeCompare(b));

  // Free-text, case-insensitive substring match against the type (like the
  // type-ahead used when logging a workout). Empty query shows everything.
  const q = typeFilter.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) => (r.workout_type ?? "").toLowerCase().includes(q))
    : rows;

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "type":
        cmp = (a.workout_type ?? "").localeCompare(b.workout_type ?? "");
        break;
      case "date":
        cmp = a.performed_at.localeCompare(b.performed_at);
        break;
      case "miles":
        cmp = a.miles - b.miles;
        break;
      case "time":
        cmp = a.seconds - b.seconds;
        break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const columns: { key: SortKey; label: string; align: "left" | "right" }[] = [
    { key: "date", label: "Date", align: "left" },
    { key: "type", label: "Type", align: "left" },
    { key: "miles", label: "Miles", align: "right" },
    { key: "time", label: "Time", align: "right" },
  ];

  return (
    <div className="flex flex-col gap-3">
      {types.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="w-56">
            <Combobox
              options={types.map((t) => ({ value: t, label: t }))}
              placeholder="Filter by type…"
              allowFreeText
              value={typeFilter}
              onChange={setTypeFilter}
            />
          </div>
          {typeFilter.trim() && (
            <button
              type="button"
              onClick={() => setTypeFilter("")}
              className="text-xs font-semibold uppercase tracking-[0.08em] text-faint transition-colors hover:text-ink"
            >
              Clear
            </button>
          )}
          <span className="text-xs text-faint">
            {sorted.length} workout{sorted.length === 1 ? "" : "s"}
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line">
            {columns.map((col) => {
              const active = col.key === sortKey;
              return (
                <th
                  key={col.key}
                  scope="col"
                  className={`px-5 py-3 font-semibold uppercase tracking-[0.08em] text-faint ${
                    col.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className={`inline-flex items-center gap-1 text-xs uppercase tracking-[0.08em] transition-colors hover:text-ink ${
                      active ? "text-rust" : ""
                    }`}
                  >
                    <span className="text-[0.65rem]">
                      {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                    {col.label}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((w) => (
            <tr
              key={w.id}
              onClick={() => router.push(`/workouts/${w.id}`)}
              className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-rust-soft/40"
            >
              <td className="whitespace-nowrap px-5 py-3 text-faint">
                {formatDate(w.performed_at)}
              </td>
              <td className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-rust-soft text-lg">
                    {w.emoji}
                  </span>
                  <span className="min-w-0">
                    <Link
                      href={`/workouts/${w.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-serif font-semibold hover:underline"
                    >
                      {w.title || formatDate(w.performed_at)}
                    </Link>
                    {w.workout_type && (
                      <span className="block text-xs font-semibold uppercase tracking-[0.06em] text-olive">
                        {w.workout_type}
                      </span>
                    )}
                  </span>
                </div>
              </td>
              <td className="px-5 py-3 text-right tabular-nums">
                {w.miles > 0 ? Math.round(w.miles * 100) / 100 : "—"}
              </td>
              <td className="px-5 py-3 text-right tabular-nums">
                {formatDuration(w.seconds)}
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </div>
  );
}
