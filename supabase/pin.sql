-- P8-168: your pin and your letters. Run once in the Supabase SQL editor.
--
-- The pin on your ID tag in a colour of your choosing (a palette id: 'orange',
-- 'volt', ...), and your own letters on the tag in place of REG. Kept on the
-- look row, which is already yours to write. The letters are checked here as
-- well as in the app: one to four capital letters or digits.
-- Until this is run, saving the profile still works; only the pin waits.

alter table public.profile_looks add column if not exists pin_colour text;
alter table public.profile_looks add column if not exists pin_letters text;
alter table public.profile_looks drop constraint if exists profile_looks_pin_letters_check;
alter table public.profile_looks add constraint profile_looks_pin_letters_check
  check (pin_letters is null or pin_letters ~ '^[A-Z0-9]{1,4}$');
