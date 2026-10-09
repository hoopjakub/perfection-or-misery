# 07 · The second pass: measured, not read

> Part of the Phase 9.75 audit. Start at [`00-README.md`](00-README.md).
> Status: **findings, 7 October 2026**, asked for by the maintainer after the first pass ("do one more audit now, and then only start working"). This pass measures what the first one could only read, and looks where it didn't: the database itself and the screens' words. Scratch probes ran against `assets/db/players_v5.db` and `players_legal.db` and the engine in Node; they're deleted after.

---

## 1. What the measurements settled

| First pass said | Measured | Verdict |
|---|---|---|
| The spin reel looks flags up by the club-season id (P9.75-02) | Every World Cup club-season: **0 flags by the season id, all 48 nations by the club id** | **confirmed**, and every nation has a flag once the id is right |
| A spin's 448 ms might be a missing index (02 §6) | The squad query uses `idx_ps_club_season` and every join an index; **0.7 ms a query** in Node over 200 random squads | **not the database.** The 448 ms is the phone's JS side (the log shows a 274 ms stall *during* `draft:spin`): the async bridge and the screen's render, not SQLite |
| The Stats tab's 4–5 s: ranking (quadratic) or mounting (02 §2) | `positionRanks` on a 500-player board: **1.0–1.3 ms** in Node | **ranking ruled out** (even twenty times slower on a dev phone it's tens of ms). **Mounting every row is the remaining cause**; the "rank in one pass" fix is dropped |

## 2. New findings

| # | Finding | Class | Evidence | Fix |
|---|---|---|---|---|
| L-11 | **57 players with no name, in 23 squads, in both databases.** All from the open-data seed (`scripts/seed-open/conference_league.json`, `europa_league.json`, `CustomUcl.json`): a squad row whose name didn't parse, kept with a default nationality ("Dutch"), no birth year and a garbled secondary position. Excelsior Rotterdam and SC Telstar have six each, FC Groningen five, AC Sparta Prague three. In the draft they're blank cards; in a match sheet, a blank scorer. | Wrong | probe, both DBs; ids start `pztntfp__` | `build-open-seeds.ts` drops a player without a name (and logs the squad it came from); `build-db.ts` fails the build on any empty name, the way it fails on a placeholder colour (A-09); rebuild both databases, `DB_VERSION` 23 |
| L-12 | **"Resume" and "Pause" are English on the live match in Slovak** (`LiveMatch.tsx:355`, `{paused ? 'Resume' : 'Pause'}`). | Wrong | grep | `t('parts.resume')` / `t('parts.pause')` (or the keys that exist) |
| L-13 | **`verify-i18n` can't see mixed-case words in an expression.** It reads capitals (`'PAUSE'`) inside `{…}` and JSX text, so `'Resume'` passed. One sweep for that shape found only L-12, but the next one would pass too. | Unverified | the check's own rule (`verify-i18n.ts`, the capitals section) | a second rule: a string literal of letters and spaces, starting with a capital, as a ternary branch or JSX child, outside `t()` and the codes list; seen failing on L-12 before its fix |

## 3. Looked at and found sound

- **Every squad can be drafted**: no club-season has fewer than eleven players or no goalkeeper (1,678 club-seasons), and no player lacks a position.
- **Same name twice in one squad**, outside the nameless ones: a few real namesakes (two Sebastian Ohlssons, born 1992 and 1993, at Degerfors), which `footballerKey` (name, birth year, nationality) already keeps apart in the draft.
- **The draft's query plan** is indexed end to end.

## 4. Where these go in the build order

- L-11 joins **step 1** ([`06-BUILD-ORDER.md`](06-BUILD-ORDER.md)): a data fix with its build check, and both databases rebuilt.
- L-12 and L-13 join **step 3** (names), with the Slovak bracket.
- 02 §2's fix for the Stats tab is now *virtualise the board*; the ranking change is struck.
