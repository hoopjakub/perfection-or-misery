-- P8-88 · A real profile page, one the player shapes. P8-89 reads it too.
--
-- NOT APPLIED YET. Run it once in the Supabase SQL editor (it is safe to run
-- again: every statement checks before it creates). The app works before it
-- is applied: every new column and table is optional there, and the profile
-- page shows what exists.
--
-- Why the split: `profiles` is public-readable (profiles_public_read, see
-- policies.sql), because Ranks joins the username. Row-level security can't
-- hide single columns, so the parts a player can hide live in their own table,
-- readable only by its owner, and everyone else reads them through
-- public_profile(), which returns only the sections the owner made visible.

-- ── Public, beside the name everywhere ────────────────────────────────────────
-- The avatar, and the favourite team's badge. The app writes badge_team_* from
-- profile_details on every save, and clears them while favourites are hidden,
-- so the badge follows the privacy switch.
alter table public.profiles add column if not exists avatar_path     text;
alter table public.profiles add column if not exists badge_team_id   text;
alter table public.profiles add column if not exists badge_team_name text;

-- ── Private: what the player can choose to show ───────────────────────────────
create table if not exists public.profile_details (
  user_id             uuid primary key references public.profiles(id) on delete cascade,
  favourite_team_id   text,
  favourite_team_name text,
  favourite_player    text,
  show_runs           boolean not null default true,   -- pinned runs
  show_achievements   boolean not null default true,
  show_playtime       boolean not null default true,
  show_favourites     boolean not null default true,
  pinned_run_ids      uuid[]  not null default '{}',
  shown_achievements  text[]  not null default '{}',
  updated_at          timestamptz not null default now()
);
alter table public.profile_details enable row level security;
drop policy if exists "pd_own_read"   on public.profile_details;
drop policy if exists "pd_own_insert" on public.profile_details;
drop policy if exists "pd_own_update" on public.profile_details;
create policy "pd_own_read"   on public.profile_details for select using (auth.uid() = user_id);
create policy "pd_own_insert" on public.profile_details for insert with check (auth.uid() = user_id);
create policy "pd_own_update" on public.profile_details for update using (auth.uid() = user_id);

-- ── The look: its own table, so it can grow without touching profiles ────────
-- Colour and effect stay inside the palette (P8-74): the effects are Kit Drop
-- trims, not glows or gradients.
create table if not exists public.profile_looks (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  colour     text not null default 'ink',
  effect     text not null default 'none' check (effect in ('none', 'tape', 'stripe', 'rivets', 'stitch')),
  updated_at timestamptz not null default now()
);
alter table public.profile_looks enable row level security;
drop policy if exists "pl_public_read" on public.profile_looks;
drop policy if exists "pl_own_insert"  on public.profile_looks;
drop policy if exists "pl_own_update"  on public.profile_looks;
create policy "pl_public_read" on public.profile_looks for select using (true);
create policy "pl_own_insert"  on public.profile_looks for insert with check (auth.uid() = user_id);
create policy "pl_own_update"  on public.profile_looks for update using (auth.uid() = user_id);

-- ── Playing time ──────────────────────────────────────────────────────────────
-- Seconds from choosing a mode to the run being saved (capped in the app).
alter table public.runs add column if not exists duration_seconds integer;
-- With server scoring on (EXPO_PUBLIC_SERVER_SCORING=1), also add 'duration_seconds'
-- to ALLOWED in supabase/functions/submit-run/index.ts and redeploy it, AFTER
-- this column exists: the function drops any column it doesn't allow.

-- ── What anyone may see of a profile ──────────────────────────────────────────
-- security definer: it reads profile_details on the owner's behalf and hands
-- back only the sections they made visible. Hidden sections come back null.
create or replace function public.public_profile(uid uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'id',           p.id,
    'username',     p.username,
    'avatar_path',  p.avatar_path,
    'badge_team_id',   p.badge_team_id,
    'badge_team_name', p.badge_team_name,
    'favourite_team_id',   case when coalesce(d.show_favourites, true) then d.favourite_team_id end,
    'favourite_team_name', case when coalesce(d.show_favourites, true) then d.favourite_team_name end,
    'favourite_player',    case when coalesce(d.show_favourites, true) then d.favourite_player end,
    'pinned_run_ids',      case when coalesce(d.show_runs, true) then d.pinned_run_ids end,
    'shown_achievements',  case when coalesce(d.show_achievements, true) then d.shown_achievements end,
    'playtime_seconds',    case when coalesce(d.show_playtime, true)
                             then (select coalesce(sum(r.duration_seconds), 0) from runs r where r.user_id = p.id) end,
    'runs_played',  (select count(*) from runs r where r.user_id = p.id),
    'colour',       l.colour,
    'effect',       l.effect
  )
  from profiles p
  left join profile_details d on d.user_id = p.id
  left join profile_looks   l on l.user_id = p.id
  where p.id = uid
$$;
grant execute on function public.public_profile(uuid) to anon, authenticated;

-- ── Avatars: one public bucket, each player writes only their own folder ──────
-- The app uploads <user id>/avatar.jpg, already resized to about 512 px and
-- re-encoded on the device (never the raw camera photo).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;
drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "avatars_own_insert"  on storage.objects;
drop policy if exists "avatars_own_update"  on storage.objects;
drop policy if exists "avatars_own_delete"  on storage.objects;
create policy "avatars_public_read" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatars_own_insert"  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_own_update"  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_own_delete"  on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Deleting the account (supabase/functions/delete-account) removes the avatar
-- file and the details and look rows; the rows also cascade from profiles.
