@AGENTS.md

# Exercise Training App — project guide

A web app to create training plans, generate individual workouts, and log past
exercise. Small trusted user base (me + a few people).

## Stack
- **Next.js 16** (App Router, `src/` dir, TypeScript) on Vercel.
  - NOTE: Next 16 renamed Middleware → **Proxy** (`src/proxy.ts`). `cookies()` is async.
- **Tailwind CSS v4**.
- **Supabase**: Postgres + Auth. Clients in `src/lib/supabase/` (`client.ts` browser,
  `server.ts` server components/actions, `proxy.ts` session refresh).
  Every user-owned table has `user_id` + **Row-Level Security**.
- **Vercel AI SDK** (`ai` + `@ai-sdk/anthropic`) for generation.

## Conventions (important)
- **All LLM output goes through `generateObject` + a Zod schema** from
  `src/lib/ai/schemas.ts`. Never parse raw JSON from the model by hand; never let
  unvalidated model output reach the database.
- **The model is configured in one place**: `src/lib/ai/config.ts`. To change
  provider/model, edit only that file.
- **Secrets are server-side only.** LLM calls happen in Server Actions / Route
  Handlers. Never import `ANTHROPIC_API_KEY` into a Client Component. Use
  `.env.local` (see `.env.local.example`); never commit real keys.
## Data model (logging)
Hybrid relational + JSONB. Tables (all `user_id` + RLS):
- `exercises` — catalog. Global seeds (`owner_id` NULL) + per-user customs.
  `measurement_type` enum: `weight_reps | reps_only | distance_time | time_only`.
- `workouts` — session parent (`title`, `workout_type`, `notes`, `performed_at`).
- `exercise_instances` — one row per exercise performed. `sets jsonb` holds the
  array of set objects (canonical SI units: meters, seconds). **Generated summary
  columns** `total_load / total_distance_m / total_duration_s / total_elevation_m`
  roll up from `sets` so trends stay pure SQL. `extra jsonb` at each grain for
  non-standard metrics (the "log my playlist" escape hatch).
- Set-entry field definitions + unit factors live in `src/lib/logging/metrics.ts`
  (`METRIC_FIELDS`). Display↔canonical conversion uses `factor` (km→m, min→s).
  On save, a "sets count" is expanded into N individual set objects.

## Env
Copy `.env.local.example` → `.env.local` and fill in Supabase + Anthropic keys.
Supabase CLI is linked; use `npm run db:push` (migrations) and `npm run db:types`
(regenerate `src/lib/supabase/database.types.ts`) after schema changes.

## Verify before committing
- `npm run typecheck` and `npm run lint` pass clean.
- For DB work: write a throwaway `scripts/test-*.mjs` that signs up users with the
  anon key and asserts behavior + RLS against the live DB, then delete the test
  users via `supabase db query --linked "delete from auth.users where email like ..."`.
- Prefer verifying in a **production build** (`npm run build && npm run start`) when
  judging performance — dev-mode compile pauses are not representative.

## Status (updated 2026-08-13)
Done: #1 skeleton · #2 auth+RLS · #3 workout logging (create/history/detail/
edit/delete, past-dating, searchable pickers, auto-add activity, loading states).
**Next: #4 AI workout generation** — call `generateObject` (Vercel AI SDK) with the
workout Zod schema in `src/lib/ai/schemas.ts`, route the result into the existing
reusable `WorkoutForm` (`src/app/workouts/WorkoutForm.tsx`) so the user edits before
saving. Foundation (`src/lib/ai/config.ts`, schemas, ANTHROPIC_API_KEY) already set up.
Then: #5 training plans · #6 progress/analytics.
Deferred idea: free-form text → editable workout draft (fits #4).
GitHub: `cjleggett/personal-trainer` (private), personal SSH alias `github.com-cjleggett`.
