import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Compact, LLM-friendly summaries of a user's training history and profile.
 *
 * These feed the AI intake/plan prompts as plain text. We lean on the generated
 * summary columns (total_distance_m, total_duration_s, total_load, ...) so the
 * roll-ups stay in SQL and we ship the model a small, cheap blob rather than raw
 * sets. Everything is phrased for a human coach to read.
 */

type Client = SupabaseClient<Database>;

const DAYS = 90;
const MS_PER_DAY = 86_400_000;

/** Summarize the user's profile row into a short block, or a "no profile" note. */
export async function profileSummary(
  supabase: Client,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("goals, experience_level, equipment, constraints, coach_notes")
    .eq("id", userId)
    .single();

  if (!data) return "No profile details on file.";

  const lines: string[] = [];
  if (data.experience_level) lines.push(`- Experience level: ${data.experience_level}`);
  if (data.goals) lines.push(`- Stated goals: ${data.goals}`);
  if (data.equipment) lines.push(`- Equipment available: ${data.equipment}`);
  if (data.constraints) lines.push(`- Constraints/injuries: ${data.constraints}`);
  if (data.coach_notes) lines.push(`- Coach notes (durable preferences/context): ${data.coach_notes}`);
  return lines.length ? lines.join("\n") : "No profile details on file.";
}

/**
 * Summarize the last ~90 days of training: cadence, and per-activity-type
 * volume. `now` is passed in (ISO) so this stays deterministic and testable —
 * callers provide `new Date().toISOString()`.
 */
export async function historySummary(
  supabase: Client,
  userId: string,
  now: string,
): Promise<string> {
  const since = new Date(new Date(now).getTime() - DAYS * MS_PER_DAY).toISOString();

  const { data: workouts } = await supabase
    .from("workouts")
    .select(
      `id, workout_type, performed_at,
       exercise_instances ( total_load, total_distance_m, total_duration_s, total_elevation_m )`,
    )
    .eq("user_id", userId)
    .gte("performed_at", since)
    .order("performed_at", { ascending: false });

  if (!workouts || workouts.length === 0) {
    return "No workouts logged in the last 90 days.";
  }

  // Roll up by workout_type: session count + summed distance/duration/load.
  type Agg = { sessions: number; distanceM: number; durationS: number; load: number };
  const byType = new Map<string, Agg>();
  for (const w of workouts) {
    const type = w.workout_type?.trim() || "Other";
    const agg = byType.get(type) ?? { sessions: 0, distanceM: 0, durationS: 0, load: 0 };
    agg.sessions += 1;
    for (const inst of w.exercise_instances ?? []) {
      agg.distanceM += inst.total_distance_m ?? 0;
      agg.durationS += inst.total_duration_s ?? 0;
      agg.load += inst.total_load ?? 0;
    }
    byType.set(type, agg);
  }

  const weeks = DAYS / 7;
  const perWeek = (workouts.length / weeks).toFixed(1);

  const typeLines = [...byType.entries()]
    .sort((a, b) => b[1].sessions - a[1].sessions)
    .map(([type, a]) => {
      const bits: string[] = [`${a.sessions} session${a.sessions === 1 ? "" : "s"}`];
      if (a.distanceM > 0) bits.push(`${(a.distanceM / 1000).toFixed(1)} km total`);
      if (a.durationS > 0) bits.push(`${Math.round(a.durationS / 60)} min total`);
      if (a.load > 0) bits.push(`${Math.round(a.load).toLocaleString()} kg·reps total load`);
      return `- ${type}: ${bits.join(", ")}`;
    });

  return [
    `Over the last ${DAYS} days: ${workouts.length} workouts (~${perWeek}/week).`,
    "By activity type:",
    ...typeLines,
  ].join("\n");
}
