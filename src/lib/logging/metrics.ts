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

/**
 * Canonical (SI) units per one display unit. Storage is always SI; the UI shows
 * imperial, so `factor` = SI-per-display converts both ways (stored = input *
 * factor; display = stored / factor). Swapping these to metric later — or making
 * it a per-user preference — is a change to this table alone.
 */
export const KG_PER_LB = 0.45359237;
export const METERS_PER_MILE = 1609.344;
export const METERS_PER_FOOT = 0.3048;

export const METRIC_FIELDS: Record<MeasurementType, MetricField[]> = {
  weight_reps: [
    { key: "weight", label: "Weight", unit: "lb", factor: KG_PER_LB, step: 2.5 },
    { key: "reps", label: "Reps", step: 1 },
    { key: "rpe", label: "RPE", step: 0.5, optional: true },
  ],
  reps_only: [
    { key: "reps", label: "Reps", step: 1 },
    { key: "added_weight", label: "Added weight", unit: "lb", factor: KG_PER_LB, step: 2.5, optional: true },
  ],
  distance_time: [
    { key: "distance_m", label: "Distance", unit: "mi", factor: METERS_PER_MILE, step: 0.01 },
    { key: "duration_s", label: "Duration", unit: "min", factor: 60, step: 0.1 },
    { key: "elevation_gain_m", label: "Elevation gain", unit: "ft", factor: METERS_PER_FOOT, step: 10, optional: true },
    { key: "avg_hr", label: "Avg HR", unit: "bpm", step: 1, optional: true },
  ],
  time_only: [
    { key: "duration_s", label: "Duration", unit: "min", factor: 60, step: 0.1 },
    { key: "distance_m", label: "Distance", unit: "ft", factor: METERS_PER_FOOT, step: 1, optional: true },
    { key: "load", label: "Load", unit: "lb", factor: KG_PER_LB, step: 2.5, optional: true },
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
  "Soccer",
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
  soccer: "Soccer",
};

/** Resolve a (free-text) workout type to its auto-add exercise name, or null. */
export function autoExerciseForType(workoutType: string): string | null {
  return TYPE_TO_EXERCISE_NAME[workoutType.trim().toLowerCase()] ?? null;
}

/**
 * Best-effort guess a workout type from free text (e.g. a training-plan day's
 * focus like "Easy run" or "Lower-body strength"). Prefers a known preset, then
 * a single-activity keyword. Returns null when nothing matches — the user picks.
 */
export function inferWorkoutType(text: string): string | null {
  const t = text.toLowerCase();
  for (const preset of WORKOUT_TYPE_PRESETS) {
    if (t.includes(preset.toLowerCase())) return preset;
  }
  for (const key of Object.keys(TYPE_TO_EXERCISE_NAME)) {
    if (new RegExp(`\\b${key}\\b`).test(t)) {
      return key.charAt(0).toUpperCase() + key.slice(1);
    }
  }
  return null;
}

/**
 * Best-effort parse of a plan day's high-level target (e.g. "8 mi @ easy pace",
 * "45 min easy", "4x8 back squat") into seed values for the workout form. Values
 * are returned in DISPLAY units (mi, min) keyed by metric field, plus an optional
 * set `count`, matching what the form's draft rows expect. Anything it can't
 * confidently read is left out — the user fills the rest in.
 */
export type ParsedTarget = { count?: string; metrics: Record<string, string> };

const KM_PER_MILE = METERS_PER_MILE / 1000;

export function parseTargetToMetrics(
  measurementType: MeasurementType,
  text: string,
): ParsedTarget {
  const t = text.toLowerCase();
  const metrics: Record<string, string> = {};
  let count: string | undefined;

  const fieldKeys = new Set(METRIC_FIELDS[measurementType].map((f) => f.key));
  const num = (m: RegExpMatchArray | null, i = 1) =>
    m ? parseFloat(m[i]) : NaN;

  // "sets x reps", e.g. "4x8", "3 × 10". Feeds count + reps for rep-based types.
  const setsReps = t.match(/(\d+)\s*[x×]\s*(\d+)/);
  if (setsReps && fieldKeys.has("reps")) {
    count = String(parseInt(setsReps[1], 10));
    metrics.reps = String(parseInt(setsReps[2], 10));
  }

  // Distance: miles, or km converted to miles (display unit is mi).
  if (fieldKeys.has("distance_m")) {
    const mi = num(t.match(/(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)\b/));
    const km = num(t.match(/(\d+(?:\.\d+)?)\s*(?:km|kilometers?)\b/));
    if (!Number.isNaN(mi)) metrics.distance_m = String(mi);
    else if (!Number.isNaN(km))
      metrics.distance_m = String(Math.round((km / KM_PER_MILE) * 100) / 100);
  }

  // Duration: hours→min, or minutes directly (display unit is min).
  if (fieldKeys.has("duration_s")) {
    const hr = num(t.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/));
    const min = num(t.match(/(\d+(?:\.\d+)?)\s*(?:min|mins|minutes?)\b/));
    if (!Number.isNaN(min)) metrics.duration_s = String(min);
    else if (!Number.isNaN(hr)) metrics.duration_s = String(hr * 60);
  }

  return { count, metrics };
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

/** Format one stored set as e.g. "225 lb × 5" or "3.1 mi · 25.0 min". */
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
