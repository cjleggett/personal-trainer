import type { Database } from "@/lib/supabase/database.types";

export type MeasurementType = Database["public"]["Enums"]["measurement_type"];

/**
 * Declarative definition of the set-entry fields per measurement type.
 *
 * `key` is the JSONB key stored in the `sets` array (canonical SI units: meters,
 * seconds). `unit`/`factor` let the UI collect friendlier units (km, minutes)
 * while storing the canonical value: stored = input * factor.
 *
 * Keep these keys aligned with the generated summary columns in the DB
 * (total_distance_m ← distance_m, total_duration_s ← duration_s, etc.).
 */
export type MetricField = {
  key: string;
  label: string;
  /** Unit shown next to the input (display only). */
  unit?: string;
  /** Multiply the input by this to get the stored canonical value. Default 1. */
  factor?: number;
  step?: number;
  optional?: boolean;
};

export const METRIC_FIELDS: Record<MeasurementType, MetricField[]> = {
  weight_reps: [
    { key: "weight", label: "Weight", unit: "kg", step: 0.5 },
    { key: "reps", label: "Reps", step: 1 },
    { key: "rpe", label: "RPE", step: 0.5, optional: true },
  ],
  reps_only: [
    { key: "reps", label: "Reps", step: 1 },
    { key: "added_weight", label: "Added weight", unit: "kg", step: 0.5, optional: true },
  ],
  distance_time: [
    { key: "distance_m", label: "Distance", unit: "km", factor: 1000, step: 0.01 },
    { key: "duration_s", label: "Duration", unit: "min", factor: 60, step: 0.1 },
    { key: "elevation_gain_m", label: "Elevation gain", unit: "m", step: 1, optional: true },
    { key: "avg_hr", label: "Avg HR", unit: "bpm", step: 1, optional: true },
  ],
  time_only: [
    { key: "duration_s", label: "Duration", unit: "min", factor: 60, step: 0.1 },
    { key: "distance_m", label: "Distance", unit: "m", step: 1, optional: true },
    { key: "load", label: "Load", unit: "kg", step: 0.5, optional: true },
  ],
};

/** How many set rows to seed a new instance with, per type (cardio ≈ 1). */
export const DEFAULT_SET_COUNT: Record<MeasurementType, number> = {
  weight_reps: 3,
  reps_only: 3,
  distance_time: 1,
  time_only: 1,
};

/** Common workout types offered in the picker. Free text — users may type others. */
export const WORKOUT_TYPE_PRESETS = [
  "Gym",
  "Run",
  "Bike",
  "Swim",
  "Workout Class",
  "Rollerblade",
  "Hike",
  "Yoga",
] as const;

/**
 * Workout types that ARE a single activity → the catalog exercise name to
 * auto-add when that type is chosen. Keys are lowercased for matching, so
 * "Run", "run", "Running", "Jog" all resolve. Types absent here (Gym, Workout
 * Class, Yoga) are multi-exercise and don't auto-add anything.
 */
export const TYPE_TO_EXERCISE_NAME: Record<string, string> = {
  run: "Running",
  running: "Running",
  jog: "Running",
  jogging: "Running",
  bike: "Cycling",
  biking: "Cycling",
  cycle: "Cycling",
  cycling: "Cycling",
  swim: "Swimming",
  swimming: "Swimming",
  row: "Rowing",
  rowing: "Rowing",
  hike: "Hiking",
  hiking: "Hiking",
  rollerblade: "Rollerblading",
  rollerblading: "Rollerblading",
};

/** Resolve a (free-text) workout type to its auto-add exercise name, or null. */
export function autoExerciseForType(workoutType: string): string | null {
  return TYPE_TO_EXERCISE_NAME[workoutType.trim().toLowerCase()] ?? null;
}

/** Local MM/DD/YYYY (used to autofill an untitled workout, e.g. "08/13/2026 Run"). */
export function todayTitlePrefix(date = new Date()): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${date.getFullYear()}`;
}

// ── Display helpers (canonical stored value → friendly text) ─────────────────

/** A stored set object: metric key → canonical numeric value. */
export type StoredSet = Record<string, number>;

/** Format one stored set as e.g. "100kg × 5" or "5.0 km · 25.0 min". */
export function formatSet(
  measurementType: MeasurementType,
  set: StoredSet,
): string {
  const parts: string[] = [];
  for (const field of METRIC_FIELDS[measurementType]) {
    const raw = set[field.key];
    if (raw === undefined || raw === null) continue;
    const value = field.factor ? raw / field.factor : raw;
    const rounded = Math.round(value * 100) / 100;
    parts.push(field.unit ? `${rounded} ${field.unit}` : `${rounded}`);
  }
  return parts.join(" · ");
}

/** Collapse consecutive identical sets into { set, count } for readable display,
 * inverting the save-time expansion (3 identical sets → "3 × …"). */
export function collapseSets(
  sets: StoredSet[],
): { set: StoredSet; count: number }[] {
  const out: { set: StoredSet; count: number }[] = [];
  for (const set of sets) {
    const last = out[out.length - 1];
    if (last && JSON.stringify(last.set) === JSON.stringify(set)) {
      last.count += 1;
    } else {
      out.push({ set, count: 1 });
    }
  }
  return out;
}
