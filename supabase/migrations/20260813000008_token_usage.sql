-- Token usage log: one row per LLM call, recorded server-side in
-- generateValidated (the single chokepoint for all generation). Append-only —
-- an audit/accounting trail the user can review on the /usage page. We store the
-- raw token counts (source of truth) AND a snapshot cost_usd computed at insert
-- time from the pricing table in src/lib/ai/pricing.ts, so historical costs stay
-- correct even if prices later change.
create table if not exists public.token_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  model text not null,                          -- e.g. 'claude-opus-4-8'
  feature text,                                 -- 'plan' | 'intake' | 'coach' | null
  input_tokens int not null default 0,          -- total prompt tokens (incl. cache)
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,     -- subset of input served from cache
  cache_write_tokens int not null default 0,    -- subset of input written to cache
  cost_usd numeric not null default 0,          -- snapshot, computed at insert
  created_at timestamptz not null default now()
);
create index if not exists token_usage_user_idx
  on public.token_usage (user_id, created_at desc);

alter table public.token_usage enable row level security;

-- Owner-only. No update/delete — the log is immutable.
create policy "token_usage: select own"
  on public.token_usage for select using (user_id = (select auth.uid()));
create policy "token_usage: insert own"
  on public.token_usage for insert with check (user_id = (select auth.uid()));
