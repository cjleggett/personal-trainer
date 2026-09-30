"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ModelMessage } from "ai";
import { createClient } from "@/lib/supabase/server";
import {
  coachTurnSchema,
  trainingPlanSchema,
  type CoachTurn,
} from "@/lib/ai/schemas";
import { generateValidated } from "@/lib/ai/generate";
import { COACH_SYSTEM_PROMPT, buildCoachContext } from "@/lib/ai/prompts/coach";
import {
  profileSummary,
  historySummary,
  recentDetailedWorkouts,
} from "@/lib/logging/aggregates";
import { weekDateRanges } from "@/lib/logging/plan-dates";

/**
 * The dashboard coach is stateless on the server, mirroring intake: the client
 * holds the running `messages` transcript and sends it back each turn. Every
 * model turn is validated against `coachTurnSchema`, so the client always gets a
 * well-formed reply / updatePlan / draftWorkout union. On an updatePlan turn we
 * persist the new plan (keeping start_date so dates stay anchored) and
 * revalidate the dashboard. draftWorkout changes nothing server-side — the UI
 * hands it off to the existing new-workout prefill flow.
 */

export type CoachResult =
  | { ok: true; turn: CoachTurn; messages: ModelMessage[] }
  | { ok: false; error: string };

/** Load the user's active plan row, or null. RLS scopes to the owner. */
async function loadActivePlan(
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const { data } = await supabase
    .from("training_plans")
    .select("id, start_date, plan")
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/** Run one coach turn: call the model, and persist the plan if it changed. */
async function runCoachTurn(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string | null,
  messages: ModelMessage[],
): Promise<CoachResult> {
  const result = await generateValidated({
    schema: coachTurnSchema,
    system: COACH_SYSTEM_PROMPT,
    messages,
  });
  if (!result.ok) return result;
  const turn: CoachTurn = result.object;

  // If the plan changed, save it. start_date is untouched, so dates stay anchored.
  if (turn.kind === "updatePlan") {
    if (!planId) {
      return { ok: false, error: "There's no active plan to update." };
    }
    const { error } = await supabase
      .from("training_plans")
      .update({ plan: turn.plan, name: turn.plan.name })
      .eq("id", planId); // RLS scopes to the owner
    if (error) {
      return { ok: false, error: `Couldn't save the change: ${error.message}` };
    }
    revalidatePath("/dashboard");
    revalidatePath(`/plan/${planId}`);
  }

  const updated: ModelMessage[] = [
    ...messages,
    { role: "assistant", content: JSON.stringify(turn) },
  ];
  return { ok: true, turn, messages: updated };
}

/** Start a coach conversation from the user's first message. Loads the current
 * plan + profile + history and builds the context opener. */
export async function startCoach(firstMessage: string): Promise<CoachResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!firstMessage.trim()) {
    return { ok: false, error: "Type a message to get started." };
  }

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const [row, profile, history, recentDetail] = await Promise.all([
    loadActivePlan(supabase),
    profileSummary(supabase, user.id),
    historySummary(supabase, user.id, now),
    recentDetailedWorkouts(supabase, user.id, now, 10),
  ]);

  let planJson: string | null = null;
  let weekDates: ReturnType<typeof weekDateRanges> = [];
  let planId: string | null = null;
  if (row) {
    const parsed = trainingPlanSchema.safeParse(row.plan);
    if (parsed.success) {
      planJson = JSON.stringify(parsed.data, null, 2);
      weekDates = weekDateRanges(row.start_date, parsed.data.weeks.length);
      planId = row.id;
    }
  }

  const opener = buildCoachContext({
    today,
    planJson,
    weekDates,
    profileSummary: profile,
    historySummary: history,
    recentDetail,
    firstMessage,
  });

  return runCoachTurn(supabase, planId, [{ role: "user", content: opener }]);
}

/** Continue a coach conversation with the user's next reply. The client sends
 * back the running transcript; the plan is re-read on save by planId. */
export async function continueCoach(
  history: ModelMessage[],
  userMessage: string,
): Promise<CoachResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!userMessage.trim()) {
    return { ok: false, error: "Type a message to continue." };
  }

  const row = await loadActivePlan(supabase);
  const messages: ModelMessage[] = [
    ...history,
    { role: "user", content: userMessage },
  ];
  return runCoachTurn(supabase, row?.id ?? null, messages);
}
