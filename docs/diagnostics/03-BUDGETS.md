# 03 · Budgets and where each is measured

> Part of the diagnostics set. Start at [`00-README.md`](00-README.md).
> Status: **plan, numbers provisional.** Every target here is a starting position. The first release build on a mid-range Android phone replaces them with measured ones, each change written beside the number with its reason, the way The Dugout's `budgets.ts` does.

---

## 1. The spec

```ts
type Budget = {
  target: number        // what we aim for; above it is WARN
  hardFail: number      // above it is FAIL; always greater than target
  unit: 'ms' | 'MB' | 'KB'
  label: string         // plain English, says what it's FOR ("stats for a league run")
  platforms?: Array<'android' | 'web'>   // absent = both
  network?: true        // includes a round trip; judged, but labelled as depending on the connection
  planned?: true        // the feature doesn't exist yet; the number is the design decision
  buildTime?: true      // weighed by a script, never sampled by the running app
}
```

Two additions to The Dugout's spec, both from how PoM differs:

- **`platforms`.** Some work only happens on one platform. Downloading the database happens on web; copying it into the documents folder happens on Android. Without this field, Android would list `db:fetch` as NO DATA forever and train everyone to ignore the NO DATA list.
- **`network`.** Saving a run is mostly the phone's connection. It still deserves a budget (a 9-second save is a real problem), but a FAIL on a train isn't a code fault, and the label says so.

**No scaling table.** The Dugout multiplies budgets by world size. PoM has four competition shapes of very different sizes, and the honest answer is a key for each shape: `sim:skip:league` and `sim:wc` are different work and get different numbers.

**Units.** Milliseconds unless stated. Frame budgets are judged on p95 of the interval between frames.

---

## 2. Runtime budgets

"Starts" and "ends" say exactly what the number covers. "Recorded in" is where the call goes. Line numbers are as of 15 September 2026.

### 2.1 Boot and data

| Key | Target / fail | Starts | Ends | Recorded in | Notes |
|---|---|---|---|---|---|
| `db:fetch` | 1500 / 5000 · web · network | `Asset.downloadAsync` called | `arrayBuffer()` resolved | `src/db/setup.ts` `initBundledDbWeb` | 10.9 MB on every web load. The single biggest boot cost on web, and invisible today |
| `db:open` | 400 / 1200 | database bytes in hand (web) or version file read (Android) | `_db` assigned | `setup.ts` `initBundledDbWeb` / `initBundledDbNative` | Web: `deserializeDatabaseAsync`. Android: open only |
| `db:install` | 3000 / 8000 · android | version check says replace | copy finished and version file written | `setup.ts` `initBundledDbNative` | Runs on first launch and after every `DB_VERSION` bump, so it is rare and mostly first impressions |
| `boot:interactive` | 1500 / 3000 | module evaluation of `app/_layout.tsx` | the first frame after Home's `onLayout` | `app/_layout.tsx` and `app/(tabs)/index.tsx` | Native startup before the JS bundle runs isn't visible from JS. The label says "from JS start" |
| `ui:navigate` | 150 / 350 | press-in on a `PressCard` or `BackButton` | the first frame after the new pathname commits | `src/components/ui.tsx` (press mark), root layout (pathname effect + `requestAnimationFrame`) | Only counted if the pathname changes within 2 s of the press. Timing `router.push` itself would measure nothing (The Dugout's lesson on the rune assignment) |
| `query:pool` | 250 / 700 | `getClubSeasonsForMode` called | resolved | `src/db/queries/seasons.ts` (one site, three callers: `draft.tsx:201`, `placement.tsx:278`, `:532`) | Recorded at the query so the three screens share one key |

### 2.2 Setup

| Key | Target / fail | Starts | Ends | Recorded in | Notes |
|---|---|---|---|---|---|
| `draft:spin` | 150 / 400 | `spinClubSeason` called | the landed season's players resolved (`getPlayersForClubSeason`) | `app/game/draft.tsx` around lines 78 and 320 | The wheel animation is excluded; this is the wait before a list can appear |
| `placement:build` | 100 / 300 | `spinPlacement` called | `buildLeagueSeason` returned | `app/game/placement.tsx:112` | |

### 2.3 Simulation

The simulation runs on the JS thread in the screen component. Each key ends at the first frame after the resulting state commits, because that's what the player waits for.

| Key | Target / fail | Covers | Recorded in |
|---|---|---|---|
| `sim:matchday:league` | 60 / 150 | one "Next matchday" press in a league run | `simulation.tsx` `simulateNextMatchday` (line 373) |
| `sim:skip:league` | 800 / 2000 | Skip to the end of a league season | `simulation.tsx` `skipAllMatchdays` (557) |
| `sim:matchday:ucl` | 60 / 150 | one league-phase matchday | `simulation.tsx` `CLSimulation.simulateNextMD` (1219) |
| `sim:skip:ucl` | 1000 / 2500 | Skip all, through the knockouts | `simulation.tsx` `CLSimulation.skipAll` (1331), including `simulateCLKnockoutsOnly` (1400) |
| `sim:wc` | 1000 / 2500 | Skip all in the World Cup, groups and knockouts | `simulation.tsx` `WCSimulation.skipAll` (2064), including `simulateWCKnockoutsOnly` (2147) |
| `sim:customUcl:qualifying` | 1500 / 4000 | every association's domestic table plus the qualifying ladder | `custom-ucl-simulation.tsx` around 395–405 |
| `sim:customUcl:skip` | 1000 / 2500 | league phase and knockouts of the full UCL route | `custom-ucl-simulation.tsx` 350, 620, 692 |

**Expected first finding.** `sim:customUcl:qualifying` simulates a domestic season for every UEFA association in one synchronous block. If anything in PoM breaks the 50 ms stall line on a phone, it's this. The stall record will name it.

### 2.4 Match detail, Deep Match and stats

| Key | Target / fail | Covers | Recorded in | Notes |
|---|---|---|---|---|
| `detail:generate` | 15 / 40 | one `generateMatchDetail` call | inside `src/engine/match-detail.ts` `generateMatchDetail` (one site) | Called by the match sheet, the live sim, availability and run stats. The count shows how many sheets a run regenerates |
| `deep:timeline` | 40 / 120 | `buildDeepMatchTimeline` | `app/game/deep-match.tsx:124` | |
| `stats:league` | 700 / 2000 | `computeLeagueRunStats` | `result.tsx:281`, `stats.tsx:94` | |
| `stats:ucl` | 600 / 1800 | `computeCLRunStats` (both UCL modes) | `cl-result.tsx:89`, `custom-ucl-result.tsx:93`, `stats.tsx:91–92` | Three sites for one operation. The verify rule allows two, so the call moves into a small `runStatsFor(store)` helper first |
| `stats:wc` | 400 / 1200 | `computeWCRunStats` | `wc-result.tsx:114`, `stats.tsx:93` | |

**Expected second finding.** The result screen computes run stats, and the Stats screen computes them again for the same run (`stats.tsx:91–94`). If a player opens Stats, `stats:*` will show two samples per run. That's the clearest optimisation lead in the plan, and Diagnostics will prove or disprove it on a phone before anyone caches anything.

### 2.5 Frames

Judged on p95 of the interval between frames while the scene is on screen. `frameReset(key)` runs on unmount.

| Key | Target / fail | Scene | Recorded in | How |
|---|---|---|---|---|
| `frame:deepMatch` | 20 / 50 | the live phase of Deep Match | `app/game/deep-match.tsx` | A `requestAnimationFrame` sampler while the live phase is mounted. The match clock is a `setInterval` (line 217), which isn't a frame, so the sampler runs beside it |
| `frame:globe` | 20 / 50 | the placement and About globes | `src/components/GlobeReveal.tsx` ticks at 75 and 174 | Already a rAF loop: one `frame('frame:globe')` call per tick |
| `frame:ceremony` | 20 / 50 | trophy lift and confetti | `src/components/Ceremony.tsx` | A rAF sampler while mounted (its `Animated.loop` gives no tick to hook) |
| `frame:bracket` | 17 / 33 | pinch and pan on the bracket | `src/components/BracketPreview.tsx` | Reanimated `useFrameCallback` on the UI thread, accumulated in a shared value and flushed to JS every 30 frames. Crossing to JS on every frame would cause the jank it measures |

### 2.6 Stalls and memory

| Key | Target / fail | What | Notes |
|---|---|---|---|
| `stall:js` | 200 / 700 | p95 of recorded stalls (event-loop lateness over 50 ms) | A count and the worst stall, with route and open key, are shown beside it. See [`02`](02-POM-ARCHITECTURE.md) §3.3 |
| `mem:js` | 250 / 400 MB | JS heap, polled every 10 s | Web: `performance.memory` (Chromium). Android: **probe** `HermesInternal.getInstrumentedStats()`. Where neither exists the row reads NO DATA with the reason |

### 2.7 Save and network

All four are `network: true`.

| Key | Target / fail | Covers | Recorded in |
|---|---|---|---|
| `save:run` | 1500 / 5000 | inserting a finished run, any mode | inside `src/db/queries/runs.ts`, at the shared insert, so four `save*Run` functions share one site |
| `save:career` | 1500 / 5000 | `mergeCareerFromRun` | `src/db/queries/career.ts` |
| `net:leaderboard` | 1200 / 4000 | `fetchLeaderboard` | `src/db/queries/leaderboard.ts` |
| `net:runs` | 1200 / 4000 | `fetchRunHistory` | `src/db/queries/leaderboard.ts` |

---

## 3. Planned budgets

Kept as decisions for screens the overhaul adds. Not listed as NO DATA.

| Key | Target / fail | For | Source |
|---|---|---|---|
| `frame:draw` | 20 / 50 | the broadcast draw | [`../ui-overhaul/06-MOTION.md`](../ui-overhaul/06-MOTION.md) |
| `frame:verdict` | 20 / 50 | the verdict stitch sequence | same |
| `share:label` | 600 / 1500 | rendering the share label with `react-native-view-shot` | [`../ui-overhaul/07d-SCREENS-RESULTS.md`](../ui-overhaul/07d-SCREENS-RESULTS.md) |

---

## 4. Build-time budgets

Weighed by `scripts/perf-size.ts`, never sampled by the app.

| Key | Target / fail | What |
|---|---|---|
| `size:apk` | 60 / 90 MB | the release APK (the database alone is 10.9 MB) |
| `size:webJs` | 1500 / 2500 KB | the web entry bundle, gzipped |
| `size:db` | 12 / 16 MB | `assets/db/players_v5.db` |
| `size:assets` | 20 / 30 MB | everything under `assets/` shipped to web, the database included |

---

## 5. Self-test keys

Never written by the game. Shown in their own section with the time the test ran.

| Key | Target / fail | Work |
|---|---|---|
| `bench:match` | 0.2 / 1 | one `simulateMatch` between two fixed synthetic teams, averaged over 2,000 |
| `bench:detail` | 15 / 40 | one `generateMatchDetail` from a fixed input, averaged over 200 |
| `bench:timeline` | 40 / 120 | one `buildDeepMatchTimeline` from a fixed sheet, averaged over 20 |
| `bench:leagueSeason` | 400 / 1200 | a full 20-team season of `simulateMatch` with fixtures from `generateFixtures` |
| `bench:stats` | 700 / 2000 | `computeRunStats` over that season with synthetic squads |
| `bench:query` | 150 / 400 | a fixed `getClubSeasonsForMode('league')` |
| `bench:net` | 400 / 1500 · network | a lightweight Supabase select, round trip |

---

## 6. Counts

| Kind | Keys |
|---|---|
| Runtime | 30 |
| Planned | 3 |
| Build-time | 4 |
| Self-test | 7 |

---

## 7. Rules for changing a budget

1. **Measure first.** A target only moves with a reading from Diagnostics or a script, written in the comment beside it with the date and device.
2. **Rename, don't loosen.** If a budget is right for one situation and wrong for another, the fix is two keys or a label that says what it's for (The Dugout's `save write @ 15 seasons`), not a bigger number.
3. **A bimodal key is two keys.** p50 far below target with p95 far above means one key is timing two different jobs (01 §2.5).
4. **Planned becomes real in the same commit** as the feature, or `verify-budgets` fails.
5. **Log it.** Each measuring session gets a dated block in `docs/PERF-LOG.md`: device, build kind, the table from the report, and a paragraph on what the numbers say.
