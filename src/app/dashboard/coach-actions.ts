"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ModelMessage } from "ai";
import { createClient } from "@/lib/supabase/server";
import { coachTurnSchema, type CoachTurn } from "@/lib/ai/schemas";
import { generateValidatedWithTools } from "@/lib/ai/generate";
import { buildCoachTools } from "@/lib/ai/coach-tools";
import {
  COACH_SYSTEM_PROMPT,
  buildCoachContext,
  planStateBlock,
} from "@/lib/ai/prompts/coach";
import {
  profileSummary,
  historySummary,
  recentDetailedWorkouts,
  exerciseCatalogSummary,
  workoutTypeCatalogSummary,
} from "@/lib/logging/aggregates";

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

/** The active plan row (or null), with everything the coach needs each turn:
 * the dated skeleton, its anchor, and the durable goal/race date. */
type PlanRow = {
  id: string;
  start_date: string;
  plan: unknown;
  target_date: string | null;
  goal_profile: unknown;
};

/** Load the user's active plan row, or null. RLS scopes to the owner. */
async function loadActivePlan(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<PlanRow | null> {
  const { data } = await supabase
    .from("training_plans")
    .select("id, start_date, plan, target_date, goal_profile")
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/** Run one coach turn: call the model, and persist the plan if it changed. The
 * current plan (skeleton, calendar, and goal/race date) is appended to the
 * system prompt EVERY turn so it never scrolls out of the model's context. */
async function runCoachTurn(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  plan: PlanRow | null,
  messages: ModelMessage[],
): Promise<CoachResult> {
  const result = await generateValidatedWithTools({
    feature: "coach",
    schema: coachTurnSchema,
    system: `${COACH_SYSTEM_PROMPT}\n\n${planStateBlock(plan)}`,
    messages,
    // Read-only query tools scoped to THIS user; the model can't widen the scope.
    tools: buildCoachTools(supabase, userId),
  });
  if (!result.ok) return result;
  const turn: CoachTurn = result.object;

  // The coach may update its own durable memory (coach_notes) on any turn. It
  // only ever writes coach_notes — never about_me, which is user-only.
  // Best-effort: a failure here shouldn't break the reply. RLS scopes to owner.
  if (turn.updatedCoachNotes != null) {
    await supabase
      .from("profiles")
      .update({ coach_notes: turn.updatedCoachNotes.trim() })
      .eq("id", userId);
    revalidatePath("/about");
  }

  // If the plan changed, save it. By default start_date is untouched so dates
  // stay anchored; the coach may re-anchor it via newStartDate (e.g. "start a
  // week earlier"), which shifts every plan day by the same offset.
  if (turn.kind === "updatePlan") {
    if (!plan) {
      return { ok: false, error: "There's no active plan to update." };
    }
    const update: {
      plan: typeof turn.plan;
      name: string;
      start_date?: string;
    } = { plan: turn.plan, name: turn.plan.name };
    // Only accept a well-formed YYYY-MM-DD; ignore anything malformed rather
    // than corrupting the anchor the whole plan's dates hang off.
    if (turn.newStartDate && /^\d{4}-\d{2}-\d{2}$/.test(turn.newStartDate)) {
      update.start_date = turn.newStartDate;
    }
    const { error } = await supabase
      .from("training_plans")
      .update(update)
      .eq("id", plan.id); // RLS scopes to the owner
    if (error) {
      return { ok: false, error: `Couldn't save the change: ${error.message}` };
    }
    revalidatePath("/dashboard");
    revalidatePath(`/plan/${plan.id}`);
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
  const [row, profile, history, recentDetail, catalog, typeCatalog] =
    await Promise.all([
      loadActivePlan(supabase),
      profileSummary(supabase, user.id),
      historySummary(supabase, user.id, now),
      recentDetailedWorkouts(supabase, user.id, now, 10),
      exerciseCatalogSummary(supabase),
      workoutTypeCatalogSummary(supabase),
    ]);

  const opener = buildCoachContext({
    today,
    profileSummary: profile,
    historySummary: history,
    recentDetail,
    exerciseCatalog: catalog,
    workoutTypeCatalog: typeCatalog,
    firstMessage,
  });

  return runCoachTurn(supabase, user.id, row, [
    { role: "user", content: opener },
  ]);
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
  return runCoachTurn(supabase, user.id, row, messages);
}
