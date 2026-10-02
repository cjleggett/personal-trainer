-- One-off data migration: fold any remaining user-OWNED exercises into the
-- shared global catalog. These predate the global-only model (see
-- 20260930000001_global_exercises.sql); the catalog is now global-only, so no
-- exercise should stay privately owned.
--
-- Safe because exercise_instances reference exercises by id (unchanged here), so
-- every owner's logged history keeps pointing at the same row — only its
-- visibility widens from private to global.
--
-- Guard: only null-out an owned row when NO existing global row already shares
-- its name (case-insensitive). That respects the unique index from the prior
-- migration — if a same-named global already exists, we leave the owned row as
-- is rather than fail the migration. (At write time there are no such
-- collisions; the guard just makes this robust if the data drifts.)
update public.exercises e
set owner_id = null
where e.owner_id is not null
  and not exists (
    select 1
    from public.exercises g
    where g.owner_id is null
      and lower(g.name) = lower(e.name)
  );
