# 04 · Domestic cups

> Part of [the Europe research](00-README.md). Status: **research, and as built for §4**, 28 September 2026.

## 1 · Every cup winner goes to Europe

Every association's cup winner enters the Europa League or the Conference League, and how far in depends on the association's rank (2026–27 access lists, [02](02-EUROPA-AND-CONFERENCE.md)):

| Association rank | The cup winner enters |
|---|---|
| 1–7 | Europa League, league phase |
| 8–12 | Europa League, play-off round |
| 13–15 | Europa League, Q3 (main path) |
| 16–20 | Europa League, Q2 |
| 21–33 | Europa League, Q1 |
| 34–44 | Conference League, Q2 (league path) |
| 45–55 | Conference League, Q1 |

England is the one association with two cups in the list: the FA Cup winner takes the Europa League place, and the **EFL Cup** winner takes England's Conference League play-off place, which is otherwise its sixth-placed club's.

## 2 · When the winner has already qualified

Most years a big club wins the cup and has already qualified through the league. **The cup place then passes down that league's table**: to the best-placed club that hasn't already qualified for Europe. The place keeps its competition and round; only who fills it changes. (The Dugout: "a CUP winner already qualified passes his berth down that league's table".)

A title holder is the opposite case: a holder who has already qualified through the league doesn't pass anything down the league; the unused place ripples through the qualifying structure as byes ([01](01-CHAMPIONS-LEAGUE.md) §4).

## 3 · The cups themselves

Most cups are single-leg knockouts from the whole pyramid, the big clubs joining in the later rounds. Some are two-legged in the semi-finals (the Coppa Italia, the Copa del Rey). The final is usually at a fixed national ground: Wembley, the Olympiastadion in Berlin, the Stade de France.

This game has each league's **top flight only**, so a cup here is the top flight's clubs, with a preliminary round or byes to make a bracket of sixteen. That's said on screen rather than pretended otherwise.

## 4 · Decision (P8-173): the cup is part of the league run

The maintainer offered two ways: fold the cup into the league mode, so a run is a literal full season, or make cups a mode of their own. **Folded in.** A season in this game is already a whole year of a real league. The cup running beside it is what makes it a season, and it gives the full path the cup winners its access list needs ([05](05-THE-FULL-PATH.md)). A cup-only mode would be five matches with nothing around them.

**As built (28 September 2026):**

- **The draw.** Every league run (league, All Time, Chaos, Cursed) has its league's cup. It's seeded from the run, so a saved run's cup is the same when opened again. The top flight's clubs make a bracket of sixteen: with twenty clubs, the eight rated lowest play a first round for four places; a smaller league gives its best clubs byes.
- **When it's played.** The rounds fall between matchdays through the season: the first round a sixth of the way in, the last sixteen, the quarter-finals and the semi-finals spread after it, and the final after the last matchday.
- **Your ties.** One match each, extra time and penalties if it's level, the final at a neutral ground. Your tie is shown as the round lands, with the round's other results.
- **The result.** The result screen has the cup: how far you got, the final, the winner. Winning the league and the cup is **the Double**.
- **Honours, not points.** The run's score still comes from the league (the score is checked on the server, and changing it would move every board). The cup is an honour on the verdict and two new feats: *Cup winners* and *The Double*.
