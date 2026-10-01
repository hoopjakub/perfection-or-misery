-- P8-178 · Profile customisation, tenfold · and P8-175 · your picture as your crest.
-- Run once in the Supabase SQL editor, after profile.sql, crest.sql,
-- side-colours.sql and pin.sql. Safe to run again. Until it's run the profile
-- editor still saves everything else, and says what's waiting.
--
-- Discord's profile is the bar (the maintainer, 27 September 2026): a banner,
-- a profile theme of two colours, a frame around your picture, a status, your
-- pronouns and an about-me. All of it is public, like your look already is, so
-- it lives on the look row (public to read, yours to write). The lengths are
-- checked here as well as in the app.

alter table public.profile_looks add column if not exists banner   jsonb;   -- { kind: 'colour' | 'gradient' | 'picture', from, to, path }
alter table public.profile_looks add column if not exists theme    jsonb;   -- { primary, accent } — two #rrggbb
alter table public.profile_looks add column if not exists frame    text not null default 'none';
alter table public.profile_looks add column if not exists status   text;
alter table public.profile_looks add column if not exists pronouns text;
alter table public.profile_looks add column if not exists about    text;
-- P8-175: the crest is your profile picture (it follows the picture when you change it).
alter table public.profile_looks add column if not exists crest_avatar boolean not null default false;

alter table public.profile_looks drop constraint if exists profile_looks_frame_check;
alter table public.profile_looks add constraint profile_looks_frame_check
  check (frame in ('none', 'ring', 'double', 'tape', 'rivets', 'stitch', 'gold', 'stars'));
alter table public.profile_looks drop constraint if exists profile_looks_text_check;
alter table public.profile_looks add constraint profile_looks_text_check
  check (coalesce(char_length(status), 0) <= 60 and coalesce(char_length(pronouns), 0) <= 24 and coalesce(char_length(about), 0) <= 190);

-- What anyone may see of a profile, now with the new look. The same function
-- as profile.sql's, extended; hidden sections still come back null.
create or replace function public.public_profile(uid uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'id',           p.id,
    'username',     p.username,
    'avatar_path',  p.avatar_path,
    'badge_team_id',   p.badge_team_id,
    'badge_team_name', p.badge_team_name,
    'favourite_team_id',   case when coalesce(d.show_favourites, true) then d.favourite_team_id end,
    'favourite_team_name', case when coalesce(d.show_favourites, true) then d.favourite_team_name end,
    'favourite_player',    case when coalesce(d.show_favourites, true) then d.favourite_player end,
    'pinned_run_ids',      case when coalesce(d.show_runs, true) then d.pinned_run_ids end,
    'shown_achievements',  case when coalesce(d.show_achievements, true) then d.shown_achievements end,
    'playtime_seconds',    case when coalesce(d.show_playtime, true)
                             then (select coalesce(sum(r.duration_seconds), 0) from runs r where r.user_id = p.id) end,
    'runs_played',  (select count(*) from runs r where r.user_id = p.id),
    'colour',       l.colour,
    'effect',       l.effect,
    'banner',       l.banner,
    'theme',        l.theme,
    'frame',        l.frame,
    'status',       l.status,
    'pronouns',     l.pronouns,
    'about',        l.about
  )
  from profiles p
  left join profile_details d on d.user_id = p.id
  left join profile_looks   l on l.user_id = p.id
  where p.id = uid
$$;
grant execute on function public.public_profile(uuid) to anon, authenticated;
