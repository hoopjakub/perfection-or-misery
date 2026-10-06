# Wave G: the audit proper

> Written 2 October 2026. Status of the set: **plan.** No app code changed to make it. It closes Phase 8.5's Wave G ([`../ui-overhaul/11-ROADMAP.md`](../ui-overhaul/11-ROADMAP.md), "The audit proper") and opens phase two and Wave F.
> Companion sets updated alongside: [`../centralisation/11-RE-AUDIT-2.md`](../centralisation/11-RE-AUDIT-2.md) and [`../centralisation/12-PHASE-TWO-FINAL.md`](../centralisation/12-PHASE-TWO-FINAL.md).

## What this is

The last thing before Phase 9, in the maintainer's words: an audit of the whole app, engine to UI, through three lenses (design choices, centralisation, fresh ideas), then a critique of everything found, then a second look at each criticism to keep only the ones worth acting on. His examples set the bar: *a player scores a hat-trick yet loses and doesn't even get an 8.5*; *does your team's strength match what you built*; *is it fun to play?*

It measured first, as the roadmap asked. The web's field data came back empty, so the measuring moved into the engine and the build: 8,000 synthetic matches for the ratings, all 1,630 club-seasons for strength, the exported web build for size and caching. Every finding has its evidence beside it; what couldn't be measured says so.

## The short version

| Area | Headline | Where |
|---|---|---|
| Measuring | Vercel stored **0** page views (30 days) and **0** vitals (7 days); scripts are served, so either nobody visited production or events don't arrive. A two-minute probe settles it | [`01`](01-MEASURED.md) §1 |
| Ratings | Hat-tricks are fixed (always 10). A **brace in a defeat** has median **7.7** and is man of the match 17% of the time; the losing side gets MOTM in **1.4%** of matches | [`02`](02-LOGIC.md) G-L1 |
| Strength | Your XI and the clubs are rated on **different scales**: draft a club's own best XI and you're **3.7 below** it at the top, **up to 6.1 above** it at the bottom. 3.7 is about **10 points of win chance**. Placement compares across the two scales too | [`02`](02-LOGIC.md) G-L3 |
| Docs vs engine | The guide says Medium is "played straight"; it tilts **−1.5** against you | [`02`](02-LOGIC.md) G-L4 |
| Trust | The server scores runs, but from facts the client claims; results use `Math.random()` and can't be replayed or checked | [`02`](02-LOGIC.md) G-L5, [`03`](03-SECURITY.md) S-2 |
| Web cost | **~6 MB** before the first spin (1.4 MB JS gzip + 4.5 MB database + 0.6 MB wasm); the content-hashed database served `max-age=0` (the JS was already cached) | [`04`](04-PERFORMANCE.md) |
| Interface | **22 → 30/40** since September. Held back most by the result screens (13–20 blocks each, Play again at the very bottom) and the full path's missing abandon | [`05`](05-UI-RESCORE.md) |
| Centralisation | 90 items: **16 closed, 21 partly, 42 open, 5 worse**. The speed table now exists three times with three different values | [`../centralisation/11-RE-AUDIT-2.md`](../centralisation/11-RE-AUDIT-2.md) |
| Wave F | One short result screen for every mode: verdict, actions, three highlights, doors into the run hub. Four files become one | [`08`](08-RESULT-PAGES.md) |

## Reading order

| # | Document | What it answers |
|---|---|---|
| 01 | [`01-MEASURED.md`](01-MEASURED.md) | What was measured (web field data, the build, the engine) and what couldn't be |
| 02 | [`02-LOGIC.md`](02-LOGIC.md) | Do ratings say what happened; is your team as strong as you built it; what the verifiers miss |
| 03 | [`03-SECURITY.md`](03-SECURITY.md) | What a cheater or a stranger can do; the September blockers' status |
| 04 | [`04-PERFORMANCE.md`](04-PERFORMANCE.md) | What the web build costs; what Phase 9 adds |
| 05 | [`05-UI-RESCORE.md`](05-UI-RESCORE.md) | The September critique re-scored, with evidence per heuristic |
| 06 | [`06-CRITIQUE-CHECKED.md`](06-CRITIQUE-CHECKED.md) | Part two: every criticism, then checked: keep, keep later, or drop. Is it fun |
| 07 | [`07-FRESH-IDEAS.md`](07-FRESH-IDEAS.md) | What to lean into: the daily draft, the one that got away, rivals |
| 08 | [`08-RESULT-PAGES.md`](08-RESULT-PAGES.md) | Wave F: the result screen, specified, with wireframes and done-whens |
| 09 | [`09-ROADMAP.md`](09-ROADMAP.md) | One order from here to Phase 9, and the risks |
| 10 | [`10-DAILY-CHALLENGES.md`](10-DAILY-CHALLENGES.md) | Daily challenges with a random restriction, the catalogue of past ones, feats and tags, the SQL (added 2 Oct, the maintainer's brief) |
| 11 | [`11-DIFFICULTY.md`](11-DIFFICULTY.md) | Difficulty without rigging the engine: Option A chosen 3 Oct (what you're dealt, honest matches), tags and the stamp, custom on the same levers |

## Findings worth knowing up front

1. **The two things the maintainer asked about are both measurably off**, and no verifier would have noticed either (02 §6). The fix order puts a failing check in first.
2. **The result screens are the interface's biggest problem and the codebase's biggest pile of duplication at once.** Wave F and phase two's step 6 are one job.
3. **The cheapest big improvement is moving Play again under the verdict.** It's a few lines per screen and doesn't need to wait for Wave F (09 R-3).
4. **Copies drift within days.** The speed table went from three identical copies to three different ones between 29 September and 2 October. Phase two's step 2 (one set of engine helpers) is the right thing to do first.
5. **Wave E left one English ordinal** (the pundits screen in Slovak) and a dead import. Both are in step 0.

## Decisions taken in this plan

- **The visual direction isn't reopened.** Kit Drop is locked; the re-score checks the September findings against today's code, and impeccable runs again only for Wave F's new screen.
- **Result-first stays** (06 E-1). Neither logic fix changes how a result is decided: G-L1 changes ratings only, G-L3 changes what OVR goes in.
- **Penalties missed a third of the time stays** (06 E-5): the maintainer's choice, and good for drama.
- **The leaderboard's trust gap is parked behind its risk** (R-1), with tighter plausibility checks first and seeded results (I-6) before any public push.
- **Wave F moves the depth into the run hub, not off the app.** Nothing a result screen shows today is lost; it's one tap further.

## Open decisions

| # | Decision | Default if nobody decides |
|---|---|---|
| D-1 | G-L3: one scale by rating clubs like your XI (no stretch), or by stretching both | **Rate clubs like your XI**, then retune the odds divisor if outcomes got too even |
| D-2 | Move Play again under the verdict now, ahead of Wave F | **Yes**, as step 0's last item |
| D-3 | One speed table's values: the league's (2000/400/100) or the full path's (2200/900/250) | **The league's** |
| D-4 | Do I-6 (seeded results) at the end of step 2, to unlock the daily draft (I-1) | **No for now**; revisit after Wave F |
| D-5 | Medium: fix the guide's words, or make Medium level 3 (straight) | **Fix the words** |
| D-6 | Highlights on the result screen: include "the one that got away" (I-2) | **Yes** |

## How this was made

- **Skills:** `deep-audit` (complete). `impeccable` wasn't rerun (direction locked; it runs for Wave F's screen, 08 §7). `vibecode-audit` wasn't rerun in full; its five September blockers were checked one by one (03 §2). Humanizer: the prose was written plainly with no draft-and-rewrite pass. Read it with that in mind.
- **Measured:** Vercel CLI 62.2.0 queries (2 Oct, 23:23–23:28); `expo export -p web` (legal flavour); `curl -I` on production; scratch probes over 8,000 matches and over `players_v5.db`; `verify-difficulty`; grep counts for every centralisation item. The scratch probes were deleted after use.
- **Not done:** no field vitals (none exist); nothing on a phone (Phase 9 and 9.5); no full-run simulation (needs check C-7, which this set specifies); the app wasn't launched (the maintainer tests his own features).
- **Read:** the roadmap's Wave G section and P8.5-43, the centralisation set 00–10, `01-CRITIQUE.md`, `02-VIBECODE-AUDIT.md`, the analytics doc, the diagnostics README, and the engine, scoring and result-screen code cited throughout.
