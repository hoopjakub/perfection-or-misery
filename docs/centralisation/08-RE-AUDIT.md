# 08 · The re-audit: phase one's 72 items, five days and a phase later

> Part of the [centralisation set](00-README.md). Status: **findings**, re-measured from the code on **29 September 2026**, after Phase 8 was built. Line numbers are from that day.

Phase one was written on 24 September. The maintainer's rule was that phase two waits until Phase 8 is done and this set is audited again: which items the Phase 8 work closed, which it left, which it made worse, and where everything now lives. This is that audit. New items that didn't exist on 24 September are in [`09-NEW-ITEMS.md`](09-NEW-ITEMS.md). The plan they add up to is [`10-PHASE-TWO-REVISED.md`](10-PHASE-TWO-REVISED.md).

**How it was measured.** One scratch script read every `.ts` and `.tsx` file under `app/` and `src/` and counted the patterns each item names (definitions, call sites, imports), then each count was spot-checked by hand. Where an item wasn't re-measured, the table says so rather than guessing. Nothing in the repo changed to produce this.

**Status words.**

| Word | Means |
|---|---|
| **Closed** | Done, with the evidence named |
| **Partly** | Some of the item landed; what's left is named |
| **Open** | As it was on 24 September |
| **Worse** | More copies or more drift than on 24 September |
| **Wrong** | Still gives a wrong answer today |
| **Unverified** | Might be wrong; still needs its probe |
| **Not re-measured** | Not checked this time; treat phase one's evidence as the last word |

---

## 1 · The short version

| Status | Count | Items |
|---|---|---|
| Closed | 10 | F-17, F-18, F-23, A-02, A-03, A-04, A-05, A-06, A-10, A-12 |
| Partly | 16 | F-13, F-14, C-01, C-03, C-04, C-05, C-06, C-14, C-17, C-18, L-05, L-06, L-15, A-01, A-08, A-13 |
| Open | 36 | F-01 to F-11, F-15, F-16, F-19 to F-22, C-02, C-07, C-09 to C-13, C-15, C-16, L-01, L-02, L-07, L-12, L-14, L-16, A-07, A-11, S-01, S-02 |
| Worse | 4 | L-04, L-08, L-13, A-09 |
| Wrong | 2 | L-10, L-11 |
| Unverified | 1 | L-09 |
| Not re-measured | 3 | F-12, C-08, L-03 |
| **Total** | **72** | |

The big change since phase one is **the team mark**. `TeamMark` exists (`src/components/kit/labels.tsx:74`) and has 31 call sites; `ClubName`, `ResultRow`, `ScorelineCard` and `LiveMatch` all draw it. That was step 1 of the plan, and it's most of the way done without anyone calling it step 1. The second big change is **the bracket**: `BracketTree` is on every cup result screen, in the run hub, behind the live "See the bracket" plate and in the pundits' tournament, which closes F-17 and F-18.

The biggest things untouched are the engine helpers (step 2: the standings order is still written 14 times, 7 shuffles are still biased and unseeded) and the stage shell (step 4: the World Cup still has no team of the matchday, the cups are still locked to slow, the full path still has no abandon).

---

## 2 · Feature parity (F)

| # | Item | Status | Today (29 Sept) |
|---|---|---|---|
| F-01 | Press only in the league season | **Open** | `writePress` has one caller, `LeagueSeason.tsx:289`. A cup run still writes no press |
| F-02 | Stories follow the press | **Open** | Comes with F-01 |
| F-03 | World Cup groups: no team of the matchday | **Open** | `RoundTeam` mounts: `LeagueSeason.tsx:504`, `simulation.tsx:712`, `custom-ucl-simulation.tsx:969, :1259`. None in the World Cup |
| F-04 | No team of the round in knockouts | **Open** | Same four mounts; no knockout view has one |
| F-05 | Speed chips in two families of four | **Open** | `Chips<Speed>`: `LeagueSeason.tsx:668`, `custom-ucl-simulation.tsx:980, :1276`. Still `const speed: Speed = 'slow'` at `simulation.tsx:219` and `:800`. The Europa and Conference League modes (P8-172) inherit the lock, since they run on the same screen |
| F-06 | World Cup lookback is dead code | **Open** | `wcViewMD` at `simulation.tsx:797`, read at `:1161, :1163`, still never set |
| F-07 | No standing movement in the full path | **Open** | `delta={null}` at `custom-ucl-simulation.tsx:921, :1227` |
| F-08 | Your fixtures: three versions, none in the league | **Open** | The classic league phase still has its tab (`simulation.tsx:698`); see also N-02 in 09 |
| F-09 | Your match live in some stages only | **Open** | Decision D2 still unanswered |
| F-10 | No abandon in the full path | **Open** | No `CloseRun` or `askAbandon` in `custom-ucl-simulation.tsx` (the eight call sites are all in `simulation.tsx`, `LeagueSeason.tsx`, `RunChrome.tsx` and `useSimBackGuard.ts`) |
| F-11 | No wide layout in the full path and knockouts | **Open** | `useSizeClass` isn't used in `custom-ucl-simulation.tsx` or in `KnockoutPhaseView` |
| F-12 | Panel line only on classic knockouts | **Not re-measured** | The full path still has no pundits (F-22), so at least that family still lacks it |
| F-13 | Round-by-round lookup after the run: league only | **Partly** | The cup result screens gained a "Teams of the matchday" plate into the run hub (P8-108: `cl-result.tsx:343`, `wc-result.tsx:425`, `custom-ucl-result.tsx:373`). The lookup itself is still only on `result.tsx` |
| F-14 | Team of the matchday on the result screen: league only | **Partly** | As F-13: reachable through the hub, not on the screen |
| F-15 | Position graph: league only | **Open** | `PositionCompare`/`PositionGraph`: `result.tsx:493`, `run.tsx:353`, `club.tsx:185` |
| F-16 | Season highlights: league only | **Open** | `highlights?.biggestWin` read only at `result.tsx:231, :233` |
| F-17 | No bracket after the draw | **Closed** | `BracketTree` on `cl-result.tsx:359`, `custom-ucl-result.tsx:389`, `wc-result.tsx:442`, `run.tsx:331`, and live behind "See the bracket" (`simulation.tsx:1570`, `custom-ucl-simulation.tsx:1368`) |
| F-18 | Pundits' calls not a bracket | **Closed** | P8-165: `PunditsPlayedOut` draws their tournament with `BracketTree` (`VerdictBlock.tsx:311, :364`) |
| F-19 | Manager of the season: league only | **Open** | `clubsForManagerAward` is imported by the three cup result screens and called by none; its comment still says the cups "have no manager award" (`awardsNight.ts:34`) |
| F-20 | The full path's domestic season disappears | **Open** | Unchanged; now it's also where the cup is played (P8-52), which the result doesn't show either |
| F-21 | Past cup runs open an older screen | **Open** | `CLHistorySummary` (`cl-result.tsx:498`) and `WCHistorySummary` (`wc-result.tsx:518`), for runs saved before the full tournament was stored |
| F-22 | The full path skips the pundits | **Open** | Now P8.5-15 as well. `CustomCLPlacement` still has no pundits step |
| F-23 | Colourless World Cup spin | **Closed** | P8-163: every reel item wears its crest or flag, coloured from the picture (`markColoursOf`) |

## 3 · Drawn differently (C)

| # | Item | Status | Today (29 Sept) |
|---|---|---|---|
| C-01 | Twelve table drawings | **Partly** | Gone: `PunditsRoundTable` and `PunditsTournament`'s group tables (P8-165 draws the pundits' tournament with `LeagueTable` and `GroupWall`), and the full path's dead `StandingsRow`. Still there: `LeagueTableView` (`CustomUclViewers.tsx:109, :143`), `cl-result.tsx`'s dead `StandingsRow` (`:415`), the pundits screen's own row, `PunditsTable` (league verdict), the run hub ranking, the two story tables, `GroupWall`'s mini rows |
| C-02 | Two ways to open a table in a sheet | **Open** | `WCGroupModal` (4 references) and `CustomUclViewers` |
| C-03 | Fourteen match and tie drawings | **Partly** | They all draw `TeamMark` now (step 1's half of it). The drawings themselves are as many as before, plus the league cup's tie drawn as a `ResultRow` with a round label (N-03) |
| C-04 | Four tie view-model builders | **Partly** | Three left: `tieToVM` (`simulation.tsx:1677`), `clTieToVM` (`custom-ucl-simulation.tsx:109`), `koTieToVM` (`KnockoutRoundsView.tsx:68`). The run hub's `tieVM` is gone |
| C-05 | Three shootout drawings | **Partly** | `PenShootout` has no users left, but the file is still there (`src/components/PenShootout.tsx`): dead code now. `LiveMatch` and the match sheet each still draw their own |
| C-06 | Seven views of a knockout | **Partly** | `BracketTree` is the one bracket. The list views (`KnockoutPhaseView`, the full path's copy, `KnockoutRoundsView`, `QualifyingLadder`) remain |
| C-07 | "Newest round first" twice | **Open** | `KnockoutPhaseView` and `custom-ucl-simulation.tsx` (`koScrollRef`, `koAway`) |
| C-08 | Pitch and lineup drawings | **Not re-measured** | |
| C-09 | Four `surname` copies | **Open** | `draft.tsx:60`, `reveal.tsx:54`, `PitchViews.tsx:188`, `AwardsParts.tsx:98` |
| C-10 | Three kinds of header | **Open** | `Road` has 11 uses in `custom-ucl-simulation.tsx`; `RunHeader` none there |
| C-11 | Explainers: a bubble and a route | **Open** | `<InfoBubble` in 7 screen places (`cl-result.tsx:357, :370`, `custom-ucl-result.tsx:387, :400, :408`, `custom-ucl-simulation.tsx:1392`, `placement.tsx:498`) |
| C-12 | Four tab sets | **Open**, and one more | The league season now has table · results · **cup** · press (P8-173) |
| C-13 | Speed, skip and back-to-live drawn per screen | **Open** | |
| C-14 | Cup result screens half old | **Partly** | P8-123 moved their text onto the kit's scale (`ScaleText as Text` in `cl-result.tsx:7`, `custom-ucl-result.tsx:8`, `wc-result.tsx:9`), but they still import the old theme and keep their own `StatBox` (`cl-result.tsx:406`, `wc-result.tsx:508`) |
| C-15 | The match sheet is the biggest old screen | **Open** | `match-stats.tsx` is 1,281 lines; still `withFlag` ×14 |
| C-16 | `WCGroupModal` isn't a modal | **Open** | |
| C-17 | Dead code beside live code | **Partly** | Gone: the full path's dead copies. Still dead: `FixtureList.tsx`, `StandingsRow` and `TeamMatchdays` (`cl-result.tsx:415, :434`), `BracketTeam` (`cl-result.tsx:478`, `wc-result.tsx:562`), `wcViewMD`. **New dead:** `PenShootout.tsx` |
| C-18 | Files importing the old theme | **Partly** | 15, down from 19 |

## 4 · Computed differently (L)

| # | Item | Status | Today (29 Sept) |
|---|---|---|---|
| L-01 | The standings order written 16 times | **Open** | 14 copies of `b.stats.points - a.stats.points`; no `compareStandings` |
| L-02 | Three speed tables | **Open** | `simulation.tsx:116`, `LeagueSeason.tsx:58`, and `custom-ucl-simulation.tsx:152`, still `{ slow: 2200, normal: 900, fast: 250 }` |
| L-03 | Match context breaks ties by name | **Not re-measured** | Goes with L-01 |
| L-04 | Hand-built match-sheet requests | **Worse** | 18 `openMatchStats` calls, up from 16 |
| L-05 | The full path's live sheet leaves out half the request | **Partly** | `mdRequest` (`custom-ucl-simulation.tsx:194`) now carries rotation, absences and stand-ins (P8-115 moved the league phase onto `playFixture`). Still no formation, matchday or schedule context |
| L-06 | Four tie view-model builders (computing side) | **Partly** | As C-04: three |
| L-07 | Run stats computed three ways | **Open** | `stashRunStats`/`takeRunStats` in all four result screens and the awards route |
| L-08 | The awards night built six times | **Worse** | Seven: `awards.tsx:80`, `cl-result.tsx:335`, `custom-ucl-result.tsx:365`, `player.tsx:74`, `result.tsx:435`, `run.tsx:378`, `wc-result.tsx:417` |
| L-09 | Two teams of the matchday | **Unverified** | Still needs its probe |
| L-10 | `ordinal` copies, some wrong | **Wrong** | `src/lib/format.ts:6` exists and has 8 importers, but 11 local copies remain, and three are still wrong ("21th"): `cl-result.tsx:533`, `custom-ucl-result.tsx:455`, `wc-result.tsx:578` |
| L-11 | `surname` loses particles | **Wrong** | The four copies of C-09, unchanged |
| L-12 | Two abandon confirms | **Open** | `LeagueSeason.tsx:348` keeps its own; the full path has none |
| L-13 | The pundits' field mapped by hand | **Worse** | Now also mapped for the pundits' tournament on the pundits screen and on each cup result screen (`PunditsPlayedOut`'s `build` closures), five places in all |
| L-14 | Biased, unseeded shuffles | **Open** | Still 7 (`cl-qualifying.ts:144`, `cl-sim.ts:505`, `fixtures.ts:31`, `quick-sim.ts:454`, `world-cup-sim.ts:159, :279, :367`). The new code of 26–28 September uses seeded Fisher–Yates instead (`domestic-cup.ts`, `cup-calls.ts`), which is right but adds two more private shuffles (N-10) |
| L-15 | Club colours read two ways | **Partly** | The reel reads colours off the pictures now (`markColoursOf`, P8-163); the draft still passes `primary_color` into the spin item (`draft.tsx:218`) |
| L-16 | The pundits hand over two ways | **Open** | `?start=1` for a league (`pundits.tsx:133`), a tap for the cups |

## 5 · Marks and colours (A)

| # | Item | Status | Today (29 Sept) |
|---|---|---|---|
| A-01 | Seventeen places decide a team's mark | **Partly** | `TeamMark` decides it by id in most places now (31 uses). Still deciding on their own: the match sheet header and parts (`withFlag`, `flagForCountry` at `match-stats.tsx:384, :393`), the deep match (`deep-match.tsx:224`), the draft card (`draft.tsx:596`, by name) and Europe's ceremony rows (N-12) |
| A-02 | `ClubName` without a flag | **Closed** | `ClubName` draws `TeamMark` (`labels.tsx:110`) |
| A-03 | Result rows draw nations as crests | **Closed** | `ResultRow` draws `TeamMark` (`SeasonParts.tsx:370, :374`) |
| A-04 | Pundits' tables with no marks | **Closed** | The tournament is drawn with `LeagueTable`/`GroupWall`; the league verdict's table draws `TeamMark` (`VerdictBlock.tsx:225`) |
| A-05 | Hero cards with no mark | **Closed** | `ScorelineCard` (`SeasonParts.tsx:321, :326`), `LiveMatch` (`:365`) |
| A-06 | The club page looks its id up by name | **Closed** | `club.tsx:81` draws `TeamMark` with the route's id |
| A-07 | Flags as emoji inside text | **Open** | 17 `withFlag`/`withCountryFlag` hits (14 in `match-stats.tsx`, 3 in `MatchStatsParts.tsx`) |
| A-08 | Flags looked up by name | **Partly** | Team uses remain in `deep-match.tsx:224`, `draft.tsx:596`, `match-stats.tsx:384, :393, :899`, `MatchStatsParts.tsx:257` |
| A-09 | Clubs on the placeholder colour | **Worse** | **6 rows** now, up from 5: the new Europa League seed brought `paok_thessaloniki_uel`. The build check phase one proposed (fail on any placeholder row) would have caught it |
| A-10 | Clubs without a crest | **Closed** | P8-171 |
| A-11 | No World Cup competition mark | **Open** | |
| A-12 | 157 of 182 nationalities without a flag | **Closed** | 29 September: `flagForNationality` (`src/data/geo-iso.ts`), 182 of 182, checked by `scripts/verify-nationality.ts` |
| A-13 | `RoundFlag`'s fallback code written five ways | **Partly** | `TeamMark` gives one path; the direct `RoundFlag` callers weren't re-counted |

## 6 · Screen-only (S)

| # | Item | Status | Today (29 Sept) |
|---|---|---|---|
| S-01 | The "skipped stage" rule copied | **Open** | 7 copies of `skipped={…}` (`draft.tsx:718`, `formation-select.tsx:114, :130`, `placement.tsx:67`, `pundits.tsx:140`, `reveal.tsx:61`, `LeagueSeason.tsx:587`) |
| S-02 | The pundits' header says Season in a cup | **Open** | `pundits.tsx:139` passes no `tournament` |

---

## 7 · What the counts say

1. **Where there was a shared piece to reach for, it got used.** `TeamMark` and `BracketTree` were built as the one shared piece and spread to 31 and 9 call sites. Where there wasn't one (the standings order, the speed table, the tie view model, the match-sheet request), new code copied the old way, and three items got worse.
2. **The cheapest real bugs are still there.** L-10 ("21th") and L-11 ("Dijk") were step 0 of the plan and are untouched: three wrong `ordinal` copies and four `surname` copies.
3. **The Europa and Conference League modes inherited the Champions League's gaps** because they run on its screens: the speed lock (F-05), `MODE_THEMES.champions_league` accents, and the "Your eight" wording, which is wrong for a six-game league phase (09 N-01, N-02).
4. **A new seed brought a new data gap** (A-09). Data checks that fail on a condition, rather than on a list of known bad rows, are the ones that keep working.

## 8 · Documents to update when this is acted on

- This set's [`00-README.md`](00-README.md): the status line and the short-version table (done 29 September).
- [`07-PHASE-TWO-PLAN.md`](07-PHASE-TWO-PLAN.md): superseded by [`10-PHASE-TWO-REVISED.md`](10-PHASE-TWO-REVISED.md) for the order; its §2 (the base) still stands.
- Each item above gets *(closed, date)* in its original document (02–06) when phase two closes it.
