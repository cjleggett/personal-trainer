"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ModelMessage } from "ai";
import type { PlanEditResult } from "../edit-actions";
import { Markdown } from "@/components/Markdown";
import { CopyButton } from "@/components/CopyButton";
import { AutoTextarea } from "@/components/AutoTextarea";

/**
 * The shared chat panel used on the plan page. It refines THIS plan in place and
 * mirrors the dashboard coach: the server is stateless per turn, so we hold the
 * ModelMessage[] transcript here and send it back each turn. On an updatePlan
 * turn the server already saved the change, so we router.refresh() to re-render
 * the timeline below with the new plan.
 *
 * Two panels build on this:
 *   - "Edit plan" — the user opens the chat and types the first message, which
 *     starts the conversation (startAction).
 *   - "Re-evaluate plan" — the COACH speaks first: opening the panel kicks off a
 *     review turn with no user input (autoStartAction), then follow-ups continue
 *     as normal.
 *
 * There's no drafted workout here (plan-edit never drafts), so bubbles are plain
 * text.
 */

type Bubble = { role: "user" | "assistant"; text: string };

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

export function PlanChat({
  storageKey,
  title,
  subtitle,
  intro,
  placeholder,
  startAction,
  continueAction,
  autoStartAction,
  defaultOpen = false,
}: {
  storageKey: string;
  /** Panel header. */
  title: string;
  /** Short header note shown next to the title. Overridden by "conversation in
   * progress" once a chat exists. */
  subtitle: string;
  /** Intro line shown inside the open panel before the conversation starts. */
  intro: React.ReactNode;
  placeholder: string;
  /** Begin the conversation from the user's first typed message. Omit when the
   * coach opens the conversation itself (autoStartAction). */
  startAction?: (firstMessage: string) => Promise<PlanEditResult>;
  /** Continue an in-progress conversation with the user's next reply. */
  continueAction: (
    messages: ModelMessage[],
    userMessage: string,
  ) => Promise<PlanEditResult>;
  /** When provided, opening the panel kicks off a coach-led first turn with no
   * user input (used by re-evaluate). */
  autoStartAction?: () => Promise<PlanEditResult>;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [messages, setMessages] = useState<ModelMessage[]>([]);
  const [chat, setChat] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // While a turn is in flight, show how long we've been waiting on the coach.
  // Derived from a start timestamp so the effect only ticks (never resets state
  // synchronously) and the number stays accurate even if a tick is delayed.
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

  // Restore a saved conversation on mount (same SSR-safe pattern as the coach:
  // start empty so server markup matches, then hydrate from localStorage).
  // `restored` gates the persist effect so we never write our initial empty
  // state over a saved one before loading it.
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

  // Persist after every change, once restored. An empty conversation clears the
  // key (used by the Clear button and a fresh start).
  useEffect(() => {
    if (!restored || typeof window === "undefined") return;
    if (chat.length === 0) {
      window.localStorage.removeItem(storageKey);
    } else {
      window.localStorage.setItem(storageKey, JSON.stringify({ messages, chat }));
    }
  }, [restored, storageKey, messages, chat]);

  // Scroll the message list (not the page) to the bottom as it grows, but only
  // when the user is already near the bottom so scrolling up isn't yanked back.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [chat, isPending]);

  // The open panel is tall (full-height list + input), so expanding it near the
  // bottom of the page can leave the input below the fold. Scroll the input row
  // into view on open so the user can start typing without scrolling.
  const inputRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    inputRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [open]);

  function apply(result: PlanEditResult) {
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setMessages(result.messages);
    setChat((prev) => [...prev, { role: "assistant", text: result.turn.message }]);
    // The plan changed on the server — pull the fresh timeline into view.
    if (result.turn.kind === "updatePlan") router.refresh();
  }

  // Coach-led kickoff: once the panel is open and restored with no existing
  // conversation, run the first turn automatically (re-evaluate only). The ref
  // guard makes this fire at most once per mount, even as deps change.
  const kickedOff = useRef(false);
  useEffect(() => {
    if (!autoStartAction || !open || !restored) return;
    if (started || chat.length > 0 || kickedOff.current) return;
    kickedOff.current = true;
    setStarted(true);
    startTransition(async () => apply(await autoStartAction()));
    // apply/startTransition are stable; intentionally omitted to keep this a
    // one-shot kickoff tied to open/restored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartAction, open, restored, started, chat.length]);

  /** Wipe the conversation (state + persisted copy). */
  function clearChat() {
    setMessages([]);
    setChat([]);
    setStarted(false);
    setError(null);
    setInput("");
    kickedOff.current = false; // allow a fresh coach-led kickoff after clearing
  }

  function send() {
    const text = input.trim();
    if (!text || isPending) return;
    setInput("");
    setChat((prev) => [...prev, { role: "user", text }]);

    // startAction only applies to the user's very first message; once the
    // conversation is going (or the coach opened it), every turn continues.
    if (!started && startAction) {
      setStarted(true);
      startTransition(async () => apply(await startAction(text)));
    } else {
      startTransition(async () =>
        apply(await continueAction(messages, text)),
      );
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <section className="rounded-[20px] border border-line bg-surface shadow-[0_2px_10px_rgba(43,38,32,0.04)]">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left"
      >
        <span>
          <span className="font-serif text-lg font-semibold">{title}</span>
          <span className="ml-2 text-sm text-faint">
            {chat.length > 0 ? "conversation in progress" : subtitle}
          </span>
        </span>
        <span
          aria-hidden
          className={`shrink-0 text-faint transition-transform ${open ? "rotate-90" : ""}`}
        >
          ▸
        </span>
      </button>

      {open && (
        <div className="border-t border-line px-6 pb-6 pt-4">
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm text-muted">{intro}</p>
            {chat.length > 0 && (
              <button
                onClick={clearChat}
                disabled={isPending}
                className="shrink-0 rounded-full border border-line-strong px-2.5 py-1 text-xs font-medium text-muted hover:text-ink disabled:opacity-50"
              >
                Clear chat
              </button>
            )}
          </div>

          {/* The list + input share one fixed-height region, so the panel's
              overall size is settled the moment it opens and never changes. The
              list flexes to fill the space; as the input grows for a longer
              message it expands UP into the list, which shrinks and scrolls. */}
          <div className="mt-4 flex h-[28rem] flex-col">
            <div
              ref={listRef}
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain scroll-smooth"
            >
              {chat.length === 0 && !isPending ? (
                <p className="m-auto max-w-xs text-center text-sm text-faint">
                  Your conversation will appear here.
                </p>
              ) : (
                <>
                  {chat.map((b, i) => (
                    <ChatBubble key={i} bubble={b} />
                  ))}
                  {isPending && <LoadingBubble elapsed={elapsed} />}
                </>
              )}
            </div>

            {error && <p className="mt-3 text-sm text-rust">{error}</p>}

            <div
              ref={inputRef}
              className="mt-4 flex items-end gap-2 border-t border-line pt-4"
            >
              <AutoTextarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
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
          </div>
        </div>
      )}
    </section>
  );
}

/** The "coach is thinking" placeholder: an assistant bubble with three dots
 * fading in sequence, plus a running seconds counter so a slow turn still feels
 * alive. Mirrors the dashboard coach's LoadingBubble. */
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
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] px-4 py-2.5 text-sm ${
          isUser
            ? "rounded-[18px] rounded-br-md whitespace-pre-wrap bg-ink text-paper"
            : "rounded-[18px] rounded-bl-md bg-rust-soft text-ink"
        }`}
      >
        {isUser ? (
          bubble.text
        ) : (
          <div className="space-y-2">
            <Markdown>{bubble.text}</Markdown>
            <div className="flex justify-end">
              <CopyButton text={bubble.text} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
