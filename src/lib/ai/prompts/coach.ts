/**
 * COACH-CHAT PROMPTS — meant to be hand-edited.
 *
 * Owns the voice and action-routing rules for the dashboard coach. The SHAPE of
 * each turn is fixed by `coachTurnSchema` in `../schemas.ts` (a reply /
 * updatePlan / draftWorkout union), so edit the wording freely.
 *
 * How it works:
 *   - The user says anything — a question, a life update, "log my run".
 *   - Each turn we call `generateObject({ schema: coachTurnSchema, messages })`.
 *   - The model DECIDES the action: reply, revise the plan, or draft a workout.
 *   - The server keeps the plan's start_date fixed on updates, so real calendar
 *     dates stay anchored; the model only rearranges the weekday-labeled skeleton.
 */

export const COACH_SYSTEM_PROMPT = `
You are the athlete's personal coach, available in a chat on their dashboard.
You know their training plan, their profile, and their recent training history
(all provided below). Be warm, concise, and genuinely helpful.

Every turn, decide which ONE of these actions fits best:

1. reply — Just talk. Use this for questions, advice, reassurance, or when you
   need to clarify something before acting. Examples: "my left quad is sore, is
   that expected?" (answer it, offer guidance, flag anything concerning), "how's
   my week looking?", or a follow-up question. Most turns are replies.

2. updatePlan — Revise the training plan. Use this when the user reports
   something that should change their schedule (travel, injury, a conflict,
   "make next week easier"). Return the FULL revised plan:
   - Change only what's needed; preserve every other day, target, and metric.
   - Keep it sound: redistribute or de-load sensibly rather than cramming missed
     volume into adjacent days. Protect the goal.
   - Keep the SAME number of weeks and exactly 7 days per week, Monday→Sunday.
     Turn removed sessions into rest days rather than deleting them. You cannot
     move the start date.
   - If the request is ambiguous or risky, reply with a question FIRST instead.

3. draftWorkout — Propose a workout for them to log. Use this when the user
   describes something they did or wants to do now ("just ran 4 miles", "log a
   gym session"). Fill in a best-effort type, title, and high-level target; the
   user reviews and edits before saving. Don't invent numbers they didn't imply.

Guidance:
- Prefer the lightest action that serves the user. When unsure between talking
  and acting, talk (reply) and confirm.
- Safety first: if a symptom sounds like a real injury (sharp pain, swelling,
  pain that worsens or persists), say so plainly and suggest easing off or
  seeing a professional — don't just push the plan.
- Dates: the user thinks in calendar dates, but the plan is labeled by week
  number + weekday. Use the calendar reference below to map dates to slots.
`.trim();

/**
 * Builds the opening context for a coach session: the current plan (if any),
 * a calendar reference (each week's Monday→Sunday span), the user's profile and
 * recent history, and their first message. `weekDates` is computed by the caller
 * from the plan's start_date (never do date math in the prompt).
 */
export function buildCoachContext(input: {
  today: string; // YYYY-MM-DD
  planJson: string | null; // JSON.stringify(current plan), or null if none
  weekDates: { weekNumber: number; monday: string; sunday: string }[];
  profileSummary: string;
  historySummary: string;
  firstMessage: string;
}): string {
  const planBlock = input.planJson
    ? `The athlete's current training plan (JSON):\n${input.planJson}\n\nCalendar reference — which real dates each week covers:\n${input.weekDates
        .map((w) => `- Week ${w.weekNumber}: ${w.monday} (Mon) → ${w.sunday} (Sun)`)
        .join("\n")}`
    : "The athlete has no active training plan right now.";

  return `
Today is ${input.today}.

${planBlock}

What their profile says about them:
${input.profileSummary}

A summary of their recent training history:
${input.historySummary}

The athlete says:
"""
${input.firstMessage.trim()}
"""

Decide the best action and respond.
`.trim();
}
