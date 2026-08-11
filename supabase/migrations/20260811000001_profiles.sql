-- Profiles: one row per auth user, holding fitness metadata used to seed
-- workout/plan generation. Created automatically on signup via trigger.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  goals text,
  experience_level text,           -- e.g. 'beginner' | 'intermediate' | 'advanced'
  equipment text,                  -- free text: available equipment
  constraints text,                -- injuries / limitations to respect
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Row-Level Security: a user can only see and modify their own profile.
alter table public.profiles enable row level security;

create policy "profiles: select own"
  on public.profiles for select
  using ((select auth.uid()) = id);

create policy "profiles: insert own"
  on public.profiles for insert
  with check ((select auth.uid()) = id);

create policy "profiles: update own"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at fresh on profile edits.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
