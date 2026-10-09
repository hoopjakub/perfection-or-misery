-- Phase 9.75 (S-2, docs/audit-9.75/04-INDEPENDENT-SECURITY.md) · A limit on
-- how fast one account can save runs. Run once in the Supabase SQL editor.
-- Safe to run again.
--
-- submit-run counts the caller's runs that ARRIVED in the last minute and
-- refuses above ten (429, which the app treats as "try again later", so a
-- queue sending several runs at once keeps the rest). It can't count by
-- created_at: a run sent from the offline queue is dated by when it was
-- played (runs-queue.sql), so a burst of backdated runs would never count.
-- received_at is when the row reached the server, always now().
--
-- Until this has been run, submit-run skips the limit (and says so in its
-- log) rather than refusing every save.

alter table public.runs add column if not exists received_at timestamptz not null default now();
create index if not exists runs_user_received on public.runs (user_id, received_at desc);
