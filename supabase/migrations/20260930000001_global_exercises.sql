-- Exercises are a SHARED, global catalog: there are no user-specific exercises.
-- Any authenticated user (including the AI coach, which acts as the signed-in
-- user) may add a new exercise, and it becomes available to everyone. Previously
-- the insert policy only allowed a user to create rows they OWNED (owner_id =
-- auth.uid()), which made creating a global row (owner_id null) impossible.
--
-- This migration flips the catalog to global-only:
--   - inserts must be global (owner_id null); authenticated users may do it
--   - a case-insensitive unique name prevents duplicate catalog entries
-- SELECT stays "everyone sees global"; UPDATE/DELETE remain effectively closed
-- for global rows (the old owner-scoped policies never match owner_id null), so
-- no user can mutate or remove an exercise others may rely on.

-- Replace the owner-scoped insert policy with a global one.
drop policy if exists "exercises: insert own" on public.exercises;
create policy "exercises: insert global"
  on public.exercises for insert
  to authenticated
  with check (owner_id is null);

-- The owner-scoped update/delete policies are now dead code for a global-only
-- catalog (they can only match owner_id = auth.uid(), and no rows are owned).
-- Drop them so the policy set reflects reality: global rows are immutable via
-- the app.
drop policy if exists "exercises: update own" on public.exercises;
drop policy if exists "exercises: delete own" on public.exercises;

-- Enforce "one exercise per name" case-insensitively so the coach (or a user)
-- reusing an existing movement can't create a duplicate. Backstops the app-level
-- lookup against races. Scoped to global rows for clarity (all rows are global).
create unique index if not exists exercises_name_unique
  on public.exercises (lower(name))
  where owner_id is null;
