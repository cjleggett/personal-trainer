-- Training plans: a dated, periodized program derived FROM a durable goal
-- profile. The goal is the north star; the plan is a projection we can later
-- regenerate from (goal + time remaining + actual adherence). We therefore store
-- BOTH: `goal_profile` (the durable intent captured at intake) and `plan` (the
-- dated skeleton the model produced). Concrete per-day workouts are generated
-- just-in-time elsewhere, so `plan` holds day focuses/targets, not full sets.
create table if not exists public.training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  status text not null default 'active',   -- 'active' | 'archived'
  start_date date not null,                 -- calendar anchor (a Monday)
  target_date date,                         -- goal date, if any
  goal_profile jsonb not null,              -- GoalProfile (see src/lib/ai/schemas.ts)
  plan jsonb not null,                       -- TrainingPlan skeleton (dated days)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists training_plans_user_idx
  on public.training_plans (user_id, status, start_date desc);

-- Link a logged workout back to the plan day it fulfilled (nullable: ad-hoc
-- workouts have no plan). Enables adherence tracking for regeneration later.
alter table public.workouts
  add column if not exists plan_id uuid references public.training_plans (id) on delete set null;
alter table public.workouts
  add column if not exists plan_day_date date;  -- which dated slot this fulfilled

alter table public.training_plans enable row level security;

create policy "training_plans: select own"
  on public.training_plans for select using (user_id = (select auth.uid()));
create policy "training_plans: insert own"
  on public.training_plans for insert with check (user_id = (select auth.uid()));
create policy "training_plans: update own"
  on public.training_plans for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "training_plans: delete own"
  on public.training_plans for delete using (user_id = (select auth.uid()));

drop trigger if exists training_plans_set_updated_at on public.training_plans;
create trigger training_plans_set_updated_at
  before update on public.training_plans
  for each row execute function public.set_updated_at();
