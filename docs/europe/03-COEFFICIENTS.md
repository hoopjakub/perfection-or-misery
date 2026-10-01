# 03 · Coefficients

> Part of [the Europe research](00-README.md). Status: **research**, 28 September 2026.

## 1 · The association coefficient

Five seasons of an association's clubs in Europe. In each season, every club earns:

- **2 points a win, 1 a draw** in the main stages; **halved** in qualifying. Extra time counts; a shootout doesn't (the match counts as a draw).
- **Bonus points** for reaching the league phase and for each knockout round reached (larger in the Champions League).

The association's season score is its clubs' total **divided by the number of clubs it sent**, truncated to three decimals. Its coefficient is the sum of the last five season scores. The ranking by that sum decides the next access list: how many clubs go, and **how far in they enter** ([02](02-EUROPA-AND-CONFERENCE.md)).

## 2 · The club coefficient

A club's coefficient is the **larger** of:

- its own points over the last five seasons, or
- **20% of its association's** coefficient over the same period.

The floor stops a club from a strong league being seeded as a nobody the first time it plays in Europe. Club coefficients decide the **pots** for every draw, qualifying and league phase alike.

## 3 · What they decide, and where this game stands

| Decides | Real | This game |
|---|---|---|
| How many places an association gets, and where they enter | The association ranking | A fixed 2026–27 ranking (`uefa-coefficients.ts`), right for the one season played |
| Pots in the league phase | Club coefficients | By rating (Champions League, full path); the **real** pots in the new Europa and Conference League modes |
| Seeding in qualifying | Club coefficients | Not seeded: drawn at random within each round and path |
| European Performance Spots | The two associations whose clubs did best in the season just ended | Fixed (England and Spain for 2026–27) |

## 4 · Why coefficients stay a snapshot here

A coefficient is a record of five seasons, and this game plays **one** season a run. There's no next summer for a result to move a ranking into, so a moving coefficient would be scenery. The Dugout, a career game over many seasons, computes it from its world's own results; that's the right design **there**.

If a multi-season mode ever comes (a career path through several European seasons), the port is ready: The Dugout's `COEFFICIENT`, `clubCoefficient` and `rankAssociations` (`src/world/uefa.ts`) are pure and verified.
