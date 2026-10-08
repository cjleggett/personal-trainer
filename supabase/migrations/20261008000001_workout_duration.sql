-- A top-level, manually-entered session duration on a workout, in canonical
-- seconds. For activities whose time is already captured per-exercise (a run's
-- distance_time set), duration still rolls up from exercise_instances; this
-- column is for sessions where that doesn't make sense (a gym workout, a class)
-- and the athlete knows the overall time. When set, it OVERRIDES the per-exercise
-- rollup as the session's duration; when null, the rollup is used (see
-- effective-duration handling in the app). Nullable, no default.
alter table public.workouts
  add column if not exists duration_s integer;
