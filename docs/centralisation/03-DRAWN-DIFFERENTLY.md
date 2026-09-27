# 03 · Drawn differently: the same thing, drawn more than once

Part of the [centralisation set](00-README.md). **Status:** findings, as of 24 September 2026, with a proposal line on each item.

These items are one idea (a table, a match, a tie, a shootout, a header) drawn by more than one component, so a fix to one never reaches the others. That is how P8-156 happened: every tie drawn through one adapter lost its crests, and the other tie drawings kept theirs. Team marks (crests and flags) are the worst case, so they get their own document, [05](05-MARKS-AND-COLOURS.md).

Each item lists **the drawings** with evidence, and then **the base**: the proposal for which drawing survives, which others become its options, and which get deleted.

---

## 1 · Tables

### C-01 · Twelve drawings of a table
| # | Drawing | Where | Kind |
|---|---|---|---|
| 1 | `LeagueTable` | `src/components/season/SeasonParts.tsx:91` | kit, the base |
| 2 | `LeagueTableView` | `src/components/CustomUclViewers.tsx:74` | old (`Text`, old theme) |
| 3 | `StandingsRow` | `app/game/cl-result.tsx:396` | old, **never rendered** (C-17) |
| 4 | `StandingsRow` | `app/game/custom-ucl-result.tsx:439` | old, **never rendered** |
| 5 | pundits screen `TableRow` | `app/game/pundits.tsx:223` | kit, own row |
| 6 | `PunditsTable` | `src/components/season/VerdictBlock.tsx:158` | kit, own row, no marks |
| 7 | `PunditsRoundTable` | `VerdictBlock.tsx:208` | kit, own row, no marks |
| 8 | `PunditsTournament` group tables | `VerdictBlock.tsx:279-290` | kit, own row, no marks |
| 9 | run hub stat ranking | `app/game/run.tsx:82-88` | kit, own row |
| 10 | story table | `app/game/story.tsx:90` | kit, own row |
| 11 | story share card table | `app/game/story.tsx:157` | kit, own row |
| 12 | `GroupWall` mini tables | `SeasonParts.tsx:526` | kit, own row |

**Base.** `LeagueTable` becomes the one table. What the others add becomes a column option: a predicted place (5 to 8), a value instead of points (9), a compact mini form (12). Rows 3 and 4 are deleted. Row 2 goes when the full path's domestic tables move onto `LeagueTable` (they are league tables).

### C-02 · Two ways to open a table in a sheet
**Today.** A World Cup group opens through `WCGroupModal` (`src/components/WCGroupModal.tsx:70`, `openSheet`). A domestic league in the full path opens through `CustomUclViewers` (`:156, :163`, `openSheet`). They are two builders with two layouts: the first uses `LeagueTable` plus old `TeamLabel` matchdays, the second the old `LeagueTableView`.
**Base.** One "stage sheet" that opens any table-shaped stage (a group, a league, a league phase) with its rounds underneath, drawn with the same parts as the live screen.

## 2 · Matches and ties

### C-03 · Fourteen drawings of a match or a tie
| # | Drawing | Where | Shows |
|---|---|---|---|
| 1 | `ResultRow` | `SeasonParts.tsx:317` | a result, crests always (A-03) |
| 2 | `ScorelineCard` | `SeasonParts.tsx:270` | your result, **no marks** |
| 3 | `FixtureRow` | `SeasonParts.tsx:493` | your fixture, a flag or nothing |
| 4 | `TieRow` | `SeasonParts.tsx:636` | a tie, via `TieVM` |
| 5 | `TieCard` | `SeasonParts.tsx:665` | your tie, won or lost |
| 6 | `KnockoutTieRow` | `src/components/KnockoutRoundsView.tsx:99` | a tie, via `KoTieVM` → `TieVM` |
| 7 | `KoLeg` | `src/components/CustomUclViewers.tsx:215` | one leg, old `Text` |
| 8 | `MatchRow` | `app/game/club.tsx:212` | a club's match, with its shape |
| 9 | `LiveMatch` side | `src/components/LiveMatch.tsx:312` | a flag or nothing |
| 10 | `TeamMatchdays` | `cl-result.tsx:415`, `custom-ucl-result.tsx:456` | **never rendered** |
| 11 | `WCGroupModal` matchdays | `WCGroupModal.tsx:40-46` | old `TeamLabel` |
| 12 | match sheet form rows | `app/game/match-stats.tsx:1059, :1090` | old `Text` + emoji flag |
| 13 | `PunditsTournament` tie row | `VerdictBlock.tsx:305-312` | names only |
| 14 | `BracketPreview` rows | `src/components/BracketPreview.tsx:246, :315` | `ClubName` |

**Base.** Three drawings survive, one per job. `ResultRow` shows a played match, `FixtureRow` a match still to come, and `TieRow` a two-legged or one-off tie. `ScorelineCard`, `TieCard` and the `LiveMatch` sides are the same match at hero size, so they take the same props and draw the same team mark (A-01). Rows 7, 10, 11 and 12 go. Row 8 becomes `ResultRow` with a trailing shape tag.

### C-04 · Four tie view-model builders feed one row
**Today.** `TieVM` is built in four places: `tieToVM` (`app/game/simulation.tsx:1591`), `clTieToVM` (`app/game/custom-ucl-simulation.tsx:111`), `tieVM` (`app/game/run.tsx:236`), and `koTieToVM` (`KnockoutRoundsView.tsx:103`), which has three adapters of its own (`:134, :164, :187`). P8-156 was the adapters dropping club ids. The computing side of this is L-06; the drawing side is that four builders decide separately what a tie row shows.
**Base.** One `tieVM(tie)` from the stage model's tie type (07 §2.1).

### C-05 · Three shootout drawings
**Today.**
- `LiveMatch` draws kit tags per side, five regulation slots, sudden death only once it's taken, and a taker line (`LiveMatch.tsx:292, :322`, P8-160).
- `PenShootout` (`src/components/PenShootout.tsx:7`, old theme) is still used by `cl-result.tsx`, `wc-result.tsx` and `CustomUclViewers.tsx`.
- The match sheet draws its own, kick by kick, with names (`match-stats.tsx:540, :672`).

**Base.** One shootout drawing with two modes, *as it happens* (the live reveal) and *all at once* (the sheet and the result screens). `PenShootout` goes.

### C-06 · Seven views of a knockout
| View | Where | When |
|---|---|---|
| `BracketPreview` | `src/components/BracketPreview.tsx` | before the knockouts (classic, WC, full path) |
| `KnockoutPhaseView` | `simulation.tsx:1475` | live, classic and WC |
| full path's own knockout view | `custom-ucl-simulation.tsx:1255-1320` | live, full path |
| `KnockoutRoundsView` | `src/components/KnockoutRoundsView.tsx` | the three cup result screens |
| `QualifyingLadder` | `src/components/QualifyingLadder.tsx` | full path qualifying, live and result |
| run hub rounds | `run.tsx:264` | run hub |
| `PunditsTournament` ties | `VerdictBlock.tsx:295-315` | cup result screens |

**Base.** One knockout view that takes a round list and a state (drawn, live, finished, "their picks"), in two layouts: a bracket and a newest-first list. See F-17 and F-18, which are the two features this unlocks.

### C-07 · "Newest round first" is written twice
**Today.** P8-63 made the knockouts show the newest round first and hold the next round while you've scrolled away. It exists in `KnockoutPhaseView` (`scrolledAway`, `onAwayChange`) and again in the full path (`koScrollRef`, `koAway`, `custom-ucl-simulation.tsx:272-274, :754`).
**Base.** Lives in the one knockout view (C-06).

## 3 · Players and pitches

### C-08 · Four pitch and lineup drawings, and a squad list
| Drawing | Where | Kind |
|---|---|---|
| `FormationPitch` on the kit `Pitch` | `src/components/season/AwardsParts.tsx` | kit: awards, team of the matchday, club page |
| draft pitch with `Hanger`s | `app/game/draft.tsx`, `src/components/setup/DraftParts.tsx:181` | kit |
| `MatchLineupPitch` | `src/components/MatchLineupPitch.tsx` | old theme: match sheet, deep match |
| `LineupPitch` | `src/components/LineupPitch.tsx` | kit, already a wrapper round `FormationPitch` (P8-104): all four result screens |
| `SquadSummary` | `src/components/SquadSummary.tsx` | old theme, 10 raw `<Text>`: all four result screens |

**Base.** The kit `Pitch` with one slot drawing, where the slot content (a rating square, a hanger, event marks, starts) is an option. `LineupPitch` already shows the way: it is a thin wrapper that hands your XI to `FormationPitch`. `SquadSummary` becomes kit rows under it. `MatchLineupPitch` becomes `FormationPitch` with an event-marks option, drawn with the kit `EventMark` the match sheet and the player page already use.

### C-09 · Four copies of `surname`
**Today.** `draft.tsx:49`, `reveal.tsx:49`, `src/components/match/PitchViews.tsx:188` and `AwardsParts.tsx:86` each take the last word of the name. "Virgil van Dijk" becomes "Dijk" in all four. The reveal copy also upper-cases it.
**Base.** One `surname()` that keeps particles ("van Dijk", "de Jong", "Mac Allister"), in one place. This is L-11 on the computing side.

## 4 · Screen chrome

### C-10 · Three kinds of header
**Today.** `RunHeader` is used from mode select to the live screens. The full path uses its own `Road` progress header instead (12 uses in `custom-ucl-simulation.tsx`, from `:799`). The match sheet has its own old top bar (`match-stats.tsx:339`), and the old history summaries have theirs (`cl-result.tsx:487`).
**Base.** `RunHeader` everywhere in a run. `Road` becomes `RunHeader`'s stage strip when a run has more than one stage, which is the one thing it shows that `RunHeader` can't.

### C-11 · Explainers: a bubble and a route
**Today.** Content is meant to go on routes, and explainers through `openRules(topic)` (`CLAUDE.md`, UI conventions). There are 3 `openRules` calls, against 9 uses of the old `InfoBubble` (in `cl-result.tsx`, `custom-ucl-result.tsx`, `custom-ucl-simulation.tsx`, `placement.tsx`, `CustomUclViewers.tsx` and `KnockoutRoundsView.tsx`).
**Base.** `openRules` only. Each `InfoBubble` text becomes a rules topic.

### C-12 · Four different tab sets on the live screens **(named, "simulation tabs")**
| Stage | Tabs | Where |
|---|---|---|
| League season | table · results · press | `LeagueSeason.tsx:56, :483` |
| Classic league phase | table · results · fixtures | `simulation.tsx:233, :661` |
| World Cup groups | group · thirds · results · groups | `simulation.tsx:855, :1310` |
| Full path, domestic and league phase | table · results | `custom-ucl-simulation.tsx:249-250, :883, :1152` |

The tabs mean nearly the same things under different names, and each family is missing one the others have: the press (F-01), your fixtures (F-08), the other groups.
**Base.** One tab set built from what the stage has: **Table** (or *Your group*), **Results**, **Fixtures**, **Press**, plus **Other groups** or **Thirds** for a group stage. It is written once, in the stage shell.

### C-13 · Speed, skip and back-to-live are drawn per screen
**Today.** `Chips<Speed>` is laid out by hand in three places (`LeagueSeason.tsx:572`, `custom-ucl-simulation.tsx:924, :1182`), `SkipPlate` in five, and `BackToLive` in five with different labels. The knockouts have a separate "Skip to the final" `Plate` (`simulation.tsx:1578`).
**Base.** One control bar in the stage shell: speed, skip (with the stage's own consequence text), back to live.

## 5 · Old screens and old parts

### C-14 · The cup result screens are still half old
**Today.** Raw `<Text>` counts (not `KitText`): `cl-result.tsx` 26, `custom-ucl-result.tsx` 19, `wc-result.tsx` 13, against 0 in `result.tsx`. Each cup result screen also has its own `StatBox` (`cl-result.tsx:387`, `custom-ucl-result.tsx:435` (unused), `wc-result.tsx:460`) and imports the old `colors`/`typography` theme. Each has its own `ordinal` too, and three of them are wrong (L-10).
**Base.** They stop existing as separate screens (07 §3, step 6). Until then, nothing new goes into them.

### C-15 · The match sheet is the biggest old screen
**Today.** `app/game/match-stats.tsx` has 83 raw `<Text>` and `MatchStatsParts.tsx` 51. Batch 12 rebuilt parts of it (the feed, the timeline, the stat bars), so a single sheet now mixes kit and old drawing. `CustomUclViewers.tsx` (34) and `SquadSummary.tsx` (10) are the next biggest.
**Base.** Rebuilt with the shared parts from this document: team marks (A-01), the shootout (C-05), the pitch (C-08), the form rows (C-03).

### C-16 · `WCGroupModal` isn't a modal
**Today.** Phase 5 deleted content modals, and `WCGroupModal` now opens a sheet (`WCGroupModal.tsx:70`). The name still says modal, and its header comment says it is "used identically on the result screen and during the live group-stage review" (`:13-14`).
**Base.** It becomes the stage sheet in C-02.

### C-17 · Dead code left beside live code
| Dead | Where | Why it's dead |
|---|---|---|
| `FixtureList.tsx` | `src/components/FixtureList.tsx` | imported by nothing |
| `StandingsRow` | `cl-result.tsx:396`, `custom-ucl-result.tsx:439` | defined, never rendered |
| `TeamMatchdays` | `cl-result.tsx:415`, `custom-ucl-result.tsx:456` | defined, never rendered |
| `BracketTeam` | `cl-result.tsx:459`, `custom-ucl-result.tsx:491`, `wc-result.tsx:514` | defined, never rendered |
| `StatBox` | `custom-ucl-result.tsx:435` | defined, never rendered |
| `wcViewMD` | `simulation.tsx:756` | state that nothing sets (F-06) |

**Base.** Delete. It's the cheapest step in phase two and it makes every later grep honest.

### C-18 · Nineteen files still import the old theme
**Today.** These import `colors`, `typography` or `spacing` from `@/theme`: `cl-result`, `custom-ucl-result`, `custom-ucl-simulation`, `match-stats`, `result`, `simulation`, `wc-result` (screens), and `CustomUclViewers`, `FixtureList`, `GlobeReveal`, `InfoBubble`, `MatchLineupPitch`, `MatchStatsParts`, `MomentumGraph`, `PenShootout`, `QualifyingLadder`, `SquadSummary`, `WCGroupModal`, `ui.tsx` (components). Some of those imports are one leftover token in an otherwise kit screen (`result.tsx`, `simulation.tsx`). Others are the whole screen.
**Base.** Not a phase-two goal by itself. Each file drops the old theme when its drawing moves onto a shared kit part.

---

## 6 · Count

18 items, covering about 60 separate drawings. The maintainer named one of them (C-12).
