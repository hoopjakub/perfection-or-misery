# Next Up: Deep Match Stats, Player Ratings & the Match-Detail Screen

> ## ✅ IMPLEMENTED (July 2026)
>
> Shipped as designed (Path C hybrid). As-built map:
>
> - **Generator:** `src/engine/match-detail.ts` (`generateMatchDetail`) — seeded,
>   deterministic, adopts the stored scorers verbatim; produces the full team
>   grid (`src/types/match-stats.ts`), per-player lines, sub events, cards,
>   0–10 ratings + team averages. Dominance tracks OVR more than the scoreline,
>   so upset losers routinely out-possess/out-xG the winner. ~0.25 ms/match.
> - **Seeds:** `src/lib/rng.ts` (mulberry32). Every match object carries a
>   `seed` (`Fixture`, `CLLeagueMatch`, `WCGroupMatch`, `WCKnockoutMatch`,
>   `CLKnockoutMatch.leg1Seed/leg2Seed`, `QualTie.leg1Seed/leg2Seed`); scorer
>   attribution (`stats.ts`) accepts an `rng` so the same seed re-derives the
>   same scorers. Legacy matches without a seed fall back to a stable
>   `hashSeed` of the match identity.
> - **UI:** `src/components/MatchDetailModal.tsx` (+ `koLegDetailRequest`
>   shared builder). Entry points wired in: league result + live sim tickers,
>   CL result (league MDs + KO legs), custom-UCL result/sim (domestic + league
>   phase + KO/qualifying legs via `KoTieDetailModal`), WC result/sim (group
>   modal + KO modal). Two-leg ties open per-leg; leg 2 folds its ET in.
> - **Verification:** `npx tsx scripts/verify-match-detail.ts` — determinism
>   (incl. legacy path), all cross-side invariants, rating sanity, upset
>   texture. Run it after ANY change to the generator or attribution.
>
> Still open: the live knockout-reveal cards in `app/game/simulation.tsx`
> (classic CL/WC) aren't tap-through yet — those ties are clickable from the
> result screens instead. Rating scale kept 0–10 FotMob-style.

The vision: go from "a funny game" to something a football fanatic would
actually study. Every match — group, league, or knockout — becomes clickable
*after it finishes*, opening a full **FotMob-style match page**: team stats
(possession, xG, shots, passes, dribbles, throw-ins, touches in the box…),
both lineups with sub in/out markers, and a per-player breakdown with
individual stats **and a match rating** (plus the team's average rating).

This is a large, foundational change — it touches the simulation engine, the
data model, the stats/attribution system, and the UI. This doc plans it before
any code is written.

---

## 0. The one decision that shapes everything: what drives the result?

Today the engine is **result-first** (`src/engine/match.ts`): it rolls a
win/draw/loss from team OVR + form + home advantage, generates a scoreline,
and only *then* does `stats.ts` attribute which players scored (weighted by
position + attack rating). Stats are downstream of the result.

Deep stats can be built three ways, and this choice reshapes the entire build:

- **Path A — result-first, stats-derived (cheapest).** Keep the current
  result engine exactly as-is. After the score is decided, *generate a full,
  internally-consistent stat sheet that explains that result*: a 3-0 win gets
  the winner high possession/xG/shots, the loser few; distribute those team
  totals down to individual players by position + attributes; derive ratings
  from each player's generated line. Stats are cosmetic-but-coherent — they
  never contradict the scoreline because they're reverse-engineered from it.
  Weeks of work, not months. Gets ~90% of the *visible* fanatic value.

- **Path B — stats-first, result-emergent (most faithful, biggest).** Invert
  the engine: simulate the match as a sequence of player-level events
  (possession chains, shot attempts each with an xG, conversions, tackles,
  dribbles…), and the **scoreline emerges** from those events. This is a real
  football match-sim engine. It's what "from those stats you get goals, who
  wins and loses" literally describes — but it's a months-long rewrite that
  also breaks the current deterministic scorer-attribution model (see §5) and
  every mode's result/score plumbing.

- **Path C — hybrid (recommended).** Result-first for *who wins* (keep the
  proven, tuned `simulateMatch` — it already handles upsets, form, home
  advantage, mode balance), but stats-first for *the texture*: run a
  lightweight possession/shot/xG model that's **conditioned to land on the
  already-decided scoreline** (e.g. sample shots and xG until the goal count
  matches, nudged by the quality gap). You get genuinely simulated,
  believable stats and ratings that feel emergent, without throwing away the
  balance work already in the result engine or destabilizing every mode.
  Middle effort; upgradeable toward Path B later per-stat without a rewrite.

**This is the fork to decide first** — everything below is written to work for
Path A or C (they share the data model, stat catalog, ratings, and UI; they
differ only in how the numbers are generated). Path B would keep the same
catalog/UI but replace the whole generation layer.

> **This feature does NOT depend on the result engine being rebalanced.** The
> hybrid layer sits *on top of* the current `simulateMatch` and consumes
> whatever scoreline it produces — so deep match stats and player stats can be
> built now, against the engine as-is. The result engine's math (upsets vs.
> favourites winning comfortably, difficulty actually mattering, chaos/cursed
> balance, the Era→Year mode idea) is a **separate** future effort tracked in
> `docs/Next Up - Engine Rebalance, Difficulty & Modes.md`. When that lands,
> deep stats keep working unchanged — they just describe better-balanced
> results. Keep the two efforts decoupled.

---

## 1. The stat catalog (source of truth: FotMob's match page)

Model the catalog on what FotMob actually shows, so it reads as familiar to
anyone who follows the game. Grouped as FotMob groups them:

### Team stats (both sides, per match)
- **Top:** Possession %, Expected goals (xG), Total shots, Shots on target,
  Big chances, Big chances missed, Accurate passes (count + %), Corners,
  Fouls committed.
- **Shots:** shots inside/outside box, blocked shots, shots off target,
  shots woodwork, xG open play vs set piece vs penalty.
- **Passes:** total passes, accurate %, own-half vs opposition-half passes,
  accurate long balls, accurate crosses, throw-ins.
- **Defence:** tackles won, interceptions, blocks, clearances, keeper saves.
- **Duels:** ground duels won, aerial duels won, **successful dribbles**,
  possession lost.
- **Discipline:** yellow cards, red cards, fouls, offsides.
- **Attack-territory:** **touches in opposition box**, final-third entries.

(Not all of these must ship in v1 — see §6 phasing — but the data model and
match-page layout should be designed to hold the full set from day one, so
adding a stat later is a data change, not a re-layout.)

### Per-player stats (every player who featured)
- **Match rating** (the headline — see §3), minutes played, goals, assists.
- Shots (on target), key passes, big chances created, touches, passes
  (accurate %), crosses, **successful dribbles**, ground/aerial duels won,
  tackles, interceptions, clearances, fouls (committed/won), possession lost,
  offsides, touches in opposition box.
- **Goalkeepers:** saves, save %, goals conceded, xGOT faced, punches/claims,
  sweeper actions.
- **Cards** and — the requested UI bit — **sub in / sub out markers** (small
  green ▲ / red ▼ next to the player, with the minute).

---

## 2. Data model

A new per-match record, stored on the same match objects the result screens
already carry (so it flows through save/load exactly like scorers do today —
attribute-once-store-on-match, the pattern from
`docs/Major Overhaul + Bug fixes.md`).

```ts
type MatchStats = {
  team: { home: TeamStatLine; away: TeamStatLine }   // the whole FotMob team grid
  players: PlayerMatchLine[]                          // both XIs + subs who came on
  events: MatchEvent[]                                // goals, cards, subs (min + player)
}
type PlayerMatchLine = {
  playerId: string; clubId: string
  rating: number                 // §3
  minutes: number                // 0 for an unused sub; drives rating eligibility
  subOnMinute?: number; subOffMinute?: number
  goals; assists; shots; shotsOnTarget; keyPasses; touches;
  passes; passAccuracy; dribbles; duelsWon; tackles; interceptions;
  clearances; foulsCommitted; foulsWon; possessionLost; touchesInBox; …
  gk?: { saves; savePct; goalsConceded; … }
}
```

- **Storage cost.** This is a lot of numbers × 22+ players × every match — and
  every match is fully generated (§7). Holding all of it in memory for a live
  run is fine; **persisting all of it to Supabase is not** — the saved run
  JSON would balloon. Resolution (§7): persist a compact per-match **seed**
  (+ the already-attributed scorers) and regenerate the full detail
  deterministically when a match is opened. The numbers exist for every match;
  only the seed is stored.
- **Determinism.** Like scorers today, stats must be generated **once** per
  seed and be fully reproducible, so the live view, the match-detail screen,
  and a reloaded-from-history run all show identical numbers. This is exactly
  what makes the seed-persistence approach safe: same seed → byte-identical
  stats. Never regenerate non-deterministically on render.

---

## 3. The match rating model (the new headline metric)

A per-player 0–10 rating (FotMob-style, one decimal, ~6.0 baseline), plus a
**team average rating**. This is genuinely new and worth getting right because
it's the number fanatics fixate on.

Rough shape (works for Path A or C — it reads a player's generated match line):
- Start every player at a **6.0–6.5 baseline** scaled slightly by their OVR
  (a 90-rated player carries a marginally higher floor).
- Add/subtract for contributions from their generated line: goals (+, weighted
  by position — a defender scoring is worth more), assists, key passes, big
  chances created, successful dribbles, tackles/interceptions/clearances for
  defensive players, duels won; subtract for possession lost, fouls, missed
  big chances, a red card, an own goal, goals conceded while on the pitch
  (spread across the defence + GK).
- **Position-weighted:** the same raw line means different ratings for a CB vs
  a striker (clean sheet lifts defenders; goals lift attackers).
- **Minutes-gated:** a sub who played 15' can spike or dip less than a starter
  who played 90'.
- **Team average** = mean of the XI + any subs who played, minutes-weighted.

The rating formula is its own tuning task (like the OVR/goal-distribution
tuning already done in `match.ts`/`stats.ts`) and should be **script-verified**
the same way the sub-minute rule and attribute-driven scorers were — e.g.
across thousands of simulated matches, confirm star attackers average higher
than defensive mids, man-of-the-match ratings correlate with goals/assists,
nobody on a 5-0 losing side rates 8.0, etc.

---

## 4. UI: the match-detail screen

The interaction the user described: matches become **clickable once finished**
— group tables, league matchdays, AND knockout ties — opening a match page
modelled on FotMob and on the **existing knockout-tie detail modal** (the
precedent already in the app: `KoTieDetailModal` / the two-leg detail with
scorers), but far richer.

- **Entry points:** every finished-match row (the matchday-results card, group
  standings' fixtures, league matchday lookback, knockout ties) gets a tap
  target. Live/in-progress matches are NOT clickable — detail only exists once
  the match is done (matches the user's "only after it's finished" rule and
  the determinism requirement).
- **The page:** header (score, comp, round, AET/pens if relevant) → team-stat
  comparison grid (the FotMob bar-per-stat look) → **both lineups** laid out
  by formation with the green▲/red▼ sub markers and each player's rating chip
  → tap a player for their full individual stat line → events timeline
  (goals/cards/subs by minute).
- **Reuse:** the pinch-zoom/scroll and modal infrastructure already exists;
  `LineupPitch` already renders a formation shape and can be extended to show
  ratings + sub markers instead of just OVR. The team-stat comparison bars are
  a new but small component.

---

## 5. Where this collides with what exists (the hard parts)

- **Scorer attribution is already "attribute once, store on match."** Deep
  stats extend that same principle — good, the pattern's proven — but the
  *volume* is far higher, and the generation has to be consistent with the
  scorers already attributed (a player credited with a goal in `MatchScorers`
  must have that goal in their `PlayerMatchLine`). The cleanest path is to
  make the deep-stat generator the **single source** that also produces the
  scorers, replacing the current `attributeMatchScorers` rather than running
  alongside it.
- **Substitutes already exist** (this session): `applySubstituteRule`, the
  60'-minute rule, the SUB tag, the `isBench` flag. The match page's sub
  in/out markers and per-sub ratings build directly on that — subs need a
  chosen-on minute (≥60) and their stats/rating gated to minutes played.
- **Live minute-by-minute reveal** (`LiveMatch`) shows goals ticking in. Deep
  stats don't need to animate live (detail is post-match only), so the live
  view is unaffected — but the final stat sheet must match whatever the live
  view showed.
- **Path B specifically** would also require reworking every mode's result
  types (`MatchResult`, `CLKnockoutMatch`, `WCKnockoutMatch`, the league
  `Fixture`) so the score is an *output* of the event sim, not an input —
  which is why C is recommended.

---

## 6. Suggested phasing

1. **Data model + one stat, one screen.** Add `MatchStats` to the match
   object; generate just possession + shots + xG + per-player rating; make
   ONE match type (league matchday) clickable into a bare match-detail screen.
   Proves the whole pipeline end to end.
2. **Full team-stat grid** (the complete FotMob team catalog) + the
   comparison-bar UI.
3. **Full per-player lines** + the lineup view with ratings and green/red sub
   markers + tap-through to a player's individual stats.
4. **Extend clickability** to group games and knockout ties (reusing the same
   match-detail screen).
5. **Rating tuning pass**, script-verified (§3).
6. **Persistence decision** (§7) — what actually gets saved to run history vs
   kept in-memory-only for the live run.

---

## 7. Decisions

- **Engine philosophy: Path C — hybrid (DECIDED).** Keep the proven
  result-first `simulateMatch` for who wins/draws/loses and the scoreline
  (upsets, form, home advantage, mode balance all stay tuned), and layer a
  real possession/shot/xG texture model **conditioned to land on that
  scoreline**. Stats feel emergent and believable without a full engine
  rewrite, and any individual stat can be deepened toward a true event sim
  later without breaking the result plumbing. The deep-stat generator becomes
  the single source that ALSO emits the scorers (replacing the current
  `attributeMatchScorers`), so scorers and stat lines can never disagree.

- **Scope: full FotMob catalog, all match types clickable (DECIDED).** v1
  targets the complete team + per-player catalog (§1) with group, league, AND
  knockout matches all clickable into the match-detail screen — not a stripped
  "top stats only" first cut. The §6 phases below therefore become **internal
  build milestones toward one full release**, not incremental public ships:
  build the pipeline on one match type first to de-risk, but the shipped
  feature is the whole thing.

- **Generation: fully generate the full catalog for EVERY match, including
  every AI-vs-AI game (DECIDED).** No seed-and-regenerate-on-demand, no
  "player's matches detailed, others summarised" — every match in the
  competition carries a complete, real stat sheet + player ratings, so a
  fanatic can open any fixture in any league and see the full picture. This is
  the heaviest option and drives the two engineering concerns below, but it's
  the decision.
  - **Compute:** a full custom-UCL run simulates ~53 domestic leagues + the
    whole UCL — thousands of matches, each now generating a full FotMob catalog
    × 22+ players. The generator has to be **cheap per match** (it runs
    thousands of times headlessly). Budget for this: keep the math tight, avoid
    per-player object churn, and profile a full run early — this is the main
    performance risk of the feature.
  - **Storage:** persisting a full catalog for every match would make the saved
    run JSON enormous. Almost certainly can't store every match's full detail
    verbatim in Supabase. Likely answer: store a **compact deterministic seed
    per match** (plus already-attributed scorers) and **regenerate the full
    detail deterministically on open** from that seed — the numbers are
    generated for every match at sim time (satisfying "fully generate for every
    match"), but only the seed is persisted, and the expensive full expansion
    is reproduced identically whenever a match is actually clicked. Determinism
    (§2) makes this safe: same seed → same stats, every time.

### Still open (smaller, decide during build)

- **Rating scale/identity:** mirror FotMob's 0–10 exactly, or a distinct scale
  so it reads as ours, not a clone?
