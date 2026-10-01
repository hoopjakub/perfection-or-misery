-- P8.5-05, -08, -09, -10 · Clubs, part two. Run once in the Supabase SQL
-- editor, after clubs.sql. Safe to run again. Until it's run the app keeps
-- working as before; the new parts say they need it.
--
--   05 · delete a club; hand it over; an owner leaving chooses who takes over
--   08 · invite-only clubs and clubs with a password
--   09 · the clubs leaderboard: every member's runs added together, no seasons
--   10 · the swear filter: on by default, a switch per club; a word is never
--        refused, it's replaced by a funny one (the list is a table, so it can
--        grow without a new app build)

create extension if not exists pgcrypto;

-- ── 08 · Who can join ─────────────────────────────────────────────────────────
-- 'open' (anyone, as before), 'invite' (only someone invited), 'password'.
alter table public.clubs add column if not exists access text not null default 'open'
  check (access in ('open', 'invite', 'password'));

-- The password's hash lives apart from the club: clubs are readable by
-- everyone, and a hash in that table would be readable too. This table has
-- row level security on and no policies at all, so only the functions below
-- (security definer) ever touch it.
create table if not exists public.club_secrets (
  club_id       uuid primary key references public.clubs(id) on delete cascade,
  password_hash text not null
);
alter table public.club_secrets enable row level security;

create table if not exists public.club_invites (
  club_id    uuid not null references public.clubs(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
alter table public.club_invites enable row level security;
-- The invited player sees their invites; the club's owner sees whom they invited.
drop policy if exists "club_invites_read" on public.club_invites;
create policy "club_invites_read" on public.club_invites for select using (
  user_id = auth.uid() or exists (select 1 from clubs c where c.id = club_id and c.owner_id = auth.uid()));

-- Joining, now with the club's way in. The old one-argument join_club stays
-- for an app that hasn't updated (it's the open way in, nothing else).
create or replace function public.join_club(p_club uuid, p_password text)
returns void language plpgsql security definer set search_path = public
as $$
declare lim integer; n integer; t text; a text; h text;
begin
  perform club_player_check();
  if exists (select 1 from club_members where user_id = auth.uid()) then raise exception 'ALREADY_IN_A_CLUB'; end if;
  select member_limit, tag, access into lim, t, a from clubs where id = p_club for update;
  if t is null then raise exception 'NO_SUCH_CLUB'; end if;
  if a = 'invite' and not exists (select 1 from club_invites where club_id = p_club and user_id = auth.uid()) then
    raise exception 'INVITE_ONLY';
  end if;
  if a = 'password' then
    select password_hash into h from club_secrets where club_id = p_club;
    if h is null or p_password is null or crypt(p_password, h) <> h then raise exception 'WRONG_PASSWORD'; end if;
  end if;
  select count(*) into n from club_members where club_id = p_club;
  if lim is not null and n >= lim then raise exception 'CLUB_FULL'; end if;
  insert into club_members (user_id, club_id) values (auth.uid(), p_club);
  delete from club_invites where user_id = auth.uid();
  update profiles set club_tag = t where id = auth.uid();
end $$;

create or replace function public.join_club(p_club uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if (select access from clubs where id = p_club) is distinct from 'open' then raise exception 'INVITE_ONLY'; end if;
  perform join_club(p_club, null);
end $$;

-- The owner sets the way in. A password is kept only as a bcrypt hash.
create or replace function public.set_club_access(p_access text, p_password text)
returns void language plpgsql security definer set search_path = public
as $$
declare c uuid;
begin
  select id into c from clubs where owner_id = auth.uid();
  if c is null then raise exception 'NOT_ALLOWED'; end if;
  if p_access not in ('open', 'invite', 'password') then raise exception 'BAD_ACCESS'; end if;
  if p_access = 'password' then
    if p_password is null or char_length(p_password) < 4 or char_length(p_password) > 64 then raise exception 'BAD_PASSWORD'; end if;
    insert into club_secrets (club_id, password_hash) values (c, crypt(p_password, gen_salt('bf')))
      on conflict (club_id) do update set password_hash = excluded.password_hash;
  else
    delete from club_secrets where club_id = c;
  end if;
  update clubs set access = p_access where id = c;
end $$;

-- The owner invites a player by their username.
create or replace function public.invite_to_club(p_username text)
returns void language plpgsql security definer set search_path = public
as $$
declare c uuid; u uuid;
begin
  select id into c from clubs where owner_id = auth.uid();
  if c is null then raise exception 'NOT_ALLOWED'; end if;
  select id into u from profiles where lower(username) = lower(trim(p_username)) and not coalesce(is_guest, false);
  if u is null then raise exception 'NO_SUCH_PLAYER'; end if;
  if exists (select 1 from club_members where user_id = u and club_id = c) then raise exception 'ALREADY_A_MEMBER'; end if;
  insert into club_invites (club_id, user_id, invited_by) values (c, u, auth.uid()) on conflict do nothing;
end $$;

-- The invited player turns one down.
create or replace function public.decline_club_invite(p_club uuid)
returns void language sql security definer set search_path = public
as $$ delete from club_invites where club_id = p_club and user_id = auth.uid() $$;

-- ── 05 · Deleting, handing over, leaving ──────────────────────────────────────
-- The owner closes the club: everyone's tag goes with it.
create or replace function public.delete_club()
returns void language plpgsql security definer set search_path = public
as $$
declare c uuid;
begin
  select id into c from clubs where owner_id = auth.uid();
  if c is null then raise exception 'NOT_ALLOWED'; end if;
  update profiles set club_tag = null where id in (select user_id from club_members where club_id = c);
  delete from clubs where id = c;   -- members, messages, invites and the secret go by cascade
end $$;

-- The owner hands the club to another member and stays on as a member.
create or replace function public.transfer_club(p_user uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare c uuid;
begin
  select id into c from clubs where owner_id = auth.uid();
  if c is null or p_user = auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if not exists (select 1 from club_members where user_id = p_user and club_id = c) then raise exception 'NOT_A_MEMBER'; end if;
  update club_members set role = 'member' where user_id = auth.uid();
  update club_members set role = 'owner' where user_id = p_user;
  update clubs set owner_id = p_user where id = c;
end $$;

-- Leaving, with the owner's choice of who takes over (null: the member who's
-- been in longest, as before). The last one out closes it.
create or replace function public.leave_club(p_heir uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare c uuid; r text; heir uuid;
begin
  select club_id, role into c, r from club_members where user_id = auth.uid();
  if c is null then return; end if;
  if r = 'owner' and p_heir is not null and not exists (select 1 from club_members where user_id = p_heir and club_id = c and user_id <> auth.uid()) then
    raise exception 'NOT_A_MEMBER';
  end if;
  delete from club_members where user_id = auth.uid();
  update profiles set club_tag = null where id = auth.uid();
  if r = 'owner' then
    heir := coalesce(p_heir, (select user_id from club_members where club_id = c order by joined_at limit 1));
    if heir is null then delete from clubs where id = c;
    else
      update club_members set role = 'owner' where user_id = heir;
      update clubs set owner_id = heir where id = c;
    end if;
  end if;
end $$;

-- ── 09 · The clubs leaderboard ────────────────────────────────────────────────
-- A club's score is every member's runs added together (their scores as
-- saved), over all time: no seasons. Read by anyone, like the Ranks.
create or replace function public.club_board(p_limit integer, p_offset integer)
returns table (id uuid, name text, tag text, colour text, members bigint, runs bigint, score bigint)
language sql stable security definer set search_path = public
as $$
  select c.id, c.name, c.tag, c.colour,
    (select count(*) from club_members m where m.club_id = c.id) as members,
    count(r.id) as runs,
    coalesce(sum(r.score), 0)::bigint as score
  from clubs c
  left join club_members m on m.club_id = c.id
  left join runs r on r.user_id = m.user_id
  group by c.id
  order by score desc, c.created_at
  limit least(greatest(coalesce(p_limit, 50), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
$$;

-- ── 10 · The swear filter ─────────────────────────────────────────────────────
alter table public.clubs add column if not exists clean_chat boolean not null default true;
alter table public.club_messages add column if not exists cleaned boolean not null default false;

-- The words and what they become. A starter list: the maintainer's own list
-- and a researched one join it (P8.5-10); add rows here, no app build needed.
-- Whole words only, any case. Letters only, so a word can't be a pattern.
create table if not exists public.club_swears (
  word        text primary key check (word ~ '^[a-z]+$'),
  replacement text not null check (char_length(replacement) between 1 and 30)
);
alter table public.club_swears enable row level security;
drop policy if exists "club_swears_read" on public.club_swears;
create policy "club_swears_read" on public.club_swears for select using (true);

insert into public.club_swears (word, replacement) values
  ('fuck', 'fudge'), ('fucking', 'fudging'), ('fucked', 'fudged'), ('fucker', 'fudger'), ('fuckin', 'fudgin'), ('motherfucker', 'mother hubbard'),
  ('shit', 'shoot'), ('shite', 'shoot'), ('shitty', 'shoddy'), ('bullshit', 'bull feathers'),
  ('bitch', 'biscuit'), ('bastard', 'bandit'), ('arsehole', 'armchair'), ('asshole', 'armchair'),
  ('dick', 'dingus'), ('dickhead', 'doughnut'), ('prick', 'pickle'), ('wanker', 'wombat'), ('twat', 'twit'),
  ('cunt', 'cucumber'), ('crap', 'crumbs'), ('piss', 'pish'), ('pissed', 'peeved'),
  ('bollocks', 'baubles'), ('damn', 'dang'), ('bloody', 'blooming')
on conflict (word) do nothing;

-- Applied as each message is written, so no app can send around it.
create or replace function public.club_clean_message()
returns trigger language plpgsql security definer set search_path = public
as $$
declare w record; out text := new.body;
begin
  if not coalesce((select clean_chat from clubs where id = new.club_id), true) then return new; end if;
  for w in select word, replacement from club_swears loop
    out := regexp_replace(out, '\m' || w.word || '\M', w.replacement, 'gi');
  end loop;
  if out is distinct from new.body then
    new.body := left(out, 500);
    new.cleaned := true;
  end if;
  return new;
end $$;
drop trigger if exists club_messages_clean on public.club_messages;
create trigger club_messages_clean before insert on public.club_messages
  for each row execute function public.club_clean_message();

-- The owner's switch.
create or replace function public.set_club_clean_chat(p_on boolean)
returns void language plpgsql security definer set search_path = public
as $$
declare c uuid;
begin
  select id into c from clubs where owner_id = auth.uid();
  if c is null then raise exception 'NOT_ALLOWED'; end if;
  update clubs set clean_chat = coalesce(p_on, true) where id = c;
end $$;

grant execute on function public.join_club(uuid, text) to authenticated;
grant execute on function public.join_club(uuid) to authenticated;
grant execute on function public.set_club_access(text, text) to authenticated;
grant execute on function public.invite_to_club(text) to authenticated;
grant execute on function public.decline_club_invite(uuid) to authenticated;
grant execute on function public.delete_club() to authenticated;
grant execute on function public.transfer_club(uuid) to authenticated;
grant execute on function public.leave_club(uuid) to authenticated;
grant execute on function public.club_board(integer, integer) to anon, authenticated;
grant execute on function public.set_club_clean_chat(boolean) to authenticated;
