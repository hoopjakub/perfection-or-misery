# Next Up: Engine Rebalance, Difficulty & Mode Refresh

A separate track from deep match stats (see
`docs/Next Up - Deep Match Stats & Ratings.md` — that feature sits on top of
this engine and doesn't depend on it being fixed first). This is about the
**core result engine's math** — some of the oldest, roughest code in the
project — plus difficulty actually meaning something, the chaos/cursed modes,
and turning the stale Era mode into a Year mode.

None of this blocks deep stats; deep stats just describe better-balanced
results once this lands.

---

## 1. The result engine's math needs a real look

`src/engine/match.ts` (`simulateMatch`) is old and, honestly, not great. It's
been nudged a few times (the `OVR_DELTA_DIVISOR` and `MAX_WIN_PROB` tuning
comments show that history) but never properly audited. The symptom the user
sees in play:

> "I see a lot of upsets, yes — but at some point your team should be winning
> easy."

That's the core complaint: **the curve is too flat.** Upsets are good and
should exist, but a genuinely superior side (say +10/+15 OVR, in form, at home)
should be winning *comfortably and often*, and right now too many of those
games are still coin-flips. The current knobs:

- `OVR_DELTA_DIVISOR = 6.5` — smaller = each OVR point matters more. Was 10
  (way too flat). 6.5 helped but may still be too high at the top end.
- `MAX_WIN_PROB = 0.90` — hard ceiling on the favourite's win chance.
- `drawProb = clamp(0.27 - |delta|*0.05, 0.04, 0.27)` — draw rate falls as the
  gap grows.
- `generateScore` — scoreline magnitude scales with the OVR gap.

### What to actually do
1. **Audit the win-probability curve** across the full OVR-gap range with a
   script (the same headless-thousands-of-matches approach used to verify the
   sub-minute rule and attribute-driven scorers). Tabulate: for a given OVR
   delta (+form, +home), what's the actual win/draw/loss split and average
   scoreline? Compare against a sanity target (e.g. a +12 OVR home favourite
   should win ~65–75% and rarely lose, not ~55%).
2. **Reshape, don't just re-tune a constant.** The flatness may be structural
   (a single sigmoid over one blended delta). Consider whether win prob should
   ramp more steeply in the mid-to-high gap range while keeping a real upset
   floor for small gaps — i.e. the problem isn't "upsets exist", it's "big
   favourites don't pull away."
3. **Keep upsets deliberate, not accidental.** The goal is a curve where small
   gaps are genuinely spicy and large gaps are reliably decisive — not killing
   variance, just making quality *bite* at the top end.
4. **Re-verify every mode after any change** — this engine is shared by league,
   all-time, era, chaos, cursed, CL (classic + custom), and WC, so a curve
   change ripples everywhere. Re-run the headless validators per mode.

---

## 2. Difficulty should actually change how hard the player's games are

Right now difficulty (`easy`/`medium`/`hard`) mostly affects the **draft**
(rerolls, ratings hidden — see `getRerollLimit`). It does **not** meaningfully
change how hard the player's *matches* are. The user wants it to:

> "difficulty would also impact game hardness for the player — harder to beat
> teams, and even good-team-vs-good-team will be much more skewed towards the
> AI."

### Design
- Add a **player-facing difficulty modifier** applied *only to matches
  involving the player's club* (AI-vs-AI games stay neutral, so the rest of the
  table/competition remains fair and realistic).
- On **hard**, tilt the effective-OVR / win-prob math against the player: the
  AI opponent plays up a notch, so even a good-vs-good match leans the AI's
  way; beating a strong side becomes a real achievement. On **easy**, a slight
  tilt the player's way. **Medium** = neutral (today's behaviour).
- Implement as a modifier into `simulateMatch`'s effective-strength calc for
  the player side (or a difficulty-scaled bonus to the AI side in
  player-involved matches) — NOT a global change, so standings integrity for
  everyone else is preserved.
- **Verify** the intended feel with the same headless approach: on hard, a
  player team should win noticeably less often against equal opposition than on
  medium; on easy, noticeably more.

---

## 3. Chaos & Cursed modes need a review

Flagged as needing a look. Today they're mostly **draft-rule** variants (Chaos:
ratings hidden, no rerolls, placement weighting disabled; Cursed: Chaos + you
don't know which position you're drafting for until after you pick). Questions
to resolve during the review:

- Do these modes do anything to the **match engine**, or only the draft? Should
  they? (e.g. Chaos could inject extra match-level variance — more upsets, wilder
  scorelines — to live up to the name, rather than only being a draft handicap.)
- Do they interact sensibly with the difficulty modifier from §2, or double up
  in a way that's unfair?
- Are they actually *fun and distinct* right now, or just "normal but
  annoying"? The review should decide whether each earns its place or needs a
  real hook.

(Kept deliberately open — this is a "look at it and decide" item, not a spec.)

---

## 4. Era mode → a Year mode (the stale one)

Era mode ("pick a decade — all clubs/leagues from that era") is **stale**. The
proposed replacement:

> "make it into a YEARLY mode rather, or a YEAR mode."

i.e. instead of locking the draft to a whole *decade*, lock it to a single
**specific season/year** (e.g. "2015/16" — every club, every league, but only
that one year's squads). Tighter, more evocative, and lets a player recreate a
specific season's landscape.

### Notes
- The data already supports this: the DB keys `club_seasons`/`player_seasons`
  by `year_start`, and the draft/pool already filters by era-year in places
  (`spinClubSeason` takes an `eraYear`). A Year mode is largely a **selection
  UI + pool-filter change** (pick a year instead of a decade), not new data.
- **Open:** replace Era outright, or keep Era and add Year alongside it?
  (Leaning replace — the user called Era stale — but that's a call to confirm.)
- Placement should also respect the chosen year (you land in a club *from that
  season*), same as Era does for its decade today.
- Which years are actually available depends on how many seasons are scraped
  per league (top-5 have ~10 seasons; newer/smaller leagues fewer) — the Year
  picker should only offer years with real data, per the selected pool.

---

## 5. Suggested order

1. **Engine math audit + reshape (§1)** — foundational; everything else layers
   on a curve that actually rewards quality. Script-verified per mode.
2. **Difficulty match modifier (§2)** — builds directly on the reshaped curve.
3. **Era → Year mode (§4)** — mostly independent (selection/pool change), can
   slot in any time; good "smaller win" between the bigger engine tasks.
4. **Chaos/Cursed review (§3)** — do this once §1–§2 are settled, since what
   these modes *should* do to difficulty/variance depends on how the baseline
   engine and difficulty modifier now behave.

## 6. Decisions still to make

- Target win-% curve — what *should* a +10 / +15 OVR favourite win, exactly?
  (Needs a concrete target to tune against, §1.)
- How strong is the hard-mode tilt? (Enough to matter, not so much that a great
  team feels pointless.)
- Chaos/Cursed: match-engine effects or draft-only? (§3)
- Year mode: replace Era or coexist? (§4)
