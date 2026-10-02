-- Birthday — optional date of birth on the profile.
--
-- Collected (optionally) during onboarding alongside the required display_name.
-- Lets the coach reason about age-appropriate training. `display_name` already
-- exists (20260811000001); this just adds the companion date.
alter table public.profiles
  add column if not exists birthday date;
