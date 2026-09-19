# Perfection or Misery — Project Overview & State

> Read this first in a new session. It explains what the app is, where the core
> code lives, the data pipeline, the current state, and the critical gotchas.

## 1. What it is

**Perfection or Misery** is a mobile **football management roguelike** (Expo / React Native / TypeScript). You **draft an XI** (spin random club-seasons, pick players, place them in a formation), get **randomly placed** into a competition, **simulate** it, and receive a **tier + score**. Tone is deliberately punchy ("Ready to suffer?", "Absolute Misery").

**Modes** (`GameMode`): domestic `league` + variants `all_time` / `era` / `chaos` / `cursed`, plus `champions_league` (UCL) and `world_cup` (WC). Chaos/Cursed and hard difficulty **hide ratings** (draft list then sorts by surname so OVR can't be inferred).

## 2. Stack & how to run

- **Expo SDK 54**, React Native 0.81, **expo-router** (file-based routing), TypeScript (strict).3
- **Zustand** (`src/store/gameStore.ts`) — per-run state.
- **expo-sqlite** — bundled read-only player DB (`assets/db/players_v5.db`), versioned.
- **Supabase** — auth + `runs` and `career_stats` tables.
- `react-native-svg`, `react-native-mmkv` (+ `react-native-nitro-modules`), `react-native-reanimated` 4 (+ `react-native-worklets`, mostly unused by app code).
- **Run dev:** `npx expo start --dev-client --clear` then open the **development build** (NOT Expo Go — the app uses native modules Expo Go lacks). Connect via LAN IP or `--tunnel`.
- **Typecheck:** `npx tsc --noEmit` (ignore `supabase/functions` + `scripts/` noise).
- **Builds:** EAS (`eas build --profile development --platform android`). With `requireCommit` off (the default here) the CLI uploads the **working tree**, uncommitted changes included, minus `.gitignore`d files. `android/` is ignored, so EAS regenerates it from `app.json` every build.

## 3. Core layout

```
app/                      expo-router screens
  (tabs)/                 the four destinations: index (Play), runs, leaderboard (Ranks), profile (You)
  guide, about, confirm   ordinary routes (guide/about moved out of the tab bar; confirm = ConfirmScreen)
  game/                   setup: mode-select → difficulty (+ difficulty-custom) → formation-select → draft → reveal (blind runs) → placement → pundits → simulation;
                          then awards (Awards Night) → result, cl-result, wc-result, stats, career
src/
  engine/                 pure sim/game logic (no RN)
    match.ts              simulateMatch (the core 1 match → score)
    fixtures.ts           round-robin schedule (generateFixtures)
    simulation.ts         league season orchestration
    cl-sim.ts             Champions League (Swiss league phase + KO)
    world-cup-sim.ts      World Cup (48-team groups → R32… + 3rd-place playoff)
    knockout-match.ts     KO ties, extra time, simulateShootout (penalties w/ early stop)
    rating.ts             effectiveOvr, positionPenalty (flat ±0/-2 fit), calcTeamOvr (no chemistry)
    predictions.ts        the pundits' seeded, deliberately noisy predicted table (verify-predictions.ts)
    press.ts              the run's press: stories from the table, frozen rows, cooldowns (verify-press.ts)
    awards.ts             Awards Night: every award measured, teams picked in their best-fitting shape (verify-awards.ts)
    commentary.ts         match commentary built from stored events (verify-commentary.ts)
    match-geometry.ts     shot map, average positions, heat maps from the sheet's own counts (verify-match-geometry.ts)
    cup-calls.ts          the pundits' round calls for a cup, checked against the bracket (verify-cup-calls.ts)
    draft.ts              isPlayerAvailable, spinClubSeason, reroll/ratings-hidden rules
    stats.ts              scorer/assist/clean-sheet ATTRIBUTION + awards (POTS/U21)
    run-stats.ts          aggregate a finished run → CompetitionStats + awards; loadLeaguePools
    quick-sim.ts          headless tester (About → tap version 8×, dev/preview builds only); quickSim flag suppresses saves
  components/             TeamLabel, LineupPitch, SquadSummary, PenShootout, GlobeReveal, WCGroupModal
  components/kit/         the Kit Drop component set (see DESIGN.md)
  components/season/      LeagueSeason, SeasonParts (tables with zones, strip, ticker, ties), RunChrome, VerdictBlock
  db/queries/             runs.ts (save + score), leaderboard.ts (stats/best tier), career.ts, seasons.ts
  store/gameStore.ts      run state (mode, draftedPlayers, clTeams/clYear, wcTeams, results, quickSim…)
  data/                   tiers.ts (unified tier rank/label registry), geo-iso.ts (id→ISO for globe),
                          qualification-bands.ts (zones per league-season; the tier ladder reads them — verify-zones.ts)
  lib/                    globe-geo.ts (hand-rolled orthographic projection), math.ts
  types/                  game.ts, simulation.ts, stats.ts
scripts/                  build-db.ts + scrapers (run with tsx, NOT bundled into the app)
  lib/transfermarkt.ts    shared scraper lib (fetch, squad parse, OVR model, teamStrength)
  lib/colors.ts           crest → brand colours (pngjs)
  scrape-league.ts        top-5 domestic leagues, multi-season
  scrape-ucl.ts           Champions League, multi-season
  scrape-wc.ts            World Cup national teams
  seed/*.json             scraper output (input to build-db)
assets/db/players_v5.db   bundled SQLite (built from seed by build-db)
docs/                     this file + "Major Overhaul + Bug fixes.md" (stats system as-built)
                          + "More Competitions & Modes.md" (roadmap, leagues, caveats)
```

## 4. Data pipeline (how players get into the game)

Transfermarkt scrapers → `scripts/seed/<comp>.json` → `npm run build-db` (better-sqlite3) → `assets/db/players_v5.db`. The DB bakes a `db_version` (`_meta`) sourced from **`src/db/setup.ts` `const DB_VERSION`** (build-db auto-bumps it). The app re-copies the bundled DB when the version changes.

- Each club carries `seasons[]` (a `club_season` per year it featured) → multi-season back-catalogue; clubs keyed by stable Transfermarkt verein id so they merge across seasons.
- **OVR model** (`lib/transfermarkt.ts`): per-player OVR from market value (log curve) + age + playing-time; club season OVR via `teamStrength()` (best ~14 players, spread-amplified → champions ~90, weak ~72).
- Club colours: curated where present, else extracted from the crest.
- **Gotcha:** `parseParticipants` is scoped to the league's clubs table so relegation-playoff teams don't leak in (was giving 19-team Bundesliga / 21-team Ligue 1).

## 5. Key systems

- **Stats (deterministic):** scorers/assists/clean-sheets are **attributed once at sim time and stored on the match objects**, so live reveal, result screen, and saved snapshot all match. Aggregated into leaderboards + **POTS / Best-U21 awards** + a lifetime **career** (`career_stats`, keyed playerId+season+competition, with an awards cabinet). Shootout kicks never count as goals. See `docs/Major Overhaul + Bug fixes.md`.
- **Penalties:** `simulateShootout` plays kick-by-kick with **early termination** (stops once mathematically decided), stores the real make/miss pattern; `PenShootout` renders it.
- **Scoring:** league = position-in-table formula (`leaderboard.ts calculateScore`); CL/WC = **round-reached ladder** + real finish position (`runs.ts knockoutScore`, e.g. WC `winner 1650 … third 1150 … groups 150`). Home page "Best Tier" uses the unified `src/data/tiers.ts` registry across all modes.
- **WC third-place:** SF losers always play a 3rd-place match (revealed between SF and final). Win → `third` (🥉), lose → `fourth` ("Semi 'No Medal' Finalist").
- **Globe placement reveal:** hand-rolled orthographic SVG globe (NO d3-geo) in `src/lib/globe-geo.ts` + `GlobeReveal`; lights the country on lock. Used for domestic (country) + WC (nation). Domestic & WC pick **any** club/nation uniformly; UCL picks any of the 36 clubs but still uses a name roulette (globe-for-UCL needs club→country data — see More Competitions doc).
- **WC group view:** `WCGroupModal` / `WCGroupMatchdays` (shared by the live simulation AND the result screen — single source of truth).
- **Sim robustness:** league `totalMatchdays` is derived from the actual generated fixtures (handles variable team counts, e.g. Ligue 1 was 20 teams pre-2023/24 → 38 MDs); match simulation is idempotent (no double-counting on Skip-All double-taps).
- **Deep match stats (FotMob-style):** every finished match is tappable into a full match-detail modal — team stat grid (possession/xG/shots/passes/duels/discipline), events timeline, both lineups with 0–10 ratings, MOTM ★ and green▲/red▼ sub markers, tap-a-player full stat line. Matches store only a compact `seed` (+ the attributed scorers); `src/engine/match-detail.ts` regenerates the identical sheet on open (mulberry32, `src/lib/rng.ts`). Stats track team QUALITY more than the scoreline, so a beaten favourite often dominates xG/possession. Validate with `npx tsx scripts/verify-match-detail.ts`. See `docs/Next Up - Deep Match Stats & Ratings.md` (implemented) for the as-built map.

## 6. Current state (accurate as of this writing)

- **Working tree clean and pushed.** Branch `master` (remote: github `hoopjakub/perfection-or-misery`).
- **Data is fully scraped & built:** DB **v10**, 7 leagues, ~24,935 player-seasons.
  - Top-5 domestic leagues: **8 seasons each (2018–2025)**.
  - Champions League: **2024 + 2025** editions (you're randomly placed into one via `clYear`).
  - World Cup: 2026 (48 nations).
- The whole stats/awards/career, scrapers, WC third-place, draft swap/move, scoring, globe, and the big build-infra fixes are **done and shipped**.

## 7. Critical gotchas (don't relearn these the hard way)

- **Dev build, not Expo Go** — the app needs `react-native-mmkv`/nitro native modules absent from Expo Go.
- **Dependencies:** `.npmrc` has `legacy-peer-deps=true` (needed for EAS `npm ci`). Because of that, peers aren't auto-installed, so **`react-native-nitro-modules` must stay an explicit dependency** (mmkv's peer) or the Android build fails. `react-native-reanimated@~4.1` requires **`react-native-worklets`**. `typescript` pinned `~5.9.2` (devDep only).
- **`babel.config.js`** = `babel-preset-expo` only. The preset **auto-adds** the worklets plugin — do NOT add `react-native-worklets/plugin` again (double-apply → Hermes "invalid expression").
- **`scripts/club_facts.json` must never be empty/invalid** — it's `import`ed into the app bundle (`src/lib/clubFacts.ts`); an empty file makes Hermes fail to compile the whole app.
- **EAS uploads the working tree** (see §2), so uncommitted changes ship too. **Supabase** needs `runs.stats`/`runs.awards` jsonb columns and the `career_stats` table (RLS: own-row).
- **Scrapers are slow** (~minutes/league/season; full multi-league runs are 30–60+ min) and `fetch` has no timeout — a hung TM request can stall a run.

## 8. Pointers

- `DESIGN.md` (project root) — **the Kit Drop design system as built**: tokens, type, components, and where the build differs from the plan. Read before any UI work.
- `PRODUCT.md` (project root) — product truth: audience, platform (Android and web equal), scope, brand commitments, principles. Read before any UI work.
- `docs/ui-overhaul/` — **the UI/UX overhaul plan (Sept 2026), direction locked: Kit Drop, "Winner Stays" cut.** Start at `00-README.md`. Critique, vibecode audit, The Dugout comparison, direction, style guide (becomes `DESIGN.md`), motion, screen-by-screen plans, components, copy deck, adapt/optimize/a11y, and a seven-phase roadmap.
- `docs/maturita/` — **the maturita (PČOZ MS) project plan (Sept 2026).** The school's template and assignment sheet (in `zdroje/`), requirements and marking, a chapter-by-chapter thesis map, the game design / digital media / web / economics viewpoints, licensing and release issues, and the timeline to the 22 March 2027 handover. Start at `00-README.md`.
- `docs/diagnostics/` — **the Diagnostics screen plan (Sept 2026, not built).** How The Dugout's version works and where it fails, budgets with exact call sites, the self-test and engine fingerprint, the screen in Kit Drop, the report format, and a five-step build order. Start at `00-README.md`.
- `docs/Major Overhaul + Bug fixes.md` — the stats/awards/career/penalty/globe systems, as built.
- `docs/More Competitions & Modes.md` — available leagues (TM codes), league-format quirks needing code (Belgium/Scotland/split-season), UCL/WC **format-era** handling (old groups vs Swiss; 32 vs 48), cup/EURO roadmap, the UCL-globe idea, and known caveats.
- Persistent cross-session memory lives in the Claude memory dir (`MEMORY.md` index) — covers build/deps traps, DB versioning, mode theming, scorer attribution, globe, scrapers.
