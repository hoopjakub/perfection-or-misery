# 02 · The PoM version: architecture

> Part of the diagnostics set. Start at [`00-README.md`](00-README.md). The Dugout's version is in [`01-DUGOUT-TEARDOWN.md`](01-DUGOUT-TEARDOWN.md).
> Status: **plan.** Items marked **probe** depend on a runtime API that has to be confirmed on a real Android build before anything relies on it.

---

## 1. What carries over, and what doesn't

The Dugout runs in a browser engine with a worker. PoM runs on Hermes on Android and on V8 in a browser, with no worker, and the simulation runs on the JS thread that also drives React. That changes several pieces.

| The Dugout relies on | On PoM Android (Hermes, RN 0.81) | On PoM web (V8, react-native-web) | Plan |
|---|---|---|---|
| `performance.now()` | Available | Available | Use it everywhere |
| `performance.mark`/`measure` in DevTools | Partial on the new architecture | Available | Use the recorder's own marks; mirror to `performance.mark` when present, as The Dugout does |
| `PerformanceObserver('longtask')` | **Probe.** Parts of the Web Performance API ship on the new architecture; `longtask` delivery isn't confirmed on this build | Chromium only | An event-loop lag detector that works everywhere (§3.3). Use the observer too if the probe finds it |
| `performance.memory` | Absent | Chromium only | Web: poll it. Android: **probe** `HermesInternal.getInstrumentedStats()` for heap size. If absent, `mem:js` stays NO DATA and says so |
| A worker thread | None. The sim blocks the JS thread | None | Nothing to split. A slow sim shows as a stall, which is exactly what should be measured |
| `navigator.clipboard` | Absent; RN removed `Clipboard` from core | Available (needs a user gesture) | `Share.share` from `react-native` on Android; clipboard on web; selectable text always (§6) |
| Reading the recorder from Playwright | Not applicable | `globalThis.pomPerf` | Publish it on web only, for future browser scripts |
| A UI thread for animation | Reanimated's UI thread | Main thread | JS frame budgets from `requestAnimationFrame`; UI-thread frames from Reanimated `useFrameCallback` on the one screen that uses it (the bracket) |

---

## 2. Modules

Few files, each with one job. Everything under `src/diag/` is plain TypeScript with no React, so `scripts/` can import it.

```
src/diag/
  budgets.ts     the contract: BUDGETS, budgetSpec(), RUNTIME / BUILD / PLANNED
  perf.ts        the recorder: time, timeAsync, sample, measure, frame, stalls, report()
  log.ts         the rolling log: log.info/warn/error, setLogContext, persist, entries()
  env.ts         environment: platform, engine, device, window class, a11y settings, versions
  shape.ts       what this run and this data are made of: runShape(store), dataShape(db)
  checks.ts      the self-test and the checks: bench, fingerprint, invariants, data, backend
  report.ts      buildReport(), buildFullReport(): the Markdown
src/engine/
  invariants.ts  pure invariant checks shared by scripts/verify-*.ts and the in-app check
src/diag/golden.ts   generated: the engine fingerprint computed under Node
app/diagnostics/
  index.tsx      the screen
  log.tsx        the full log, filterable
  tools.tsx      the Quick Sim Tester, moved here (developer builds only)
```

**Why `invariants.ts` sits in the engine.** The Dugout's lesson in 2.8 and `records.ts` is that logic which decides what a page says belongs where a test can call it. The `verify-*` scripts already contain the invariants PoM trusts (possession sums to 100, a scorer was on the pitch, a red card ends a player's minutes). Moving the checks into one pure module means the script run in a terminal and the check run on a phone are the same code. A result that differs between them is then a fact about the device, not about two implementations.

---

## 3. The recorder

### 3.1 Same shape as The Dugout

- One `Float64Array(256)` ring per key, allocated on first use.
- `count`, `last`, `min`, `max`, `total`; p50 and p95 computed only when a report is built.
- `time(key, fn)`, `timeAsync(key, fn)`, `sample(key, ms)`, `mark(name)` + `measure(key, from, to?)`, `frame(key)` + `frameReset(key)`.
- Status: `UNMEASURED` if no samples; else judge p95 when `count ≥ 5`, `last` before that; FAIL above `hardFail`, WARN above `target`, else OK.
- Runtime budgets with no samples are listed as `UNMEASURED`. Build-time and planned budgets are excluded from that list.

### 3.2 Changes from The Dugout

1. **Frame keys are per scene** (`frame:deepMatch`, `frame:draw`, `frame:globe`) and `frame()` takes the key, so two animations can't write each other's intervals. `frameReset(key)` runs on unmount, or the first sample after a return would be the whole time away.
2. **`n` is honest when the ring wraps.** The report shows `256/1,204` rather than `1204` over percentiles of the last 256 (gap G3).
3. **Background time is excluded.** An `AppState` listener pauses `measure` spans that cross a trip to the background and discards them, because a timer that includes the phone sitting in a pocket isn't a performance number.
4. **Self-test samples live apart.** `bench:*` keys go into a separate map with the time the test ran, and the screen shows them in their own section (gap G7).
5. **Development builds are labelled.** `__DEV__` samples are real but not representative (Metro, no minification, dev warnings). Every report prints `build dev` or `build release` in the second line, and the screen shows a notice on dev builds. This is The Dugout's `vite dev` fault (01 §2.7), answered by labelling rather than hiding.

### 3.3 Stalls: RN's substitute for long tasks

A 250 ms `setTimeout` loop that measures how late each tick fires. Lateness over 50 ms means the JS thread was blocked for about that long.

- Records `stall:js` (the lateness) and a counter with the worst value.
- **Attribution:** each stall stores the current route (from expo-router's `usePathname`, written to a module variable by the root layout) and the most recent `time`/`timeAsync` key that was still open. So a report says `worst 840 ms on /game/result during stats:league`, not `self` (gap G6).
- Paused when the app is in the background. Cost: one timer callback four times a second.
- If the **probe** finds `PerformanceObserver` delivering `longtask` on Hermes, its entries are recorded as `stall:observed` alongside. Two sources are kept apart, not merged.

---

## 4. The log

### 4.1 Shape

`{ t, level, cat, msg, data?, ctx? }` in a ring of 300.

- **Levels:** `debug | info | warn | error`. `debug` is dropped unless diagnostics has been opened this session (the same switch The Dugout uses).
- **Categories:** `boot db sim stats deep ui save net auth`. They map onto the tags already in the code: `[result]`, `[cl-result]`, `[wc]`, `[stats]`, `[career]`, `[match-detail]`, `[saveRun]`, `[userStore]`, `[db]`, `[quick-sim]`.
- **Context stamp:** set by the simulation screens with `setLogContext`. It prints the way a football fan reads a fixture list: `[league MD12]`, `[ucl LP5]`, `[ucl QF L2]`, `[wc G3]`, `[wc R16]`, `[tester]`.

A line reads: `[wc R16] warn stats/pool load failed {"club":"Morocco"}`.

### 4.2 Replacing the console calls

About fifty `console.warn`/`console.error` calls exist in `app/` and `src/`. Each becomes `log.warn(cat, msg, data)`. The logger mirrors warnings and errors to the console in `__DEV__`, so a Metro session sees them as before. The six stray `console.log` calls named in the vibecode audit are deleted rather than converted.

### 4.3 Surviving a crash, for real

The Dugout claims this and doesn't do it (gap G1). PoM:

1. **Persist warnings and errors.** After a warn or error, a 2-second debounced write of the last 100 such entries to AsyncStorage under `pom.diag.log.v1`. Info and debug stay in memory.
2. **Catch fatal JS errors on Android.** `ErrorUtils.setGlobalHandler` wraps the existing handler: log the error with the route and context, write the persisted entries immediately, then call the original handler so the app still behaves as it does today.
3. **Catch errors on web.** `window.addEventListener('error')` and `('unhandledrejection')`, same steps.
4. **Catch render errors per route.** Export `ErrorBoundary` from `app/_layout.tsx` (expo-router supports this). It logs the error and shows a plain recovery screen with Try again and Diagnostics. That's the one place Diagnostics is offered to a user who didn't go looking.
5. **Show the previous session's problems.** On boot, entries from the persisted buffer that predate this session are marked `prev` and shown under "Last session" on the screen. A crash leaves its trail where the next launch can see it.

**Sign-out currently erases this.** `src/lib/auth.ts` calls `AsyncStorage.clear()` twice, which wipes every key in the app. The plan replaces those calls with removal of the auth-related keys only. Open decision D4.

---

## 5. Environment

What `env.ts` reports, and where it comes from.

| Field | Source | Example |
|---|---|---|
| App version | `Constants.expoConfig?.version` (replaces the hardcoded `1.0.0` on About) | `0.0.1` |
| Build kind | `__DEV__`, `Constants.executionEnvironment` | `release` / `dev` |
| DB version | `DB_VERSION` exported from `src/db/setup.ts`, plus the installed `pom.db.version` on Android | `13 (installed 13)` |
| Engine version | a new `ENGINE_VERSION` constant, bumped when seeded output is meant to change | `1` |
| Platform | `Platform.OS`, `Platform.Version` | `android 35` / `web` |
| Device | Android: `Platform.constants.Brand` and `Model`. Web: browser family parsed from `navigator.userAgent`, never the full string | `Google Pixel 7a` / `Chrome 140` |
| JS engine | `global.HermesInternal` present → Hermes; else from the user agent | `hermes` / `v8` |
| Cores, memory | Web only: `navigator.hardwareConcurrency`, `navigator.deviceMemory` | `8 cores · 8 GB` |
| Window | `useWindowDimensions`, `PixelRatio.get()`, size class from the style guide (Compact under 600, Medium to 1023, Expanded above) | `412×915 @2.6 · compact` |
| Font scale | `PixelRatio.getFontScale()` | `1.3` |
| Reduce motion | `AccessibilityInfo.isReduceMotionEnabled()` | `on` |
| Colour scheme | `Appearance.getColorScheme()` | `dark` |
| Session | minutes in the foreground since first paint | `41 min` |

Font scale, reduce motion and window class are there because the overhaul in [`../ui-overhaul/10-ADAPT-OPTIMIZE-A11Y.md`](../ui-overhaul/10-ADAPT-OPTIMIZE-A11Y.md) makes layout depend on them. A report that says "the verdict clips" is only useful if it also says the font scale was 1.3.

---

## 6. Sharing the report

Three routes, in order, and every one ends with something visible.

1. **Android:** `Share.share({ message: report })` opens the system share sheet. Paste targets (chat apps, notes, "Copy") are all there. No new dependency. The result line reads `Shared` or `Share cancelled`.
2. **Web:** `navigator.clipboard.writeText(report)` inside the button's press handler. The result reads `Copied` or `Couldn't copy. Select the report below.`
3. **Always:** the report is rendered as selectable monospace text (`<Text selectable>`) at the bottom of the screen, so nothing depends on 1 or 2 working.

`expo-clipboard` would give Android a one-tap copy. It's a new native dependency and needs a rebuild, so it's open decision D1, defaulting to no.

---

## 7. Access

| Way in | Where | Notes |
|---|---|---|
| **Eight taps on the version** | About (and the You screen once the overhaul lands) | Keeps the documented gesture from `CLAUDE.md`. The eighth tap opens Diagnostics and switches on debug logging. One tap will open the Changes screen once it exists |
| **A visible row** | You → "About this build" → `DIAGNOSTICS` | Always there, like The Dugout's Settings entry. Hiding a read-only screen protects nothing |
| **Ctrl+Shift+D** | Web, any screen | Registered in the root layout on web only |
| **Deep link** | `pom://diagnostics` | Works because the scheme `pom` is set in `app.json` |
| **Crash recovery screen** | The root `ErrorBoundary` | The one place it's offered unprompted |

### 7.1 The tester

The Quick Sim Tester moves from About to `app/diagnostics/tools.tsx`. A Tools row appears on the Diagnostics screen only when `__DEV__` is true or the build sets `EXPO_PUBLIC_DEV_TOOLS=1` (for EAS preview builds the maintainer installs). In a public release the row doesn't exist, which closes audit findings BLD-3/BLD-4 without taking the tester away from its user. `quickSim: true` still guarantees nothing is saved.

---

## 8. Rules

**Read-only.** Diagnostics never writes a run, a score, a career row or a leaderboard entry. The self-test simulates on synthetic teams that are never `isPlayer`, so the module-level difficulty tilt in `src/engine/match.ts` (`activeTilt`) can't touch the benchmark, and the benchmark can't touch a run in progress.

**Nothing personal.** No user id, email, username, run id, auth token or Supabase URL in the log, the screen or the report. Session kind is reported as `none`, `guest` or `account` and nothing more. Club, league and player names are fine; they're public football data.

**One key, one meaning.** A key is recorded from at most two call sites, and never by both the game and the self-test. Enforced by `scripts/verify-budgets.ts` ([`04-CHECKS.md`](04-CHECKS.md) §7).

**Cheap when nobody is looking.** Recording is a clock read and two array writes. Percentiles, strings and counts are built only while the screen is open. Shapes are computed once when the screen opens, not kept live.

**Honest about what it can't see.** An API that doesn't exist on this platform produces NO DATA with a reason (`not available on Hermes`), never a zero.
