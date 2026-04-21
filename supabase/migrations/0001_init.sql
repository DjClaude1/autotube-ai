-- AutoTube AI — initial schema
-- Run this migration against your Supabase project (or paste into the SQL editor).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles: one row per auth.users, with credits + stripe mapping.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  credits integer not null default 0,
  stripe_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_stripe_customer_idx
  on public.profiles(stripe_customer_id);

-- ---------------------------------------------------------------------------
-- Videos: one row per generated (or in-progress) video.
-- ---------------------------------------------------------------------------
create type public.video_status as enum (
  'queued',
  'generating_idea',
  'generating_script',
  'generating_voice',
  'splitting_scenes',
  'rendering',
  'uploading',
  'completed',
  'failed',
  'canceled'
);

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null,
  title text,
  idea text,
  script jsonb,
  scenes jsonb,
  status public.video_status not null default 'queued',
  progress integer not null default 0,
  error text,
  video_url text,
  thumbnail_url text,
  duration_seconds numeric,
  job_id text,
  credits_charged integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists videos_user_id_idx on public.videos(user_id, created_at desc);
create index if not exists videos_status_idx on public.videos(status);

-- ---------------------------------------------------------------------------
-- Credit ledger: full audit trail of every credit movement.
-- ---------------------------------------------------------------------------
create type public.credit_reason as enum (
  'signup_bonus',
  'purchase',
  'spend',
  'refund',
  'manual_adjustment'
);

create table if not exists public.credit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,
  reason public.credit_reason not null,
  video_id uuid references public.videos(id) on delete set null,
  stripe_event_id text unique,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists credit_events_user_id_idx
  on public.credit_events(user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_updated_at_profiles on public.profiles;
create trigger set_updated_at_profiles
before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_videos on public.videos;
create trigger set_updated_at_videos
before update on public.videos
for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Handle new user: insert profile with free credits.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bonus integer := coalesce(nullif(current_setting('app.free_signup_credits', true), '')::int, 2);
begin
  insert into public.profiles (id, email, credits)
  values (new.id, new.email, bonus)
  on conflict (id) do nothing;

  insert into public.credit_events (user_id, delta, reason, metadata)
  values (new.id, bonus, 'signup_bonus', jsonb_build_object('source', 'auth.users trigger'));

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Atomic credit operations (called by the Node API with service role key).
-- ---------------------------------------------------------------------------
create or replace function public.spend_credits(
  p_user_id uuid,
  p_amount integer,
  p_video_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
begin
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  update public.profiles
     set credits = credits - p_amount
   where id = p_user_id
     and credits >= p_amount
  returning credits into new_balance;

  if new_balance is null then
    raise exception 'insufficient_credits';
  end if;

  insert into public.credit_events (user_id, delta, reason, video_id)
  values (p_user_id, -p_amount, 'spend', p_video_id);

  return new_balance;
end;
$$;

create or replace function public.refund_credits(
  p_user_id uuid,
  p_amount integer,
  p_video_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
begin
  update public.profiles
     set credits = credits + p_amount
   where id = p_user_id
  returning credits into new_balance;

  insert into public.credit_events (user_id, delta, reason, video_id)
  values (p_user_id, p_amount, 'refund', p_video_id);

  return new_balance;
end;
$$;

create or replace function public.add_credits(
  p_user_id uuid,
  p_amount integer,
  p_stripe_event_id text,
  p_metadata jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
begin
  -- Idempotency: if we've already processed this stripe event, no-op.
  if p_stripe_event_id is not null
     and exists (select 1 from public.credit_events where stripe_event_id = p_stripe_event_id)
  then
    select credits into new_balance from public.profiles where id = p_user_id;
    return new_balance;
  end if;

  update public.profiles
     set credits = credits + p_amount
   where id = p_user_id
  returning credits into new_balance;

  insert into public.credit_events (user_id, delta, reason, stripe_event_id, metadata)
  values (p_user_id, p_amount, 'purchase', p_stripe_event_id, p_metadata);

  return new_balance;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.videos enable row level security;
alter table public.credit_events enable row level security;

-- profiles: users can read their own profile only.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- videos: users can read/write their own; the server (service role) bypasses RLS.
drop policy if exists "videos_select_own" on public.videos;
create policy "videos_select_own" on public.videos
  for select using (auth.uid() = user_id);

drop policy if exists "videos_insert_own" on public.videos;
create policy "videos_insert_own" on public.videos
  for insert with check (auth.uid() = user_id);

drop policy if exists "videos_update_own" on public.videos;
create policy "videos_update_own" on public.videos
  for update using (auth.uid() = user_id);

-- credit_events: read-only for the owner.
drop policy if exists "credit_events_select_own" on public.credit_events;
create policy "credit_events_select_own" on public.credit_events
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Storage bucket for rendered videos.
-- The server uploads to this bucket with the service role key.
-- Public read so that the <video> tag can stream without a signed URL.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('autotube-videos', 'autotube-videos', true)
on conflict (id) do nothing;

-- Only the service role writes; public read is handled by the bucket flag above.
drop policy if exists "autotube_videos_service_write" on storage.objects;
create policy "autotube_videos_service_write" on storage.objects
  for all
  using (bucket_id = 'autotube-videos' and auth.role() = 'service_role')
  with check (bucket_id = 'autotube-videos' and auth.role() = 'service_role');
