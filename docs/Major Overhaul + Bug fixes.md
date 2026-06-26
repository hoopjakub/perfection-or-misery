# Major Overhaul — How It Works (As Built)

This document describes the systems that were designed in the original overhaul spec **as they are actually implemented in the app today**. It covers: the Player & Match Statistics system (goals / assists / clean sheets, leaderboards, awards, lifetime career), the penalty-shootout model, the Globe placement reveal, and the bundled bug fixes.

Status: **BUILT & SHIPPED.** Where the final implementation differs from the original prototype proposal, the difference is called out as **Δ (delta)**.

Key files: `src/engine/{stats,run-stats,knockout-match,match,cl-sim,world-cup-sim}.ts`, `src/types/stats.ts`, `app/game/{simulation,result,cl-result,wc-result,stats,career,placement}.tsx`, `src/components/{LineupPitch,SquadSummary,PenShootout,GlobeReveal}.tsx`, `src/lib/globe-geo.ts`, `src/db/queries/{runs,seasons,career}.ts`.

---

## 1. What shipped

Real statistics in every mode (League / All-Time / Era / Chaos / Cursed, Champions League, World Cup):

1. **Per-match goalscorers**, attributed once at sim time and shown live in the "Matchday Results" panel (your match rendered larger), in the knockout reveal, and on the result screens.
2. **Competition-wide leaderboards** (top scorers / assisters / clean sheets), browsable after a run and from history, with a player search.
3. **Per-team goals-for / goals-against** table.
4. **End-of-run awards** — Player of the Season and Best U21 (top-5 each, any position).
5. **Lifetime career** of your drafted players, keyed by player + season + competition, with an awards cabinet.
6. **Globe placement reveal** — a spinning orthographic globe that lands on and lights up the placed country/nation.

Hard rule, enforced: **penalty-shootout kicks never count as goals or assists** in any stat. Only 90'/extra-time goals produce `GoalEvent`s.

**Determinism (the core principle):** scorers and shootouts are attributed/simulated **once** and stored on the match objects. Every later view (live reveal, result screen, saved snapshot, stats screen) reads the same stored data, so nothing re-randomises on re-view.

---

## 2. Data model — `src/types/stats.ts`

The proposed types shipped essentially as designed:

- `GoalEvent` — `{ clubId, scorerId, scorerName, assistId?, assistName?, minute, plus? }`. `plus` is added-time (`90+3`, `120+2`).
- `MatchScorers` — `{ home: GoalEvent[]; away: GoalEvent[] }`, attached to every simulated match.
- `RosterPlayer` — `{ playerId, name, primaryPosition, attack, ovr, birthYear, yearStart, seasonLabel, clubId, clubName }`. The pool unit for attribution.
- `PlayerStatLine` — `{ playerId, name, seasonLabel, position, clubId, clubName, goals, assists, cleanSheets, matchesPlayed?, isPlayerClub? }`.
- `TeamGoalRecord` — `{ clubId, clubName, goalsFor, goalsAgainst, cleanSheets }`. **Δ:** gained `cleanSheets` (per-team) beyond the original spec.
- `CompetitionStats` — `{ players: PlayerStatLine[]; teams: TeamGoalRecord[] }`.
- `AwardCandidate` — adds `age`, `finalPosition`, `score`, and `isPlayerClub?` (drives the white-tint highlight for your players).
- `SeasonAwards` — `{ playerOfTheSeason: AwardCandidate[]; bestU21: AwardCandidate[] }` (full sorted rankings, not sliced to 5 — the UI slices/scrolls).
- `CareerPlayerLine` / `CareerStats` — lifetime lines keyed by player + season + competition, with `matchesPlayed`, `runs`, `potsWins`, `u21Wins`.

---

## 3. Attribution engine — `src/engine/stats.ts`

Scorers are attributed probabilistically from real rosters **after** the scoreline is decided (the engine doesn't simulate individual players).

### 3.1 Scorer weighting (shipped constants)

```
weight(p) = SCORE_WEIGHT[position] * (1 + attack/100)      // attack falls back to ovr
SCORE_WEIGHT: ST/CF 1.0, LW/RW 0.8, LM/RM 0.5, CAM 0.7, CM 0.4, CDM 0.3,
              LB/RB/LWB/RWB ~0.2, CB 0.15, GK 0   (default 0.3)
```
GKs never score. No historical-goals factor (a quiet season doesn't bias scoring).

### 3.2 Assists — `ASSIST_RATE = 0.8`

80% of goals get an assist, drawn from the same club pool (assister ≠ scorer), weighted by `ASSIST_WEIGHT` (creative-leaning: CAM/W high, ST/CF 0.6, defenders low, GK 0.02).

### 3.3 Clean sheets

A club earns a clean sheet when it concedes 0 (90' + ET; shootout irrelevant). Credited to that club's **starting keeper** (`clubGK` map → drafted GK for your club, highest-OVR GK for opponents). Per-team clean sheets are also tallied on `TeamGoalRecord`.

### 3.4 Goal minutes — and the extra-time rule (Δ, important)

Minutes are generated per side, distinct within a match, with occasional added time. **The extra-time model was rebuilt** after a bug where AET matches showed all goals in the first half (e.g. "USA 3–5 Mexico AET" with goals at 4'/20'/26').

A tie that needs extra time **was level after 90'**. So `buildSideMinutes` guarantees both sides score an **equal number of goals in regulation (1–90')** and only the surplus (the deciding margin) falls in **91–120'**. Verified: across thousands of AET sims, the 90' score is always level. A 3–5 AET now reads 3–3 at 90' with the two extra goals in ET.

### 3.5 Awards — `computeAwards`

Computed once at end of run. **Every position eligible; anyone (incl. opponents) can win.**

```
contribution = goals*4 + assists*3 + cleanSheets*3
posFactor    = 1 + ((finalPosition - 1) / (teamsInComp - 1)) * CARRY_WEIGHT   // CARRY_WEIGHT = 0.5
score        = round(contribution * posFactor * 10) / 10
```
A great season in a lower-placed team is worth more (carrying a weak side is rewarded; stats still lead). Best U21 = candidates with `editionStartYear - birthYear <= 21`. Both lists are returned fully ranked with `isPlayerClub` flagged.

---

## 4. Aggregation & sourcing — `src/engine/run-stats.ts`

- `loadLeaguePools(teams, drafted, yearStart)` → `{ poolByClub }` — one DB round-trip via `getRostersForClubs` (`src/db/queries/seasons.ts`); your club uses `draftedPlayers`.
- `attributeFixtureScorers(poolByClub, homeId, awayId, hg, ag, extraTime?)` → `MatchScorers`.
- `summariseScorers(events)` → display string (`"Haaland 23', 67'"`).
- `computeLeagueRunStats` / `computeCLRunStats` / `computeWCRunStats` — aggregate a finished run into `{ stats, awards }`. They consume **stored** `m.scorers` (`m.scorers ?? attribute…`), so results are deterministic.
- `attributeCLResultScorers` / `attributeWCResultScorers` — fill any knockout legs that don't already carry scorers. **Idempotent** (`if (!m.scorers)`), so a live attribution done during the sim is never overwritten — the live reveal and the result screen stay identical.

**Δ:** Every player in the competition is pre-registered in the accumulator (not only contributors), fixing an earlier bug where player counts were unstable (e.g. 343/356) and some players were unsearchable. Counts are now stable (UCL 540, WC 716).

---

## 5. Live simulation integration — `app/game/simulation.tsx`

All three sim components (`LeagueSimulation`, `CLSimulation`, `WCSimulation`) follow the same pattern:

- A `poolByClubRef` is loaded at mount via `loadLeaguePools`.
- `simulateNextMD` and `skipAll` attribute scorers **per match** as they go, storing them on both the display object (`CompMatchResult.scorers` / `Fixture.scorers`) and the history record (`CLLeagueMatch` / `WCGroupMatch` / league matchday).
- The right-hand panel renders `<ScorerLine>` under each match (your match `big`).
- Knockout reveal: `buildTie` (CL) / `buildWCTie` (WC) attribute scorers **before** building the reveal ties; `KnockoutTieFull` renders leg-by-leg scorers (UCL two legs) or single-match scorers (WC/finals), plus the full penalty shootout.

Scorers are attributed once and shared, so the live reveal, the result screen, and the saved run all match.

---

## 6. Penalty shootouts — `src/engine/knockout-match.ts` (Δ, rebuilt)

The original model played all five kicks and reconstructed a display sequence from the totals — which produced impossible shootouts (e.g. a 5–3 that was already won at 4–2, with two pointless kicks shown). This was **rebuilt** as a proper kick-by-kick simulation:

`simulateShootout(r1, r2)` → `{ p1, p2, kicks1: boolean[], kicks2: boolean[] }`:

- **Best of five, alternating**, re-checking after **every single kick** whether the tie is mathematically settled (`p1 > p2 + (5 - k2)` or vice-versa) and **stopping immediately** if so.
- If level after five, **sudden death** — both kick each round until they differ.
- Returns **only the kicks actually taken** (no wasted kicks). Conversion rate nudges with team OVR (`penRate`, capped 0.84).

The make/miss pattern is carried through: `KnockoutResult` / `TwoLegResult` gain `homePenKicks` / `awayPenKicks` (booleans); CL threads them onto `CLKnockoutMatch.aPenKicks/bPenKicks`, WC gets them via the stored `result`. At reveal, `expandPenaltyKicks(namesA, namesB, kicksA, kicksB)` simply zips kicker names onto the stored pattern (names cycle if a long sudden-death run outlasts the fetched takers). `src/components/PenShootout.tsx` renders the sequence (kicker + ✅/❌) on the result-screen knockout modals.

Verified: 0 wasted kicks across 50,000 regulation shootouts; pen scores stop exactly when decided.

---

## 7. Result screens & stats UI

- **`LineupPitch`** + **`SquadSummary`** (shared) — the formation pitch and your XI with per-player goals/assists/clean-sheets and notable rank badges. Rendered on all three result screens, **for live runs and history runs alike** (rehydrated from the saved `squad` + `stats` snapshot). `SquadSummary`'s "Full stats →" carries the `runId` when viewed from history.
- **Stats screen** (`app/game/stats.tsx`) — three scrollable leaderboard tabs (scorers / assisters / clean sheets, all players), team leaders, a "Your Players" block, awards cards (POTS / U21, your players white-tinted), and a cross-category player search. Award cards show "*X eligible candidates of Y players · the rest had no tournament stats*". Loads fresh (compute) or from history (`runId` → `fetchRunById` reads `run.stats`/`run.awards`).
- **Knockout tie modals** — tapping any bracket cell (CL `KOTieModal`, WC `KOMatchModal`) opens a match window: score, AET, penalty result + who advanced, goalscorers per leg, and the full `PenShootout`.
- Group/league matchday click-throughs list goalscorers too (WC group modal, UCL league-phase team modal).

---

## 8. Career & awards cabinet — `src/db/queries/career.ts`, `app/game/career.tsx`

- One `career_stats` row per user: `{ user_id, players jsonb (CareerPlayerLine[]), goals_for, goals_against }`.
- `mergeCareerFromRun` runs when a run is saved (league/CL/WC), accumulating **your drafted players only**, keyed by **playerId + seasonLabel + competition** — so 22/23 Haaland, 23/24 Haaland, and league/UCL/WC Haaland are all separate lines. It sums goals/assists/clean-sheets/matches-played, increments `runs`, and bumps `potsWins`/`u21Wins` when one of your players takes that award.
- **Career screen** (Profile → CAREER): career totals (distinct players fielded, GF, GA), a competition filter (All / LGE / UCL / WC), an Awards Cabinet (🏆×N / 🌟×N), and leaderboard tabs (Goals / Assists / Clean Sheets / Apps).

---

## 9. Persistence — `src/db/queries/runs.ts`

- Runs save `stats jsonb` (aggregated `CompetitionStats`) and `awards jsonb` (`SeasonAwards`) alongside the existing `squad` / result columns. **These columns, plus `career_stats`, must exist in Supabase** (see §12).
- `insertRun` is resilient: on a `PGRST204` (missing column) it drops the offending field and retries, so a run always saves even if an optional column hasn't been added yet.
- Save/exit buttons on all result screens use a `submittingRef` re-entry guard (declared above the early returns, per rules of hooks) so a double-tap can't save a run twice.

---

## 10. Globe placement reveal — `src/components/GlobeReveal.tsx`, `src/lib/globe-geo.ts` (Δ)

A spinning orthographic globe of real country outlines (SVG via `react-native-svg`) that spins, decelerates, and **locks** with the target facing front.

- **Δ — no `d3-geo` dependency.** The original plan used `d3-geo`, but it failed to bundle under Metro. The orthographic projection is **implemented from scratch** in `src/lib/globe-geo.ts` (`makeProjection`, `featurePath`, `featureCentroid`, `graticulePath`) — validated numerically against d3 — so there's no fragile ESM dependency. The world outline is a bundled `assets/geo/countries-110m.geo.json`.
- **Δ — the country lights up only on lock.** During the spin the target looks like any other country; the accent fill lands at the moment of the lock for the reveal "vibe".
- **Use 1 — domestic** (League/All-Time/Era): lands on the placed league-season's country and reveals Country · League · Season.
- **Use 2 — World Cup:** **you can land on ANY of the 48 nations** — a uniform pick over the full field (`replaceIdx = Math.floor(Math.random() * sortedRows.length)`), not just the three weakest. (League-mode "take over a weak club" still picks from the weakest by design.)

---

## 11. Bundled bug fixes (all shipped)

- **Matchday counter off-by-one** — counter shows completed matchdays, matching the `P` column.
- **CL/WC never leak into League/All-Time/Era** — `ucl_*`/`wc_*` league ids excluded from `LeaguePlacement` and `getAvailableLeagues`.
- **League placement filter button** — `leagueFilter` is now reactive (in the effect deps), so toggling All / One-League recomputes the pool.
- **Hooks-order crash** ("Rendered fewer hooks than expected") — the save/exit guards were moved above the early returns in all three result screens.
- **Double-save** — re-entry guards on the save/exit handlers.
- **AET scorers** — the level-at-90 minute model (§3.4).
- **Penalty over-kicking** — the early-termination shootout (§6).
- **EAS build (`npm ci` ERESOLVE)** — a stale lockfile pinned `react-dom@19.2.7` (pulled by `expo-router`'s `@radix-ui` web deps) against the pinned `react@19.1.0`, and `typescript` was duplicated across deps/devDeps. Fixed by deduping `typescript` (→ `~5.9.2`), adding `.npmrc` with `legacy-peer-deps=true` (honoured by EAS), and regenerating `package-lock.json`.

---

## 12. Operational notes

- **Required Supabase columns** (created out-of-band): `runs.stats jsonb`, `runs.awards jsonb`, and the `career_stats` table (`user_id` PK, `players jsonb`, `goals_for int`, `goals_against int`, `updated_at`), with RLS so users read/write only their own career.
- **Quick-sim tester** (About → tap version 8×) runs headless League/UCL/WC with `quickSim:true`, which suppresses DB saves; it exercises the same attribution + shootout code paths.
- **Old saved runs** (pre-stats) degrade gracefully — the UI shows nothing rather than crashing when `stats`/`awards` are absent.

---

## 13. Scrapers

Transfermarkt scrapers live in `scripts/`, sharing `scripts/lib/transfermarkt.ts` (fetch/parse helpers + the rating model). Each writes a `scripts/seed/*.json` consumed by `npm run build-db`.

**Player ratings (improved market-value model):** OVR starts from a market-value log curve, then two corrections fix MV's biases — an **age** term (strip the potential premium on ≤23s, recover the short-career discount on 30+s) and a **playing-time** term (minutes share within the squad, normalised to the most-used player). Real **appearances / minutes / goals / assists** are pulled from each club's season performance page (previously these were all 0).

**Squad depth:** the full first-team squad (~24-26, the whole kader) instead of a thin top-15.

**Curated data preserved:** when a seed already exists, each club's id / colours / short name / logo is kept (matched by normalised name); only players are refreshed. Newly promoted clubs get generated meta.

Built & validated against live TM:
- `scripts/scrape-league.ts` — top-5 leagues (`premier_league`, `la_liga`, `bundesliga`, `serie_a`, `ligue_1`). Run all, or one: `npx tsx scripts/scrape-league.ts la_liga` (`LIMIT=n` for testing).
- `scripts/scrape-ucl.ts` — Champions League, reworked onto the shared lib (`_ucl` ids).
- `scripts/scrape-wc.ts` — World Cup national teams (`_nt` ids). NT pages use a different row layout (no DOB — birth year derived from age) and the WC-2026 participants page 404s, so verein ids are resolved from the **FIFA world ranking** (`fetchNationIndex`) and matched to the existing 48 nations by normalised name + a small alias table (Cabo Verde→Cape Verde, DR Congo→Democratic Republic of the Congo, Côte d'Ivoire→Ivory Coast, Korea Republic→South Korea, United States→USA). Best ~26 by market value; no playing-time term (NT minutes are split across qualifiers/Nations League). A nation that can't be matched keeps its existing squad untouched and is reported. All 48 match today.

Current season only (2025/26 · 2026 for the WC) for now; multi-season per-league back-catalogue (e.g. last 10 years) is a later pass.
