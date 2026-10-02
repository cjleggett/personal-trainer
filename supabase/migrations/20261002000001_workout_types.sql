-- Workout types become a finite, SHARED global catalog — mirroring the exercises
-- catalog (see 20260813000001_workouts_exercises.sql + 20260930000001_global_
-- exercises.sql). Previously `workouts.workout_type` was free text, which allowed
-- duplicates ("Run" vs "Running") and forced emoji icons to be guessed by brittle
-- substring matching in the UI. Now each type is a row carrying its own emoji, and
-- `workouts` references it by id — a workout cannot have a type outside the catalog.
--
-- Like exercises: SELECT is global (everyone sees every type); any authenticated
-- user (including the AI coach, acting as the signed-in user) may INSERT a new
-- global type; there are no UPDATE/DELETE policies, so global rows are immutable
-- via the app. A case-insensitive unique name prevents duplicates.

create table if not exists public.workout_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text not null,
  created_at timestamptz not null default now()
);

alter table public.workout_types enable row level security;

create policy "workout_types: select all"
  on public.workout_types for select
  using (true);

create policy "workout_types: insert global"
  on public.workout_types for insert
  to authenticated
  with check (true);

-- One type per name, case-insensitive — backstops the app-level reuse lookup.
create unique index if not exists workout_types_name_unique
  on public.workout_types (lower(name));

-- ── Seed from the distinct existing workout_type strings ─────────────────────
-- Emoji mapping reproduces the UI's old activityIcon logic (💪 fallback).
insert into public.workout_types (name, emoji)
select
  name,
  case
    when lower(name) like '%run%'                                     then '🏃'
    when lower(name) like '%bike%' or lower(name) like '%cycl%'
      or lower(name) like '%spin%'                                    then '🚴'
    when lower(name) like '%swim%'                                    then '🏊'
    when lower(name) like '%pickle%' or lower(name) like '%tennis%'
      or lower(name) like '%paddle%'                                  then '🎾'
    when lower(name) like '%hik%'                                     then '🥾'
    when lower(name) like '%walk%'                                    then '🚶'
    when lower(name) like '%yoga%' or lower(name) like '%stretch%'
      or lower(name) like '%mobility%'                                then '🧘'
    when lower(name) like '%roller%' or lower(name) like '%skate%'    then '⛸️'
    when lower(name) like '%soccer%' or lower(name) like '%football%' then '⚽'
    when lower(name) like '%gym%' or lower(name) like '%strength%'
      or lower(name) like '%lift%'                                    then '🏋️'
    when lower(name) like '%boulder%' or lower(name) like '%climb%'   then '🧗'
    when lower(name) like '%ski%'                                     then '⛷️'
    when lower(name) like '%row%'                                     then '🚣'
    when lower(name) like '%volley%'                                  then '🏐'
    when lower(name) like '%dance%'                                   then '💃'
    else '💪'
  end as emoji
from (
  select distinct trim(workout_type) as name
  from public.workouts
  where workout_type is not null and trim(workout_type) <> ''
) distinct_types
on conflict do nothing;

-- ── Point workouts at the catalog, backfill, drop the old text column ─────────
alter table public.workouts
  add column if not exists workout_type_id uuid references public.workout_types (id);

update public.workouts w
set workout_type_id = t.id
from public.workout_types t
where lower(trim(w.workout_type)) = lower(t.name);

alter table public.workouts
  drop column if exists workout_type;
