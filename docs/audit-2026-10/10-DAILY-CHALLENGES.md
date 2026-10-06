# 10 · Daily challenges, and the catalogue of every past one

> Part of the Wave G audit. Start at [`00-README.md`](00-README.md).
> Status: **plan, 2 October 2026; bases widened 3 October** (§3), from the maintainer's brief that day: *"daily challenges or like daily drafts, which would have like a completely random restriction, like a daily challenge that will appear and give you even a tag or achievements if you complete. And a daily challenge catalogue so you can go back and try any previous … probably a supabase sql needed."* This grows idea I-1 ([`07-FRESH-IDEAS.md`](07-FRESH-IDEAS.md)) into a plan. Nothing is built yet.

---

## 1. What a player sees

- **Home** gets a card: *Today's challenge*. It names the restriction and the target in a line each ("Eleven players, eleven nations · Finish in the top four"), the mode, and whether you've done it.
- **Play it** starts the run with everything the challenge fixes: the mode, the league or competition, the difficulty, the restriction (the draft only offers players who fit it) and **the same spins and placement for everyone that day**. The matches still play out with their own luck, so two people with the same cards can finish differently. That's the point.
- **The result** says whether you met the target. Meeting it on the day counts for the day's board, the streak and the rewards.
- **The catalogue** lists every past challenge, newest first, a calendar-like list with your best result on each and a tick where you met the target. Any of them can be played again. A replay counts toward catalogue rewards, but not toward that day's board, which is for the day itself.
- **Rewards**: achievements (feats) and **tags**, small earned labels you can show beside your name (§5).

## 2. The key decision: challenges come from the date, not from a table

A challenge is **generated from its date** by one pure function, `dailyChallenge(date, version)`, using a seeded stream of the date. Nobody writes them and nothing stores them.

That gives three things for free:

- **The catalogue costs nothing.** Every date since the first is a challenge; the list is a loop over dates.
- **It works offline,** and today's challenge is the same on every phone and the web.
- **It can't be edited after the fact,** which a board needs.

The one risk is changing the generator: that would change every past challenge. So each version of the rules is frozen with the date it started (`DAILY_VERSIONS = [{ from: '2026-11-01', v: 1 }]`), and a past date always uses the version that was live then. `verify-daily.ts` pins a handful of dates to their exact output, so an accidental change fails.

**The day** runs on Central European time (the maintainer's and the first players' clock), midnight to midnight, the same for everyone. A UTC day would roll over at 1 or 2 a.m. in Slovakia.

## 3. The challenge's parts

A day's challenge is a **base** (the kind of challenge) with its **settings** filled in (which league, which nation, which cap), plus a mode, a difficulty and a target. The maintainer's brief, 3 October: *"we have like 15 bases but each is something different, like league mode on Bundesliga but no German players and then Serie A but no Italians … 20 different bases if possible … so in the end we could end up with … 365 for a full year, and a special leap year day one … the same but like different years, meaning different tags."*

| Part | What it is | Example |
|---|---|---|
| **Base** | one of the 20 below | "No home players" |
| **Settings** | the base's own choices, drawn from what the database really has | league: Bundesliga, season 2021/22 |
| **Mode** | set by the base (some bases fit only one mode) | League |
| **Difficulty** | a preset, fixed for the day (from November under the new model, [`11-DIFFICULTY.md`](11-DIFFICULTY.md)) | Medium |
| **Light add-on** | sometimes one of: blind, no rerolls, no bench | no rerolls |
| **Target** | from the base's hardness and the mode (§3.3) | finish in the top four |

So "Bundesliga, no German players" and "Serie A, no Italians" are the **same base with different settings**, and they're different days.

### 3.1 What the database offers (measured 3 October 2026, `players_v5.db`)

The settings can only use what exists, so they were counted, not guessed:

| Pool | Count | Used by |
|---|---|---|
| Domestic leagues in league and all-time modes | **5** (Premier League, La Liga, Bundesliga, Serie A, Ligue 1) | league bases |
| Seasons per league | **8** (2018/19 to 2025/26) | season settings: 40 league-seasons |
| Nations with an XI's worth of top-five players (150+ player-seasons, 5+ keepers) | **27** | nation bases |
| Clubs with 6+ seasons in the top five | **79** | club bases |
| World Cup nations | **48** | World Cup bases |
| Full-path leagues (the 53 UEFA associations) | **53** | European bases |
| Formations | **12** | shape settings |

There's **one** decade of data (2018 onward), so "one decade" from the first draft isn't a base; "one season" is.

### 3.2 The twenty bases

Every base is **checkable during the draft** (the spin only offers players who fit; a spin with nobody who fits is a free reroll) and **checkable afterwards from the saved squad** (§6). Each has an English and a Slovak line with its settings filled in. "Combinations" counts the distinct days the base can make.

| # | Base | Mode | Settings | Example day | Combinations | Hardness |
|---|---|---|---|---|---|---|
| B1 | **No home players** | league | league × season | Bundesliga 2021/22, no German players | 40 | medium |
| B2 | **Only the visitors** | league | league × the one foreign league your players must come from | Serie A, only Premier League players | 20 | medium |
| B3 | **One nation** | all time | nation | An all-Brazilian XI | 27 | high |
| B4 | **Two nations** | all time | a pair of nations | Only Dutch and Belgian players | 351 (27 choose 2) | medium |
| B5 | **Club legends** | all time | club (any of its seasons) | An XI from Liverpool's history | 79 | high |
| B6 | **Eleven clubs** | league, Champions League, World Cup | mode × league | Eleven different clubs, Champions League | 7 | medium |
| B7 | **Eleven nations** | league, Champions League | mode × league | Eleven nations, La Liga | 6 | medium |
| B8 | **Without your own** | World Cup | the nation you take over | Brazil, but no Brazilian players | 48 | high |
| B9 | **Your continent only** | World Cup | the nation you take over | Senegal, only African players | 48 | medium |
| B10 | **Bargain XI** | league, all time, Champions League, World Cup | mode × OVR cap (74, 76, 78, 80) | Nobody over 78, all time | 16 | high to low by cap |
| B11 | **Age band** | league, all time, Champions League, World Cup | mode × band (21 and under, 23 and under, 30 and over) | Veterans only, World Cup | 12 | medium |
| B12 | **The day's shape** | league, all time, Champions League, World Cup | mode × formation | 3-4-3 in the Premier League | 48 | low |
| B13 | **One season** | league | league × season: every club-season from that one season | La Liga, only 2019/20 squads | 40 | low |
| B14 | **Back line from one club** | all time | club (the four defenders and the keeper) | Your defence is all Inter | 79 | medium |
| B15 | **Front line from one league** | league | league × the league your three forwards come from | Ligue 1, your attack from the Bundesliga | 20 | low |
| B16 | **The underdog** | league | league × season: you replace the side that finished last | Premier League 2018/19, in Fulham's place, stay up | 40 | high |
| B17 | **Keeper from abroad** | league, all time | mode × continent the keeper must come from (outside Europe) | All time, a South American keeper | 10 | low |
| B18 | **The hunt** | full path | league you start in × the trophy you aim at (Europa or Conference) | Start in Belgium, win the Conference League | 106 (53 × 2) | high |
| B19 | **Small-league stars** | Champions League | none, or a cap | No player from the top five leagues | 2 | high |
| B20 | **Mirror match** | league | league × season: draft only from that league-season's own clubs, then play in it | Serie A 2022/23 against its own players | 40 | low |

**Total: 1,039 distinct days** before the light add-ons, which multiply most of them by up to four. A year needs 365.

Five bases need data the saved squad doesn't carry yet: B2, B15 and B19 need each player's **league** (`DraftedPlayer`, `src/types/game.ts:24`, has the club but not its league), and B17 and B9 need a nation-to-continent table (one small data file, the World Cup's confederations already exist in its qualifying data). D1 adds both.

Light add-ons (blind, no rerolls, no bench) go only on low and medium bases; a high base never gets one.

### 3.3 Targets

The target comes from the base's hardness and the mode, so a "one nation" day doesn't also ask you to win the league:

| Mode | Low | Medium | High |
|---|---|---|---|
| League | win the league | top four | top half (B16: stay up) |
| Champions League | reach the semi-final | reach the quarter-final | get out of the league phase |
| World Cup | reach the semi-final | reach the quarter-final | get out of the group |
| Full path (B18) | — | — | win the trophy you aimed at |

Kept in one table in the shared file. The first year's numbers are **provisional**: `verify-daily.ts` simulates each day of the year a few hundred times and flags any day whose target is met in under 5% or over 70% of runs.

### 3.4 The calendar: 365 days, and the leap day

- **A year's days are dealt from all 1,039.** For each year, the generator lists every combination, shuffles it with the year as the seed, and walks the list into the 365 days with three spacing rules: **no base two days running**, **each mode at least once a week**, and **no base more than 30 days a year**, so B4's 351 pairs can't crowd out the bases with few settings (twenty bases at about 18 days each fill a year; B19, with two settings, gets two). The year is fixed the moment the generator runs, so 3 March 2027 is always the same challenge, and every past day can be replayed from the catalogue.
- **No repeats inside a year.** Across years a combination can come back (the bases with few settings repeat soonest: B6, B7 and B19 within a year or two; B4's pairs take a decade), but on a different date, in a different order, with a different year's tags.
- **29 February is its own base, B0 "Leap day"**: every player in your XI was born in a leap year (birth year divisible by 4), in a mode the year picks. It only exists every four years, so its tag is the rarest in the game.
- **Tags are per year** (§5): DAILY 2027, EVERY DAY 2027, LEAP DAY 2028. Earning the same thing in a new year earns that year's tag.

`verify-daily.ts` checks the calendar for every year from the first to ten years ahead: 365 or 366 days, no combination twice in one year, no base two days running, every day's draft fillable (a simulated draft finds eleven eligible players within the rerolls the day allows, in at least 95% of attempts).

## 4. Same cards for everyone

Today the draft's spins and the placement use `Math.random()` (`spinClubSeason`, `src/engine/draft.ts:64`; `spinPlacement`, `src/engine/placement.ts:35`). For a daily run they take the day's seeded stream instead, so everyone gets the same club-seasons in the same order and lands in the same league. Rerolls draw the next spin from the same stream, so a reroll is also the same for everyone.

This is the small, safe half of idea I-6. It's needed here and nowhere else yet: the matches keep their own luck. Seeding the matches as well (so two identical drafts get identical seasons) is the other half, and only worth it if the board ever needs to be cheat-proof (§6).

## 5. Rewards

**Feats** (in the achievements list, through the same `FEATS` table, so the toasts and the Achievements screen pick them up):

| Feat | Earned for |
|---|---|
| First of many | your first daily target met on the day |
| A week of it | targets met on 7 days in a row |
| A month of it | 30 days met, not necessarily in a row |
| Back catalogue | 20 past challenges met from the catalogue |
| Every restriction | at least one target met under each restriction in the catalogue |

**Tags.** A small earned label that you choose to show beside your name: on your profile, the run label and Ranks. The first set:

| Tag | Earned for |
|---|---|
| DAILY | your first target met on the day |
| ON A ROLL | a 7-day streak (shown while the streak is alive) |
| EVERY DAY | a 30-day streak, kept for good once earned |
| COLLECTOR | Back catalogue |
| MONTH'S BEST | the best score on any day of a calendar month (from the boards) |
| LEAP DAY 2028 | the leap-day challenge met on 29 February (every fourth year) |

**Per year.** DAILY, ON A ROLL, EVERY DAY and COLLECTOR carry the year they were earned (DAILY 2027, EVERY DAY 2027); a new year starts them fresh, and every year's tag stays yours.

Tags are derived from runs, like achievements are today (`computeAchievements` from `fetchAchievementRuns`), so nothing new decides who earned what. The only new stored thing is which tag you **chose** to show.

## 6. The database

No new table. The challenges are generated (§2), and completions are runs.

```sql
-- supabase/daily.sql (new). Run once.
alter table public.runs add column if not exists challenge text;          -- '2026-11-03' (the day), null for a normal run
alter table public.runs add column if not exists challenge_on_day boolean not null default false;
alter table public.runs add column if not exists challenge_met boolean;   -- the target, judged by the server
create index if not exists runs_challenge_idx on public.runs (challenge, score desc) where challenge is not null;

alter table public.profile_looks add column if not exists shown_tag text; -- the tag you chose; null = none
```

**The server checks it.** `submit-run` already scores runs with the shared formula (`supabase/functions/_shared/score.ts`). It gets a sibling, `_shared/daily.ts`, the **same file the app uses** to generate the challenge and judge it. For a daily run the server:

1. regenerates the day's challenge from the date (refusing a date in the future);
2. checks the saved squad against the restriction (nationalities, ages, clubs, OVRs are all in the squad row);
3. judges the target from the run's result;
4. sets `challenge_on_day` from the server's own clock, not the client's.

What it can't check without seeded matches is the season itself (03 S-2). The board says so in the risk table, and a public board waits for I-6.

**Boards.** Ranks gets a *Daily* board: today's runs by score, met targets first. Each catalogue day opens its own board. A read through the existing public `runs` select, filtered by `challenge`; no new policy.

**The chosen tag** is written through the same owner-only path as the rest of `profile_looks`. The server checks that the tag is one you've earned before showing it: a `profile_tag_ok(user, tag)` function used by the profile view, so a hand-edited row can't show an unearned tag.

## 7. Where it touches the app

| Piece | File | Change |
|---|---|---|
| The generator and the judge | `supabase/functions/_shared/daily.ts` (new, imported by the app like `score.ts`) | `dailyChallenge(date)`, `fitsRestriction(player, r)`, `targetMet(run, challenge)` |
| Seeded spins and placement | `src/engine/draft.ts`, `src/engine/placement.ts` | take an optional `rng`; daily runs pass the day's stream |
| The draft filter | `app/game/draft.tsx` | offers only players who fit; a spin with none is a free reroll |
| Home card | `app/(tabs)/index.tsx` | today's challenge, done or not |
| Catalogue | `app/daily.tsx` (new route) | the list of days, your best, ticks; each day opens its board |
| Result | the one result screen (Wave F) | a "target met / missed" line under the verdict |
| Feats and tags | `src/lib/feats.ts`, `src/lib/tags.ts` (new) | derived from runs |
| Words | `src/i18n/en.ts`, `sk.ts` | every restriction, target and tag in both languages |
| Checks | `scripts/verify-daily.ts` (new) | pinned dates; every restriction checkable both ways; target rates in range; the same date gives the same spins |

## 8. Order

Daily challenges come **after phase two** (they need the one result screen and the stage model), as the first new feature before Phase 9. Steps:

### D1 · The generator and the seeded draft
**Build:** `_shared/daily.ts` with the restriction catalogue and targets; `rng` into the draft and placement; `verify-daily.ts`.
**Done when:** the same date gives byte-identical spins and placement twice; pinned dates match their stored output (fails if the generator changes); every restriction is checked against 1,000 random squads both ways (draft filter and squad check agree).

### D2 · Playing it
**Build:** the Home card, the run flow with the day's settings, the result line.
**Done when:** a daily run can't be started with a different difficulty or mode; the draft never offers a player who breaks the restriction (`verify-daily`).

### D3 · The server and the board
**Build:** `supabase/daily.sql`, `submit-run` judging daily runs, the Daily board on Ranks.
**Done when:** a squad that breaks the restriction is saved as `challenge_met = false` by the server even if the client says true; a future date is refused. **Maintainer:** runs `daily.sql`, redeploys `submit-run`.

### D4 · The catalogue
**Build:** `app/daily.tsx`, each day's board, replays.
**Done when:** the catalogue lists every day since the first; a replay never lands on that day's board.

### D5 · Feats and tags
**Build:** the five feats, the tags, choosing one in Edit profile, `profile_tag_ok`.
**Done when:** a hand-written `shown_tag` the user hasn't earned doesn't show (SQL test); the toast fires for the first daily.

Each step gets its Phase 9.5 checklist rows.

## 9. Open decisions

| # | Decision | Default |
|---|---|---|
| DC-1 | The day's clock | Central European time |
| DC-2 | First day | the day D4 ships, so the catalogue starts with something playable |
| DC-3 | Modes in the rotation | league, all time, classic Champions League, World Cup; the full path only for B18 (the hunt) |
| DC-4 | A public board before seeded matches (I-6) | no: the board is friends-scale until I-6 |
| DC-5 | Can you replay today's challenge for a better score? | yes, best run counts |

## 10. Risks

| Risk | Likelihood | What happens | Mitigation |
|---|---|---|---|
| The generator changes and rewrites the past | medium | old boards stop making sense | versions frozen by date; pinned dates in `verify-daily` |
| A restriction leaves a spin with nobody eligible too often | medium | lots of free rerolls, a flat draft | `verify-daily` reports empty-spin rates per restriction; drop or soften any over 30% |
| A modified client fakes a season | low now | a fake top score on a board | server checks the squad and the date; seeded matches (I-6) before the board goes public |
| Targets too easy or too hard | medium | the challenge isn't one | target rates measured per day by `verify-daily`, tuned in one table |
