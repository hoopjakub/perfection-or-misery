-- P8-132: your own crest. Run once in the Supabase SQL editor (after profile.sql).
--
-- It lives on the look (profile_looks), which is already public to read and
-- yours alone to write, so other players see your crest on your runs with no
-- new policy. The design is the kit's own drawn badge, chosen rather than
-- generated (shape, two colours, a shirt device, up to three letters); a
-- picture instead is a file in the avatars bucket (your own folder, as the
-- avatar is: `<user id>/crest-<time>.jpg`), and the storage policies from
-- profile.sql already cover it. `crest_everywhere` is the setting that puts it
-- on your side in the Champions League and the World Cup too; without it the
-- crest is only on the side you field in the league modes.
--
-- Each run also keeps the crest it was played with (runs.highlights.crest),
-- so an old run still shows it after you change yours; that needs nothing here.

alter table public.profile_looks add column if not exists crest            jsonb;
alter table public.profile_looks add column if not exists crest_path       text;
alter table public.profile_looks add column if not exists crest_everywhere boolean not null default false;

-- Deleting the account removes the look row already (delete-account); the
-- crest's picture sits in the same avatars folder the function empties.
