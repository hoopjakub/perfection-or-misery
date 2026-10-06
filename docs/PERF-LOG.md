# Performance log

One dated section per measuring session (Phase 9, [`diagnostics/06-IMPLEMENTATION.md`](diagnostics/06-IMPLEMENTATION.md) step 5). It's how slow drift gets caught: nothing regresses by more than 5% in a week, and three months later the app is twice as slow. The Dugout kept the same log for the same reason.

**What each section holds:** the date, the device, the build kind (dev numbers run slow: say which), the table from the Diagnostics report (or `scripts/perf-size.ts` for build sizes), and a paragraph on what the numbers say. A budget in [`src/diag/budgets.ts`](../src/diag/budgets.ts) only moves with a reading here beside it ([`diagnostics/03-BUDGETS.md`](diagnostics/03-BUDGETS.md) §7).

**How to add one:**
- From the phone: About → Diagnostics → Share report, paste it into a new section, and write what it says.
- Build sizes: `npx tsx scripts/perf-size.ts --web <export> [--apk <file>] --log` appends its own section; add the paragraph by hand.

## Waiting

- **The first report from the maintainer's phone** (POCO X6 5G, a release build), which every provisional runtime target in 03 waits on. It also answers the probes: where memory is read from on Hermes, and whether long tasks are observed (checklist P9-6).
- **The APK's size**, from the first `eas build --local` (`--apk`).
- **What the first phone session should include**, so one report answers the open questions: a whole run with a live match watched start to finish (the `sim/live` line breaks its seconds down), tab switches mid-season (`ui:tab`), the About page with the globe turning, the draw's globe (`frame:globe`), the pundits' tournaments on a cup result (`pundits:build`), Runs and Ranks, then the self-test. Watch it live meanwhile with `adb logcat -s ReactNativeJS` (every line starts `POM`).

## 2026-10-06 · build sizes, the web build as Vercel makes it

`EXPO_PUBLIC_BRAND_MODE=original npx expo export --platform web --clear`, then `npx tsx scripts/perf-size.ts --web <export>`.

| budget | target / fail | reading | status | what |
|---|---|---|---|---|
| `size:db` | 12 / 16 MB | 12.8 | WARN | assets/db/players_v5.db |
| `size:db` | 12 / 16 MB | 12.8 | WARN | assets/db/players_legal.db |
| `size:assets` | 20 / 30 MB | 20.0 | OK | the export's assets/ |
| `size:webJs` | 1500 / 2500 KB | 1357 | OK | the entry bundle, gzipped |
| `size:apk` | 60 / 90 MB | — | NO DATA | not built yet |

**What it says.** Both databases are 0.8 MB over the 12 MB target, which was set before the open-data rebuild (P8.5-32) and before `clubStrength` was written into it; the target stands until a phone reading says the copy or the download hurts (`db:install`, `db:fetch`). The web ships 20.0 MB of assets, right on its target, most of it the database. The entry bundle is 1,357 KB gzipped, inside its target with 143 KB to spare: the self-test and its golden fingerprint load as their own chunk on first use, so they're not in it.

**Found on the way.** This export was the first time the legal bundle check had a web build to read, and it failed: two real club names and a player's name in the public bundle, from the self-test's chunk. `checks.ts` had imported the club facts directly, and the legal build only swaps them for an empty twin when they're imported through `clubFacts.ts`. Fixed the same day, and `verify-diag` now fails on any direct import of the five swapped modules. A local export without `EXPO_PUBLIC_BRAND_MODE=original` is the personal build (the repo's `.env` sets it), so it's the wrong one to weigh or to check for names.
