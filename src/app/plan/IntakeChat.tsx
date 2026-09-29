"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ModelMessage } from "ai";
import {
  startIntake,
  answerIntake,
  generatePlan,
  type IntakeResult,
} from "./actions";
import type { GoalProfile } from "@/lib/ai/schemas";

/**
 * Drives the goal-intake conversation as a free-flowing chat. Two transcripts
 * are kept in step: `messages` (the ModelMessage[] round-tripped through the
 * server each turn, including the context-laden opener) and `chat` (the
 * user-facing bubbles). The server stays stateless. Once the model returns
 * `ready`, we show the extracted goal profile + a Generate button.
 */

type Bubble = { role: "user" | "assistant"; text: string };

type Ready = { profile: GoalProfile; message: string };

export function IntakeChat() {
  const [messages, setMessages] = useState<ModelMessage[]>([]);
  const [chat, setChat] = useState<Bubble[]>([]);
  const [ready, setReady] = useState<Ready | null>(null);
  const [input, setInput] = useState("");
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, ready, isPending]);

  function apply(result: IntakeResult) {
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setMessages(result.messages);
    setChat((prev) => [
      ...prev,
      { role: "assistant", text: result.turn.message },
    ]);
    if (result.turn.kind === "ready") {
      setReady({ profile: result.turn.goalProfile, message: result.turn.message });
    }
  }

  function send() {
    const text = input.trim();
    if (!text || isPending) return;
    setInput("");
    setChat((prev) => [...prev, { role: "user", text }]);

    if (!started) {
      setStarted(true);
      startTransition(async () => apply(await startIntake(text)));
    } else {
      startTransition(async () => apply(await answerIntake(messages, text)));
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {chat.length === 0 && (
        <p className="text-sm text-zinc-500">
          Start by telling me what you want to train for — a race, a lift, a
          general goal. We&apos;ll refine it together.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {chat.map((b, i) => (
          <ChatBubble key={i} bubble={b} />
        ))}
        {isPending && (
          <ChatBubble bubble={{ role: "assistant", text: "…" }} />
        )}
      </div>

      {ready && <GoalProfileCard ready={ready} />}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!ready && (
        <div className="sticky bottom-0 -mx-4 flex items-end gap-2 border-t border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-md sm:border dark:border-zinc-800 dark:bg-zinc-950/90">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            autoFocus
            placeholder={
              started
                ? "Reply… (Enter to send, Shift+Enter for a new line)"
                : "e.g. I want to run a half marathon at a 2-hour pace on November 1st"
            }
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
      )}

      <div ref={bottomRef} />
    </div>
  );
}

function ChatBubble({ bubble }: { bubble: Bubble }) {
  const isUser = bubble.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
          isUser
            ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
            : "border border-zinc-200 dark:border-zinc-800"
        }`}
      >
        {bubble.text}
      </div>
    </div>
  );
}

/** Shows the finished goal profile — the durable north star for planning. */
function GoalProfileCard({ ready }: { ready: Ready }) {
  const { profile } = ready;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function generate() {
    setError(null);
    startTransition(async () => {
      const result = await generatePlan(profile);
      if (result.ok) {
        router.push(`/plan/${result.planId}`);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <h2 className="text-lg font-semibold">{profile.goal}</h2>
          <p className="text-sm text-zinc-500">
            {profile.discipline}
            {profile.targetDate ? ` · target ${profile.targetDate}` : ""}
          </p>
        </div>

        {profile.targetMetrics.length > 0 && (
          <Detail label="Targets">
            {profile.targetMetrics.map((m) => `${m.name}: ${m.target}`).join(" · ")}
          </Detail>
        )}
        {(profile.daysPerWeek || profile.sessionMinutes) && (
          <Detail label="Availability">
            {[
              profile.daysPerWeek ? `${profile.daysPerWeek} days/week` : null,
              profile.sessionMinutes ? `~${profile.sessionMinutes} min/session` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Detail>
        )}
        {profile.fixedDays.length > 0 && (
          <Detail label="Fixed days">{profile.fixedDays.join("; ")}</Detail>
        )}
        {profile.constraints.length > 0 && (
          <Detail label="Constraints">{profile.constraints.join("; ")}</Detail>
        )}
        {profile.baselineNotes && (
          <Detail label="Baseline">{profile.baselineNotes}</Detail>
        )}
      </div>

      <button
        onClick={generate}
        disabled={isPending}
        className="w-full rounded-md bg-zinc-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
      >
        {isPending ? "Building your plan…" : "Generate plan"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="text-sm">
      <span className="font-medium">{label}: </span>
      <span className="text-zinc-600 dark:text-zinc-400">{children}</span>
    </div>
  );
}
