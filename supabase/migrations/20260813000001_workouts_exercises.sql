-- Logging schema: exercise catalog (global + user customs), workout sessions,
-- and per-exercise-instance logs with a JSONB `sets` array + generated summary
-- columns. Standard metrics are typed/summarized; anything non-standard lives in
-- `extra` jsonb at the appropriate grain (set, instance, or workout).

-- How an exercise is measured — drives which fields the logger shows and which
-- summaries apply.
create type public.measurement_type as enum (
  'weight_reps',   -- weight + reps  (e.g. Back Squat)
  'reps_only',     -- reps (+ optional added weight)  (e.g. Pull-ups)
  'distance_time', -- distance + duration  (e.g. Running)
  'time_only'      -- duration (+ optional distance/load)  (e.g. Plank, Carry)
);

-- ── Catalog ────────────────────────────────────────────────────────────────
-- owner_id NULL  => global seed exercise (readable by everyone)
-- owner_id set   => a user's custom exercise (private to them)
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  name text not null,
  muscle_group text,
  equipment text,
  measurement_type public.measurement_type not null,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists exercises_owner_idx on public.exercises (owner_id);

-- ── Workout session (parent) ────────────────────────────────────────────────
create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  notes text,
  performed_at timestamptz not null default now(),
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists workouts_user_perf_idx
  on public.workouts (user_id, performed_at desc);

-- ── Summary helpers (IMMUTABLE so generated columns may call them) ───────────
-- Sum a single numeric metric across the sets array (ignores sets missing it).
create or replace function public.sets_sum(sets jsonb, metric text)
returns numeric
language sql
immutable
as $$
  select coalesce(sum((elem ->> metric)::numeric), 0)
  from jsonb_array_elements(coalesce(sets, '[]'::jsonb)) as elem
  where elem ? metric;
$$;

-- Training volume = sum(weight * reps) across sets that have both.
create or replace function public.sets_total_load(sets jsonb)
returns numeric
language sql
immutable
as $$
  select coalesce(
    sum(((elem ->> 'weight')::numeric) * ((elem ->> 'reps')::numeric)), 0)
  from jsonb_array_elements(coalesce(sets, '[]'::jsonb)) as elem
  where elem ? 'weight' and elem ? 'reps';
$$;

-- ── Exercise instance (one row per exercise performed in a workout) ──────────
create table if not exists public.exercise_instances (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  position int not null default 0,          -- display order within the workout
  notes text,
  sets jsonb not null default '[]'::jsonb,  -- array of set objects; shape per measurement_type
  extra jsonb not null default '{}'::jsonb, -- instance-level free-form (e.g. music on a run)
  -- Denormalized summaries so volume/cardio trends stay pure SQL.
  total_load numeric generated always as (public.sets_total_load(sets)) stored,
  total_distance_m numeric generated always as (public.sets_sum(sets, 'distance_m')) stored,
  total_duration_s numeric generated always as (public.sets_sum(sets, 'duration_s')) stored,
  created_at timestamptz not null default now()
);
create index if not exists instances_workout_idx
  on public.exercise_instances (workout_id, position);
create index if not exists instances_user_exercise_idx
  on public.exercise_instances (user_id, exercise_id);

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.exercises enable row level security;
alter table public.workouts enable row level security;
alter table public.exercise_instances enable row level security;

-- Catalog: everyone sees global seeds + their own customs; users manage only
-- their own customs.
create policy "exercises: select global or own"
  on public.exercises for select
  using (owner_id is null or owner_id = (select auth.uid()));
create policy "exercises: insert own"
  on public.exercises for insert
  with check (owner_id = (select auth.uid()));
create policy "exercises: update own"
  on public.exercises for update
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "exercises: delete own"
  on public.exercises for delete
  using (owner_id = (select auth.uid()));

-- Workouts: owner only, all operations.
create policy "workouts: select own"
  on public.workouts for select using (user_id = (select auth.uid()));
create policy "workouts: insert own"
  on public.workouts for insert with check (user_id = (select auth.uid()));
create policy "workouts: update own"
  on public.workouts for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "workouts: delete own"
  on public.workouts for delete using (user_id = (select auth.uid()));

-- Exercise instances: owner only, all operations.
create policy "instances: select own"
  on public.exercise_instances for select using (user_id = (select auth.uid()));
create policy "instances: insert own"
  on public.exercise_instances for insert with check (user_id = (select auth.uid()));
create policy "instances: update own"
  on public.exercise_instances for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "instances: delete own"
  on public.exercise_instances for delete using (user_id = (select auth.uid()));

-- ── Seed a small global catalog (owner_id NULL = shared) ─────────────────────
insert into public.exercises (owner_id, name, muscle_group, equipment, measurement_type) values
  (null, 'Back Squat',        'legs',    'barbell',    'weight_reps'),
  (null, 'Deadlift',          'back',    'barbell',    'weight_reps'),
  (null, 'Bench Press',       'chest',   'barbell',    'weight_reps'),
  (null, 'Overhead Press',    'shoulders','barbell',   'weight_reps'),
  (null, 'Barbell Row',       'back',    'barbell',    'weight_reps'),
  (null, 'Pull-up',           'back',    'bodyweight', 'reps_only'),
  (null, 'Push-up',           'chest',   'bodyweight', 'reps_only'),
  (null, 'Bodyweight Squat',  'legs',    'bodyweight', 'reps_only'),
  (null, 'Running',           'cardio',  'none',       'distance_time'),
  (null, 'Cycling',           'cardio',  'bike',       'distance_time'),
  (null, 'Rowing',            'cardio',  'rower',      'distance_time'),
  (null, 'Swimming',          'cardio',  'none',       'distance_time'),
  (null, 'Plank',             'core',    'bodyweight', 'time_only'),
  (null, 'Farmer''s Carry',   'full',    'dumbbell',   'time_only')
on conflict do nothing;
