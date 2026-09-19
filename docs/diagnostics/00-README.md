# Diagnostics: the plan

> Written 15 September 2026. Status of the set: **plan, not built.** No code has changed.
> Companion to the UI overhaul set in [`../ui-overhaul/00-README.md`](../ui-overhaul/00-README.md). The screen follows its Kit Drop style guide.

## What this is

The Dugout has a Diagnostics screen: every performance budget measured on the device you're holding, a rolling log of warnings and errors, a self-test, and a Markdown report that fits in a chat message. Perfection or Misery has nothing like it. Today, the only developer surface is the Quick Sim Tester behind eight taps on a hardcoded `1.0.0`, and about fifty `console.warn`/`console.error` calls that nobody sees on a phone.

This set documents how The Dugout's version works, file by file and fault by fault, and specifies a PoM version that goes further. It checks what only PoM can get wrong: whether a seeded match sheet comes out the same on Hermes as on V8, whether the bundled database is the one the build thinks it is, what a reload throws away, and whether this session's run was actually saved.

## The short version

| | The Dugout | PoM plan |
|---|---|---|
| Budgets | 26 keys, `target` + `hardFail`, scaled by world tier | 30 runtime, 3 planned, 4 build-time and 7 self-test keys. One key per operation per mode, so no scaling table is needed |
| Recorder | Ring buffer of 256 samples, p50/p95/max, `longtask` observer | Same recorder, plus a JS-thread stall detector (RN has no `longtask`) that names the route it happened on |
| Log | Ring of 500 in memory. The doc claims it survives a crash; the code never writes it | Ring of 300, warnings and errors persisted, fatal JS errors caught by a global handler and the router's `ErrorBoundary` |
| Self-test | Match, matchday, season and table benchmarks under `bench:*` | The same benchmarks, plus an engine fingerprint, a 200-match invariant run, a database check and a backend ping |
| "What it's made of" | 11 world counts | Run shape (matches, seeds, ties, payload bytes), data shape (DB counts, logo and flag coverage) |
| Reload check | Static script comparing worker `State` to the save | Static script comparing `gameStore` fields to what is persisted. Today that's nothing, and the screen says so |
| Report | Markdown under 4,000 chars, cut mid-line | Markdown under 4,000 chars, trimmed by section priority so the cut never lands in a table |
| Share | Clipboard only; failure is silent | Native share sheet (no new dependency), clipboard on web, selectable text as the fallback, and a visible result either way |
| Access | Settings row, Ctrl+Shift+D, five taps on the version | The existing eight-tap gesture, a row on the You screen, Ctrl+Shift+D on web, `pom://diagnostics` |

## Reading order

| # | Document | What it answers |
|---|---|---|
| 01 | [`01-DUGOUT-TEARDOWN.md`](01-DUGOUT-TEARDOWN.md) | How The Dugout's diagnostics actually work, the three silent failures they shipped with, and the gaps still in the code |
| 02 | [`02-POM-ARCHITECTURE.md`](02-POM-ARCHITECTURE.md) | What carries over to React Native and what doesn't, the modules, the routes, the access rules and the privacy rules |
| 03 | [`03-BUDGETS.md`](03-BUDGETS.md) | Every budget: key, target, hard fail, what it measures from and to, and the exact place in the code that records it |
| 04 | [`04-CHECKS.md`](04-CHECKS.md) | The self-test, the engine fingerprint, invariants, the data check, the reload audit, backend and save checks, and the `verify-*` scripts that keep the screen honest |
| 05 | [`05-SCREEN-AND-REPORT.md`](05-SCREEN-AND-REPORT.md) | The screen in Kit Drop: sections, wireframes for phone and wide web, every state, the copy, and the exact report format |
| 06 | [`06-IMPLEMENTATION.md`](06-IMPLEMENTATION.md) | Build order in five steps with acceptance checks, the full list of improvements over The Dugout, risks and open decisions |

## Five things found while researching

These are real findings, not proposals. Each is repeated where it belongs.

1. **`simulateMatch` uses `Math.random()`.** Only the layer on top of it is seeded: match detail, the Deep Match timeline, lineups. A determinism check can cover that layer and nothing else, and the docs say so rather than implying the whole run replays.
2. **`match-detail.ts` makes 15 calls to `Math.exp`/`log`/`pow`/`sqrt`/trig.** Those are the functions where JavaScript engines are allowed to differ in the last bit. A run played on Android and reopened on web could, in principle, show a different sheet. Nothing measures this today. The engine fingerprint in [`04-CHECKS.md`](04-CHECKS.md) §2 is built to catch it.
3. **Signing out calls `AsyncStorage.clear()`** (`src/lib/auth.ts` lines 83 and 103). That wipes every key in the app, not just the session. A persisted diagnostics log would vanish on sign-out, and so would anything else stored later.
4. **`app.json` lists `assets/db/players_v4.db`** inside a nested `expo.expo` block, while the app loads `players_v5.db` with `DB_VERSION = 13`. The nested block is almost certainly ignored. It's still a stale claim in the build config, and the data check reports both numbers side by side.
5. **Nothing in `gameStore` is persisted.** A reload or an app kill mid-run loses the run. `src/lib/mmkv.ts` is a stub marked "temporary". The reload audit makes this a visible line instead of a surprise.

## Decisions taken in this plan

- **Always available in release builds.** The numbers worth having come from the slow phone, not a dev machine. Diagnostics only reads; it never writes a run, a score or a career row.
- **The tester moves inside Diagnostics** as a Tools section. It shows only in development builds or when a build sets `EXPO_PUBLIC_DEV_TOOLS=1`. This settles the conflict between the audit ("gate it") and the maintainer's workflow ("I test on my own builds").
- **One key per operation.** The Dugout scaled a budget by world size. PoM has four competition shapes, and giving each its own key (`sim:league`, `sim:wc`) is simpler and more honest than a multiplier table.
- **A route, not a modal.** `app/diagnostics/` with sub-routes for the full log and the self-test results.
- **Nothing personal in any output.** No user id, email, username or run id. Club and player names are fine.

## Open decisions

| # | Decision | Default if nobody decides |
|---|---|---|
| D1 | Add `expo-clipboard` for a true copy on Android, or rely on the share sheet | Share sheet only; no new dependency |
| D2 | Add `expo-application` for the native build number in the report | No; report `app.json` version plus the EAS update or commit if available |
| D3 | Keep eight taps or move to five like The Dugout | Keep eight; it's in `CLAUDE.md` and in muscle memory |
| D4 | Persist the log across sign-out | Yes, by replacing `AsyncStorage.clear()` with removal of auth keys only |
| D5 | Keep a history of past reports on the device for trend lines | Not in the first build; `docs/PERF-LOG.md` covers trends by hand, as it does in The Dugout |
