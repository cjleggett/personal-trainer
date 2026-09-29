-- Coach notes: a freeform, user-level "things the coach should know" blob —
-- durable preferences and context the AI should respect and not re-ask about
-- (e.g. "hates push-ups", "prefers morning sessions", "training for general
-- fitness"). Injuries/limitations continue to live in `constraints`; this is for
-- everything else the coach learns over time. Intended to be user-editable later.
alter table public.profiles
  add column if not exists coach_notes text;
