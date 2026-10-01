-- P8.5-24 · Runs saved on the phone while offline (docs/release/02-OFFLINE.md
-- §2.1). Run once in the Supabase SQL editor. Safe to run again.
--
-- A run whose save fails without a connection waits on the phone and is sent
-- when the connection comes back. Two things make that safe:
--  - client_id: an id the app makes for the run when it first tries to save
--    it. Unique, so a save that reached the server but whose answer was lost,
--    and is then sent again from the queue, is refused as a duplicate instead
--    of being counted twice (submit-run treats that refusal as success).
--  - played_at: when the run was played, which submit-run uses as the run's
--    created_at (bounded to the last 14 days), so a run played in the last
--    hour of a season counts for that season's board even if it goes up later.

alter table public.runs add column if not exists client_id uuid;
create unique index if not exists runs_client_id_unique on public.runs (client_id) where client_id is not null;
alter table public.runs add column if not exists played_at timestamptz;
