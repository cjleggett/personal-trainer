import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  collapseSets,
  formatSet,
  KG_PER_LB,
  METERS_PER_MILE,
  METERS_PER_FOOT,
  type MeasurementType,
  type StoredSet,
} from "@/lib/logging/metrics";

/**
 * TOOLS FOR THE COACH.
 *
 * The coach's opening context only carries fixed summaries (last ~10 days in
 * detail, 90-day aggregates), so on its own it can't answer specific historical
 * questions or add missing exercises. This module gives it:
 *   - query_training_history — read-only queries over the athlete's OWN logs
 *     (longest run, heaviest squat, totals over a date range, …).
 *   - create_exercise — add a new exercise to the SHARED global catalog so it
 *     becomes a selectable logging option for everyone.
 *
 * SAFETY: the tools are built by `buildCoachTools(supabase, userId)` with
 * `userId` captured in a closure. The MODEL never supplies a user id — the read
 * query hardcodes `.eq("user_id", userId)`, and RLS is defense-in-depth. Both
 * are STRUCTURED tools (Zod-validated params we translate into Supabase calls),
 * never raw SQL. create_exercise can only INSERT a global catalog row (the one
 * write the RLS policy allows an authenticated user); it cannot touch workouts,
 * profiles, plans, or anyone's logged data, and global rows can't be edited or
 * deleted via the app.
 */

type Client = SupabaseClient<Database>;

/** The summary metric a query sorts/aggregates on, mapped to its stored column
 * and a display converter (storage is SI; the app shows imperial — see
 * metrics.ts). `date` sorts on the parent workout's performed_at. */
const METRICS = {
  distance: { column: "total_distance_m", unit: "mi", perDisplay: METERS_PER_MILE },
  duration: { column: "total_duration_s", unit: "min", perDisplay: 60 },
  load: { column: "total_load", unit: "lb·reps", perDisplay: KG_PER_LB },
  elevation: { column: "total_elevation_m", unit: "ft", perDisplay: METERS_PER_FOOT },
} as const;

type MetricKey = keyof typeof METRICS;

/** Cap on rows scanned per query. A personal user logs far fewer than this; the
 * cap just bounds token/latency cost and is surfaced to the model when hit. */
const SCAN_CAP = 2000;

const queryParams = z.object({
  exerciseName: z
    .string()
    .optional()
    .describe(
      "Case-insensitive substring of the exercise name to filter to, e.g. 'Running', 'Squat', 'Bench'. Omit to include all exercises.",
    ),
  workoutType: z
    .string()
    .optional()
    .describe(
      "Case-insensitive substring of the workout type to filter to, e.g. 'Run', 'Gym'. Omit for all types.",
    ),
  muscleGroup: z
    .string()
    .optional()
    .describe("Case-insensitive substring of the muscle group, e.g. 'legs'. Omit for all."),
  dateFrom: z
    .string()
    .optional()
    .describe("Only include workouts on or after this date (YYYY-MM-DD)."),
  dateTo: z
    .string()
    .optional()
    .describe("Only include workouts on or before this date (YYYY-MM-DD)."),
  sortBy: z
    .enum(["date", "distance", "duration", "load", "elevation"])
    .default("date")
    .describe(
      "What to sort by. Use a metric (e.g. 'distance') to find the biggest/smallest — 'longest run' is sortBy:'distance', sortDir:'desc', limit:1.",
    ),
  sortDir: z.enum(["desc", "asc"]).default("desc").describe("Sort direction."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Max rows to return when aggregate is 'none'."),
  aggregate: z
    .enum(["none", "sum", "count", "avg", "max", "min"])
    .default("none")
    .describe(
      "Return a single computed value over the chosen metric instead of rows. 'count' = how many matching exercises (metric ignored); 'sum' = total (e.g. total miles); 'avg'/'max'/'min' over the metric. Use 'none' to get the actual matching workouts.",
    ),
  metric: z
    .enum(["distance", "duration", "load", "elevation"])
    .default("distance")
    .describe("Which metric sum/avg/max/min aggregates over. Ignored for 'count' and for sortBy."),
});

/** A joined instance row as selected below. */
type Row = {
  total_load: number | null;
  total_distance_m: number | null;
  total_duration_s: number | null;
  total_elevation_m: number | null;
  sets: unknown;
  notes: string | null;
  workouts: { performed_at: string; workout_type: string | null; title: string | null } | null;
  exercises: { name: string; measurement_type: MeasurementType; muscle_group: string | null } | null;
};

/** Convert a stored (SI) metric value to its display value, or null if absent. */
function toDisplay(row: Row, key: MetricKey): number | null {
  const raw = row[METRICS[key].column];
  if (raw == null) return null;
  return Math.round((raw / METRICS[key].perDisplay) * 100) / 100;
}

/** Render one matching instance as a compact, human-readable record. */
function describeRow(row: Row) {
  const mtype = row.exercises?.measurement_type;
  const sets = (row.sets ?? []) as StoredSet[];
  const setsSummary =
    mtype && sets.length
      ? collapseSets(sets)
          .map(({ set, count }) => {
            const text = formatSet(mtype, set);
            return count > 1 ? `${count}×${text}` : text;
          })
          .join(", ")
      : undefined;
  const metrics: Record<string, string> = {};
  for (const key of Object.keys(METRICS) as MetricKey[]) {
    const v = toDisplay(row, key);
    if (v != null && v > 0) metrics[key] = `${v} ${METRICS[key].unit}`;
  }
  return {
    date: row.workouts?.performed_at?.slice(0, 10) ?? null,
    workoutType: row.workouts?.workout_type ?? null,
    title: row.workouts?.title ?? null,
    exercise: row.exercises?.name ?? null,
    metrics,
    sets: setsSummary,
    notes: row.notes?.trim() || undefined,
  };
}

/** Parameters for creating a catalog exercise. The measurement type decides
 * which fields the logger shows, so the coach must choose it deliberately. */
const createExerciseParams = z.object({
  name: z
    .string()
    .min(1)
    .describe("Exercise name in title case, e.g. 'Romanian Deadlift', 'Lat Pulldown'."),
  measurementType: z
    .enum(["weight_reps", "reps_only", "distance_time", "time_only"])
    .describe(
      "How the exercise is logged: 'weight_reps' = external weight + reps (barbell/dumbbell/machine lifts); 'reps_only' = bodyweight reps, optional added weight (pull-ups, push-ups); 'distance_time' = distance + duration (running, cycling, rowing); 'time_only' = held/timed, optional distance or load (plank, carries).",
    ),
  muscleGroup: z
    .string()
    .nullable()
    .describe("Primary muscle group, e.g. 'legs', 'back', 'chest', 'core', 'cardio', 'full'. Null if unclear."),
  equipment: z
    .string()
    .nullable()
    .describe("Primary equipment, e.g. 'barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'none'. Null if unclear."),
});

/**
 * Build the coach's tool set, scoped to the signed-in user. `userId` is baked in
 * here so read tools can't widen their scope. The catalog is a SHARED global
 * resource: create_exercise adds a global exercise everyone can use (owner_id
 * null), which the RLS policy permits for any authenticated user.
 */
export function buildCoachTools(supabase: Client, userId: string): ToolSet {
  return {
    create_exercise: tool({
      description:
        "Add a new exercise to the shared catalog so it becomes a selectable option when logging workouts — for EVERYONE, not just this athlete. Use this when you recommend a movement that isn't already an option (check the catalog first by trying to use it). Pick the measurement type carefully; it determines what the logger asks for. If an exercise with the same name already exists, this reuses it instead of duplicating.",
      inputSchema: createExerciseParams,
      execute: async (params) => {
        const name = params.name.trim();
        if (!name) return { error: "Exercise name is required." };

        // Reuse an existing catalog entry by case-insensitive name rather than
        // creating a duplicate (also backstopped by a unique index).
        const { data: existing } = await supabase
          .from("exercises")
          .select("id, name, measurement_type, muscle_group, equipment")
          .ilike("name", name)
          .limit(1)
          .maybeSingle();
        if (existing) {
          return {
            created: false,
            reused: true,
            exercise: existing,
            note: "An exercise with this name already exists; reusing it.",
          };
        }

        // Insert as a GLOBAL exercise (owner_id null) — shared with all users.
        const { data: created, error } = await supabase
          .from("exercises")
          .insert({
            owner_id: null,
            name,
            measurement_type: params.measurementType,
            muscle_group: params.muscleGroup?.trim() || null,
            equipment: params.equipment?.trim() || null,
          })
          .select("id, name, measurement_type, muscle_group, equipment")
          .single();

        if (error) {
          // A race on the unique index surfaces here; re-fetch and reuse.
          const { data: raced } = await supabase
            .from("exercises")
            .select("id, name, measurement_type, muscle_group, equipment")
            .ilike("name", name)
            .limit(1)
            .maybeSingle();
          if (raced) {
            return { created: false, reused: true, exercise: raced };
          }
          return { error: `Couldn't create the exercise: ${error.message}` };
        }

        return { created: true, reused: false, exercise: created };
      },
    }),
    query_training_history: tool({
      description:
        "Search the athlete's OWN logged workout history to answer specific questions the provided summaries don't cover — e.g. their longest run ever, heaviest squat, total mileage in a date range, or how many times they did an exercise. Read-only; only ever returns this athlete's data. Prefer this over guessing when asked about a specific past number.",
      inputSchema: queryParams,
      execute: async (params) => {
        // Grain: one row per exercise performed, joined to its parent workout
        // (for date/type/title) and the exercise catalog (name/type/muscle).
        // `!inner` so type/name/muscle filters actually restrict results. RLS +
        // the explicit user_id filter both scope this to the current athlete.
        let query = supabase
          .from("exercise_instances")
          .select(
            `total_load, total_distance_m, total_duration_s, total_elevation_m, sets, notes,
             workouts!inner ( performed_at, workout_type, title ),
             exercises!inner ( name, measurement_type, muscle_group )`,
          )
          .eq("user_id", userId);

        if (params.exerciseName) {
          query = query.ilike("exercises.name", `%${params.exerciseName}%`);
        }
        if (params.workoutType) {
          query = query.ilike("workouts.workout_type", `%${params.workoutType}%`);
        }
        if (params.muscleGroup) {
          query = query.ilike("exercises.muscle_group", `%${params.muscleGroup}%`);
        }
        if (params.dateFrom) {
          query = query.gte("workouts.performed_at", params.dateFrom);
        }
        if (params.dateTo) {
          // Inclusive of the whole `dateTo` day.
          query = query.lte("workouts.performed_at", `${params.dateTo}T23:59:59.999Z`);
        }

        // Order newest-first so that if we hit the scan cap we keep recent rows.
        const { data, error } = await query
          .order("performed_at", { referencedTable: "workouts", ascending: false })
          .limit(SCAN_CAP);

        if (error) {
          return { error: `Query failed: ${error.message}` };
        }
        const rows = (data ?? []) as unknown as Row[];
        const truncated = rows.length >= SCAN_CAP;

        // ── Aggregate over the matching rows ──────────────────────────────
        if (params.aggregate !== "none") {
          if (params.aggregate === "count") {
            return {
              aggregate: "count",
              matchingExercises: rows.length,
              scanTruncated: truncated,
            };
          }
          const key = params.metric;
          const values = rows
            .map((r) => toDisplay(r, key))
            .filter((v): v is number => v != null);
          if (values.length === 0) {
            return { aggregate: params.aggregate, metric: key, result: null, matched: 0 };
          }
          let result: number;
          switch (params.aggregate) {
            case "sum":
              result = values.reduce((a, b) => a + b, 0);
              break;
            case "avg":
              result = values.reduce((a, b) => a + b, 0) / values.length;
              break;
            case "max":
              result = Math.max(...values);
              break;
            case "min":
              result = Math.min(...values);
              break;
          }
          return {
            aggregate: params.aggregate,
            metric: key,
            unit: METRICS[key].unit,
            result: Math.round(result * 100) / 100,
            matched: values.length,
            scanTruncated: truncated,
          };
        }

        // ── Return the matching rows, sorted as requested ─────────────────
        const sorted = [...rows].sort((a, b) => {
          let av: number;
          let bv: number;
          if (params.sortBy === "date") {
            av = a.workouts ? Date.parse(a.workouts.performed_at) : 0;
            bv = b.workouts ? Date.parse(b.workouts.performed_at) : 0;
          } else {
            av = a[METRICS[params.sortBy].column] ?? -Infinity;
            bv = b[METRICS[params.sortBy].column] ?? -Infinity;
          }
          return params.sortDir === "asc" ? av - bv : bv - av;
        });

        return {
          matched: rows.length,
          returned: Math.min(sorted.length, params.limit),
          scanTruncated: truncated,
          results: sorted.slice(0, params.limit).map(describeRow),
        };
      },
    }),
  };
}
