# Momentum

A personal training web app: build a periodized training plan, generate and log
individual workouts, and chat with an AI coach that adapts to your history. Built
with Next.js 16 + Supabase (Postgres + Auth, row-level security on every table)
and the Vercel AI SDK. Hosted on Vercel. <!-- live URL: add once public -->

The rest of this README documents the part most people are curious about: **how
the AI is prompted** — what context the app assembles about you, and the exact
prompts each feature runs.

## How AI calls work

- **One model, one place.** The model is set in [`src/lib/ai/config.ts`](src/lib/ai/config.ts)
  (`claude-opus-4-8`). Everything imports from there, so swapping models/providers
  is a one-line change.
- **Every call returns validated, structured output.** All generation goes through
  `generateValidated` / `generateValidatedWithTools` in
  [`src/lib/ai/generate.ts`](src/lib/ai/generate.ts), which wrap the Vercel AI
  SDK's `generateObject` with a **Zod schema** from
  [`src/lib/ai/schemas.ts`](src/lib/ai/schemas.ts). The model never returns free
  JSON we parse by hand — it must conform to the schema, and the shape of each
  turn (reply vs. update-plan vs. draft-workout, etc.) is fixed by that schema.
- **Every system prompt is stamped with today's date.** `withCurrentDate()` in
  `generate.ts` prepends e.g. `Today's date is Thursday, October 2, 2026.` to the
  system prompt on *every* turn, so the model never loses track of the day on a
  long conversation.
- **Secrets stay server-side.** All model calls happen in Server Actions / Route
  Handlers; `ANTHROPIC_API_KEY` is never bundled into the client.

## The context we assemble about you

Before most AI features run, the app builds a few compact, plain-text summaries
of your data and drops them into the prompt. These are generated in
[`src/lib/logging/aggregates.ts`](src/lib/logging/aggregates.ts) and are always
scoped to **your** account only (RLS + explicit `user_id` filters). The pieces:

| Context block | Source | What it contains |
| --- | --- | --- |
| **Profile summary** | `profileSummary()` | Name, birthday, experience level, stated goals, equipment, constraints/injuries, your self-written "About me", and the coach's own durable "Coach notes". |
| **History summary** | `historySummary()` | Last **90 days** rolled up: total workouts, sessions/week, and per-activity-type volume (miles, minutes, elevation, load). Cheap aggregate from SQL summary columns. |
| **Recent detail** | `recentDetailedWorkouts()` | Last **~10 days** in full: each workout's date, title, every exercise with its collapsed sets, and your session notes. The high-detail window. |
| **Exercise catalog** | `exerciseCatalogSummary()` | Every loggable exercise, grouped by measurement type, so the coach knows what already exists before recommending something new. |
| **Workout-type catalog** | `workoutTypeCatalogSummary()` | Every workout type with its emoji. |
| **Current plan + calendar** | the active `training_plans` row | Your plan JSON, plus a calendar reference mapping each plan week to real Monday→Sunday dates. |

### Example of what a context block actually looks like

A **profile summary** rendered for the prompt:

```
- Name: Connor
- Experience level: intermediate
- Stated goals: sub-2:00 half marathon
- Equipment available: home gym (barbell, dumbbells), road access
- Constraints/injuries: left Achilles tightness, prefers morning runs
- About me (written by the athlete; do not overwrite): I travel most weeks for work.
- Coach notes (your durable memory): Dislikes burpees. Responds well to tempo work.
```

A **history summary** (last 90 days):

```
Over the last 90 days: 48 workouts (~3.7/week).
By activity type:
- Running: 31 sessions, 182.4 mi total, 1,540 min total, 4,230 ft climb
- Gym: 14 sessions, 128,500 lb·reps total load
- Soccer: 3 sessions, 270 min total
```

A **recent detail** entry (last ~10 days):

```
2026-09-30 — Tempo run
  • Running: 6.2 mi, 48 min
  Notes: Legs felt heavy, Achilles fine. Negative split.

2026-09-29 — Lower body
  • Back Squat: 3×8 @ 185 lb
  • Romanian Deadlift: 3×10 @ 135 lb
  • Calf Raise: 4×15 @ bodyweight
```

## The four AI features and their prompts

All prompt text lives in [`src/lib/ai/prompts/`](src/lib/ai/prompts/) and is meant
to be hand-edited — the wording is separate from the TypeScript logic and the
output schema.

### 1. Goal intake chat — [`prompts/intake.ts`](src/lib/ai/prompts/intake.ts)
A back-and-forth conversation that sharpens a vague goal into a durable **goal
profile**. The system prompt (`INTAKE_SYSTEM_PROMPT` + `READINESS_RULE`) tells the
model to act like a real coach: ask one or two questions at a time, push back when
a goal and the constraints don't add up, and only "finish" (emit the structured
goal profile) once *you* say you're ready. Opener context: your goal text +
profile summary + history summary.

> **Example turn.** You type *"I want to run a sub-2:00 half marathon."* The model
> replies (schema: `intakeTurnSchema`, a `reply`-or-`ready` union) with something
> like: *"Love it — a sub-2:00 half is a great target. How many days a week can
> you realistically run, and do you have a race date in mind?"* It keeps chatting
> until you confirm, then returns a filled-in goal profile.

### 2. Plan generation — [`prompts/plan.ts`](src/lib/ai/prompts/plan.ts)
Turns the finalized goal profile into a dated, periodized **plan skeleton**
(`PLAN_SYSTEM_PROMPT` → `trainingPlanSchema`). Context: the goal profile JSON,
profile summary, 90-day *and* 30-day history (to judge whether you're ramping up
or tapering), and recent detail. The plan stays deliberately high-level —
per-day focus + a target like `"8 mi @ easy pace"`, **never** pinned weights.
A second **enrichment pass** (`PLAN_ENRICHMENT_SYSTEM_PROMPT`) then fills concrete
exercise lists into just the days that benefit (gym days, circuits), leaving easy
runs and rest days alone.

### 3. Dashboard coach chat — [`prompts/coach.ts`](src/lib/ai/prompts/coach.ts)
The general-purpose coach. `COACH_SYSTEM_PROMPT` + `buildCoachContext()` give it
your plan, calendar, profile, history, recent detail, and both catalogs. Each
turn it picks **one** action (schema: `coachTurnSchema`):
- **reply** — answer a question or give advice (most turns);
- **updatePlan** — revise your plan when you report a change ("make next week
  easier");
- **draftWorkout** — pre-fill the log form for a session you did or want to do.

It also has **tools** ([`src/lib/ai/coach-tools.ts`](src/lib/ai/coach-tools.ts)):
`query_training_history` (read-only queries over *your* logs — "longest run ever?"),
plus `create_exercise` / `create_workout_type` to add missing catalog entries. The
tools bake in your `userId`, so the model can never widen the scope to someone
else's data.

> **Example turn.** You type *"just ran 4 miles easy this morning."* The coach
> returns a `draftWorkout` — type Running, a sensible title, target "4 mi easy" —
> which opens pre-filled in the standard log form for you to confirm.

### 4. Plan-edit & re-evaluation chat — [`prompts/plan-edit.ts`](src/lib/ai/prompts/plan-edit.ts)
A **narrower** coach bound to the one plan you're viewing: it only replies or
updates *that* plan (`planEditTurnSchema`), never drafts or logs workouts. The
**re-evaluation** opener (`REEVALUATE_INSTRUCTION`) has it proactively audit the
plan against what you've actually been doing — flagging skipped sessions, injuries
in your notes, or whether the remaining weeks still reach the goal — and propose
adjustments before changing anything.

### A note on dates
Dates are never computed inside prompt strings. The caller passes pre-computed
values (`today`, week date ranges, number of weeks) into the `build*` helpers, so
the model only ever reasons over dates the server already resolved.

## Running locally

```bash
cp .env.local.example .env.local   # fill in Supabase + Anthropic keys
npm install
npm run dev                         # http://localhost:3000
```

See [`CLAUDE.md`](CLAUDE.md) for the full stack, data model, and dev conventions.
