# 01 · What was measured, and what couldn't be

> Part of the Wave G audit. Start at [`00-README.md`](00-README.md).
> Status: **as measured, 2 October 2026.** Every number here has its source and date beside it; re-run the same query or script to compare.

The roadmap asks the audit to measure before it criticises (P8-179, [`../Web Analytics & Speed Insights.md`](../Web%20Analytics%20%26%20Speed%20Insights.md) §4). This is that step: the web's own field data first, then what scripts measured in the engine and the build, because the field data turned out to be empty.

---

## 1. Vercel Web Analytics and Speed Insights

**Queried 2 October 2026, 23:23–23:28 CEST**, with Vercel CLI 62.2.0 signed in as the project owner, project `perfection-or-misery` (team `jakub-kahanecs-projects`). Raw JSON in the session scratchpad, not in the repo.

| Query | Window | Result |
|---|---|---|
| `vercel.speed_insights.{lcp_ms,inp_ms,cls,fcp_ms,ttfb_ms}`, p75 and count, by route, by device, overall, `--prod` | 7 days (25 Sept – 3 Oct) | **no data points** |
| Same, without `--prod` | 7 days | no data points |
| `vercel.analytics.page_view.count` by route, device, referrer, country, OS, browser; daily | 30 days (2 Sept – 3 Oct) | **no data points** |
| `vercel.analytics.event.count` by event name | 30 days | no data points |
| Page views and LCP across the whole team (`--all`) | 30 / 7 days | no data points |
| A 90-day window | 90 days | refused ("Invalid metric catalog request"): past the free plan's retention |

What this confirms:

1. **The CLI gives the individual vitals on the free plan.** `vercel metrics schema vercel.speed_insights` lists LCP, INP, CLS, FCP and TTFB with p50–p99 aggregations, and grouping by `route`, `deviceType`, `country`, `osName`, `browserName`. The doc's open question ("whether `vercel metrics` gives the individual vitals is the first thing to try") is answered: yes.
2. **Both scripts are served.** `GET /_vercel/insights/script.js` and `/_vercel/speed-insights/script.js` on the production domain both return 200, and the app mounts both components (`src/components/WebInsights.web.tsx:30-31`, from `app/_layout.tsx:172`).
3. **Not one event was stored** in the last 30 days, on this or any project of the team.

Two explanations are possible and the numbers can't tell them apart (lessons §1: a hypothesis until probed):

- **No production visits.** Web testing happens on `npm run web` locally, which never reports to Vercel. If nobody opened the production URL in 30 days, an empty table is correct.
- **Events don't reach the intake.** The packages are given `configString` from `EXPO_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG` (`WebInsights.web.tsx:20`); if that variable is wrong in the build, the scripts load but post nowhere useful.

**The probe** (minutes, done by the maintainer): open the production URL in a normal browser, move between two pages, then query again:
`npx vercel metrics vercel.analytics.page_view.count -a count --group-by route --since 1h --project perfection-or-misery --json`.
A count of 2 or more settles it as "no visits"; zero means the intake is broken. Listed as M-1 in [`09-ROADMAP.md`](09-ROADMAP.md) step 0.

So the audit's "rank the web work by use times slowness" can't be done yet: there is no use to rank by. Everything below is measured from the code and the build instead.

---

## 2. The web build, measured

`npx expo export -p web` with `EXPO_PUBLIC_BRAND_MODE=legal` (what Vercel builds), 2 October 2026. The exported database's content hash (`players_legal.dcdb9c50…`) is the one the production site serves, so this is the live build.

| Asset | Raw | Compressed | Notes |
|---|---|---|---|
| `entry-*.js` (the whole app) | 5.17 MB | 1.38 MB gzip | one chunk; no route splitting |
| `worker-*.js` | 0.14 MB | — | the SQLite worker |
| `players_legal.db` | 13.43 MB | 4.49 MB gzip (served `br`) | loaded whole into memory (`deserializeDatabaseAsync`) |
| `wa-sqlite.wasm` | 0.62 MB | — | |
| Whole export | 30 MB on disk | | includes crest-free legal assets |

**About 6 MB crosses the wire before the first draft spin is possible**, on a first visit, at best compression. On a phone on mobile data that's the dominant cost; nothing on the client can win it back.

**Caching.** `vercel.json` already makes `/_expo/*` (the JS) `immutable`, and production serves it that way. The content-hashed files under `/assets/*`, the 13.4 MB database among them, were served `public, max-age=0, must-revalidate` (`curl -I`, 2 October), so a returning visitor revalidated the database every time. Finding P-2 in [`04-PERFORMANCE.md`](04-PERFORMANCE.md); fixed in step 0 the same day.

---

## 3. The engine, measured

Scratch probes (8,000 synthetic matches, the same squads and calls `scripts/verify-match-detail.ts` uses), 2 October 2026. Full analysis in [`02-LOGIC.md`](02-LOGIC.md).

### 3.1 Ratings against what happened

| Player's match | n | median | p90 | rated ≥ 8.5 |
|---|---|---|---|---|
| 0 goals, won | 87,242 | 6.4 | 7.2 | 0.2% |
| 1 goal, won | 11,800 | 7.5 | 8.4 | 8.5% |
| 1 goal, lost | 4,213 | 6.9 | 7.2 | 0.1% |
| 2 goals, won | 1,903 | 8.5 | 9.3 | 50.7% |
| 2 goals, drew | 171 | 8.0 | 8.5 | 11.1% |
| **2 goals, lost** | 222 | **7.7** | 8.3 | **7.7%** |
| 3+ goals, any result | 362 | 10.0 | 10.0 | 99–100% |
| Goalkeeper, won, clean sheet | 5,819 | 7.1 | 7.6 | 0.3% |

Man of the match by the side's result, of 8,000 matches: won 6,343, drew 1,548, **lost 109 (1.4%)**. A brace in a defeat was man of the match 37 times out of 222.

### 3.2 Your XI's strength against the clubs'

1,630 club-seasons in `players_v5.db` (World Cup sides left out). For each, the club's stored `historical_ovr` against the plain average of its own best eleven players' OVR, which is roughly what drafting that eleven gives you:

| Club rated | n | club minus its own best XI |
|---|---|---|
| 60–63 | 344 | −5.2 (on the 60 floor) |
| 64–67 | 94 | −6.1 |
| 68–71 | 96 | −4.7 |
| 72–75 | 113 | −3.3 |
| 76–79 | 222 | −1.8 |
| 80–83 | 270 | −0.3 |
| 84–87 | 246 | +1.1 |
| 88–91 | 173 | +2.6 |
| 92–95 | 72 | +3.7 |

### 3.3 What an OVR gap is worth

`matchOdds` (`src/engine/match.ts:40`) at 85 against 85, no home advantage:

| Gap | −6 | −4 | −3 | −2 | 0 | +2 | +3 | +4 | +6 | +10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Win | 25.6% | 31.6% | 34.8% | 38.1% | 45.0% | 51.9% | 55.2% | 58.4% | 64.4% | 74.1% |

### 3.4 Difficulty

`scripts/verify-difficulty.ts`, 2 October: your win rate against an equal side is 45.1% on Easy, **33.6% on Medium**, 22.7% on Hard. Medium's tilt is −1.5 against you (`src/engine/difficulty.ts:55`).

### 3.5 Waits per run

| Wait | Then (`01-CRITIQUE.md`, Sept) | Now | Source |
|---|---|---|---|
| Draft spin | 2.5 s, ~16 a run | 0.8 s | `app/game/draft.tsx:52` |
| Globe at placement | 2.6 s every time | 2.6 s first of a session, 1.3 s after, skippable | `app/game/placement.tsx:46` |

---

## 4. What wasn't measured

| What | Why | Where it comes from instead |
|---|---|---|
| Field vitals on the web | no events stored (§1) | the M-1 probe, then a week of data |
| Anything on the phone | no native build until Phase 9.5; the audit doesn't run the app for the maintainer | Phase 9's Diagnostics screen ([`../diagnostics/00-README.md`](../diagnostics/00-README.md)) |
| Full runs end to end (tier spread, run length, how often a season is decided early) | the run loop needs the SQLite database through expo-sqlite, which the Node scripts can't open | a `verify-runs` script on an in-memory copy of the seed ([`02-LOGIC.md`](02-LOGIC.md) §6, check C-7) |
| Lighthouse | a lab number for a site with no field data says little | after M-1 |
