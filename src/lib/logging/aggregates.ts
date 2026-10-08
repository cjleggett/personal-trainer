import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  collapseSets,
  formatSet,
  effectiveWorkoutDurationS,
  type MeasurementType,
  type StoredSet,
} from "@/lib/logging/metrics";

/**
 * Compact, LLM-friendly summaries of a user's training history and profile.
 *
 * These feed the AI intake/plan prompts as plain text. Aggregate summaries lean
 * on the generated summary columns (total_distance_m, total_duration_s,
 * total_load, ...) so the roll-ups stay in SQL and we ship the model a small,
 * cheap blob rather than raw sets. The detailed report (short window) instead
 * renders per-exercise sets + notes so the model can see recent specifics.
 * Everything is phrased for a human coach to read.
 */

type Client = SupabaseClient<Database>;

const MS_PER_DAY = 86_400_000;

/** Days back from `now` (ISO) as an ISO cutoff for `performed_at` filters. */
function cutoff(now: string, days: number): string {
  return new Date(new Date(now).getTime() - days * MS_PER_DAY).toISOString();
}

/**
 * List the exercise catalog the athlete can log, grouped by measurement type so
 * the coach knows what already exists before recommending (and whether it needs
 * to create a new one). The catalog is global, so no user scoping is needed.
 */
export async function exerciseCatalogSummary(supabase: Client): Promise<string> {
  const { data } = await supabase
    .from("exercises")
    .select("name, measurement_type")
    .order("name", { ascending: true });

  if (!data || data.length === 0) return "The exercise catalog is empty.";

  const labels: Record<string, string> = {
    weight_reps: "Weight + reps",
    reps_only: "Reps only",
    distance_time: "Distance + time",
    time_only: "Timed",
  };
  const byType = new Map<string, string[]>();
  for (const e of data) {
    const list = byType.get(e.measurement_type) ?? [];
    list.push(e.name);
    byType.set(e.measurement_type, list);
  }
  const lines = [...byType.entries()].map(
    ([type, names]) => `- ${labels[type] ?? type}: ${names.join(", ")}`,
  );
  return [`Exercises already in the catalog (${data.length}):`, ...lines].join("\n");
}

/**
 * List the workout types the athlete can pick, with each type's emoji, so the
 * coach knows which already exist before drafting a workout (and whether it needs
 * to create a new one). Global catalog, so no user scoping. Parallels
 * exerciseCatalogSummary.
 */
export async function workoutTypeCatalogSummary(
  supabase: Client,
): Promise<string> {
  const { data } = await supabase
    .from("workout_types")
    .select("name, emoji")
    .order("name", { ascending: true });

  if (!data || data.length === 0) return "No workout types defined yet.";
  const names = data.map((t) => `${t.emoji} ${t.name}`).join(", ");
  return `Workout types already in the catalog (${data.length}): ${names}`;
}

/** Summarize the user's profile row into a short block, or a "no profile" note. */
export async function profileSummary(
  supabase: Client,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select(
      "display_name, birthday, goals, experience_level, equipment, constraints, about_me, coach_notes",
    )
    .eq("id", userId)
    .single();

  if (!data) return "No profile details on file.";

  const lines: string[] = [];
  if (data.display_name) lines.push(`- Name: ${data.display_name}`);
  if (data.birthday) lines.push(`- Birthday: ${data.birthday}`);
  if (data.experience_level) lines.push(`- Experience level: ${data.experience_level}`);
  if (data.goals) lines.push(`- Stated goals: ${data.goals}`);
  if (data.equipment) lines.push(`- Equipment available: ${data.equipment}`);
  if (data.constraints) lines.push(`- Constraints/injuries: ${data.constraints}`);
  // About me is user-authored and read-only to the agent; coach notes are the
  // agent's own durable memory (both editable in the About Me page).
  if (data.about_me) lines.push(`- About me (written by the athlete; do not overwrite): ${data.about_me}`);
  if (data.coach_notes) lines.push(`- Coach notes (your durable memory): ${data.coach_notes}`);
  return lines.length ? lines.join("\n") : "No profile details on file.";
}

/**
 * Summarize the last `days` of training: cadence, and per-activity-type volume.
 * `now` is passed in (ISO) so this stays deterministic and testable — callers
 * provide `new Date().toISOString()`. `days` defaults to 90.
 */
export async function historySummary(
  supabase: Client,
  userId: string,
  now: string,
  days = 90,
): Promise<string> {
  const { data: workouts } = await supabase
    .from("workouts")
    .select(
      `id, performed_at, duration_s, workout_types ( name ),
       exercise_instances ( total_load, total_distance_m, total_duration_s, total_elevation_m )`,
    )
    .eq("user_id", userId)
    .gte("performed_at", cutoff(now, days))
    .order("performed_at", { ascending: false });

  if (!workouts || workouts.length === 0) {
    return `No workouts logged in the last ${days} days.`;
  }

  // Roll up by workout type: session count + summed distance/duration/load/elev.
  type Agg = {
    sessions: number;
    distanceM: number;
    durationS: number;
    load: number;
    elevationM: number;
  };
  const byType = new Map<string, Agg>();
  for (const w of workouts) {
    const type =
      (w.workout_types as { name: string } | null)?.name?.trim() || "Other";
    const agg =
      byType.get(type) ??
      { sessions: 0, distanceM: 0, durationS: 0, load: 0, elevationM: 0 };
    agg.sessions += 1;
    for (const inst of w.exercise_instances ?? []) {
      agg.distanceM += inst.total_distance_m ?? 0;
      agg.load += inst.total_load ?? 0;
      agg.elevationM += inst.total_elevation_m ?? 0;
    }
    // A hand-entered session time overrides the per-exercise rollup (e.g. a gym
    // workout whose exercises don't carry time); else sum the instances.
    agg.durationS += effectiveWorkoutDurationS(
      w.duration_s,
      (w.exercise_instances ?? []).map((i) => i.total_duration_s),
    );
    byType.set(type, agg);
  }

  const perWeek = (workouts.length / (days / 7)).toFixed(1);

  const typeLines = [...byType.entries()]
    .sort((a, b) => b[1].sessions - a[1].sessions)
    .map(([type, a]) => {
      const bits: string[] = [`${a.sessions} session${a.sessions === 1 ? "" : "s"}`];
      // Imperial to match the app's display units (see metrics.ts).
      if (a.distanceM > 0) bits.push(`${(a.distanceM / 1609.344).toFixed(1)} mi total`);
      if (a.durationS > 0) bits.push(`${Math.round(a.durationS / 60)} min total`);
      if (a.elevationM > 0) bits.push(`${Math.round(a.elevationM / 0.3048).toLocaleString()} ft climb`);
      if (a.load > 0) bits.push(`${Math.round(a.load / 0.45359237).toLocaleString()} lb·reps total load`);
      return `- ${type}: ${bits.join(", ")}`;
    });

  return [
    `Over the last ${days} days: ${workouts.length} workouts (~${perWeek}/week).`,
    "By activity type:",
    ...typeLines,
  ].join("\n");
}

/**
 * Detailed per-workout report for the last `days` (default 10): date, type,
 * title, each exercise with collapsed sets in display units, and the session
 * notes. This is the richer, higher-token view — reserve it for a short window.
 */
export async function recentDetailedWorkouts(
  supabase: Client,
  userId: string,
  now: string,
  days = 10,
): Promise<string> {
  const { data: workouts } = await supabase
    .from("workouts")
    .select(
      `performed_at, title, notes, workout_types ( name ),
       exercise_instances ( position, sets, exercises ( name, measurement_type ) )`,
    )
    .eq("user_id", userId)
    .gte("performed_at", cutoff(now, days))
    .order("performed_at", { ascending: false });

  if (!workouts || workouts.length === 0) {
    return `No workouts logged in the last ${days} days.`;
  }

  const blocks = workouts.map((w) => {
    const date = w.performed_at.slice(0, 10);
    const typeName = (w.workout_types as { name: string } | null)?.name?.trim();
    const header = `${date} — ${w.title?.trim() || typeName || "Workout"}`;

    const instances = [...(w.exercise_instances ?? [])].sort(
      (a, b) => a.position - b.position,
    );
    const exerciseLines = instances.map((inst) => {
      const name = inst.exercises?.name ?? "Exercise";
      const mtype = inst.exercises?.measurement_type as MeasurementType | undefined;
      const sets = (inst.sets ?? []) as StoredSet[];
      if (!mtype || sets.length === 0) return `  • ${name}`;
      // Collapse identical sets (e.g. 3×"8 reps @ 100lb") for readability.
      const grouped = collapseSets(sets)
        .map(({ set, count }) => {
          const text = formatSet(mtype, set);
          return count > 1 ? `${count}×${text}` : text;
        })
        .join(", ");
      return `  • ${name}: ${grouped}`;
    });

    const lines = [header, ...exerciseLines];
    if (w.notes?.trim()) lines.push(`  Notes: ${w.notes.trim()}`);
    return lines.join("\n");
  });

  return [
    `Detailed log of the last ${days} days (${workouts.length} workouts):`,
    ...blocks,
  ].join("\n\n");
}
