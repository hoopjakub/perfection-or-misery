-- P8-181 · Clubs. Run once in the Supabase SQL editor (after profile.sql).
-- Safe to run again. Until it's run the Clubs screen says so and nothing else
-- changes.
--
-- The maintainer, 28 September 2026: the letters on your ID tag become a
-- club's tag. You start with none; join a club and you wear its tag. A club has
-- a name, a tag, a colour, a line about it, an optional member limit (none by
-- default) and a chat for its members.
--
-- One club per player. Creating, joining and leaving go through the functions
-- below (security definer), so each is one step that can't half-happen: a club
-- is never left without an owner, a full club can't be joined, and the tag is
-- copied onto the member's profile (profiles.club_tag), so it can sit beside
-- the name anywhere a name is shown (the Ranks included) without a join.

create table if not exists public.clubs (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 3 and 30),
  tag          text not null check (tag ~ '^[A-Z0-9]{2,4}$'),
  colour       text not null default '#ff5a00' check (colour ~ '^#[0-9a-f]{6}$'),
  about        text check (char_length(about) <= 190),
  member_limit integer check (member_limit is null or member_limit between 2 and 500),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now()
);
create unique index if not exists clubs_name_unique on public.clubs (lower(name));
create unique index if not exists clubs_tag_unique on public.clubs (tag);

create table if not exists public.club_members (
  user_id   uuid primary key references public.profiles(id) on delete cascade,   -- one club per player
  club_id   uuid not null references public.clubs(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now()
);
create index if not exists club_members_club on public.club_members (club_id);

create table if not exists public.club_messages (
  id         bigint generated always as identity primary key,
  club_id    uuid not null references public.clubs(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists club_messages_club_time on public.club_messages (club_id, created_at desc);

-- The tag beside your name, everywhere.
alter table public.profiles add column if not exists club_tag text;

-- ── Who can do what ───────────────────────────────────────────────────────────
alter table public.clubs         enable row level security;
alter table public.club_members  enable row level security;
alter table public.club_messages enable row level security;

-- A club and its members are public, like a profile. Every change goes
-- through the functions below: there are no insert, update or delete
-- policies, so nothing can be written around them (an owner can't hand the
-- club to a stranger, or change the tag without the members' profiles following).
drop policy if exists "clubs_read"        on public.clubs;
drop policy if exists "clubs_owner_edit"  on public.clubs;
create policy "clubs_read"       on public.clubs for select using (true);

drop policy if exists "club_members_read" on public.club_members;
create policy "club_members_read" on public.club_members for select using (true);

-- The chat is the members': only they read it and write to it, each as themself.
create or replace function public.is_club_member(c uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from club_members m where m.club_id = c and m.user_id = auth.uid()) $$;

drop policy if exists "club_messages_read"   on public.club_messages;
drop policy if exists "club_messages_write"  on public.club_messages;
drop policy if exists "club_messages_delete" on public.club_messages;
create policy "club_messages_read"   on public.club_messages for select using (public.is_club_member(club_id));
create policy "club_messages_write"  on public.club_messages for insert with check (auth.uid() = user_id and public.is_club_member(club_id));
create policy "club_messages_delete" on public.club_messages for delete using (
  auth.uid() = user_id or exists (select 1 from clubs c where c.id = club_id and c.owner_id = auth.uid()));

-- ── Creating, joining, leaving ────────────────────────────────────────────────
-- A guest's session is anonymous and its runs aren't kept, so it can't hold a club.
create or replace function public.club_player_check()
returns void language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  if exists (select 1 from profiles where id = auth.uid() and coalesce(is_guest, false)) then raise exception 'GUEST'; end if;
end $$;

create or replace function public.create_club(p_name text, p_tag text, p_colour text, p_about text, p_limit integer)
returns uuid language plpgsql security definer set search_path = public
as $$
declare new_id uuid;
begin
  perform club_player_check();
  if exists (select 1 from club_members where user_id = auth.uid()) then raise exception 'ALREADY_IN_A_CLUB'; end if;
  insert into clubs (name, tag, colour, about, member_limit, owner_id)
    values (trim(p_name), upper(p_tag), lower(p_colour), nullif(trim(p_about), ''), p_limit, auth.uid())
    returning id into new_id;
  insert into club_members (user_id, club_id, role) values (auth.uid(), new_id, 'owner');
  update profiles set club_tag = upper(p_tag) where id = auth.uid();
  return new_id;
end $$;

create or replace function public.join_club(p_club uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare lim integer; n integer; t text;
begin
  perform club_player_check();
  if exists (select 1 from club_members where user_id = auth.uid()) then raise exception 'ALREADY_IN_A_CLUB'; end if;
  select member_limit, tag into lim, t from clubs where id = p_club for update;
  if t is null then raise exception 'NO_SUCH_CLUB'; end if;
  select count(*) into n from club_members where club_id = p_club;
  if lim is not null and n >= lim then raise exception 'CLUB_FULL'; end if;
  insert into club_members (user_id, club_id) values (auth.uid(), p_club);
  update profiles set club_tag = t where id = auth.uid();
end $$;

-- Leaving. An owner who leaves hands the club to the member who's been in it
-- longest; the last one out closes it.
create or replace function public.leave_club()
returns void language plpgsql security definer set search_path = public
as $$
declare c uuid; r text; heir uuid;
begin
  select club_id, role into c, r from club_members where user_id = auth.uid();
  if c is null then return; end if;
  delete from club_members where user_id = auth.uid();
  update profiles set club_tag = null where id = auth.uid();
  if r = 'owner' then
    select user_id into heir from club_members where club_id = c order by joined_at limit 1;
    if heir is null then delete from clubs where id = c;
    else
      update club_members set role = 'owner' where user_id = heir;
      update clubs set owner_id = heir where id = c;
    end if;
  end if;
end $$;

-- The owner removing a member.
create or replace function public.remove_from_club(p_user uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare c uuid;
begin
  select id into c from clubs where owner_id = auth.uid();
  if c is null or p_user = auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  delete from club_members where user_id = p_user and club_id = c;
  update profiles set club_tag = null where id = p_user;
end $$;

-- The owner editing the club. A new tag follows onto every member's profile;
-- a new limit can't be below the members it already has.
create or replace function public.update_club(p_name text, p_tag text, p_colour text, p_about text, p_limit integer)
returns void language plpgsql security definer set search_path = public
as $$
declare c uuid; n integer;
begin
  select id into c from clubs where owner_id = auth.uid();
  if c is null then raise exception 'NOT_ALLOWED'; end if;
  select count(*) into n from club_members where club_id = c;
  if p_limit is not null and p_limit < n then raise exception 'LIMIT_BELOW_MEMBERS'; end if;
  update clubs set name = trim(p_name), tag = upper(p_tag), colour = lower(p_colour), about = nullif(trim(p_about), ''), member_limit = p_limit where id = c;
  update profiles set club_tag = upper(p_tag) where id in (select user_id from club_members where club_id = c);
end $$;

grant execute on function public.create_club(text, text, text, text, integer) to authenticated;
grant execute on function public.join_club(uuid) to authenticated;
grant execute on function public.leave_club() to authenticated;
grant execute on function public.remove_from_club(uuid) to authenticated;
grant execute on function public.update_club(text, text, text, text, integer) to authenticated;

-- ── The chat, live ────────────────────────────────────────────────────────────
-- New messages reach an open chat through Realtime; the read policy above
-- decides who receives them, so a message never reaches anyone outside the club.
do $$ begin
  alter publication supabase_realtime add table public.club_messages;
exception when duplicate_object then null; end $$;
