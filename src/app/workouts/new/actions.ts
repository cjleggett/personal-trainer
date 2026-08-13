"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  METRIC_FIELDS,
  todayTitlePrefix,
  type MeasurementType,
} from "@/lib/logging/metrics";

/** A group of identical sets: the metric values plus how many times performed.
 * e.g. { count: 3, metrics: { weight: 100, reps: 5 } } = 3×(100kg × 5). */
export type SetGroup = {
  count: number;
  metrics: Record<string, number>;
};

/** One exercise-instance the client wants to save. Metric values are in display
 * units (e.g. km, minutes); we convert to canonical before storing. */
export type InstancePayload = {
  exerciseId: string;
  measurementType: MeasurementType;
  setGroups: SetGroup[];
};

export type SavePayload = {
  title?: string;
  workoutType?: string;
  notes?: string;
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

export async function saveWorkout(payload: SavePayload) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const instances = payload.instances.filter((i) => i.setGroups.length > 0);
  if (instances.length === 0) {
    return { error: "Add at least one exercise with a set before saving." };
  }

  // 1. Create the workout session. If the user left the title blank, autofill
  //    "MM/DD/YYYY Type" (e.g. "08/13/2026 Run"). Server-side date is a
  //    reasonable default; the client also autofills so the user sees it live.
  const workoutType = payload.workoutType?.trim() || null;
  const title =
    payload.title?.trim() ||
    [todayTitlePrefix(), workoutType].filter(Boolean).join(" ") ||
    null;

  const { data: workout, error: wErr } = await supabase
    .from("workouts")
    .insert({
      user_id: user.id,
      title,
      workout_type: workoutType,
      notes: payload.notes?.trim() || null,
    })
    .select("id")
    .single();
  if (wErr || !workout) {
    return { error: wErr?.message ?? "Could not create workout." };
  }

  // 2. Insert all exercise-instances. Never write the generated total_* columns.
  //    Expand each set-group (count + metrics) into `count` individual set
  //    objects, so the stored `sets` array is a flat list of actual sets and the
  //    generated summary columns aggregate correctly.
  const rows = instances.map((inst, idx) => ({
    workout_id: workout.id,
    exercise_id: inst.exerciseId,
    user_id: user.id,
    position: idx,
    sets: inst.setGroups.flatMap((g) => {
      const canonical = toCanonicalSet(inst.measurementType, g.metrics);
      const n = Math.max(1, Math.floor(g.count) || 1);
      return Array.from({ length: n }, () => ({ ...canonical }));
    }),
  }));

  const { error: iErr } = await supabase.from("exercise_instances").insert(rows);
  if (iErr) {
    // Roll back the orphaned workout so a failed save leaves no empty session.
    await supabase.from("workouts").delete().eq("id", workout.id);
    return { error: iErr.message };
  }

  redirect("/dashboard");
}
