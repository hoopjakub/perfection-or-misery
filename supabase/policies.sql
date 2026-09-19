-- Row-level security for Perfection or Misery (Phase 6).
--
-- WRITTEN FROM THE APP'S CODE, NOT EXPORTED FROM THE LIVE DATABASE. Before
-- applying, compare with what's there now:
--   select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname = 'public';
-- then drop the old policies you're replacing. Each block below says which
-- app code needs the access, so a rule can be checked against its reason.
--
-- ORDER MATTERS for `runs`: deploy the submit-run edge function and ship the
-- app with EXPO_PUBLIC_SERVER_SCORING=1 BEFORE this file removes the app's
-- INSERT on runs, or saving breaks. Edge functions use the service role and
-- are not affected by any of this.

-- ── runs ─────────────────────────────────────────────────────────────────────
-- Read: Ranks (everyone's best runs), Runs, friends and versus. Public.
-- Write: only through submit-run (service role). No insert/update from the app,
-- so a score can't be posted without the server scoring it. Delete: via
-- delete-account (service role).
alter table public.runs enable row level security;
create policy "runs are readable by everyone" on public.runs for select using (true);

-- ── profiles ─────────────────────────────────────────────────────────────────
-- Read: usernames beside runs and friends (src/lib/friends.ts, userStore).
-- Update: your own row only, when a guest picks a username (src/lib/auth.ts).
alter table public.profiles enable row level security;
create policy "profiles are readable by everyone" on public.profiles for select using (true);
create policy "you update your own profile" on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- ── career_stats ─────────────────────────────────────────────────────────────
-- Your career only: read and upsert your own row (src/db/queries/career.ts).
alter table public.career_stats enable row level security;
create policy "you read your career" on public.career_stats for select using (auth.uid() = user_id);
create policy "you write your career" on public.career_stats for insert with check (auth.uid() = user_id);
create policy "you update your career" on public.career_stats for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── notifications ────────────────────────────────────────────────────────────
-- Read and mark-read: your own (src/hooks/useNotifications.ts).
-- Insert: a friend request or acceptance notifies the OTHER user
-- (src/lib/friends.ts), so any signed-in, non-guest user may insert one.
alter table public.notifications enable row level security;
create policy "you read your notifications" on public.notifications for select using (auth.uid() = user_id);
create policy "you mark your notifications read" on public.notifications for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "signed-in users can notify others" on public.notifications for insert
  with check (auth.uid() is not null and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

-- ── friend_requests ──────────────────────────────────────────────────────────
alter table public.friend_requests enable row level security;
create policy "you see requests you sent or got" on public.friend_requests for select
  using (auth.uid() in (from_user_id, to_user_id));
create policy "you send requests as yourself" on public.friend_requests for insert
  with check (auth.uid() = from_user_id);
create policy "the receiver answers a request" on public.friend_requests for update
  using (auth.uid() = to_user_id);
create policy "either side can drop a request" on public.friend_requests for delete
  using (auth.uid() in (from_user_id, to_user_id));

-- ── friendships ──────────────────────────────────────────────────────────────
-- Accepting inserts both directions at once (src/lib/friends.ts), so a row
-- is allowed when you're on either side of it.
alter table public.friendships enable row level security;
create policy "you see your friendships" on public.friendships for select using (auth.uid() = user_id);
create policy "you make friendships you're part of" on public.friendships for insert
  with check (auth.uid() in (user_id, friend_id));
create policy "you end friendships you're part of" on public.friendships for delete
  using (auth.uid() in (user_id, friend_id));

-- ── versus_runs ──────────────────────────────────────────────────────────────
alter table public.versus_runs enable row level security;
create policy "you see your versus runs" on public.versus_runs for select
  using (auth.uid() in (challenger_id, opponent_id));
create policy "you challenge as yourself" on public.versus_runs for insert
  with check (auth.uid() = challenger_id);
