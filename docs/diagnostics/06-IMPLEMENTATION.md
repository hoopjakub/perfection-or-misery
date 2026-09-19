# 06 · Implementation order, improvements over The Dugout, and risks

> Part of the diagnostics set. Start at [`00-README.md`](00-README.md).
> Status: **plan.** Each step leaves the app shippable, `tsc` clean and every `verify-*` script green. Per the maintainer's standing rule, the builder typechecks and runs the scripts; the maintainer tests the screen on a device.

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

### Step 5 · Tester move and the first real reading

**Build**
- Move the Quick Sim Tester to `app/diagnostics/tools.tsx`, visible when `__DEV__` or `EXPO_PUBLIC_DEV_TOOLS=1`; the release redirect.
- `scripts/perf-size.ts`.
- Create `docs/PERF-LOG.md` with the format from The Dugout: dated sections, device, build kind, the report's table, and a paragraph on what the numbers mean.

**Done when**
- A release build shows no Tools row, and `pom://diagnostics/tools` lands on `/diagnostics`.
- The maintainer's first report from a real Android phone is in `PERF-LOG.md`, and every provisional target in [`03`](03-BUDGETS.md) either stays with a reading beside it or moves with a reason.

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
