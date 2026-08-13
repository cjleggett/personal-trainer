"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  METRIC_FIELDS,
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
  workoutType?: string;
  notes?: string;
  /** ISO date (YYYY-MM-DD) of when the workout happened. Defaults to today. */
  performedOn?: string;
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
  const workoutType = payload.workoutType?.trim() || null;
  const datePrefix = payload.performedOn
    ? // Format the chosen YYYY-MM-DD as MM/DD/YYYY for the autofilled title.
      (() => {
        const [y, m, d] = payload.performedOn!.split("-");
        return `${m}/${d}/${y}`;
      })()
    : todayTitlePrefix();
  const title =
    payload.title?.trim() ||
    [datePrefix, workoutType].filter(Boolean).join(" ") ||
    null;
  // Store performed_at at local noon of the chosen day to avoid TZ date-shift.
  const performedAt = payload.performedOn
    ? new Date(`${payload.performedOn}T12:00:00`).toISOString()
    : undefined; // let the DB default (now()) apply on create
  return { workoutType, title, performedAt };
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

  const { workoutType, title, performedAt } = buildWorkoutFields(payload);

  const { data: workout, error: wErr } = await supabase
    .from("workouts")
    .insert({
      user_id: user.id,
      title,
      workout_type: workoutType,
      notes: payload.notes?.trim() || null,
      ...(performedAt ? { performed_at: performedAt } : {}),
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

  const { workoutType, title, performedAt } = buildWorkoutFields(payload);

  const { error: wErr } = await supabase
    .from("workouts")
    .update({
      title,
      workout_type: workoutType,
      notes: payload.notes?.trim() || null,
      ...(performedAt ? { performed_at: performedAt } : {}),
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
  redirect(`/workouts/${workoutId}`);
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
