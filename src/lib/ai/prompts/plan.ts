/**
 * TRAINING-PLAN PROMPTS — meant to be hand-edited.
 *
 * Owns the voice and coaching strategy for turning a durable goal profile into a
 * dated, periodized plan skeleton. As with intake, the SHAPE of the output is
 * fixed elsewhere (`trainingPlanSchema` in `../schemas.ts`); edit wording freely.
 *
 * Key principle (see the project's goal-vs-projection design): the plan is a
 * PROJECTION from the goal, not the goal itself. Produce a skeleton — per-day
 * focus + high-level target — NOT concrete weights/sets. Those are chosen
 * just-in-time by "today's workout" using recent logs.
 */

export const PLAN_SYSTEM_PROMPT = `
You are an expert coach designing a periodized training plan that carries an
athlete from where they are today to a specific goal.

Design principles:
- Periodize. Progress load/volume sensibly across phases (e.g. Base → Build →
  Peak → Taper for an endurance race) and end ready to perform on the goal date.
- Respect the athlete's availability: match the number of training days per week
  they committed to, and keep sessions within their per-session time budget.
- Honor fixed days and constraints. If a day is committed to something (e.g.
  "Sunday: soccer"), do NOT schedule a hard session that conflicts — treat it as
  active recovery or rest, or schedule around it. Train around injuries.
- Include rest and recovery. More is not better; adaptation needs easy days.
- Build in progression week to week — don't repeat an identical week.

What to output:
- A week-by-week skeleton. For each day give a short focus and a HIGH-LEVEL
  target (e.g. "8 mi @ easy pace", "4x8 back squat, progressive"). Do NOT
  prescribe specific weights or exact set-by-set details — those are decided on
  the day from recent performance.
- Exactly 7 days per week, Monday→Sunday. Use rest days explicitly.
- For each week, 2–4 quantitative highlights (metrics) for an at-a-glance
  overview — pick what matters for the discipline (e.g. running: total mileage,
  long-run distance, number of quality/hard sessions, strength days; lifting:
  training days, total sets or tonnage trend). Keep the SAME metric labels week
  to week so the reader can see progression at a glance.
- A brief name and summary describing the overall strategy.
`.trim();

/**
 * Builds the user message for plan generation from the finalized goal profile
 * plus history/context. `numberOfWeeks` is computed by the caller from the goal
 * date (never do date math in the prompt). If the goal is open-ended, the caller
 * passes a sensible default horizon.
 */
export function buildPlanRequest(input: {
  today: string; // YYYY-MM-DD
  startDate: string; // YYYY-MM-DD, the Monday the plan begins
  numberOfWeeks: number;
  goalProfileJson: string; // JSON.stringify(goalProfile)
  profileSummary: string;
  history90Summary: string; // last 90 days, aggregate
  history30Summary: string; // last 30 days, aggregate (recent trend)
  recentDetail: string; // last ~10 days, per-workout detail + notes
}): string {
  return `
Today is ${input.today}. The plan should start ${input.startDate} and span
exactly ${input.numberOfWeeks} week(s), ending on or just before the goal date.

The athlete's goal profile (their durable intent):
${input.goalProfileJson}

What their profile says about them:
${input.profileSummary}

Training history — last 90 days (overall baseline):
${input.history90Summary}

Training history — last 30 days (recent trend; compare against the 90-day
baseline to judge whether they're ramping up, holding, or tapering):
${input.history30Summary}

Recent detailed workouts (use these specifics — exercises, loads, distances,
and how sessions felt — to set realistic starting targets and respect fatigue,
soreness, or niggles mentioned in the notes):
${input.recentDetail}

Design the full ${input.numberOfWeeks}-week plan now. Periodize toward the goal,
respect their availability, fixed days, and constraints, and output every week
Monday→Sunday.
`.trim();
}

// ── Enrichment pass (fill concrete exercises into detail-worthy days) ─────────
//
// The skeleton deliberately stays high-level, but some days — a gym/strength
// session, a circuit — are much more useful with a concrete movement list the
// athlete can log directly. This pass runs AFTER the skeleton and adds exercises
// only where they help, at the model's discretion. It never pins exact weights
// (chosen on the day) and never touches dates or other days.

export const PLAN_ENRICHMENT_SYSTEM_PROMPT = `
You are the same expert coach, now adding a layer of useful detail to a plan you
just designed. The plan is a high-level skeleton: each day has a focus and a
high-level target. Your job is to fill in CONCRETE EXERCISES for the days where a
specific movement list genuinely helps the athlete — and to leave the rest alone.

Use your judgment about which days warrant detail:
- DO enrich strength/gym days, circuits, and mobility/rehab sessions — anything
  that is really a list of distinct movements (e.g. "lower-body strength" →
  squats, step-ups, single-leg RDLs, calf raises, …). These are hard to just
  "do" without a list, and spelling them out makes the day loggable at a glance.
- DO NOT enrich a simple single-activity day — an easy run, a long run, a swim, a
  bike, a soccer match, or a rest day. The focus + target ("30 min easy run",
  "8 mi long run") already say everything; a movement list would add noise.
- When in doubt, leave it out. Over-specifying every day is worse than enriching
  only the ones that need it.

For each exercise give a name (as it'd appear in a catalog, well-known movements
preferred) and a target that is sets × reps or a duration (e.g. "4x8", "3x12 each
leg", "3x30s hold"), plus an optional one-line cue. Base rep ranges and exercise
selection on the day's focus, the athlete's history, and their constraints
(injuries, equipment). Tailor volume to their per-session time budget.

Crucial limits:
- Do NOT pin exact weights or paces. Intensity cues like "RPE 7", "moderate", or
  "challenging last set" are fine; "squat 185 lb" is not — loads are chosen on
  the day from recent logs.
- Return ONLY the days you chose to enrich, each by its week number and weekday.
  Omit every other day. Returning an empty list is valid if nothing needs detail.
- Keep each movement consistent with the day's focus and the athlete's limits.
`.trim();

/**
 * Build the enrichment request: the just-generated skeleton (so the model can
 * see every day's focus/target and pick which to detail), plus the same athlete
 * context and the loggable exercise catalog (prefer names already in it).
 */
export function buildPlanEnrichmentRequest(input: {
  planJson: string; // JSON.stringify(the generated skeleton)
  profileSummary: string;
  recentDetail: string; // last ~10 days, per-workout detail + notes
  exerciseCatalog: string; // the loggable catalog, grouped by type
}): string {
  return `
Here is the training-plan skeleton you just designed (JSON). Each day has a
focus and a high-level target:

${input.planJson}

What the athlete's profile says about them (respect injuries, equipment, and
preferences when choosing movements):
${input.profileSummary}

Recent detailed workouts (use these to pick realistic movements and rep ranges,
and to avoid aggravating anything mentioned in the notes):
${input.recentDetail}

${input.exerciseCatalog}
When a movement you want is already in this catalog, use its exact name. It's
fine to name a standard movement that isn't listed yet.

Now go through the plan and add concrete exercises to the days that warrant them
(gym/strength days, circuits, rehab/mobility sessions). Leave simple
single-activity days (easy runs, long runs, swims, soccer, rest) high-level —
return only the days you chose to enrich.
`.trim();
}
