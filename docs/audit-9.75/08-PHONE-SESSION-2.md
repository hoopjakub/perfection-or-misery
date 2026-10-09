# 08 · The second phone session: the release build

> Part of the Phase 9.75 audit. Start at [`00-README.md`](00-README.md).
> Status: **findings, 8 October 2026.** The maintainer's session on the `preview-personal` release build (POCO X6, Android 36, Hermes) after steps 1–9: rows 975-1 to 975-24, 18 screenshots, the Diagnostics report and logcat. Causes marked *confirmed* were read in the code; *hypothesis* means the code points there but no number has moved yet.

---

## 1. The checklist rows

| Rows | Result |
|---|---|
| 975-4, -5, -6 (the offline queue, refused runs, SAVES) | **work**. The log shows the whole path: queued offline, `flush (Diagnostics)`, `run sent` |
| 975-11 to -13 (Stats tab, hub opening, stats pass) | **work** (the numbers in §3 are still over budget, but the freezes are gone) |
| 975-16 to -24 (knockout tabs, your competition, bench, lifecycle, limit, ledger, press, release session) | **work** |
| 975-7 (the live match in light mode) | **partly**: the live card is fixed; the line-ups use the old circle style and the match sheet is still dark (§2, P9.75-19, -20) |
| 975-8 (Slovak names) | **fails in places**: the press, the awards' headline cards, "Croatia XI", the team marks' initials (§2, P9.75-21) |
| 975-9 (flags on the spin) | **partly**: the flags show, but zoomed in far too much (P9.75-24) |
| 975-10 (club facts) | **partly**: they show, but English only, for twenty clubs, and easy to miss (P9.75-25) |
| 975-14 (the keyboard) | **fails**: a light band under the sign-in form, with the keyboard up and after (P9.75-16) |
| 975-1 to -3, -15 | not reported |

---

## 2. Findings

| # | Seen | Cause | Status |
|---|---|---|---|
| P9.75-16 | A light band under the dark sign-in screen, with the keyboard up and after it closes | `KitScreen`'s keyboard frame (`KeyboardAvoidingView`, step 5) has no background, so its padding shows the light page under the app. The band left after closing is padding not taken back (Android edge to edge) | cause confirmed (the colour); the leftover padding is a hypothesis |
| P9.75-17 | The result screen's rows break their labels letter by letter ("You r riv al", "T h e p u n d i ts", "Kád er", "Pavú k") | `ListRow`'s value on the right never shrinks, so a long value squeezes the label column to one letter wide (`controls.tsx:290`) | confirmed |
| P9.75-18 | **The fingerprint fails on Hermes**: `SHOWN DIFFERS · seed 1 · home.yellowCards 2 ≠ 0` | The same seed gives a different match sheet on the phone than in Node, an integer field, so not rounding. Suspects: `Math.pow` with fractional powers feeding weights (`match-detail.ts:517–884`), number formatting, sort order. Needs a probe on the phone | **open**; answers L-6 (and P9-8): the seeded layer is *not* engine-portable today |
| P9.75-19 | The Deep Match line-ups are drawn as circles on a pitch, the old style; the team of the tournament's pitch is the house style | The Deep Match uses `PitchViews` / `MatchLineupPitch`, not the awards' `FormationPitch` | confirmed |
| P9.75-20 | The match sheet is still dark in light mode; some screens show dark text on a dark ground | The match sheet is floodlit by design until its redesign (P8-48, Phase 11); the maintainer wants it to follow the setting now | decision (§5) |
| P9.75-21 | English names in Slovak: the press ("2:0, súper: Croatia", "Postup bez problémov: Netherlands"), the awards' headline cards (NETHERLANDS, BRAZIL), "Croatia XI" / "SWEDEN XI", the team marks' initials (CX, CZ), the result row "proti: SWITZERLAND" | The press writes its stories with the names as stored and never translates them; `countryName()` doesn't know "X XI" (the player's nation); the marks take initials from the English name; the awards' big name card prints raw | confirmed for the press and "XI"; the cards and initials located, not yet read line by line |
| P9.75-22 | The third-place match's story says "Postup bez problémov: Argentina" (through without trouble) | The third-place match is written as a `koRound` story, which is about going through | confirmed |
| P9.75-23 | Achievements don't pop up offline, nor when the connection returns; they appeared only after the app reloaded | They're announced only after a save succeeds (`useRunSave` → `announceNewAchievements`); a queued run sent later doesn't announce, and nothing is judged on the phone | hypothesis (the flow), to read |
| P9.75-24 | The World Cup spin's flags are zoomed in too far | The reel's flag fills its item (cover) at the reel's height | to read |
| P9.75-25 | Club facts: English only, twenty clubs, easy to miss; "swap" on the bench isn't explained | The facts file has twenty Premier League clubs in English; the swap note is one word | content and wording (§5) |
| P9.75-26 | The team of the matchday should be folded away, opened on a tap | It's always shown under each round | a change (small) |
| P9.75-27 | The You screen: add total points beside runs, best and world rank | A new figure | a change (small) |
| P9.75-28 | League-mode achievements "don't quite make sense" | To review with the maintainer, one by one | open |
| P9.75-29 | After the final: the medal ceremony, then Awards Night; "we need to again do some logic checks, or screen checks" | The intended order is ceremony → Awards Night → verdict; a walk through every mode's end is owed | a check |
| P9.75-30 | The press should grow: proper articles (Football Manager-style), and new stories for the other tournaments | A writing and design job beyond step 9's variants | decision (§5) |

---

## 3. The release readings (first on a release build)

| Measure | Reading | Budget | Before (dev build, 7 Oct) | Verdict |
|---|---|---|---|---|
| Stats tab `ui:tab` | 381, 573, 949 ms | 100 / 300 | 3,856–4,692 ms | 5–10× better, still over |
| `stats:board` (ranking and sort) | 179, 401, 776 ms | 20 / 80 | not measured | **the ranking is the cost on Hermes**: the second pass's 1 ms was Node. `positionRanks` is quadratic (02 §2) and must go one pass |
| `hub:teams` (Teams tab) | 668, 900 ms | 100 / 300 | 1,791 ms (tab) | over: the awards night is rebuilt on every opening |
| `ui:navigate` | p50 122, p95 610 ms | 150 / 350 | 778–1,631 into the hub | the hub opens in 137–595 ms |
| `stats:league` / `:ucl` / `:wc` | 1.3–2.0 s / 0.7–2.3 s / 0.6–0.8 s | 700 / 600 / 400 | 1.7 s (ucl) | the pass no longer freezes, but stalls of 0.6–1.4 s follow it on the awards screen (the awards built in one go) |
| A save | stalls of 2.6–2.7 s on the result "during save:run" | — | — | **new**: building the saved row blocks the screen |
| `stall:js` | p95 408 ms, worst 770 | 200 / 700 | 3.8–4.6 s | much better |
| `mem:js` | p50 56, p95 80 MB | 250 / 400 | 104 MB, rising | fine. **Drop caches: 56 → 56 MB**, so the caches aren't what holds memory (P9.75-14 answered: not a leak; the screens kept under the one in front) |
| `frame:deepMatch` / `:globe` | p95 69 / 50 ms | 20 / 50 | — | the Deep Match and the globes drop frames |
| Self-test bench | `stats` 2,147 ms | 700 / 2,000 | — | over (the same stats pass) |

---

## 4. Order (proposed)

1. **Quick fixes, one session**: P9.75-16 (the keyboard frame's colour and leftover padding), -17 (`ListRow`), -21 (the press, "XI", the cards, the initials, the result row), -22 (the third-place story), -26 (team of the matchday folded), -27 (total points on You). Each behind a check that fails today where one can be written (verify-i18n gains the press and the "XI" names).
2. **The fingerprint probe (P9.75-18)**: Diagnostics records, for seed 1, the random draws and a hash after each stage of the sheet; the phone's line against Node's names the first stage that differs. Then fix that stage (most likely by replacing fractional `Math.pow` with a portable form) and bump `ENGINE_VERSION`. Shipped to the phone as an update, not a new build (§6).
3. **Performance, second round**: `positionRanks` in one pass; the teams of the round computed once with the run's data; the awards night built in chunks; the save's row built off the frame. Done when the release readings fall under budget.
4. **Achievements (P9.75-23)**: judged on the phone at the end of a run, shown at once, offline too; on sign-in and when the queue sends, a check across all saved runs so nothing earned earlier is missed.
5. **The line-ups and the match sheet (P9.75-19, -20)**: per the decision below.
6. **Words and content (P9.75-25, -28, -30)**: per the decisions below.
7. **A screen walk of every mode's ending (P9.75-29)**.

*(Progress, 8 October 2026: §4 step 1 done in code: P9.75-16 (the keyboard frame wears the ground; the leftover padding is still a hypothesis), -17 (`ListRow`), -21 (`countryNameIn` knows "X XI"; the press translates at render via `shownStory`; result rows, awards cards, crest initials, the Deep Match and the commentary), -22 (a `thirdPlace` story), -24 (whole flags on the reel), -25 (the flip says CLUB FACT / ZAUJÍMAVOSŤ), -26 (the team of the round folded, worked out only when opened), -27 (total points on You). Checks seen failing: `verify-i18n` ("X XI"), `verify-press` (Slovak nation names in the press now with real nation names; the third-place story). **Next: step 2.** The likely cause of P9.75-18 is found: the seeded engine calls `Math.pow`/`exp`/`sin`/`tanh`/`atan2`/`hypot` (317 + 405 + 1,980 calls per sheet in seed 1), whose last bit differs between V8 and Hermes. Plan: a portable maths module (`+ - * /`, `Math.round`, `Math.sqrt` only) used by the engine and `rng.ts`, a `verify-diag` rule banning the engine's own calls, `ENGINE_VERSION` 2 and a new golden; shipped by EAS Update, then the self-test on the phone.)*

*(Progress, 8 October 2026, steps 2–4 and 7:*
- *Step 2, P9.75-18: `src/lib/pmath.ts` (exp, log, pow, sin, tanh, atan2, hypot from + − × ÷, `Math.round`, `Math.sqrt`; within 1e-13 of `Math` over 140,000 checks, `verify-pmath`), used by every engine file and `rng.ts`; ids compare by code unit (`cmpStr`), not `localeCompare`, which follows the engine's locale data (standings' tie-breaks feed the draws). `verify-diag` rule 2h bans the rest in the engine; it failed on 30 sites. `ENGINE_VERSION` 2, new golden. The phone's self-test says whether the fingerprint now matches.*
- *Step 3: the ranking in one pass (6,000 players: 94 → 3.8 ms in Node; `verify-run-stats` fails above 60 ms); the teams of the round kept per run (a second awards night from the same run: 45 → 2 ms; `verify-awards`); `pickTeam` without its quadratic copies; each board score computed once. The save's freeze has a probe first: the log line `run payload … KB, JSON in … ms; the saved row reached the screen in … ms` says which part costs, then it's fixed. Awards Night isn't chunked yet: its 0.6–1.4 s came with the rebuild this removes; the next reading says whether it's still needed.*
- *Step 4, P9.75-23: achievements judged offline too (the server's runs kept on the phone, plus the queued runs and the run just finished); fetched in pages, every run, not the first thousand. `verify-feats` checks a run kept on the phone earns what it earns on the server; it failed on the old code.*
- *Step 6, D7: club facts for 983 of 983 clubs in English and Slovak: the twenty hand-written ones (Slovak added; four corrected: Everton was never relegated in 2024, Tottenham were the first double of the century, not the only one, Burnley won all four divisions, Brentford's pubs were Griffin Park's), then sentences from Wikidata (founded, ground and capacity, city in each language, nickname; `scripts/build-club-facts.ts` → `scripts/club_facts_wd.json`). The flip says CLUB FACT / ZAUJÍMAVOSŤ. `verify-spin` checks every key is a club, both languages match, and 95%+ of clubs have one. The public build still shows none.*
- ***L-15 (new, found building the facts): European clubs fielded other clubs' squads.** The open-data build (30 Sept) matched a European club by name across the five big leagues before its own: Red Star Belgrade and Red Bull Salzburg had Manchester United's squad, Celtic had Celta de Vigo's, Ferencváros Manchester City's, and so on, 21 clubs, with those clubs' colours and grounds too. Fixed in `build-open-seeds.ts` (a club's own article first; no name match once its own is known), the seeds rebuilt from the cache, both databases rebuilt (`DB_VERSION` 25), 893 new players given legal names. `verify-open-seeds` fails on two clubs sharing eight players in a season or one Wikidata item; it failed on 21 pairs.*
- *Step 7, P9.75-29: the routing read through: every mode ends final (ceremony, if you played it) → Awards Night → the one result screen; the tester goes straight to the result. As designed.)*

## 5. Decisions for the maintainer

| # | Question | Default if nobody decides |
|---|---|---|
| D6 | The match sheet in light mode now (pulling P8-48's theming forward from Phase 11), or with the redesign? | now, theming only; the layout waits for Phase 11 |
| D7 | Club facts for every club in both languages: from what? Hand-written for the 20 that exist plus open data (Wikidata: founded, ground, city, nickname) written as short sentences for the rest | open data for all, hand-written top up |
| D8 | Football Manager-style articles: in 9.75, or their own phase after the release? | their own phase (a writing project); 9.75 keeps step 9's variants |
| D9 | The league achievements: which ones read wrong? | a review list from the code, for the maintainer to mark |

**Decided 8 October 2026:** D6 **Phase 11**: the match sheet and the Deep Match line-ups stay as they are until the redesign (P9.75-19, -20 move there). D7 **open data plus hand-written**: Wikidata sentences for every club in both languages, the twenty hand-written facts kept and given Slovak. D8 **Phase 11**: the Football Manager-style articles go with the overhaul. D9: still open (a review list to come). The order in §4 goes ahead, steps 5 and the articles excepted.

## 5a. D9: the league achievements, for the maintainer to mark

How they're decided today (`src/lib/achievements.ts`, `src/lib/feats.ts`). A run counts as won in a league mode when it finished **first**, in any league.

| Achievement | Rule today | What may not make sense |
|---|---|---|
| League mode: won on Easy / Medium / Hard | any league title at that difficulty | **any league counts the same**: the Slovak title fills the patch the Premier League does |
| All Time: won on Easy / Medium / Hard | the same rule, its own patch | two patches with the same rule; the only difference is the draft pool |
| Chaos, Cursed: conquered | any title, no difficulty | one patch each, no levels |
| One nation | won with eleven of one nationality | in a club league this is near impossible from random spins |
| The kids / No veterans | won with an eleven all 21 or under / all 28 or under | |
| Eleven nations | won with eleven nationalities | |
| One club | won with eleven from one club | the draft spins a club per pick, so this needs the same club eleven times |
| Blind and perfect | a league run graded *Perfection*, or a cup won, with ratings hidden | leagues need the top grade, cups only the trophy: two bars for one feat |
| Invincibles | a league won without a defeat | |

Options, once marked: a patch per league (or per tier of league: the big five, the rest), one patch for League and All Time, cups and leagues on one bar for *Blind and perfect*, *One club* and *One nation* dropped from league modes or made reachable.

## 6. Builds

Nothing in §4 needs a native change. ~~Everything can reach the build as an EAS Update.~~ Corrected 8 Oct: EAS refuses the update, 1,448 assets against a limit of 1,000 an update (the crests and both flag sets). Each round needs a new `preview-personal` build until updates carry only what changed (`updates.assetPatternsToBeBundled`, a later decision).
