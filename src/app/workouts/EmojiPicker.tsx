"use client";

import { WORKOUT_TYPE_EMOJIS } from "@/lib/logging/metrics";

/**
 * A small grid of curated activity emojis (from WORKOUT_TYPE_EMOJIS). The caller
 * owns the chosen value; clicking a cell calls onChange with that emoji. Used
 * when adding a new workout type — the UI equivalent of the coach's emoji param.
 */
export function EmojiPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (emoji: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {WORKOUT_TYPE_EMOJIS.map((emoji) => {
        const selected = emoji === value;
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onChange(emoji)}
            aria-label={`Choose ${emoji}`}
            aria-pressed={selected}
            className={`grid size-9 place-items-center rounded-lg border text-lg transition-colors ${
              selected
                ? "border-rust bg-rust-soft"
                : "border-line bg-surface hover:border-line-strong"
            }`}
          >
            {emoji}
          </button>
        );
      })}
    </div>
  );
}
