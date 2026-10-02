"use client";

import { startReevaluation, continuePlanEdit } from "../edit-actions";
import { planReevalKey } from "@/lib/coach/chat-storage";
import { PlanChat } from "./PlanChat";

/**
 * "Re-evaluate plan" — a coach-led review of the plan against the athlete's
 * actual recent training. Unlike the edit chat, the COACH speaks first: opening
 * the panel kicks off startReevaluation (no user input), which audits the plan
 * for injuries and plan-vs-reality drift and proposes adjustments. Follow-ups
 * continue the same conversation; applied changes save server-side and refresh
 * the timeline below. See PlanChat for the shared mechanics.
 *
 * `defaultOpen` lets the dashboard nudge deep-link straight into a running
 * review (via ?reevaluate=1).
 */
export function ReevaluateChat({
  planId,
  userId,
  defaultOpen = false,
}: {
  planId: string;
  userId: string;
  defaultOpen?: boolean;
}) {
  return (
    <PlanChat
      storageKey={planReevalKey(userId, planId)}
      title="Re-evaluate plan"
      subtitle="have your coach review your progress"
      placeholder="Reply to your coach… (Enter to send, Shift+Enter for a new line)"
      intro={
        <>
          I&apos;ll look at this plan against what you&apos;ve actually been
          doing — recent injuries, missed sessions, where you&apos;re ahead or
          behind — and suggest adjustments. Nothing changes until you say so.
        </>
      }
      continueAction={(messages, userMessage) =>
        continuePlanEdit(planId, messages, userMessage)
      }
      autoStartAction={() => startReevaluation(planId)}
      defaultOpen={defaultOpen}
    />
  );
}
