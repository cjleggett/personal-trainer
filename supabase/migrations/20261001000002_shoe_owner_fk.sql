-- Enforce that a workout can only reference a shoe owned by the SAME user. The
-- plain workouts.shoe_id FK let a user attach someone else's shoe by id. Replace
-- it with a COMPOSITE FK on (shoe_id, user_id) → shoes(id, user_id), so the DB
-- guarantees cross-user attachment is impossible (defense-in-depth with RLS).
--
-- Composite FK semantics (MATCH SIMPLE, the default): when shoe_id is NULL the
-- constraint is not checked, so "no shoes" stays valid even though user_id is
-- NOT NULL. When shoe_id is set, both columns must match one shoes row.

-- A composite FK needs a matching unique key on the referenced columns.
alter table public.shoes
  add constraint shoes_id_user_unique unique (id, user_id);

alter table public.workouts
  drop constraint if exists workouts_shoe_id_fkey;

-- on delete set null (shoe_id): null ONLY shoe_id when the shoe is deleted —
-- not user_id, which is NOT NULL. (Column-list ON DELETE SET NULL: Postgres 15+.)
alter table public.workouts
  add constraint workouts_shoe_fkey
  foreign key (shoe_id, user_id)
  references public.shoes (id, user_id)
  on delete set null (shoe_id);
