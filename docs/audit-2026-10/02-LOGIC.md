# 02 · Logic: does the game say what happened, and is your team as strong as you built it

> Part of the Wave G audit. Start at [`00-README.md`](00-README.md).
> Status: **findings, read 2 October 2026.** Line numbers are from that day. The numbers come from [`01-MEASURED.md`](01-MEASURED.md) §3.

The maintainer's two examples for this audit were the right ones to start from: *a player scores a hat-trick yet loses and doesn't even get an 8.5*, and *does your team's strength match what you built*. The first is fixed for hat-tricks and still true one step down. The second is measurably not true, in both directions. Neither would be caught by any verifier the repo has today, which is the more important finding.

Classes are the logic set's usual ones: **Wrong** (a wrong result today, reproducible), **Fragile** (breaks under a named condition), **Unverified** (nothing would notice), **Divergent** (two versions of one rule, or docs against code), **Hypothesis** (suspected, not probed).

---

## 1. The model, briefly

Unchanged since `docs/PROJECT_STATE.md` describes it, and kept: the result is decided first (`simulateMatch`, `src/engine/match.ts:48`) from effective OVR, home advantage (+3.5), form and, for your matches only, the difficulty tilt. Everything else (scorers, the sheet, ratings, the commentary) is generated afterwards from a stored seed and can't change the result.

Two inputs decide every result: **your side's OVR** and **the opponent's OVR**. They come from different formulas (§3).

---

## 2. Ratings

### G-L1 · A brace in a defeat reads as an ordinary game · *Wrong (by the maintainer's own bar)*

**Evidence.** `rateSide` (`src/engine/match-detail.ts:756`) starts at 6.05, adds 0.95–1.35 a goal by position, and applies a result bump of −0.22 to −0.55 across the minutes played. Since P8-144 three goals is always 10 (`:835`). Two goals is not special, and in a defeat:

- median **7.7**, p90 8.3, only **7.7%** reach 8.5 (222 cases in 8,000 matches);
- man of the match **37 times in 222**: the award usually goes to someone on the winning side with no goal at all;
- across all matches, the losing side has man of the match **1.4%** of the time (109 in 8,000).

The hat-trick fix was a special case on top of a curve that under-rewards goals in a defeat. The curve is still there for one and two goals. For comparison, a lone goal in a win has median 7.5: scoring twice and losing reads barely better than scoring once and winning.

**Why it matters.** The rating is the one number every screen shows next to a player, and the press and the awards build on it. When it disagrees with what the player saw (a brace, a lost match, a 7.4 and someone else's star), the sheet looks generated, which is exactly the feeling the deep-stats layer exists to avoid.

**Proposal.** Two changes, measured by C-1 (§6) before and after:

1. **Scale the result bump by involvement.** A player who scored or assisted takes at most half of the losing side's penalty (`resultBump * minFrac * (involved ? 0.5 : 1)`).
2. **Let man of the match cross to the losing side when it's earned.** Today MOTM is simply the highest rating. With (1), a brace in a 2–3 defeat lands around 8.3–8.6 and starts winning MOTM against a winner's 7.6, without a special rule.

Targets (C-1): a brace in a defeat has median ≥ 8.2 and wins MOTM in at least 40% of cases; the losing side's MOTM share lands between 4% and 10% (top-flight rating sites put it in single figures; the band is **provisional** until compared against a real season's numbers); a goalless winner's median doesn't move by more than 0.1.

### G-L2 · A goalkeeper can't have a great day · *Hypothesis*

A keeper with a clean sheet in a win has median 7.1 and reaches 8.5 in 0.3% of cases. Saves add 0.2 each (`:818`), so an 8-save performance is still capped near 8.3. Whether that's wrong depends on how many saves the generator ever gives the losing side's keeper; not probed. C-1 prints the keeper's rating against saves made, which decides it.

---

## 3. Strength

### G-L3 · Your XI and the clubs are rated on different scales · *Wrong*

**Evidence.** Your side's OVR is `calcTeamOvr` (`src/engine/rating.ts:83`): a position-weighted average of eleven effective OVRs, not stretched. Every other club's OVR is `historical_ovr`, written at build time by `teamStrength` (`scripts/lib/open-rating.ts:194`): the average of the best **fourteen**, then **stretched ×1.55 around 81** and clamped to 60–94.

Measured over 1,630 club-seasons ([`01-MEASURED.md`](01-MEASURED.md) §3.2): draft a club's own best eleven and you come out

- **2.6–3.7 below that very club** if it's rated 88 or more (a top side),
- **4.7–6.1 above it** if it's rated 64–71 (a weak side),
- about level only around 80–83.

A 3.7 gap is worth about **10 points of win probability** (45% → 55% between equal and +3, §3.3). So drafting elite players gives you a team that plays a few points worse than the elite club you think you've matched; drafting ordinary ones makes you far better than the ordinary clubs around you. "Does your team's strength match what you built": no, and the error is largest at both ends, where it's most noticeable.

**It reaches placement too.** `isEligible` (`src/engine/placement.ts:23`) admits a league when your OVR is within 8 of its top four's average `historical_ovr`. Comparing across the two scales lets a mid-table draft into stronger leagues than it should and shuts an elite draft out of weaker ones a little early.

**Proposal.** One scale. Rate a club the way you're rated: compute each club-season's strength at seed time with the same position-weighted best-XI formula `calcTeamOvr` uses (pick its best eleven into a 4-3-3, or into the formation its players fit best), and drop the stretch. The stretch existed to spread clubs out so tables look varied; if the spread is wanted, apply the **same** stretch to your side's OVR before a match, so both sides go through one function. Either way there is one function, `teamStrength`, shared by the app and the seed builder (`scripts/lib/open-rating.ts` imports from `src/engine/rating.ts`, not the other way round).

**The trap.** Changing club strength moves every balance number the repo has tuned: `verify-difficulty`'s win rates, `measure-europe`'s European win rates, the score multiplier. The plan in [`09-ROADMAP.md`](09-ROADMAP.md) puts C-2 (the check) first, re-measures, and retunes `OVR_DELTA_DIVISOR` only if the spread of outcomes changes, with both numbers written down (lessons §1, "a fix whose number doesn't move isn't a fix").

### G-L3 as built (3 October 2026)

**What changed.**
- `clubStrength` (`src/engine/rating.ts`) rates a club like your XI: its best eleven in a 4-3-3 (greedy, then improved by swaps), through `calcTeamOvr`. `build-db.ts` writes it into every club-season after the inserts; `teamStrength` in `open-rating.ts` now calls it, so future seeds agree. `DB_VERSION` 20 → 21.
- The stretch moved into the match engine: `RATING_STRETCH = 1.5` in `src/engine/match.ts` multiplies **every** side's rating, yours included, before the odds. Home advantage, form and the difficulty tilt keep their rating-point values. The pundits' expected points use the same `stretched()`.
- `OVR_DELTA_DIVISOR` was not touched. Changing it would also have changed home advantage, form and the tilt; stretching only the rating changes only the gaps.
- `src/data/hunt-odds.ts` regenerated (it's measured on club strengths).

**C-2, before → after** (`scripts/verify-strength.ts`, 1,678 club-seasons in the bundled database): stored strength minus its own best XI ran **−8 to +5** (1,082 outside ±1). The greedy pick alone left 22 at −2. With the swap pass it's **−1 to +1, 0 outside**.

**Club strengths.** All club-seasons: 60–94 (median 79) → 58–91 (median 80). The 2024 Premier League 80–94 → 81–91; La Liga 75–91 → 77–87. Across the 708 clubs in the European draw, the median went from 64 to 70: the old stretch and the floor at 60 had pushed weak clubs down.

**Why the stretch, measured.** Top five leagues, 2018–2025, 20 seasons each, AI only:

| | strongest club wins | points, 1st − last | goals a game | equal sides: home win / draw | 6 below (old scale) wins |
|---|---|---|---|---|---|
| old scale | 37.6% | 61.2 | 2.96 | 56.4 / 24.7 | 21.8% |
| new scale, no stretch | 31.4% | 50.5 | — | 56.6 / 24.3 | — |
| new, `OVR_DELTA_DIVISOR` 4.7 instead | 38.0% | 57.6 | — | **61.3** / 22.7 | — |
| new, stretch 1.4 | 38.5% | 58.8 | 2.92 | 56.5 / 24.5 | — |
| **new, stretch 1.5 (built)** | **39.9%** | **61.5** | **2.95** | **56.9 / 24.3** | **21.7%** (C-6) |

Real top-flight seasons run 60–75 points from first to last, so the unstretched scale's 50 was too flat. The divisor route made home sides win 61% of games between equals.

**Finding, not fixed here.** Home advantage is too strong on any scale: equal sides win at home 56–57% of the time, against about 45% in real top flights. That's `HOME_ADVANTAGE = 3.5`; it belongs with the difficulty work ([`11-DIFFICULTY.md`](11-DIFFICULTY.md)), measured with C-7.

**What you'll feel: your XI against a league** (your side replaces the weakest club, as placement does; 1,200 seasons each, AI odds, no tilt):

| your XI | finish p10 / median / p90, before | after | league title, before → after |
|---|---|---|---|
| 78 | 11 / 17 / 20 | 13 / 18 / 20 | 0% → 0% |
| 82 | 7 / 12 / 18 | 6 / 12 / 18 | 0.1% → 0.4% |
| 86 | 3 / 7 / 13 | 1 / 5 / 10 | 3.8% → 13.8% |
| 90 | 1 / 3 / 8 | 1 / 1 / 4 | 22.0% → 63.2% |

This is the fix working. Before, an elite draft played a few points below the elite clubs it matched; now a 90 is a 90. An elite draft now wins its league, and a modest one gets no easier.

**Europe** (`measure-europe.ts`, 300 seasons each):

| | before | after |
|---|---|---|
| Champions League field, median / top / bottom | 87 / 94 / 71 | 85 / 90 / 74 |
| XI 74, medium: no Europe at all | 29.7% (+13.7% out in UECL qualifying) | 41.3% (+25.3%) |
| XI 92, medium: wins the Champions League (whole season) | 3.3% | 22.7% |
| XI 92, hard: wins it | 0.3% | 6.7% |
| XI 86, medium: wins its league phase, UCL / UEL / UECL | 0.3 / 2.7 / 10.3% | 1.0 / 6.0 / 23.7% |
| XI 92, medium: same | 6.7 / 20.7 / 40.3% | 25.3 / 41.0 / 61.0% |

`verify-score` and `verify-difficulty` use set ratings rather than the database, so they don't move: the presets against an equal side are unchanged (easy 44.4%, medium 34.0%, hard 23.0%), and AI against AI still ignores the tilt.

**Hunting** (`PART=hunt`, 86 on hard, 300 seasons: steered vs unsteered share that ends in the target; `hunt-odds.ts` regenerated for the new scale):

| target | before | after |
|---|---|---|
| UCL | 70.3% vs 56.3% | 81.3% vs 68.3% |
| UEL | 37.0% vs 31.3% | 30.7% vs 34.0% |
| UECL | 34.0% vs 7.0% | 26.0% vs 3.3% |

**Finding, not fixed here.** Steering toward the Europa League barely works on either scale (at 80 on the old one: 42.7% steered against 45.3% unsteered). A strong XI in a big league tends to finish high and go to the Champions League instead. Gaps of about 3 points at 300 seasons are close to noise. It belongs to the hunt (P8.5-39), with `HUNT_POWER` and `TARGET_MULTIPLIER` (still the plan's starting figures).

**C-3.** Placement still compares your XI with a league's top four + 8. On the new scale the strongest clubs sit lower, so a 95 is taken by 22 of 45 league-seasons (41 before) and anything up to 92 by 44 or 45. The fallback (the three strongest leagues) still catches an XI nobody takes. C-3 as specified (a copy of a league's best club is eligible for its own league) passes on both scales, so it guards rather than proves the fix; it fails when the margin is set to 0, so it can catch a placement change. Left as it is; revisit with the maintainer's elite test run (checklist S2-1).

### G-L4 · Medium isn't "played straight" · *Divergent*

The guide (`guide.topic.difficulty.body`, `src/i18n/en.ts`) says Medium plays matches straight. Medium is screw level 4, a −1.5 tilt against you (`src/engine/difficulty.ts:55`), which takes your win rate against an equal side from 39.4% (straight, level 3) to 33.6%. Either the guide says "a little against you", or Medium moves to level 3. The guide is the cheaper and probably the right fix: the ladder was made "slightly harsher" on purpose (the comment at `:49`). Default: fix the words, in both languages.

---

## 4. Determinism and trust

### G-L5 · Results can't be replayed · *Fragile*

`simulateMatch` rolls with `Math.random()` (`src/engine/match.ts:54`), as do `spinPlacement` (`placement.ts:35`), the draft's spins and seven shuffles (L-14 in the centralisation set; 25 `Math.random` calls across 11 engine files). The deep layer is seeded and replays perfectly; the results it sits on can't be regenerated, only stored.

That's a deliberate trade (results are attributed once and stored on the match) and it's fine for play. It costs two things:

1. **The server can't check a run.** `submit-run` scores the row the client sends (`supabase/functions/submit-run/index.ts:66`) and can only judge it plausible (`invalidRun`). A season of 38 wins is scored if it's submitted. With a run seed and seeded results, the server could replay the season and compare. See [`03-SECURITY.md`](03-SECURITY.md) S-2.
2. **A reported bug can't be reproduced** from the run's id. Every engine bug report today starts with "I can't make it happen again".

**Proposal.** Not now. Seeding the results is a larger change than it looks (every caller of `simulateMatch` needs a stream, and the draw, the cups and Europe all shuffle). It's listed under "fresh ideas" ([`07-FRESH-IDEAS.md`](07-FRESH-IDEAS.md) I-6) with what it would buy, and the risk table in [`09-ROADMAP.md`](09-ROADMAP.md) carries the leaderboard exposure until then.

---

## 5. Missed in Wave E (2 October)

### G-L6 · The pundits screen writes English ordinals in Slovak · *Wrong*

`app/game/pundits.tsx:40` keeps its own `ordinal` ("3rd"), so the pundits' calls read "3rd" in a Slovak run. The shared `ordinal` in `src/lib/format.ts` already writes "3.". One-line fix; step 0.

### G-L7 · A dead import in two result screens · *Hygiene*

`PenShootout` is imported by `cl-result.tsx:39` and `wc-result.tsx:39` and drawn by neither. Its file is dead (C-05). Step 0 deletes both.

---

## 6. What the verifiers measure, and what they don't

The repo has 38 `verify-*.ts` scripts and all pass in English (2 October). They are strong on **invariants** (possession sums to 100, a scorer was on the pitch, a red card ends a player's minutes, determinism by seed) and on **balance aggregates** (difficulty moves your win rate and not AI-vs-AI). They don't check whether the game **reads right to a player**. None of the findings above would fail a script today.

The checks to add, in the house style (thousands of iterations, `check()`, `✅ ALL CHECKS PASSED`). Each one is written so it fails today, which proves it can fail (lessons §2):

| # | Check | Script | Fails today because |
|---|---|---|---|
| C-1 | **Ratings tell the story.** Brace-in-defeat median ≥ 8.2 and MOTM share ≥ 40%; losing side's MOTM share 4–10%; a hat-trick is 10; a goalless winner's median within 0.1 of its baseline; keeper rating rises with saves | extend `verify-match-detail.ts` | median 7.7, share 17%, losing MOTM 1.4% |
| C-2 | **One scale.** For every club-season in the seed, the club's strength minus the strength of an XI drafted from its own best eleven is within ±1 | new `verify-strength.ts` (reads the seed JSON, no DB) | −6.1 to +3.7 |
| C-3 | **Placement on one scale.** A drafted copy of a league's best club is eligible for that league | same script | depends on C-2 |
| C-4 | **Docs match the engine.** The guide's per-difficulty claims match `tiltForLevel` (Medium is not "straight" while its tilt is non-zero) | extend `verify-difficulty.ts` (reads `en.ts`) | "played straight" with −1.5 |
| C-5 | **No English left in Slovak output.** Engine verifiers already run with `POM_LANGUAGE=sk`; add a pass over every rendered string from press, commentary and awards that fails on an English ordinal suffix or an untranslated key | extend `verify-i18n.ts` | G-L6 |
| C-6 | **The upset still happens.** After G-L3, a side 6 below wins 20–30% (the "any given Sunday" band) | extend `verify-difficulty.ts` | passes today; guards the fix |
| C-7 | **Whole runs.** 2,000 league runs per difficulty through the season loop on an in-memory seed: tier distribution, share of seasons decided with 5+ rounds left, share ending in each verdict. The fun numbers (see [`06-CRITIQUE-CHECKED.md`](06-CRITIQUE-CHECKED.md) §3) | new `verify-runs.ts` | no such numbers exist yet |

C-7 is the one the audit wanted and couldn't run: the season loop reads the database through expo-sqlite. The script loads `scripts/seed-open/*.json` directly, which is what `build-db` reads, so it needs no app runtime.

---

## 7. Second time round (lessons §10–11)

| Situation | What happens | Checked |
|---|---|---|
| Second run in one session | `resetRun` runs from "Play again" on the four result screens and from abandon (`LeagueSeason.tsx:359`, `RunChrome.tsx:86`). `setMode` doesn't reset (`gameStore.ts:230`), so a run left some other way (backing out of the draft to Home, then picking a new mode) keeps its old picks until something calls `resetRun` | **Unverified**: no script or note covers leaving mid-setup and starting again. Add to the maintainer's Phase 9.5 list |
| Reload mid-season | The season is lost, said plainly (`home.seasonLost`) | as built |
| Reload on the match sheet | "This match isn't open any more" with a way home (`match.lost`) | as built |
| Second season of a career | n/a: one season per run | — |
| A Slovak run's saved names, read in English | names stay English as data; only display changes (`countryName`, `label`) | as built 2 Oct |
| A seed bump (DB_VERSION) mid-history | old runs keep their stored scorers and seeds; the sheet regenerates from the seed against the **new** pools | **Unverified**: a player removed from the database between versions would leave a stored scorer with no line. `verify-match-detail` doesn't load an old run against a new seed. Add to C-1 as a fixture |

---

## 8. Summary

| # | Finding | Class | Fix in |
|---|---|---|---|
| G-L1 | Brace in a defeat reads as ordinary; MOTM almost never from the losing side | Wrong | step 2 · *done 3 Oct* |
| G-L2 | Keepers can't have a great day | Hypothesis | probe in C-1 |
| G-L3 | Your XI and the clubs on different scales (−6 to +3.7), placement too | Wrong | step 2 · *done 3 Oct, §3 "as built"* |
| G-L4 | Medium isn't "played straight" | Divergent | step 0 |
| G-L5 | Results can't be replayed; server can't check a run | Fragile | idea I-6, risk R-1 |
| G-L6 | Pundits' ordinals in English in Slovak | Wrong | step 0 |
| G-L7 | Dead `PenShootout` import and file | Hygiene | step 0 |
| — | Old runs against a new seed | Unverified | C-1 fixture |
