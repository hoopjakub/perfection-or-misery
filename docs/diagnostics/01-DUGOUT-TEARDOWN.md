# 01 · The Dugout's diagnostics, taken apart

> Part of the diagnostics set. Start at [`00-README.md`](00-README.md).
> Read from the source on 15 September 2026: `src/perf.ts`, `src/budgets.ts`, `src/log.ts`, `src/diagnostics.ts`, `src/ui/screens/Diagnostics.svelte`, `src/worker/sim.worker.ts` (`benchmark`, `worldShape`), `src/store/ui.svelte.ts`, `scripts/verify/budgets.ts`, `scripts/verify/reload.ts`, and the history in `docs/RESEARCH-02-OPTIMIZATION.md` §5–6, `docs/PLAN-0.1.2.md`, `docs/PLAN-0.1.4.md` §15 and `docs/PERF-LOG.md`.

The Dugout is a Svelte web app with a simulation worker, shipped to browsers, Tauri on desktop and Capacitor on Android. Its diagnostics exist for one reason, stated in the research doc: the maintainer plays on a phone, taps Copy, pastes the report into a chat, and both sides are looking at the same table. No cable, no DevTools.

---

## 1. The five parts

```
budgets.ts ──► perf.ts ──► diagnostics.ts ──► Diagnostics.svelte
 (the contract)  (the recorder)  (the report)       (the screen)
                     ▲
log.ts ──────────────┘ (warnings and errors, read by the report and the screen)
```

### 1.1 `budgets.ts`: the contract

Every budget is `{ target, hardFail, unit, label, scales, planned? }`.

- **`target`** is what the app aims for. Missing it prints WARN.
- **`hardFail`** is where it's broken. Missing it prints FAIL and fails `npm run perf:ci`.
- **`unit`** is `ms`, `KB`, `MB` or `%`.
- **`label`** is the plain-English name shown next to the key (`"sim rest of season"`).
- **`scales`** says whether the budget grows with world size. `budgetFor(key, tier)` multiplies target and hard fail by 0.4 (tiny) up to 3.5 (huge).
- **`planned: true`** marks a budget for a feature that doesn't exist yet. The number is kept as a design decision (the live match will run at 8 ms a frame), but the screen doesn't report it as a measuring gap.

26 keys in five families: `boot:*` and `world:*` (startup), `sim:*` (the game), `ui:*` and `query:*` (the interface), `save:*` and `mem:*`, and build-time `size:*`. The comments are the interesting part. Most of them record a budget that was wrong and why it changed.

### 1.2 `perf.ts`: the recorder

- One `Float64Array` of 256 samples per metric name, written round-robin. No allocation per sample and no strings built until someone asks for a report.
- Each metric keeps `n` (count ever), `last`, `min`, `max`, `total`.
- Entry points: `mark`/`measure` (between two points in time), `time`/`timeAsync` (wrap a block), `sample` (a number measured elsewhere, such as in the worker), `frame` (the gap between two animation frames).
- `observeLongTasks()` attaches a `PerformanceObserver` for `longtask`: anything that blocks the main thread for more than 50 ms. The research doc calls it the single most valuable alarm, because it catches an accidental synchronous save.
- `observeMemory()` polls `performance.memory.usedJSHeapSize` every 10 seconds. That API only exists in Chromium; elsewhere the metric stays unmeasured and says so.
- `report()` sorts a copy of the ring to get p50 and p95, then judges each budgeted metric. **It judges p95 once there are five samples, and `last` before that.** Then it adds a row with status `UNMEASURED` for every runtime budget nothing has ever sampled.
- The recorder is published on `globalThis.perf`, so Playwright scripts can read the same numbers with `page.evaluate(() => perf.report())`. The scripts and the screen can't disagree because they read the same buffer.

### 1.3 `log.ts`: what happened

- A ring of 500 entries: `{ t, level, cat, msg, data?, season?, day? }`.
- Levels `debug | info | warn | error`. `debug` is dropped unless diagnostics mode is on, which the five-tap gesture switches on.
- Categories `boot world sim ui save net update`.
- Every entry is stamped with the career's season and day, so a line reads `[s7 d180] warn save/slow write {"ms":240}`.
- Warnings and errors mirror to the console.
- The file header sets the privacy rule: no manager name, no email, no file paths, no save contents. Club and league names are fine.

### 1.4 `diagnostics.ts`: the report

The design rules are written at the top of the file, and they're the best part of the system:

1. Under about 4,000 characters, so it survives a chat message.
2. Targets next to actuals. A number without its budget means nothing.
3. p95, not just the last value. Averages hide the stutters people complain about.
4. OK, WARN and FAIL computed in the app, so the interesting rows arrive flagged.
5. Environment first. Half of diagnosing is knowing which webview it was.
6. Plain Markdown. No colour, no emoji; it has to paste cleanly anywhere.

Layout: a title line; app version, build, engine version, world version and tier; shell, engine, cores and memory; session minutes, season, matchday and save size; the budget table; `over budget:` (the five worst by p95 ÷ target); `never sampled:`; `no budget:`; long tasks; translation coverage gaps; the last five problems. `buildFullReport` appends the whole log.

### 1.5 `Diagnostics.svelte`: the screen

Top to bottom: title and Close; an Environment card; three buttons (Copy report, Run self-test, Refresh); the budgets table (key with its label, target with unit, p50, p95, max, n, a status pill); "Measured, no budget"; long tasks; recent warnings and errors; "What the world is made of" (11 counts fetched from the worker once when the screen opens); and the report itself in a read-only textarea.

Details worth copying:

- **A budget with no data is dimmed to 55% opacity with a dashed pill that says `NO DATA`.** It is present but not coloured, because it isn't a result.
- **The card header counts the unmeasured budgets** ("3 budgets nothing has sampled yet") so nobody has to notice them.
- **The textarea is the clipboard's fallback.** Webviews can block the clipboard; the text is always there to select.
- Density tier T3, mono figures, `max-width: 900px`.

### 1.6 The self-test

`benchmark(iterations)` in the worker: materialises every squad, simulates one match `iterations` times, plays one full league season, builds a table 50 times, and posts `bench:match`, `bench:season`, `bench:matchday` and `bench:table`. The screen feeds those into the recorder with `sample()`.

### 1.7 World shape

`worldShape()` in the worker returns 11 counts: leagues, clubs, players, free agents, careers, career rows, archived seasons, honours, cups, European ties, inbox. Added in step 15c under the rule *"if a number was worth writing a script to measure, it is worth a player being able to see it."*

### 1.8 Access

- **Settings → Diagnostics**, with the shortcut shown beside the button. The Settings description reads "Always available."
- **Ctrl+Shift+D** anywhere.
- **Five quick taps on the version.** One tap opens Version history; the fifth lands on Diagnostics and switches on debug logging. This used to be a single tap, and `PLAN-0.1.2.md` moved it because a version number should open a version history.

---

## 2. The faults it shipped with, and what fixed them

The Dugout's diagnostics were built in its first milestone and were wrong in several quiet ways for a long time. Every one of these is a trap PoM would fall into by copying the code without the history.

### 2.1 Budgets nothing measured looked like fast budgets

The report was built only from recorded metrics. `ui:navigate`, `match:frame` and `mem:peak` had targets and not one line of code sampling them, so their rows weren't red or empty. They were absent. "Fast" and "never measured" looked identical.

**Fix:** `report()` adds an `UNMEASURED` row for every runtime budget with zero samples. `scripts/verify/budgets.ts` fails if any runtime budget has no recording call in the source.

### 2.2 The self-test wrote into the live keys

The benchmark posted `sim:day`, `sim:season` and `ui:sort`, the same keys the game records. Live `sim:day` is a whole day (training, finances, news, injuries, matches). Bench `sim:day` was `seasonMs / matchdays`, match simulation only, and far faster. Live `ui:sort` sorts a table on the UI thread; bench `ui:sort` built a table in the worker. Pressing Self-test averaged synthetic numbers into the player's real ones. The comment in `budgets.ts` puts it bluntly: a diagnostics screen that launders a benchmark into a gameplay metric is worse than none.

**Fix:** the benchmark owns `bench:*`. The verify script fails if a budgeted key is recorded on both sides of the worker boundary.

### 2.3 Metrics with no budget were thrown away

`boot:js`, `world:fetch`, `career:start` and `sim:toMatch` were measured and never shown, because the table listed budgeted metrics only.

**Fix:** all four got budgets, and anything else recorded without one appears under "Measured, no budget", with no verdict.

### 2.4 A mark isn't a measurement

`boot:js` had a budget and a `perf.mark("boot:js")` beside it, and never produced a number. A mark records a point in time; only `measure` turns two marks into a duration.

**Fix:** the verify script no longer counts `mark()` as instrumentation.

### 2.5 One key timing two different jobs

`ui:navigate` read p50 32 ms and p95 399 ms. A split like that means one budget is covering two operations. It wrapped screen swaps and world-wide market queries.

**Fix:** split into `ui:navigate` and `query:world`. The same thing happened to `world:decode`, which was mostly the cost of posting and cloning the directory, not decoding (2.5 ms against 195 ms reported). It became `world:decode` plus `world:install`.

### 2.6 A budget that only held in year three

`save:write` was 80 ms, set against a young save. At fifteen seasons it reads 260 ms of `JSON.stringify`, and it had sat in WARN for two milestones where everybody stopped looking. It was flagged `scales: false` while plainly growing with the career.

**Fix:** measured properly, repacked (31.1 MB of JSON down to 11.2 MB), and the budget renamed to say what it's for: `save write @ 15 seasons`, 250 ms.

### 2.7 A dev-server number reported as a shipped number

Under `vite dev`, `boot:js` measured the dev server compiling hundreds of unbundled modules (1,474 ms against 600) and showed a permanent FAIL that meant nothing about the real app. The fix is recorded in `src/main.ts`.

### 2.8 What a reload loses was a feeling

`scripts/verify/reload.ts` compares the field names of the worker's `State` with the field names of the save, statically, and fails on any field held in memory, never written, and not listed in `TRANSIENT` with a reason a person can read. **On its first run it found that the domestic cups weren't saved:** a reload redrew every cup from scratch. The rule it enforces: not saving something is allowed; not saying so isn't.

---

## 3. Gaps still in The Dugout's code

These are true of the source as read today. None is serious for The Dugout, and each is fixed in the PoM plan.

| # | Gap | Evidence | PoM plan |
|---|---|---|---|
| G1 | **The log doesn't survive a crash.** The header and the research doc both say it does; nothing writes it. `platform.writeTextFile` is declared optional and never called. | `log.ts` line 6; `platform/index.ts` line 70 | Warnings and errors persisted, plus global error handlers. [`02`](02-POM-ARCHITECTURE.md) §4 |
| G2 | **"Save report to file" and "Live overlay" have strings and no feature.** `diag.saveFile` and `diag.overlay` exist in both locales; `ui.diagnosticsOverlay` is state that nothing reads. | `i18n/en.ts` 312, 341; `ui.svelte.ts` 69 | Share sheet instead of a file; overlay deferred and not given strings until built |
| G3 | **The `n` column and the percentiles describe different samples.** `n` counts every sample ever; p50/p95 come from the last 256. After 1,000 samples the row says `n 1000` over a p95 of the last quarter. | `perf.ts` lines 55, 63 | Show `n` as "last 256 of 1,000" when it wraps |
| G4 | **The report is cut mid-line.** Over 4,000 characters, it slices at 3,960 and appends "(truncated)", which can land inside a table row. | `diagnostics.ts` line 110 | Drop whole sections by priority. [`05`](05-SCREEN-AND-REPORT.md) §6 |
| G5 | **A failed copy says nothing.** The `catch` is empty. The textarea is there, but the button never tells you it failed. | `Diagnostics.svelte` line 63 | Every share path ends in a visible result |
| G6 | **The long-task culprit is useless.** It stores `entry.name`, which for `longtask` is nearly always `"self"`. | `perf.ts` line 146 | The stall detector records the current route and the last metric that started |
| G7 | **The self-test's numbers can't be told apart from a quiet session.** Bench rows sit in the same table, sorted alphabetically among live ones. | `perf.ts` line 250 | Self-test results get their own section with the time they ran |
| G8 | **The session clock starts at module load**, not at boot, and nothing marks a return from the background. | `diagnostics.ts` line 20 | Session starts at first paint; the report shows time in the foreground |
| G9 | **`recentProblems` ignores context.** A warning from before a new career started still shows under the new career's header. | `log.ts` line 78 | Entries carry a run id (local only, never printed) and the screen can filter to this run |

---

## 4. What's worth keeping exactly

- The six report rules in §1.4, word for word.
- `target` and `hardFail` as separate numbers, and `planned` as a first-class flag.
- `UNMEASURED` as a status, dimmed and dashed, never coloured.
- `bench:*` as a separate namespace.
- A verify script that reads the source, not a list, so it stays true as the code moves.
- The reload audit's rule: every difference between a continued session and an uninterrupted one is a decision somebody wrote down.
- The habit in `PERF-LOG.md`: numbers from the screen, dated, with the device, and a paragraph on what they mean.
- Budgets whose names say what they're for (`save write @ 15 seasons`), so a budget can't quietly go stale.
