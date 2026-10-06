# 06 · Implementation order, improvements over The Dugout, and risks

> Part of the diagnostics set. Start at [`00-README.md`](00-README.md).
> Status: **as built, steps 1 to 5 (5–6 October 2026)**, except step 5's last done-when: the first reading from the maintainer's phone. Each step leaves the app shippable, `tsc` clean and every `verify-*` script green. Per the maintainer's standing rule, the builder typechecks and runs the scripts; the maintainer tests the screen on a device.

---

## 1. Build order

Five steps. The order puts the scripts before the screen, because The Dugout's screen was wrong for months before a script caught it.

### Step 1 · Contract, recorder, log (no UI)

**Build**
- `src/diag/budgets.ts`, `perf.ts`, `log.ts`, `env.ts` as specified in [`02`](02-POM-ARCHITECTURE.md) and [`03`](03-BUDGETS.md).
- Replace the ~50 `console.warn`/`console.error` calls with `log.warn`/`log.error`; delete the six stray `console.log` calls.
- Global handlers (`ErrorUtils`, `window` error and rejection), persisted warnings and errors, root `ErrorBoundary` with Try again.
- Replace `AsyncStorage.clear()` in `src/lib/auth.ts` with removal of auth keys only (decision D4).
- `scripts/verify-budgets.ts` and `scripts/verify-diag.ts`.

**Done when**
- `verify-budgets` passes with the NO DATA rule off (nothing is instrumented yet) and fails if the rule is switched on. That proves the check can fail.
- `verify-diag` passes, and fails if a `console.log` is added to `app/`.
- A thrown error inside a screen shows the recovery screen instead of a red box or a blank page.

*(Done 5 October 2026, Phase 9's first step.*
- *`src/diag/budgets.ts` (44 budgets then; 45 after step 2: 30 runtime, 3 planned, 4 build-time, 7 self-test, as 03 §6), `perf.ts` (the recorder; `pomPerf.readings()` in a web console), `log.ts` and `install.ts`.*
- *The log: a ring of 300 in categories `boot db sim stats deep ui save net auth app`, plus **`run` and `screen`** for the maintainer's 1 October ask (RUN STARTED / RUN ENDED, a screen opened, drawn, left; written from step 2). Errors and Supabase answers are cut to one short line, and only a Supabase error's code, status and message are written, nothing else on it.*
- *Changed from the plan: **warnings and errors are kept in MMKV, not AsyncStorage**, through `settingsStorage` (`src/lib/mmkv.ts`). MMKV writes synchronously, so the line written as a fatal error ends the session lands; AsyncStorage's write might not finish. They're also kept in their own list of 100, apart from the ring, because a check showed a burst of info lines could push a warning out of the ring before its debounced write. Once read back at start-up (marked `prev`), the stored copy is cleared, so a quiet session doesn't show the same old trouble again.*
- *All 89 `console.warn`/`console.error` calls and the three `console.log` lines are on the log; the live match's timing line (`[live] … s, … ms a minute`) is now kept in every build, not only development, since Phase 9 asks about it.*
- *`ErrorUtils` and the web's `error`/`unhandledrejection` are caught, logged and written at once; the root layout exports `ErrorBoundary`, a plain recovery screen (Try again, Back to Play) in both languages. Diagnostics joins it in step 4.*
- *D4 taken on its default: sign-out removes only Supabase's `sb-…` keys. **This was a live bug on the web:** AsyncStorage there is the same localStorage MMKV's web build uses, so signing out also wiped the settings, the offline run queue, the run keeper and now the log.*
- *Left for its consumer: `env.ts` is step 4's (the screen and the report are the only things that read it).*
- *Checks: `verify-budgets` (passes with the rule off, 30 failures with it on) and `verify-diag` (no console call outside the log, no storage wipe, the database files exist, club_facts parses, and the log's ring, debug switch, short errors and device copy; seen failing with a `console.log` in `app/`). Checklist P9-1 to P9-3.)*

### Step 2 · Instrumentation

**Build**
- Every `time`/`sample`/`measure`/`frame` call from [`03`](03-BUDGETS.md) §2, at the sites named there.
- The `runStatsFor(store)` helper so `stats:ucl` records from two sites, not three.
- The stall detector with route and open-key attribution; `AppState` pausing.
- Probes for `PerformanceObserver('longtask')` and `HermesInternal.getInstrumentedStats()` on a release Android build. The results are written into [`02`](02-POM-ARCHITECTURE.md) §1 in place of the word **probe**.
- The save ledger ([`04`](04-CHECKS.md) §6) written by the four save functions and `mergeCareerFromRun`.
- `setLogContext` calls in the simulation screens.

**Done when**
- `verify-budgets` passes with the NO DATA rule on: every runtime budget has a recording site.
- No key has more than two sites.
- `globalThis.pomPerf.report()` in a web console after one quick-sim run shows real numbers for boot, sim, stats and detail keys.

*(Done 5 October 2026.*
- *Every runtime budget has a recording site, and `verify-budgets` now requires it (`REQUIRE_RECORDED` on; seen failing with `placement:build` removed). No key has more than two. The simulation keys were re-cut to today's screens (03 §2.3, *As built*): 31 runtime keys, not 30.*
- *The recorder grew `timeToFrame` (work timed to the first frame after it, for everything a player waits to see), `measure(key, from, withinMs)` with the mark used up, and background time dropped: a span that crosses a trip to the background isn't kept.*
- *Engine and query sites are wrapped once at the definition (`query:pool`, `detail:generate`, the three `stats:*`, `sim:knockouts`, `save:run` at `sendPayload`, `save:career`, `net:*`), so their callers can't drift. `runStatsFor(store)` wasn't needed: the stats are now computed in `runData.ts` only, and recorded inside the functions.*
- *`ui:navigate` runs from the nav guard's wrapped `router` calls (every push, replace and back, not only `PressCard`) to the new screen's first frame, if within 2 s. `boot:interactive` from the root layout's module to Home's first frame.*
- *Frames, `src/diag/frames.ts`: a JS-thread sampler for the Deep Match's live phase and the ceremony, and a UI-thread one (`useFrameCallback`, sent across every 30 frames) for the globes, which run on the UI thread since P8-164, and the bracket, sampled only while a finger is down.*
- *`src/diag/watch.ts`: the stall detector (250 ms tick, over 50 ms late is a stall, pinned to the screen and the timed work still open; over 200 ms gets a log line), `mem:js` every 10 s, paused in the background, and the long-task probe.*
- ***The probes aren't answered yet.** They need a release build on the phone. Each one says in the log which source answered: "memory read from HermesInternal" or "no memory reading on this engine", and "long tasks observed" if the feed exists. The maintainer's first log answers 02 §1.*
- *The maintainer's log categories: `RUN STARTED <tag> · mode · difficulty · formation` and `RUN ENDED <tag> · finished/abandoned after N s` (`runStarted` in `startRun`, `runEnded` on the result and on abandon); `screen /path drawn in N ms` on every screen change; matchday stamps (`league MD12`, `ucl LP5`, `wc G2`) from the timed wrappers. The tag is four random characters made on the phone, not the saved run's id.*
- *The save ledger (04 §6): `saveLedger` in `log.ts`, written from `useRunSave`'s status, the career merge and the schema retry.*
- *Not done: a context stamp for knockout rounds (`ucl QF L2`): `KnockoutStage` reveals rounds already simulated, so there's no per-round work to stamp; it goes in with the screen if it turns out to be missed. Checklist P9-4 to P9-6.)*

### Step 3 · Checks

**Build**
- Move the per-match invariants out of `verify-match-detail.ts` and `verify-deep-match.ts` into `src/engine/invariants.ts`; the scripts call them. Add `--seed` to both scripts.
- `src/diag/checks.ts`: benchmarks, fingerprint builder, invariant run, data check, backend ping, all yielding between steps.
- `scripts/diag-golden.ts` to generate `src/diag/golden.ts`; `scripts/verify-diag-golden.ts`.
- Export `ENGINE_VERSION` next to `DB_VERSION`.
- `src/diag/shape.ts` (run, session, data, storage).
- `scripts/verify-reload.ts`, reporting only.

**Done when**
- Both existing verify scripts still pass with the same number of checks, now calling the shared invariants.
- Changing one constant in `match-detail.ts` makes `verify-diag-golden` fail with the first differing field named.
- The self-test, run from a web console (`await runSelfTest()`), completes with the network off and reports `offline`, not an error.

*(Done 5 October 2026.*
- *`src/engine/invariants.ts`: `checkMatchDetail` and `checkTimeline`, every per-match rule of `verify-match-detail` and `verify-deep-match`, which now call them and keep only their aggregate checks. **Coverage didn't move:** on `--seed 1` the scripts ran 3,841,896 and 2,645,369 checks before the move and the same after (each script now prints its count). Seen failing with the possession rule broken.*
- *`--seed N` on both scripts swaps `Math.random` for a seeded generator, since `simulateMatch` and `randomSeed` both draw from it, so a whole run replays; without it the seed comes from the clock and is printed.*
- *`ENGINE_VERSION` is in `src/engine/version.ts` (pure, so Node can read it), not beside `DB_VERSION` in `setup.ts`, which imports native modules. `DB_VERSION` is exported for the data check.*
- *`src/diag/fingerprint.ts` (pure): 50 synthetic matches made wholly from their seed (squads, score, scorers: no database, so a data rebuild never moves it), the sheet and the Deep Match frames hashed raw and as shown, FNV-1a, compared as MATCH, RAW DIFFERS, SHOWN DIFFERS or STALE. `scripts/diag-golden.ts` writes `src/diag/golden.ts` (78 KB with seeds 1 to 3's whole sheets). `scripts/verify-diag-golden.ts` fails on any difference: seen failing with `INJURY_PER_SIDE_PER_MATCH` nudged from 0.145 to 0.16 (seed 19, SHOWN DIFFERS). A field is named only for seeds 1 to 3, the sheets the file keeps; naming it for all 50 would put the file in the hundreds of KB. A nudge to `MISS_SHARE` moved none of the 50 matches, which says the 50 cover common paths better than rare ones.*
- *`src/diag/checks.ts`: `runSelfTest(onStep, stop)` runs the five steps, yielding every 100 iterations, inside `selfTestScope`: while it runs only `bench:*` is recorded and the stall detector ignores itself. The invariant step uses the same synthetic matches as the fingerprint from a clock seed, so a violation on a phone replays anywhere: `npx tsx scripts/verify-diag-golden.ts --replay <seed>`. On the web `await runSelfTest()` works from the console now (loaded on first use).*
- *Data check: bundled, installed (Android's version file) and `_meta` versions, `PRAGMA quick_check`, table counts, club facts. Logo and flag coverage are left for the screen: the crest decision now runs through `brand.ts` by build flavour, so "clubs with no crest" needs that rule, not a map count.*
- *`src/diag/shape.ts`: the run (matches, seeds, fallback seeds, named scorers, extra time, shootouts, the result's size), the session kind, storage (key names masked, values never shown). **Changed from 04 §5.2:** the run isn't all lost on a reload any more. The run keeper (P8-149) keeps the draft to kick-off, so the line says that.*
- *`scripts/verify-reload.ts`, reporting: GameStore has 34 fields, 13 kept to kick-off by the run keeper, 21 lost on a reload (the season and its result among them).*
- *Checklist P9-7 and P9-8.)*

### Step 4 · The screen and the report

**Build**
- `src/diag/report.ts` and `scripts/verify-report.ts`.
- `app/diagnostics/index.tsx` and `app/diagnostics/log.tsx` per [`05`](05-SCREEN-AND-REPORT.md).
- Access: the eight-tap gesture now opens `/diagnostics` (and turns on debug logging); a row on About (moving to You with the overhaul); `Ctrl+Shift+D` on web; the version reads from `Constants.expoConfig.version` instead of a hardcoded `1.0.0`.
- Share: `Share.share` on Android, clipboard on web, selectable text always.

**Done when**
- `verify-report` passes: worst-case report under 4,000 characters, sections dropped whole, no personal data patterns.
- Every state in [`05`](05-SCREEN-AND-REPORT.md) §3.2 is reachable (listed for the maintainer's device test, not tested by the builder).
- `CLAUDE.md` and the `pom-dev` skill's "Browser walkthrough" section are updated to the new tester location.

*(Done 6 October 2026.*
- *`src/diag/env.ts` (moved here from step 1, its first reader), `src/diag/report.ts` (`budgetRows` worst first, `buildReport` cut by whole sections in six steps down to "payloads", `buildFullLog` for the log screen), `scripts/verify-report.ts`: the worst case (every budget failing three times over, 300 long log lines, every check failed) is 3,891 characters; a quiet report isn't trimmed; the table starts with a FAIL; a failed check keeps its seed.*
- ***Rule 9 is enforced in the report, not only checked:** `scrub` blanks anything shaped like an email, a UUID, a JWT or the backend's address in every printed log line, since a server's error can carry an id. The check found a real fault on its first run: the UUID and token patterns had been written with a backspace character in place of `\b` (a quoting slip in the edit), so they matched nothing. Fixed; no other file in the repo has one. Seen failing with the scrub switched off.*
- *`app/diagnostics/index.tsx`: actions (share or copy, the self-test with Cancel, refresh), summary and worst row, environment, checks with the time they ran, this run (shape, the save ledger, what a reload keeps), storage, budgets in seven groups that open themselves only on a WARN or FAIL, stalls, problems and last session, measured-with-no-budget, the selectable report. On a wide window the first half is a 420-point left pane (`Panes`). Web keys S, C, R and L. `app/diagnostics/log.tsx`: the ring newest first in a `FlatList`, level and category chips, search, a tap opens a line's payload, share the whole log.*
- *Status tags reuse `Tag`: OK outlined, WARN ink, FAIL misery red (the kit's "out" since P8-111, not the stripe 05 §1 names), NO DATA faded. **No haptic on share**, against 05 §3.1: the app never adds haptics.*
- *Ways in: the eighth tap on "Made in Slovakia" opens Diagnostics in every build and turns on debug lines (a development build still shows the tester on About until step 5); a Diagnostics row under Version on About, always there; Ctrl+Shift+D from any screen on the web; `pom://diagnostics` works as a route; the crash screen offers it. About's version already came from `Constants` (P8-73).*
- *Strings: the screen's chrome is in both languages (`diag.*`); budget labels and status words stay English, as they are in the report the maintainer reads. `verify-i18n` treats DATA as a code word for NO DATA.*
- *`CLAUDE.md` and the `pom-dev` skill: the walkthrough's door, and a Diagnostics section (log not console, budgets, the shared match rules and `--seed`, `ENGINE_VERSION` and the golden file).*
- *Checklist P9-9 to P9-12.)*

### Step 5 · Tester move and the first real reading

**Build**
- Move the Quick Sim Tester to `app/diagnostics/tools.tsx`, visible when `__DEV__` or `EXPO_PUBLIC_DEV_TOOLS=1`; the release redirect.
- `scripts/perf-size.ts`.
- Create `docs/PERF-LOG.md` with the format from The Dugout: dated sections, device, build kind, the report's table, and a paragraph on what the numbers mean.

**Done when**
- A release build shows no Tools row, and `pom://diagnostics/tools` lands on `/diagnostics`.
- The maintainer's first report from a real Android phone is in `PERF-LOG.md`, and every provisional target in [`03`](03-BUDGETS.md) either stays with a reading beside it or moves with a reason.

*(Built 6 October 2026; the phone reading waits for the maintainer.*
- *`app/diagnostics/tools.tsx`: the Quick Sim Tester, moved off About. Shown as a Tools row on Diagnostics only when `__DEV__` or `EXPO_PUBLIC_DEV_TOOLS=1`; in any other build the route is a `<Redirect>` to `/diagnostics`, so `pom://diagnostics/tools` lands there. About keeps only the door (eight taps) and the Diagnostics row.*
- *`scripts/perf-size.ts`: the database (both flavours), assets as the web ships them (the export's own `assets/`, or `assets/` less the personal database, labelled an estimate), the web entry bundle gzipped (`--web`), the APK (`--apk`); `--log` appends to `docs/PERF-LOG.md`. A budget with no input says why instead of passing.*
- *`docs/PERF-LOG.md`, with its first section: the web build as Vercel makes it. Database 12.8 MB (WARN, both flavours), assets 20.0 MB (OK, on the target), entry bundle 1,357 KB gzipped (OK). The self-test and its golden file are their own chunk, out of the entry bundle.*
- ***A leak found on the way, and fixed.** It was the first export the legal-bundle check ever read, and it failed: two real club names and a player's name in the public web bundle, from the self-test's chunk (step 3). `checks.ts` imported the club facts directly; the legal build swaps them only when imported through `clubFacts.ts` (`metro.config.js`). Now it reads `clubFactCount()` through that file, the check passes, and `verify-diag` fails on any direct import of the five swapped modules (seen failing).*
- *Checklist P9-13 and P9-14.)*

---

## 2. Improvements over The Dugout

Grouped by what they buy. Each points to where it's specified.

### Honesty

| # | Improvement | Where |
|---|---|---|
| I1 | A log that actually survives a crash, with global handlers and a Last session section | 02 §4.3 |
| I2 | `n` shown as `256/1,204` when the ring wraps, so the count matches the percentiles | 02 §3.2 |
| I3 | Background time excluded from spans | 02 §3.2 |
| I4 | Dev builds labelled in the report and on screen, instead of a permanent meaningless FAIL | 02 §3.2 |
| I5 | `n/a` with a reason for platform-only budgets, separate from NO DATA | 03 §1, 05 §1 |
| I6 | `network: true` budgets labelled as depending on the connection | 03 §1 |
| I7 | Self-test results in their own section with the time they ran | 02 §3.2 |
| I8 | A save row that tells the truth about whether this run was saved | 04 §6 |
| I9 | A plain line saying the run lives in memory only | 04 §5.2 |

### Correctness checks The Dugout doesn't have

| # | Improvement | Where |
|---|---|---|
| I10 | Engine fingerprint across Hermes and V8, with raw vs shown results | 04 §2 |
| I11 | `ENGINE_VERSION` and a golden file, so changing seeded output is a decision | 04 §2.5 |
| I12 | Invariants run on the device from the same code as the scripts, with a replayable seed | 04 §3 |
| I13 | Database version, `_meta` agreement and `quick_check` | 04 §4 |
| I14 | Crest, flag and club-facts coverage | 04 §4 |
| I15 | Fallback-seed count, which catches matches whose sheets collide | 04 §5.1 |
| I16 | Schema-retry count from `saveRun` | 04 §6 |
| I17 | A report verifier that checks length, order, cut and personal-data patterns | 04 §7 |

### Usefulness

| # | Improvement | Where |
|---|---|---|
| I18 | Stalls attributed to a route and an open operation, not `"self"` | 02 §3.3 |
| I19 | Log lines stamped in football terms (`[ucl QF L2]`) | 02 §4.1 |
| I20 | Environment includes font scale, reduce motion and window class | 02 §5 |
| I21 | Report sorted worst first | 05 §6.2 |
| I22 | Report trimmed by section, never mid-line | 05 §6.3 |
| I23 | Share sheet on Android, and a visible result on every share path | 02 §6 |
| I24 | Budget groups that open themselves when something inside isn't OK | 05 §2.1 |
| I25 | A crash recovery screen that offers Diagnostics | 02 §4.3 |
| I26 | A two-pane wide-web layout and keyboard shortcuts | 05 §2.2 |
| I27 | Frame keys per scene, including the UI thread for the bracket | 03 §2.5 |
| I28 | The tester relocated under Diagnostics and gated for public builds | 02 §7.1 |

---

## 3. What was left out, and when to add it

| Left out | Why | Add when |
|---|---|---|
| Live overlay (The Dugout's §5.4, which it never built) | The Deep Match is the only long animated scene, and one reading there is enough to start | a frame budget sits in WARN and the cause isn't obvious from the report |
| Report history on the device | `PERF-LOG.md` by hand is how The Dugout caught its slow drifts, and it works | decision D5 |
| Remote crash reporting (Sentry and similar) | A new service, a privacy policy line, and a dependency, for an app that isn't public yet | the public release in the overhaul roadmap |
| Native startup time before JS | Not visible from JS without a native module | a store listing makes cold start matter |
| Playwright perf scripts on web | `globalThis.pomPerf` makes them possible later without changing the app | web becomes a shipped target with its own domain |

---

## 4. Risks

| Risk | Likelihood | What happens | Mitigation |
|---|---|---|---|
| The stall detector's own timer shows up as work | low | a few stalls attributed to nothing | the timer does one subtraction; the report prints `stall detector 4 Hz` so it's accounted for |
| Hermes and V8 do differ, and `SHOWN DIFFERS` appears | medium | a real product decision: old runs look different across devices | the check reports it first. The fix (rounding intermediate values in `match-detail.ts`, then a new `ENGINE_VERSION`) is a separate task with its own verify run |
| Instrumentation changes behaviour | low | a timing wrapper swallows an error or reorders an await | `time`/`timeAsync` rethrow in `finally`, as in The Dugout; step 2 reruns every verify script |
| Persisting the log adds writes | low | AsyncStorage churn on a noisy session | warnings and errors only, debounced, capped at 100 |
| The golden file goes stale silently | medium | `STALE` on every device | `verify-diag-golden` fails in the same commit that changes seeded output |
| The invariants move breaks the existing scripts | medium | lost coverage | step 3's acceptance: both scripts pass with an unchanged check count |
| NO DATA rows get ignored | medium | the Dugout's original fault, reversed | `platforms`, `planned` and `buildTime` keep NO DATA meaning "should have been measured" |

---

## 5. Documents to update when this is built

- `docs/PROJECT_STATE.md` §5 (a Diagnostics bullet) and §8 (pointer to this set).
- `CLAUDE.md` and `.claude/skills/pom-dev/SKILL.md`: the tester's new home, the `--seed` flags, `verify-budgets`, `verify-report`, `verify-diag-golden`.
- `docs/ui-overhaul/07a-SCREENS-SHELL.md` (About and You: the diagnostics row) and `08-COMPONENTS.md` (status tags reuse the existing Tag variants).
- `docs/ui-overhaul/11-ROADMAP.md` Phase 0: the tester-gating item points here.
- Each section of this set changes its status line from **plan** to **as built**, with anything that changed during the build written in place.
