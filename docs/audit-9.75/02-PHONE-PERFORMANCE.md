# 02 · What the phone measured, and where the time likely goes

> Part of the Phase 9.75 audit. Start at [`00-README.md`](00-README.md).
> Status: **plan, 7 October 2026.** The readings are the maintainer's first session on the POCO X6 with a **development build** ([`../PERF-LOG.md`](../PERF-LOG.md), 7 Oct). Dev builds run slower than release builds, so read the shape, not the decimals. Every cause here is a **hypothesis** until a fix moves its number (the Dugout rule: a diagnosis isn't done until the number responds).

---

## 1. The readings that matter

| # | What | Reading | Budget (target / fail) | |
|---|---|---|---|---|
| P9.75-11 | The run hub's **Stats tab** opening | `ui:tab` 3,856 and 4,692 ms; stalls 3,775 and 4,557 ms on `/game/run` | 100 / 300 | FAIL ×15 |
| P9.75-11 | The hub's **Teams tab** | 1,791 ms | 100 / 300 | FAIL |
| P9.75-11 | Back to **Table** (once) | 2,554 ms, stall 2,311 ms | 100 / 300 | FAIL |
| P9.75-12 | **Opening the run hub** | `ui:navigate` 778–1,631 ms, stalls 923–2,381 ms as it mounts | 150 / 350 | FAIL |
| P9.75-13 | A cup run's **stats pass** | `stats:ucl` 1,656 ms with a 1,446 ms stall on the result; `stats:wc` 721–848 ms | 600 / 1800; 400 / 1200 | WARN |
| P9.75-14 | **The JS heap** | 20 MB at start → 104 MB after ten minutes, never falling | `mem:js` 250 / 400 | OK, but rising |
| P9.75-15 | A draft spin; setup screens | `draft:spin` 448 ms; 266–358 ms stalls opening mode select, difficulty, formation | 150 / 400 | FAIL / stalls |

What's fine: boot 1,346 ms, the database 164 ms, the network 125–657 ms, the result screen 131–294 ms. The memory probe answered (Hermes heap stats work); long tasks aren't delivered on Hermes, so the stall detector is the only source.

---

## 2. P9.75-11 · The Stats tab: 4 to 5 seconds

**Where it goes (hypothesis, strong).** `StatsTab` → `PlayerBoards` (`app/game/run.tsx:446`). On open it:
1. ranks every player per position line (`positionRanks`, `src/engine/run-aggregates.ts:66`), whose inner loop does a `findIndex` over the sorted line for each player (`:79`): quadratic per line;
2. filters and sorts the board for the default stat (goals);
3. **mounts one `Pressable` row per listed player**, each with three or four `KitText`s, a percentile `Tag` and, for some stats, a `RatingSquare` (`run.tsx:481`). Nothing is virtualised. A European run's stats hold every player of every club the run met (the league phase alone is 36 clubs; about 25 players each), so the goals board is hundreds of rows, and stats like appearances list nearly everyone.

The mount (3) is the likeliest cost; (1) is real but smaller. **Probe before fixing:** time the three separately (`time('stats:board', …)` around 1–2, and `ui:tab` already covers the mount); the split tells which fix buys the seconds.

*(8 Oct, step 4: built without the probe's split first; the probe ships with the fix, so the next reading shows both. `BoardList` is paged rows, not a `FlatList`, because the board sits inside the screen's ScrollView. See 06 step 4.)*

**Fix (after the probe).**
- The board is a `FlatList` with fixed-height rows (`getItemLayout`), so only the rows on screen mount. The search field and the switches become its header.
- ~~`positionRanks` ranks in one pass.~~ *Struck by the second pass ([`07-SECOND-PASS.md`](07-SECOND-PASS.md) §1): ranking a 500-player board takes about 1 ms in Node; it isn't the cost.*
- The board's rows are computed once per (stat, mode) with `useMemo`, not on every render.

**Done when.** `ui:tab` for Stats under 300 ms on the phone (release build), and no stall over 200 ms opening it. Proof the measure can fail: today's 3,856 ms.

### The Teams tab (1.8 s) and the Table tab (2.6 s once)

**Hypothesis.** `TeamsTab` draws a team of the round for every round at once, each an XI on a pitch (`PitchViews`), so a 15-round run mounts ~165 player tags. The Table tab draws `LeagueTable`, whose rows use Reanimated layout animations for the reorder (`feedback_animation`); 36 animated rows mounting may cost the 2.3 s seen once. Both: measure, then mount one round at a time (a round picker, as the season screen's strip does) and skip the reorder animation where nothing reorders (a finished run's table never moves).

---

## 3. P9.75-12 · Opening the run hub: 0.8 to 1.6 seconds

**Hypothesis.** `app/game/run.tsx` works out its tabs on every render, and `knockoutRun(data)` (`:303`) is called both for the tab list (`:125`) and inside `BracketTab`; it walks every knockout match. The default tab (Table) then mounts the animated table. For a saved run opened the first time, `useRunData` → `savedRunData` rebuilds the stats from seeds (the same pass as P9.75-13) before anything shows.

**Fix.** Memoise `knockoutRun` per data; land on the hub with a light first frame (the header and tabs) and mount the tab's body a frame later, so the tap answers at once; the stats pass of a saved run runs after that first frame. **Done when** `ui:navigate` into the hub under 350 ms on the phone.

---

## 4. P9.75-13 · A cup run's stats pass: 1.7 seconds on the JS thread

**Cause (confirmed, by design).** `computeCLRunStats` regenerates every match sheet of the run from its seed (`run-stats.ts`, the seed-and-regenerate architecture). A European run is ~150–200 sheets. It runs on the JS thread while the result screen is up, which is the 1.4 s stall.

**Options (decision D2 in the README).**
1. **Chunk it**: regenerate in slices of ~20 sheets with a yield between, so the result screen stays responsive and fills the story rows when done. Cheap; no change to what's stored.
2. **Store the totals with the saved run**: the run's per-player totals are written once at save time, so opening a saved run needs no regeneration at all (match sheets still regenerate on open). Bigger: a column on `runs`, and older runs keep the slow path.

Default: 1 now (it's self-contained), 2 later if the reading after 1 still says so.

---

## 5. P9.75-14 · The heap climbs to 104 MB and stays

**What's known.** The steps line up with the run hub's tabs opening: 56 → 76 MB with the Stats tab, 84 → 92 with the next run hub. Hermes' `js_heapSize` counts what's allocated, including garbage not yet collected, so a high number isn't by itself a leak.

**Candidates (hypotheses).**
- `saved` in `src/lib/runData.ts`: every saved run opened keeps its whole `RunData` (stats, match logs, rounds) for the session, with no limit.
- The roster cache (Phase 9, `seasons.ts`), also unbounded, by design.
- The log ring (1,000 lines, small).
- Retained screens: expo-router keeps screens under the one in front mounted (the draft under the whole run, the result under the hub).

**Probe.** In a release build, open five saved runs' hubs one after another and read `mem:js` after each; then add a "drop caches" button to Diagnostics (`saved.clear()`, the roster cache) and read it again. If the heap falls, it was the caches: cap `saved` at the last three runs. If it doesn't, it's something retained, and the next probe is the mounted screens.

---

## 6. P9.75-15 · The smaller ones

- **A draft spin, 448 ms**: `draft:spin` times `getPlayersForClubSeason`. *The second pass read the plan: fully indexed, 0.7 ms a query in Node ([`07`](07-SECOND-PASS.md) §1).* So the time is the phone's JS side (a 274 ms stall during the spin): re-measure on a release build before changing anything.
- **270–360 ms stalls opening setup screens**: each setup screen mounts its whole content in one go; a release build may already halve these. Re-measure in release before touching.

---

## 7. Measurement gaps this reading exposed

| Gap | Why it matters | Add |
|---|---|---|
| No live match was watched | The 24 s v 15 s question is still open | The maintainer watches one on the next build; the `sim/live` line breaks it down |
| Everything is a dev build | Targets can't move on dev numbers | A release build's session, the same steps |
| No probe inside the Stats tab | Can't split ranking from mounting | `time('stats:board')` (one site) |
| The heap has no "after a collection" reading | Can't tell garbage from retention | A "drop caches" action on Diagnostics, debug builds only |

---

## 8. Documents to update when built

- [`../diagnostics/03-BUDGETS.md`](../diagnostics/03-BUDGETS.md): `stats:board` if added; any target moved, with the release reading beside it.
- [`../PERF-LOG.md`](../PERF-LOG.md): a section per measuring session after each fix.
