import { z } from "zod";

/**
 * Zod schemas for LLM-generated content. These are the contract between the
 * model and the database: generation uses `generateObject({ schema })`, so the
 * AI SDK guarantees the returned object validates against these shapes before
 * any of it reaches Postgres. Keep DB JSONB columns aligned with these types.
 */

export const exerciseSetSchema = z.object({
  reps: z.number().int().positive().describe("Target repetitions for the set"),
  targetLoad: z
    .string()
    .describe(
      "Target load, e.g. '60kg', 'bodyweight', or an RPE like 'RPE 8'. Free text.",
    ),
});

export const workoutExerciseSchema = z.object({
  name: z.string().describe("Exercise name, e.g. 'Barbell Back Squat'"),
  muscleGroup: z
    .string()
    .describe("Primary muscle group, e.g. 'legs', 'chest', 'back'"),
  sets: z.array(exerciseSetSchema).min(1).describe("Prescribed sets"),
  notes: z.string().optional().describe("Optional coaching cue or substitution"),
});

export const workoutSchema = z.object({
  title: z.string().describe("Short workout title, e.g. 'Lower Body Strength'"),
  focus: z.string().describe("Session focus, e.g. 'strength', 'hypertrophy', 'conditioning'"),
  estimatedMinutes: z.number().int().positive(),
  exercises: z.array(workoutExerciseSchema).min(1),
});

export type Workout = z.infer<typeof workoutSchema>;

// ── Training plan (dated skeleton) ───────────────────────────────────────────
//
// A plan is a PROJECTION derived from the durable goal profile — not full
// workouts. Each day carries a focus + high-level target ("8 mi easy",
// "lower-body strength"); the concrete sets/weights are generated just-in-time
// by "today's workout" later. The model emits days labeled by day-of-week; the
// SERVER assigns real calendar dates deterministically (LLMs are unreliable at
// multi-week date math), so this schema deliberately has no date fields.

/** One day in the plan skeleton. Either a session (with a focus/target) or rest. */
export const planDaySchema = z.object({
  dayOfWeek: z
    .enum([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ])
    .describe("Which weekday this slot falls on"),
  isRestDay: z.boolean().describe("True for a rest/recovery day"),
  focus: z
    .string()
    .describe(
      "Short session focus, e.g. 'Easy run', 'Lower-body strength', 'Long run', 'Rest'",
    ),
  target: z
    .string()
    .describe(
      "High-level target for the day, e.g. '8 mi @ easy pace', '4x8 squats progressive', or 'full rest'. NOT specific weights — those are chosen on the day.",
    ),
});

/** A quantitative highlight for a week, for the at-a-glance overview. */
export const planMetricSchema = z.object({
  label: z
    .string()
    .describe(
      "Short metric label relevant to the discipline, e.g. 'Mileage', 'Gym days', 'Long run', 'Hard sessions'",
    ),
  value: z
    .string()
    .describe("Value as free text, e.g. '18 mi', '2', '8 mi @ easy'"),
});

/** One week of the periodized program. */
export const planWeekSchema = z.object({
  weekNumber: z.number().int().positive().describe("1-based week index"),
  phase: z
    .string()
    .describe("Periodization phase, e.g. 'Base', 'Build', 'Peak', 'Taper'"),
  emphasis: z
    .string()
    .describe("One-line summary of the week's intent and how it progresses"),
  metrics: z
    .array(planMetricSchema)
    .default([])
    .describe(
      "2–4 key quantitative highlights for the week, for an at-a-glance overview (e.g. total mileage, number of gym/strength days, long-run distance). Choose metrics relevant to the discipline. Keep labels consistent week to week so trends are readable.",
    ),
  days: z
    .array(planDaySchema)
    .length(7)
    .describe("Exactly 7 days, Monday→Sunday in order"),
});

export const trainingPlanSchema = z.object({
  name: z.string().describe("Program name, e.g. '11-Week Half Marathon Base→Peak'"),
  summary: z
    .string()
    .describe("2–3 sentence overview of the strategy and how it reaches the goal"),
  weeks: z
    .array(planWeekSchema)
    .min(1)
    .describe("Consecutive weeks from start to goal, periodized toward the target"),
});

export type TrainingPlan = z.infer<typeof trainingPlanSchema>;
export type PlanWeek = z.infer<typeof planWeekSchema>;
export type PlanDay = z.infer<typeof planDaySchema>;

// ── Coach chat (conversational, action-routing) ──────────────────────────────
//
// The dashboard coach is a general assistant: the user says anything ("my quad
// is sore, is that expected?", "I'm traveling Oct 6–10", "log the run I just
// did"), and each turn the model DECIDES what to do. Every turn is one
// discriminated union so `generateObject` keeps it validated:
//   - reply        → just talk (answer a question, ask a clarification, advise)
//   - updatePlan   → return the FULL revised plan (reuses trainingPlanSchema, so
//                    shape is guaranteed; server keeps start_date so dates stay
//                    anchored)
//   - draftWorkout → propose a workout for the user to log; the UI opens the
//                    prefilled logging form so they can edit and save.
// The voice and routing rules live in `src/lib/ai/prompts/coach.ts`.

/** A workout the coach proposes for logging. Loose, display-oriented fields that
 * feed the existing new-workout prefill (type + title + a high-level target). */
export const workoutDraftSchema = z.object({
  workoutType: z
    .string()
    .describe("Activity type, e.g. 'Run', 'Gym', 'Soccer'. Matches the pickers."),
  title: z
    .string()
    .describe("Short title/focus for the session, e.g. 'Easy run'"),
  target: z
    .string()
    .describe(
      "High-level target to seed the form, e.g. '3 mi @ easy', '45 min', '4x8'. Best-effort; the user edits before saving.",
    ),
  notes: z
    .string()
    .nullable()
    .describe("Optional note to prefill, or null."),
});

export type WorkoutDraft = z.infer<typeof workoutDraftSchema>;

/**
 * Optional memory update the coach may attach to ANY turn. When it learns a
 * durable, goal-independent preference or fact worth remembering ("dislikes
 * burpees", "trains early mornings", "prefers trail runs"), it returns the FULL
 * updated coach-notes text (existing notes + the new fact, de-duplicated), or
 * null to leave them unchanged. This only ever writes the SHARED coach_notes —
 * never the user-only About Me. See src/lib/ai/prompts/coach.ts.
 */
const updatedCoachNotes = z
  .string()
  .nullable()
  .describe(
    "Full updated coach-notes text (existing notes merged with any durable new preference/fact from THIS message, de-duplicated), or null to leave unchanged. Only durable, goal-independent facts — not this conversation's transient details. Never restate the user's About Me here.",
  );

export const coachTurnSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("reply"),
    message: z
      .string()
      .describe(
        "A conversational reply: answer the question, give advice, or ask a clarification. Use this when no plan change or logging is warranted yet.",
      ),
    updatedCoachNotes,
  }),
  z.object({
    kind: z.literal("updatePlan"),
    message: z
      .string()
      .describe(
        "A short summary of what you changed in the plan and why, addressed to the user.",
      ),
    plan: trainingPlanSchema.describe(
      "The FULL revised plan. Preserve everything the user did not ask to change; keep the same number of weeks and the Monday→Sunday day order.",
    ),
    updatedCoachNotes,
  }),
  z.object({
    kind: z.literal("draftWorkout"),
    message: z
      .string()
      .describe(
        "A short message introducing the draft, e.g. what you inferred and inviting them to review/edit before saving.",
      ),
    workout: workoutDraftSchema,
    updatedCoachNotes,
  }),
]);

export type CoachTurn = z.infer<typeof coachTurnSchema>;

// ── Goal intake (conversational) ─────────────────────────────────────────────
//
// The intake flow is a free-flowing chat: the user states a goal, and each turn
// the model EITHER replies conversationally (asking questions, pushing back on
// unrealistic goals, refining together) OR — once the user confirms — commits a
// durable "goal profile". Both outcomes are one discriminated union so every
// model turn stays validated by `generateObject` (see CLAUDE.md). The voice and
// strategy live in `src/lib/ai/prompts/intake.ts`, which is meant to be
// hand-edited; this file only fixes the SHAPE of a turn.

/** A named target the plan is optimizing toward, e.g. { name: 'pace', target: '~5:41/km' }. */
export const goalMetricSchema = z.object({
  name: z.string().describe("Metric name, e.g. 'distance', 'pace', 'bodyweight'"),
  target: z.string().describe("Target value as free text, e.g. '21.1 km', 'sub-2:00'"),
});

/**
 * The durable "north star". A plan is later derived FROM this profile plus time
 * remaining and actual adherence — so this captures intent, not a schedule.
 */
export const goalProfileSchema = z.object({
  goal: z.string().describe("One-sentence restatement of the user's goal"),
  discipline: z
    .string()
    .describe("Primary discipline, e.g. 'running', 'strength', 'mixed'"),
  targetDate: z
    .string()
    .nullable()
    .describe("Goal date as YYYY-MM-DD, or null if open-ended"),
  targetMetrics: z
    .array(goalMetricSchema)
    .describe("Measurable targets defining success. May be empty."),
  daysPerWeek: z
    .number()
    .int()
    .nullable()
    .describe("Sessions per week the user can commit to, or null if unknown"),
  sessionMinutes: z
    .number()
    .int()
    .nullable()
    .describe("Typical minutes available per session, or null if unknown"),
  fixedDays: z
    .array(z.string())
    .describe("Days locked to something, e.g. 'Sunday: soccer'. May be empty."),
  constraints: z
    .array(z.string())
    .describe("Injuries, equipment limits, scheduled events. May be empty."),
  baselineNotes: z
    .string()
    .describe("What the model inferred about current fitness from history/answers"),
});

export type GoalProfile = z.infer<typeof goalProfileSchema>;

/** One turn of the intake conversation: a conversational reply, or a finished
 * profile once the user confirms they're ready to generate. */
export const intakeTurnSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("reply"),
    message: z
      .string()
      .describe(
        "The coach's conversational reply: ask questions, push back on unrealistic goals, or confirm details. End by inviting the user to add more or say they're ready to build the plan.",
      ),
  }),
  z.object({
    kind: z.literal("ready"),
    message: z
      .string()
      .describe("A short confirmation summarizing the goal back to the user"),
    goalProfile: goalProfileSchema,
    // Durable, user-level facts to persist so we never re-ask them. Merge the
    // pre-existing profile context with anything learned this session; return
    // the FULL updated value for each (not just the delta), or null to leave
    // that field unchanged. See src/lib/ai/prompts/intake.ts.
    updatedConstraints: z
      .string()
      .nullable()
      .describe(
        "Full updated injuries/limitations text (existing + newly learned), or null if unchanged",
      ),
    updatedCoachNotes: z
      .string()
      .nullable()
      .describe(
        "Full updated durable preferences/context (existing + newly learned, e.g. 'dislikes push-ups'), or null if unchanged",
      ),
  }),
]);

export type IntakeTurn = z.infer<typeof intakeTurnSchema>;
