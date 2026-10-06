# 11 · The second re-audit: after Phase 8.5's Waves A to E

> Part of the [centralisation set](00-README.md). Status: **findings**, re-measured from the code on **2 October 2026** for the Wave G audit ([`../audit-2026-10/00-README.md`](../audit-2026-10/00-README.md)). Line numbers are from that day. Status words as in [`08-RE-AUDIT.md`](08-RE-AUDIT.md).

Between 29 September and 2 October, Waves A to E landed: dark and light, the European path, clubs, release plumbing, Slovak. Most of [`10-PHASE-TWO-REVISED.md`](10-PHASE-TWO-REVISED.md)'s step P went in with them. This re-audit counts again, the same way 08 did: a pattern count per item, spot-checked. Only items whose status changed, or that the plan acts on first, get a line; everything else is as 08 left it, and the table says so.

---

## 1. The short version

| Status | Count (of 90: 72 from phase one, 18 from 09) |
|---|---|
| Closed | 16 (08's 10, plus F-22, N-02, N-05, N-07, N-08, N-17) |
| Partly | 21 (08's 16, plus N-10, N-12, N-13, N-16, N-18) |
| Open | 42 (08's 36, less F-22 and L-02, plus eight N items) |
| Worse | 5 (L-02 joins L-04, L-08, L-13, A-09) |
| Wrong | 2 (L-10, one copy left; L-11) |
| Unverified | 1 (L-09) |
| Not re-measured | 3 (F-12, C-08, L-03) |

**What moved.** Step P is done (Waves A–C built the playtest notes on shared pieces: the You page wears `ProfileCard`, one share frame, clubs, the full path's pundits). Slovak (Wave E) closed most of L-10 by removing the wrong `ordinal` copies, and put every screen's words on keys, which turns out to be a centralisation in itself: one place for every label (`label()`), one for country names (`countryName()`).

**What didn't.** Steps 0 to 8 of the plan, as such, haven't started. The standings order is still written 14 times, the speed table three times (now with **three different sets of values**), the awards night built seven times, the match-sheet request by hand 20 times.

---

## 2. Changed since 29 September

| # | Item | Was | Now | Evidence (2 Oct) |
|---|---|---|---|---|
| L-02 | Speed tables | Open | **Worse** | Three tables and they disagree: `simulation.tsx:124` 2000/400/100, `LeagueSeason.tsx:62` 2000/400/100, `custom-ucl-simulation.tsx:162` **2200/900/250**. The full path's "normal" is twice as slow as the league's |
| L-04 | Hand-built match-sheet requests | Worse (18) | **Worse (20)** | `openMatchStats(` 20 call sites |
| L-10 | `ordinal` copies, some wrong | Wrong | **Wrong, one left** | Wave E aliased the shared one in `custom-ucl-simulation.tsx:110`, `SeasonParts.tsx:511`; the three "21th" copies are gone. **`pundits.tsx:40` keeps an English one**, wrong in Slovak (audit G-L6) |
| C-05 | Shootout drawings | Partly | **Partly, with a dead import** | `PenShootout` imported and not drawn by `cl-result.tsx:39`, `wc-result.tsx:39` |
| F-22 | The full path skips the pundits | Open | **Closed** | P8.5-15: `openPundits` from `custom-ucl-simulation.tsx:83` (`src/lib/punditsHandoff.ts`) |
| F-19 | Manager of the season: league only | Open | **Open** (unchanged, re-checked) | `clubsForManagerAward(` called in `awards.tsx:84` and `result.tsx:437` only |
| N-02 | "Your eight" in a six-game league phase | Wrong | **Closed** | `custom-ucl-simulation.tsx:1318` says "your six" for six matchdays |
| N-05 | The cup's ties have no match sheet | Open | **Closed** | P8.5-37: `cupTieRequest` (3 call sites) |
| N-07 | Only your competition is played past qualifying | Open | **Closed** | P8.5-14, the rest of Europe on the full path's result |
| N-08 | Europe's ceremony draws clubs without marks | Open | **Closed** | P8.5-13: `MarkRow` (2 uses) |
| N-10 | The mode named for one competition | Open | **Partly** | The name is "European Full Path" in both languages (P8.5-21); the id stays `champions_league_custom` (34 literals) because saved runs carry it, which is right |
| N-12 | Sixteen components fixed to one ground | Open | **Partly** | `useScreenRoles` in 9 files (P8.5-25); 5 places still pin `ROLES[FLOODLIT]`/nylon in `src/components`, by decision (the floodlit moments stay dark) |
| N-13 | Two ways to keep a field above the keyboard | Open | **Partly** | `KeyboardAvoidingView` in three screens (login, register, chat), each its own; the kit's wrapper wasn't made |
| N-16 | The globe twice | Open | **Partly** | Both remain (`GlobeReveal`, `SpinningGlobe`); About lands on Slovakia; the real fix is Phase 9's |
| N-17 | Your profile drawn two ways | Open | **Closed** | `ProfileCard` on You, the editor and `u/[id]` (3 uses) |
| N-18 | Two share cards | Open | **Partly** | One share frame with the owner (P8.5-04); the story card is still its own (`StoryShareCard` in `story.tsx`) |
| A-07 | Flags as emoji inside text | Open (17) | **Open (18)** | `withFlag`/`withCountryFlag` 18 hits; `withFlag` now also translates the name (`countryName`, Wave E), so it's the one place both happen |
| — | **New: words** | — | **Closed as built** | Every string on keys (2,748), engine labels through `label()`, countries through `countryName()`; `verify-i18n` fails on any literal left in an extracted file |

## 3. Unchanged (re-counted, same as 29 September)

F-01 (`writePress` 1 caller), F-03/F-04 (`RoundTeam` 4 mounts, none in the World Cup or knockouts), F-05 (`speed = 'slow'` ×2), F-06 (`wcViewMD` 3 refs, never set), F-07 (`delta={null}` ×2), **F-10 (no abandon in the full path)**, F-11 (no `useSizeClass` in the full path), F-15 (position graph 4 mounts), F-16 (highlights league-only), F-21 (two history summaries), C-02 (`WCGroupModal` in 3 files), C-04/L-06 (three tie view-model builders), C-09/L-11 (four `surname` copies), C-10 (`Road` ×12), C-11 (`InfoBubble` ×8), C-15 (`match-stats.tsx` 1,283 lines), C-17 (`StandingsRow`, `TeamMatchdays`, `BracketTeam` still defined), C-18 (13 old-theme importers, down from 15), L-01 (14 standings copies, no `compareStandings`), L-07 (5 run-stats stash calls), L-08 (7 `buildAwardsNight` calls), L-14 (7 biased shuffles), S-01 (7 `skipped=` copies), N-11 (private shuffles in `cl-qualifying`, `cl-sim` ×2, `cup-calls`, `domestic-cup`).

Not re-measured this time: F-12 (the panel line), C-08 (pitch and lineup drawings), L-03 (match-context ties by name). L-09 (two teams of the matchday) still needs its probe. The N items not named above (N-01, N-03, N-04, N-06, N-09, N-11, N-14, N-15) are open as 09 described them.

## 3a. Found while building step 1 (3 October)

| # | Item | Status | Evidence |
|---|---|---|---|
| N-19 | **The match sheet ignores the accent it's handed.** `openMatchStats(request, accent)` stores it (`src/lib/matchStats.ts:21`), and the sheet has drawn on cotton since P4-H without reading it; 20 call sites pass one | **Open** (dead parameter) | grep: no read of `request.accent` in `match-stats.tsx` or `MatchStatsParts.tsx`. Step 3 (the stage model's one request builder) drops it |
| N-20 | **Capitals outside `t()`.** Wave E's checks read text between tags and string props; strings in `{…}` and objects written in capitals slipped past (32 of them, in 10 files) | **Closed** | `verify-i18n` reads every file under `app/`, `src/components`, `src/lib` for capitals not in `t()`; it failed on 28 lines before the fixes |

## 4. What the counts say

1. **Shared pieces keep winning where they exist.** `TeamMark` holds at 31 uses, `BracketTree` grew from 9 to 11, `ProfileCard` and `MarkRow` closed their items the day they were made.
2. **Where there isn't one, copies drift.** The speed table is the clearest case: three copies, and in four days they stopped agreeing. That's the argument for doing step 2 (one set of engine helpers) before anything else in phase two.
3. **The result screens are the biggest single pile.** C-01, C-03, C-14, C-17, F-13 to F-16, F-21, L-07, L-08 all live in the four result files. Wave F and step 6 are one piece of work ([`../audit-2026-10/08-RESULT-PAGES.md`](../audit-2026-10/08-RESULT-PAGES.md)).

The order these feed into is [`12-PHASE-TWO-FINAL.md`](12-PHASE-TWO-FINAL.md).
