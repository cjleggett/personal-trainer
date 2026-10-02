-- Running shoes: a user's pair of shoes, so they can track accumulated mileage.
-- A running workout MAY reference one pair (nullable — shoes are optional). A
-- shoe's tracked mileage = starting_distance_m + the summed distance of every
-- workout attached to it. Distances are canonical meters like everywhere else;
-- the UI collects/shows miles.

create table if not exists public.shoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  starting_distance_m numeric not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists shoes_user_idx on public.shoes (user_id);

-- Link a workout to a pair of shoes. on delete set null => deleting a shoe keeps
-- the workout history, just unlinked (mirrors workouts.plan_id behavior).
alter table public.workouts
  add column if not exists shoe_id uuid references public.shoes (id) on delete set null;
create index if not exists workouts_shoe_idx on public.workouts (shoe_id);

-- ── Row-Level Security: owner only, all operations ───────────────────────────
alter table public.shoes enable row level security;

create policy "shoes: select own"
  on public.shoes for select using (user_id = (select auth.uid()));
create policy "shoes: insert own"
  on public.shoes for insert with check (user_id = (select auth.uid()));
create policy "shoes: update own"
  on public.shoes for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "shoes: delete own"
  on public.shoes for delete using (user_id = (select auth.uid()));
