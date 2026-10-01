# 00 · Europe: the research (P8-172, P8-173, P8-52)

> Status: **research, with the build it led to recorded as built** (28 September 2026). **Extended 29 September 2026** with [06](06-CUPS-FOR-EVERY-NATION.md) and [07](07-THE-EUROPEAN-PATH.md), the maintainer's next questions.
> Roadmap: [`../ui-overhaul/11-ROADMAP.md`](../ui-overhaul/11-ROADMAP.md), items P8-172, P8-173 and P8-52.

## What this is

The maintainer asked, on 26 September 2026, for a separate, long research pass into the Champions League, compared with how this game plays it, and "now, not later" for the Europa League and the Conference League: their formats, access lists and qualifying, how a full path through either could work, how coefficients work, and which domestic cups give European places. P8-173 asked whether a domestic cup belongs inside the league mode or beside it; P8-52 asked for the full path's own cup and last season's winners.

It stands on three sources. The first is UEFA's own documents for the 2025–26 and 2026–27 seasons, archived as source text in The Dugout (`D:\The Dugout\docs\reference\uefa\`, ten files, fetched September 2026). The second is The Dugout's European engine (`src/world/uefa.ts`, `src/world/europe.ts`), which began as a port of this game's own `uefa-coefficients.ts` and grew all three competitions, their transfers and the rules for places passing down, pinned by 84 checks. The third is this game's code as it stood on 28 September 2026.

## The short version

| Question | Answer | Where |
|---|---|---|
| What does the Champions League get right, and what's missing? | The formats, the access list, both qualifying paths, the country rule in the draw. Missing: the knockout play-off and round-of-16 are drawn at random instead of by league-phase position; pots come from ratings instead of coefficients; the qualifying losers vanish instead of dropping into the Europa and Conference Leagues. | [01](01-CHAMPIONS-LEAGUE.md) |
| How are the Europa and Conference Leagues shaped? | The Europa League is the Champions League's shape (36 clubs, four pots, eight games). The Conference League is 36 clubs in **six pots, six games, one opponent from each pot**. Both have their own qualifying ladders, fed by domestic places and by the losers of the competition above. | [02](02-EUROPA-AND-CONFERENCE.md) |
| How do coefficients work? | Five seasons of results. Clubs earn 2 points a win and 1 a draw (halved in qualifying) plus bonuses; an association's season score is its clubs' points divided by how many it sent. A club's coefficient is the larger of its own five years and 20% of its association's. | [03](03-COEFFICIENTS.md) |
| Which cups give European places? | Every association's cup winner goes into the Europa League or the Conference League, at a round set by the association's rank (league phase for ranks 1–7). A cup winner who already qualified through the league passes the place down that league's table. A title holder does not. | [04](04-DOMESTIC-CUPS.md) |
| The domestic cup: inside the league mode, or beside it? | **Inside.** A league run is a full season: the league and its cup together. | [04](04-DOMESTIC-CUPS.md) §4 |
| How does a full path through three competitions work? | The domestic season decides your competition and round. The three qualifying ladders run in order (Champions League, then Europa, then Conference), each fed the losers of the one above, and you play whichever you're in. | [05](05-THE-FULL-PATH.md) |

## Reading order

| # | Document | Answers |
|---|---|---|
| 01 | [The Champions League, compared](01-CHAMPIONS-LEAGUE.md) | The real competition against ours, point by point |
| 02 | [The Europa and Conference Leagues](02-EUROPA-AND-CONFERENCE.md) | Formats, access lists, qualifying, what we built |
| 03 | [Coefficients](03-COEFFICIENTS.md) | Club and association, how they're counted, what they decide |
| 04 | [Domestic cups](04-DOMESTIC-CUPS.md) | Which cups give places, the pass-down, the league mode's cup |
| 05 | [The full path](05-THE-FULL-PATH.md) | One European season through all three competitions |
| 06 | [Cups for every nation](06-CUPS-FOR-EVERY-NATION.md) | All 55 cup names, what every association's cup needs, and where each is shown |
| 07 | [The European path](07-THE-EUROPEAN-PATH.md) | Where a full-path season ends, how hard each trophy is (measured), how a player hunts one, and its achievements and tiers |

## Decisions taken

- **The Europa League and the Conference League are playable** as their own modes, each on its real 2025–26 league-phase field with its real pots (02 §5).
- **A league run includes its domestic cup** (04 §4). One run is one full season; the verdict still comes from the league, and a cup win is its own honour on top.
- **The full path runs through all three competitions** (05). Your domestic finish or your cup can put you in any of them; losing in Champions League qualifying drops you into the Europa League or the Conference League, as in reality.
- **Coefficients stay a snapshot for now** (03 §4): this game plays one season at a time, so a coefficient that moves between seasons has no season to move into. The real pots are used where the real field is used.

## Findings from 29 September 2026

- **A strong XI is nearly always in the Champions League or the Europa League** (at team OVR 86 on hard: 58% and 34%; the Conference League 5%), and the club the draw picks barely steers it ([07](07-THE-EUROPEAN-PATH.md) §1). Hunting the Conference League is luck twice over: about one run in 240 ends in its trophy.
- **The Conference League is the most winnable trophy and the Champions League the least** (8.4% against 0.0% once you're in the league phase, at 86 on hard), the reverse of the score weights.
- **Only 10 of 53 associations have their cup's real name in the game;** the full path plays every cup and shows none ([06](06-CUPS-FOR-EVERY-NATION.md)).

## Open decisions (with the default if nobody decides)

- **Lower divisions in the cup.** A real cup has the whole pyramid; the game has top flights only. Default: the top flight's clubs, with byes where the bracket needs them, said on screen.
- **Coefficient-based pots in the full path.** Default: pots by rating, as today, until a multi-season mode exists to move coefficients.

## How it was made, and what wasn't done

Read, not guessed: every rule here was checked against the archived UEFA source or The Dugout's verified engine, and against this game's code on 28 September 2026. Not done: the real match calendar (dates, which weeks the cup rounds fall in), the Super Cups, and women's competitions.
