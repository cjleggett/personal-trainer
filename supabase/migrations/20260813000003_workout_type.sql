-- Workout type (Gym, Run, Bike, Swim, …). Free text rather than an enum so
-- users can record any activity without a schema change — consistent with the
-- app's "let users add their own" approach. Used to autofill the title.
alter table public.workouts
  add column if not exists workout_type text;
