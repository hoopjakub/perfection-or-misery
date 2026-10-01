# 01 · The Champions League, compared

> Part of [the Europe research](00-README.md). Status: **research**, 28 September 2026.

How the real competition works (2025–26 and 2026–27 regulations, archived in The Dugout's `docs/reference/uefa/`), set against how this game plays it (code as of 28 September 2026).

## 1 · The shape

| Part | Real | This game | Verdict |
|---|---|---|---|
| Field | 36 clubs in the league phase | 36 | Right |
| League phase | 8 games: two opponents from each of four pots, one home and one away | Same (`cl-draw.ts`, P8-114) | Right |
| Draw rules | No club from your own association; at most two from any one other | Same, with a proven minimum cap when a field makes "two" impossible (P8-114) | Right |
| Pots | By club coefficient; the holders top pot 1 | By rating; the holders top pot 1 (`buildCLTeams`) | Simplified (§3) |
| Table order | Points, goal difference, goals, away goals, wins, away wins, then opponents' points and more | Points, goal difference, goals (`sortTable`) | Close enough; ties past goals are rare |
| Knockout play-off | 9th–24th; 9th–16th seeded against 17th–24th, in pairs set by position (9/10 v 23/24 and so on) | 9th–24th shuffled at random (`simulateCLKnockoutsOnly`) | **Wrong** |
| Round of 16 | A bracket fixed by league-phase position: 1st/2nd meet the winners of the 15/16 v 17/18 ties, and so on down | Top eight drawn at random against play-off winners | **Wrong** |
| Quarter-finals on | The same fixed bracket | A fixed tree from the round of 16 | Right in shape |
| Legs | Two legs to the semi-finals, no away goals, extra time then penalties | Same | Right |
| Final | One match at a neutral ground | Same (P8-93's venues) | Right |

## 2 · Qualifying

This game builds the whole 2026–27 access list from every association's final table (`cl-access.ts`, `uefa-coefficients.ts`): 29 clubs straight into the league phase, and four qualifying rounds on two paths, a Champions Path for champions and a League Path for runners-up and below. That part is right, down to the European Performance Spots.

**What's missing: nobody falls.** In reality every qualifying loser drops into a lower competition:

| Lost in | Drops to |
|---|---|
| Q1 (Champions Path) | Conference League Q2 (Champions Path); two of them get byes to Q3 |
| Q2 (Champions Path) | Europa League Q3 (Champions Path) |
| Q2 (League Path) | Europa League Q3 (Main Path) |
| Q3 (Champions Path) | Europa League play-off round |
| Q3 (League Path) | Europa League league phase |
| Play-off (both paths) | Europa League league phase |

Today a club that loses a qualifier is out of Europe, and in the full path your run ends with it (`playerFinalRound: 'q1_exit'` and so on). See [05](05-THE-FULL-PATH.md) for how the drop is played.

*As built, 28 September 2026 (P8-52):* the drop is in. A Champions League qualifying loser drops into the Europa or Conference League as the table above says, and in the full path your season goes on there ([05](05-THE-FULL-PATH.md) §3).

## 3 · Pots and seeding

The real pots come from club coefficients ([03](03-COEFFICIENTS.md)). This game has no coefficient for most clubs, so it seeds by rating. For a field of real clubs in a real season, the two orders mostly agree at the top and differ in the middle: an old giant in a poor spell is pot 1 by coefficient and pot 2 or 3 by rating. The new Europa League and Conference League modes use the **real** 2025–26 pots, because their fields are the real ones ([02](02-EUROPA-AND-CONFERENCE.md) §5).

## 4 · The holders

The title holders qualify for the league phase. If they've already qualified through their league, the place they don't need isn't passed down their league; it ripples through the qualifying structure instead (byes for Q1 losers into the Conference League). The Dugout found this the hard way and fixed it; this game keeps the 2026–27 holders static (`ensureHolders`), which is right for the one season it plays.

## 5 · What to change

1. **The knockout draw by position.** The play-off pairs and the round-of-16 bracket from league-phase positions, as UEFA does. Small, contained, and it makes finishing 1st rather than 8th mean something. (Proposal; with P8-71's phase two, since every competition shares the knockout builder.)
2. **The drop.** Qualifying losers into the Europa and Conference Leagues: the heart of [05](05-THE-FULL-PATH.md).
3. **Coefficient pots:** not until a multi-season mode exists ([03](03-COEFFICIENTS.md) §4).
