# 04 · Computed differently: the same answer, worked out more than once

Part of the [centralisation set](00-README.md). **Status:** findings, as of 24 September 2026, with a proposal line on each item.

These items are one calculation written in more than one place. Each has a class, because they don't all carry the same risk:

| Class | Meaning | Items |
|---|---|---|
| **Wrong** | at least one copy gives a wrong answer today | L-10, L-11 |
| **Divergent** | the copies disagree today, visibly or in data | L-03, L-05, L-12, L-16 |
| **Fragile** | the copies agree today; the next change to one of them breaks the agreement | L-01, L-02, L-04, L-06, L-07, L-08, L-13, L-14, L-15 |
| **Unverified** | might disagree; needs a probe script before anyone calls it a bug | L-09 |

The rule behind phase two, from the project's own conventions: "a pattern used in 2+ places becomes a primitive" (`CLAUDE.md`, golden rule 3). Every item below breaks it.

---

## 1 · Tables and order

### L-01 · The standings order is written sixteen times · *Fragile*
**Today.** Thirteen copies of the same comparator (points, then goal difference, then goals scored):

| Layer | Copies |
|---|---|
| Screens | `app/game/simulation.tsx:146, :1109, :1186`; `app/game/custom-ucl-simulation.tsx:167`; `src/components/season/LeagueSeason.tsx:78`; `app/game/wc-result.tsx:73`; `src/components/WCGroupModal.tsx:16` |
| Engine | `src/engine/simulation.ts:111`; `src/engine/cl-league-sim.ts:124`; `src/engine/world-cup-sim.ts:255`; `src/engine/quick-sim.ts:48, :231, :415` |

On top of those, three written inline: `app/game/run.tsx:182` (best thirds), `src/lib/runData.ts:59` (the World Cup's saved table) and `src/engine/match-context.ts:162`.

None of the thirteen has a last tiebreak. Two clubs level on all three keep whatever order the input array had (`Array.prototype.sort` is stable), and the input arrays differ from screen to screen, so the same final table can list two level clubs in different orders in different places.
**Base.** One `compareStandings(a, b)` in the engine, with a final deterministic tiebreak, used by every copy. Whether the real competitions' extra rules come in (head-to-head, wins, away goals) is open decision D4. Either way it's one decision, made in one place.

### L-02 · Three speed tables, one of them different · *Fragile*
**Today.**
| Where | slow | normal | fast |
|---|---|---|---|
| `app/game/simulation.tsx:107` | 2000 | 400 | 100 |
| `src/components/season/LeagueSeason.tsx:53` | 2000 | 400 | 100 |
| `app/game/custom-ucl-simulation.tsx:154` | **2200** | **900** | **250** |

"Normal" in the full path is more than twice as slow as "normal" in a league. The beat after your result is also written twice: `BEAT_SHARE = 0.45` (`LeagueSeason.tsx:55`) and an inline `* 0.45` (`simulation.tsx:281`).
**Base.** One `SPEED_MS` and one beat share, next to the speed setting (F-05).

### L-03 · The match context breaks ties by name; the live table doesn't · *Divergent*
**Today.** `match-context.ts:158-162` sorts with a fourth, alphabetical tiebreak. Its comment says it's the "same ordering the live standings use… so the snapshot can't disagree with the table the player watched all season". The live standings have no fourth tiebreak (L-01), so with two clubs fully level the snapshot can disagree after all.
**Base.** Goes away with L-01.

## 2 · Matches, ties and the match sheet

### L-04 · About sixteen hand-built match-sheet requests · *Fragile*
**Today.** `openMatchStats` is called from 16 places: `result.tsx:128`, `cl-result.tsx:191, :212`, `custom-ucl-result.tsx:191, :195`, `wc-result.tsx:242, :257`, `simulation.tsx:566, :603, :1207, :1243`, `LeagueSeason.tsx:391`, `custom-ucl-simulation.tsx:192`, `CustomUclViewers.tsx:213`, `match-stats.tsx:202` and `src/lib/runNav.ts:59`. Each copies the match's fields into the request by hand. There are shared helpers for part of it (`koLegDetailRequest`, `toContextMatches`, `appendKnockoutRounds`), but they aren't used everywhere.
**Base.** One `matchRequest(match, stage)` from the stage model's match type. A call site only adds the accent.

### L-05 · The full path's live match sheet leaves out half the request · *Divergent*
**Today.** The classic league phase (`simulation.tsx:566-577`) and the league season (`LeagueSeason.tsx:391-405`) pass rotation, absences, stand-ins, your formation, the matchday and the whole schedule as context. The full path's `openMdDetail` (`custom-ucl-simulation.tsx:192-199`), used for both its domestic season and its league phase, passes none of those. Its sheet can't show who was rested or out, or the "next match" and form context the others show.
**Probe first.** Check whether the full path rotates at all. If it does, the live sheet is regenerating a lineup the match wasn't played with.
**Base.** L-04's `matchRequest`, which makes leaving fields out impossible.

### L-06 · Four tie view-model builders · *Fragile*
**Today.** `tieToVM` (`simulation.tsx:1591`), `clTieToVM` (`custom-ucl-simulation.tsx:111`), `tieVM` (`run.tsx:236`), and `koTieToVM` (`KnockoutRoundsView.tsx:103`) with its three adapters (`:134, :164, :187`). The drawing side is C-04. The computing side is that aggregate, away goals, extra time, penalties and "who went through" are each worked out four times. P8-156 (crests lost) and P8-159 (a second copy of the two-leg periods that skipped extra time) were both copies drifting apart.
**Base.** One tie model in the engine with its derived fields computed once (07 §2.1).

## 3 · Run stats and the awards

### L-07 · Run stats are computed in three ways · *Fragile*
**Today.**
1. The awards night route computes them through `liveRunData()` (`app/game/awards.tsx:73`), which caches the result on the store as `runData` (`src/lib/runData.ts:77-100`), and stashes a copy for the verdict (`stashRunStats`, `src/lib/awardsNight.ts:20`).
2. Each result screen reads the stash once (`takeRunStats`, which clears it) and otherwise computes again itself: `result.tsx:188`, `cl-result.tsx:107`, `custom-ucl-result.tsx:112`, `wc-result.tsx:132`.
3. The run hub, club and player pages read `useRunData` (`runData.ts:128`), which reuses the cached `runData`.

So a second visit to the verdict regenerates every match sheet, even though the same numbers sit in `runData`, and the per-mode argument lists are written twice (`runData.ts:83-86` and the four result screens).
**Base.** `runData` is the only cache. The result screens read it like every other run page. The stash goes.

### L-08 · The awards night is built six times · *Fragile*
**Today.** `buildAwardsNight` is called in `app/game/awards.tsx:78`, `app/game/player.tsx:58`, `result.tsx:406`, `cl-result.tsx:319`, `custom-ucl-result.tsx:349` and `wc-result.tsx:382`, each assembling its own input.
**Base.** Built once per run, with the run data (L-07), and read from there.

### L-09 · Two computations of the team of the matchday · *Unverified*
**Today.** Live, `RoundTeam` computes `teamOfTheRound(fixtures, poolByClub, ctx)` from the round's fixtures (`src/components/season/RoundTeam.tsx:42`). The league result screen reads `night.teamsOfTheRound` from the awards night (`result.tsx:411`), which comes from the run stats' round lines. Different inputs go in, so the same matchday could show two different teams.
**Probe.** Run a seeded league season, compute both for every matchday, and compare. If they differ, the live one moves onto the run-stats path.

## 4 · Small helpers copied everywhere

### L-10 · Twelve `ordinal` helpers, four of them wrong · *Wrong*
**Today.** Eight copies are correct (`club.tsx:27`, `custom-ucl-simulation.tsx:99`, `player.tsx:35`, `pundits.tsx:31`, `SeasonParts.tsx:185, :447`, `VerdictBlock.tsx:101`, `src/engine/press.ts:294`). Four only know 1, 2 and 3:
- `cl-result.tsx:514`, `custom-ucl-result.tsx:504`, `wc-result.tsx:530` return just the suffix, `'th'` for anything above 3;
- `CustomUclViewers.tsx:68` does the same inline.

**What the player sees.** Finish 21st, 22nd, 23rd, 31st, 32nd or 33rd in the 36-club league phase and the classic result screen says "21th in the league phase" (`cl-result.tsx:295, :301`). The full path's does the same (`custom-ucl-result.tsx:325`).
**Base.** One `ordinal` in `src/lib/`. This is the cheapest real bug in the set.

### L-11 · Four `surname` helpers, all wrong the same way · *Wrong*
**Today.** `draft.tsx:49`, `reveal.tsx:49`, `PitchViews.tsx:188` and `AwardsParts.tsx:86` take the last word of the name, so "Virgil van Dijk" shows as "Dijk" and "Alexis Mac Allister" as "Allister". The copies agree with each other; they're all wrong.
**Base.** One `surname()` that keeps name particles (van, de, da, dos, Mac, Mc, bin, …). C-09 is the drawing side.

### L-12 · Two abandon confirms with different words · *Divergent*
**Today.** `LeagueSeason` has its own `askAbandon` (`LeagueSeason.tsx:318`), a copy of the shared one (`src/components/season/RunChrome.tsx:76`) except for the sentence: "The season so far is lost…" against "Everything played so far is lost…". The full path has none (F-10).
The World Cup groups and every knockout call the shared one with a pause that does nothing (`askAbandon(() => {})`, `simulation.tsx:593, :1235, :1264`). The sim keeps running under the confirm unless leaving the screen for the confirm route pauses it through `usePauseOnBlur`, which is worth checking rather than assuming.
**Base.** One `askAbandon`, called by the shared header with the stage's real pause.

### L-13 · The pundits' field is mapped three times · *Fragile*
**Today.** The same `{ clubId, clubName, ovr, isPlayer }` mapping builds the pundits' field on the pundits screen (`pundits.tsx:43-44`) and again, separately, on the live screen for the Champions League and the World Cup (`simulation.tsx:177, :733`). The panel line above a live tie is only right while all three stay identical, because the panel is rebuilt from the seed.
**Base.** The panel is built once from the stored seed by one function that takes the stage, not a hand-mapped team list.

### L-14 · Draws and fixture orders use an unseeded, biased shuffle · *Fragile*
**Today.** Seven shuffles use `sort(() => Math.random() - 0.5)`: `src/engine/cl-qualifying.ts:140`, `cl-sim.ts:464`, `fixtures.ts:31`, `quick-sim.ts:436`, `world-cup-sim.ts:159, :279, :367`. That idiom isn't a fair shuffle (the result depends on the sort algorithm), and it isn't seeded, while everything downstream of a match is (mulberry32, `deriveSeed`). A draw can't be reproduced or tested the way a match sheet can.
**Base.** One seeded Fisher–Yates `shuffle(arr, rng)` in the engine. The run keeps a draw seed next to the prediction seed.

## 5 · Colours and setup

### L-15 · Club colours read two ways · *Fragile*
**Today.** The match sheet and the team-colour context read colours through `getClubColours` (`src/db/queries/seasons.ts`), which swaps the scrapers' slate placeholder for the club's real colours. The draft reads `primary_color` straight off the club-season row (`draft.tsx:197, :538`). The database fix in P8-157 made both paths agree for every club with real colours anywhere. For the five clubs with none (A-09) both paths give the placeholder, so they agree only because the fallback has nothing to fall back to.
**Base.** Every colour read goes through `getClubColours`.

### L-16 · The pundits hand over to the season two ways · *Divergent*
**Today.** The pundits screen replaces itself with `/game/simulation?start=1` for a league and `/game/simulation` for the Champions League and the World Cup (`pundits.tsx:118`). `LeagueSeason` reads `start` (`LeagueSeason.tsx:109`) and starts playing on arrival; the cups wait for a tap. Nothing records whether the difference is on purpose.
**Base.** One rule for every stage: probably "wait for the first tap", since the cups start with a draw to look at. That's open decision D5.

---

## 6 · Count

16 items. Two are wrong today (L-10, L-11) and cheap to fix. Two need a probe script before anyone changes anything (L-09, and L-05's rotation question).
