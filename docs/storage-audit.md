# What a run keeps (P8-96)

**Date:** 25 September 2026. **Status:** audit done, and the gaps it found are fixed in batch 15 (below).

P8-96 asked for four lists: what the engine computes during a run, what the result pages show, what a saved run keeps, and what gets computed and then thrown away (or saved and never shown). The maintainer's report behind it (22 September): a run opened again had no press, no match-by-match detail and no teams of the matchday.

## 1 · What a run computes

| Computed | Where | Kept on the live run as |
|---|---|---|
| Every match: score, scorers (attributed once), seed, rotation, absences and stand-ins | `src/engine/simulation.ts`, `cl-sim.ts`, `world-cup-sim.ts`, `cl-qualifying.ts` | `simResult.matchdayHistory` (league), `clResult`, `wcResult`, `customUclQual` |
| Knockout ties: legs, extra time, penalties with named kicks | the same | inside `clResult` / `wcResult` |
| The table after every matchday | league sim | `matchdayHistory[].standings` |
| Highlights: biggest win, worst loss, upsets, the medical table | league sim | `simResult.biggestWin` etc. |
| The press, round by round | `src/engine/press.ts` (league season only) | `simResult.press` |
| The pundits' calls | `src/engine/predictions.ts`, from `predictionSeed` | the seed on the store |
| Run stats: totals, awards, every player's match log, the teams of the matchday, the shapes played | `src/engine/run-stats.ts`, regenerating each match sheet from its seed | `runData` (stats, awards, matchLog, rounds, matches, positions) |
| Kick-off dates and venues | `src/engine/schedule.ts`, `src/data/venues.ts` (P8-92, P8-93) | nothing: worked out from the round, the season and the two sides |

## 2 · What the result pages show

The four result screens are mapped section by section in [centralisation 01 §4](centralisation/01-MODE-MAP.md). In short, the league verdict shows the most: the matchday strip, the position graph, a round's results, the team of the matchday and the highlights. The cup verdicts show your matches, the bracket (since P8-79) and the pundits' tournament view. The run hub and the player and club pages show the stats, the match logs, the press and the squad.

## 3 · What a saved run keeps

One `runs` row, with these columns:

| Column | Holds |
|---|---|
| `mode`, `formation`, `team_ovr`, `league_id`, `league_name`, `year_start` | what the run was |
| `final_position`, `teams_in_league`, `tier`, `wins`, `draws`, `losses`, `goals_for`, `goals_against`, `score` | how it ended |
| `squad` | your drafted players, bench included |
| `difficulty`, `difficulty_meta` | how hard it was |
| `matchday_history` (league) | every matchday: fixtures with scores, scorers, seeds, rotation and absences, and the table |
| `highlights` (league) | biggest win, worst loss, upsets, the medical table; **since P8-96 also the press and the pundits' calls** |
| `wc_result` / `cl_result` | the whole tournament; the full path adds its qualifying ties and domestic tables inside `cl_result` |
| `stats`, `awards` | the totals and the awards as they were on the night |
| `duration_seconds` | how long it took (P8-88) |

## 4 · Computed and thrown away, or saved and never shown

| Finding | Before | Now (batch 15) |
|---|---|---|
| **Every match was saved, and never read back.** A league's matchday history and a cup's whole result are in the row, but a saved run's pages read only the totals, so there was no match-by-match detail, no teams of the matchday, no player match logs, no position graph and no bracket. | `savedRunData` set `matches`, `matchLog`, `rounds` and `positions` to nothing | `src/lib/runData.ts` rebuilds them from the stored matches and seeds, with the same stats pass the live run uses. The saved totals and awards stay the record. |
| **The press was written and thrown away.** | never saved | saved in `highlights.press`. Stories from a saved run open (the story page reads that run). Runs saved before this still have none, and the page says so. |
| **The pundits' calls came from a seed that wasn't saved**, so the verdict opened from history had no pundits. | lost | the calls themselves (club → predicted place) are saved in `highlights.pundits`, and the league verdict reads them back. The calls are saved rather than the seed because rebuilding them from the seed needs the field in the order it was first given. |
| Highlights exist only for league runs | the cups compute none | open: [centralisation F-16](centralisation/02-FEATURE-PARITY.md) |
| A saved cup run opens an old summary screen | the league reads its saved run into the full screen | open: [centralisation F-21](centralisation/02-FEATURE-PARITY.md), part of P8-54 |
| The full path's domestic matches aren't stored at all (only its tables) | not stored | open: [centralisation F-20](centralisation/02-FEATURE-PARITY.md) |

## 5 · New material for the result pages (proposals, for P8-54's rebuild)

These use data a run already has, so none of them needs anything new stored:

- **When and where:** the date and ground of your biggest win and your worst defeat (P8-92, P8-93), and a World Cup's grounds on the map with the ones you played at ringed (built for the World Cup result in batch 15).
- **The season in rivals:** your position line against the clubs that finished either side of you (the comparison graphs of P8-95).
- **The pundit who got you most right**, from the panel's twelve tables.
- **Your best eleven by rating**, from the match logs, beside the most-used one (the club page's P8-70 pitch).
- **The turning point:** the matchday your position moved most, and the match behind it.
