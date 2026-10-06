# 06 · Part two: the critique, then the critique checked

> Part of the Wave G audit. Start at [`00-README.md`](00-README.md).
> Status: **judgement, 2 October 2026.** Every criticism this audit could make, then each one looked at again: is it valid and does acting on it make the game better, or is it criticism because criticism was asked for?

The roadmap's instruction for this part: criticise everything found, then, only after, check each criticism with a clear head, *the engine choices especially*. The verdicts:

| Verdict | Means |
|---|---|
| **Keep** | Valid and worth acting on; it's in the plan |
| **Keep, later** | Valid, but not worth its cost now; it's parked with what would bring it back |
| **Drop** | On a second look, the current choice is right, or the criticism is taste dressed as a finding |

---

## 1. The engine choices

| # | Criticism | Second look | Verdict |
|---|---|---|---|
| E-1 | "The engine decides the result first and makes up the stats afterwards; real football works the other way round" | Result-first is why the game is fast, fair to difficulty and reproducible on the sheet; a stats-first engine would make the scoreline an output of 1,100 lines of texture, and the maintainer has said twice it stays. The cost (stats occasionally argue with the score) is handled by the "dominated but lost" texture `verify-match-detail` checks | **Drop** |
| E-2 | Ratings under-reward goals in a defeat (02 G-L1) | Measured, and it's the maintainer's own complaint one step down from the case he got fixed. Cheap to fix, with a check | **Keep** (step 2) |
| E-3 | Two strength scales (02 G-L3) | Measured at −6 to +3.7, worth up to ~10 points of win chance. It's the second question the maintainer asked. It touches balance, so it goes behind a check and a re-measure | **Keep** (step 2) |
| E-4 | Results use `Math.random()`, so nothing can be replayed (02 G-L5) | True and it limits the server's checks, but nothing a player sees is wrong, and seeding every caller is a week of careful work. The leaderboard is friends-scale today | **Keep, later** (I-6; comes back if the leaderboard goes public or a bug can't be reproduced) |
| E-5 | A third of penalties are missed (`MISS_SHARE = 0.33`, `match-detail.ts:851`); real football is nearer a fifth | The maintainer set it on purpose, and the comment says so. A missed penalty is drama, and this is a game | **Drop** |
| E-6 | Home advantage is a flat 3.5 for every league and the same in a World Cup group | Neutral venues already exist where it matters (World Cup and finals in the label checks); a per-league figure is accuracy nobody would feel | **Drop** |
| E-7 | The flat 6.05 rating baseline means every player in a team looks alike before the stats | That's the point of a stats-first rating; quality shows through the numbers. The thing that's actually off is the result bump (E-2) | **Drop** |
| E-8 | Hat-tricks are always 10, even in a defeat | It's the maintainer's ruling (P8-144) and the probe shows it's the one case that now reads right | **Drop** |
| E-9 | The Slovak language is fixed per launch and switching reloads | A decision with a reason (t() works anywhere, no hook churn); switching language is rare | **Drop** |
| E-10 | Seven biased shuffles (`sort(() => Math.random() - 0.5)`, L-14) | Real statistical bias in draws, and the fix is mechanical (one seeded Fisher–Yates in `src/lib/rng.ts`). It also unblocks E-4 | **Keep** (phase two step 2, unchanged) |

## 2. The interface and the flow

| # | Criticism | Second look | Verdict |
|---|---|---|---|
| U-1 | Result screens are a long scroll of everything (05 §1 heuristic 8) | The maintainer's own words. And the run hub already holds the same content in tabs, so the fix is mostly removing, not designing | **Keep** (Wave F) |
| U-2 | Four result screens, four layouts | The same problem from the code's side; phase two's step 6 (one result screen) and Wave F are one piece of work | **Keep** (together, see [`08-RESULT-PAGES.md`](08-RESULT-PAGES.md)) |
| U-3 | The full path has no abandon | A run can be 20 minutes; with no way out you close the app and lose it anyway. Real | **Keep** (phase two step 4) |
| U-4 | Speed locked to slow in the classic cups and World Cup | Real, and inconsistent with the league and the full path, which have the chips | **Keep** (phase two step 4) |
| U-5 | The match sheet is still on the old theme | Real, and the biggest old screen; but it works, and the maintainer opens it constantly. Rebuild it once, not in passing | **Keep, later** (phase two step 8) |
| U-6 | "Play without a bench" has no undo | One tap on a clearly labelled secondary plate, at a step you can redo by starting again. The cost of a confirmation on every run is higher than the rare mistake | **Drop** |
| U-7 | No help on where the result screen's content went | Only true after Wave F moves it; Wave F's design has to answer it on the screen, not with help text | **Keep** (inside Wave F) |
| U-8 | The guide says "screw-you-er" | It's the custom slider's own playful name and part of the game's voice; the actual problem in that paragraph is the Medium claim | **Drop** the word, **keep** G-L4 |
| U-9 | 63 raw hex values remain in UI code | Most are in the four result screens and the old match sheet, which Wave F and step 8 rebuild anyway; chasing them now is double work | **Keep, later** (falls out of Wave F and step 8) |

## 3. Is it fun?

The question the maintainer asked last and the one no script answers directly. What can be said with evidence:

**What's working for fun (from the playtests in the roadmap, Waves A–C):** the reveal and the globe, the draft's tension (a spin, a pick, OVR shown before you commit), live matches on a clock, the pundits being wrong about you, Awards Night, feats to chase, hunting a European trophy.

**What works against it, and is measurable:**

| # | What | Evidence | Verdict |
|---|---|---|---|
| F-a | The end of a run makes you work to find the good bits | 13–20 blocks per result screen | **Keep**: Wave F |
| F-b | Strength doesn't match the draft at the extremes, so a great draft can feel robbed and a modest one can feel too easy | 02 G-L3 | **Keep**: step 2 |
| F-c | A brace in a defeat isn't recognised | 02 G-L1 | **Keep**: step 2 |
| F-d | **Unknown:** how often a league season is decided with five or more rounds left (the dead middle of a run), and how the verdicts spread by difficulty | no run-level script exists | **Keep**: check C-7 (`verify-runs.ts`) measures it; targets set from its first reading, not invented here |

**What would be criticism for its own sake:** "add more modes", "add transfers", "add tactics". The game's loop is draft, drop in, watch; each of those turns it into a different game. They're in [`07-FRESH-IDEAS.md`](07-FRESH-IDEAS.md) only where they lean into that loop.

## 4. The verifiers, criticised

| # | Criticism | Second look | Verdict |
|---|---|---|---|
| V-1 | 38 verifiers, all invariants and balance, none for "does it read right" | True; every logic finding in 02 would pass today | **Keep**: C-1 to C-7 |
| V-2 | Three verifiers assert English text, so they can't run in Slovak | `verify-awards`, `-predictions`, `-career` compare labels; it's a test of English copy, which is fine. Running the engine in Slovak is covered by press, commentary and schedule | **Drop** (note it in the i18n memory, done) |
| V-3 | No verifier loads an old run against a new seed | A real gap for DB bumps (02 §7) | **Keep**: C-1 fixture |
