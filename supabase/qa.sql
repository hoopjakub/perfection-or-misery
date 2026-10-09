-- Phase 10, step 3 · The community: updates and questions, and the admin
-- (docs/website/02-COMMUNITY-AND-QUESTIONS.md, 03-ACCOUNTS-AND-THE-ADMIN.md,
-- 04-SECURITY-AND-ABUSE.md §2–§7, 08-HOLES.md H4, H5, H10, H11).
-- Run once in the Supabase SQL editor. Safe to run again. Then run
-- supabase/qa-tests.sql, which plays every rule and undoes itself.
--
-- The rule (04 §2.1): every table has row-level security on and NO policy, so
-- no client can read or write one directly; everything goes through a
-- function below, each `security definer` with a fixed search_path, each
-- taking who's asking from the token (auth.uid()), never from a parameter.
-- Every name starts qa_ or site_: the project also holds Become a Legend's
-- tables (bal_*) and later The Gaffer's (gaf_*), which nothing here touches.
--
-- Errors are short codes the site turns into words: NOT_MEMBER, BANNED,
-- MUST_RENAME, NO_RUN, TOO_SHORT, TOO_LONG, ACTIVE_QUESTION, COOLDOWN <s>,
-- DAILY_LIMIT, SITE_BUSY, NOT_YOURS, NOT_EDITABLE, EDIT_COOLDOWN <s>,
-- EDIT_LIMIT, NO_CONVERSATION, NOT_FOUND, NOT_ADMIN, ADMIN_BUSY, BAD_STATUS.

create extension if not exists pg_trgm with schema extensions;   -- 07 D6: not installed before
create extension if not exists unaccent with schema extensions;

-- ── The admin ───────────────────────────────────────────────────────────────
-- One row (03 §3.1): a unique index on a constant means a second admin is a
-- decision, not an accident. Revoke = delete the row; it takes effect at once.
create table if not exists public.site_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists site_admins_one on public.site_admins ((true));

-- The admin, now, at the second factor (03 §3.3: Supabase's documented form).
create or replace function public.site_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (select 1 from site_admins where user_id = auth.uid())
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

-- ── The limits (02 §2): one row, changed in the SQL editor, no deploy ───────
create table if not exists public.qa_settings (
  id                    boolean primary key default true check (id),
  min_len               int      not null default 10,
  max_len               int      not null default 1000,
  cooldown_after_close  interval not null default '1 hour',     -- provisional (02 §2)
  edit_cooldown         interval not null default '10 minutes', -- provisional
  max_edits             int      not null default 5,
  daily_questions       int      not null default 3,
  daily_edits           int      not null default 10,
  daily_replies         int      not null default 10,
  global_daily_questions int     not null default 100,           -- the breaker (04 §3)
  admin_actions_per_hour int     not null default 300,
  update_max_len        int      not null default 8000,
  search_max_len        int      not null default 200
);
insert into public.qa_settings (id) values (true) on conflict (id) do nothing;

-- ── The tables ──────────────────────────────────────────────────────────────
create table if not exists public.qa_questions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,   -- 03 §6: goes with the account
  body             text not null,
  status           text not null default 'open' check (status in ('open', 'seen', 'planned', 'answered', 'declined', 'duplicate')),
  visibility       text not null default 'private' check (visibility in ('public', 'private')),   -- the asker's tick (02 §4)
  admin_private    boolean not null default false,       -- the admin's override; never the reverse
  public_body      text,                                  -- the admin's wording for the public page
  answer           text,
  declined_reason  text,
  duplicate_of     uuid references public.qa_questions(id) on delete set null,
  conversation     text not null default 'none' check (conversation in ('none', 'open', 'closed')),
  edit_count       int not null default 0,
  created_at       timestamptz not null default now(),
  edited_at        timestamptz,
  seen_at          timestamptz,
  settled_at       timestamptz,                           -- left the active statuses (the cooldown runs from here)
  answered_at      timestamptz,
  last_activity_at timestamptz not null default now(),
  asker_seen_at    timestamptz                            -- for "changed since you last looked" (02 §4b)
);
create index if not exists qa_questions_user on public.qa_questions (user_id, created_at desc);
create index if not exists qa_questions_status on public.qa_questions (status, last_activity_at desc);

create table if not exists public.qa_messages (   -- private conversations (02 §4a)
  id          bigserial primary key,
  question_id uuid not null references public.qa_questions(id) on delete cascade,
  from_admin  boolean not null,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists qa_messages_question on public.qa_messages (question_id, created_at);

create table if not exists public.qa_updates (   -- the updates channel
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null,
  author_id  uuid references auth.users(id) on delete set null,   -- never shown (03 §7: "the developer")
  created_at timestamptz not null default now(),
  edited_at  timestamptz
);

create table if not exists public.qa_events (    -- the counter every limit reads (04 §3)
  id      bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind    text not null,
  at      timestamptz not null default now()
);
create index if not exists qa_events_user_kind on public.qa_events (user_id, kind, at desc);
create index if not exists qa_events_kind on public.qa_events (kind, at desc);

create table if not exists public.qa_admin_log (  -- append-only (04 §4)
  id       bigserial primary key,
  admin_id uuid,
  action   text not null,
  target   text,
  at       timestamptz not null default now()
);
create or replace function public.qa_log_is_append_only() returns trigger
language plpgsql set search_path = public as $$
begin raise exception 'qa_admin_log is append-only'; end $$;
drop trigger if exists qa_admin_log_append_only on public.qa_admin_log;
create trigger qa_admin_log_append_only before update or delete on public.qa_admin_log
  for each row execute function public.qa_log_is_append_only();

-- Deny by default: row-level security on, no policy, no table grants.
do $$ declare t text; begin
  foreach t in array array['site_admins', 'qa_settings', 'qa_questions', 'qa_messages', 'qa_updates', 'qa_events', 'qa_admin_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ── Helpers (not callable by clients) ───────────────────────────────────────
-- What has no place in a sentence: control and zero-width characters, the
-- bidirectional overrides; newlines kept, length counted after (04 §6).
create or replace function public.qa_clean(t text) returns text
language sql immutable set search_path = public as $$
  select btrim(regexp_replace(replace(coalesce(t, ''), E'\r\n', E'\n'),
    '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]', '', 'g'))
$$;

-- The caller may write in the community: a real account, not banned, not
-- made to rename (H4), with at least one saved run (02 §2). Returns their id.
create or replace function public.qa_member() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); p profiles%rowtype;
begin
  if not pom_is_member() then raise exception 'NOT_MEMBER'; end if;
  select * into p from profiles where id = me;
  if not found or coalesce(p.is_guest, false) then raise exception 'NOT_MEMBER'; end if;
  if p.banned_at is not null then raise exception 'BANNED'; end if;
  if p.must_rename then raise exception 'MUST_RENAME'; end if;
  if not exists (select 1 from runs where user_id = me) then raise exception 'NO_RUN'; end if;
  return me;
end $$;

create or replace function public.qa_events_since(who uuid, what text, span interval) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from qa_events where user_id = who and kind = what and at > now() - span
$$;

create or replace function public.qa_len_ok(t text, lo int, hi int) returns void
language plpgsql immutable set search_path = public as $$
begin
  if char_length(t) < lo then raise exception 'TOO_SHORT'; end if;
  if char_length(t) > hi then raise exception 'TOO_LONG'; end if;
end $$;

-- A notice in the game (H5): the badge on You lights; the notice opens the question.
create or replace function public.qa_notify(who uuid, q uuid, what text) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, type, payload) values (who, 'qa', json_build_object('questionId', q, 'kind', what))
$$;

-- Every admin action starts here (04 §4): the admin at the second factor, a
-- per-hour cap so a stolen session can't empty the inbox in a second, a log row.
create or replace function public.qa_admin_gate(what text, target text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); s qa_settings%rowtype;
begin
  if not site_is_admin() then raise exception 'NOT_ADMIN'; end if;
  select * into s from qa_settings st where st.id;
  if (select count(*) from qa_admin_log where admin_id = me and at > now() - interval '1 hour') >= s.admin_actions_per_hour then
    raise exception 'ADMIN_BUSY';
  end if;
  insert into qa_admin_log (admin_id, action, target) values (me, what, target);
  return me;
end $$;

-- ── The player's side ───────────────────────────────────────────────────────
create or replace function public.qa_ask(p_body text, p_public boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := qa_member(); s qa_settings%rowtype; b text := qa_clean(p_body); last_settled timestamptz; id_ uuid;
begin
  -- One at a time per player, even with two taps in flight.
  perform pg_advisory_xact_lock(hashtext('qa_ask:' || me::text));
  select * into s from qa_settings st where st.id;
  perform qa_len_ok(b, s.min_len, s.max_len);
  if exists (select 1 from qa_questions where user_id = me and status in ('open', 'seen')) then raise exception 'ACTIVE_QUESTION'; end if;
  select max(settled_at) into last_settled from qa_questions where user_id = me;
  if last_settled is not null and last_settled + s.cooldown_after_close > now() then
    raise exception 'COOLDOWN %', ceil(extract(epoch from (last_settled + s.cooldown_after_close - now())))::int;
  end if;
  if qa_events_since(me, 'ask', interval '1 day') >= s.daily_questions then raise exception 'DAILY_LIMIT'; end if;
  if (select count(*) from qa_events where kind = 'ask' and at > now() - interval '1 day') >= s.global_daily_questions then raise exception 'SITE_BUSY'; end if;
  insert into qa_questions (user_id, body, visibility) values (me, b, case when p_public then 'public' else 'private' end) returning id into id_;
  insert into qa_events (user_id, kind) values (me, 'ask');
  return id_;
end $$;

create or replace function public.qa_edit(p_id uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := qa_member(); s qa_settings%rowtype; q qa_questions%rowtype; b text := qa_clean(p_body);
begin
  select * into s from qa_settings st where st.id;
  select * into q from qa_questions where id = p_id for update;
  if not found or q.user_id <> me then raise exception 'NOT_YOURS'; end if;
  if q.status not in ('open', 'seen') then raise exception 'NOT_EDITABLE'; end if;
  if q.edit_count >= s.max_edits then raise exception 'EDIT_LIMIT'; end if;
  if q.edited_at is not null and q.edited_at + s.edit_cooldown > now() then
    raise exception 'EDIT_COOLDOWN %', ceil(extract(epoch from (q.edited_at + s.edit_cooldown - now())))::int;
  end if;
  if qa_events_since(me, 'edit', interval '1 day') >= s.daily_edits then raise exception 'DAILY_LIMIT'; end if;
  perform qa_len_ok(b, s.min_len, s.max_len);
  -- An edit puts it back to open (02 §3): the admin sees it changed since.
  update qa_questions set body = b, status = 'open', edited_at = now(), edit_count = edit_count + 1, last_activity_at = now() where id = p_id;
  insert into qa_events (user_id, kind) values (me, 'edit');
end $$;

-- H11: take it back while it's open or seen. It still counts against the day.
create or replace function public.qa_withdraw(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := qa_member();
begin
  delete from qa_questions where id = p_id and user_id = me and status in ('open', 'seen');
  if not found then raise exception 'NOT_EDITABLE'; end if;
end $$;

-- Your questions, like an inbox (02 §4b). Readable even when banned: it's yours.
create or replace function public.qa_mine() returns table (
  id uuid, body text, status text, visibility text, answer text, declined_reason text, duplicate_of uuid,
  conversation text, created_at timestamptz, edited_at timestamptz, seen_at timestamptz, answered_at timestamptz,
  last_activity_at timestamptz, changed boolean)
language sql stable security definer set search_path = public as $$
  select q.id, q.body, q.status, q.visibility, q.answer, q.declined_reason,
         -- a duplicate points at the other only if that one is public
         case when exists (select 1 from qa_questions o where o.id = q.duplicate_of and o.status = 'answered' and o.visibility = 'public' and not o.admin_private) then q.duplicate_of end,
         q.conversation, q.created_at, q.edited_at, q.seen_at, q.answered_at, q.last_activity_at,
         q.last_activity_at > coalesce(q.asker_seen_at, '-infinity')
  from qa_questions q where q.user_id = auth.uid() and pom_is_member()
  order by q.last_activity_at desc
$$;

-- One of yours, with its conversation; opening it clears the "changed" mark.
create or replace function public.qa_open_mine(p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); out_ json;
begin
  if not pom_is_member() then raise exception 'NOT_MEMBER'; end if;
  update qa_questions set asker_seen_at = now() where id = p_id and user_id = me;
  if not found then raise exception 'NOT_FOUND'; end if;
  select json_build_object('question', (select row_to_json(m) from qa_mine() m where m.id = p_id),
    'messages', coalesce((select json_agg(json_build_object('fromAdmin', from_admin, 'body', body, 'at', created_at) order by created_at)
                          from qa_messages where question_id = p_id), '[]'::json)) into out_;
  return out_;
end $$;

create or replace function public.qa_reply(p_id uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := qa_member(); s qa_settings%rowtype; b text := qa_clean(p_body);
begin
  select * into s from qa_settings st where st.id;
  if not exists (select 1 from qa_questions where id = p_id and user_id = me) then raise exception 'NOT_YOURS'; end if;
  if not exists (select 1 from qa_questions where id = p_id and conversation = 'open') then raise exception 'NO_CONVERSATION'; end if;
  if qa_events_since(me, 'reply', interval '1 day') >= s.daily_replies then raise exception 'DAILY_LIMIT'; end if;
  perform qa_len_ok(b, 1, s.max_len);
  insert into qa_messages (question_id, from_admin, body) values (p_id, false, b);
  update qa_questions set last_activity_at = now() where id = p_id;
  insert into qa_events (user_id, kind) values (me, 'reply');
end $$;

-- ── Anyone: the public Q&A, search, the updates ─────────────────────────────
-- Published = answered, ticked public by the asker, not made private by the
-- admin. No asker, no id of anyone (Q19).
create or replace function public.qa_published(p_limit int default 20, p_offset int default 0)
returns table (id uuid, question text, answer text, answered_at timestamptz)
language sql stable security definer set search_path = public as $$
  select q.id, coalesce(q.public_body, q.body), q.answer, q.answered_at
  from qa_questions q
  where q.status = 'answered' and q.visibility = 'public' and not q.admin_private
  order by q.answered_at desc
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;

-- Whole sentences (Q24): English stemming for English, Slovak through
-- `simple` and unaccent (no Slovak stemmer exists, 07 F13), and trigram
-- similarity for near misses. The text is a parameter, never built into SQL.
create or replace function public.qa_search(p_text text)
returns table (id uuid, question text, answer text, answered_at timestamptz, rank real)
language plpgsql stable security definer set search_path = public, extensions as $$
declare s qa_settings%rowtype; t text;
begin
  select * into s from qa_settings st where st.id;
  t := left(qa_clean(p_text), s.search_max_len);
  if char_length(t) < 2 then return; end if;
  return query
  with pub as (
    select q.id, coalesce(q.public_body, q.body) as question, q.answer, q.answered_at
    from qa_questions q where q.status = 'answered' and q.visibility = 'public' and not q.admin_private
  ), scored as (
    select p.*,
      greatest(
        ts_rank(to_tsvector('english', p.question || ' ' || coalesce(p.answer, '')), websearch_to_tsquery('english', t)),
        ts_rank(to_tsvector('simple', unaccent(p.question || ' ' || coalesce(p.answer, ''))), websearch_to_tsquery('simple', unaccent(t))),
        similarity(unaccent(lower(p.question)), unaccent(lower(t))) * 0.5
      )::real as r
    from pub p
  )
  select scored.id, scored.question, scored.answer, scored.answered_at, scored.r from scored
  where scored.r > 0.05 order by scored.r desc limit 20;
end $$;

-- One published question, for its own page (step 4). Nothing for a question
-- that isn't published: the asker reads theirs through qa_open_mine.
create or replace function public.qa_published_one(p_id uuid)
returns table (id uuid, question text, answer text, answered_at timestamptz)
language sql stable security definer set search_path = public as $$
  select q.id, coalesce(q.public_body, q.body), q.answer, q.answered_at
  from qa_questions q
  where q.id = p_id and q.status = 'answered' and q.visibility = 'public' and not q.admin_private
$$;

-- What the ask form should show before anything is typed (step 4, 02 §6's
-- states): the same checks as qa_ask, in its order, as a state instead of an
-- error, with the seconds left on a cooldown and the length limits for the
-- counter. Changes nothing, so a page can call it on every load.
create or replace function public.qa_can_ask() returns json
language plpgsql stable security definer set search_path = public as $$
declare me uuid; s qa_settings%rowtype; last_settled timestamptz; active uuid; st text := 'OK'; secs int;
begin
  select * into s from qa_settings st_ where st_.id;
  begin me := qa_member();
  exception when others then
    if sqlerrm in ('NOT_MEMBER', 'BANNED', 'MUST_RENAME', 'NO_RUN') then st := sqlerrm; else raise; end if;
  end;
  if st = 'OK' then
    select q.id into active from qa_questions q where q.user_id = me and q.status in ('open', 'seen') limit 1;
    select max(q.settled_at) into last_settled from qa_questions q where q.user_id = me;
    if active is not null then st := 'ACTIVE_QUESTION';
    elsif last_settled is not null and last_settled + s.cooldown_after_close > now() then
      st := 'COOLDOWN'; secs := ceil(extract(epoch from (last_settled + s.cooldown_after_close - now())))::int;
    elsif qa_events_since(me, 'ask', interval '1 day') >= s.daily_questions then st := 'DAILY_LIMIT';
    elsif (select count(*) from qa_events e where e.kind = 'ask' and e.at > now() - interval '1 day') >= s.global_daily_questions then st := 'SITE_BUSY';
    end if;
  end if;
  return json_build_object('state', st, 'seconds', secs, 'activeId', active, 'minLen', s.min_len, 'maxLen', s.max_len,
                           'editCooldown', extract(epoch from s.edit_cooldown)::int);
end $$;

create or replace function public.qa_updates_list(p_limit int default 20, p_offset int default 0)
returns table (id uuid, title text, body text, created_at timestamptz, edited_at timestamptz)
language sql stable security definer set search_path = public as $$
  select u.id, u.title, u.body, u.created_at, u.edited_at from qa_updates u
  order by u.created_at desc limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;

-- ── The admin's side ────────────────────────────────────────────────────────
create or replace function public.qa_admin_inbox(p_status text default null, p_edited_only boolean default false)
returns table (id uuid, status text, asker text, earlier int, body text, visibility text, admin_private boolean,
               conversation text, created_at timestamptz, edited_at timestamptz, seen_at timestamptz, last_activity_at timestamptz,
               edited_since_seen boolean)
language plpgsql security definer set search_path = public as $$
begin
  perform qa_admin_gate('inbox', p_status);
  return query
  select q.id, q.status, p.username,
         (select count(*)::int from qa_questions o where o.user_id = q.user_id and o.created_at < q.created_at),
         q.body, q.visibility, q.admin_private, q.conversation, q.created_at, q.edited_at, q.seen_at, q.last_activity_at,
         q.edited_at is not null and q.edited_at > coalesce(q.seen_at, '-infinity')
  from qa_questions q left join profiles p on p.id = q.user_id
  where (p_status is null or q.status = p_status)
    and (not p_edited_only or (q.edited_at is not null and q.edited_at > coalesce(q.seen_at, '-infinity')))
  order by q.last_activity_at desc;
end $$;

-- Opening an open question marks it seen (02 §3: it can't be forgotten).
create or replace function public.qa_admin_open(p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare out_ json; who uuid;
begin
  perform qa_admin_gate('open', p_id::text);
  update qa_questions set status = case when status = 'open' then 'seen' else status end, seen_at = now()
  where id = p_id returning user_id into who;
  if who is null then raise exception 'NOT_FOUND'; end if;
  select json_build_object('question', row_to_json(q),
    'messages', coalesce((select json_agg(json_build_object('fromAdmin', from_admin, 'body', body, 'at', created_at) order by created_at)
                          from qa_messages where question_id = p_id), '[]'::json))
  into out_ from qa_questions q where q.id = p_id;
  return out_;
end $$;

-- Planned, answered, declined, duplicate (or back to seen). The asker hears.
create or replace function public.qa_admin_decide(p_id uuid, p_status text, p_text text default null, p_duplicate_of uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare who uuid; t text := nullif(qa_clean(p_text), '');
begin
  perform qa_admin_gate('decide:' || coalesce(p_status, ''), p_id::text);
  if p_status not in ('seen', 'planned', 'answered', 'declined', 'duplicate') then raise exception 'BAD_STATUS'; end if;
  if p_status = 'answered' and t is null then raise exception 'TOO_SHORT'; end if;
  if p_status = 'duplicate' and (p_duplicate_of is null or p_duplicate_of = p_id) then raise exception 'BAD_STATUS'; end if;
  update qa_questions set
    status = p_status,
    answer = case when p_status = 'answered' then t else answer end,
    declined_reason = case when p_status = 'declined' then t else declined_reason end,
    duplicate_of = case when p_status = 'duplicate' then p_duplicate_of else duplicate_of end,
    answered_at = case when p_status = 'answered' then now() else answered_at end,
    settled_at = case when p_status in ('planned', 'answered', 'declined', 'duplicate') then coalesce(settled_at, now()) else null end,
    last_activity_at = now()
  where id = p_id returning user_id into who;
  if who is null then raise exception 'NOT_FOUND'; end if;
  perform qa_notify(who, p_id, p_status);
end $$;

-- The admin can make any question private, never a private one public (02 §4),
-- and can reword a public one for the page (the asker keeps their original).
create or replace function public.qa_admin_set_private(p_id uuid, p_private boolean, p_public_wording text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform qa_admin_gate('privacy', p_id::text);
  update qa_questions set admin_private = p_private, public_body = coalesce(nullif(qa_clean(p_public_wording), ''), public_body)
  where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

-- Only the admin opens a conversation (02 §4a); the asker hears when it opens.
create or replace function public.qa_admin_conversation(p_id uuid, p_open boolean) returns void
language plpgsql security definer set search_path = public as $$
declare who uuid;
begin
  perform qa_admin_gate(case when p_open then 'conversation:open' else 'conversation:close' end, p_id::text);
  update qa_questions set conversation = case when p_open then 'open' else 'closed' end, last_activity_at = now()
  where id = p_id returning user_id into who;
  if who is null then raise exception 'NOT_FOUND'; end if;
  if p_open then perform qa_notify(who, p_id, 'conversation'); end if;
end $$;

create or replace function public.qa_admin_message(p_id uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare who uuid; s qa_settings%rowtype; b text := qa_clean(p_body);
begin
  perform qa_admin_gate('message', p_id::text);
  select * into s from qa_settings st where st.id;
  perform qa_len_ok(b, 1, s.max_len);
  select user_id into who from qa_questions where id = p_id and conversation = 'open';
  if who is null then raise exception 'NO_CONVERSATION'; end if;
  insert into qa_messages (question_id, from_admin, body) values (p_id, true, b);
  update qa_questions set last_activity_at = now() where id = p_id;
  perform qa_notify(who, p_id, 'message');
end $$;

-- For abuse. The log keeps the id; the text goes.
create or replace function public.qa_admin_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform qa_admin_gate('delete', p_id::text);
  delete from qa_questions where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

-- Write or edit an update (null id = a new one). Plain text with the small
-- whitelist (04 §6) is the page's job to render; stored as written.
create or replace function public.qa_admin_update_save(p_id uuid, p_title text, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid; s qa_settings%rowtype; t text := qa_clean(p_title); b text := qa_clean(p_body); id_ uuid := p_id;
begin
  me := qa_admin_gate(case when p_id is null then 'update:new' else 'update:edit' end, coalesce(p_id::text, ''));
  select * into s from qa_settings st where st.id;
  perform qa_len_ok(t, 2, 200);
  perform qa_len_ok(b, 2, s.update_max_len);
  if id_ is null then
    insert into qa_updates (title, body, author_id) values (t, b, me) returning id into id_;
  else
    update qa_updates set title = t, body = b, edited_at = now() where id = id_;
    if not found then raise exception 'NOT_FOUND'; end if;
  end if;
  return id_;
end $$;

create or replace function public.qa_admin_update_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform qa_admin_gate('update:delete', p_id::text);
  delete from qa_updates where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

create or replace function public.qa_admin_log_read(p_limit int default 100)
returns table (action text, target text, at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not site_is_admin() then raise exception 'NOT_ADMIN'; end if;   -- reading the log isn't logged
  return query select l.action, l.target, l.at from qa_admin_log l order by l.at desc limit least(greatest(p_limit, 1), 500);
end $$;

-- The moderation inbox (02 §5a): the app's reports and unsure names, through
-- the admin's gate. mod_inbox() and mod_act() stay closed to every account.
create or replace function public.qa_admin_mod_inbox() returns json
language plpgsql security definer set search_path = public as $$
declare out_ json;
begin
  perform qa_admin_gate('mod:inbox', null);
  select coalesce(json_agg(m), '[]'::json) into out_ from mod_inbox() m;
  return out_;
end $$;

create or replace function public.qa_admin_mod_act(p_flag bigint, p_action text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform qa_admin_gate('mod:' || coalesce(p_action, ''), p_flag::text);
  perform mod_act(p_flag, p_action);
end $$;

-- ── Who may call what ───────────────────────────────────────────────────────
do $$ declare f record; begin
  -- Close everything first, then open what each audience needs.
  for f in select p.oid::regprocedure as sig from pg_proc p
           where p.pronamespace = 'public'::regnamespace and (p.proname like 'qa\_%' or p.proname like 'site\_is\_admin')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
-- Anyone, signed in or not: the public Q&A, search, the updates, and "am I the admin".
grant execute on function public.qa_published(int, int), public.qa_published_one(uuid), public.qa_search(text), public.qa_updates_list(int, int), public.site_is_admin() to anon, authenticated;
-- Players.
grant execute on function public.qa_ask(text, boolean), public.qa_edit(uuid, text), public.qa_withdraw(uuid), public.qa_mine(),
  public.qa_open_mine(uuid), public.qa_reply(uuid, text), public.qa_can_ask() to authenticated;
-- The admin's functions gate themselves; granted to authenticated so the admin can call them at all.
grant execute on function public.qa_admin_inbox(text, boolean), public.qa_admin_open(uuid), public.qa_admin_decide(uuid, text, text, uuid),
  public.qa_admin_set_private(uuid, boolean, text), public.qa_admin_conversation(uuid, boolean), public.qa_admin_message(uuid, text),
  public.qa_admin_delete(uuid), public.qa_admin_update_save(uuid, text, text), public.qa_admin_update_delete(uuid),
  public.qa_admin_log_read(int), public.qa_admin_mod_inbox(), public.qa_admin_mod_act(bigint, text) to authenticated;
-- The helpers stay closed: qa_clean, qa_member, qa_events_since, qa_len_ok, qa_notify, qa_admin_gate, qa_log_is_append_only.

-- ── Making the admin (03 §3.4), once, by the maintainer, by hand ────────────
-- After making the admin account in the game and choosing its username:
--   insert into public.site_admins (user_id)
--   select id from public.profiles where lower(username) = lower('<the admin username>')
--   on conflict do nothing;
