-- Seed a couple more cardio activities so common workout types (Hike,
-- Rollerblade) can auto-add their exercise. Global (owner_id null).
insert into public.exercises (owner_id, name, muscle_group, equipment, measurement_type) values
  (null, 'Hiking',        'cardio', 'none',        'distance_time'),
  (null, 'Rollerblading', 'cardio', 'rollerblades','distance_time')
on conflict do nothing;
