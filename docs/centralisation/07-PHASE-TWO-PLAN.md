# 07 · Phase two: one base, only extend

Part of the [centralisation set](00-README.md). **Status:** plan, 24 September 2026. Nothing here is built.

The maintainer's rule for phase two: "we need to make everything have the same base and only expand". A mode may add to the base (the World Cup has thirds, the full path has qualifying), but it may not redraw or recompute what the base already does. This document says what the base is, in what order to build it, and how each step proves itself.

Two standing rules shape the steps:

- **No browser self-testing** in this repo. Each step's *Done when* is a typecheck, a `scripts/verify-*.ts` run or a grep count, plus a short list of what the maintainer checks on a phone.
- **Result-first stays.** Nothing in phase two touches how a match result is decided. The stage model is a read model built from the engine's existing results, so every score and every seed stays exactly as it is.

---

## 1 · Where the items land

| Step | Closes | Size |
|---|---|---|
| 0 · Clear the ground | C-17, L-10, L-11, C-09 | small |
| 1 · One team mark | A-01 to A-08, A-13 | medium |
| 2 · One set of engine helpers | L-01, L-02, L-03, L-14, L-15 | small |
| 3 · The stage model | L-04, L-05, L-06, C-04, L-13 | large |
| 4 · The stage shell for the live screens | F-03, F-05 to F-11, C-10, C-12, C-13, L-12, L-16, S-01, S-02 | large |
| 5 · One knockout view | F-04, F-12, F-17, F-18, C-05, C-06, C-07 | medium |
| 6 · One result screen (P8-54's batch) | F-13 to F-16, F-21, C-01, C-02, C-03, C-08, C-14, C-16, L-07, L-08, L-09 | large |
| 7 · Press in every stage | F-01, F-02 | medium |
| 8 · The remaining parity items | F-19, F-20, F-22, F-23, A-09 to A-12, C-11, C-15, C-18 | medium, can be split |

Every item in 02 to 06 appears in this table once.

## 2 · The base

### 2.1 · A run is a list of stages
Today the four families each keep their own shape: `simResult` for a league, `clResult` for either Champions League mode, `wcResult` for the World Cup, and the full path's domestic tables on the side (`customUclLeagues`). Every screen reaches into its own shape, and that is why every feature has to be added four times.

The proposal is a read model built on top of those results, which stay as they are:

```
Run
 └─ stages: Stage[]            league season · league phase · groups · qualifying · knockouts
     ├─ kind: 'table' | 'groups' | 'knockout'
     ├─ rounds: Round[]         matchday 1…n, or round of 32 … final
     │   ├─ label               "Matchday 3", "Round of 16"
     │   ├─ matches: Match[]    one type, whatever produced it
     │   └─ ties?: Tie[]        knockout rounds: legs, aggregate, extra time, shootout, who went through
     ├─ table?: StandingRow[]   table stages; groups have one per group
     └─ you: { clubId, position?, reached? }
```

| Family | Stages |
|---|---|
| League season | 1 · table |
| Classic Champions League | 1 · table (league phase) → 2 · knockout |
| World Cup | 1 · groups → 2 · knockout |
| Full path | 1 · table (domestic) → 2 · knockout (qualifying) → 3 · table (league phase) → 4 · knockout |

Every item that says "one X from the stage model" (`matchRequest`, `tieVM`, the round view, the result sections) reads this and nothing else. The adapters that build it from `simResult`, `clResult`, `wcResult` and the full path live in one file, `src/engine/stages.ts`, and are the only code that knows the four shapes exist.

### 2.2 · One team mark
`TeamMark({ clubId, name, size })` in the kit: a flag for a nation (by id, through `getFlag`), a crest for a club, and `clubCode(name)` as the fallback code. `ClubName` draws `TeamMark` and its name. No caller passes a flag. See [05](05-MARKS-AND-COLOURS.md) A-01.

### 2.3 · One pace
One `SPEED_MS` and one beat share, and the speed as a setting (`settingsStore`) rather than per-screen state, so it carries across stages and runs. The control bar (speed, skip, back to live) is drawn once, by the stage shell.

### 2.4 · One run chrome
`RunHeader` works out the skipped stages and the Season/Tournament name from the mode itself (S-01, S-02). For a run with more than one stage it shows the stage strip `Road` shows today, so the full path moves onto it (C-10). `CloseRun` calls the one `askAbandon` with the screen's real pause (L-12).

### 2.5 · One helpers module
`ordinal` and `surname` go in `src/lib/format.ts`. The engine already imports from `src/lib` (`commentary.ts`, `lineup.ts` and others), so `press.ts` can use the same `ordinal`. `compareStandings` and a seeded `shuffle(arr, rng)` go in the engine, since the engine is their main user. `clubCode` already exists once (`src/data/club-codes.ts:75`) and needs no work.

### 2.6 · One run-data path
`runData` (`src/lib/runData.ts`) is the only cache. The awards night, the result screen and every run page read it. `stashRunStats`/`takeRunStats` go (L-07).

## 3 · Implementation order

### Step 0 · Clear the ground
**Build.** Delete `FixtureList.tsx`, the unrendered `StandingsRow`, `TeamMatchdays`, `BracketTeam` and `StatBox` copies, and `wcViewMD` (C-17). Replace the twelve `ordinal` copies and the four `surname` copies with the shared helpers (L-10, L-11).
**Done when.**
- `tsc` is clean.
- `grep -rn "function ordinal\|const ordinal" app src` finds one definition.
- A 30-line `scripts/verify-format.ts` passes: `ordinal` for 1 to 40 (including 11, 12, 13, 21, 22, 23), and `surname` for "Virgil van Dijk" → "van Dijk", "Alexis Mac Allister" → "Mac Allister", "Kaká" → "Kaká".
- **Maintainer checks:** a classic Champions League run finishing 21st to 23rd in the league phase says "21st" on the result screen.

### Step 1 · One team mark
**Build.** `TeamMark` (§2.2). `ClubName`, `ResultRow`, `ScorelineCard`, `FixtureRow`, `TieCard`, `GroupWall`, the `LiveMatch` sides, the match sheet header and the club page head all draw it. Delete `withFlag` and `withCountryFlag`, and move the team-facing `flagForCountry` calls to `getFlag` (A-08).
**Done when.**
- `grep -rn "flag={" app src` finds no team flags passed by callers. Country flags (leagues, pundits) are still allowed.
- `grep -rn "withFlag\|withCountryFlag" app src` is empty.
- `grep -rn "flagForCountry(" app src` finds only country-name uses.
- **Maintainer checks:** in a World Cup run, the pundits table, the group results, the run hub rankings, a story, a nation's club page and the match sheet header all show round flags, and nowhere shows an initials badge for a nation. In a league run, the matchday scoreline card and the fixtures show crests.

### Step 2 · One set of engine helpers
**Build.** `compareStandings` with a final tiebreak (decision D4), used by all sixteen sorts (L-01) and by `match-context.ts` (L-03). One `SPEED_MS` (L-02). A seeded Fisher–Yates `shuffle` replacing the seven `Math.random` sorts, with a draw seed stored on the run next to `predictionSeed` (L-14). Every colour read goes through `getClubColours` (L-15).
**Done when.**
- `grep -rn "b.stats.points - a.stats.points" app src` finds one line.
- `grep -rn "Math.random() - 0.5" src` is empty.
- A new `scripts/verify-draws.ts` passes: the same draw seed gives the same qualifying draw, World Cup pots and fixture order across 1,000 runs, and over 100,000 shuffles of 8 items every item lands in every position within ±2% of an eighth.
- Every existing `verify-*.ts` still passes (the draws changing is expected, and the invariants must hold).

### Step 3 · The stage model
**Build.** `src/engine/stages.ts` with the adapters for the four families (§2.1). `matchRequest(match, stage)` (L-04, L-05) and `tieVM(tie)` (L-06, C-04) built on it. Every `openMatchStats` call and every tie row moves onto them. The pundits' field is built from the stage (L-13).
**Done when.**
- `scripts/verify-stages.ts` passes. For seeded runs of every mode it checks that each adapter keeps every match (count, scores, seeds, scorers identical to the source result), that each tie's aggregate, extra time and winner match the engine's, and that `matchRequest` carries rotation, absences and context for every stage that has them.
- `grep -rn "openMatchStats({" app src` finds no hand-built requests.
- **Maintainer checks:** a match sheet opened from the full path's league phase shows the same lineup the run hub's copy of that match shows.

### Step 4 · The stage shell for the live screens
**Build.** One shell that draws any table or groups stage from the stage model: header, tab set (C-12), control bar (§2.3), and the round view, which holds your match, the round's results, the team of the matchday, the lookback with back-to-live, and the standing figure with movement. Migrate one family at a time, in this order:
1. the league season, which is the reference and shouldn't lose anything;
2. the classic league phase;
3. the World Cup groups;
4. the full path's domestic season and league phase.

Decision D2 (your match live or as a card) is settled before this step starts.
**Done when.**
- Every row of [01 §3](01-MODE-MAP.md#3--screen--component-matrix-the-live-screens) reads ✓ for the four table and group columns, apart from what the decisions deliberately left out.
- `custom-ucl-simulation.tsx` and the two `simulation.tsx` components each shrink to their stage-specific parts. The target is under half their current lines (1,345; and 1,689 for `simulation.tsx` as a whole).
- **Maintainer checks:** the World Cup groups have speed chips, a lookback, a team of the matchday and a standing figure. The full path has an abandon button and shows standing movement.

### Step 5 · One knockout view
**Build.** One view that takes a knockout stage and a state (drawn, live, finished, "their picks") and draws it as a bracket or as a newest-first list. It replaces `BracketPreview`, `KnockoutPhaseView`, the full path's copy, `KnockoutRoundsView` and the run hub's rounds (C-06, C-07). The one shootout drawing (C-05) comes with it, and so do the team of the round (F-04) and the panel line on your tie in every family (F-12).
**Done when.**
- `PenShootout.tsx`, `KnockoutRoundsView.tsx` and the full path's knockout block are gone.
- `verify-stages.ts` also checks that the bracket's "who went through" matches the engine for every tie.
- **Maintainer checks:** a finished cup run shows its knockouts as a bracket, and the pundits' picks as the same bracket marked right or wrong (F-17, F-18).

### Step 6 · One result screen (P8-54's own batch)
The roadmap already plans P8-54 as "one result-screen skeleton shared by all four modes", to be built "after P8-71's centralisation has given tables, ties and scorelines one component each". Steps 1, 3 and 5 are that precondition. This step is P8-54, so its design comes from P8-54's note and [07d-SCREENS-RESULTS](../ui-overhaul/07d-SCREENS-RESULTS.md), not from here. From this set it takes:
- one section per stage, from the stage model: round by round with the team of the matchday (F-13, F-14), the position graph (F-15), the final table or the bracket;
- highlights for every run (F-16);
- history opens the same screen from saved data (F-21);
- `runData` as the only source (L-07), and the awards night built once (L-08);
- the old parts (`SquadSummary`, `StatBox`, the history summaries, raw `Text`) removed rather than restyled (C-08, C-14).

**Done when.** `runRoute` (`src/lib/nav.ts:23`) returns one route. Beyond that, P8-54's own *Done when* applies.

### Step 7 · Press in every stage
**Build.** Cup story kinds in `src/engine/press.ts` (group decided, through as a best third, a knockout upset, a tie won on penalties, your injuries and bans), written by the stage shell's round loop, and read by the story page and the share card unchanged (F-01, F-02).
**Done when.**
- `verify-press.ts` is extended to run seeded classic, World Cup and full path runs. It checks that every round writes at least one story, that no story names a club that isn't in the stage, and that stories are written once (none repeat across rounds).
- **Maintainer checks:** a World Cup run has a press tab, and a story from it can be shared.

### Step 8 · The remaining parity items
Each can be its own small batch:
- a manager award for the cups, measured against the pundits' round calls (F-19);
- the full path's domestic matches stored and counted (F-20);
- the pundits screen for the full path (F-22);
- marks and colours on the spin reel (F-23);
- the data gaps (A-09 to A-12);
- `InfoBubble` texts moved to `openRules` topics (C-11);
- the match sheet rebuilt on the shared parts (C-15, together with P8-48, as P8-54's note suggests);
- the old theme dropped file by file (C-18).

## 4 · Risks

| Risk | Where it bites | What limits it |
|---|---|---|
| The stage adapters lose or reorder a match, and the result screen quietly disagrees with the live one | Step 3 | `verify-stages.ts` compares every adapted match to its source, byte for byte on seeds and scorers |
| A seeded shuffle changes every draw, so old saved runs replay differently | Step 2 | Saved runs store their results, not their draws. Only new runs change; say so in the batch note |
| A final standings tiebreak changes who finishes where when clubs are fully level | Step 2 | Rare by construction (level on points, GD and goals). The decision (D4) is written down, and `verify-run-stats` is rerun |
| The stage shell flattens something a family does on purpose (the World Cup's thirds, the full path's split leagues) | Step 4 | "Only extend": the shell has a slot for stage-specific tabs and sections, and the league season migrates first as the reference |
| The large steps land as one big change the maintainer can't test in one sitting | Steps 3 to 6 | Each step migrates one family at a time and ships after each family |
| Phase two runs into P8-54 and both redesign the result screen | Step 6 | Step 6 *is* P8-54; this set only lists what it has to absorb |

## 5 · Left out, and when to add it

| Left out | Why | Add when |
|---|---|---|
| Rewriting the engine's result types into the stage model | Too big and too risky; the read model gets the benefit without touching result-first | If the adapters in `stages.ts` grow past a few hundred lines |
| Real competition tiebreak rules (head-to-head, away goals in the league phase) | A rules change, not centralisation (D4) | If the maintainer wants the sim to mirror each competition exactly |
| A player nationality flag | Nothing draws one yet (A-12) | When a screen needs it; the demonym table comes first |
| Changes to the career page | Not checked by this research (06 §5) | After a short look at how non-league modes are grouped there |

## 6 · Documents to update when this is built

- `docs/ui-overhaul/11-ROADMAP.md`: the P8-71 entry (each step's done note), P8-54 (step 6) and P8-48 (the match sheet, step 8).
- `docs/ui-overhaul/08-COMPONENTS.md`: add `TeamMark`, the stage shell, the knockout view and the one shootout; mark `PenShootout`, `KnockoutRoundsView`, `LeagueTableView`, `TeamLabel` and `WCGroupModal` as removed.
- `docs/PROJECT_STATE.md`: the stage model as the way screens read a run.
- `CLAUDE.md`: add `TeamMark`, `src/engine/stages.ts` and `src/lib/format.ts` to golden rule 3's list of things to reach for before writing a new one.
- This set: mark each item *(done, date)* where it is defined, and move the README's status to "as built" once step 8 lands.
