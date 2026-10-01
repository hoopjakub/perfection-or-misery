# 07 · The European path: any of the three, and how to hunt one

> Part of [the Europe research](00-README.md). Status: **as built**, 1 October 2026; measured and planned 29 September. Two changes from the plan, both measured: aiming swaps you for the weakest club at your entry point instead of moving it down (moving it left league phases at 37), and "The long way" is four qualifying ties, not five (four is the most a season can have you play). The instrument is `scripts/measure-europe.ts`. Companion: [`05-THE-FULL-PATH.md`](05-THE-FULL-PATH.md) (what's built), [`06-CUPS-FOR-EVERY-NATION.md`](06-CUPS-FOR-EVERY-NATION.md).

The maintainer, 29 September, on the full path: "I actually hope it's done in a way that you can go into anything, so it's like a European full path… the full path itself needs other achievements, since now just doing easy, medium or hard is bad, since you can win the UCL, or Europa, or Conference, so it should have tiers. This also poses the question: how does someone who is actively hunting the Conference League on hard mode in the full path do it? Do they just have to get lucky?"

The first half is built: since 28 September a full-path season goes on in whichever competition your finish, your cup or a drop puts you in. The second half is the question this document answers, with numbers.

---

## 1 · The measurements

All from one scratch script (`measure-path.ts`, kept in the session's scratchpad, not the repo) on the real 53 associations, 29 September 2026. **Provisional:** no rotation, injuries or suspensions (the live screens have them), and one difficulty tilt per line.

**Method.** The player's club is drawn uniformly from all 719 clubs (as `CustomCLPlacement` does today). Every league is played, every cup, the three qualifying ladders with their drops, then the player's league phase and knockouts, with the player's XI at a fixed team OVR. 300 seasons a line for where a season ends; 500 league phases a line for how often it's won.

### 1.1 What team OVR does a drafter end with?
A greedy drafter (each spin, take the best-rated player who naturally fits any open slot; a spin with no fit is spun again; 4-3-3, no rerolls; 400 drafts) ends at **83 to 86, median 85** (p10 83, p90 86, max 87; `draft_ovr.py`). That's a competent player; it isn't every player, but it's the range that matters. The other side of the comparison: the median club in the game is **66**, and the median entrant of each competition's league phase is 86 (UCL), 79 (UEL) and 72 (UECL).

### 1.2 Where a season ends (uniform draw, hard)

| Team OVR | No Europe | Champions League | Europa League | Conference League | Out in UECL qualifying |
|---|---|---|---|---|---|
| 74 | 31% | 4% | 16% | 27% | 22% |
| 80 | 18% | 21% | 44% | 13% | 5% |
| 86 | 4% | 58% | 34% | 5% | 0% |

("Ends" means the competition the season went on in: its league phase, or, for the last column, its qualifying.)

Two things follow. **A strong XI is nearly always in the Champions League or Europa League**; at 86 it's in the Conference League in one season in twenty. And **the draw barely steers it**: by association group at OVR 80 on hard, a small-country club (associations 34–55) ends in the Conference League 15% of the time, the same as any mid-ranked country (16–33: 20%; 6–15: 16%), because a strong XI wins its league and climbs its qualifying. The one group that behaves differently is the top five leagues (83% get no Europe, because a strong XI in a 20-club league of strong clubs often finishes outside the places).

### 1.3 How often a league phase is won

Once you're in it, from a random slot of a real field:

| Team OVR | Champions League | Europa League | Conference League |
|---|---|---|---|
| 74, medium | 0.0% | 0.0% | 0.4% |
| 80, medium | 0.0% | 0.0% | 3.0% |
| 86, medium | 1.2% | 3.4% | 18.4% |
| 80, hard | 0.0% | 0.0% | 0.6% |
| 86, hard | 0.0% | 0.2% | 8.4% |

### 1.4 So: the chance a run ends in a trophy (86, hard)

| Competition | In its league phase | Wins it | Per run |
|---|---|---|---|
| Champions League | 58% | 0.0% | about 0% |
| Europa League | 34% | 0.2% | 0.07% |
| Conference League | 5% | 8.4% | **0.4%**, about one run in 240 |

(Medium at 86: 0.7%, 1.1% and 0.9%, using the hard table's shares of where a season ends; that distribution was measured on hard only, over 40 seasons for medium, which agreed within a few points.)

## 2 · What the numbers say

1. **Yes, hunting the Conference League on hard is luck, twice over.** The season has to put you in it (5%), and then you have to win it (8%). It is still the most winnable trophy per run at the top of the range, because the Conference League's field is the weakest.
2. **Winning any European trophy on hard is nearly out of reach for a typical XI** (about half a percent a run, all three together). That may be intended (the game is called Perfection or Misery), but it should be a decision, not a side effect. The classic Champions League mode has the same engine and the same 0.0 to 1.2% at 86, so the full path isn't harder than its parent.
3. **The score weights (1.0, 0.8, 0.65) follow prestige, and difficulty runs the other way.** A Conference League win is worth 65% of a Champions League win and is 10 to 30 times as likely. That's fine for a score (the ladder rewards rounds reached), but it means a Ranks board that mixes the three is mostly Conference League winners at the top of the winners' band.
4. **"Aiming" through the draw can't work.** The draw picks the club, and the club barely matters (§1.2). Only a change in what your finish decides can let a player choose a competition.

## 3 · Ways to let a player hunt a competition

| Option | What the player gets | Cost | Fairness |
|---|---|---|---|
| **A · Luck, made visible** | Today, plus the draw's reveal saying where your league's finish leads (the stakes list already does) and a Ranks filter per competition | Almost nothing | Honest; hunting is a lottery |
| **B · Aim** | A "Your target" choice before the draw: *Wherever it leads* (today), *Champions League*, *Europa League*, *Conference League*. With a target, your season decides your **entry round in it**, never your competition | A rule change in `simulateEurope`, a chip on the difficulty screen, a score multiplier | A fixed-target run is easier than a lucky one, so it carries a lower multiplier and its own leaderboard |
| **C · Reroll the draw** | The difficulty's rerolls also apply to the draw: spin again for a different club | Small | Doesn't help (§2.4): the club barely steers the outcome |
| **D · Three modes** | Champions League path, Europa League path, Conference League path as mode cards | Three cards, three achievements | Same as B, with more menu |

**Recommendation: A now, B as the answer to the maintainer's question.** **Decided 29 Sept (E1): A and B,** B as a setting in Settings → *Achievement hunting* (§8).

**How B works.** With a target chosen:
- The domestic season and the cups are played as they are, and their result decides **how deep** you enter the target competition, from its rules: a champion of association 1 to 10 enters the Champions League's league phase; a champion of 34 to 55, its first qualifying round; a lower finish, a lower round or a longer road; a finish that earns no place at all still enters the competition's earliest round, so nobody is shut out of hunting.
- You never drop into another competition. A loss in the target's qualifying ends the run, as a loss in the Conference League's does today.
- The score is the target competition's ladder (`uel_…`, `uecl_…`) times a **target multiplier** below 1 (a starting guess of 0.7 for the Conference League, 0.85 for the Europa League, 0.9 for the Champions League, to be tuned by the measurement in §7 step 1), because the run didn't have to earn its way to the competition.
- The run is tagged with its target, so Ranks can show *Wherever it leads* and each target as separate boards. A target run is never on the *Wherever it leads* board.
- The winning chance is then the number in §1.3 for that competition, times the chance of surviving the qualifying that your finish entered you at (small for the weakest entries).

**Why not just make the Conference League the default lower bound?** Because a player with an XI at 85 would then never see the Champions League by accident, and the ladder's whole appeal (drop from the Champions League, come up the hard way) is the drop.

## 4 · Names and tiers

### 4.1 The mode's name
Today: "UEFA Champions League · Full path" (`MODE_LABELS.champions_league_custom`, `src/theme.ts:158`; the card in `src/data/modes.ts:49`), tagged "UCL Full Path" (`tiers.ts:132`), and its achievement "Win the full UCL journey" (`achievements.tsx:26`), even though an Europa or Conference League win counts.
**Proposal: "European Full Path"**, tagged "EUROPE", card line "Every league and cup played. Your season puts you in the Champions, Europa or Conference League; lose in qualifying and you drop." The id `champions_league_custom` stays, because saved runs carry it. The Champions League's crest stays on the card until the maintainer picks a mark for "Europe" (the UEFA marks are an open decision for a public release, [`../ui-overhaul/02-VIBECODE-AUDIT.md`](../ui-overhaul/02-VIBECODE-AUDIT.md) TRU-12).

### 4.2 The tiers (what a run ends as)
Already built ([`05-THE-FULL-PATH.md`](05-THE-FULL-PATH.md) §5): the knockout names, prefixed with the competition, scored at 0.8 and 0.65. What's missing is telling them apart on the screens that show one tier: Home's *Best tier* and the Runs list read the tier's label ("Europa League quarter-finalists"), which is right; the tag beside it says "UCL Full Path", which is the mode name (§4.1).

## 5 · Achievements

### 5.1 Today
`MODE_META` in `app/game/achievements.tsx` has one row per mode with **Easy, Medium, Hard and Custom** patches; the full path's row says "Win the full UCL journey" and any of the three trophies fills it (`isRunWon`, `src/lib/feats.ts`).

### 5.2 Proposal: the grid
The European Full Path row becomes a grid, one line per competition:

| | Easy | Medium | Hard | Custom |
|---|---|---|---|---|
| Champions League | patch | patch | patch | hardest won |
| Europa League | patch | patch | patch | hardest won |
| Conference League | patch | patch | patch | hardest won |

Nine patches and three "hardest won" lines. A run fills the line of the competition it won in (from its tier prefix). If option B ships, a target run fills the same grid on its own layer ("aimed") so that a lucky win and an aimed win are both collectable and neither counts as the other.

### 5.3 New feats (`src/lib/feats.ts`)
Each is checked from a saved run alone, like the existing seven, so past runs count. `tier` carries the competition, and the ties are in `cl_result._customUclQual`, so the route can be read back.

| Feat | Rule |
|---|---|
| **Cup route** | Won a European trophy after entering it as a cup winner (the entry's `viaCup`) |
| **Fallen giant** | Entered the Champions League qualifying, dropped, and won the Europa League or the Conference League |
| **Straight through** | Won the Champions League after entering at its league phase without playing a qualifying tie |
| **The long way** | Won a European trophy after playing five or more qualifying ties |
| **Three trophies** | Won each of the three in different runs (a collection, on Achievements) |
| **The Double, Europe** | Won a league and its cup **and** a European trophy in one run (only on the full path, where all three exist) |

**Provisional:** *The long way* needs a threshold that isn't guessed; it comes from the distribution of qualifying ties among winners, which `verify-europe-path` can print.

## 6 · Ranks

The full path's board mixes the three competitions and every target. Ranks already filters by mode; it needs one more filter, **Competition** (Champions League, Europa League, Conference League, all), read from the tier's prefix (`tier like 'uel_%'`). The runs table has the tier already, so this is a query, not a migration. Under option B, a *Target* filter beside it.

## 7 · Implementation

Each step ends with typecheck and the `verify-*` scripts green, and names what the maintainer checks on a phone.

### Step 1 · Keep the measurement
**Build.** `scripts/measure-europe.ts` from the scratch script (where seasons end, how often each competition is won at team OVR 74, 80, 86, 92), with the draft OVR distribution beside it. It prints and doesn't fail: it's the instrument for the tuning in step 3.
**Done when.** It runs in under five minutes and prints §1's tables; a change to `europe-path.ts` that shifts a number more than a few points shows up.

### Step 2 · Name, tiers and achievements
**Build.** §4.1's name, §5.2's grid (`MODE_META` becomes a competition-aware row; `computeAchievements` reads the tier's prefix), the Ranks competition filter (§6).
**Done when.** `verify-feats` covers each cell of the grid; `grep -rn "full UCL journey" app src` is empty. **Maintainer checks:** Achievements shows nine patches; Ranks filters by competition.

### Step 3 · Aim (option B), decided (E1)
**Build.** Settings → *Achievement hunting* → *European target* (Wherever it leads / Champions League / Europa League / Conference League), stored with the other settings and copied onto the run at its start so changing it mid-run does nothing; a "Hunting: Europa League" tag on setup, the draw and the result; the entry-round rule in `simulateEurope`; the target multiplier in `score.ts`; the target on the run and the board.
**Done when.** `verify-europe-path` checks that a target run never leaves its competition, that every association's finish maps to an entry round, and that the score is the ladder times the multiplier; `verify-score` covers the multiplier. **Redeploy `submit-run`.**

### Step 4 · The feats of §5.3
**Build.** The six rules and their `verify-feats` cases.
**Done when.** Each feat has a run that earns it and a near-miss that doesn't.

## 8 · Open decisions

| # | Decision | Default if nobody decides |
|---|---|---|
| E1 | Ship option B (aim), or leave hunting as luck (A only) | **Decided 29 Sept: B.** "Aim" means exactly that: you pick the competition you're hunting (Champions, Europa or Conference League) and your season only decides how deep you enter it, never which one (§3). It lives in **Settings, under a new subcategory "Achievement hunting"** (more hunting settings will join it later), not as a chip on the difficulty screen: a setting that stays on until you turn it off, shown as a tag on the run's setup and result so a hunting run is never mistaken for a normal one. Default value: *Wherever it leads* (today's behaviour) |
| E2 | The mode's name: "European Full Path" | As proposed |
| E3 | Is half a percent a run for a European trophy on hard intended? | Keep; it matches the classic Champions League |
| E4 | One board for the three competitions, or one each | One each, with an "all" |
| E5 | The target multipliers (if B) | 0.7, 0.85, 0.9, tuned in step 3 |
| E6 | A mark for "Europe" on the mode card | Keep the Champions League's until TRU-12 is decided |

## 9 · Left out

| What | Why | When |
|---|---|---|
| A separate mode per competition (option D) | More menu for the same runs | If the maintainer wants three cards |
| Coefficient-based pots | A multi-season idea ([`03-COEFFICIENTS.md`](03-COEFFICIENTS.md) §4) | With a multi-season mode |
| The measurement with injuries and rotation | The live screens have them; the headless script doesn't | If the numbers matter to a decision |
