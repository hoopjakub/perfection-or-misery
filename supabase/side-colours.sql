-- P8-142: your club's colours. Run once in the Supabase SQL editor (after crest.sql).
--
-- Two colours from the game's palette (by id: 'orange', 'blue', …), on the look
-- row that already holds your crest, public to read and yours to write. Your
-- side wears them wherever a club's colours are drawn (the match sheet's bars,
-- the momentum graph, the feed), in place of the club it took over.
-- Until this is run, saving the profile still works; only the colours wait.

alter table public.profile_looks add column if not exists side_colours jsonb;
