-- P8-90 · Friends: requests, a friends list and notifications.
--
-- NOT APPLIED YET. Run it once in the Supabase SQL editor (safe to run again).
--
-- Why functions and not INSERT policies: the tables (friend_requests,
-- friendships, notifications; schema in perfection-or-misery-tech.md §9) have
-- no INSERT policy for friendships or notifications, and policies.sql once
-- suggested adding open ones. An open insert on friendships would let any
-- signed-in player write "we're friends" with anyone, no request needed, and
-- an open insert on notifications would let anyone post into anyone's
-- notifications. Instead the three things a player can do are functions that
-- check who's asking and what already exists, then write every row
-- themselves (security definer). The tables stay closed to direct writes.

-- A guest (anonymous sign-in) can't make friends: their account isn't kept.
create or replace function public.pom_is_member()
returns boolean language sql stable as $$
  select auth.uid() is not null and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
$$;

-- ── Send a request (or accept theirs, if they already asked you) ──────────────
-- Returns 'sent', 'accepted' (they had asked you first, so you're friends now),
-- 'already_friends' or 'already_sent'.
create or replace function public.send_friend_request(target uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  theirs uuid;
  my_name text;
begin
  if not pom_is_member() then raise exception 'NOT_A_MEMBER'; end if;
  if target is null or target = me then raise exception 'BAD_TARGET'; end if;
  if not exists (select 1 from profiles where id = target and not coalesce(is_guest, false)) then raise exception 'USER_NOT_FOUND'; end if;
  if exists (select 1 from friendships where user_id = me and friend_id = target) then return 'already_friends'; end if;

  -- They asked first: asking back accepts.
  select id into theirs from friend_requests where from_user_id = target and to_user_id = me and status = 'pending';
  if theirs is not null then
    perform respond_friend_request(theirs, true);
    return 'accepted';
  end if;

  select username into my_name from profiles where id = me;
  insert into friend_requests (from_user_id, to_user_id, status) values (me, target, 'pending')
  on conflict (from_user_id, to_user_id) do update set status = 'pending', created_at = now()
    where friend_requests.status <> 'pending';
  if not found then return 'already_sent'; end if;
  insert into notifications (user_id, type, payload)
  values (target, 'friend_request', json_build_object('fromUserId', me, 'fromUsername', my_name));
  return 'sent';
end $$;

-- ── Accept or decline a request sent to you ───────────────────────────────────
create or replace function public.respond_friend_request(request_id uuid, accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  req friend_requests%rowtype;
  my_name text;
begin
  if not pom_is_member() then raise exception 'NOT_A_MEMBER'; end if;
  select * into req from friend_requests where id = request_id and to_user_id = me and status = 'pending';
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  update friend_requests set status = case when accept then 'accepted' else 'rejected' end where id = request_id;
  if accept then
    insert into friendships (user_id, friend_id) values (me, req.from_user_id), (req.from_user_id, me)
    on conflict do nothing;
    select username into my_name from profiles where id = me;
    insert into notifications (user_id, type, payload)
    values (req.from_user_id, 'friend_accepted', json_build_object('fromUserId', me, 'fromUsername', my_name));
  end if;
  -- The request's own notification is dealt with either way.
  update notifications set read = true
  where user_id = me and type = 'friend_request' and payload ->> 'fromUserId' = req.from_user_id::text;
end $$;

-- ── Remove a friend (both sides) ──────────────────────────────────────────────
create or replace function public.remove_friend(friend uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if not pom_is_member() then raise exception 'NOT_A_MEMBER'; end if;
  delete from friendships where (user_id = me and friend_id = friend) or (user_id = friend and friend_id = me);
  -- So either of you can ask again later.
  delete from friend_requests where (from_user_id = me and to_user_id = friend) or (from_user_id = friend and to_user_id = me);
end $$;

grant execute on function public.send_friend_request(uuid)            to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid)                  to authenticated;

-- You can read your own requests (fr_read), your own friendships (fs_read)
-- and your own notifications (notif_read, notif_update to mark them read).
-- Nothing here opens a table to direct writes.

-- ── Usernames: 38 characters at most (the You redesign, batch 16) ─────────────
-- The app enforces it on sign-up (USERNAME_MAX in src/lib/auth.ts); this makes
-- it hold for anything that writes a profile. `not valid` so any longer name
-- that already exists isn't rejected; only new and changed names are checked.
alter table public.profiles drop constraint if exists profiles_username_length;
alter table public.profiles add constraint profiles_username_length
  check (username is null or char_length(username) <= 38) not valid;
