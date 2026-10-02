"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ModelMessage } from "ai";
import {
  startPlanEdit,
  continuePlanEdit,
  type PlanEditResult,
} from "../edit-actions";

/**
 * The plan page's "edit with your coach" chat. A collapsible panel that sits
 * above the plan and refines THIS plan in place. Mirrors the dashboard coach:
 * the server is stateless per turn, so we keep the ModelMessage[] transcript
 * here and send it back each turn. On an updatePlan turn the server already
 * saved the change, so we router.refresh() to re-render the timeline below with
 * the new plan.
 *
 * Unlike the coach it edits one plan and nothing else — there's no drafted
 * workout to render — so the bubble is plain text.
 */

type Bubble = { role: "user" | "assistant"; text: string };

type PersistedChat = { messages: ModelMessage[]; chat: Bubble[] };

/** Per-plan storage key so each plan keeps its own edit thread. */
function storageKey(planId: string): string {
  return `plan-edit-${planId}-v1`;
}

function loadPersisted(planId: string): PersistedChat | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(planId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedChat;
    if (!Array.isArray(parsed.messages) || !Array.isArray(parsed.chat)) return null;
    return parsed;
  } catch {
    return null; // Corrupt/unreadable storage: start fresh rather than crash.
  }
}

export function EditPlanChat({ planId }: { planId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ModelMessage[]>([]);
  const [chat, setChat] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Restore a saved conversation on mount (same SSR-safe pattern as the coach:
  // start empty so server markup matches, then hydrate from localStorage).
  // `restored` gates the persist effect so we never write our initial empty
  // state over a saved one before loading it.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const saved = loadPersisted(planId);
    if (saved && saved.chat.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from localStorage on mount
      setMessages(saved.messages);
      setChat(saved.chat);
      setStarted(saved.messages.length > 0);
    }
    setRestored(true);
  }, [planId]);

  // Persist after every change, once restored. An empty conversation clears the
  // key (used by the Clear button and a fresh start).
  useEffect(() => {
    if (!restored || typeof window === "undefined") return;
    const key = storageKey(planId);
    if (chat.length === 0) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify({ messages, chat }));
    }
  }, [restored, planId, messages, chat]);

  // Scroll the message list (not the page) to the bottom as it grows, but only
  // when the user is already near the bottom so scrolling up isn't yanked back.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
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

  function send() {
    const text = input.trim();
    if (!text || isPending) return;
    setInput("");
    setChat((prev) => [...prev, { role: "user", text }]);

    if (!started) {
      setStarted(true);
      startTransition(async () => apply(await startPlanEdit(planId, text)));
    } else {
      startTransition(async () =>
        apply(await continuePlanEdit(planId, messages, text)),
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
          <span className="font-serif text-lg font-semibold">
            Edit plan
          </span>
          <span className="ml-2 text-sm text-faint">
            {chat.length > 0 ? "conversation in progress" : "ask for a change in plain English"}
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
            <p className="text-sm text-muted">
              Tell me what to change — &ldquo;make next week easier&rdquo;,
              &ldquo;I can&apos;t train Fridays anymore&rdquo;, &ldquo;add detail
              to the gym days&rdquo;. I&apos;ll revise the plan right here.
            </p>
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

          {chat.length > 0 && (
            <div
              ref={listRef}
              className="mt-4 flex max-h-96 flex-col gap-3 overflow-y-auto overscroll-contain scroll-smooth"
            >
              {chat.map((b, i) => (
                <ChatBubble key={i} bubble={b} />
              ))}
              {isPending && (
                <ChatBubble bubble={{ role: "assistant", text: "…" }} />
              )}
            </div>
          )}

          {error && <p className="mt-3 text-sm text-rust">{error}</p>}

          <div className="mt-4 flex items-end gap-2 border-t border-line pt-4">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              placeholder="Ask for a change… (Enter to send, Shift+Enter for a new line)"
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
      )}
    </section>
  );
}

function ChatBubble({ bubble }: { bubble: Bubble }) {
  const isUser = bubble.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap px-4 py-2.5 text-sm ${
          isUser
            ? "rounded-[18px] rounded-br-md bg-ink text-paper"
            : "rounded-[18px] rounded-bl-md bg-rust-soft text-ink"
        }`}
      >
        {bubble.text}
      </div>
    </div>
  );
}
