# 07 · Fresh ideas: what to lean into

> Part of the Wave G audit. Start at [`00-README.md`](00-README.md).
> Status: **proposals, 2 October 2026.** None of these is in the build plan yet. Each says what it buys, what it costs, what it depends on, and when it's worth bringing in. The maintainer picks.

The rule for this list: an idea earns a place only if it makes the loop the game already has (draft from random real club-seasons, get dropped somewhere, watch it play out, get judged) better or more worth repeating. Transfers, tactics and new modes for their own sake are out ([`06-CRITIQUE-CHECKED.md`](06-CRITIQUE-CHECKED.md) §3).

---

| # | Idea | What it buys | Cost | Depends on | Bring in when |
|---|---|---|---|---|---|
| I-1 | **The daily draft.** Once a day, everyone gets the same seed: the same spins, the same placement. One attempt, its own board on Ranks | A reason to open the app every day, and a fair comparison with friends (same cards dealt) | Medium: a day's seed from the date, the draft and placement reading it, a board filtered by it | Seeded spins and placement (part of I-6) | After phase two; the strongest retention idea here |
| I-2 | **"The one that got away."** On the result screen, one line: a player you spun past and didn't pick, and what they did that season | Makes the draft's choices matter after the draft; a story only this game can tell | Small: the spins are known; the player's season comes from the run's stats | Spins kept on the run (they're in memory today) | With Wave F, as one of the result's three highlights |
| I-3 | **A season in one card.** The run's three best press headlines, the final table's top and your place, the score, shareable | The share that sells the game; built from parts that exist (press, `ShareLinkPlate`, the story share card) | Small | The press in every stage (phase two step 7) for cups | With Wave F |
| I-4 | **Rivals.** The club that beat you most, or the one you finished just above, named on the result and carried into career | Turns tables into stories; career gets a second axis | Small: computed from the run's matches | — | With Wave F's highlights |
| I-5 | **Pundit grades over time.** Each pundit's accuracy across your runs, on the career screen ("Ruud Verhoef has called you right 3 of 11 times") | The pundits become characters you know | Small: `pundits_on_you` is already saved per run | — | Any time; good Phase 10 website material too |
| I-6 | **Seeded results.** One run seed; every result, draw and shuffle drawn from streams of it | The server can replay a run and check it (03 S-2); any bug reproduces from a run id; I-1 becomes possible | Large: every caller of `simulateMatch`, the seven shuffles (L-14), the draft and placement | Phase two step 2 does the shuffles first | Before a public leaderboard, or as soon as I-1 is wanted |
| I-7 | **Ghost run.** Open a friend's saved run and play the same placement with your own draft | Head-to-head without being online at the same time | Medium | I-6 | After I-1 proves the appetite |
| I-8 | **Hunting, extended to the World Cup.** "Aim at" a semi-final or a title with a nation from a lower pot, scored like European hunting (P8.5-27) | Gives weaker nations a goal; reuses the hunting score | Small | — | Any time |

## Recommended

**I-2 and I-4 inside Wave F** (they give the short result screen its three highlights; see [`08-RESULT-PAGES.md`](08-RESULT-PAGES.md) §3), **I-3 with Wave F's share**, and **I-1 as the first thing after phase two**, which means doing **I-6** at the end of phase two (open decision D-4 in the README).
