# 05 · The full path

> Part of [the Europe research](00-README.md). Status: **as built**, 28 September 2026 (P8-52).

The full path used to be the Champions League alone. Finish outside its places and the run was over; lose in its qualifying and you vanished, which isn't what happens to a real club ([01](01-CHAMPIONS-LEAGUE.md) §2). Now one European season runs through all three competitions. The domestic season and the cup decide where you start, and you go on in whichever competition you end up in.

## 1 · The season, in order

| Step | What happens | Code |
|---|---|---|
| Your domestic season | Played live, matchday by matchday, as before. | `app/game/custom-ucl-simulation.tsx` |
| The rest of Europe | The other 52 associations' leagues, played headless. | `simulateLeagueTableDetailed` |
| The cups | Every association's cup, played out whole, yours included (at your team's rating). | `playEveryCup`, on P8-173's `domestic-cup.ts` |
| The Champions League field | Its access list from the tables, and the holders, as before. | `buildCLAccessList`, `ensureHolders` |
| The Europa and Conference League fields | Their access lists, one club one competition (§2). | `europaAndConferenceEntrants` |
| The summer | Three qualifying ladders with the drops (§3). | `simulateEurope` |
| Your competition | Its league phase (four pots of two, or six of one) and its knockouts. | the Champions League's engine with the competition's shape (`src/data/europe.ts`) |

All of it is in `src/engine/europe-path.ts`, pure apart from the match engine's randomness.

## 2 · Who goes where

The Champions League's entrants are taken first. Then the Europa League's and the Conference League's rules are applied in that order, deepest entry first. The rules are The Dugout's lists, rewritten against UEFA's own, plus the Europa League play-off cup winners (associations 8–12), which The Dugout's list is missing; [02](02-EUROPA-AND-CONFERENCE.md) §2–3 has the tables.

- **One club, one competition.** A club already in takes nothing more, and the place looks one position further down its league's table.
- **A cup winner already in passes the place down.** The best-placed club with nothing yet takes it, and it stops being a cup place when it does ([04](04-DOMESTIC-CUPS.md) §2).
- **The holders never defend in the same competition.** Paris Saint-Germain (Champions League holders) and Aston Villa (Europa League holders) go into the Champions League's league phase. Crystal Palace (Conference League holders) go into the Europa League's. The names are from UEFA's archived 2026–27 access lists (`EURO_HOLDERS`).
- **A holder already in leaves a place empty.** UEFA refills it by moving the best-ranked entrant of the round below up one (its "rebalancing"). Here that's the first Europa League play-off entrant into the league phase. Without it the Europa League had 35.

## 3 · The summer: three ladders and the drops

Round by round (Q1, Q2, Q3, the play-off), the Champions League first, then the Europa League, then the Conference League. So each round's losers are in hand before the round they drop into. Every tie is two legs with the same seeding and byes as before (`playRound` in `cl-qualifying.ts`).

| Losers of | Drop into |
|---|---|
| Champions League Q1 (Champions Path) | Conference League Q2, Champions Path |
| Champions League Q2 (Champions Path) | Europa League Q3, Champions Path |
| Champions League Q2 (League Path) | Europa League Q3, main path |
| Champions League Q3 (Champions Path) | Europa League play-off |
| Champions League Q3 (League Path) | Europa League league phase |
| Champions League play-off | Europa League league phase |
| Europa League Q1 | Conference League Q2, League Path |
| Europa League Q2 | Conference League Q3, League Path |
| Europa League Q3 (Champions Path) | Conference League play-off, Champions Path |
| Europa League Q3 (main path) | Conference League play-off, League Path |
| Europa League play-off | Conference League league phase |
| Conference League, any round | Out of Europe |

The Europa League's two third-round paths meet in one play-off. The Champions and Conference Leagues keep their two paths to the end.

**Byes and a full 36.** An odd round gives its strongest side a bye. That sends one club too many up and one loser too few down, so a league phase could come out a place short. That place goes to the best-rated loser of the competition's own play-off (taken back from the league phase below if he'd dropped into it), and the competition below then does the same in its turn. Real UEFA avoids the problem by balancing every round's numbers in advance; this keeps the numbers right whatever the byes do.

## 4 · What you see

- **Your domestic result** says where the season took you: the competition, the round and the path, and whether it was as cup winners. Your league's cup has a line of its own.
- **The ceremony** is the rest-of-Europe screen, skippable as before. The champions come in one by one, then the three holders and where each plays, then every cup winner.
- **The league tables** mark what each finish earns in all three competitions (`UCL`, the Champions League qualifying rounds, `UEL`, `UECL`), and so does the placement's stakes list.
- **Qualifying** shows one ladder at a time, yours first, with a switch between the three. Your own tie is watched live whichever competition it's in.
- **After qualifying:** into the competition you ended in, or out. A drop is said as one ("You dropped from the Champions League and came through").
- **The league phase and knockouts** carry the competition's name, shape and matchday count. The Conference League shows "Your six".
- **The verdict** names the competition, and its qualifying section shows your ties wherever they were, plus the ladder of the competition you ended in.

## 5 · Tiers and scores

A season that goes on in the Europa or Conference League climbs that competition's ladder. The tiers carry the competition as a prefix (`uel_qf_exit`, `uecl_winner`) and are scored with the classic modes' weights (0.8 and 0.65 of the Champions League's, round for round). Going out in the Conference League's qualifying is the only exit that doesn't drop into anything; it scores under that league phase and over not qualifying:

| Tier | Score |
|---|---|
| `not_qualified` | 20 |
| `uecl_q1_exit` / `q2` / `q3` / `quali_playoff` | 40 / 60 / 85 / 110 |
| `uecl_league_exit` … `uecl_winner` | 130 … 1073 |
| `uel_league_exit` … `uel_winner` | 160 … 1320 |
| `league_exit` … `winner` (Champions League) | 200 … 1650 |

The server scores with the same file (`supabase/functions/_shared/score.ts`), so `submit-run` needs redeploying. A Europa or Conference League trophy counts as a trophy for the feats. Older runs keep their Champions League tiers.

## 6 · Checked

`scripts/verify-europe-path.ts` plays 318 seasons on the real 53 associations (six player clubs per association):

- every league phase is 36, every time;
- no club is in two competitions, or twice in one round;
- a loser never plays on in the competition he lost in;
- every Champions League qualifying loser drops into another competition;
- the Conference League's holders never defend it;
- your season adds up: where you came in, where you went on, one league phase or out;
- each competition's field draws under the full rules in its own shape;
- every tier the path can give has a score, a name and the right verdict.

## 7 · Not done

- **Coefficient pots.** The pots are by rating, as before ([03](03-COEFFICIENTS.md) §4).
- **The Europa League's qualifying for clubs that aren't in the data.** An association with no clubs sends nobody, and the ladder shrinks around it, as The Dugout does. All 53 active associations are in the data today.
- **England's EFL Cup place** in the Conference League (its play-off place stays with the sixth-placed club).
- **The Super Cup**, and multi-season coefficients.
