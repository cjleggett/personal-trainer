-- Seed Soccer as a duration-only activity so the "Soccer" workout type can
-- auto-add its exercise. Global (owner_id null).
insert into public.exercises (owner_id, name, muscle_group, equipment, measurement_type) values
  (null, 'Soccer', 'cardio', 'none', 'time_only')
on conflict do nothing;
