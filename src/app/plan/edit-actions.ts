"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ModelMessage } from "ai";
import { createClient } from "@/lib/supabase/server";
import {
  planEditTurnSchema,
  trainingPlanSchema,
  type PlanEditTurn,
} from "@/lib/ai/schemas";
import { generateValidatedWithTools } from "@/lib/ai/generate";
import { buildCoachTools } from "@/lib/ai/coach-tools";
import { PLAN_EDIT_SYSTEM_PROMPT } from "@/lib/ai/prompts/plan-edit";
import { buildCoachContext } from "@/lib/ai/prompts/coach";
import {
  profileSummary,
  historySummary,
  recentDetailedWorkouts,
  exerciseCatalogSummary,
  workoutTypeCatalogSummary,
} from "@/lib/logging/aggregates";
import { weekDateRanges } from "@/lib/logging/plan-dates";

/**
 * The plan-edit chat lives on the plan page and refines ONE specific plan (the
 * one being viewed, identified by `planId`). Like the dashboard coach it's
 * stateless on the server: the client holds the running `messages` transcript
 * and sends it back each turn. Every turn is validated against
 * `planEditTurnSchema` (a reply / updatePlan union). On an updatePlan we save
 * the revised plan to THIS row — keeping start_date anchored unless the user
 * asked to move it — and revalidate the page so the timeline reflects the edit.
 *
 * It reuses the coach's context builder and tools, so edits can be grounded in
 * the athlete's real history; it just swaps in a narrower system prompt (no
 * workout-drafting) and a schema with only the two plan-relevant actions.
 */

export type PlanEditResult =
  | { ok: true; turn: PlanEditTurn; messages: ModelMessage[] }
  | { ok: false; error: string };

/** Load one plan the user owns by id. RLS scopes to the owner, so a foreign or
 * missing id simply returns null. */
async function loadPlan(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string,
) {
  const { data } = await supabase
    .from("training_plans")
    .select("id, start_date, plan")
    .eq("id", planId)
    .maybeSingle();
  return data;
}

/** Run one plan-edit turn: call the model, and persist the plan if it changed. */
async function runPlanEditTurn(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  planId: string,
  messages: ModelMessage[],
): Promise<PlanEditResult> {
  const result = await generateValidatedWithTools({
    feature: "plan-edit",
    schema: planEditTurnSchema,
    system: PLAN_EDIT_SYSTEM_PROMPT,
    messages,
    // Read-only history + catalog tools scoped to THIS user; same as the coach.
    tools: buildCoachTools(supabase, userId),
  });
  if (!result.ok) return result;
  const turn: PlanEditTurn = result.object;

  // The coach may update its own durable memory (coach_notes) on any turn.
  // Best-effort: a failure here shouldn't break the reply. RLS scopes to owner.
  if (turn.updatedCoachNotes != null) {
    await supabase
      .from("profiles")
      .update({ coach_notes: turn.updatedCoachNotes.trim() })
      .eq("id", userId);
    revalidatePath("/about");
  }

  // If the plan changed, save it to the row being edited. By default start_date
  // is untouched so dates stay anchored; the user may re-anchor it via
  // newStartDate, which shifts every plan day by the same offset.
  if (turn.kind === "updatePlan") {
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

/** Start a plan-edit conversation from the user's first message. Loads the plan
 * being viewed + profile + history and builds the context opener. */
export async function startPlanEdit(
  planId: string,
  firstMessage: string,
): Promise<PlanEditResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!firstMessage.trim()) {
    return { ok: false, error: "Type a message to get started." };
  }

  const row = await loadPlan(supabase, planId);
  if (!row) return { ok: false, error: "That plan could not be found." };

  const parsed = trainingPlanSchema.safeParse(row.plan);
  if (!parsed.success) {
    return { ok: false, error: "This plan's data is malformed." };
  }

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const [profile, history, recentDetail, catalog, typeCatalog] =
    await Promise.all([
      profileSummary(supabase, user.id),
      historySummary(supabase, user.id, now),
      recentDetailedWorkouts(supabase, user.id, now, 10),
      exerciseCatalogSummary(supabase),
      workoutTypeCatalogSummary(supabase),
    ]);

  const opener = buildCoachContext({
    today,
    planJson: JSON.stringify(parsed.data, null, 2),
    weekDates: weekDateRanges(row.start_date, parsed.data.weeks.length),
    profileSummary: profile,
    historySummary: history,
    recentDetail,
    exerciseCatalog: catalog,
    workoutTypeCatalog: typeCatalog,
    firstMessage,
  });

  return runPlanEditTurn(supabase, user.id, planId, [
    { role: "user", content: opener },
  ]);
}

/** Continue a plan-edit conversation with the user's next reply. The client
 * sends back the running transcript; the plan is re-read on save by planId. */
export async function continuePlanEdit(
  planId: string,
  history: ModelMessage[],
  userMessage: string,
): Promise<PlanEditResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!userMessage.trim()) {
    return { ok: false, error: "Type a message to continue." };
  }

  const messages: ModelMessage[] = [
    ...history,
    { role: "user", content: userMessage },
  ];
  return runPlanEditTurn(supabase, user.id, planId, messages);
}
