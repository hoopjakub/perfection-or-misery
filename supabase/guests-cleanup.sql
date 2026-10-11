-- Phase 10.5 · The old guest accounts, deleted once (docs/release/09-GUESTS.md §5).
-- Until version 0.9.0 every launch signed in anonymously, which made an account
-- per install and per browser (99 guests to 11 accounts on 9 Oct). From the
-- build after it a guest has no account at all, so these are left over.
--
-- Run it only after the new version is out everywhere (the web deployed, the
-- phones on the over-the-air update): an older app still makes guests, and a
-- guest it's using right now would be signed out under it.
--
-- Two steps. Run step 1, read the numbers, then run step 2.

-- ── Step 1 · Look first (changes nothing) ───────────────────────────────────
select
  count(*)                                                        as guests_to_delete,
  count(*) filter (where u.created_at > now() - interval '1 day') as made_in_the_last_day,
  min(u.created_at)                                               as oldest,
  max(u.created_at)                                               as newest
from auth.users u
where u.is_anonymous
  and not exists (select 1 from public.runs r where r.user_id = u.id);
-- And what stays: real accounts, and any guest that somehow has a run (none expected).
select
  count(*) filter (where not u.is_anonymous) as accounts_kept,
  count(*) filter (where u.is_anonymous and exists (select 1 from public.runs r where r.user_id = u.id)) as guests_with_runs_kept
from auth.users u;

-- ── Step 2 · Delete (one transaction: all or nothing) ───────────────────────
-- Uncomment and run when step 1 looks right. The profile goes first (the
-- profiles table may not cascade from auth.users), then the auth user.
-- begin;
--   create temporary table old_guests on commit drop as
--     select u.id from auth.users u
--     where u.is_anonymous and not exists (select 1 from public.runs r where r.user_id = u.id);
--   delete from public.profiles p using old_guests g where p.id = g.id and coalesce(p.is_guest, true);
--   delete from auth.users u using old_guests g where u.id = g.id;
--   select count(*) as guests_left from auth.users where is_anonymous;
-- commit;
