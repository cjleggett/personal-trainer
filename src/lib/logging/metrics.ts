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
  /** Render as two inputs — minutes + seconds — instead of one decimal field.
   * Only valid on a duration field (unit "min", factor 60): the two inputs are
   * combined back into display-minutes, so storage/conversion are unchanged. */
  minSec?: boolean;
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
    { key: "duration_s", label: "Duration", unit: "min", factor: 60, step: 0.1, minSec: true },
    { key: "elevation_gain_m", label: "Elevation gain", unit: "ft", factor: METERS_PER_FOOT, step: 10, optional: true },
    { key: "avg_hr", label: "Avg HR", unit: "bpm", step: 1, optional: true },
  ],
  time_only: [
    { key: "duration_s", label: "Duration", unit: "min", factor: 60, step: 0.1, minSec: true },
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

/** Emoji shown for a workout with no type (or a legacy row that never had one). */
export const DEFAULT_WORKOUT_EMOJI = "💪";

/** Curated grid of activity emojis offered when adding a new workout type. Both
 * the logging form's picker and the coach's create_workout_type tool draw from
 * this set so stored emojis stay consistent and render reliably. */
export const WORKOUT_TYPE_EMOJIS = [
  "🏃", "🚶", "🥾", "🚴", "🏊", "🧗", "⛷️", "🏂", "🛹", "⛸️",
  "🏋️", "🤸", "🧘", "🥊", "🚣", "🏄", "🤿", "🏇", "⛳", "🎿",
  "⚽", "🏀", "🏈", "⚾", "🥎", "🏐", "🏉", "🎾", "🏓", "🏸",
  "🥍", "🏒", "🏑", "🥅", "🥏", "🎳", "💃", "💪",
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
 * Whether a (free-text) workout type is a run — the only type that can carry a
 * pair of shoes. Matches "Run", "run", "Running", "Jog", "Trail run", etc.
 */
export function isRunningType(workoutType: string): boolean {
  const t = workoutType.trim().toLowerCase();
  return /\b(run|running|jog|jogging)\b/.test(t);
}

/**
 * Best-effort match a plan day's focus text (e.g. "Easy run", "Long run",
 * "Lower-body strength") to an existing workout type NAME from the catalog, so
 * the logging form can preselect it. Matching against the real catalog (rather
 * than a fixed preset list) is what makes the preselect actually land — the
 * catalog holds "Running"/"Cycling", not "Run"/"Bike".
 *
 * Strategy, most to least specific:
 *   1. A catalog type whose name appears as a whole word in the focus
 *      ("Long run" → "Running" via the activity-name map below; "Yoga" → "Yoga").
 *   2. A single-activity keyword ("run", "bike", …) mapped to its catalog name.
 * Returns null when nothing matches — the user picks the type themselves.
 */
export function matchWorkoutTypeName(
  focus: string,
  typeNames: string[],
): string | null {
  const t = focus.toLowerCase();
  const whole = (needle: string) =>
    new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t);

  // 1. Direct catalog-name hit (longest name first, so "Spin Class" beats a
  //    bare "Spin" and "Trail Running" would beat "Running").
  const byLength = [...typeNames].sort((a, b) => b.length - a.length);
  for (const name of byLength) {
    if (whole(name.toLowerCase())) return name;
  }

  // 2. Single-activity keyword → its canonical activity, matched to a catalog
  //    type by name (case-insensitive). Handles "run"→"Running", "bike"→"Cycling".
  for (const [keyword, activity] of Object.entries(TYPE_TO_EXERCISE_NAME)) {
    if (!whole(keyword)) continue;
    const match = typeNames.find(
      (n) => n.toLowerCase() === activity.toLowerCase(),
    );
    if (match) return match;
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

  // Weight, e.g. "@ 135 lb", "135lb", "60 kg" (kg converted to lb; display is lb).
  if (fieldKeys.has("weight")) {
    const lb = num(t.match(/(\d+(?:\.\d+)?)\s*(?:lb|lbs|pound|pounds)\b/));
    const kg = num(t.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilos?|kilograms?)\b/));
    if (!Number.isNaN(lb)) metrics.weight = String(lb);
    else if (!Number.isNaN(kg))
      metrics.weight = String(Math.round((kg / KG_PER_LB) * 100) / 100);
  }

  // Distance: miles, or km converted to miles (display unit is mi).
  if (fieldKeys.has("distance_m")) {
    const mi = num(t.match(/(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)\b/));
    const km = num(t.match(/(\d+(?:\.\d+)?)\s*(?:km|kilometers?)\b/));
    if (!Number.isNaN(mi)) metrics.distance_m = String(mi);
    else if (!Number.isNaN(km))
      metrics.distance_m = String(Math.round((km / KM_PER_MILE) * 100) / 100);
  }

  // Duration (display unit is min, so convert everything to minutes). Reads
  // minutes and/or seconds ("90s", "2x30s", "1 min 30 s"), falling back to
  // hours. Seconds support lets short holds like "30s plank" seed correctly.
  if (fieldKeys.has("duration_s")) {
    const hr = num(t.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/));
    const min = num(t.match(/(\d+(?:\.\d+)?)\s*(?:min|mins|minutes?)\b/));
    const sec = num(t.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)\b/));
    let minutes = NaN;
    if (!Number.isNaN(min)) minutes = min;
    if (!Number.isNaN(sec)) minutes = (Number.isNaN(minutes) ? 0 : minutes) + sec / 60;
    if (Number.isNaN(minutes) && !Number.isNaN(hr)) minutes = hr * 60;
    if (!Number.isNaN(minutes)) {
      metrics.duration_s = String(Math.round(minutes * 1e6) / 1e6);
    }
  }

  return { count, metrics };
}

// ── Minutes ↔ minutes+seconds (duration input helpers) ───────────────────────
//
// A duration field's canonical value is seconds, and the form carries it as a
// DISPLAY-MINUTES string (e.g. "2.5"). For entry we split that into whole
// minutes + seconds and recombine on change — storage and the min↔s factor are
// untouched, so existing data needs no migration.

/** Split a display-minutes string into { min, sec } strings for the two inputs.
 * "" → both blank; "2.5" → { min: "2", sec: "30" }. Seconds are rounded to the
 * nearest whole second. */
export function minutesToMinSec(minutes: string): { min: string; sec: string } {
  if (minutes.trim() === "") return { min: "", sec: "" };
  const mins = parseFloat(minutes);
  if (Number.isNaN(mins)) return { min: "", sec: "" };
  const totalSec = Math.round(mins * 60);
  const whole = Math.floor(totalSec / 60);
  const rem = totalSec - whole * 60;
  return { min: String(whole), sec: String(rem) };
}

/** Recombine minutes + seconds inputs into a display-minutes string (what the
 * rest of the form expects). An empty or all-zero entry → "" so an untouched
 * "00:00" is treated as no value on save (not a real 0-second set). */
export function minSecToMinutes(min: string, sec: string): string {
  const m = parseFloat(min) || 0;
  const s = parseFloat(sec) || 0;
  const minutes = m + s / 60;
  if (minutes === 0) return "";
  // Trim float noise (e.g. 2.4999999) to a clean value; stored as *60 on save.
  return String(Math.round(minutes * 1e6) / 1e6);
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
