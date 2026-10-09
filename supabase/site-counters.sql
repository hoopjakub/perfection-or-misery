-- Phase 10, step 2 · The landing page's live counter (docs/website/08-HOLES.md §2).
-- Run once in the Supabase SQL editor. Safe to run again (it re-counts).
--
-- One row, kept by triggers, read through one function; nobody reads the table
-- or `runs` for it. The site polls the function every 30 s while a tab is
-- visible: no Realtime (the free plan's 200 connections are the club chat's).
--   runs   every row in runs (a run saved through submit-run counts the moment
--          it lands; a run deleted with its account comes off again)
--   users  real accounts: profiles whose is_guest is false. A guest has a
--          profile too, and becomes real when it's upgraded (src/lib/auth.ts).
--   users_shown_from  below this, site_counters() returns no users figure at
--          all (decided 9 Oct 2026: hidden until it's worth showing).

create table if not exists public.site_counters (
  id               boolean primary key default true check (id),   -- exactly one row
  runs             bigint not null default 0,
  users            bigint not null default 0,
  users_shown_from bigint not null default 100,
  updated_at       timestamptz not null default now()
);
-- Row-level security on and no policy: nobody reads or writes it directly.
alter table public.site_counters enable row level security;
revoke all on table public.site_counters from anon, authenticated;

-- Start from the truth (and re-count whenever this file is run again).
insert into public.site_counters (id, runs, users)
values (true,
        (select count(*) from public.runs),
        (select count(*) from public.profiles where coalesce(is_guest, true) = false))
on conflict (id) do update set runs = excluded.runs, users = excluded.users, updated_at = now();

create or replace function public.site_count_run() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update site_counters set runs = runs + 1, updated_at = now() where id;
  elsif tg_op = 'DELETE' then
    update site_counters set runs = greatest(runs - 1, 0), updated_at = now() where id;
  end if;
  return null;
end $$;

create or replace function public.site_count_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  was_real int := case when tg_op in ('UPDATE', 'DELETE') and coalesce(old.is_guest, true) = false then 1 else 0 end;
  is_real  int := case when tg_op in ('INSERT', 'UPDATE') and coalesce(new.is_guest, true) = false then 1 else 0 end;
begin
  if is_real <> was_real then
    update site_counters set users = greatest(users + is_real - was_real, 0), updated_at = now() where id;
  end if;
  return null;
end $$;

-- Trigger functions aren't for calling.
revoke all on function public.site_count_run()  from public, anon, authenticated;
revoke all on function public.site_count_user() from public, anon, authenticated;

drop trigger if exists site_count_run on public.runs;
create trigger site_count_run after insert or delete on public.runs
  for each row execute function public.site_count_run();

drop trigger if exists site_count_user on public.profiles;
create trigger site_count_user after insert or delete or update of is_guest on public.profiles
  for each row execute function public.site_count_user();

-- The one read: two numbers, and the second only past its threshold.
create or replace function public.site_counters() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('runs', runs, 'users', case when users >= users_shown_from then users end)
  from site_counters where id
$$;
revoke all on function public.site_counters() from public;
grant execute on function public.site_counters() to anon, authenticated;

-- Check (read-only), once it's run:
--   select public.site_counters();     -- {"runs": 142, "users": null} while under 100 accounts
--   select * from public.site_counters; -- as the project owner
