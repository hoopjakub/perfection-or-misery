# Next Up: Scraper Fixes & a Full World Cup Journey

This is the plan for the next chunk of work, in the order we'd tackle it. Part 1
is a data-correctness fix (small leagues are quietly wrong); Part 2 is the next
big feature — turning World Cup mode into a full qualifiers → finals journey,
the same way custom UCL already goes domestic season → qualifying → league
phase → knockouts.

---

## Part 1 — Scraper / data-quality fixes

### The bugs, as observed

- **Lithuanian top flight is misnamed.** The scraper seed has:

  ```json
  { "seedId": "lithuania_al", "name": "A Lyga", "country": "Lithuania", "assocRank": 46, "format": "double_round_robin", "games": 28 }
  ```

  The real competition is called **Toplyga** (A Lyga was the old name, pre-2024
  rebrand). Cosmetic but wrong, and an easy fix once we know which Transfermarkt
  competition slug maps to it.

- **Three different numbers for the same league, all disagreeing — and none
  of them the automated ones are right.** For Lithuania's top flight:
  - **In-app:** teams were only playing **~18 games**. This points to
    **under-parsing** — the participant scrape is dropping real teams from
    the league (the opposite direction from the earlier relegation-playoff
    leak, which *added* stray teams to the top-5 leagues — here it looks like
    teams are going *missing*), so with fewer teams than reality, the
    round-robin fixture generator naturally produces fewer total games.
  - **In the seed JSON:** `games: 28` — a hardcoded field that doesn't match
    the in-app figure either, and isn't derived from the actual parsed team
    count. It's just wrong, disconnected from both the app's own behavior and
    reality.
  - **Reality, per manual SofaScore check:** **36 games.** This is the number
    that actually matters, and neither of the other two automated/seeded
    numbers came close to it.

  So this isn't one bug, it's at least two stacked on top of each other: the
  participant scrape is likely **missing teams** for this league (which by
  itself would cascade into wrong standings, wrong fixtures, wrong everything
  downstream), and separately the seed's own `games` metadata field is stale
  or was never derived correctly in the first place.

- **The `(teams-1)*N` heuristic isn't reliable — confirmed, but it's not even
  the main problem.** Even a correct round-robin formula doesn't help if the
  **team count feeding it is already wrong** because of the parsing gap
  above. Fixing the format formula without first fixing participant parsing
  would still produce the wrong number.

### The actual fix: verify parsed team counts first, then re-derive `games`

The root issue to chase down first is **why teams are going missing from
Lithuania's participant scrape** — that's the same class of bug as the
Bundesliga/Ligue 1 relegation-playoff leak (`parseParticipants` scoping), just
in the opposite direction (dropping real teams instead of adding stray ones).
Once that's fixed, the `games` field needs to be re-derived from confirmed
reality, not left as a hardcoded guess:

1. **Audit `parseParticipants`'s team count against the real league size**
   for every non-top-5 seeded league — Lithuania's top flight is 10 teams;
   confirm the scrape is actually returning all 10, not fewer.
2. **Manually check SofaScore's real played-match history** for each league
   (as was done for Lithuania — 36 games confirmed) to get the true game
   count independent of both the scrape and the seed's current metadata.
3. Once both the true team count and true game count are confirmed, derive
   the real format (double round-robin, triple round-robin, split-season,
   etc.) and fix the seed's `games`/`format` fields to match — don't leave
   `games` as a value nobody re-derives when the underlying scrape changes.
4. **Fix the Lithuania naming** (Toplyga) and audit other leagues for
   stale/old competition names the same way (rebrands happen more often in
   smaller leagues than top-5).
5. **Re-scrape only the leagues that actually turn out wrong** once the
   participant-parsing fix lands — no need to redo the whole multi-season
   pull, this is league-specific, not global.

### SofaScore as a supplementary source

This is what surfaced the real 36-game number when both the in-app figure and
the seed JSON disagreed with reality and with each other. Treat it as the
**ground-truth check** to manually verify against, per league, whenever the
in-app number and the seed's `games` field don't independently make sense —
not an automated replacement for Transfermarkt (still the primary source for
full squads/market values), just the source you look at by hand to confirm
what a league's real schedule actually is.

---

## Part 2 — Full World Cup: qualifiers → finals

Right now World Cup mode drops you straight into the 48-team finals group
stage. The next big feature is turning this into the same kind of full
campaign custom UCL already is: **you draft a national squad and play through
qualification, not just the tournament everyone already qualified for.**

This is the "national-team journey" archetype already scoped in
`More Competitions & Modes.md` §8.1 — this section makes it concrete and
World-Cup-specific, as the actual next build target rather than a future
vision.

### The shape of it

```
Confederation qualifying campaign → 48-team finals (groups → R32 → … → final)
```

The finals stage is **already built** (groups, live matches, bracket, penalties,
subs, everything from this session). The new work is entirely the
**qualifying campaign** in front of it, plus how the finals draw itself works.

### The finals draw needs real data, not an assumption

Which teams land in which of the 48-team finals groups, and the seeding rules
governing that draw, is **real-world structural data we need to source (e.g.
from Wikipedia), not something to invent**. This includes format-specific
constraints that actively shape the bracket — for example: **the top 8 ranked
teams in the world, if seeded into separate groups and they each win their
group, are kept apart until at least the quarter-finals** (a real seeding rule,
not just "top teams get placed in different groups and then it's a free
draw"). Any full-WC build has to encode:

- The actual **pot/seeding system** for the 48-team draw (which teams are in
  which pot, and the constraints on which pots can/can't meet in the same
  group).
- The **bracket-seeding rules** that carry forward from the group draw into
  the knockout stage (the top-8-apart-until-QF rule above is one instance of
  a broader pattern — group winners/runners-up feed into a bracket that's
  NOT just "whoever's next in the list", it's seeded to keep the best teams
  apart for as long as possible).

This needs to be researched and encoded properly before the finals-draw logic
is trustworthy — it's a correctness requirement, not a nice-to-have.

### Why qualifying is hard: it's different per confederation

Real World Cup qualifying isn't one format — it's five wildly different ones,
run in parallel:

- **UEFA (Europe):** groups of 4-5, group winners direct, best runners-up into
  a playoff. Biggest pool of teams (55 associations), most groups to simulate.
- **CONMEBOL (South America):** a single round-robin league of all 10 nations,
  home and away — closest to a format we already have (custom UCL's league
  phase engine is directly reusable here, just at 10 teams / 18 games instead
  of 36 teams / 8).
- **CONCACAF (North/Central America + Caribbean):** multi-round — a mass first
  round funnelling into a final "hex"-style group stage. Needs a
  round-reduction bracket feeding into a group stage — genuinely new shape.
- **AFC (Asia) / CAF (Africa):** each their own multi-round group-into-
  knockout-into-group structure, broadly similar in spirit to CONCACAF's
  funnel but with different group sizes/counts.
- **Inter-confederation playoffs:** a handful of teams from different
  confederations who didn't qualify outright meet in a small mini-tournament
  for the last 1-2 spots — smallest piece, but need real entrant data (who's
  in the playoff pool) to seed it.

### What's reusable right now

- Round-robin group engine (`fixtures.ts` / `simulation.ts`) — powers
  CONMEBOL's league qualifying directly, and every confederation's group
  stages.
- Two-legged knockout engine with extra time + penalties
  (`knockout-match.ts`) — needed for CONCACAF/AFC/CAF's knockout rounds and
  the inter-confederation playoffs.
- The Swiss/league-phase machinery built for custom UCL
  (`cl-league-sim.ts`, `cl-qualifying.ts`) is the closest existing template
  for "simulate a whole confederation's campaign headlessly, then place the
  player somewhere inside it" — the custom UCL journey is the direct
  precedent for how a full WC journey should be structured in code.
- The bracket-preview / live-match / matchday-lookback / substitutes UI is
  100% mode-agnostic already — it will just work once qualifying produces the
  same match-object shapes the finals already consume.

### What's genuinely new

1. **Entrant/berth data per confederation** — who's actually IN each
   qualifying group/round, and how many spots each confederation gets (this
   is real-world structural data, not something we simulate our way out of
   needing).
2. **A per-confederation format descriptor** (mirroring the
   `ucl_group_8x4` / `ucl_swiss_36` idea already parked in §3 of
   `More Competitions & Modes.md`) — something like `wc_qual_uefa`,
   `wc_qual_conmebol`, `wc_qual_concacaf`, etc., each driving its own
   sequence of phases.
3. **A funnel/reduction-bracket-into-group primitive** for CONCACAF/AFC/CAF —
   doesn't exist yet in any form; closest we have is the custom UCL
   qualifying ladder (knockout rounds feeding into the league phase), which
   is a good starting template but not a drop-in.
4. **The finals-draw seeding engine** — pots, the constraints on which pots
   can share a group, and the bracket-seeding rules that keep top-ranked
   teams apart until at least the quarter-finals (see above). Genuinely new;
   nothing we've built so far encodes draw-time seeding constraints like this.
5. **Scraper support for national-team qualifying rosters/results** — the
   existing `scrape-wc.ts` machinery (NT parser + FIFA-ranking id resolution)
   covers the finals squads; qualifying needs either scraped historical
   qualifying data or (more likely, given we're simulating the whole thing
   fresh each run) just the **entrant list per confederation**, with results
   simulated by our own engine rather than scraped.
6. **Placement flow rework** (see Decisions below for the confirmed shape).

### Suggested build order

1. **CONMEBOL first** — it's a straight reuse of the round-robin league
   engine at a smaller scale, so it validates the "qualifying campaign feeds
   into finals placement" wiring end to end without needing any new engine
   primitives.
2. **UEFA second** — groups + playoff, still just group-stage engine + a
   small two-legged playoff round (engine already exists), but at a much
   larger scale (55 nations) — validates the wiring at real scale.
3. **CONCACAF/AFC/CAF last** — these need the new funnel/reduction-bracket
   primitive, so they're the highest-effort, most novel piece. Build once
   the simpler two prove the overall shape works.
4. **Inter-confederation playoffs** — small, last, needs real entrant data
   from the other four to know who's actually in the pool.
5. **Finals-draw seeding engine** — can be built in parallel with the above
   since it only kicks in once qualifying produces a real finals field; needs
   the Wikipedia research on pots/seeding rules done before it's trustworthy.

### Decisions

- **Squad locked for the whole journey — no re-draft.** You have the same
  players from qualifying straight through to the finals (or elimination).
- **Qualifying and finals are ONE competition** for stats/awards/career
  purposes — not two separate entries.
- **Always the next cycle** — a fictional, not-yet-played qualifying campaign,
  simulated fresh each run (not a reused real completed campaign's results).
- **Placement is two-step, both via the globe.** First spin reveals your
  **confederation** (same globe mechanic, zoomed out to continent-level
  regions instead of individual countries); second spin reveals **which
  nation you replace** within that confederation. Same UX pattern as today,
  just gains a step in front of it.
