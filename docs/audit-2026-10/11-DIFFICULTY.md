# 11 · Difficulty, rethought: hard without rigging

> Part of the Wave G audit. Start at [`00-README.md`](00-README.md).
> Status: **decided 3 October 2026: Option A**, with wearable tags, the stamp, and custom on the same levers (§7–8). Written 2 October as options. The maintainer, that day: *"we need to look at difficulty again, I am unsure about the engine being against you a good thing, lets think it over. Probably something a lot more rewarding."* This lays out how it works now, what's wrong with it, three ways to change it, and a recommendation. Nothing changes until he picks.

---

## 1. How it works today

One model (`src/engine/difficulty.ts`): a level 1–10, a number of rerolls, ratings shown or hidden. Easy, Medium and Hard are levels 2, 4 and 6; Chaos is fixed at 7 and Cursed at 9; Custom sets all three dials.

The level does one thing in a match: **it adds or takes OVR from your side only**, invisibly, before the result is rolled (`tiltForLevel`, `:55`, used in `simulateMatch`, `src/engine/match.ts:49`). From +4.5 at level 1 to −13.5 at level 10. Measured against an equal side (`verify-difficulty`, 2 Oct):

| Level | 1 | 2 (Easy) | 3 | 4 (Medium) | 5 | 6 (Hard) | 7 (Chaos) | 8 | 9 (Cursed) | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Tilt | +4.5 | +2.5 | +0.5 | −1.5 | −3.5 | −5.5 | −7.5 | −9.5 | −11.5 | −13.5 |
| Your win rate | 51% | 45% | 39% | 34% | 28% | 23% | 19% | 15% | 12% | 9% |

The draft knobs (rerolls, hidden ratings, and in the full path the "weighted picks" pool) do real, visible work. The tilt does hidden work, and it's most of what "hard" means: a −5.5 tilt is worth more than any draft you could build.

The **reward** for harder settings is the score multiplier (×0.65 Easy, ×1.00 Medium, ×1.83 Hard), the per-difficulty tags on Achievements, and the hardness figure on custom runs.

## 2. What's wrong with the tilt

1. **It's invisible.** Nothing on screen says your eleven is playing five points worse than its OVR. A loss reads as bad luck or a bad engine, not as the difficulty you chose.
2. **It cancels the draft.** The draft is the game's skill. On Hard a perfect draft and a decent one are both pushed down by the same hidden amount, and from level 7 up no draft wins reliably. The better you draft, the less it shows.
3. **It makes the strength question worse.** "Does your team's strength match what you built" (02 G-L3) is already off by up to 6 points from the two scales. On Hard, add another 5.5. The OVR shown in the draft becomes a number the match doesn't use.
4. **Winning doesn't feel earned, it feels lucky.** A title on Hard means the dice went your way against a rigged roll. A title against honest dice with a weak draft would mean you drafted well and got through.
5. **Medium is quietly against you** (02 G-L4), and the guide said otherwise until step 0.

What it does well, and shouldn't be lost: it's **one dial** that scales from trivial to near-impossible, it's measurable, and AI-vs-AI stays fair (only your matches tilt).

## 3. Three ways to change it

### Option A · An honest engine; difficulty is what you're dealt

The matches are always played straight: your side plays at the OVR you see. Difficulty changes the **draft and the placement**, which you can see and play around:

| Lever | Easy | Medium | Hard | Very hard (custom up to 10) |
|---|---|---|---|---|
| Spin pool | weighted toward strong club-seasons (today's weighting by `historical_ovr`, `draft.ts:63`) | even | weighted toward weaker club-seasons | weaker still; elite seasons rare |
| Rerolls | 3 | 1 | 0 | 0 |
| Ratings | shown | shown | hidden | hidden |
| Placement | a league your side fits | a league your side fits | the strongest league your side is eligible for | above your weight on purpose |
| Out of position | small penalty | small penalty | doubled penalty | doubled |

Hard is hard because you build a weaker team without seeing ratings and get dropped where it's tough. When you win, it's because you drafted well. Every lever is a number a script can measure (expected XI OVR per level), so hardness and the multiplier are computed from what you were dealt.

### Option B · An honest engine; difficulty is the bar you have to clear

The draft and the matches are the same at every level; the **target** changes. Easy counts the top half as a good season; Hard counts only a title (or a semi-final in a cup). The tiers on the verdict move with it, and the score multiplier rewards the higher bar.

Simple and fair, but thin: it's the same run every time with different words at the end.

### Option C · Keep the dial, make it honest

The tilt stays but shows itself: the draft shows "plays at 84 (−5 Hard)" next to your OVR, the verdict says what you overcame, and the presets lean less (Hard −3 rather than −5.5). Custom keeps the full range for anyone who wants it.

Least work, and it fixes "invisible", but the draft still matters less the harder you go.

## 4. Making it more rewarding (with any option)

The maintainer asked for "a lot more rewarding", which is about what you get, not just how hard it is:

| Reward | Today | Proposed |
|---|---|---|
| Score | multiplier exists, shown on the verdict | unchanged; the multiplier reads from the settings and, with A, from what you were dealt |
| Tags | Achievements shows EASY / MEDIUM / HARD per mode | earned **tags you can wear** (the same tag system as daily challenges, [`10-DAILY-CHALLENGES.md`](10-DAILY-CHALLENGES.md) §5): HARD WINNER, BLIND CHAMPION, MISERY SURVIVOR (a title at level 9+), each shown beside your name |
| The run label | tier and score | a difficulty mark on the label (a stamp, not a colour alone), so a Hard title looks different on Runs and Ranks |
| Feats | 15 | add *Against the odds* (a title with the weakest XI in the league), *Blind and perfect* already exists |
| Streaks | none | consecutive wins on Hard or above, shown on the profile while alive |
| Ranks | filter by difficulty exists | a Hard board of its own |

## 5. Recommendation

**Option A, with C's honesty for anyone who still wants a handicap, and §4's rewards.** Concretely:

- Easy, Medium and Hard become draft-and-placement difficulty. **No tilt in the presets.** Your side plays at the OVR the draft shows.
- Custom keeps one extra dial, renamed from the level to an explicit **handicap** ("Your side plays −3"), default 0, shown in the draft and on the verdict when it's on. Chaos and Cursed keep their fixed misery through this dial, visibly.
- The score multiplier is recomputed from the new levers. Its endpoints stay (the hardest settings score most).
- The rewards in §4.

Why A: it makes the draft, which is the game's skill, matter **more** the harder you play instead of less, and it lines up with fixing G-L3 (one strength scale), so the number you see is the number that plays.

## 6. What it costs, and how it would be built

| Step | Build | Done when |
|---|---|---|
| A1 | The levers: pool weighting by level, placement by level, out-of-position penalty by level, in `difficulty.ts`; `tiltForLevel` removed from presets, kept as the custom handicap | `verify-difficulty` reports expected drafted XI OVR per level, falling monotonically from Easy to Hard by at least 3 points per step; your win rate against an **equal** side is the same at every preset (±1 point); AI-vs-AI unchanged |
| A2 | Hardness and the multiplier from the new levers | the hardest settings still give the highest multiplier; `verify-score` passes |
| A3 | Words: the guide's difficulty page, the mode-select lines, both languages | the guide check in `verify-i18n` (C-4) passes against the new model |
| A4 | Rewards: tags, the label stamp, the new feat, the Hard board | feats verified in `verify-feats`; tags derived from runs |

**Old runs.** Scores made under the old model and the new aren't comparable. The clean place to switch is a Ranks season boundary (seasons exist, P8): the new model starts with a season, and the old season's board closes as it is. Achievements already earned stay.

**Order.** After phase two's step 2 (one strength scale), because both change what OVR goes into a match and should be measured together, and before daily challenges, which pick a difficulty per day.

## 7. Custom difficulty under Option A

The maintainer, 3 October: custom difficulty has to work with the new model and have **its own rewards**.

**The dials.** Custom stops being "a level plus rerolls plus ratings" and becomes the same levers the presets use, each one set by hand:

| Dial | Range | Today's equivalent |
|---|---|---|
| Spin pool | strong-weighted · even · weak-weighted · weakest | new (today only the full path's "weighted picks") |
| Rerolls | 0–10 | as today |
| Ratings | shown · hidden | as today |
| Placement | fits your side · strongest eligible · above your weight | new |
| Out of position | normal · doubled | new |
| Handicap | 0 to −10, shown wherever your OVR is | today's level, made visible and off by default |

A preset is just a named position of these dials, so Easy, Medium and Hard are custom runs with a label. The **hardness** (0–11) is computed from all six dials, so a custom run and a preset with the same dials score the same.

**Custom's own rewards**, on the same tag and stamp systems as the presets:

| Reward | Earned for |
|---|---|
| The stamp | a custom run's label carries its hardness ("CUSTOM 8.6/11") instead of a preset's name |
| Tag: CUSTOM 8+ | a title (or a cup won) on custom hardness 8 or more |
| Tag: ELEVEN OUT OF TEN | a title on the hardest possible dials (hardness 11) |
| Tag: NO HELP | a title with 0 rerolls, ratings hidden and a weak-weighted pool, handicap 0 (pure draft skill, nothing rigged) |
| Achievements | the custom column on Achievements already shows the hardest custom run won (0–11); it keeps doing so on the new hardness |

## 8. Decisions

| # | Decision | Decided |
|---|---|---|
| DF-1 | Which model | **A: what you're dealt** (the maintainer, 3 Oct). Matches honest; presets carry no tilt |
| DF-2 | Chaos and Cursed | default stands: their misery stays, as a visible handicap |
| DF-3 | Switch at the next Ranks season boundary | default stands: yes |
| DF-4 | Rewards | **wearable tags and the difficulty stamp on run labels** (the maintainer, 3 Oct). Streaks, a Hard board and *Against the odds* left out for now |
| DF-5 | Custom | **works with A, with its own rewards** (§7) |

So §4's table is cut to tags and the stamp, and step A4 builds those two (with custom's in §7). Streaks, the Hard board and *Against the odds* stay listed in §4 as not chosen, so they aren't proposed again as new (lessons §7).
