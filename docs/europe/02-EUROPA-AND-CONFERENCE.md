# 02 · The Europa and Conference Leagues

> Part of [the Europe research](00-README.md). Status: **research, and as built for §5**, 28 September 2026.

## 1 · Formats

| | Champions League | Europa League | Conference League |
|---|---|---|---|
| League phase | 36 clubs | 36 clubs | 36 clubs |
| Pots | 4 of 9 | 4 of 9 | **6 of 6** |
| Games | 8: two from each pot | 8: two from each pot | **6: one from each pot**, three at home and three away |
| Straight to the round of 16 | 1st–8th | 1st–8th | 1st–8th |
| Knockout play-off | 9th–24th | 9th–24th | 9th–24th |
| Out | 25th–36th | 25th–36th | 25th–36th |
| Knockouts | Two legs, final one match | Same | Same |

The Europa League is the Champions League's shape exactly, so it plays on the same engine. The Conference League differs only in its league phase: six pots and one opponent from each, which is the same draw problem with other numbers (every side meets one club from each of the six pots, one home or away each, no club from its own association).

## 2 · Who enters: the Europa League (2026–27)

| Round | Enters here | Comes up from the round before | Drops from the Champions League |
|---|---|---|---|
| Q1 (12) | Cup winners, associations 21–33 | | |
| Q2 (18) | Cup winners 16–20; 3rd-placed 7–12; 4th-placed 6 | Q1's 6 winners | |
| Q3 Champions Path (12) | | | Q2's 12 Champions Path losers |
| Q3 Main Path (14) | Cup winners 13–15 | Q2's 9 winners | Q2's 2 League Path losers |
| Play-off (24) | Cup winners 8–12 | Q3's 13 winners | Q3's 6 Champions Path losers |
| League phase (36) | The Conference League holders; cup winners 1–7; 5th-placed 1–5 | The play-off's 12 winners | 5 + 2 play-off losers; 4 Q3 League Path losers |

The holders of the Conference League go up into the **Europa** League, and the Europa League's holders up into the Champions League. A winner never defends his title in the same competition. The Dugout had this wrong and fixed it.

## 3 · Who enters: the Conference League (2026–27)

| Round | Enters here | Comes up | Drops |
|---|---|---|---|
| Q1 (52) | Cup winners 45–55; runners-up 34–55; 3rd-placed 30–50 | | |
| Q2 Champions Path (12) | | | Champions League Q1 losers |
| Q2 League Path (86) | Cup winners 34–44; runners-up 16–33; 3rd-placed 13–29; 4th-placed 7–15; 5th-placed 6 | Q1's 26 winners | Europa League Q1's 6 losers |
| Q3 Champions Path (8) | | Q2 CP's 6 winners | 2 Champions League Q1 losers (byes) |
| Q3 League Path (52) | | Q2 LP's 43 winners | Europa League Q2's 9 losers |
| Play-off CP (10) | | Q3 CP's 4 winners | Europa League Q3 CP's 6 losers |
| Play-off LP (38) | 6th-placed 1–5 (England: the EFL Cup winner) | Q3 LP's 26 winners | Europa League Q3 main-path's 7 losers |
| League phase (36) | | The play-off's 5 + 19 winners | Europa League play-off's 12 losers |

Every association sends someone to Europe; only Russia (suspended) has no place. Liechtenstein has no league, so its cup winner is its only entrant.

## 4 · What a small association's season looks like

A club from association 40 wins its league and starts in Champions League Q1. It loses, and drops into Conference League Q2 (Champions Path). It wins twice there and reaches the Conference League's league phase: six games against clubs it has never met. That's most of what a coefficient means to a small league, and it's why the full path ([05](05-THE-FULL-PATH.md)) has to include the drop.

## 5 · As built (28 September 2026): two new modes

**Europa League** and **Conference League**, beside the Champions League, each on its **real 2025–26 league-phase field and pots**.

- **The field.** The 36 clubs and their pots come from the archived draw (UEFA's pots by 2025 club coefficient). Each club plays its real 2025–26 domestic squad: the same club-seasons the full path uses, copied into the competition as its own league in the bundled database (`uel_2025`, `uecl_2025`), the way the Champions League's editions are.
- **Your place.** Your XI replaces a club in the field and takes its pot, as in the Champions League mode.
- **The league phase.** The Europa League uses the Champions League's four-pot draw. The Conference League uses a six-pot draw (one from each pot, three home and three away), with the same country rule.
- **The knockouts** are the Champions League's: the play-off, the round of 16, two legs, a neutral final.
- **Scored and ranked** on the knockout ladder like the Champions League, with boards of their own on Ranks.
- **The pundits** make their own Conference League draw the same way: six pots by their ratings, one opponent from each (`onePerPotPairs` in `cup-calls.ts`).
- **In the full path** (P8-52) both competitions are reached for real, by league place, cup or drop ([05](05-THE-FULL-PATH.md)).

Not built: a Europa or Conference League of any season but 2025–26 (the archive has the draw for that one).
