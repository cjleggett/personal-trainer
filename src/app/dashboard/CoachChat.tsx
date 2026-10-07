"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ModelMessage } from "ai";
import type { WorkoutDraft } from "@/lib/ai/schemas";
import { startCoach, continueCoach, type CoachResult } from "./coach-actions";
import { coachChatKey } from "@/lib/coach/chat-storage";

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
 *
 * The storage key is scoped to the signed-in user (see chat-storage). It MUST
 * be: a shared browser would otherwise restore the previous user's transcript.
 */
type PersistedChat = { messages: ModelMessage[]; chat: Bubble[] };

function loadPersisted(storageKey: string): PersistedChat | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
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

export function CoachChat({ userId }: { userId: string }) {
  const router = useRouter();
  const storageKey = coachChatKey(userId);
  const [messages, setMessages] = useState<ModelMessage[]>([]);
  const [chat, setChat] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();

  // While a turn is in flight, show how long we've been waiting on the coach.
  // We derive the count from a start timestamp captured when the request begins,
  // so the effect only ticks (never resets state synchronously) and the number
  // stays accurate even if a tick is delayed.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isPending) return;
    const started = Date.now();
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      250,
    );
    return () => clearInterval(id);
  }, [isPending]);

  // Restore a saved conversation on mount. We start from empty state (so the
  // server-rendered markup matches) and hydrate from localStorage in an effect
  // to avoid an SSR/client mismatch. `restored` gates the persist effect so we
  // never write our initial empty state over a saved one before loading it.
  // Setting state from a one-shot mount effect is the intended pattern for
  // syncing an external store that isn't available during SSR.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const saved = loadPersisted(storageKey);
    if (saved && saved.chat.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from localStorage on mount
      setMessages(saved.messages);
      setChat(saved.chat);
      setStarted(saved.messages.length > 0);
    }
    setRestored(true);
  }, [storageKey]);

  // Persist after every change, once we've restored. An empty conversation
  // clears the key (used by the Clear button and a fresh start).
  useEffect(() => {
    if (!restored || typeof window === "undefined") return;
    if (chat.length === 0) {
      window.localStorage.removeItem(storageKey);
    } else {
      window.localStorage.setItem(storageKey, JSON.stringify({ messages, chat }));
    }
  }, [restored, storageKey, messages, chat]);

  // Scroll the message list (not the page) to the bottom as it grows. Only
  // auto-follow when the user is already near the bottom, so scrolling up to
  // re-read isn't yanked back down.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    // On expand the list mounts fresh scrolled to the top — always jump to the
    // bottom then. Afterwards only auto-follow when already near the bottom, so
    // scrolling up to re-read isn't yanked back down.
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (expanded || nearBottom) el.scrollTop = el.scrollHeight;
  }, [chat, isPending, expanded]);

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
    <section className="rounded-[20px] border border-line bg-surface p-6 shadow-[0_2px_10px_rgba(43,38,32,0.04)]">
      <button
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <div>
          <h2 className="font-serif text-2xl font-semibold">
            Chat with your coach
          </h2>
          <p className="mt-1 text-sm text-muted">
            Use this chat to ask questions, request edits to your plan, or even
            log a workout!
          </p>
        </div>
        <span
          aria-hidden
          className={`shrink-0 text-2xl leading-none text-muted transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>

      {expanded && (
        <>
          {chat.length > 0 && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={clearChat}
                disabled={isPending}
                className="shrink-0 rounded-full border border-line-strong px-2.5 py-1 text-xs font-medium text-muted hover:text-ink disabled:opacity-50"
              >
                Clear chat
              </button>
            </div>
          )}

          {chat.length > 0 && (
            <div
              ref={listRef}
              className="mt-4 flex max-h-96 flex-col gap-3 overflow-y-auto overscroll-contain scroll-smooth"
            >
              {chat.map((b, i) => (
                <ChatBubble key={i} bubble={b} />
              ))}
              {isPending && <LoadingBubble elapsed={elapsed} />}
            </div>
          )}

          {error && <p className="mt-3 text-sm text-rust">{error}</p>}

          <div className="mt-4 flex items-end gap-2 border-t border-line pt-4">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              placeholder="Tell me how you're feeling, ask a question, or log a workout…"
              className="flex-1 resize-none rounded-[14px] border border-line-strong bg-paper px-3 py-2 text-base text-ink placeholder:text-faint focus:border-rust focus:outline-none"
            />
            <button
              onClick={send}
              disabled={isPending || !input.trim()}
              className="rounded-[14px] bg-ink px-5 py-2.5 text-sm font-medium text-paper disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** The "coach is thinking" placeholder: an assistant bubble with three dots
 * fading in sequence, plus a running seconds counter so a slow turn still feels
 * alive. Matches the assistant bubble styling in ChatBubble. */
function LoadingBubble({ elapsed }: { elapsed: number }) {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-2.5 rounded-[18px] rounded-bl-md bg-rust-soft px-4 py-2.5">
        <span className="flex items-center gap-1" aria-label="Coach is thinking">
          <span className="h-1.5 w-1.5 rounded-full bg-rust animate-coach-dot" />
          <span className="h-1.5 w-1.5 rounded-full bg-rust animate-coach-dot [animation-delay:0.2s]" />
          <span className="h-1.5 w-1.5 rounded-full bg-rust animate-coach-dot [animation-delay:0.4s]" />
        </span>
        <span className="text-xs tabular-nums text-muted">{elapsed}s</span>
      </div>
    </div>
  );
}

function ChatBubble({ bubble }: { bubble: Bubble }) {
  const isUser = bubble.role === "user";
  const draft = !isUser ? bubble.draft : undefined;
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] space-y-2 whitespace-pre-wrap px-4 py-2.5 text-sm ${
          isUser
            ? "rounded-[18px] rounded-br-md bg-ink text-paper"
            : "rounded-[18px] rounded-bl-md bg-rust-soft text-ink"
        }`}
      >
        <p>{bubble.text}</p>
        {draft && (
          <div className="rounded-2xl border border-dashed border-line-strong bg-paper p-4">
            <p className="font-serif text-sm italic text-rust">May I suggest…</p>
            <p className="mt-0.5 font-serif text-lg font-semibold">
              {draft.title}
            </p>
            <p className="text-sm text-muted">
              {draft.workoutType}
              {draft.target ? ` · ${draft.target}` : ""}
            </p>
            {draft.exercises?.length ? (
              <ul className="mt-2 space-y-0.5 text-sm text-muted">
                {draft.exercises.map((ex, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span>{ex.name}</span>
                    {ex.target && (
                      <span className="shrink-0 text-faint">{ex.target}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
            <Link
              href={draftHref(draft)}
              className="mt-3 inline-flex items-center rounded-full bg-rust px-4 py-1.5 text-sm font-medium text-on-rust"
            >
              Log this workout
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
