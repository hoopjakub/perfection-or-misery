# 01 · Mode map: what each mode runs through

Part of the [centralisation set](00-README.md). **Status:** findings, as of 24 September 2026. Line numbers were read that day and will drift.

This is the ground the rest of the set stands on. It lists which screens each mode passes through, which components each screen draws with, and what is already shared. The item documents (02 to 05) cite this page when they say "only the league season has it".

---

## 1 · The four mode families

The app has seven mode ids (`CLAUDE.md`), but they run through only four families of screens:

| Family | Mode ids | Live screen | Result screen |
|---|---|---|---|
| **League season** | `league`, `all_time`, `chaos`, `cursed` | `LeagueSeason` (`src/components/season/LeagueSeason.tsx`), mounted by `app/game/simulation.tsx` | `app/game/result.tsx` (954 lines) |
| **Classic Champions League** | `champions_league` | `CLSimulation` inside `app/game/simulation.tsx` (league phase, then `KnockoutPhaseView`) | `app/game/cl-result.tsx` (756 lines) |
| **Full path** (Champions League via qualifying) | `champions_league_custom` | `app/game/custom-ucl-simulation.tsx` (1,345 lines): domestic season, qualifying, league phase, knockouts | `app/game/custom-ucl-result.tsx` (619 lines) |
| **World Cup** | `world_cup` | `WCSimulation` inside `app/game/simulation.tsx` (groups, then the same `KnockoutPhaseView`) | `app/game/wc-result.tsx` (836 lines) |

`runRoute` (`src/lib/nav.ts:23`) picks the result screen per mode. It is the only place that chooses between the four, so it is also where a single result screen would plug in (07 §3, step 6).

## 2 · The route each family takes

```
mode-select ─ difficulty ─ formation-select ─ draft ─(reveal)─ placement ─┬─ pundits ─ simulation ─ result
                                                                          │   (league: ?start=1, auto-plays)
                                                                          │   (CL, WC: waits for a tap)
                                                                          └─ custom-ucl-simulation ─ custom-ucl-result
                                                                              (full path: no pundits screen)
```

- The draft goes to `reveal` only when ratings are hidden (`app/game/draft.tsx:451`).
- `placement` has one component per family: `CLPlacement`, `CustomCLPlacement`, `WCPlacement` and the league one (`app/game/placement.tsx:43-45`). All four use the same `GlobePanel`, which is shared already.
- The full path skips the pundits: `placement.tsx:431` pushes `/game/custom-ucl-simulation` directly, while the others go through `toPundits` (`placement.tsx:205`). See F-22.
- The pundits hand over differently by family. The league season gets `?start=1` and starts playing; the Champions League and World Cup don't (`app/game/pundits.tsx:118`). See L-16.

## 3 · Screen × component matrix: the live screens

✓ = drawn with it · — = not present · *(old)* = a pre-Kit-Drop component

| Piece | League season | Classic CL (league phase) | World Cup (groups) | Full path (domestic / league phase) | Knockouts (CL + WC) | Full path knockouts |
|---|---|---|---|---|---|---|
| `RunHeader` | ✓ | ✓ | ✓ | — (`Road`, 12 uses) | ✓ | — (`Road`) |
| Tabs (`SegmentSwitch`) | table · results · **press** | table · results · **fixtures** | **group · thirds** · results · **groups** | table · results | — | — |
| Speed chips | ✓ | — (locked slow) | — (locked slow) | ✓ | — | — |
| `SkipPlate` | ✓ | ✓ | ✓ | ✓ | its own "Skip to the final" `Plate` (`:1578`) | — |
| Matchday lookback + `BackToLive` | ✓ | ✓ | — (state never set) | ✓ | newest-first scroll | newest-first scroll |
| `StandingFigure` with movement | ✓ | ✓ | — | shows no movement (`delta={null}`) | — | — |
| `ScorelineCard` (your result) | ✓ | ✓ | — (a `LiveMatch` instead) | ✓ | — | — |
| `LiveMatch` (your match played out) | — | — | ✓ | qualifying only | ✓ | ✓ |
| `RoundTeam` (team of the matchday) | ✓ | ✓ | — | ✓ / ✓ | — | — |
| Live press | ✓ | — | — | — | — | — |
| Pundit panel line | — | — | — | — | ✓ | — |
| Abandon (`CloseRun`) | own copy | shared | shared, pause is a no-op | — | shared, pause is a no-op | — |
| Wide layout (`useSizeClass`) | ✓ | ✓ | ✓ | — | — (one column) | — |
| Pause on blur | ✓ | ✓ | ✓ | ✓ | ✓ (the screen's) | ✓ |

## 4 · Screen × component matrix: the result screens

Counted from the JSX in each file (`<Name` occurrences, 24 September 2026).

| Piece | `result.tsx` (league) | `cl-result.tsx` | `custom-ucl-result.tsx` | `wc-result.tsx` |
|---|---|---|---|---|
| `VerdictBlock` + pundits | `PunditsTable` | `PunditsRoundTable` + `PunditsTournament` | same as CL | same as CL |
| Final table | `LeagueTable` | `LeagueTable` | `LeagueTable` | `LeagueTable` ×2 (group, thirds) + `GroupWall` |
| Matchday strip (`SeasonStrip`) | ✓ | — | — | — |
| Position graph | ✓ | — | — | — |
| A matchday's results (`ResultRow`) | ✓ | — | — | — |
| Team of the matchday | ✓ | — | — | — |
| Season highlights | ✓ | — | — | — |
| Your matches (`YourMatches`) | — | ✓ | ✓ | ✓ |
| Knockout list (`KnockoutRoundsView`) | n/a | ✓ | ✓ | ✓ |
| Bracket tree | n/a | — | — | — |
| History summary | — | `CLHistorySummary` *(old)* | — | `WCHistorySummary` *(old)* |
| `StatBox` *(old)* | — | ×3 | defined, unused | ×3 |
| Raw `<Text>` (not `KitText`) | 0 | 26 | 19 | 13 |
| `LineupPitch` (kit) + `SquadSummary` *(old)* | ✓ | ✓ | ✓ | ✓ |
| `RunStats`, `MedicalTable`, `ResultFigures`, `ResultActions` | ✓ | ✓ | ✓ | ✓ |
| Builds its own run stats | ✓ `result.tsx:188` | ✓ `:107` | ✓ `:112` | ✓ `:132` |
| Builds its own awards night | ✓ `:406` | ✓ `:319` | ✓ `:349` | ✓ `:382` |

## 5 · What is already shared (and should stay the base)

These are the pieces phase two keeps and builds on:

| Shared piece | Where | Used by |
|---|---|---|
| Kit primitives: `Pitch`, `RatingSquare`, `EventMark`, `Crest`, `RoundFlag`, `ClubName`, `Loader`, `SafeSection` | `src/components/kit/` | most rebuilt screens |
| `LeagueTable`, `ResultRow`, `ScorelineCard`, `FixtureRow`, `TieRow`, `GroupWall`, `SeasonStrip`, `PositionGraph`, `StandingFigure` | `src/components/season/SeasonParts.tsx` | every live screen, `result.tsx`, `run.tsx` |
| `RunChrome`: `SkipPlate`, `BackToLive`, `CloseRun`, `askAbandon`, `ThumbBar` | `src/components/season/RunChrome.tsx` | classic CL, WC, full path (part) |
| `RoundTeam` | `src/components/season/RoundTeam.tsx` | league season, CL league phase, full path |
| `VerdictBlock`, the pundits tables | `src/components/season/VerdictBlock.tsx` | all four result screens |
| `ResultParts`: `ResultSection`, `YourMatches` | `src/components/season/ResultParts.tsx` | the three cup result screens |
| `KnockoutPhaseView` | `app/game/simulation.tsx:1475` onwards | classic CL and WC knockouts only |
| `LiveMatch`, `periodsForTwoLegTie` | `src/components/LiveMatch.tsx` | every live match |
| `openMatchStats` and the match sheet | `src/lib/matchStats.ts`, `app/game/match-stats.tsx` | about 16 call sites (L-04) |
| `computeRunStats` and its per-mode entry points | `src/engine/run-stats.ts:218-338` | the result screens and `runData.ts` |
| `useRunData` / `liveRunData` | `src/lib/runData.ts:77, 128` | the run hub, club, player and awards pages, **but not the result screens** (L-07) |
