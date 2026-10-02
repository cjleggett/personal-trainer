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

/**
 * The coach chat lives entirely in client state (the server is stateless per
 * turn), so a refresh would otherwise wipe it. We persist the conversation to
 * localStorage — both the server `messages` transcript (needed to continue the
 * thread) and the display `chat` bubbles — and restore it on mount.
 */
const STORAGE_KEY = "coach-chat-v1";

type PersistedChat = { messages: ModelMessage[]; chat: Bubble[] };

function loadPersisted(): PersistedChat | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedChat;
    if (!Array.isArray(parsed.messages) || !Array.isArray(parsed.chat)) return null;
    return parsed;
  } catch {
    return null; // Corrupt/unreadable storage: start fresh rather than crash.
  }
}

/** Deep-link into the existing new-workout prefill for a coach-drafted workout.
 * A multi-exercise draft (a gym day) carries its exercises as a JSON param so the
 * logging form opens with one prefilled card per movement. */
function draftHref(draft: WorkoutDraft): string {
  const params = new URLSearchParams({
    focus: draft.title,
    type: draft.workoutType,
    target: draft.target,
  });
  // Notes are intentionally not prefilled — that field is the user's space for
  // how the session felt, so draft.notes isn't carried into the form.
  // `exercises` may be absent on drafts persisted before this field existed.
  if (draft.exercises?.length) {
    params.set("exercises", JSON.stringify(draft.exercises));
  }
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

  // Restore a saved conversation on mount. We start from empty state (so the
  // server-rendered markup matches) and hydrate from localStorage in an effect
  // to avoid an SSR/client mismatch. `restored` gates the persist effect so we
  // never write our initial empty state over a saved one before loading it.
  // Setting state from a one-shot mount effect is the intended pattern for
  // syncing an external store that isn't available during SSR.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const saved = loadPersisted();
    if (saved && saved.chat.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from localStorage on mount
      setMessages(saved.messages);
      setChat(saved.chat);
      setStarted(saved.messages.length > 0);
    }
    setRestored(true);
  }, []);

  // Persist after every change, once we've restored. An empty conversation
  // clears the key (used by the Clear button and a fresh start).
  useEffect(() => {
    if (!restored || typeof window === "undefined") return;
    if (chat.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, chat }));
    }
  }, [restored, messages, chat]);

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

  /** Wipe the conversation (state + persisted copy). */
  function clearChat() {
    setMessages([]);
    setChat([]);
    setStarted(false);
    setError(null);
    setInput("");
  }

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Coach</h2>
          <p className="text-sm text-zinc-500">
            Ask a question, tell me about a schedule change or how you&apos;re
            feeling, or log a workout — I&apos;ll help.
          </p>
        </div>
        {chat.length > 0 && (
          <button
            onClick={clearChat}
            disabled={isPending}
            className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Clear chat
          </button>
        )}
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
            {draft.exercises?.length ? (
              <ul className="mt-2 space-y-0.5 text-zinc-600 dark:text-zinc-400">
                {draft.exercises.map((ex, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span>{ex.name}</span>
                    {ex.target && (
                      <span className="shrink-0 text-zinc-500">{ex.target}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
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
