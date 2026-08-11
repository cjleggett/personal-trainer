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
- Keep LLM-generated structure in JSONB columns; persist actual logged results
  relationally in `workout_logs`.

## Env
Copy `.env.local.example` → `.env.local` and fill in Supabase + Anthropic keys.

## Verify before committing
- `npx tsc --noEmit` and `npm run lint` pass clean.
- For auth/RLS work: confirm a second user cannot read the first user's rows.
