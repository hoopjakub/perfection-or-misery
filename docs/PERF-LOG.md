# Performance log

One dated section per measuring session (Phase 9, [`diagnostics/06-IMPLEMENTATION.md`](diagnostics/06-IMPLEMENTATION.md) step 5). It's how slow drift gets caught: nothing regresses by more than 5% in a week, and three months later the app is twice as slow. The Dugout kept the same log for the same reason.

**What each section holds:** the date, the device, the build kind (dev numbers run slow: say which), the table from the Diagnostics report (or `scripts/perf-size.ts` for build sizes), and a paragraph on what the numbers say. A budget in [`src/diag/budgets.ts`](../src/diag/budgets.ts) only moves with a reading here beside it ([`diagnostics/03-BUDGETS.md`](diagnostics/03-BUDGETS.md) §7).

**How to add one:**
- From the phone: About → Diagnostics → Share report, paste it into a new section, and write what it says.
- Build sizes: `npx tsx scripts/perf-size.ts --web <export> [--apk <file>] --log` appends its own section; add the paragraph by hand.

## Waiting

- **A release build's report** from the maintainer's phone: the dev build's reading (7 Oct, below) answered the probes and found the leads; every provisional runtime target still waits on release numbers.
- **The live match line** (`sim/live … = clock … + beats … + stood still …`): no live match was watched on 7 Oct.
- **The APK's size**, from the first `eas build --local` (`--apk`).
- **What the first phone session should include**, so one report answers the open questions: a whole run with a live match watched start to finish (the `sim/live` line breaks its seconds down), tab switches mid-season (`ui:tab`), the About page with the globe turning, the draw's globe (`frame:globe`), the pundits' tournaments on a cup result (`pundits:build`), Runs and Ranks, then the self-test. Watch it live meanwhile with `adb logcat -s ReactNativeJS` (every line starts `POM`).

## 2026-10-07 · the first phone session (POCO X6 5G, a development build)

From the Diagnostics log the maintainer shared (212 lines, 14:46–14:57) and logcat. **A development build**: Metro, no minification, dev warnings, so every number here runs slower than a release build will. Judge the shape, not the decimals. Two World Cup results and a Europa League run were opened from history; no live match was watched, so the 24 s v 15 s line isn't in it yet.

| budget | target / fail | readings | status |
|---|---|---|---|
| `boot:interactive` | 1500 / 3000 | 1,346 | OK |
| `db:open` | 400 / 1200 | 164 | OK |
| `net:runs` | 1200 / 4000 | 125–336 | OK |
| `net:leaderboard` | 1200 / 4000 | 155–657 | OK |
| `screen:result` | 300 / 800 | 131–294 | OK |
| `ui:navigate` | 150 / 350 | 72–563 most; **778–1,631 into the run hub** | FAIL |
| `ui:tab` | 100 / 300 | 434–746; **Teams 1,791; Table 2,554 once; Stats 3,856 and 4,692** | FAIL |
| `stats:ucl` | 600 / 1800 | 1,656 | WARN |
| `stats:wc` | 400 / 1200 | 721–848 | WARN |
| `query:rosters` | 150 / 400 | 154–156 | WARN |
| `query:pool` | 250 / 700 | 136 | OK |
| `draft:spin` | 150 / 400 | 448 | FAIL |
| `stall:js` | 200 / 700 | 200–4,557; 4,557 and 3,775 on `/game/run` during the Stats tab | FAIL |

**The probes, answered.** Memory: read from `HermesInternal` (20 MB at start), so `mem:js` works on the phone. Long tasks: no "long tasks observed" line, so Hermes doesn't deliver them; the stall detector is the only source, as planned. Both go into [`diagnostics/02-POM-ARCHITECTURE.md`](diagnostics/02-POM-ARCHITECTURE.md) §1.

**What it says.** One thing dominates: **the run hub's Stats tab freezes the phone for four to five seconds** every time it opens, and the hub itself takes up to 1.6 s to open. Everything else is a step down from that: a cup run's stats pass (1.7 s), the Teams tab (1.8 s), and a spin just over its fail line. Boot, the database, the network and the result screen are inside their budgets. **The heap climbs from 20 MB to 104 MB over ten minutes and doesn't come down**, rising each time the hub's tabs mount: caches (the roster cache, the run data) or a leak; a release build decides which. All of it is Phase 9.75's first work (P9.75-11 to -15). No budget moves yet: these are dev-build numbers.

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

## 8 October 2026 · first release build (preview-personal, POCO X6, Hermes)

After Phase 9.75 steps 1–9. Full table and reading in [`audit-9.75/08-PHONE-SESSION-2.md`](audit-9.75/08-PHONE-SESSION-2.md) §3.

| Key | p50 | p95 | n | Budget |
|---|---:|---:|---:|---|
| ui:navigate | 122 | 610 | 52 | 150 / 350 |
| ui:tab (Stats) | 381–949 | | 4 | 100 / 300 |
| stats:board | 179–776 | | 3 | 20 / 80 |
| hub:teams | 668–900 | | 2 | 100 / 300 |
| stats:league | 1,766 | 1,957 | 4 | 700 / 2,000 |
| stats:ucl | 1,703 | 2,306 | 3 | 600 / 1,800 |
| stats:wc | 605–801 | | 4 | 400 / 1,200 |
| stall:js | 87.6 | 408 | 69 | 200 / 700 |
| mem:js | 56 MB | 80 MB | 48 | 250 / 400 |
| boot:interactive | 156–237 | | 2 | 1,500 / 3,000 |
| draft:spin | 145–243 | | 30+ | 150 / 400 |

Drop caches (5 saved runs, 174 squads): heap 56 MB → 56 MB five seconds later. Self-test: fingerprint SHOWN DIFFERS (seed 1, home.yellowCards 2 ≠ 0), bench stats 2,147 ms.
