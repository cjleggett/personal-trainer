"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ModelMessage } from "ai";
import { createClient } from "@/lib/supabase/server";
import {
  intakeTurnSchema,
  trainingPlanSchema,
  type IntakeTurn,
  type GoalProfile,
} from "@/lib/ai/schemas";
import { generateValidated } from "@/lib/ai/generate";
import {
  intakeSystemPrompt,
  buildIntakeOpener,
} from "@/lib/ai/prompts/intake";
import { PLAN_SYSTEM_PROMPT, buildPlanRequest } from "@/lib/ai/prompts/plan";
import { profileSummary, historySummary } from "@/lib/logging/aggregates";
import { nextMonday, weeksUntil } from "@/lib/logging/plan-dates";

/**
 * The intake conversation is stateless on the server: the client holds the
 * running `messages` transcript and sends it back each turn. We append the
 * new turn and return both the parsed turn (for rendering) and the updated
 * transcript (to send back next time). Every model turn is validated against
 * `intakeTurnSchema`, so the client always receives a well-formed union.
 */

export type IntakeResult =
  | { ok: true; turn: IntakeTurn; messages: ModelMessage[] }
  | { ok: false; error: string };

/**
 * Persist durable, goal-independent facts the model surfaced on the ready turn
 * so we never re-ask them. Only non-null fields are written; RLS scopes the
 * update to the owner. Best-effort: a failure here doesn't block intake.
 */
async function persistCoachContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  turn: IntakeTurn,
): Promise<void> {
  if (turn.kind !== "ready") return;
  const patch: { constraints?: string; coach_notes?: string } = {};
  if (turn.updatedConstraints != null)
    patch.constraints = turn.updatedConstraints.trim();
  if (turn.updatedCoachNotes != null)
    patch.coach_notes = turn.updatedCoachNotes.trim();
  if (Object.keys(patch).length === 0) return;

  await supabase.from("profiles").update(patch).eq("id", userId);
}

/** Run one intake turn given the transcript so far and the newest user message. */
async function runIntakeTurn(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  history: ModelMessage[],
  nextUserMessage: string,
): Promise<IntakeResult> {
  const messages: ModelMessage[] = [
    ...history,
    { role: "user", content: nextUserMessage },
  ];

  const result = await generateValidated({
    schema: intakeTurnSchema,
    system: intakeSystemPrompt,
    messages,
  });
  if (!result.ok) return result;
  const object = result.object;

  // On completion, persist any durable facts learned so future intakes and
  // generations start with them (and don't re-ask).
  await persistCoachContext(supabase, userId, object);

  // Persist the model's structured turn back into the transcript as an
  // assistant message so the next turn has full context.
  const updated: ModelMessage[] = [
    ...messages,
    { role: "assistant", content: JSON.stringify(object) },
  ];
  return { ok: true, turn: object, messages: updated };
}

/** Kick off intake from the user's free-text goal. Builds the opener with
 * profile + history context, then runs the first turn. */
export async function startIntake(goalText: string): Promise<IntakeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!goalText.trim()) {
    return { ok: false, error: "Describe your goal to get started." };
  }

  const now = new Date().toISOString();
  const today = now.slice(0, 10); // YYYY-MM-DD
  const [profile, history] = await Promise.all([
    profileSummary(supabase, user.id),
    historySummary(supabase, user.id, now),
  ]);

  const opener = buildIntakeOpener({
    goalText,
    today,
    profileSummary: profile,
    historySummary: history,
  });

  return runIntakeTurn(supabase, user.id, [], opener);
}

/** Continue intake with the user's free-text reply. */
export async function answerIntake(
  history: ModelMessage[],
  userMessage: string,
): Promise<IntakeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!userMessage.trim()) {
    return { ok: false, error: "Type a message to continue." };
  }

  return runIntakeTurn(supabase, user.id, history, userMessage);
}

// ── Plan generation ──────────────────────────────────────────────────────────

/** Horizon for open-ended goals (no target date), in weeks. */
const DEFAULT_HORIZON_WEEKS = 8;
/** Guardrail so a far-off date can't request an enormous plan in one call. */
const MAX_HORIZON_WEEKS = 26;

export type GeneratePlanResult =
  | { ok: true; planId: string }
  | { ok: false; error: string };

/**
 * Generate a dated, periodized plan from a finalized goal profile and save it.
 * The model produces a weekday-labeled skeleton; we own the calendar math
 * (start Monday + week count) so dates are always correct. Concrete workouts are
 * generated later, per day.
 */
export async function generatePlan(
  goalProfile: GoalProfile,
): Promise<GeneratePlanResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const startDate = nextMonday(today);

  // Size the plan: from start Monday to the goal date, or a default horizon.
  let numberOfWeeks = DEFAULT_HORIZON_WEEKS;
  if (goalProfile.targetDate) {
    numberOfWeeks = Math.min(
      MAX_HORIZON_WEEKS,
      weeksUntil(startDate, goalProfile.targetDate),
    );
  }

  const [profile, history] = await Promise.all([
    profileSummary(supabase, user.id),
    historySummary(supabase, user.id, now),
  ]);

  const generated = await generateValidated({
    schema: trainingPlanSchema,
    system: PLAN_SYSTEM_PROMPT,
    prompt: buildPlanRequest({
      today,
      startDate,
      numberOfWeeks,
      goalProfileJson: JSON.stringify(goalProfile, null, 2),
      profileSummary: profile,
      historySummary: history,
    }),
  });
  if (!generated.ok) return generated;
  const plan = generated.object;

  const { data: row, error } = await supabase
    .from("training_plans")
    .insert({
      user_id: user.id,
      name: plan.name,
      start_date: startDate,
      target_date: goalProfile.targetDate,
      goal_profile: goalProfile,
      plan,
    })
    .select("id")
    .single();

  if (error || !row) {
    return { ok: false, error: error?.message ?? "Could not save the plan." };
  }

  revalidatePath("/plan");
  return { ok: true, planId: row.id };
}

/**
 * Delete a training plan. RLS scopes the delete to the owner, so a bad/foreign
 * id simply matches nothing. Workouts logged against the plan are preserved —
 * `workouts.plan_id` is `on delete set null`, so the history stays, just
 * unlinked. Redirects to the dashboard on success.
 */
export async function deletePlan(planId: string): Promise<{ error: string } | void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("training_plans")
    .delete()
    .eq("id", planId); // RLS ensures only the owner's row matches
  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/plan");
  redirect("/dashboard");
}
