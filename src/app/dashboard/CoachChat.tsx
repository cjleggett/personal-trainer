"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ModelMessage } from "ai";
import type { WorkoutDraft } from "@/lib/ai/schemas";
import { startCoach, continueCoach, type CoachResult } from "./coach-actions";

/**
 * The dashboard coach: a general chat where the user can ask questions, report
 * changes, or log workouts. Each turn the model decides an action (reply /
 * updatePlan / draftWorkout). Mirrors the intake chat — the server is stateless,
 * so we keep the ModelMessage[] transcript here and send it back each turn.
 *   - updatePlan   → the server already saved it; we router.refresh() so the
 *                    upcoming-workout cards reflect the change.
 *   - draftWorkout → we show a card with a "Log this workout" button that opens
 *                    the prefilled new-workout form.
 */

type Bubble =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; draft?: WorkoutDraft };

/** Deep-link into the existing new-workout prefill for a coach-drafted workout. */
function draftHref(draft: WorkoutDraft): string {
  const params = new URLSearchParams({
    focus: draft.title,
    type: draft.workoutType,
    target: draft.target,
  });
  if (draft.notes) params.set("note", draft.notes);
  return `/workouts/new?${params.toString()}`;
}

export function CoachChat() {
  const router = useRouter();
  const [messages, setMessages] = useState<ModelMessage[]>([]);
  const [chat, setChat] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Scroll the message list (not the page) to the bottom as it grows. Only
  // auto-follow when the user is already near the bottom, so scrolling up to
  // re-read isn't yanked back down.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [chat, isPending]);

  function apply(result: CoachResult) {
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setMessages(result.messages);
    const { turn } = result;
    setChat((prev) => [
      ...prev,
      {
        role: "assistant",
        text: turn.message,
        draft: turn.kind === "draftWorkout" ? turn.workout : undefined,
      },
    ]);
    // The plan changed on the server — pull the fresh cards into view.
    if (turn.kind === "updatePlan") router.refresh();
  }

  function send() {
    const text = input.trim();
    if (!text || isPending) return;
    setInput("");
    setChat((prev) => [...prev, { role: "user", text }]);

    if (!started) {
      setStarted(true);
      startTransition(async () => apply(await startCoach(text)));
    } else {
      startTransition(async () => apply(await continueCoach(messages, text)));
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <section className="space-y-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
      <div>
        <h2 className="text-lg font-semibold">Coach</h2>
        <p className="text-sm text-zinc-500">
          Ask a question, tell me about a schedule change or how you&apos;re
          feeling, or log a workout — I&apos;ll help.
        </p>
      </div>

      {chat.length > 0 && (
        <div
          ref={listRef}
          className="flex max-h-96 flex-col gap-3 overflow-y-auto overscroll-contain scroll-smooth"
        >
          {chat.map((b, i) => (
            <ChatBubble key={i} bubble={b} />
          ))}
          {isPending && (
            <ChatBubble bubble={{ role: "assistant", text: "…" }} />
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="e.g. My left quad is really sore, is that expected?"
          className="flex-1 resize-none rounded-md border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          onClick={send}
          disabled={isPending || !input.trim()}
          className="rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          Send
        </button>
      </div>
    </section>
  );
}

function ChatBubble({ bubble }: { bubble: Bubble }) {
  const isUser = bubble.role === "user";
  const draft = !isUser ? bubble.draft : undefined;
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] space-y-2 whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
          isUser
            ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
            : "border border-zinc-200 dark:border-zinc-800"
        }`}
      >
        <p>{bubble.text}</p>
        {draft && (
          <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
            <p className="font-medium">{draft.title}</p>
            <p className="text-zinc-600 dark:text-zinc-400">
              {draft.workoutType}
              {draft.target ? ` · ${draft.target}` : ""}
            </p>
            <Link
              href={draftHref(draft)}
              className="mt-2 inline-flex items-center rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
            >
              Log this workout
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
