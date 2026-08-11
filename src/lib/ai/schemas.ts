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

export const planDaySchema = z.object({
  dayOfWeek: z
    .string()
    .describe("e.g. 'Monday', or 'Day 1'. Rest days allowed."),
  isRestDay: z.boolean(),
  workout: workoutSchema.nullable().describe("Null on rest days"),
});

export const trainingPlanSchema = z.object({
  name: z.string().describe("Program name, e.g. '8-Week Strength Base'"),
  goal: z.string().describe("Primary goal this plan targets"),
  weeks: z.number().int().positive().describe("Program length in weeks"),
  weeklySchedule: z
    .array(planDaySchema)
    .min(1)
    .describe("The repeating weekly template of training days"),
});

export type TrainingPlan = z.infer<typeof trainingPlanSchema>;
