"use client";

import { startPlanEdit, continuePlanEdit } from "../edit-actions";
import { planEditKey } from "@/lib/coach/chat-storage";
import { PlanChat } from "./PlanChat";

/**
 * The plan page's "edit with your coach" chat — a thin wrapper over the shared
 * PlanChat. The user opens it and types what to change; the coach replies or
 * returns the revised plan (saved server-side, then pulled into view). See
 * PlanChat for the transcript/persistence mechanics.
 */
export function EditPlanChat({
  planId,
  userId,
}: {
  planId: string;
  userId: string;
}) {
  return (
    <PlanChat
      storageKey={planEditKey(userId, planId)}
      title="Edit plan"
      subtitle="ask for a change in plain English"
      placeholder="Ask for a change… (Enter to send, Shift+Enter for a new line)"
      intro={
        <>
          Tell me what to change — &ldquo;make next week easier&rdquo;,
          &ldquo;I can&apos;t train Fridays anymore&rdquo;, &ldquo;add detail to
          the gym days&rdquo;. I&apos;ll revise the plan right here.
        </>
      }
      startAction={(firstMessage) => startPlanEdit(planId, firstMessage)}
      continueAction={(messages, userMessage) =>
        continuePlanEdit(planId, messages, userMessage)
      }
    />
  );
}
