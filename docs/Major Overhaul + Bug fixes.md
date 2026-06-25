# Major Overhaul + Bug Fixes — Design & Implementation Doc

Covers, in build order: (A) three bug fixes, (B) the Player & Match Statistics system (goals/assists/clean-sheets, leaderboards, awards, lifetime career), and (C) the **Globe Placement Indicator** + "replace any nation" change — done **last**.

Status: **DRAFT — decisions captured; ready to implement.**
Owner: gameplay/sim. Related areas: `src/engine`, `app/game/simulation.tsx`, `app/game/placement.tsx`, result screens, `src/db`, `src/store/gameStore.ts`.

---

## 1. Goal

Add real, looked-at-able statistics to every mode (League, All-Time, Era, Chaos, Cursed, Champions League, World Cup):

1. **Per-match goalscorers** shown live during simulation — in the right-hand "Matchday Results" panel, each match lists who scored (the player's own match rendered larger / easier to find).
2. **Competition-wide player leaderboards**, viewable after the run and from history:
   - Top scorers — every player who scored + goal count.
   - Top assisters — every player with assists + count.
   - Clean sheets — every keeper (and/or defender) + count.
3. **Per-team goals table** — goals scored & conceded per club, shown alongside / under the player leaderboards.

Purpose: immersion. "Wow, who scored how much" — a satisfying thing to browse.

Hard rule: **penalty shootout kicks do NOT count as goals** in any stat.

---

## 2. Current state (what exists vs. what's missing)

| Piece                            | Today                                                                                                                                         | Needed                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Match engine (`simulateMatch`) | returns `{ homeGoals, awayGoals, outcome, isUpset }` only                                                                                   | must also emit*goal events* (scorer, assister)                              |
| Opponent rosters in sim          | NOT loaded — opponents are an OVR number (`SimTeam`)                                                                                       | load each club's players once per competition                                 |
| Player's own XI                  | `draftedPlayers` in store (real picked players)                                                                                             | use directly as the scorer pool for the player's club                         |
| Player attributes available      | `player_seasons.{ovr,attack,defense,physical,pace,technical,goals,assists,appearances}`, `players.{primary_position,secondary_positions}` | enough to weight scorers and detect GKs                                       |
| Roster query                     | `getTopKickers(clubId)` returns top names by attack+technical                                                                               | generalise to return id+name+position+attack+goals for ALL clubs in one query |
| Result storage                   | `SeasonResult.matchdayHistory` kept in-store (not in DB); WC/CL store full result objects                                                   | add scorer data to these; decide DB persistence (Open Q)                      |
| Stats UI                         | none                                                                                                                                          | live per-match scorers + post-run leaderboards                                |

Important constraint: **`StyleSheet`/engine are deterministic-per-run only by accident** — `simulateMatch` uses `Math.random()` with no seed. Stats are computed as matches are simulated and stored; they are not re-derivable later, so whatever we show must be captured at sim time.

---

## 3. Data model (proposed)

New engine-level types (`src/types/simulation.ts` or a new `src/types/stats.ts`):

```ts
// One scoring event within a match. Penalty SHOOTOUT kicks never produce these.
export type GoalEvent = {
  clubId:     string
  scorerId:   string
  scorerName: string
  assistId?:  string        // omitted when no assist generated
  assistName?: string
  // minute is optional/cosmetic — see Open Q about whether we want fake minutes
  minute?:    number
}

// Attached to every simulated match (league fixture, group game, KO leg).
export type MatchScorers = {
  home: GoalEvent[]
  away: GoalEvent[]
}

// Aggregated across a whole competition (one run).
export type PlayerStatLine = {
  playerId:   string
  name:       string
  seasonLabel: string     // edition the player is from, e.g. "22/23" — part of identity
  clubId:     string
  clubName:   string
  goals:      number
  assists:    number
  cleanSheets: number
  matchesPlayed?: number  // ONLY populated for your players ("Your Players" section);
                          // per-run leaderboards (all players) do NOT show MP
}

export type TeamGoalRecord = {
  clubId:   string
  clubName: string
  goalsFor: number
  goalsAgainst: number
}

export type CompetitionStats = {
  players: PlayerStatLine[]      // sorted; full list (scroll)
  teams:   TeamGoalRecord[]
}

// Lifetime career — YOUR drafted players only, accumulated across ALL runs.
// Identity key = playerId + seasonLabel + competition, so 22/23 Haaland and
// 23/24 Haaland are distinct, AND league-Haaland / CL-Haaland / WC-Haaland are
// distinct too (each competition tracked separately).
export type Competition = 'league' | 'champions_league' | 'world_cup' | string  // extensible (euros, fa_cup, copa…)
export type CareerPlayerLine = {
  playerId:    string
  name:        string
  seasonLabel: string
  competition: Competition
  goals:       number
  assists:     number
  cleanSheets: number
  matchesPlayed: number   // cumulative across runs — reveals your under-used players
  runs:        number     // how many runs you've used this player+season+competition
  potsWins:    number     // awards cabinet — Player of the Season wins across runs
  u21Wins:     number     // …and Best U21 wins
}
export type CareerStats = {
  players:      CareerPlayerLine[]
  goalsFor:     number    // your teams' cumulative GF across runs
  goalsAgainst: number    // …and GA
}

// End-of-run awards (per competition). Any position eligible; anyone can win.
export type AwardCandidate = {
  playerId:    string
  name:        string
  seasonLabel: string
  clubId:      string
  clubName:    string
  position:    string      // shows that any position can win
  age:         number      // for U21 eligibility / display
  goals:       number
  assists:     number
  cleanSheets: number
  finalPosition: number    // their club's final standing (drives the carry modifier)
  score:       number      // computed award score
}
export type SeasonAwards = {
  playerOfTheSeason: AwardCandidate[]  // top 5, [0] = winner
  bestU21:           AwardCandidate[]  // top 5 aged <= 21, [0] = winner
}
```

- `MatchResult` gains an optional `scorers?: MatchScorers` (optional so non-stats paths still compile).
- `Fixture` / the per-match records used in `matchdayHistory` carry `scorers`.
- The mode result objects (`SeasonResult`, `CLSeasonResult`, `WCSeasonResult`) gain `stats?: CompetitionStats` and per-match scorers in their stored history.

---

## 4. Attribution algorithm

Because the engine does not simulate individual players, scorers are **attributed probabilistically from real rosters** after the score is decided. This is plausible and uses real data (historical goals/attack/position), but it is not a literal simulation. (See Open Q1.)

### 4.1 Scorer pool per club

- **Player's own club:** use `draftedPlayers` (their actual XI). This guarantees the user's stars get the goals.
- **All other clubs:** use the DB roster (new query, §6). Each candidate carries `primary_position`, `attack`, historical `goals`.

### 4.2 Scorer weighting — DECIDED

For each goal, pick a scorer by weighted random. **No historical-goals factor** (per decision) — weight by position and current attack/ovr only:

```
weight(p) = base(position) * (1 + attack/100)     // attack falls back to ovr if null
base: ST 1.0, W 0.8, CAM 0.7, CM/CDM 0.4, FB 0.2, CB 0.15, GK 0.0
```

So forwards score most, defenders occasionally, keepers never (outfield only). Tunable constants. (Deliberately ignores `player_seasons.goals` so a quiet season doesn't bias scoring.)

### 4.3 Assists — DECIDED

Synthetic. **80% of goals get an assist.** Assister ≠ scorer, drawn from the same club pool, weighted toward CAM/W/CM (creative weighting).

### 4.4 Clean sheets — DECIDED

- A club earns a clean sheet for a match when it concedes 0 (normal + extra time; shootout irrelevant).
- Credit the club's **starting goalkeeper only** (own club: the drafted GK; opponent: highest-OVR GK in roster).

### 4.5 Penalties

- In-match: the engine has **no in-match penalty mechanic**, so all goals from normal/extra time count normally.
- Knockout shootouts (CL/WC, and any KO ties): the shootout tiebreak kicks are **excluded** from goals entirely — they already don't add to `goalsFor`; we simply never create `GoalEvent`s for them. The `aGoals/bGoals` shown in brackets are the 90'/ET score, which is what counts.

### 4.6 Goal minutes — DECIDED (light logic)

Each `GoalEvent` gets a plausible minute:

- Spread across 1–90; **≥1 minute between two goals** in the same match (sort + dedupe).
- **Added time:** occasionally `90+n` (e.g. `90+3'`) — flagged as a dramatic last-minute goal in the UI ("OMG a last-minute winner").
- **Extra time (KO only):** when a tie went to ET, those goals sit in `91–120` (or `120+n`).
- Minutes are cosmetic; they never affect outcomes.

### 4.7 Matches played — DECIDED (your players only)

- MP is tracked **only for your drafted players** (you field the same XI every game, so MP = matchdays your club played: 38 for a full league; fewer if a cup run ends early).
- **Per-run leaderboards (all players) do NOT show MP.** Opponent MP is never computed or shown.
- MP appears in two places only:
  1. A **"Your Players"** section in the run — lists every one of your drafted players with goals/assists/clean-sheets and their MP (e.g. 38).
  2. The **career leaderboard** — cumulative MP across runs, so you can spot your most under-used players.

### 4.8 Determinism

Attribution runs inline as each match is simulated (same place goals are generated), so it's captured once and stored. No re-randomisation on re-view.

---

## 4b. Awards — Player of the Season & Best U21

Computed once at end of run from the competition's full player stats + each club's final standing. **Every position is eligible and anyone can win.** Each award shows the **top 5 candidates** (winner = highest score).

### Eligibility

- **Player of the Season:** all players in the competition.
- **Best U21:** players aged ≤ 21 in the season edition, i.e. `editionStartYear - birthYear <= 21`. Requires `birthYear` (see data note).
- Pool includes opponents, not just your XI — anyone can win.

### Score formula (proposed, tunable)

```
contribution = goals*GOAL_PTS + assists*ASSIST_PTS + cleanSheets*CS_PTS
   GOAL_PTS=4, ASSIST_PTS=3, CS_PTS=3   // GK/def stay competitive via clean sheets
// Carry modifier: a great season in a LOWER-placed team is worth more.
posFactor = 1 + ((finalPosition - 1) / (teamsInLeague - 1)) * CARRY_WEIGHT
score = contribution * posFactor
// DECIDED: CARRY_WEIGHT = 0.5 (moderate — stats lead, carry tilts). Tunable.
```

- `finalPosition` 1 (champion) → no boost; last place → max boost (`1 + CARRY_WEIGHT`).
- So a 30-goal striker in a relegated side can beat a 20-goal striker in the champions — "carrying a weak team" is rewarded, while raw output still matters. `CARRY_WEIGHT` strength is an Open Q (how reliably should low teams win?).
- **Naturally favours league formats:** WC/CL knock you out sooner → fewer matches → smaller `contribution`, so the award is most meaningful in leagues (by design, no special-casing). For CL/WC, `finalPosition`/`teamsInLeague` use the mode's standing proxy (CL league-phase position; WC pseudo-position out of the field).

### Data note

`DraftedPlayer` has `season` but **no `birthYear`** — add `birthYear` to it (thread from draft) and include `birth_year` in the opponent roster query (§6), plus the numeric edition year, so age can be computed for U21.

### UI

- Featured on the **Stats screen** (and a small teaser — "POTS: {winner}" — on the result page).
- Two cards: Player of the Season and Best U21, each listing the **top 5** with name, `seasonLabel`, club crest, position, key stats, and score; winner highlighted with the mode accent.

---

## 5. Engine integration

Option A (preferred): extend `simulateMatch` to accept optional roster pools and return `scorers`:

```ts
simulateMatch(home, away, { homePool?, awayPool? }) => MatchResult & { scorers? }
```

- When pools are supplied, generate `GoalEvent[]` sized to `homeGoals`/`awayGoals`.
- When omitted (e.g. quick internal calls), behaves exactly as today.

Option B: a separate `attributeScorers(result, homePool, awayPool)` helper called by the sim components after `simulateMatch`. Keeps the engine pure. (Leaning B for separation; Open Q.)

Both `simulateNextMD` and `skipAll` (in all three sim components) must attribute + accumulate into a running `CompetitionStats` and store per-match `scorers` for the matchday history. Knockout match builders (`knockout-match.ts` consumers in `cl-sim`/`world-cup-sim`) attribute scorers for the 90'/ET goals only.

---

## 6. Roster sourcing

New query, e.g. `getRostersForClubs(clubIds: string[])` → `Map<clubId, RosterPlayer[]>` where
`RosterPlayer = { playerId, name, primaryPosition, attack, goals, ovr }`, one round-trip:

```sql
SELECT cs.club_id, p.id, p.name, p.primary_position, ps.attack, ps.goals, ps.ovr
FROM player_seasons ps
JOIN players p ON p.id = ps.player_id
JOIN club_seasons cs ON cs.id = ps.club_season_id
WHERE cs.club_id IN (?, ?, …)
```

Called once at sim start (we already know the field: league season teams / CL field / WC field). The player's own club uses `draftedPlayers` instead.

Edge case: a club may have a thin/empty roster (esp. national teams or sparse seeds). Fallback: synthesise generic "Player N" names or use `getTopKickers`-style names. (Open Q about acceptable fallback.)

---

## 7. UI

### 7.1 Live simulation — per-match scorers (right panel) — DECIDED

- **Every match** lists its scorers (surnames + minute), under the score row.
- **Your match is rendered bigger** (larger text/row, accent) so the eye is drawn to it first; opponent matches use a slightly smaller variant.
- e.g. your row: `Haaland 23', 67'  ·  Saka 81'`; opponent row: smaller `Wirtz 12'`.

### 7.2 Post-run stats (result screens + history) — DECIDED: BOTH

A compact teaser on each result page **and** a dedicated full **Stats** screen.

Layout (decided):

- **Players: three tabs** — Top Scorers · Top Assists · Clean Sheets (ALL players in the competition). One full-width readable list at a time. **No MP column here.**
- **Teams: two-in-a-row underneath** — Goals Scored (for) · Goals Conceded (against) per club.
- **"Your Players"** section — every drafted player you fielded, with goals/assists/clean-sheets + **MP** (the only in-run place MP shows).
- Each list: rank, name + `seasonLabel`, club crest (`TeamLabel`), the stat; full + scrollable.

Placement: a compact teaser block on existing result pages (`result.tsx`, `cl-result.tsx`, `wc-result.tsx`) + a dedicated Stats screen reachable from them. Reachable from history (DB persistence below).

### 7.3 Career screen (lifetime) — DECIDED

A separate Career view (under the Runs/profile area) showing **your drafted players across every run**, keyed by player + season edition + **competition**:

- Same three tabs (Scorers / Assists / Clean Sheets) **plus matches played** + `runs` count, so 22/23 Haaland and 23/24 Haaland are separate lines — and a league Haaland is separate from a CL or WC Haaland (each competition tracked apart). You can see who's truly your best and who barely featured.
- Competition is extensible: `league`, `champions_league`, `world_cup`, and future ones (euros, fa_cup, copa_america…).
- Career team totals: cumulative goals-for / goals-against.
- Career accumulates **only your drafted players**; opponent scorers are per-run flavour only.

Theming: reuse the per-mode palette (`useModeTheme` / `MODE_THEMES`) and `TeamLabel` for crests, consistent with the rest of the app.

---

## 8. Persistence — DECIDED: SAVE EVERYTHING

- **Session view** (current run → result screen): stats live in the result object in-store.
- **History view**: save full stats to Supabase `runs` — both the aggregated leaderboards/team table **and** per-match scorers, so a finished run is fully re-viewable from history.
- Proposed columns: `stats jsonb` (aggregated `CompetitionStats`), `awards jsonb` (`SeasonAwards`), and `match_scorers jsonb` (per-match `GoalEvent[]` keyed by matchday/fixture). **User must add these columns to the `runs` table** (same as `highlights` / `matchday_history`).
- Size: a 38-MD league ≈ ~1000 events ≈ a few hundred KB of JSON per row. Acceptable per decision; revisit only if rows get unwieldy.

### 8.1 Career persistence (cross-run)

Career totals span all runs, so they can't live on a single `runs` row. Options (see remaining Q): a per-user `career_stats` table/row in Supabase (syncs across devices) **or** local `AsyncStorage` (simpler, device-only). After each run, merge that run's drafted-player lines into the career store (key = `playerId|seasonLabel`, summing goals/assists/clean-sheets/MP and incrementing `runs`).

---

## 9. Bundled bug fixes (separate from stats, requested same time)

### 9.1 Matchday counter off-by-one

- `Matchday {currentMatchday} / {totalMatchdays}` shows N+1 because `currentMatchday` is incremented immediately after MD N completes (`setCurrentMatchday(prev+1)`), while `P` in the table shows N.
- Fix options: (a) label the *completed* count — show `min(currentMatchday-? , played)`; (b) display "Matchday {played} / {total}" using a derived `playedCount`; (c) relabel to "Next: MD {currentMatchday}". Recommended: show completed matchdays so the counter matches the `P` column. Applies to all three sim components (League `currentMatchday`, CL/WC `currentMD`, incl. the "Round x/3" WC label).

### 9.2 CL / WC must never appear in League / All-Time / Era

- Root cause: `LeaguePlacement` builds its pool from `getAllClubSeasons()` (unfiltered), so `ucl_*` / `wc_*` leagues leak into the placement spin for League/All-Time/Era.
- Fix: exclude `ucl_`/`wc_` league ids in `LeaguePlacement` (filter the season map), or switch it to the already-mode-aware `getClubSeasonsForMode`. Verify Era mode path also excludes them (and applies its decade filter).

### 9.3 League-mode placement filter button does nothing

- Root cause: `eligibleSeasons` is computed in `useEffect(…, [])` (runs once on mount with `leagueFilter='all'`); toggling "All Leagues / One League Specific" updates state but never recomputes the pool.
- Fix: include `leagueFilter` (and relevant inputs) in the effect deps, or apply the filter at spin time from a stable full pool.

---

## 10. Risks & edge cases

- **Roster gaps** — clubs/nations with few or zero seeded players → need a name fallback so scorers aren't blank.
- **Name vs identity** — `draftedPlayers` (own club) and DB rosters must produce stable ids so leaderboards de-dupe correctly across a season.
- **Performance** — attribution adds a small per-goal loop; negligible vs. existing sim. The one-time roster query is the main cost (one round-trip).
- **Save size** — full per-match scorers can bloat the `runs` row; cap or store aggregates (Open Q3).
- **Skip All** — must attribute identically to the play-by-play path (shared helper) so skipping doesn't lose stats.
- **Knockout shootouts** — ensure shootout kicks never create `GoalEvent`s and never increment goal tallies.
- **Old saved runs** — pre-feature runs have no stats; UI must degrade gracefully ("No player stats for this run").
- **Determinism** — stats captured at sim time; never recomputed (random engine).

---

## 11. Phased plan (proposed)

1. **Bug fixes**: matchday counter, CL/WC exclusion, dead filter button (can ship independently/first).
2. **Data + engine**: types, roster query, attribution helper, penalties exclusion. Unit-check distributions (forwards score most, GKs never).
3. **Accumulation**: wire into `simulateNextMD` + `skipAll` + knockout builders for all three modes; build `CompetitionStats`.
4. **Live UI**: per-match scorers in the results panel (player match emphasised).
5. **Post-run UI**: Top Scorers / Assists / Clean Sheets + Team Goals, themed, reachable from result pages.
6. **Persistence**: jsonb column(s) + history load + graceful degrade; career table.
7. **Globe Placement Indicator** (§11b) — done LAST, after everything above lands.

---

## 11b. Globe Placement Indicator (DONE LAST)

A spinning 3D globe with real country outlines, used as the placement reveal animation. Replaces/upgrades the current flat roulette. **Two uses**, and one gameplay change rides along.

### What it is

- A globe (~200×200, scalable) of real country outlines via an **orthographic projection**, drawn as SVG paths, that **spins** (longitude rotates), **decelerates**, and **locks** with the target country facing front. The target country **lights up in the mode accent** and a **"whirl"** ring orbits the globe and settles.
- Adapted to our game (the reference prototype was monochrome / off-white / no-text): in-app it sits on the **mode-tinted background**, outlines drawn in a muted light stroke + faint graticule, target highlighted in the **mode accent**, with **text revealed after the lock**.

### Use 1 — Domestic placement (League / All-Time / Era)

- Globe spins through countries → eases to a stop on the **country of the placed league-season** → lights it → reveals **Country · League · Season/Era** (e.g. "🇩🇪 Germany — Bundesliga 2012/13"). Replaces the current league-name roulette in `LeaguePlacement`.

### Use 2 — International placement (World Cup; future Euros/Copa)

- Globe spins → lands on a **nation** → lights it → reveals **"You replace {Nation}"** ("{Nation} XI").
- **GAMEPLAY CHANGE (decided):** you can now land on **ANY** of the 48 nations, not just the three weakest. The spin is **uniform random over the full field** (you could take over Brazil *or* a minnow). Update `WCPlacement`: replace the `Math.random() * min(3, …)` weakest-pick with a uniform pick across all teams; the globe makes the reveal dramatic. (CL stays its club-name spin — clubs, not nations — unless we later light up the club's country.)

### Tech approach (NEW DEPS — design only, no code yet)

- Needs **`d3-geo`** (`geoOrthographic` projection + `geoPath`) and a **low-res world geojson** (e.g. `world-atlas` countries-110m → geojson; `topojson-client` if shipping TopoJSON). `react-native-svg` is already installed.
- Spin = increment projection rotation `λ` over time and recompute each country `<Path>` per frame; ease-out to the target so its centroid sits at the projection centre (`projection.rotate([-lon, -lat])`).
- Highlight: fill the target country path with `theme.accent`; pulse it. Whirl: an SVG circle with a rotating `strokeDasharray` (or orbiting dots) around the globe.

```tsx
// SKETCH ONLY — not wired up.
import { geoOrthographic, geoPath, geoCentroid } from 'd3-geo'
import countries from '@/assets/geo/countries-110m.geo.json'

const projection = geoOrthographic().scale(95).translate([100, 100])
const path = geoPath(projection)

// per animation frame while spinning:
projection.rotate([lambda, -10])              // lambda ramps fast → eases out
const d = (feature) => path(feature) ?? ''     // recompute each country path

// on lock (target = the placed country/nation):
const [lon, lat] = geoCentroid(targetFeature)
projection.rotate([-lon, -lat])               // face the target front
// render <Path d={d(targetFeature)} fill={theme.accent} /> + pulse
```

### Risks / notes

- **Perf:** recomputing ~110–180 country paths per frame in JS can jank. Mitigate: use the 110m (coarse) set, throttle to ~20–30 fps via `requestAnimationFrame`, keep the spin short (~2–3 s), and stop the loop on lock. Path recompute is JS-side (not the RN `Animated` UI thread), so treat it as a short, self-terminating loop.
- **Asset size:** the 110m geojson is small (tens of KB) — fine to bundle.
- **Country ↔ data mapping:** need a map from our league/nation ids to ISO country codes/feature ids so the globe knows which feature to highlight (e.g. `bundesliga → DE`, each WC nation → its ISO code). Build a small lookup; nations mostly map 1:1 via the existing flag ids.
- **England/Scotland/Wales** etc. (sub-national football "countries") won't exist as standalone features in a countries dataset — fall back to highlighting GB and labelling the actual football nation in text, or use a dataset that includes the home nations.

### UI states for the designer to mock

1. **Spinning** — globe rotating, faint graticule, whirl active, no text.
2. **Locking** — deceleration, whirl tightening.
3. **Locked** — target country glowing in mode accent, whirl settled, text revealed (domestic: Country·League·Season; WC: "You replace {Nation}").
4. **CTA** — START SEASON / ENTER THE WORLD CUP.

---

## 12. Decisions & remaining questions

### Resolved

1. **Attribution** — realistic from real rosters, weighted by position + attack/ovr, **no historical-goals factor**. Own club uses drafted XI; opponents use DB rosters. Both player leaderboards AND per-club goals-for/against are required.
2. **Stats location** — BOTH (teaser on result page + dedicated Stats screen). Players three-in-a-row, teams two-in-a-row underneath.
3. **Persistence** — save EVERYTHING to DB (aggregates + per-match scorers).
4. **Assists & clean sheets** — full. Assists on **80%** of goals; clean sheets credited to **keepers only**.

### Resolved (round 2)

5. **Layout** — player leaderboards as **three tabs**; team table two-in-a-row underneath.
6. **Live density** — **every** match shows scorers; your match bigger, opponents smaller.
7. **Minutes** — **yes**, with light logic (≥1 min apart, added-time `90+`, ET `91–120`, last-minute drama).
8. **Scope** — per-run **and** a lifetime **career** of your drafted players keyed by player+season, with matches played + career team GF/GA.
9. **Matches played** — must be real (not 38); tracked per player and shown + accumulated.

### Resolved (round 3)

10. **Career scope** — your drafted players only; keyed by player + season + **competition** (league/CL/WC/future). Opponents are per-run flavour.
11. **Matches played** — never shown in per-run leaderboards or for opponents; only in the in-run "Your Players" section (your XI, e.g. 38) and the career leaderboard (cumulative).
12. **Career storage** — Supabase per-user table (`career_stats`), merge-on-run.
13. **Roster fallback** — not needed; the seed DB is pre-validated to have enough clubs with enough players before build.

### Awards (new requirement)

14. **Player of the Season + Best U21** — top 5 candidates each, any position, anyone can win; score = stats × team-position carry modifier (lower finish = bigger boost); naturally favours league formats. Needs `birthYear` threaded through for U21.
15. **Career separated by competition** (reconfirmed) — league / UCL / WC / future comps each keep their own career lines and matches-played; a league Haaland never merges with a CL or WC Haaland.

### Resolved (round 4)

16. **Carry-weight** — `CARRY_WEIGHT = 0.5` (moderate): stats lead, team-position tilts.
17. **Career awards cabinet** — YES. After each run, if a POTS/U21 winner is one of your drafted players, increment `potsWins`/`u21Wins` on that career line.

✅ All questions resolved — doc is complete and ready to implement against.
