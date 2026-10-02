-- Periodic plan re-evaluation. The coach reviews a plan against the athlete's
-- actual recent training and proposes adjustments; the dashboard nudges the
-- athlete to do this when a plan has gone stale.
--
-- `updated_at` already tracks the last time the plan ROW changed (trigger). But
-- a re-evaluation that concludes "you're on track, no change" doesn't touch the
-- row — yet it should still reset the nudge clock, or the athlete gets nagged
-- again immediately after reviewing. So we track re-evaluations separately and
-- compute staleness from the later of the two timestamps.
alter table public.training_plans
  add column if not exists last_reevaluated_at timestamptz;  -- null until first re-evaluation
