-- Row-level security for Perfection or Misery.
--
-- LIVE POLICIES (read from pg_policies on 19 September 2026), by table:
--   runs            runs_public_read (SELECT), runs_own_insert (INSERT)
--   profiles        profiles_public_read (SELECT), profiles_own_update (UPDATE)
--   career_stats    own career read / insert / update
--   friend_requests fr_read (SELECT), fr_insert (INSERT), fr_update (UPDATE)
--   friendships     fs_read (SELECT)
--   notifications   notif_read (SELECT), notif_update (UPDATE)
--   versus_runs     none (check relrowsecurity: locked if RLS is on, open if off)
--   bal_careers, bal_records: Become a Legend's tables, shared project. Never touch.
--
-- Check RLS is actually ON before trusting any of this:
--   select relname, relrowsecurity from pg_class
--   where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname;

-- ── Phase 6: server-side scoring ─────────────────────────────────────────────
-- ORDER: 1) deploy submit-run  2) ship the app with EXPO_PUBLIC_SERVER_SCORING=1
-- and see a run save  3) only then run this. From here, runs are inserted only
-- by the submit-run edge function (service role), which scores them itself.
drop policy if exists "runs_own_insert" on public.runs;

-- To undo (saving broke):
--   create policy "runs_own_insert" on public.runs for insert with check (auth.uid() = user_id);

-- ── Open questions, NOT applied ──────────────────────────────────────────────
-- src/lib/friends.ts inserts into friendships and notifications when a request
-- is accepted, but neither table has an INSERT policy. Either a trigger does
-- it, or accepting a friend silently fails (the code doesn't check the error).
-- If a test shows the friendship doesn't appear, these are the rules it needs:
--   create policy "fs_insert" on public.friendships for insert
--     with check (auth.uid() in (user_id, friend_id));
--   create policy "notif_insert" on public.notifications for insert
--     with check (auth.uid() is not null
--       and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);
