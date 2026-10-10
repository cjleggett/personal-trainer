"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  METRIC_FIELDS,
  METERS_PER_MILE,
  todayTitlePrefix,
  type MeasurementType,
} from "@/lib/logging/metrics";

/** A group of identical sets: metric values + how many times performed. */
export type SetGroup = { count: number; metrics: Record<string, number> };

/** One exercise-instance to save. Metric values are in DISPLAY units (km, min);
 * converted to canonical (m, s) before storing. */
export type InstancePayload = {
  exerciseId: string;
  measurementType: MeasurementType;
  setGroups: SetGroup[];
};

export type SavePayload = {
  title?: string;
  /** The chosen workout type's catalog id (null/undefined = no type). */
  workoutTypeId?: string;
  /** The chosen type's name, carried from the client so we can build the default
   * title without a DB round-trip. Not stored directly — the FK id is. */
  workoutTypeName?: string;
  notes?: string;
  /**
   * Optional top-level session duration in SECONDS, entered by hand for sessions
   * where per-exercise time doesn't make sense (gym, a class). Overrides the
   * per-exercise rollup when set; omit/undefined (or null on edit) = none, let
   * the rollup stand. Only surfaced for non-cardio types in the form.
   */
  durationS?: number | null;
  /** ISO date (YYYY-MM-DD) of when the workout happened. Defaults to today. */
  performedOn?: string;
  /**
   * The training-plan day this workout fulfills, if any. Both must be set to
   * link; both null/absent means no link (or clear an existing one on update).
   * The link is intentionally independent of `performedOn` — a workout can be
   * logged on a different day than the plan day it satisfies (e.g. a vague
   * "cross-training" day fulfilled by a specific "rollerblading" session).
   */
  planId?: string | null;
  planDayDate?: string | null; // YYYY-MM-DD
  /**
   * Optional running shoes (running workouts only). Either an existing shoe's id
   * (`shoeId`), or a new shoe to create by name with an optional starting
   * mileage in miles (`shoeName` + `shoeStartingMi`). Omit all for no shoe.
   */
  shoeId?: string;
  shoeName?: string;
  shoeStartingMi?: number;
  instances: InstancePayload[];
};

/** Convert a display-unit set object to canonical stored keys, dropping blanks. */
function toCanonicalSet(
  measurementType: MeasurementType,
  raw: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const field of METRIC_FIELDS[measurementType]) {
    const v = raw[field.key];
    if (v === undefined || v === null || Number.isNaN(v)) continue;
    out[field.key] = field.factor ? v * field.factor : v;
  }
  return out;
}

/** Build the workout column values shared by create and update. */
function buildWorkoutFields(payload: SavePayload) {
  const workoutTypeId = payload.workoutTypeId || null;
  const workoutTypeName = payload.workoutTypeName?.trim() || null;
  const datePrefix = payload.performedOn
    ? // Format the chosen YYYY-MM-DD as MM/DD/YYYY for the autofilled title.
      (() => {
        const [y, m, d] = payload.performedOn!.split("-");
        return `${m}/${d}/${y}`;
      })()
    : todayTitlePrefix();
  const title =
    payload.title?.trim() ||
    [datePrefix, workoutTypeName].filter(Boolean).join(" ") ||
    null;
  // Store performed_at at local noon of the chosen day to avoid TZ date-shift.
  const performedAt = payload.performedOn
    ? new Date(`${payload.performedOn}T12:00:00`).toISOString()
    : undefined; // let the DB default (now()) apply on create
  return { workoutTypeId, title, performedAt };
}

/** Normalize the optional manual duration to a positive whole second count, or
 * null (blank/zero/invalid). Returned on both create and update so an edit that
 * clears the field writes null, dropping the override back to the rollup. */
function durationColumn(payload: SavePayload): number | null {
  const s = payload.durationS;
  if (s == null || !Number.isFinite(s) || s <= 0) return null;
  return Math.round(s);
}

/**
 * Normalize the optional plan link into the two columns stored on a workout. A
 * link requires BOTH ids; anything else resolves to no link (null/null), so an
 * update can clear a link by sending neither. Returns null columns rather than
 * omitting them, so update overwrites a stale link instead of leaving it.
 */
function planLinkFields(payload: SavePayload): {
  plan_id: string | null;
  plan_day_date: string | null;
} {
  const linked = !!payload.planId && !!payload.planDayDate;
  return {
    plan_id: linked ? payload.planId! : null,
    plan_day_date: linked ? payload.planDayDate! : null,
  };
}

/** Expand set-groups into flat canonical set objects for one instance row. */
function instanceRows(
  workoutId: string,
  userId: string,
  instances: InstancePayload[],
) {
  return instances.map((inst, idx) => ({
    workout_id: workoutId,
    exercise_id: inst.exerciseId,
    user_id: userId,
    position: idx,
    sets: inst.setGroups.flatMap((g) => {
      const canonical = toCanonicalSet(inst.measurementType, g.metrics);
      const n = Math.max(1, Math.floor(g.count) || 1);
      return Array.from({ length: n }, () => ({ ...canonical }));
    }),
  }));
}

/**
 * Resolve the payload's optional shoe into a `shoe_id` to store on the workout:
 *   - `shoeId` set        → use it (an existing pair; RLS guards ownership).
 *   - `shoeName` set      → create a new pair (starting mileage mi → meters).
 *   - neither             → null (no shoe attached).
 * Returns `{ shoeId }` on success, or `{ error }` if a create fails. Creating a
 * shoe is best-effort-validated: a blank name resolves to no shoe rather than an
 * error, so an accidentally-empty field never blocks saving the workout.
 */
async function resolveShoeId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  payload: SavePayload,
): Promise<{ shoeId: string | null } | { error: string }> {
  if (payload.shoeId) return { shoeId: payload.shoeId };

  const name = payload.shoeName?.trim();
  if (!name) return { shoeId: null };

  const startingM =
    payload.shoeStartingMi && payload.shoeStartingMi > 0
      ? payload.shoeStartingMi * METERS_PER_MILE
      : 0;

  const { data, error } = await supabase
    .from("shoes")
    .insert({ user_id: userId, name, starting_distance_m: startingM })
    .select("id")
    .single();
  if (error || !data) {
    return { error: error?.message ?? "Could not save the shoes." };
  }
  return { shoeId: data.id };
}

export async function createWorkout(payload: SavePayload) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const instances = payload.instances.filter((i) => i.setGroups.length > 0);
  if (instances.length === 0) {
    return { error: "Add at least one exercise with a set before saving." };
  }

  const { workoutTypeId, title, performedAt } = buildWorkoutFields(payload);

  const shoe = await resolveShoeId(supabase, user.id, payload);
  if ("error" in shoe) return { error: shoe.error };

  const { data: workout, error: wErr } = await supabase
    .from("workouts")
    .insert({
      user_id: user.id,
      title,
      workout_type_id: workoutTypeId,
      notes: payload.notes?.trim() || null,
      duration_s: durationColumn(payload),
      shoe_id: shoe.shoeId,
      ...(performedAt ? { performed_at: performedAt } : {}),
      ...planLinkFields(payload),
    })
    .select("id")
    .single();
  if (wErr || !workout) {
    return { error: wErr?.message ?? "Could not create workout." };
  }

  const { error: iErr } = await supabase
    .from("exercise_instances")
    .insert(instanceRows(workout.id, user.id, instances));
  if (iErr) {
    await supabase.from("workouts").delete().eq("id", workout.id);
    return { error: iErr.message };
  }

  revalidatePath("/workouts");
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function updateWorkout(workoutId: string, payload: SavePayload) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const instances = payload.instances.filter((i) => i.setGroups.length > 0);
  if (instances.length === 0) {
    return { error: "Add at least one exercise with a set before saving." };
  }

  const { workoutTypeId, title, performedAt } = buildWorkoutFields(payload);

  const shoe = await resolveShoeId(supabase, user.id, payload);
  if ("error" in shoe) return { error: shoe.error };

  const { error: wErr } = await supabase
    .from("workouts")
    .update({
      title,
      workout_type_id: workoutTypeId,
      notes: payload.notes?.trim() || null,
      duration_s: durationColumn(payload), // null clears a previously-set override
      shoe_id: shoe.shoeId, // null clears a previously-attached pair
      ...(performedAt ? { performed_at: performedAt } : {}),
      ...planLinkFields(payload), // null columns clear a previously-linked plan day
    })
    .eq("id", workoutId); // RLS ensures only the owner's row matches
  if (wErr) return { error: wErr.message };

  // Replace instances wholesale: simplest correct approach for an edit. Delete
  // existing rows, then insert the new set. (RLS scopes the delete to the user.)
  const { error: delErr } = await supabase
    .from("exercise_instances")
    .delete()
    .eq("workout_id", workoutId);
  if (delErr) return { error: delErr.message };

  const { error: iErr } = await supabase
    .from("exercise_instances")
    .insert(instanceRows(workoutId, user.id, instances));
  if (iErr) return { error: iErr.message };

  revalidatePath("/workouts");
  revalidatePath(`/workouts/${workoutId}`);
  revalidatePath("/dashboard"); // a changed/cleared plan link affects "Logged" status
  redirect(`/workouts/${workoutId}`);
}

/** A workout type as the picker needs it. */
export type WorkoutTypeOption = { id: string; name: string; emoji: string };

/**
 * Add a new workout type to the shared global catalog (mirrors create_exercise:
 * reuse an existing row by case-insensitive name rather than duplicating, backed
 * by the ci-unique index). Any authenticated user may add one; it becomes a
 * selectable type for everyone. Returns the new/reused option, or an error.
 */
export async function createWorkoutType(
  name: string,
  emoji: string,
): Promise<{ type: WorkoutTypeOption } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const cleanName = name.trim();
  const cleanEmoji = emoji.trim();
  if (!cleanName) return { error: "Enter a name for the workout type." };
  if (!cleanEmoji) return { error: "Pick an emoji for the workout type." };

  // Reuse an existing type by case-insensitive name (also backstopped by index).
  const { data: existing } = await supabase
    .from("workout_types")
    .select("id, name, emoji")
    .ilike("name", cleanName)
    .limit(1)
    .maybeSingle();
  if (existing) return { type: existing };

  const { data: created, error } = await supabase
    .from("workout_types")
    .insert({ name: cleanName, emoji: cleanEmoji })
    .select("id, name, emoji")
    .single();

  if (error) {
    // A race on the unique index surfaces here; re-fetch and reuse.
    const { data: raced } = await supabase
      .from("workout_types")
      .select("id, name, emoji")
      .ilike("name", cleanName)
      .limit(1)
      .maybeSingle();
    if (raced) return { type: raced };
    return { error: `Couldn't create the type: ${error.message}` };
  }

  revalidatePath("/workouts");
  return { type: created };
}

export async function deleteWorkout(workoutId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // exercise_instances cascade-delete via FK; RLS scopes to the owner.
  const { error } = await supabase.from("workouts").delete().eq("id", workoutId);
  if (error) return { error: error.message };

  revalidatePath("/workouts");
  redirect("/workouts");
}
