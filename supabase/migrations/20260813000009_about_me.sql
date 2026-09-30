-- "About me" — user-authored context, the counterpart to coach_notes.
--
-- Two durable free-text blobs on the profile feed the AI's context:
--   about_me    — USER-ONLY. The user writes this; the agent reads it but must
--                 never overwrite it. (Enforced in app code: coach actions only
--                 ever write coach_notes. RLS can't tell user from agent because
--                 the agent runs under the user's own session.)
--   coach_notes — SHARED. Both the user (via the About Me UI) and the agent (when
--                 it learns a durable preference mid-chat) edit this. (Added in
--                 20260813000005.)
alter table public.profiles
  add column if not exists about_me text;
