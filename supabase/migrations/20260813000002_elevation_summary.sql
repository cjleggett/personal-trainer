-- Promote elevation gain to a summarized cardio metric. The set-level key
-- `elevation_gain_m` already works inside the `sets` JSONB (free-form); this adds
-- the rolled-up summary column so elevation trends stay pure SQL, matching
-- total_distance_m / total_duration_s.

alter table public.exercise_instances
  add column if not exists total_elevation_m numeric
    generated always as (public.sets_sum(sets, 'elevation_gain_m')) stored;
