# 06 · Screen walk: every screen, with the items that touch it

Part of the [centralisation set](00-README.md). **Status:** findings, as of 24 September 2026.

The maintainer asked for the research to "go screen by screen", noting everything down and marking anything similar. The items live in 02 to 05, one idea each. This page walks the screens in the order a run meets them and lists the items that touch each one, so a builder working on one screen can see everything that concerns it. Two findings belong to a single screen and appear nowhere else (S-01, S-02).

Legend: **F** feature parity ([02](02-FEATURE-PARITY.md)) · **C** drawn differently ([03](03-DRAWN-DIFFERENTLY.md)) · **L** computed differently ([04](04-COMPUTED-DIFFERENTLY.md)) · **A** marks and colours ([05](05-MARKS-AND-COLOURS.md)) · **S** this page.

---

## 1 · Setup (stages 1 to 5)

| Screen | Reached by | What's different by mode | Items |
|---|---|---|---|
| `mode-select` | all | The Champions League wears its real competition mark and the World Cup a drawn one. League flags use their own code fallback | A-11, A-13 |
| `difficulty`, `difficulty-custom` | all except chaos and cursed | nothing | S-01 |
| `formation-select` | all | nothing | S-01 |
| `draft` | all | World Cup reel items have no colour; the club card's flag is looked up by name; the cursed mode labels the pick; surnames lose their particles | F-23, A-01 (#14), A-08, L-11, L-15, S-01 |
| `reveal` | hidden-ratings runs | upper-cased surnames | L-11, S-01 |
| `placement` | all, one component per family | four components share `GlobePanel`; the World Cup reveal looks the nation's flag up by name; the full path goes straight to the season | F-22, A-01 (#15), A-08, S-01 |

### S-01 · The "skipped stage" rule is copied into six screens · *Fragile*
**Today.** `skipped={mode === 'chaos' || mode === 'cursed' ? [2] : []}` is written into the `RunHeader` of `draft.tsx:644`, `reveal.tsx:53`, `placement.tsx:62`, `pundits.tsx:124` and `LeagueSeason.tsx:502`. `formation-select.tsx:113, :128` writes its own version (`fixedMode ? [2] : []`). A new mode without a difficulty step would need all six edited. The live cup screens pass nothing, which happens to be right today because chaos and cursed are league modes.
**Base.** `RunHeader` reads the mode and works out the skipped stages itself.

## 2 · Stage 6 before the first ball: the pundits

| Screen | Reached by | What's different by mode | Items |
|---|---|---|---|
| `pundits` | league, classic CL, World Cup (not the full path) | the field is mapped by hand; the table draws nations as initials; the hand-over starts a league but not a cup | F-22, A-02, C-01 (#5), L-13, L-16, S-02 |

### S-02 · The pundits' header says "Season" in a cup · *Divergent*
**Today.** Stage 6 is called the Tournament in a cup (P8-78). The live cup screens pass `tournament` to `RunHeader` (`simulation.tsx:624, :1262, :1505`), and the pundits screen doesn't (`pundits.tsx:124`). So in the classic Champions League and the World Cup the stage strip says "6 SEASON" on the pundits screen and "6 TOURNAMENT" one tap later.
**Base.** Goes away with S-01's fix: `RunHeader` reads the mode.

## 3 · Stage 6: the live screens

### 3.1 · League season (`LeagueSeason`)
The most complete of the four. It is the reference for press, speed and the round-by-round lookback.

| Area | Items |
|---|---|
| Tabs: table · results · press | C-12 |
| Press and its stories | F-01, F-02 |
| Your match as a finished card, with no mark | F-09, A-05 |
| Team of the matchday under the results | F-03 (the reference) |
| Speed chips, skip, back to live | F-05, C-13, L-02 |
| No fixtures list | F-08 |
| Its own abandon confirm | L-12 |
| Its own standings order | L-01 |
| Result rows draw crests always | A-03 |

### 3.2 · Classic Champions League, league phase (`CLSimulation`)
| Area | Items |
|---|---|
| Tabs: table · results · fixtures | C-12, F-08 |
| Speed locked to slow | F-05, L-02 |
| No press | F-01 |
| Your match as a finished card | F-09, A-05 |
| Fixtures with a flag or nothing | A-01 (#7) |
| Match sheet request built by hand | L-04 |
| Standings order ×3 in this file | L-01 |

### 3.3 · World Cup groups (`WCSimulation`)
| Area | Items |
|---|---|
| Tabs: group · thirds · results · groups | C-12 |
| Speed locked to slow | F-05 |
| No team of the matchday | F-03 |
| No matchday lookback (dead state) | F-06, C-17 |
| No standing figure | F-07 |
| Your match played live | F-09 |
| Result rows draw nations as crests | A-03 |
| Group sheet through `WCGroupModal` | C-02, C-16 |
| Abandon doesn't pause | L-12 |
| No press, no panel line on group matches | F-01, F-12 |

### 3.4 · Full path (`custom-ucl-simulation`)
The biggest single screen (1,345 lines) and the one that has drifted furthest.

| Area | Items |
|---|---|
| `Road` header instead of `RunHeader` | C-10 |
| Tabs: table · results (no fixtures, no press) | C-12, F-08, F-01 |
| Speed chips with their own, slower values | F-05, L-02 |
| No standing movement | F-07 |
| No abandon | F-10 |
| No wide layout | F-11 |
| Match sheet request missing rotation, absences and context | L-05 |
| Own tie view model | C-04, L-06 |
| Own copy of "newest round first" | C-07 |
| Own `ordinalOf` (correct) | L-10 |
| No pundits, so no panel line | F-22, F-12 |
| Domestic tables drawn with the old `LeagueTableView` | C-01 (#2), C-02 |
| Qualifying through `QualifyingLadder` | C-06 |

### 3.5 · Knockouts (`KnockoutPhaseView`, and the full path's own)
| Area | Items |
|---|---|
| Two implementations | C-06, C-07 |
| Four tie view models feeding one row | C-04, L-06 |
| No team of the round | F-04 |
| Bracket shown only before the first round | F-17 |
| Panel line (classic and World Cup only) | F-12 |
| "Skip to the final" drawn separately from `SkipPlate` | C-13 |
| One column on wide screens | F-11 |
| Abandon doesn't pause | L-12 |

## 4 · After the whistle

### 4.1 · Awards night (`app/game/awards.tsx`)
Computes the run stats through `liveRunData`, builds its own awards night, stashes the stats for the verdict. Items: L-07, L-08, F-19.

### 4.2 · The four result screens
| Area | `result` | `cl-result` | `custom-ucl-result` | `wc-result` | Items |
|---|---|---|---|---|---|
| Round-by-round lookup | ✓ | — | — | — | F-13 |
| Team of the matchday | ✓ | — | — | — | F-14 |
| Position graph | ✓ | — | — | — | F-15 |
| Highlights | ✓ | — | — | — | F-16 |
| Bracket | n/a | list only | list only | list only | F-17 |
| Pundits' bracket | n/a | tie list | tie list | tie list | F-18 |
| Pundits' tables without marks | ✓ | ✓ | ✓ | ✓ | A-04 |
| Manager award | ✓ | — | — | — | F-19 |
| Domestic season counted | n/a | n/a | — | n/a | F-20 |
| History view | same screen | old summary | same screen | old summary | F-21 |
| Wrong ordinals | — | ✓ | ✓ | (groups only, never wrong) | L-10 |
| Raw `<Text>` | 0 | 26 | 19 | 13 | C-14 |
| Dead local components | — | 3 | 4 | 1 | C-17 |
| Own run stats and awards night | ✓ | ✓ | ✓ | ✓ | L-07, L-08 |
| `PenShootout` (old) | — | ✓ | via `CustomUclViewers` | ✓ | C-05 |
| Squad summary (old) | ✓ | ✓ | ✓ | ✓ | C-08 |

### 4.3 · Run pages
| Screen | Items |
|---|---|
| `run` (run hub) | C-01 (#9), C-04 (`tieVM`), C-06, A-02, A-03, L-01 (best thirds) |
| `club` | A-06, C-03 (#8) |
| `player` | L-08 (builds its own awards night) |
| `story` | F-02, A-02, C-01 (#10, #11) |
| `awards` (route) | L-07, L-08 |

### 4.4 · The match sheet and the deep match
| Screen | Items |
|---|---|
| `match-stats` | C-15 (83 raw `<Text>`), A-07 (13 `withFlag` calls), A-01 (#12, #13), C-05 (its own shootout), C-03 (#12), L-04 (the requests that open it) |
| `deep-match` | A-01 (#11), A-08, C-08 (`MatchLineupPitch`) |

## 5 · Screens with nothing to report

`settings`, `achievements`, `career`, `rules`, `sheet`, `confirm`, `about`, `guide` and the legal pages don't vary by mode in any way this research could find. `career` groups runs by competition. Whether chaos, cursed and all-time runs land under "League" wasn't checked, so it's listed under what wasn't done in the [README](00-README.md#how-this-was-made).
