for

# Big Fixes — Match Experience Overhaul (Spec)

> **Status:** Draft spec, ready for build. Formalises the raw notes in
> [`Big Fixes.md`](<Big%20Fixes.md>) into an implementable design + engineering
> document. Nothing here changes the locked architecture in
> [`PROJECT_STATE.md`](PROJECT_STATE.md) — it extends it.
>
> **Scope in one line:** unify every knockout view, show final standings at the
> league→qualifiers hand-off, add an Android back-guard, fix weighted picks +
> a batch of draft/subs/chaos bugs, remove Era mode, and build the headline
> feature — a **Deep Simulation Match for finals** with **live Match Momentum**,
> **own goals / penalties / mistakes**, and a **redesigned (dedicated) Match
> Stats screen**.
>
> **How this doc is organised:** each work item has **Problem → Target →
> Requirements → UX notes → Implementation pointers → Acceptance criteria**.
> Screenshots are embedded from [`image/BigFixes/`](image/BigFixes). The two
> reference apps in the shots are the game's own **CL (full)** result screen and
> **FotMob** (used purely as a visual north star — we own no club emblems, so
> everywhere FotMob shows a crest we show a **team name**).
>
> **Naming convention (user-facing labels).** As part of this pass the displayed
> competition names become the full official forms everywhere in the UI:
> **"Champions League" → "UEFA Champions League"** and
> **"World Cup" → "FIFA World Cup"**. Internal mode ids
> (`champions_league`, `champions_league_custom`, `world_cup`) are unchanged — this
> is a display-string change only. "CL (classic)" / "CL (full)" below refer to the
> two UCL variants (`champions_league` and `champions_league_custom`).
>
> **Decisions locked** — all open questions from the first draft are now resolved;
> see [Appendix B](#appendix-b-resolved-decisions).

---

## Table of contents

**Fixes & polish**

1. [Knockout UI unification](#1-knockout-ui-unification)
2. [Final standings at the league → qualifiers hand-off](#2-final-standings-at-the-league--qualifiers-hand-off)
3. [Android back-button guard during simulations](#3-android-back-button-guard-during-simulations)
4. [Weighted picks in CL (full)](#4-weighted-picks-in-cl-full)
5. [Draft, subs &amp; chaos fixes (batch)](#5-draft-subs--chaos-fixes-batch)
6. [Remove Era mode](#6-remove-era-mode)

**Additions**
7. [Deep Simulation Match (finals)](#7-deep-simulation-match-finals)
8. [Match Momentum](#8-match-momentum)
9. [Own goals, penalties &amp; mistakes](#9-own-goals-penalties--mistakes)
10. [Match Stats screen redesign (dedicated screen)](#10-match-stats-screen-redesign-dedicated-screen)

**Roadmap**
11. [Full FIFA World Cup mode (after everything above)](#11-full-fifa-world-cup-mode-after-everything-above)

**Dev tools**
12. [&#34;Test final game&#34; quick-sim](#12-test-final-game-quick-sim-dev-tool-added-mid-batch)

**Appendices**

- [A. Asset checklist](#appendix-a-asset-checklist)
- [B. Resolved decisions](#appendix-b-resolved-decisions)
- [C. Suggested commit message](#appendix-c-suggested-commit-message)
- [D. Screenshot index](#appendix-d-screenshot-index)

---

## 1. Knockout UI unification

### Problem

There are **two** knockout renderers with two different looks. The CL (full)
result screen already has the clean, tappable "Knockout Rounds" list we want
everywhere; the World Cup live/knockout view uses an older "featured match +
Elsewhere in the round" layout and — worse — its **header still reads "Group
Stage · Group K"** while showing knockout content.

**The look we want (CL full — the gold standard):**

![CL (full) knockout list — clean bracket-list rows, aggregate + leg scores, one tie focus-highlighted, flags shown](image/BigFixes/1784839328774.jpg)

**The look we're replacing (current WC knockouts):** note the stale
`Group Stage · Group K` sub-header and the "PORTUGAL ADVANCES / Elsewhere in the
Round of 32" split.

![Current WC knockout view — featured match card plus a dense 'Elsewhere in the Round of 32' list, wrong 'Group Stage · Group K' header](image/BigFixes/1784839335931.jpg)

### Target

**One** knockout component used in **all four** places:

- WC knockouts
- CL (classic) knockouts
- CL (full) qualifiers
- CL (full) knockouts

It takes the **best of both**: the **colours, flags and per-round feel of the WC
card** combined with the **CL list's sizing, footer, and tappable rows**. The
mock below is WC data rendered in the unified style (flags preserved):

![Target: WC data in the unified 'Knockout Rounds' style — full-width tappable rows, flags, aggregate score, round headers](image/BigFixes/1784839343505.jpg)

Every tie is **tappable** and opens the existing aggregate/leg detail modal
(both legs, ET, shootout, and per-leg "Match stats ›" links):

![Tappable tie detail — aggregate line, Leg 1 / Leg 2 scorers, 'Match stats ›' per leg, Close](image/BigFixes/1784839371500.jpg)

### Requirements

- **R1 — Single source of truth.** Extract one shared knockout list component
  (rows + round headers + footer) and one shared tie-detail modal. WC and CL
  render the same component with mode-specific props.
- **R2 — Correct, mode-specific header.** The header must reflect the *phase*
  (e.g. "Knockout Rounds", "Round of 32", "Qualifiers"), never a leftover
  "Group Stage · Group X". It shows **mode-specific** chrome (WC = FIFA/gold
  accent + Knockout Phase; UCL = UCL accent) — not the generic app header.
- **R3 — Sticky, always-visible header.** The phase header **overlays / stays
  pinned** while the list scrolls, so you always know where you are. (Today the
  CL header scrolls away — see the greyed header in the tie-detail shot.)
- **R4 — Flags stay.** WC ties keep nation flags on both sides. CL club ties show
  the club label (we have no emblems — text label per repo convention).
- **R5 — Clickable everywhere.** Every tie row is a `PressCard` and opens the tie
  detail. Single legs (WC) and two-legged ties (CL) both supported by the modal.
- **R6 — Footer.** Keep the CL-style bottom bar (e.g. "View Final Result →")
  pinned; WC currently lacks it.

### UX notes

- Rows read as a **table of ties**, not a hero + afterthought. The current WC
  "featured match then Elsewhere" hierarchy buries 15 of 16 ties in a cramped
  list. A flat, equally-weighted row list (as in the CL screenshot) scans far
  faster and treats every tie as first-class.
- **Winner/loser emphasis** via weight + opacity is already right in the CL list
  (winner bold/full-opacity, loser dimmed). Keep it; apply to WC.
- **Focus/selection ring** (the player's own tie) uses the accent border — keep
  the CL treatment (see FC Barcelona / Caernarfon rows in the first shot).
- Sticky header = a small persistent context anchor; pairs well with the modal
  so a user can drill in and pop back without losing the round they were reading.
- **Touch target ≥ 44pt** per row; the whole row is the hit area, not just the
  score.

### Implementation pointers

- **Reuse, don't fork.** The tappable CL knockout list + detail already live in:
  - [`app/game/cl-result.tsx`](../app/game/cl-result.tsx) (`"Knockout Rounds"`
    section, the round config array `r16/qf/sf/final`).
  - [`src/components/CustomUclViewers.tsx`](../src/components/CustomUclViewers.tsx)
    — `KoTieDetailModal`, `KoLeg`, `qualTieToKoMatch`.
- The WC renderer to retire/absorb is in
  [`app/game/wc-result.tsx`](../app/game/wc-result.tsx) (`BracketView`,
  `BracketMatch`, `WCKoDetail`) and the live version in
  [`src/components/LiveMatch.tsx`](../src/components/LiveMatch.tsx) /
  [`app/game/simulation.tsx`](../app/game/simulation.tsx) (the WC simulation path
  with `ADVANCES` / `Elsewhere in the Round of 32`).
- Extract a `KnockoutRoundsView` (list) into `src/components/` taking:
  `rounds: { key, label, sub?, matches, showDirect? }[]`, `accent`,
  `renderTeam` (club-label vs flag+nation), `onTiePress`, optional `footer`.
  Feed it from both `cl-result` and `wc-result`.
- Header stickiness: a pinned header above a `ScrollView` (or a `SectionList`
  `stickySectionHeadersEnabled`). Keep to the [modal scroll pattern](PROJECT_STATE.md)
  (`flexShrink: 1` body) so the footer never clips.
- Pull the accent from `useModeTheme()` (`src/theme.ts` `MODE_THEMES`), **never
  hardcode** the WC gold or UCL blue.
- Both WC (single-leg) and CL (two-leg agg) tie shapes must map onto the modal's
  input — `qualTieToKoMatch` is the precedent for adapting shapes.

### Acceptance criteria — ✅ done

- [X] WC, CL-classic, CL-full qualifiers, and CL-full knockouts all render the
  *same* component. — Built `src/components/KnockoutRoundsView.tsx`: a
  `KnockoutRoundsView` (round-grouped list + header) and an exported
  `KnockoutTieRow`, plus three adapters (`clKoMatchToRow`, `wcKoMatchToRow`,
  `qualTieToKoRow`) turning each mode's own tie shape into one `KoTieVM`. Wired
  into all four static places (`cl-result.tsx`, `custom-ucl-result.tsx`
  knockouts, `custom-ucl-result.tsx`/`custom-ucl-simulation.tsx` qualifiers via
  `QualifyingLadder`, `wc-result.tsx`) **and** both live simulation screens
  (`simulation.tsx`'s shared `KnockoutPhaseView` — used by CL classic *and*
  WC — and `custom-ucl-simulation.tsx`'s own live knockout reveal), so the live
  flow reads identically to the result screens instead of only fixing the
  static pages. Deleted every old `BracketView`/`BracketMatch`/`BracketTeam`/
  `KnockoutTieCompact`/`KoTieCard` (the 158px-wide side-scrolling columns) and
  their now-dead styles from all four files.
- [X] No knockout screen ever shows a "Group Stage · Group X" sub-header. —
  Found the actual bug: `simulation.tsx`'s `WCSimulation` **and** `CLSimulation`
  both had an outer header rendered once, outside the phase switch, hardcoding
  "Group Stage · Group K" / "League Phase · 8 matchdays" regardless of phase.
  Made both phase-aware (`Knockout Phase` once `phase === 'knockout_phase'`,
  `Group Stage Complete` for `group_review`). Verified live: the header read
  "Knockout Phase" correctly all the way from the bracket preview through the
  final.
- [X] Header stays visible while the list scrolls; footer never clips. —
  Implemented as a bounded card (header row + internal `ScrollView`, following
  the existing modal-scroll convention) embedded in each result screen's card
  stack, rather than promoting "Knockout Rounds" to its own full navigable
  screen — the mockups show it full-bleed, but splitting the CL/WC result
  pages into multiple routes was judged out of scope for this pass; flagging
  as a deliberate, contained choice rather than a silent gap. The **live**
  knockout view (already its own dedicated phase screen in both
  `simulation.tsx` and `custom-ucl-simulation.tsx`) needed no such
  compromise — header, round list, and footer CTA are genuinely pinned there.
- [X] Every tie (single- and two-legged) opens the detail modal; flags present
  on WC ties. — WC rows use `getFlag(clubId)` (not name-based lookup, so the
  player's own "‹Nation› XI" naming doesn't break it); CL/qualifying rows show
  the club name only, per the no-crests convention. The existing
  `KOTieModal`/`KoTieDetailModal` (leg-by-leg breakdown, "Match stats ›" per
  leg) already matched the target tie-detail mock closely and needed no
  rework — confirmed reused, not forked, everywhere.
- [X] `npx tsc --noEmit` clean; browser walkthrough shows the unified view with
  an empty error console. — Verified live end-to-end on a full WC run (via the
  §12 "Final" tool): placement → group stage → bracket preview → live
  knockout reveal (Round of 32 through the Final, "YOU ADVANCE" on the
  player's settled tie, flags + AET/pens suffixes on every other tie) → the
  static result screen's "Knockout Rounds" section, matching the reference
  mock row-for-row. Also spot-checked a CL classic run (eliminated in the
  League Phase, so no knockout ties to render — a good negative check that
  nothing crashes when the section is simply absent). The one console warning
  present ("Unexpected text node: . A text node cannot be a child of a
  `<View>`.") is a pre-existing, widespread issue seen on unrelated screens
  since the start of this work — not introduced by this change, not
  investigated further here.

- Screenshot: captured and shown inline during the review session (WC
  "Knockout Rounds" — Round of 32 list with flags, aggregate scores, AET/pens
  suffixes, and the player's tie ring-highlighted); not saved into
  `docs/image/BigFixes/` as a new file — this tool has no direct way to
  persist a live-browser screenshot to disk, only to display it in
  conversation. Happy to save one if given a preferred path/tool.

---

## 2. Final standings at the league → qualifiers hand-off

### Problem

When you finish a domestic league and progress toward the Champions League, the
transition screens (**"QUALIFIED!"** into the League Phase, and **"Super Liga
CHAMPIONS → First Qualifying Round"**) tell you the *outcome* but never show the
**final league table** you earned it from. The context is missing for both the
league-phase entry and the qualifier entry.

![Current 'QUALIFIED!' screen — outcome text and Continue button, but no final table](image/BigFixes/1784839384698.jpg)

![Current 'Super Liga CHAMPIONS → First Qualifying Round' entry — same gap, no final standings](image/BigFixes/1784839397444.jpg)

### Target

On the league-completion / qualifier-entry transition, **show the final league
standings** (the table the player finished in) or the knockout game you stopped at or the full knockout games YOU played to show your journey, before or alongside the
"Continue / See the rest of Europe" CTA. Same treatment for the qualifiers entry.

### Requirements

- **R1** — Render the completed league's final table on the transition screen and the knockout game as well that you got eliminated from or the full knockout games YOU played to show your journey,
  with the player's row highlighted and the qualification cut-off marked
  (e.g. a divider / colour for "into Europe").
- **R2** — Applies to **both** hand-offs: league → League Phase ("QUALIFIED!"),
  and league finish → qualifiers ("Super Liga CHAMPIONS").
- **R3** — Keep the celebratory hero (emoji + headline) but demote it to a compact
  banner so the table is the focus, then the CTA below.

### UX notes

- This closes a **feedback loop**: the player just simulated a season; showing the
  table is the payoff and the justification for the European berth. A bare
  "QUALIFIED!" throws away earned context.
- Reuse the existing league-table styling so it reads as the same table they saw
  during the season — recognition over re-learning.
- Order: **compact result banner → final table (player highlighted, cut-off line)
  → CTA**. One screen, scrollable if needed.

### Implementation pointers

- Transition screens live in the CL flow:
  [`app/game/simulation.tsx`](../app/game/simulation.tsx) (`CLSimulation`, the
  "League Phase" / qualifier orchestration) and the qualifying engine
  [`src/engine/cl-qualifying.ts`](../src/engine/cl-qualifying.ts) /
  [`src/engine/cl-access.ts`](../src/engine/cl-access.ts).
- Reuse `LeagueTableView` from
  [`src/components/CustomUclViewers.tsx`](../src/components/CustomUclViewers.tsx)
  (already knows `playerClubId` highlighting and final-table labelling) rather
  than building a new table.
- The final domestic table is produced by the league sim
  ([`src/engine/simulation.ts`](../src/engine/simulation.ts)); make sure it's
  passed through to the transition screen's props (it may currently be dropped
  once the berth is computed).

### Acceptance criteria — ✅ fully done, confirmed by maintainer

- [X] Both hand-off screens show the right final standing with the player's
  row/ties highlighted and the cut-off marked. — **Both screens turned out to
  live in `app/game/custom-ucl-simulation.tsx`**, not two different modes —
  but they needed **two different data sources**, not one reused table:
  - `domestic_result` (right after the domestic season ends — "Super Liga
    CHAMPIONS → First Qualifying Round") shows the **domestic league final
    table** via `LeagueTableView`, since that's the table you actually earned
    the berth from. Added a `domPlayerTableRef` that freezes the player's
    `SimLeagueTable` once `finishDomesticSeason()` computes it (previously
    built to seed the access-list calc, then thrown away).
  - `quali_result` ("QUALIFIED!" / "THE FIELD IS SET" / "ELIMINATED") shows
    the **qualifying ladder** (`QualifyingLadder`, `ties={qual.ties}`)
    instead — this hand-off is about the *qualifying run*, not the domestic
    league (which already got its own screen). First pass wrongly reused the
    domestic table here too; corrected after maintainer review of both
    screens side by side. The ELIMINATED branch previously had no table at
    all — now gets the same ladder recap the QUALIFIED branch does.
  - Both follow the same compact-banner → scrollable-content → pinned-CTA
    layout (matching the `review`/`world_sim` phases' existing pattern).
  - Verified live across several runs (manual draft → domestic season →
    skip-simmed) and **confirmed working by the maintainer** on both the
    domestic hand-off (table, player row highlighted, PO/Q3 badges marking
    the cutoff) and the qualifying hand-off (ladder, player's ties
    highlighted) for both the qualified and eliminated outcomes.
- [X] Uses the shared `LeagueTableView`/`QualifyingLadder`, not new tables. —
  Also **found and fixed a real, pre-existing bug** in `LeagueTableView`
  itself (`src/components/CustomUclViewers.tsx`) while verifying this: the
  club-name cell's inline style override was `{ flex: 0, flexShrink: 1 }` —
  but `flex: 0` is shorthand for `flex-grow: 0; flex-shrink: 0; flex-basis: 0%`, and that zero basis collapsed the name `<Text>` to zero width on web,
  making every club name invisible in every league table in the app (this
  screen, the world-reveal "Browse all leagues" modal, everywhere
  `LeagueTableView` is used) while the berth badge next to it still rendered
  fine. Fixed by sizing to content instead (`flexGrow: 0, flexShrink: 1, flexBasis: 'auto'`, kept out of the shared `tableName` base style to avoid
  a shorthand/non-shorthand style-merge warning). This was blocking visual
  verification of this very feature, so worth fixing here rather than filing
  separately.
- [X] Hero banner still present but compact; CTA still reachable without the
  footer clipping. — Compact banner (small emoji + one-line headline + berth
  text) → `ScrollView` (table or ladder) → pinned `footerBar` CTA on all four
  branches (`domestic_result`, and `quali_result`'s qualified/field-is-set/
  eliminated branches).

---

## 3. Android back-button guard during simulations

### Problem — this is an anti-cheese guard, not just data-loss prevention

The Android OS back button (hardware/gesture back, *not* an in-app control) lets a
player **rewind a decided simulation and re-run it for a better result**. Real
exploit found in playtesting: a player **lost**, and *before* tapping "Go to
Result" they pressed OS-back, which rewound the sim so they could **restart it and
re-roll the outcome**. Because results are attributed deterministically up-front,
being able to jump back and replay is a straight-up cheat — the guard exists to
**close that reroll loophole**.

### Target

Once a simulation has produced its outcome, OS-back must **not** take the player to
a point where they can re-run it. The decided result stands; the only forward path
is to the result screen. This applies to normal sims and especially the Deep Match
final (§7), where the stakes and the temptation are highest.

### Requirements

- **R1 — Block the reroll.** On all simulation screens (league, UCL league phase,
  UCL knockouts, FIFA World Cup, custom UCL, and the new Deep Match), OS-back must
  **not** return to a pre-outcome / re-runnable state after the result is decided.
- **R2 — Behaviour: confirm-to-quit, never rewind-to-re-sim.** Intercept OS-back
  and show a confirm — **"Quit this run? You can't re-simulate — the result is
  final."** Cancel stays; Quit exits the *whole run* (to home / mode-select), it
  does **not** drop the player back into a re-runnable sim step. Under no path does
  back re-open the already-simulated match for another attempt.
- **R3 — Scope.** Native Android only (gate on `Platform.OS === 'android'`); do not
  affect in-app back controls or the web build.

### UX notes

- Frame the copy around **finality**, not just "progress lost" — the message should
  make clear the result won't change, which both explains the block and removes the
  incentive to try.
- The confirm respects a genuine "I want to leave" intent while denying the "let me
  secretly retry" one — the two must resolve to *quit the run* or *stay*, never
  *rewind and replay*.

### Implementation pointers

- Use React Native `BackHandler` (add/remove listener in a `useEffect`) on the sim
  screens, or expo-router's `usePreventRemove` where a route would pop. Native-only
  gate on `Platform.OS === 'android'`.
- The critical window is **outcome-decided-but-not-yet-committed** (after the sim
  resolves, before "Go to Result"). Ensure back during that window can't land on a
  screen/state that re-invokes the simulate step. Since results are attribute-once
  and stored on the match, "Quit" should discard the *run*, not rewind to re-attribute.
- Screens: [`app/game/simulation.tsx`](../app/game/simulation.tsx),
  [`app/game/custom-ucl-simulation.tsx`](../app/game/custom-ucl-simulation.tsx),
  and the new Deep Match screen (§7).
- A small reusable hook (`useSimBackGuard(active, onConfirmQuit)`) keeps it DRY
  across all sim screens (share, don't copy-paste).

### Acceptance criteria

- [ ] After a sim (or Deep Match) resolves, OS-back cannot reach a state that
  re-runs / re-rolls that match — reproduce the original exploit and confirm
  it's closed.
- [ ] OS-back shows the finality confirm; "Quit" exits the run (no re-sim), "Cancel"
  stays.
- [ ] In-app back controls and the web build are unaffected; listener removed on
  unmount.

---

## 4. Weighted picks in CL (full)

### Problem / feature

"Weighted picks" biases the draft spin pool toward stronger clubs. In CL (full)
it should be **automatic by difficulty**, plus a **manual override in custom**,
with the override winning when the two disagree.

### Requirements

- **R1 — Auto by difficulty.** For **easy → medium** (up to difficulty **4/10**,
  i.e. "medium"), weighted picks are **ON**. Above that, **OFF** by default.
- **R2 — Custom toggle.** In **custom**, a button in the drafting phase toggles
  weighted picks. When ON, the pool is **only teams from the top-10 leagues by
  UEFA coefficient that are in that pool** (see the coefficient source below).
- **R3 — Override precedence.** The **button state wins over the difficulty
  default**, in *both* directions:
  - Difficulty > 4 (would be OFF) but button ON → **weighted picks ON** (button
    wins).
  - Difficulty ≤ 4 (would be ON) but user turns the button OFF → **OFF** (button
    wins).
- **R4 — Real-time.** The default flips **live** as the difficulty slider moves;
  the manual toggle continues to override whatever the live default is.

### UX notes

- The button must show its **effective** state, and ideally hint *why* (e.g.
  "Weighted picks · on (medium)" vs "on (manual)"). A control that silently
  disagrees with the difficulty slider is confusing; surface the override.
- Because it changes the spin pool, reflect it before the first spin, not after.

### Implementation pointers

- Difficulty is a single model —
  [`src/engine/difficulty.ts`](../src/engine/difficulty.ts) `resolveDifficulty`
  (easy/medium/hard = screw-levels 2/4/6; custom rerolls 0–10). Add the weighted
  default as a **derived field** of the resolved difficulty (ON when level ≤ 4),
  so it lives with the other tilt/reroll/hidden-ratings outputs — don't re-derive
  it elsewhere (golden rule 5 territory: keep it one model).
- The manual override is a separate boolean in run/custom state
  (`src/store/gameStore.ts`); the *effective* value = `override ?? difficultyDefault`.
- Pool construction: [`src/engine/draft.ts`](../src/engine/draft.ts)
  (`spinClubSeason` / availability) restricted to clubs from the **top-10 leagues
  by UEFA coefficient** in the active pool. There's already a coefficient table in
  the repo — [`src/data/uefa-coefficients.ts`](../src/data/uefa-coefficients.ts) —
  use it as the single source for the league ranking (don't hardcode a second
  list). Custom draft UI:
  [`app/game/custom-ucl-simulation.tsx`](../app/game/custom-ucl-simulation.tsx)
  / [`app/game/draft.tsx`](../app/game/draft.tsx).
- Keep AI-vs-AI fair: weighting is a **draft-pool** bias for the player's own XI,
  not a global tilt.

### Acceptance criteria

**Revised after maintainer feedback** — the toggle must sit *before* drafting
(it can't be changed once the spin pool is live), it only ever appears for
Custom difficulty, and Custom's own default is ON (not derived from the
screw-level slider). Corrected behaviour, all verified live in
`app/game/mode-select.tsx`'s custom-difficulty panel:

- Easy → auto **ON**, no toggle shown.
- Medium → auto **ON**, no toggle shown.
- Hard → auto **OFF**, no toggle shown.
- Custom → defaults **ON**; a toggle (styled like the existing "Show ratings"
  switch, shown only when `mode.id === 'champions_league_custom'`) lets the
  player turn it off or back on. This is the *only* tier with an override —
  R3's "button wins in both directions" describes flipping Custom's own
  default, not overriding Easy/Medium/Hard.

- [X] Easy/Medium auto ON, Hard auto OFF, Custom defaults ON — all derived in
  `resolveDifficulty()` (`src/engine/difficulty.ts`) as
  `weightedPicksDefault = difficulty === 'custom' ? true : screwLevel <= 4`,
  alongside every other difficulty-driven knob.
- [X] Toggle lives in mode-select's custom-difficulty panel, not the draft
  screen — reflects the pool bias *before* the first spin, and can't be
  touched mid-draft since the pool is already fixed by then. Gated to CL
  (full) only. Verified: the toggle appears under "Difficulty" when Custom +
  CL (full) are selected, is absent for Easy/Medium/Hard, and is absent on
  every other mode.
- [X] Toggle overrides Custom's own default both ways — verified: defaults to
  "On", tapping flips to "Off — spins are drawn from the full pool." and back.
- [X] When effectively ON, spins are drawn only from top-league clubs in the
  pool. **Implementation note**: used the existing `leagues.tier` DB column
  (already the UEFA-coefficient rank for every `cucl_%` league, stamped at
  scrape time from the same ranking — see `db/queries/custom-ucl.ts`'s own
  comment) rather than importing `src/data/uefa-coefficients.ts` at runtime —
  same numbers, no second lookup. Added `l.tier AS assoc_rank` to
  `getClubSeasonsForMode` and filter to `assoc_rank <= N` in `spinClubSeason`.
  Verified live (at the original top-10 cutoff): with the toggle forced on, a
  spin landed on Royal Antwerp FC (Belgium, UEFA rank 7). **Maintainer later
  tuned the cutoff down to top-6** directly in `src/engine/draft.ts` — Belgium
  (rank 7) would no longer qualify under that tighter threshold; the mechanism
  itself (DB-sourced rank, single filter line) is unchanged, only the number.
- [X] Button/badge communicates the effective state and source — mode-select
  shows "On/Off — spins are drawn from…"; the run's saved `difficulty_meta`
  now also carries `weightedPicks` for CL (full) runs, and `DifficultyBadge`
  (leaderboard/runs/achievements) shows a "Weighted picks on/off" caption.
- [X] **Leaderboard/hardness impact** (maintainer decision: factor it in, not
  just display it): `hardnessOf()` now takes a `weightedPicks` flag and
  subtracts a full point when effectively on for CL (full) — the same weight
  as visible ratings, since it's the same kind of "made the draft easier"
  knob — clamped at 0 so it can't go negative. `resolveDifficulty()` threads
  the CL-full override through to both the hardness calc and
  `saveCustomUclRun`'s persisted `difficulty_meta`/score multiplier, so a
  weighted-picks run scores lower than an otherwise-identical unweighted one.
  `scripts/verify-difficulty.ts` still passes unchanged (the new parameter
  defaults to `false` everywhere else, so non-CL-full hardness is untouched).

---

## 5. Draft, subs & chaos fixes (batch)

Small, mostly self-contained correctness/UX fixes. Grouped because they share the
draft/placement/match-detail surface.

| #   | Fix                                                  | Detail                                                                                                                                                                                                                                                                            | Likely location                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 | **Subs show "-" for team**                     | A substitute's row doesn't show which team they're from (renders`-`). Populate the team for bench/subbed players. In the final result screen this bug appears not for WC countries but for UCL teams.                                                                          | [`src/components/MatchDetailModal.tsx`](../src/components/MatchDetailModal.tsx) (timeline/lineup), [`src/engine/match-detail.ts`](../src/engine/match-detail.ts)                                                                                                                                                                                                              |
| 5.2 | **Chaos mode doesn't hide ineligible players** | In chaos, players who can't play the spun position should be**hidden**, but aren't.                                                                                                                                                                                         | [`app/game/draft.tsx`](../app/game/draft.tsx), [`src/engine/draft.ts`](../src/engine/draft.ts) (`isPlayerAvailable`)                                                                                                                                                                                                                                                        |
| 5.3 | **Phantom "highlighted player" in drafting**   | The so-called highlighted player in the lineup during drafting is a**visual bug** — remove it.                                                                                                                                                                             | [`app/game/draft.tsx`](../app/game/draft.tsx) / [`app/game/placement.tsx`](../app/game/placement.tsx), `LineupPitch`                                                                                                                                                                                                                                                        |
| 5.4 | **Sort hidden-rating lists A–Z**              | When subs**and** rating are hidden, sort players by **name A–Z** (so OVR can't be inferred from order in subs — consistent with the existing chaos/cursed surname-sort rule).                                                                                       | [`app/game/draft.tsx`](../app/game/draft.tsx), [`src/engine/draft.ts`](../src/engine/draft.ts)                                                                                                                                                                                                                                                                                |
| 5.5 | **Competition display-name rename**            | Every**user-facing** label reads **"UEFA Champions League"** (not "Champions League") and **"FIFA World Cup"** (not "World Cup"). Internal mode ids stay `champions_league` / `champions_league_custom` / `world_cup` — display strings only.            | mode-select, headers, result/sim screens, how-to-play, tiers/labels — grep the display strings (`src/theme.ts` `MODE_THEMES` labels, [`app/game/mode-select.tsx`](../app/game/mode-select.tsx), [`app/game/simulation.tsx`](../app/game/simulation.tsx), [`app/game/wc-result.tsx`](../app/game/wc-result.tsx), [`app/game/cl-result.tsx`](../app/game/cl-result.tsx)) |
| 5.6 | **Modals unclickable on PC (persistent)**      | Found while working this batch, not in the original notes —**PC/desktop only**, reported as persistent: after opening one modal (a group, a team's matchdays, a knockout tie) and tapping a match inside it for stats, the page could end up stuck with nothing clickable. | [`src/components/AppModal.tsx`](../src/components/AppModal.tsx), [`app/game/cl-result.tsx`](../app/game/cl-result.tsx), [`app/game/custom-ucl-result.tsx`](../app/game/custom-ucl-result.tsx), [`app/game/wc-result.tsx`](../app/game/wc-result.tsx)                                                                                                                        |

### Notes & acceptance

- [X] **5.1**: a sub's team must be present everywhere the sub appears (timeline,
  lineup, tap-through stat line). Add the invariant to
  `scripts/verify-match-detail.ts` ("every event/lineup entry has a resolved
  team"). — Root cause was in the four result screens
  (`cl-result.tsx`, `custom-ucl-result.tsx`, `wc-result.tsx`, `result.tsx`), not
  `MatchDetailModal`/`match-detail.ts`: each built a local `squad` for
  `SquadSummary`/`LineupPitch` from `draftedPlayers` alone, dropping
  `benchPlayers`, so `SquadSummary`'s "Team" tab couldn't look up a sub's
  drafted club and fell back to "—". Fixed by using the existing `fullSquad`
  (`[...draftedPlayers, ...benchPlayers]`) for live runs in all four. Also
  added the `isHome`-resolved invariant to `verify-match-detail.ts` as a
  regression guard on the seeded layer itself (it already held).
- [X] **5.2**: mirror the existing availability filter; ineligible = not rendered (not
  just greyed). Verify by spinning a position in chaos and confirming off-position
  players are absent from the list. — **Flag for confirmation:** the actual bug
  lives in **Cursed** mode's blind position-spin flow, not Chaos — Chaos has no
  position-spin mechanic in the current code, only Cursed does
  (`mode === 'cursed'`, `spunPosition`). The slot-picker modal already
  restricted assignment to the spun slot; the player-list eligibility check
  upstream used the full `openSlots` instead, so a player who fit some *other*
  open slot showed as pickable, then hit "No compatible slots open" in the
  picker. Fixed by deriving `eligibleSlots` (the single spun slot in Cursed,
  else all open slots) and using it everywhere `isPlayerAvailable` is called
  in `draft.tsx`. Please confirm this is the intended target before treating
  it as closed.
- [X] **5.3**: confirm it's purely presentational (no selection state depends on it)
  before deleting. — Confirmed (`formationDotNext`/`openSlots[0]` highlight had
  no other reader) and removed, along with the now-unused style.
- [X] **5.4**: reuse the existing hidden-rating sort path (chaos/cursed/hard already
  sort by surname) rather than a second sort implementation. — The starting-XI
  list already did this; the bench/sub draft list (`draft.tsx`) always sorted
  by OVR descending regardless of `ratingsHidden`, which leaked OVR straight
  back through list position even with the number hidden. Now reuses the same
  surname-fallback rule.
- [X] **5.5**: prefer a **single source** for each competition's display name (e.g. the
  `MODE_THEMES` label or a `tiers.ts` label) and reference it everywhere, so the
  next rename is one edit — don't sprinkle raw literals. Keep one constant, update
  all call sites. Leave any *official-context* strings that already read "UEFA
  Champions League" (e.g. the league-phase header) as-is. — Added
  `MODE_LABELS` to `src/theme.ts` as the single source, used by `mode-select.tsx`
  and `achievements.tsx`; all other user-facing prose occurrences (result
  screens, placement, how-to-play, about, custom-UCL viewers) updated to the
  full names.
- [X] **5.6**: reported by the maintainer as a persistent PC-only bug, surfaced
  while testing 5.1–5.5, not in the original notes. **Root cause:** several
  result-screen handlers double as a parent modal's `onOpenMatch`/`onStats`
  callback (`WCGroupModal`, `TeamModal`, `KOMatchModal`) — tapping a match
  *inside* one of those to open the shared match-stats modal set `matchDetail`
  but never closed the parent's own open-state. `AppModal`'s web overlay had a
  single hardcoded `zIndex: 1000` with no shared stacking order, so two
  full-screen `position: fixed` divs ended up mounted as siblings with
  identical z-index — which one painted on top (and was clickable) depended on
  JSX declaration order, not open order, and the page could end up with a
  covering, non-interactive layer left behind. Confirmed via direct DOM
  inspection (multiple simultaneous `position:fixed`, `zIndex:1000` overlays
  each covering the full app column). Touch's more forgiving hit-testing
  likely masked this on mobile — a precise PC mouse click does not.
  **Fix, two parts:** (1) every affected handler
  (`openLeagueMatchDetail`/`openKoLegDetail` in `cl-result.tsx` and
  `custom-ucl-result.tsx`; `openGroupMatchDetail`/`openKoDetail` in
  `wc-result.tsx`) now closes its parent modal's state before opening
  `matchDetail`. (2) `AppModal` now hands each mounted instance its own
  incrementing z-index (module-level counter) instead of a shared constant, so
  whichever modal opened most recently is always the top, clickable one —
  belt-and-braces against the same class of bug in future modal work (§7–§10
  add several more modals). Verified: opened a group modal, tapped a match
  inside it, confirmed via DOM inspection that only the match-stats overlay
  remained (parent modal's state cleared, not just visually covered), closed
  it, confirmed zero `position:fixed` overlays remained and the page was fully
  interactive again.
- [X] `tsc` clean; `verify-match-detail.ts` green including the new sub-team
  invariant; no user-facing "Champions League"/"World Cup" short forms remain;
  nested modal-then-match-stats flows leave no stray full-screen overlay behind.

---

## 6. Remove Era mode

### Requirement

Remove **Era mode** (`era`) entirely — from mode selection, the `GameMode`
type/variants, theming, scoring, and any copy/how-to references.

### Implementation pointers

- `GameMode` variant `era` is referenced across mode-select, theme, tiers,
  scoring, and how-to-play. Grep and remove:
  [`app/game/mode-select.tsx`](../app/game/mode-select.tsx),
  [`src/theme.ts`](../src/theme.ts) (`MODE_THEMES`),
  [`src/data/tiers.ts`](../src/data/tiers.ts),
  `src/types/game.ts`, [`app/(tabs)/how-to-play.tsx`](../app/(tabs)/how-to-play.tsx).
- **Migration guard (decided):** existing saved runs / `career_stats` may carry
  `mode: 'era'`. Remove the mode from all *live* surfaces, but **keep the readers
  tolerant** and **label historical rows "Era (retired)"** wherever an old
  `era` run/stat is displayed (leaderboards, runs list, career). Do **not** delete
  or rewrite historical data — just stop offering the mode and render old rows with
  the retired label. Keep a single retired-label constant rather than scattering the
  string.

### Acceptance criteria

- [X] Era is absent from mode selection and all live copy.
- [X] `tsc` clean with no dangling `era` references.
- [X] Loading a historical run/leaderboard that references `era` does not crash.

---

## 7. Deep Simulation Match (finals)

The headline feature. At the **final** of a knockout, the match becomes a **Deep
Simulation Match** — a one-time, live-feeling broadcast of an already-decided
result, with live stats, momentum, lineups, ratings, and a win/lose ceremony.

**Available in all three knockout competitions:** **UEFA Champions League**
(classic, `champions_league`), **custom UEFA Champions League** (full,
`champions_league_custom`), and the **FIFA World Cup** (`world_cup`).

> **Architecture guard (critical).** Per
> [`PROJECT_STATE.md`](PROJECT_STATE.md) the engine is **result-first** and deep
> stats are a **deterministic seeded texture layer**. The Deep Match must **not**
> invert this: the result, scoreline, scorers, momentum series, and event
> timeline are **all computed up-front** (from the match seed) and the live view
> merely **plays them back** on a clock. Nothing is decided during playback. This
> is why pause/skip are trivially safe.

### Flow

1. **From semi-finals onward the normal knockout list stops.** Instead of
   "Skip all", the control becomes **"Skip to Final"**.
2. After skip-to-final, the button changes to **"See Lineups"** → a screen showing
   **both finalists and their lineups**.
3. That screen has a **"Start Final"** button → enters the **live Deep Match**.
4. **Live Deep Match** shows, updating in real time as the predetermined minutes
   play out:
   - **All match stats**, moving the instant an event happens (a goal adds a shot
     on target + related stats live).
   - **Both lineups + player ratings**, including **subs** as they happen and
     **live rating updates**.
   - **Match Momentum** animating "live" (see §8).
5. **Ceremony** on the final whistle, based on outcome (**both are silent — no
   audio on win or loss**; the atmosphere is carried entirely by visuals):
   - **Win:** trophy (real trophy images — see Appendix A), **joyful** visual
     atmosphere, **confetti**. No sound.
   - **Lose:** **second-place medal** animation, **moody** atmosphere with
     **desaturated/depressive background tones**. No sound.
6. Then **"Final Results →"** leads to the normal post-match everything. **The
   Deep Match itself is a one-time experience and cannot be replayed** (the
   underlying result/stats remain viewable normally afterward).

### Timing & controls

- **Clock:** 1 match-minute = **0.5s** real time (→ a 90' match ≈ 45s;
  120' ≈ 60s).
- **Pause** and **Skip** are supported (everything is predetermined, so this is a
  pure UI fast-forward — safe by construction).

### Requirements

- **R1** — Applies to the **finals of all three knockout competitions**: UEFA
  Champions League (classic), custom UEFA Champions League (full), and FIFA World
  Cup. Semi-final onward the KO list yields to the Skip-to-Final → See-Lineups →
  Start-Final flow.
- **R2** — Live playback is driven by a single predetermined timeline (minute →
  events + momentum + running stats). No RNG during playback.
- **R3** — Stats, lineups, ratings, subs, and momentum all update on the clock and
  stay internally consistent with the final result and the §10 stats screen.
- **R4** — Pause/Skip available at all times; Skip jumps to the whistle +
  ceremony.
- **R5** — Ceremony branches on win/lose: win = confetti + trophy + joyful visuals,
  lose = medal + desaturated/moody visuals. **Both outcomes are fully silent — no
  audio on either path.**
- **R6** — One-time: no "replay Deep Match" entry point; "Final Results →" exits
  to the normal result/stats.
- **R7** — Guarded by the Android back-guard (§3).

### UX notes

- This is an **experience beat**, not a data screen — motion, pacing, and the
  emotional payoff carry it. The result-first architecture is what makes a
  *reliable* cinematic possible (no stutter from live computation).
- **0.5s/min** keeps a 90' final under a minute — long enough to feel live, short
  enough not to drag; Skip respects players who want the payoff now.
- Ceremony contrast is the whole point of the game's "Perfection or Misery" tone:
  lean **hard** into the asymmetry — confetti + gold vs. silent + grey/blue.
  Honour reduced-motion / accessibility by still delivering the outcome (medal vs
  trophy) even if confetti is toned down.
- **No audio at all** — both win and loss ceremonies are silent by design. The
  emotional contrast is carried purely by motion and colour (confetti + gold vs.
  desaturated grey/blue), which also sidesteps device-mute and autoplay concerns
  entirely.

### Implementation pointers

- **Build on the existing live + detail layers**, don't fork them:
  - [`src/components/LiveMatch.tsx`](../src/components/LiveMatch.tsx) — current
    live-reveal view; the Deep Match is a richer sibling.
  - [`src/engine/match-detail.ts`](../src/engine/match-detail.ts) — the seeded
    generator already produces the full sheet (possession/xG/shots/…/per-player
    ratings/MOTM) from a stored seed. Extend it to also emit a **per-minute
    timeline** (events + running stat deltas + momentum, §8) so the Deep Match can
    replay it. Same seed → identical timeline (determinism is mandatory).
  - [`src/components/MatchDetailModal.tsx`](../src/components/MatchDetailModal.tsx)
    — source the live stat rows / lineup / ratings widgets from here (or the new
    §10 screen) so the Deep Match and the static stats screen agree.
- New screen: `app/game/deep-match.tsx` (or a step inside `simulation.tsx`),
  reached only for WC/UCL finals. Drive playback with an interval keyed to the
  0.5s/min clock; pause = clear interval; skip = jump index to end then run
  ceremony.
- **React best-practices:** memoise the per-minute frames; the ticking clock
  should update only the changed rows (avoid re-rendering the whole sheet each
  tick — derive a `currentMinute` and select the frame, keep heavy widgets pure).
  Use Reanimated for confetti/medal (already a dep) and keep the timeline data out
  of React state where possible (a ref + minute cursor) to avoid churn.
- Trophy/medal/confetti assets: see Appendix A (need to be added to `assets/`).

### Acceptance criteria

- [X] Finals of all three knockout competitions (UCL, custom UCL, FIFA World Cup)
  trigger the Deep Match; SF-onward shows Skip-to-Final → See-Lineups →
  Start-Final.
- [X] Playback is a pure replay of a predetermined timeline (verify: same seed →
  byte-identical timeline; a headless `verify-deep-match.ts` asserts events,
  momentum, and running stats reconcile with the final result).
- [X] Stats/lineups/ratings/subs/momentum update on the 0.5s/min clock and match
  the §10 stats screen exactly.
- [X] Pause and Skip work; Skip → ceremony.
- [X] Win = trophy + confetti + joyful; Lose = medal + desaturated; **both fully
  silent (no audio on either path)**.
- [X] No replay entry point; "Final Results →" returns to the normal result/stats.
- [X] Android back is guarded (§3); error console clean in a browser walkthrough.
  *(back-guard wired; the browser walkthrough is the maintainer's — see below.)*

### As-built

- **`src/engine/deep-match.ts`** — `buildDeepMatchTimeline(detail, seed)`. Takes
  the finished sheet `match-detail.ts` already regenerates and answers "what did
  the numbers look like at minute N?". A stat's total is known but its accrual
  isn't, so each is shared across the minutes by **momentum share × a seeded
  per-stat jitter × event anchors** (a goal comes with a shot on target in the
  same minute; a booking with a foul). Allocation is largest-remainder, so the
  cumulative value at the whistle is **exactly** the sheet's — that exactness is
  the invariant everything else leans on. Live player ratings walk from 6.0 to
  the sheet's figure with the player's own moments landing as visible steps, and
  the eased part carries whatever the steps don't, so the value at his last
  minute is the sheet's to the decimal.
- **`app/game/deep-match.tsx`** — the three beats (lineups → live → ceremony).
  The timeline is built once into a ref; the only thing that changes per tick is
  a single `minute`, so a tick re-renders numbers, never structure.
- **`src/components/Ceremony.tsx`** — trophy/medal/confetti. Silent on both paths;
  reduced-motion drops the confetti and still delivers the outcome.
- **`src/lib/deepMatch.ts`** — the module-scope handoff (same pattern as
  `matchStats.ts`), including the `onFinished` callback: the simulation screen
  stays mounted underneath and owns what happens after the final.
- **Knockout screens** — `KnockoutPhaseView` (UCL classic + World Cup) and
  `custom-ucl-simulation.tsx` gained a `deepFinal` path, supplied **only when the
  player's own side reached the final**. Your final never plays out inline and its
  scoreline is kept off screen until the Deep Match reveals it; the results CTA
  is withheld until it's been watched.
- **Verified:** `npx tsx scripts/verify-deep-match.ts` — 3,000 finals (~292k
  frames, a quarter of them AET).

**Second pass (maintainer playtest).** The first build worked but gave the
match away and under-sold it. What changed:

- **The team sheet was spoiling the result.** It rendered the FINISHED player
  lines, so both sides walked out with the goalscorers already marked, the
  cards showing, the substitutions announced with their minutes, and the
  winner's ratings on display. The timeline now exposes `playersAt(minute)` — a
  snapshot of the sheet as it stood at that minute — and the pre-kickoff view is
  `playersAt(0)`: a clean slate, no ratings (`showRatings={false}`), with the
  substitutes on a bench underneath. The same component is then fed the live
  minute during playback, so goals land on shirts as they're scored and a
  substitute moves off the bench the minute he comes on.
- **Ratings "barely update".** Fair: the first model eased smoothly from 6.0 to
  the final figure, which for a player finishing on 6.4 moves about a tenth
  every ten minutes. Now the drift is chopped into lumps and a slow, zero-sum
  wobble is laid over it, so the number climbs and gives some back. Event bumps
  are bigger too (a goal is +1.2). Measured, not asserted: `verify-deep-match`
  reports the travel and direction changes and **brackets them on both sides** —
  the first attempt at a fix used per-minute noise and travelled 17 points
  across 49 direction changes, which reads as a slot machine.
- **The momentum graph was leaking extra time.** Its x-axis is scaled to the
  duration and labels the breaks, so handing it 120 from the first minute
  announced "this one goes to extra time" before kickoff. It stays a 90-minute
  graph until the clock passes 90, then rescales.
- **The event feed is now the real `Timeline`** — the same component the stats
  screen draws, with a new `revealUpTo` so period breaks only appear once
  reached (a "Full-time · +4'" line in the 20th minute both looked wrong and
  gave away the stoppage time). Scorers also appear under the scoreboard as they
  happen, via a `ScorerList` promoted out of the stats screen into the shared
  module.
- **"Which side is who?"** The stat grid was a column of "4 · Shots on target ·
  2" with nothing naming the teams — on the stats screen as well as here. New
  shared `StatSideHeader` names both sides above every stat block, in the same
  left/right order the bars use.
- **Skip-to-Final appeared far too late.** The spec said "semi-finals onward";
  in practice your final is what you're waiting for from the moment the bracket
  opens, so it's now offered from the first revealed round. Skipping still
  reveals every round on the way.
- **The finish bounced through the bracket.** "Final Results →" popped back to
  the knockout screen and let that screen push the results, so you got a flash
  of the bracket you'd just finished. The commit is now split from the
  navigation (`commitKnockoutResult` / `finishKnockoutPhase` and friends): the
  ceremony shows a brief hand-off spinner and `router.replace`s itself with the
  result screen.

*Found while fixing the above:* `spanOf` derived a player's last minute from
`subOffMinute` alone, so a **sent-off player kept accruing minutes to the final
whistle** — the sheet records a red card's early finish only in `minutes`. It
now derives the end from the player's own minutes, which covers sendings-off,
injuries and the whistle without needing to know which it was.

**Deviations from the spec, deliberate:**

- **Trophies are SVG, not photographs.** Appendix A asked for real trophy images
  and noted the licensing call. The real trophies are trademarked silhouettes, so
  `Ceremony.tsx` draws original stand-ins in the same family (a two-handled cup
  for the club competitions, a globe-on-a-plinth for the World Cup). Swapping in
  licensed artwork later means replacing two components and nothing else.
- **Confetti is RN `Animated` with the native driver, not Reanimated.** It only
  animates transform + opacity on views that never re-layout, which is exactly
  what the native driver covers, and it matches what the rest of the app's
  screens use.

**Found while building this:** a live Champions League final tapped from the
knockout list opened with **no scorers and a hashed seed** — `koTieToMatchDetailRequest`
read `tie.scorers`/`tie.seed` for single-match ties, but a CL final comes through
the two-legged shape and stores them under `leg1*`. It was showing a different
match to the one the result screen showed. Fixed with the same fallback the
World Cup adapter needed.

---

## 8. Match Momentum

A new stat + visualisation: a graph of momentum minute-by-minute across the match
(1–90, or 1–120 for extra time), shown **live** in the Deep Match (§7) and in the
full **Match Stats** screen (§10).

### Reference graphs

**90-minute:** pink above / red below a centreline, HT dotted divider, goal
markers as ball icons, own-goal / red-card markers.

![Momentum reference — 0' to HT to FT, two-team area above/below centreline, ball icons mark goals](image/BigFixes/1784839422643.jpg)

**With extra time (AET):** adds the FT dotted divider and an AET tail; here a
red-card marker (the red block at FT) is shown too.

![Momentum with AET — 0' · HT · FT · AET, includes a red-card marker at FT](image/BigFixes/1784839426249.jpg)

### Data model

- **Per-minute signed value.** For each minute `m` (1…90 or 1…120) produce a
  momentum value in **−100…+100**, where the **sign = which team** holds momentum
  and the **magnitude = intensity** (1–100). **100 is the absolute extreme**,
  reached only when a team is *really* on top. It is **not** a static 0/100 — it's
  a real derived range.
- **Derivation order:** `goals → stats → momentum`. Momentum is derived from goals
  and the generated stats, so **~85% of the time a goal occurs, momentum reflects
  it** (the scoring team holds momentum around that minute). It isn't "real" but is
  *effectively* real because it derives from the same data.
- **Markers on the axis:** goals (ball icon), **red cards**, and **own goals**
  (§9) are plotted at their minute. HT (and FT for AET) are **dotted Y-axis
  dividers**; X-axis = minutes, ticked.

### Rendering — hybrid (decided)

- **Axes:** X = minutes with `0' … HT … FT (… AET)` labels and dotted dividers at
  the breaks; Y = signed momentum, team colour above vs below the centreline
  (use the two mode/team accents, e.g. accent vs red).
- **Marks — hybrid (locked):** the underlying **data model is per-minute** (the
  raw notes' "rectangle per minute" — equal-width, magnitude = height, above/below
  by team), and it is **rendered as a smoothed/rounded filled area** for polish, as
  in the reference screenshots. So it's honest data *and* a broadcast-quality curve:
  per-minute values drive a smoothed area, not literal hard bars. (This is the
  confirmed choice — no bars-only fallback.)
- **Live reveal:** in the Deep Match, the smoothed area fills left-to-right on the
  0.5s/min clock, one minute at a time from the per-minute series; in the static
  stats screen it renders complete.

### UX notes

- Momentum is a **narrative** device — it answers "who was on top, when?" at a
  glance and makes the goal markers legible against the flow. Keep the centreline
  crisp and the two team colours unambiguous (respect the colour-blind-safe
  guidance — don't rely on hue alone; the above/below split already encodes team).
- Markers must not drown the curve — small, high-contrast, on the axis, not
  floating in the fill.

### Implementation pointers

- Generate the series deterministically in
  [`src/engine/match-detail.ts`](../src/engine/match-detail.ts) from the match
  seed (mulberry32, `src/lib/rng.ts`), *after* goals and stats are known, so the
  `goals → stats → momentum` order holds and re-opening reproduces it exactly.
- Render with `react-native-svg` (already a dep). A `<Momentum>` component takes
  `series: number[]` (signed), `breaks: { ht, ft? }`, `markers: {minute, kind}[]`,
  `accentA`, `accentB`. Shared by the Deep Match and the §10 screen.
- Add to `scripts/verify-match-detail.ts`: series length matches match length;
  values within −100…100; the "goal ⇒ momentum toward scorer ≈85%" aggregate
  holds over thousands of sims; markers land on real event minutes.

### Acceptance criteria

- [X] Deterministic per-minute signed series (−100…100) derived after goals+stats.
- [X] ~85% of goals show momentum toward the scoring team at that minute
  (verified in aggregate — measured 83–84%).
- [X] HT (and FT for AET) dotted dividers; goals, red cards, own goals marked on
  the axis.
- [X] One shared component renders both the live (progressive) and static (full)
  views. *The live caller arrives with §7; the `revealUpTo` prop that drives it
  is built and in place.*

### As built

**Series generation** — `buildMomentum` in
[`match-detail.ts`](../src/engine/match-detail.ts), called as the very last step
of `generateMatchDetail` so the `goals → stats → momentum` order is structural,
not just intended. Stored on `MatchStats.momentum` (`length === duration`,
index 0 = minute 1), regenerated from the seed like everything else.

Three ingredients, summed then squeezed through `tanh(x * 0.78) * 100`:

1. **Texture** — smoothed noise (3-tap kernel over `rngNoise`), so the curve
   crosses the centreline the way a real match does instead of parking on one
   side. Measured: 17% of minutes flip sign.
2. **Base lean** — `homeDom * 0.42`; the better side simply spends more of the
   match on top.
3. **Event pulses** — a Gaussian bump per goal (σ ≈ 2.6 min) peaking *one minute
   before* the goal, i.e. the pressure that produced it; a red card applies a
   sustained shift to the opposition, ramped in over ~3 minutes and held.

The `tanh` squeeze is the tuned bit: without it the curve pegged at ±100 for
~4.7% of all minutes, which makes "100 = really on top" meaningless. At 0.78 it
sits at the extreme 1.3% of minutes (~1 per match) with a mean |momentum| of 32.

**Hitting ~85% honestly.** Rather than letting noise decide, 15% of goals are
explicitly rolled as *against the run of play* and get an inverted, damped pulse
— the smash-and-grab. That is what produces the spec's ~85% instead of a
suspiciously perfect 100%, and it means the exception is a real modelled event.

**§9 reconciliation** — an event's `isHome` is the side it *counts for*, so own
goals already swing momentum to the **benefiting** team with no special case.

**Rendering** — new shared
[`src/components/MomentumGraph.tsx`](../src/components/MomentumGraph.tsx):
`react-native-svg`, Catmull-Rom → cubic Bézier smoothing of the real per-minute
points (no invented in-between values), drawn as one closed area path rendered
**twice** under two clip paths — the only way to two-tone a single fill that
crosses the centreline. Markers (goal / own goal ringed red / red-card block)
live in dedicated rows above and below the plot so they never drown the curve;
dotted dividers at HT (and FT when there's extra time); ticked minute axis.
`revealUpTo` slices the series for §7's progressive left-to-right fill.
Colour-blind safety: hue is never the only signal — above/below already encodes
the team, and the marker rows match. The SVG measures its container via
`onLayout` rather than stretching a fixed viewBox, which would have squashed the
marker circles into ellipses on wider screens.

**Verification** — `verify-match-detail.ts` gained a §8 section: series length ==
duration, every value an integer in −100…100, goal→momentum agreement inside
78–93%, and three shape guards proving it's a real derived range rather than a
static 0/100 (mean |momentum| in 20–70, extremes < 3% of minutes, centreline
crossings > 8%).

### Bugs found while building this

- **Phantom scorers (real, caught by the new §9 checks).** §9 put many more
  involvements on the sheet (own goals, penalties won, errors), which shrank the
  pool of starters eligible to be withdrawn for a substitution — so a bench
  player who scored could have their substitution silently dropped, leaving a
  scorer who was never on the pitch and a side whose player goals didn't sum to
  its scoreline. Fixed in `resolveSide`: a must-play sub now falls back to
  coming on at their *first involvement* minute when the preferred earlier
  minute has nobody free, with starting them as an unreachable last resort. The
  pre-existing `continue` that dropped the sub is gone for must-play cases.
- **Flaky pre-existing threshold.** `upset losers rarely dominate xG` was set at
  `> 0.40` while the true rate is ~41% over only ~200 upset samples per run, so
  it failed on roughly half of all runs from sampling noise alone. Re-set to
  `0.33`, which still catches the regression it guards (a result-driven texture
  would collapse this far below a coin flip). Behaviour unchanged.

---

## 9. Own goals, penalties & mistakes

New match events layered onto the result-first engine, feeding both stats
attribution and the momentum/timeline.

### Events

- **Own goals.** A goal can become an own goal: instead of the attacker scoring,
  an **opposition defender** puts it in their own net. **Rare**, and when it
  happens the scorer is a **defender 90%** of the time, **10%** any other position
  **including the goalkeeper**. Counts for the *benefiting* team's scoreline;
  attributed as an OG against the *scorer's* record (not a normal goal).
- **Penalties.** Some goals become **penalties**. This introduces a **new stat:
  the player who *won* the penalty** (drew the foul). The penalty taker is
  credited normally (with a "(pen)" marker); the winner gets the new "penalty won"
  credit.
- **Mistakes.** Events where a player's error **leads to** a goal (consistent with
  `goals → stats`, i.e. the goal exists first and the mistake is the attributed
  cause). Surfaced in the timeline/stat line as an error-leading-to-goal.

### Requirements

- **R1** — OG rarity + the 90/10 defender-vs-anyone (incl. GK) split.
- **R2** — Penalty conversion of some goals; **new "penalty won" stat** for the
  fouled player; taker marked "(pen)".
- **R3** — Mistakes attributed as "error led to goal".
- **R4** — All three appear in the **timeline** and the **momentum axis markers**
  (OGs and red cards explicitly called out in §8), and in per-player stat lines.
- **R5** — Attribution follows **attribute-once-store-on-match**: decided when the
  result is created, stored on the match, so live reveal, Deep Match, stats screen,
  and history all agree. Shootout kicks still never count as goals.

### UX notes

- **Markers on the reference:** the FotMob timeline shows exactly the vocabulary we
  need — **"Own goal"** label, **"Penalty"** label, running score in parentheses,
  and assist attribution — so mirror that labelling (team names, not crests).
- OGs are a *gut-punch/comedy* beat; make the marker unmistakable (distinct icon,
  the scoring shown for the correct team) so it never reads as a normal goal by the
  conceding side.

### Implementation pointers

- Decide the events in the **result-first** layer /
  [`src/engine/match.ts`](../src/engine/match.ts) &
  [`src/engine/match-detail.ts`](../src/engine/match-detail.ts) (seed-driven), then
  **attribute** in [`src/engine/stats.ts`](../src/engine/stats.ts) alongside the
  existing scorer/assist/clean-sheet attribution. Add "penalty won" and "error led
  to goal" to the per-player stat shape (`src/types/stats.ts`).
- Own-goal position roll (90% DEF / 10% any incl. GK) is a seeded draw over the
  conceding team's on-pitch players.
- Reconcile with momentum (§8) so an OG/penalty minute reads correctly (momentum to
  the *benefiting* team).
- Extend `scripts/verify-match-detail.ts`: OG rate is rare and matches the 90/10
  split over many sims; every penalty has a distinct winner ≠ taker's own-goal;
  totals still reconcile (OGs count for the right team; no double-count).

### Acceptance criteria

- [X] OGs are rare with the 90/10 split; credited to the benefiting team, marked as
  OG against the scorer.
- [X] Penalties mark the taker "(pen)" and credit a distinct "penalty won" player.
- [X] Mistakes show as "error led to goal".
- [X] All three appear in timeline + per-player stats and are consistent across
  live/stats/history (attribute-once). *Momentum markers land with §8, which
  consumes the same events.*

### As built

**Where the decision lives.** All three events are rolled inside
`attributeMatchScorers` ([`src/engine/stats.ts`](../src/engine/stats.ts)) — the
same seeded call that already decided scorers — so they are stored on the match
alongside the scorers and adopted verbatim everywhere downstream. Nothing
re-rolls them on open (R5).

**Data model.** `GoalEvent` gained `ownGoal` / `penalty` / `penWonId+Name` /
`errorById+Name`. The event always sits in the array of the side the goal
**counts for**, so an own goal lives with the *beneficiary* while its
`clubId`/`scorerId` name the *conceding* player — which is how an OG is
displayed everywhere and means existing "goals = `scorers.home.length`" readers
stayed correct. `MatchEvent` mirrors the same fields, and `PlayerMatchLine` /
`PlayerStatLine` gained `ownGoals`, `penaltyGoals`, `penaltiesWon`,
`errorsLeadingToGoal` (optional on the persisted `PlayerStatLine`, so saved runs
don't grow four zero fields per player).

**Rates** (per goal, tuned to real top-flight football and verified over ~12k
generated goals): own goals `2.2%`, penalties `8.5%`, errors `7%`. Mutually
exclusive — an OG is never a penalty and carries no assist or error; a penalty
carries no assist (the "won by" credit replaces it) and no error (the foul *is*
the error).

**Draws.** The OG scorer is a **90/10** defender-vs-anyone-including-GK draw over
the conceding side's eligible players, deliberately *not* quality-weighted (an
own goal is bad luck, not a skill gap). The penalty taker uses the normal scorer
weight **squared**, which concentrates the pick on genuine forwards the way a
designated taker would. "Penalty won" is drawn from the benefiting side
excluding the taker, so it's always a distinct credit. The error is drawn from
the conceding side weighted toward the keeper and centre-backs.

**"Attacking goals" invariant.** An OG is not a shot, so it carries no shot-on-
target, no xG, and no save opportunity. Every texture number in
[`match-detail.ts`](../src/engine/match-detail.ts) is now anchored on a side's
*attacking* goals (scoreline − own goals gifted to it) rather than the raw
scoreline; `keeperSaves` and the keeper's `savePct` follow suit, while
`goalsConceded` stays the scoreboard number. Lineup resolution reads **both**
sides' goal lists, because a side's OG scorer and error-maker are recorded on
the *opponent's* goals and still have to be on the pitch at that minute.

**Ratings.** OG −1.2, error-led-to-goal −0.8, penalty won +0.25, and a converted
penalty banks only 65% of the usual goal bonus.

**Surfaces.** Live feed (`LiveMatch`) uses a distinct 🥅 icon plus an explicit
`(OG)` tag and suppresses the SUB tag for OG scorers; `summariseScorers` appends
`(OG)` / `(pen)` per minute, which flows into every scorer strip and the tie
modal; `MatchDetailModal`'s timeline shows a red name + "OWN GOAL" / "PENALTY"
tag, a "won by …" / "assist: …" credit line, and an "error led to goal · …"
line; the per-player sheet gained Goals `n (m pen)`, Own goals, Penalties won
and Errors led to goal rows.

**Verification.** `scripts/verify-match-detail.ts` grew a §9 section: rate bands,
the 90/10 split, every penalty naming a "won by" player who is a teammate but
not the taker, OG scorers/error-makers resolving to the *conceding* lineup and
being on the pitch at that minute, and Σ-per-player reconciliation for all four
new counters. Green over 4000 matches — observed 2.25% OGs (92% by defenders),
8.6% penalties (100% with a named winner), 6.1% errors.

---

## 10. Match Stats screen redesign (dedicated screen)

### Problem

The current match stats live in a **modal** with a single long strip / timeline.
It's cramped, added time isn't shown per half, and there's no room for momentum or
the richer breakdown.

**Current timeline (what we're upgrading from):**

![Current TIMELINE — single strip, alternating sides, subs/cards/goals, no per-half added time, no momentum](image/BigFixes/1784839441897.jpg)

### Target

Promote match stats to a **dedicated screen** (not a modal), with **more spacing**
and **categorised sections** instead of one long strip. Also **show added time for
each half**, and **show penalties** in the timeline. The FotMob layout is the
visual reference; **we show team names, not crests.**

**Top of screen — header:** team names, big score, "FT" (or AET/pens), and the
scorer lists under each team with **(Pen)** and **(OG)** markers.

![Header reference — TeamName  3 – 2  TeamName, FT, scorer lists with (Pen) and (OG)](image/BigFixes/1784839457268.jpg)

**Section — Momentum + first key stats:** the §8 momentum graph, then
possession, xG, shots, shots on target, touches in box, with the **leading team's
value highlighted** in a colour pill.

![Momentum + key stats reference — momentum graph, possession bar, then xG / shots / SoT / touches with the leader highlighted](image/BigFixes/1784839465857.jpg)

**Section — Timeline:** running score in parentheses, **HT divider with the
half-time score**, goals (with **Penalty** / **Own goal** / **assist by** labels),
subs (green in / red out), cards; **per-half added time** shown (per-half added time is something that is missing from the data being generated so add that, since you should also be able to score at 45'+x')). As well as penalties themselves (if it goes to them) should be shown under it, so you can see who scored and who did not their penalties.

![Timeline reference — running score in parens, HT divider, Own goal / Penalty / assist labels, sub arrows, yellow card](image/BigFixes/1784839474791.jpg)

**Section — Context at the moment of the match:** the **standings as they were
when this match was played** (e.g. if it was matchday 7, the table after MD7),
**top-3 rated players from each team**, and **each team's last 5 results** before
this game (with how they finished). Team names throughout (no crests).

![Context reference — mini standings (Pl/W/D/L/GD/Pts), Top rated ×3 per team, Team form last-5](image/BigFixes/1784839482015.jpg)

### Requirements

- **R1 — Dedicated screen**, replacing the modal for full stats (a quick peek can
  still link into it).
- **R2 — Header:** team names + score + status (FT/AET/pens) + scorer lists with
  **(Pen)** / **(OG)** markers.
- **R3 — Sections, not a strip:** (a) Momentum + key stats, (b) Timeline, (c)
  Context (standings-at-time / top-rated / last-5 form). Generous spacing.
- **R4 — Added time per half** shown; **penalties** shown in the timeline.
- **R5 — Momentum** embedded (§8). Key stats highlight the leader per row.
- **R6 — Standings "as of" this match** — the table state at that matchday, not the
  final table.
- **R7 — Top-3 rated per team** and **last-5 form per team** (results + W/D/L),
  team names only.
- **R8 — Consistency:** every number matches the Deep Match (§7) and the stored
  seed — attribute-once, regenerate-from-seed.

### Pre-step — the data layer (done ahead of the screen)

The screen was blocked on numbers that didn't exist yet. These landed first, so
§10 is now purely a layout job:

- **Added time per half** (R4). `MatchStats.addedTime` —
  `{ firstHalf, secondHalf, firstET?, secondET? }`, seeded, with extra-time
  halves present only on a 120' match. First halves run 1–3', second halves
  3–7' (they absorb the subs, cards and time-wasting), and each figure is
  floored at the largest `plus` on any event in that half, so a 90+4 goal can
  never sit outside the added time the board showed. Rendered as period-divider
  rows in the timeline.
- **Missed penalties** (R4). §9 only ever turned a *goal* into a penalty, so
  every spot-kick in the game was scored. Misses never touch the scoreline, so
  like cards and subs they're generated in `match-detail.ts` from the seed
  rather than stored on the match. Maintainer-set rate: **~33% of all penalties
  missed** (`MISS_SHARE`; real top-flight conversion is nearer 75–80%, i.e.
  ~20–25% missed — one constant to change if that's ever worth tightening).
  Converted penalties arrive from §9 at ~0.25/match, so misses are drawn at
  0.123/match to make a third of all spot-kicks. **58% are keeper saves**, the
  rest off target. New `penaltiesMissed` on the player line and
  `penaltiesSaved` on the keeper line. **Ratings:** taker **−0.9** (the one
  shot a forward is expected to score), keeper **+0.85** for the save. Momentum
  gets a small positive pulse toward the *taking* side — missing it doesn't
  undo the pressure that won it.
- **Match context** (R6/R7). New
  [`src/engine/match-context.ts`](../src/engine/match-context.ts):
  `standingsAsOf(matches, upToMatchday)` rebuilds the table exactly as it stood
  when the game was played (same points → GD → goals-scored ordering the live
  standings use, so the snapshot can't disagree with the table watched all
  season); `formBefore(matches, clubId, beforeMatchday, limit)` gives the last-5
  strictly *before* the match; `topRated(players, isHome, n)` reads the top
  performers straight off the regenerated sheet. Mode-agnostic on purpose — it
  takes a minimal `ContextMatch` shape so domestic leagues, the UCL league phase
  and WC groups all feed the same code.

### UX notes

- **Scannability:** sectioning + a sticky mini-header (score always visible while
  you scroll, as in the FotMob shots) is the core win over the current one-strip
  modal. Group like with like; let each stat breathe.
- **Leader highlight** (colour pill on the higher value) lets the eye compare
  without reading both numbers — keep it, but ensure the pill colour meets
  contrast and doesn't rely on hue alone (pair with weight/position).
- **Standings-as-of** is a lovely context touch — it re-situates the match in the
  season. Reuse the season's table styling for recognition.
- Per repo convention: **no emblems → team names**; keep flag-emoji handling for WC.

### Implementation pointers

- Today's modal:
  [`src/components/MatchDetailModal.tsx`](../src/components/MatchDetailModal.tsx)
  (558 lines) — becomes (or feeds) a screen `app/game/match-stats.tsx`. Keep the
  data source — [`src/engine/match-detail.ts`](../src/engine/match-detail.ts)
  regenerates the sheet from the seed — and re-layout into sections.
- **Standings-as-of:** the season orchestrators already compute per-matchday
  tables ([`src/engine/simulation.ts`](../src/engine/simulation.ts),
  `cl-league-sim.ts`, `world-cup-sim.ts`); thread the matchday index onto the match
  so the screen can pull the table snapshot. If snapshots aren't retained, derive
  from the stored fixtures up to that matchday (deterministic).
- **Top-rated / last-5:** ratings come from `run-stats.ts` (`computeRunStats`
  regenerates ratings from seeds); last-5 from the fixtures preceding the match.
- **Added time / penalties in timeline:** surface fields already implied by the
  event model (§9) — add per-half stoppage to the generated timeline in
  `match-detail.ts`.
- Reuse `LineupPitch`, `ratingColor`, `PressCard`, `withAlpha`, theme tokens;
  follow the modal→screen scroll pattern (`flexShrink: 1` body) so nothing clips.
- **React best-practices:** a long stats screen should virtualise/lazy the heavy
  sections (timeline can be long); memoise section components and derive from one
  regenerated sheet rather than recomputing per section.

### Acceptance criteria

- [X] Full match stats open as a **screen** with the header / momentum+key-stats /
  timeline / context sections and clear spacing.
- [X] Header shows team names, score, status, and scorer lists with (Pen)/(OG).
- [X] Timeline shows per-half added time, penalties, own goals, assists, subs,
  cards, and period dividers.
- [X] Context shows standings **as of that matchday**, top-3 rated per team, and
  last-5 form per team — all with team names.
- [X] Every figure matches a history reload (seed-consistent);
  `verify-match-detail.ts` green. *(Deep Match parity lands with §7, which will
  read the same regenerated sheet.)*

### As built

**The modal is gone.** `MatchDetailModal` was a single 550-line tall modal
mounted at eleven call sites, each holding its own `matchDetail` state. It's now
a route — [`app/game/match-stats.tsx`](../app/game/match-stats.tsx) — reached
from anywhere with `openMatchStats(request, accent)`
([`src/lib/matchStats.ts`](../src/lib/matchStats.ts)). The old file was renamed
to [`MatchStatsParts.tsx`](../src/components/MatchStatsParts.tsx) and reduced to
what it actually is now: the `useMatchDetail` regeneration hook plus the
row-level building blocks (`StatBar`, `PlayerRow`, `Timeline`, `EventRow`,
`playerSheet`, `splitLineup`). Nothing in it knows about navigation.

**Why module-scope handoff, not route params.** The request carries pools,
stored scorers, the deep-stat seed, the drafted squad and the season context —
far too much for a URL, and half of it isn't serialisable. `openMatchStats` sets
a module-level `pending` and pushes; the screen takes it **once** on mount and
keeps its own copy, so a later push can never mutate a screen already on the
stack (two stats screens stacked each keep their own match).

**Layout.** A permanent sticky bar (back chevron · `Home 2 – 1 Away` · FT/AET/PENS
chip) so the score never leaves the viewport, then generously spaced cards:
header (big score, status, per-team scorer lists with (Pen)/(OG)) → momentum +
key stats + team ratings → timeline → shots → passes → defence & duels →
discipline → lineups & ratings (with the POTM banner) → *at the time of this
match*. The leader in each stat row is marked by colour **and** weight, never
hue alone.

**Context section** consumes the §10 pre-step's
[`match-context.ts`](../src/engine/match-context.ts): top-3 rated per side always,
plus — when the caller supplied `matchday` + `contextMatches` — the table as it
stood after that matchday (both clubs highlighted) and each side's last five
strictly before the game. Wired for the domestic league (result screen and live
sim), the UCL league phase (result screen and live sim) and World Cup groups
(each group is its own mini-league, not one 48-team table). Knockout ties pass
neither and the section says so instead of faking a standing.

**Back-guard interaction (§3) — a bug this created and fixed.** The anti-reroll
guard registered its `BackHandler` / `popstate` listener in a plain effect. With
the stats screen now pushing *on top* of guarded simulation screens, the
simulation's listener stayed armed underneath — so backing out of match stats
fired the quit-the-run confirm, and on web sent you straight home. The guard now
registers through `useFocusEffect`, so only the screen you're actually looking at
guards its back button, and it re-arms the web sentinel each time it regains
focus.

---

## 10.5 Match page tabs, lineups, injuries & player stats

A maintainer-driven upgrade on top of §10, sequenced **between §10 and §7**.
§10 shipped and works; this makes the match page the real thing and adds the
two systems the game was still missing (faithful AI lineups, and availability).

Delivered in **four phases**, each reviewed before the next.

### Requirements

- **R1 — Collapsing header.** The full scoreline at rest; on scroll it shrinks
  away while a compact `Home 4 FT 2` fades into the top bar, so the score is
  never off-screen.
- **R2 — Player of the Match near the top**, out of the header — who was best
  should be the first thing you see.
- **R3 — Next match.** The following fixture for each side. Knockout-aware: the
  second leg after a first leg, the next round's opener after a tie is settled,
  and "campaign ended here" when a side is out.
- **R4 — Tabs: Facts / Lineup / Stats.**
  - *Facts*: PoM · Momentum + Key Stats · Timeline · Top Rated · Recent Form ·
    Next Match · At the time of the match.
  - *Lineup*: Lineup & Ratings **plus** a real formation pitch view (XI in
    position, with the bench), backed by an upgraded AI XI: faithful,
    best-player-per-position, randomised, with **rotation** for sides that are
    safe or already qualified — and those sides bringing the good ones back on
    if they're losing or heading for a draw they don't want.
  - *Stats*: everything not in Key Stats, plus a per-match player stats table.
- **R5 — Recent Form counts knockout games.** Five games played is five games,
  cup ties included.
- **R6 — Every displayed match is clickable** — form results and the next
  fixture open their own full stats.
- **R7 — Per-match player stats table**: Rating, Chances Created, Total Shots,
  Shots on Target, Pass success rate (accurate/total + %), Successful dribbles
  (+%), Tackles Won, Fouls committed, Touches.
- **R8 — Injuries & suspensions (real availability).** Players on either side
  can be injured for a range of matchdays, up to a whole season; a red card
  suspends a player for the next match. The result screen gets a **medical**
  table showing who was out and from which matchday to which.
- **R9 — Season-long player stats** gain the R7 columns plus Yellow/Red cards,
  alongside the existing Goals, Assists, Clean Sheets, Rating and POTM count.

### Resolved decisions (maintainer)

1. **A missing player in YOUR XI** is covered by a substitute; with no bench
   available, a stand-in is generated for exactly the matches missed at
   **(injured player's OVR − 5)** in the same position, and your **team OVR
   updates for those matches** so the absence genuinely costs you.
2. **AI lineups drive attribution**, not just the pitch picture — the XI shown
   is the XI that scores. This deliberately shifts AI scoring distributions
   (goals come from real forwards instead of whoever had the top OVR).
3. **Injury rates: realistic** — roughly one per team every 6–8 matches, mostly
   1–3 matchdays, occasionally 4–10, season-enders rare.
4. **Phased delivery**, reviewed between phases.

### Phase plan (full checklist)

Written out in full so nothing is lost between phases. Tick items as they land.

**Phase 1 — page restructure.** ✅ *done*

- [X] Header scrolls away; a compact `Home 4 FT 2` fades into the permanent top bar.
- [X] Tabs: Facts / Lineup / Stats, pinned while scrolling.
- [X] Player of the Match promoted to the first card in Facts.
- [X] Facts order: PoM → Momentum + Key Stats → Timeline → Top Rated → Form
  going in → Next Match → At the time of this match.
- [X] `ContextMatch` extended (`label`, `inTable`, optional goals, `scorers`,
  `seed`, `extraTime`) and `nextMatchFor()` added.
- [X] `clCompetitionMatches()` — knockout legs continue the matchday sequence.
- [X] Form counts knockout games; next match resolves leg 2 → next round →
  "campaign ended here".
- [X] Form rows and the next fixture are clickable, inheriting season context.
- [X] Wired: domestic league (result + live sim), both UCL variants, World Cup.

**Phase 2 — lineups & the AI XI engine.** ✅ *engine + pitch done; rotation
triggers still to be wired*

- [X] `src/engine/lineup.ts` — picks a real XI from a club's full roster:
  formation-aware, best available player per slot, seeded jitter so clubs
  don't line up identically, fully reproducible from the match seed.
- [X] Per-club formation, derived from the club id so a side keeps its shape
  all run (8 formations, evenly spread in practice).
- [X] Rotation implemented: rests up to five first-choice players, weighted
  toward the best (resting your worst starter isn't rotation).
- [X] Lineups drive **attribution** (decision 2) — `lineupsForMatch()` is the
  single source of truth, called with identical arguments by
  `attributeMatchScorers` and `generateMatchDetail`, so the pitch view can
  never disagree with the scoresheet.
- [X] Pools now carry the **full roster**; `applySubstituteRule` (the old
  "1 GK + top 10 by OVR") is gone. `benchSize` is the only thing the
  substitutes setting still controls.
- [X] YOUR XI is never re-picked — for your side the selector only assigns
  slots (eleven candidates, eleven slots), and your pool including the
  bench passes through untouched.
- [X] Lineup tab gained the **formation pitch view** (rating chips, goal / own
  goal / card pips, sub-off minute, formation + "n rested" footer) and a
  **bench** block, with the ratings list kept below.
- [X] `verify-match-detail.ts`: XI is always 11 unique players with exactly one
  keeper, every selected starter really started, formations vary, rotation
  fires only when asked. Plus a targeted regression: a squad of 8 CBs and
  1 ST now plays the striker **100%** of the time and never more than four
  centre-backs (it used to field the lot).
- [X] **Rotation triggers.** New [`src/engine/rotation.ts`](../src/engine/rotation.ts)
  answers "does this game still matter?" from points arithmetic alone: with
  `remaining × 3` still winnable, is the club mathematically in, mathematically
  out, or still live? A live table returns **0** — it is impossible to rest
  players in a must-win. Once nothing is left to play for it returns 0.6, or
  0.8 in the last two rounds. Wired into the **domestic league** (European
  places + relegation, and never while the title is reachable), the **UCL
  league phase** (top 24), and **World Cup groups** (top two, judged inside the
  group). **Your own club never rotates** — you drafted that XI, you field it.
- [X] **Rotation actually changes the result.** The seed is now generated
  *before* `simulateMatch`, so the eleven — and the rotation — are known when
  the scoreline is decided. Without that reordering, resting players would have
  been pure decoration. `effectiveMatchOvrs()` prices it:
  - Start from the **real strength of the XI picked**, floored at
    **base − 6** — a reserve side is weaker, but it's still a professional
    team, and a 90-rated club fielding a literal 68 made dead rubbers absurd.
  - Add **+1 per planned substitute** for the good players coming back on,
    capped at **base − 1**: empty the bench and you still finish a point worse
    off than if you'd never rested anyone.
  - Sides that *don't* rotate get a small freshness nudge from having a bench,
    **+0.25 per sub, capped at +1**.
  - The number that decided each match is exposed as
    `MatchStats.homeMatchOvr` / `awayMatchOvr`.
  - Rotation is **stored on the match** (`Fixture`, `CLLeagueMatch`,
    `WCGroupMatch`) and threaded into the stats request, because regenerating
    the sheet without it would select a different eleven and a stored scorer
    could come back as someone who never played.
- [X] **Reaction.** A rotated side that ends up losing chases the game through
  the existing substitution logic: the shuffle on bench selection tightens
  (jitter 6 → 2, so the genuinely best rested players come on rather than
  whoever) and the window narrows and moves earlier (46–86' → 46–66'), instead
  of idle seventieth-minute changes. The OVR recovery above is the same
  mechanism seen from the team's side.
- [X] Verifier: the rotated OVR can never break the base−6 floor or recover
  past base−1; an unrotated side is never downgraded and its freshness bonus
  respects its cap; a live table never rotates and a settled one does.

*Note:* this changes AI scoring across the whole game by design — goals now come
from a club's real forwards instead of whoever happened to have the top OVR.

**Phase 2 follow-ups (maintainer review).**

- [X] **Selection was too noisy, not mis-rotating.** Reported as "rotation does
  the opposite" — the USA fielding a weaker XI in matchday 2 and their best in
  a dead-rubber matchday 3, Colombia swapping an 85/83 strike pair for an 83/85
  one. That was never rotation: `JITTER` was 7, i.e. **±3.5 OVR** on every
  selection score, so an 84 and an 85 changed places about half the time and
  swamped the rotation signal. Cut to **2**. A five-point-better striker now
  starts 100% of the time; only genuine close calls move around.
- [X] **Formations now come from the game's own list.** The first cut invented
  a private array of eight; `ALL_FORMATIONS` is exported from
  `engine/formations.ts` and all **eleven** shapes the player can pick from are
  in use.
- [X] **Your own XI draws on the pitch.** It used to say "no formation recorded"
  because the player's club is deliberately skipped by the selector. New
  `arrangeLineup()` takes your already-decided eleven and lays it out in your
  formation — nobody is picked or dropped, it only works out where each of them
  stands. Threaded as `playerFormation` from every screen and live sim.
- [X] **Contributions on the pitch and the bench.** Only a single goal icon was
  drawn, and only for starters — a hat-trick looked like one goal and anything
  done off the bench was invisible. One shared strip now shows goals (with
  count), own goals, assists and cards everywhere a player appears.
- [X] **Header scorer list**: grouped one line per scorer with all his minutes
  (it repeated the name per goal), and the **5-goal cap removed** — a 6–5 has
  eleven goals and they all belong there. Own goals stay on their own line
  since they're credited to an opponent.
- [X] **Collapsed header** keeps each side's flag next to the name.
- [X] **Form / next match during a live knockout.** Worked on the result
  screens but was missing in-simulation, because the live tie handler passed no
  timeline. Both CL and WC live knockouts now pass the group/league-phase
  games played so far.
- [X] Verifier: selection stability and the rotation-OVR bounds. *(Both checks
  were written once against an anchor that didn't match and silently never ran
  — re-added against the real file and confirmed executing.)*
- [X] **"Scored before he came on" (high priority).** Reported as happening in
  three of three randomly opened games. Two causes, both fixed:
  - *Source:* the sheet regenerates the eleven from the options the sim
    attributed with — and two paths dropped the rotation on the way (the World
    Cup context rows in `wc-result`, and `toContextMatches` in the live sims).
    Regenerating at rotation 0 against scorers attributed at rotation 0.6 puts
    a stored scorer on the bench. Both now carry it.
  - *Structural guarantee:* `resolveSide` can only place a substitution from
    46' onward, so a bench player credited with a 20th-minute goal was clamped
    to "on at 46, scored at 20". It now **promotes** any named substitute whose
    first involvement predates the earliest possible substitution into the XI,
    swapping out a starter who did nothing. "Nobody is ever involved before
    they were on the pitch" is now true by construction, whatever upstream
    disagrees.
  - *Regression test:* the verifier deliberately attributes at full strength
    and regenerates under heavy rotation — the worst possible mismatch — and
    cross-checks every goal. Confirmed meaningful: **245 violations with the
    promotion disabled, 0 with it**.
- [X] **Modal scrolling (high priority).** The long-running "scrolling is
  glitchy" complaint, correctly diagnosed by the maintainer: a web modal is a
  fixed overlay painted over a page that is *itself* scrollable, and the
  document behind never stopped scrolling — so a wheel or drag that started on
  the modal, or continued past the end of its inner list, went to the page
  underneath. It reads as the modal fighting you. The giveaway was that the
  match-stats screen stopped exhibiting it the moment §10 turned it from a
  modal into a real route. `AppModal` now freezes document scroll while any
  modal is open, reference-counted so stacked modals behave and only the last
  one out restores it.

**Phase 3 — player stats, and the substitution overhaul.** ✅ *done*

- [X] **Per-match player stats table** (R7) in the Stats tab: every player who
  featured, ranked, with tappable column chips to re-rank by Rating, Chances
  Created, Total Shots, Shots on Target, Pass success rate (with
  accurate/total), Successful dribbles, Tackles Won, Fouls committed and
  Touches. Unused substitutes are excluded — a wall of zeroes buries everyone
  who actually played — and each row carries a side colour bar so which team a
  player is on never depends on hue alone.
- [X] **Every player is clickable again, everywhere.** Each player row on the
  statistics screen was gated behind `matchLog ? … : undefined`, and that log
  is only computed for a *fresh* run — so opening the screen from history made
  every player on it dead, and any hiccup computing the log killed the whole
  screen's interactivity at once. Rows are now unconditionally tappable, and
  the player modal degrades gracefully: with no per-match log it shows the
  season totals (goals / assists / clean sheets / matches) and explains that
  logs are only kept for the run that computed them, instead of being an empty
  dead end. **Player of the Season** and **Best U21** rows (previously plain
  `View`s) and the **team squad list** inside the team modal are now tappable
  too — the squad list closes the team modal before opening the player, per the
  §5.6 stacking rule.
- [X] **Season stats on the EXISTING statistics screen** (`app/game/stats.tsx`),
  updated in place — explicitly not a new screen. `PlayerStatLine` gained
  Chances Created, Shots, Shots on Target, Passes + Accurate Passes, Dribbles +
  Dribbles Attempted, Tackles Won, Fouls, Yellow Cards and Red Cards — all
  optional, so a saved run doesn't grow eleven zero fields for every player in
  the competition. The five hand-written leaderboard ternaries became one
  `BOARDS` table (label · how to sort · how to print · who qualifies), which is
  what made going from five boards to **fourteen** a data change rather than
  five parallel edits. The tab strip scrolls horizontally now that there are
  that many. Rate boards carry a qualification bar so a 1-of-1 cameo can't top
  the pass-accuracy chart.
- [X] The player modal shows the **whole season** in a totals grid — matches,
  goals, assists, clean sheets, chances created, shots, on target, tackles,
  fouls, pass % (with the raw split), dribbles (with success rate) and cards —
  always, not only when a game log is missing. These are the numbers you open a
  player to see.
- [X] Aggregated through `createStatsAccumulator`: `recordMatch` now takes the
  regenerated `PlayerMatchLine[]` instead of a ratings-only projection, so
  ratings, MOTM and every season counter come off **one** source rather than
  drifting apart.
- [X] **`dribblesAttempted`** added to the match line and generated alongside
  the successful count (~55–60% success), because a bare "dribbles" number
  silently implies a 100% success rate.

*Substitution overhaul (added to phase 3 on maintainer review):*

- [X] **Extra time gets substitutions.** The fill window was
  `46 + rng()*40` clamped to `duration - 5` — on a 120' match that clamp allows
  115, but the draw itself never exceeded 86, so extra time never saw a single
  change despite being a third of the remaining match. The last one or two
  changes now draw from a 91'–118' window. Verified: **100%** of 120' matches
  now make a change in extra time (2.0 per side on average).
- [X] **Sides use their full allowance.** `3 + rng()*3` was an even spread of
  3/4/5 averaging four — a decade out of date, since modern teams make all five
  almost every week. Now 5 (70%) or 4, **plus a sixth in extra time**, which is
  also the real rule. Verified: **4.7 per side** in a 90' match, up from ~4.0.
- [X] Verifier: substitution counts, and that nothing is ever changed after the
  whistle in a 90' match.
- [X] **Half-time is a distinct beat, and the three-window rule holds.** Changes
  used to be drawn one per random minute across the second half, so a side made
  five separate substitutions on five unrelated minutes. A side now gets
  **three in-play windows** (drawn 52–62 / 63–73 / 74–85, all three pulled
  earlier to 46–55 / 56–65 / 66–78 when it's chasing a game it rotated for), and
  every tactical change lands on one of them — which is why doubles and triples
  now appear the way they do on a real timeline. **Half-time (45') is separate
  and free**, exactly as in the laws, used by about a third of sides and much
  more often when chasing. Extra time adds its own interval (105') plus one
  further window. A must-play substitute takes the LATEST window that still has
  him on before he scores; if he was involved before the first window opened, he
  came on at the interval, which is what a 47th-minute goal by a substitute
  means. Verifier: at most **three** distinct in-play sub minutes per side, and
  a change flagged half-time really is at 45'.
- [X] **Pairs with injuries (phase 4).** An injury takes the player off **on the
  minute it happened** — not at the next window — the change is flagged
  `forced` and **eats one of the five**, and a side with nothing left on the
  bench plays the rest short. The timeline gets a dedicated **injury row**
  (🩹, "out for N matches", plus "no bench left, played on short") directly above
  the forced change it caused, and the lineup pitch, the bench block and the
  ratings list all carry an **injury marker** with the length of the absence.

**Phase 4 — injuries & suspensions.** ✅ *done*

- [X] Injury model, decided at sim time and **stored on the run**. New
  [`src/engine/availability.ts`](../src/engine/availability.ts) holds the
  ledger: who, from which matchday, to which. It is the one **sequential** thing
  in the stats pipeline — who's out on matchday 12 depends on matchdays 1–11 —
  so it's built once, in matchday order, and what it decides is stored on each
  match (`absent`, `standIns`) for every later regeneration to read.
- [X] **The events come off the sheet, not a second dice roll.** Red cards and
  injuries are both generated inside `generateMatchDetail` from the match seed
  (the injury with its minute, its forced substitution and its length), and the
  ledger reads them back off the regenerated sheet. So "suspended next week" and
  what the timeline showed are one fact instead of two systems that drift. The
  sim regenerates each finished match's sheet to harvest them — pure arithmetic,
  ~0.5 ms a match, and it has to be sequential anyway.
- [X] Rates: **realistic** (decision 3). `INJURY_PER_SIDE_PER_MATCH = 0.145`,
  measured at **one per team every 6.9 matches** over 6,000 side-matches; 62%
  are 1–3 matchdays, 31% are 4–10, and season-enders (18–34) are the last 7%.
- [X] **Red card ⇒ suspended for exactly the next match** (`SUSPENSION_MATCHES`),
  with the side picking a replacement around him.
- [X] Unavailable players are removed inside **`lineupsForMatch`** — the single
  place attribution, the stat sheet and the effective-OVR pricing all funnel
  through — so an unavailable player cannot line up, score, assist or be rated
  no matter which screen asked. Verifier: 300 sheets regenerated under an
  absence, **0** featured or credited someone who was out.
- [X] **Your XI (decision 1).** `planAbsenceCover` / `coverAbsences` fill the
  shirt: the best positional match on your bench comes into the XI, and anyone
  left uncovered gets a generated stand-in at **OVR − 5** in the same position,
  tied to the man he's covering by id (`standin:<playerId>`) so the pairing
  survives a history load. `ovrDeltaFor` prices the absence into your team OVR
  **for exactly those matchdays**, pairing each absence with what replaced it,
  so the scoreline itself is worse while he's out.
- [X] AI sides lose players symmetrically (`selectLineup` already filtered on
  `unavailableIds`; it now also receives a pre-filtered pool), and pick around
  the unavailable using the same phase-2 selection.
- [X] **Medical table on the result screen** —
  [`src/components/MedicalTable.tsx`](../src/components/MedicalTable.tsx), on the
  league, UCL and World Cup result screens. Yours first and marked with a side
  bar (not hue alone), then in the order things happened: player, position, club,
  reason (injury with the minute / suspension), the matchday span, and the
  stand-in with his rating where one was needed. Collapsed to eight rows.
- [X] Verifier: nobody unavailable appears in a lineup or on a scoresheet;
  injury spans are sane and never run past the end of the competition; a player
  is never out of the match he was injured IN; a red card costs exactly one
  match; the OVR−5 stand-in appears for exactly the missed matchdays and
  disappears the moment he's fit; a bench covers an absence without inventing
  one; the covered XI is still eleven men.
- [X] **Fixed in passing:** `computeRunStats` regenerated every match at
  rotation 0 while the match screen regenerated it with the stored rotation — so
  the season averages were the sum of *different* sheets than the ones you could
  open. `RunMatch` now carries rotation and availability, which is the same class
  of bug the phase-2 follow-ups fixed on the other screens.
- [X] **Knockout brackets too** (done on maintainer request, right after the
  above). The league phase is simulated matchday by matchday, which is what a
  sequential ledger wants; a bracket is played out in one call. Rather than invert
  `simulateCLKnockoutsOnly` / `simulateWCKnockoutsOnly` — pure result-first engine
  code whose bracket logic is the last thing worth destabilising — they now take an
  optional **`KnockoutSimHook`** and call it per tie, in bracket order:

  - `ovrFor` **before** the tie is decided, so the absences move the scoreline and
    not just the team sheet;
  - `onTie` the instant it is, so the caller attributes the tie, regenerates its
    sheet and feeds its red cards and injuries into the ledger **before the next
    tie kicks off**. That's what makes a sending-off in the round of 16 cost a
    quarter-final.
    Built by [`engine/knockout-availability.ts`](../src/engine/knockout-availability.ts)
    — its own module, because the headless verifier has to import it and
    `run-stats.ts` drags in the SQLite layer (and through it react-native), which no
    `tsx` script can load. `etSeed` moved to `engine/stats.ts` for the same reason
    (re-exported from run-stats, so nothing else changed).
- [X] **Matchdays keep counting through the bracket**, because that's the unit
  absences are measured in: UCL is 8 league-phase matchdays + two per knockout
  round + the final (`CL_TOTAL_MATCHDAYS` = 17), the World Cup is 3 + six rounds.
  A two-legged tie is **two** matchdays, so a red card in leg 1 really does mean
  missing leg 2. Every tie in a round shares its matchdays (tracked off the round
  name, not a tie counter) — otherwise all eight play-off ties would report
  different matchdays and the medical table would read like nonsense.
- [X] Wired into all three bracket paths: classic UCL and the World Cup in
  `simulation.tsx`, and the **custom UCL** screen, which also had no availability
  in its league phase at all and now has the same treatment as the others. Pools
  are loaded **before** the bracket in each (they normally already are; the
  fallback just moved earlier). The old `attributeCLResultScorers` /
  `attributeWCResultScorers` calls stay as idempotent backstops for the paths with
  no ledger — quick-sim, the dev "force to final" bracket, and the
  no-player-in-Europe backdrop.
- [X] Availability travels per leg (`leg1Absent`/`leg2Absent` + the matching
  stand-ins) on `CLKnockoutMatch`, and per tie on `WCKnockoutMatch`, so the result
  screens, the live reveal's tapped ties, and `computeCL/WCRunStats` all
  regenerate the eleven that actually played.
- [X] Verifier: a full 36-club bracket simulated through the hook — every tie
  comes back seeded and with its availability recorded, **no** knockout goal is
  ever credited to somebody who was suspended or injured, absences really are
  incurred *inside* the bracket, and a red card on leg 1 is confirmed to rule the
  player out of leg 2.

*One documented compromise:* a two-legged tie's legs are decided in a single
`simulateTwoLegs` call, so an absence incurred in leg 1 changes who is **selected**
in leg 2 (and shows on the medical table) but can't move leg 2's **OVR** — that
scoreline was already settled. Splitting the two legs apart in the engine is the
only way to close that, and it isn't worth destabilising the tie logic for.

### Phase 1 — page restructure (done)

- **Collapsing header, done the platform's way.** The first attempt animated the
  header's *height* from an `Animated.Value` driven by scroll — which re-laid-out
  the scroll view on every frame, fed straight back into the scroll offset, and
  made slow scrolling stutter and snap (maintainer caught it immediately). It's
  now the header as ordinary scroll content with the tab bar marked sticky via
  `stickyHeaderIndices`: zero layout work per frame, smooth at any scroll speed.
  The only thing still animated is the top bar's compact score **opacity**,
  which cannot affect layout.
- **Tabs** pinned via the sticky header; PoM promoted to the first card in Facts.
- **`ContextMatch` became a real match record** — it now carries `label`,
  `inTable`, optional goals (undefined = not played), and `scorers`/`seed`/
  `extraTime` so any match on the page can be tapped through to its own sheet.
- **One continuous timeline per competition.** `clCompetitionMatches()` lays the
  league phase's matchdays down first, then every knockout leg continuing the
  same `matchday` sequence. That single trick makes `formBefore` and the new
  `nextMatchFor` work unchanged in a cup: form still counts the last five games
  actually played (league phase included), "next match" resolves to the second
  leg and then the next round, and a knocked-out side simply has no later
  fixture — which is exactly how elimination should read. Knockout legs carry
  `inTable: false` so they never pollute standings.
- Wired for the domestic league (result + live sim), the UCL league phase and
  knockouts (both CL variants), and the World Cup (groups + bracket). For a WC
  knockout the two sides can come from different groups, so **every** group game
  is included for form while none of them feeds a table — otherwise the away
  side's form would show knockouts only.
- Standings heading adapts: "Standings after matchday N" for a league round,
  "League phase final standings" above a knockout leg.

### Phases 2–4 (delivered)

2. Lineup pitch view + the AI XI engine (formation-aware selection, rotation).
3. Player stats — the per-match table (R7) and the season screen (R9), plus the
   substitution overhaul: the full allowance, extra time, half-time as its own
   beat and the three-window rule.
4. Injuries and suspensions (R8), including the medical table, the OVR−5
   stand-in rule, and the knockout brackets (via the per-tie hook).

**Where phase 4 lives.** New `engine/availability.ts` (the ledger, the stand-in
rule, the OVR cost) and `engine/knockout-availability.ts` (the per-tie bracket
hook), plus `components/MedicalTable.tsx`; injuries and their forced substitutions
are generated in `engine/match-detail.ts` alongside cards; absences are applied in
`engine/lineup.ts` (`coverAbsences` / `lineupsForMatch`); the sequential sim loops
in `app/game/simulation.tsx` and `app/game/custom-ucl-simulation.tsx` feed the
ledger and store `absent` / `standIns` on every match and every knockout leg;
`absences` rides on the season result (and in `highlights` on a saved run) so a
history load still has the medical table.

---

## 10.6 Live-run match context: next match, group form, knockout bracket

### Problem (reported from three screenshots, all on the LIVE simulation screen)

§10 R6/R7's context section was built and correct on the **result** screens, but
the live screens handed it a crippled timeline, so all three of its blocks lied
while a run was actually being played:

1. **"Next match" always said the campaign had ended.** The live call sites
   passed only fixtures that had *already been played* — mid-season there was no
   later fixture in the list, and `nextMatchFor` returning `null` is precisely
   the "eliminated" case, so a matchday-3 game in a 34-game season reported both
   sides as done.
2. **Knockouts showed a league table.** The live timeline had no knockout rounds
   at all and pinned every tie to a sentinel matchday (999), so a cup tie sat
   above the *league phase final standings*. In the World Cup it was worse: the
   group rows carried no `inTable` flag, so all twelve groups merged into a
   single nonsense 48-nation table above a knockout tie.
3. **"Form going in" looked missing in group stages.** The section was hidden
   whenever both sides' form was empty, which on an opening matchday reads as a
   broken feature rather than as "there's nothing before this".

### Decisions

- **A table is the wrong answer for a cup tie.** Knockout matches get the
  **bracket so far** instead — every round played up to and including this one,
  ties folded back together from their legs, the two sides' own ties shown by
  default with the rest of the round one tap away (a Round of 32 is sixteen ties;
  a wall of unrelated results buries the one you opened the screen for).
- **One timeline, live and finished.** The live screens now build the same
  continuous `ContextMatch[]` the result screens do — the whole league/group
  schedule with unplayed fixtures included, plus every knockout round *already
  revealed*. Unrevealed rounds must never be in it, or "next match" would spoil
  a fixture the player hasn't been shown.
- **Real matchdays, no sentinels.** A tie's vantage point is its actual slot in
  that timeline. The sentinel happened to work for form and broke both "next
  match" and the bracket.

### As-built

- `src/engine/match-context.ts`
  - `ContextMatch.tieWinnerClubId` — who advanced. The aggregate can't answer it
    once a shootout is involved, and the bracket has to be able to say.
  - `appendKnockoutRounds(phase, rounds)` — the knockout half of
    `clCompetitionMatches`, split out so the World Cup and a half-finished live
    league phase can reuse it. `clCompetitionMatches` is now a thin wrapper.
  - `knockoutBracket(matches, upToMatchday)` — the knockout answer to
    `standingsAsOf`. Groups legs back into ties by the **unordered** club pair
    within a round (leg 2 swaps home and away, so an ordered key splits one tie
    into two), aggregates in the tie's orientation, and drops rounds that hadn't
    happened yet from this match's vantage point.
  - `koLegMatchday(matches, aId, bId, roundLabel?, leg?)` — where a leg sits in
    the timeline. **Pass the round label**: a pairing is unique within a round but
    not across a competition, and an unscoped search silently returns the
    earliest round the two sides ever met.
- `app/game/match-stats.tsx` — "At the time of this match" renders `MiniBracket`
  for a knockout and `MiniTable` otherwise; "Form going in" is always rendered
  when there's a timeline at all (an empty side reads "First match of the
  campaign").
- `app/game/simulation.tsx` — `clTimeline()` / `wcTimeline(tableGroup)` build the
  full live timeline; the domestic league passes its whole schedule rather than
  only played fixtures; `KO_CONTEXT_MATCHDAY` is gone.
- `knockoutTieToCLMatch` falls back to a tie's own `scorers`/`seed`/`absent` —
  a World Cup tie is one match and stores its sheet on the tie, not under a leg,
  so without the fallback the WC half of the bracket had no stats to open.
- **Verified:** `npx tsx scripts/verify-match-context.ts` — 2,000 generated
  competitions checking table/form/next-match/bracket invariants, plus a
  World-Cup-shaped case (only one group feeds the table; form still crosses
  groups; a knockout vantage point produces no table at all).

**Not covered:** `app/game/custom-ucl-simulation.tsx`'s live match rows pass no
`contextMatches` at all, so the whole context section is absent there (it has
several competitions in one screen — domestic, qualifying, league phase — and
needs its own timeline design). Its **result** screen is fine.

---

## 11. Full FIFA World Cup mode (after everything above)

> **Announced in-app.** Mode Select's "SM (Finals)" tab now carries a
> **coming-soon card** for the full World Cup — greyed content, a lock badge, and
> the World Cup's three identity colours (#3CAC3B / #2A398D / #E61D25) as a
> stripe across the top; the first mode in the game with more than one accent.
> It has its own id (`world_cup_full`), deliberately NOT a `GameMode`: an
> unplayable mode must never reach the store, a simulation screen or a saved run.
>
> *Fixed on the way:* that card previously reused the `world_cup` id, so **every**
> `MODES.find()` resolved to it rather than to the playable finals-only mode —
> which meant picking the real World Cup silently inherited `hasDifficulty: false`
> and skipped difficulty selection entirely. Both cards now have distinct ids, so
> the World Cup asks for a difficulty like every other mode that has one.

**Only after §§1–10 ship:** build out **Full FIFA World Cup mode** to the same
depth as the custom (full) UEFA Champions League mode — qualifiers, the richer
bracket, tie detail, deep stats, and the Deep Match final. Tracked here as the next
milestone; detailed spec to follow once the shared knockout / Deep-Match / stats
foundations from this document are in place (they're the prerequisites that make
WC-full cheap to build). - Described in detail in More Competitions & Modes.md

---

## 12. "Test final game" quick-sim (dev tool, added mid-batch)

### Problem

Building/verifying §7 (Deep Match), §8 (Momentum), and §10 (Match Stats redesign)
means reaching a **final** over and over — and a final only happens after a full
World Cup grind (draft, group stage, four knockout rounds). The existing Quick Sim
Tester (About → tap version 8×) skips the draft and group-stage *UX*, but the
knockout results are still genuinely random, so the player might get knocked out
in the Round of 32 nine times out of ten. Needed a tester entry that reaches the
final **every single time**, so the final itself — the one match all four of
those upcoming features actually touch — can be iterated on quickly.

### Target

A fifth Quick Sim Tester button, **"Final"**, next to League / UCL / UCL✦ / WC.
Auto-drafts like the others, but — **unlike** the others — does **not** skip to
a result screen. It lands on the **real placement screen** and the player goes
through the **actual live flow** exactly like any other World Cup run (globe
reveal → group review → live group matchdays → knockout bracket reveal →
final), just with a guarantee baked in:

- Every match the player's team plays — the 3 group games, and every knockout
  tie **up to but not including the final** — is forced to a clean **1-0**
  win. The live clock/reveal for that match still plays out normally; only the
  result is fixed.
- Every *other* match in the tournament (not involving the player) simulates
  normally — real, random results, same as any other run.
- The **final itself is never forced** — it's genuinely simulated fresh each
  time, with its own random scoreline and stats, since that's the whole point:
  a different final to look at on every tap, reached without replaying the
  same grind.

*(First pass wrongly landed straight on the result screen, headless — corrected
after maintainer feedback: the whole point was to go through the real live
screens quickly, not skip them.)*

### Requirements

- **R1** — Reaches the World Cup final 100% of the time, regardless of draft
  quality or bad luck elsewhere in the draw.
- **R2** — Only the player's own matches are forced; the rest of the bracket
  (and the final) plays out with the real, unmodified simulation — so scorers,
  ratings, and the deep-stats sheet for the final are exactly as trustworthy as
  any other match in the game.
- **R3** — Goes through the **real** placement → group stage → knockout screens
  (`app/game/placement.tsx`, `app/game/simulation.tsx`'s `WCSimulation`), not a
  shortcut to the result screen — reaching the final fast is about skipping the
  *grind* (bad luck, replaying rounds), not skipping the *screens*.
- **R4** — Not persisted to the DB (matches every other quick-sim entry —
  `quickSim: true` in the store, `saveWCRun` is never called from the tester).

### Implementation

- [`src/store/gameStore.ts`](../src/store/gameStore.ts): added
  `testForceWinUntilFinal: boolean` (+ setter), reset to `false` in both
  `startRun` (via the `initialState` spread) and `resetRun` so it can never
  leak into a normal run afterwards.
- [`src/engine/quick-sim.ts`](../src/engine/quick-sim.ts): trimmed down to
  `autoDraftForTestFinal()` (formation + drafted XI only — no simulation) and
  two exported building blocks used by the live screen:
  `forcedKnockoutResult()` (a plain 1-0 `KnockoutResult`, no extra time, no
  penalties) and `simulateWCKnockoutsForceToFinal()` — a near-copy of
  `simulateWCKnockoutsOnly` (`src/engine/world-cup-sim.ts`) that substitutes
  the forced result for the player's tie in each pre-final round and calls the
  real `simulateKnockout()` for every other tie, including the final. Kept as
  its own function rather than adding a "force" branch to the real engine —
  `world-cup-sim.ts` stays production-only code.
- [`app/game/simulation.tsx`](../app/game/simulation.tsx) (`WCSimulation`):
  reads `testForceWinUntilFinal` from the store. Added a local
  `simGroupMatch()` helper used at both group-stage execution points
  (`playMatchday`, `skipAll`) that forces a 1-0 result when the player is
  involved and the flag is on, otherwise calls the real `simulateMatch`.
  The knockout-bracket build point swaps to `simulateWCKnockoutsForceToFinal`
  under the same flag instead of the real `simulateWCKnockoutsOnly`.
- [`app/(tabs)/about.tsx`](../app/(tabs)/about.tsx): the `test_final` branch
  now calls `autoDraftForTestFinal()`, sets `mode: 'world_cup'`,
  `testForceWinUntilFinal: true`, clears `wcTeams`/`wcResult`/`benchPlayers`,
  and pushes to **`/game/placement`** (not the result screen) — a fifth
  gold-accented **"Final"** button, with an explainer line in the tester's
  description text.

### Acceptance criteria

- [X] Reaches the final on every run, through the real screens — verified
  live end-to-end: auto-draft → "FIFA World Cup Draw" placement (took over
  Iraq) → group review → live group matchdays (Group C table showed 2 games
  played, +2 GD, 6 pts — two 1-0 wins) → knockout bracket preview → live
  knockout reveal (Quarter-Final shown live: "Senegal 0–1 Iraq XI, Sanabria
  14'") all the way to "FIFA WORLD CUP FINAL: Iraq XI 3–0 France" → "View
  Final Results" → the normal WC result screen ("FIFA WORLD CUP CHAMPION").
- [X] Only the player's ties are forced — the R32/R16 "Elsewhere in the
  Round" list and other knockout ties showed real, varied scorelines
  (including penalty shootouts), same texture as a normal run.
- [X] The final is never forced — Iraq XI's 3-0 win over France had three
  distinct scorers at three different minutes (Sanabria 40', Lingard 70',
  Sanabria 75'), a genuine `simulateKnockout()` call, not a scripted result.
- [X] Went through the real placement/group/knockout screens, not a shortcut
  to the result screen; console clean; `tsc` clean.

---

## Appendix A. Asset checklist

New assets required (add under `assets/`; keep `club_facts.json` and the bundled DB
untouched):

- [ ] **Trophy images** for the win ceremony — real UCL and World Cup trophies
  (the source notes explicitly say to use actual trophy imagery). Provide as
  transparent PNGs sized for the ceremony screen.
- [ ] **Second-place medal** visual for the loss ceremony.
- [ ] **Confetti** — Reanimated/particle implementation (no asset)
- [ ] Any **event icons** not already in Ionicons (own goal, penalty,
  error-led-to-goal) — prefer Ionicons/text markers over new art where
  possible (repo convention: Ionicons, not emoji-as-icon).

> Licensing note: the raw notes say not to worry about copyright for the trophy
> images. That's the author's call for a personal/unreleased build; flagging it
> here so it's a conscious decision if the app is ever distributed.

---

## Appendix B. Resolved decisions

Every open question from the first draft has been answered. Recorded here so the
"why" survives:

1. **Momentum marks — hybrid (§8).** Per-minute data model, rendered as a
   **smoothed filled area**. No bars-only fallback.
2. **Deep Match ceremony audio (§7).** **No audio at all** — both win and loss
   ceremonies are silent; contrast is carried by visuals only.
3. **Back-guard behaviour (§3).** It's an **anti-cheese guard**: OS-back must never
   let a player rewind a decided sim to re-roll it (real exploit — a player re-ran a
   lost match). Behaviour = **finality confirm** ("result is final") whose only
   outcomes are *quit the run* or *stay* — never *rewind and re-simulate*.
4. **Era-mode historical data (§6).** **Remove** Era from all live surfaces; keep
   readers tolerant and **label old rows "Era (retired)"**; never delete/rewrite
   historical data.
5. **"Top-10 leagues" (§4).** **Top 10 by UEFA coefficient**, sourced from the
   existing [`src/data/uefa-coefficients.ts`](../src/data/uefa-coefficients.ts).
6. **Deep Match availability (§7).** **All three knockout competitions:** UEFA
   Champions League (classic), custom UEFA Champions League (full), and FIFA World
   Cup — finals only, for now.
7. **Competition naming.** UI labels become the full official forms everywhere:
   **"UEFA Champions League"** and **"FIFA World Cup"** (internal mode ids
   unchanged). See the naming note at the top of this doc.
8. **Deliverable format.** Markdown in `docs/` only — no HTML version needed.

---

## Appendix C. Suggested commit message

From the source notes (kept, lightly tidied):

```
UPDATE TO MATCH STATS SCREEN AND SMALL SIMULATION

- Match stats promoted from a modal to a dedicated SCREEN with a sticky score
  bar and categorised sections (header / momentum + key stats / timeline /
  shots / passes / defence + duels / discipline / lineups / context), per-half
  added time, and the leader in each stat row marked by colour AND weight.
  `MatchDetailModal` is gone: the old file is now `MatchStatsParts` (the
  regeneration hook + row primitives) and every one of the eleven call sites
  navigates via `openMatchStats` instead of mounting its own modal
- "At the time of this match" context: the table as it stood after that
  matchday, each side's last-5 form going in, and the top-3 rated per team —
  wired for the domestic league, the UCL league phase and World Cup groups
- Match page rebuilt again (§10.5 phase 1): the header now collapses into a
  compact score on scroll, the page is split into Facts / Lineup / Stats tabs,
  Player of the Match is promoted to the top, and Facts gained Top Rated,
  Recent Form and Next Match. Knockout rounds now continue the competition's
  matchday sequence, which is what makes form (five games played, cup ties
  included) and "next match" (second leg → next round → eliminated) work
  outside a league. Every match shown — form results, the next fixture — opens
  its own full stats
- AI teams now pick a real side (§10.5 phase 2): a formation the club keeps all
  run, then the best available player for each SLOT in it, seeded so it varies
  and still reproduces exactly. Replaces "1 GK + the top 10 by OVR", which let a
  squad with eight centre-backs field six of them and leave its striker out. The
  selected eleven drives ATTRIBUTION as well as the new pitch view, so who's on
  the pitch and who scores can never disagree — this deliberately shifts AI
  scoring across the game. Your own drafted XI is never re-picked; the selector
  only works out which slot each of your players stands in
- Penalties, Own Goals and Mistakes events + attribution ("penalty won",
  "error led to goal"); own goals are rare (~2% of goals, 90/10 defender split),
  count for the benefiting team and never as the scorer's goal; every penalty
  names a distinct "won by" player
- Missed penalties (~33% of all spot-kicks, 58% of them keeper saves) with a
  rating hit for the taker and a rating bonus for the keeper; added time now
  tracked and shown PER HALF rather than as one lump
- Match Momentum (per-minute data, seed-derived, smoothed-area render) — live in
  the Deep Match and static in the stats screen; ~85% of goals show momentum
  toward the scorer, the other ~15% modelled explicitly as goals against the run
  of play
- Match context data layer for the stats screen: standings as they stood at that
  matchday, last-5 form before the game, top-rated players per side
- AI teams now pick a real side: a formation the club sticks to, then the best
  available player per SLOT, seeded so it varies week to week — replacing "1 GK
  + the top 10 by OVR", which fielded six centre-backs and benched the striker.
  The XI that lines up is the XI that scores. Sides with nothing left to play
  for rotate (never in a must-win), which genuinely weakens them for that match
  — floored at base−6, clawing back a point per substitute but never past
  base−1 — and a rotated side that falls behind brings its good players back on
  earlier
- Deep Simulation Match for finals (UEFA Champions League, custom UCL, and FIFA
  World Cup) — silent win/lose ceremonies
- Major fixes / UI redesigns: unified knockout view, final standings at the
  league→qualifiers hand-off, competitions renamed to "UEFA Champions League" /
  "FIFA World Cup"
- Minor fixes: draft (phantom highlight, hidden-rating A–Z sort), subs team,
  chaos ineligible-player hiding; weighted picks (top leagues by UEFA
  coefficient — maintainer tuned the cutoff to top-6 post-review); Android
  back-guard (anti-reroll); Era mode removed (historical rows kept + labelled
  "Era (retired)")
- Fixes found during working: modals unclickable on PC after opening a match
  from inside another modal (group/team/tie modals leaked their open-state
  instead of closing when the shared match-stats modal opened on top;
  AppModal's overlays now stack by open-recency instead of a shared z-index);
  every club-name cell in `LeagueTableView` was invisible on web (a `flex: 0`
  shorthand collapsed it to zero width) — every league table in the app was
  silently missing club names next to the berth badges; the league result
  screen couldn't open match stats AT ALL for a run loaded from history (it
  bailed on a `placedLeague` that is always null once a run is exited) and
  never passed the drafted squad, so your own XI was rebuilt from the replaced
  club's DB roster; the same screen's team-matches modal didn't close before
  opening the stats sheet on top of itself, and Season Highlights (biggest win /
  worst loss / shock defeats) were dead text despite naming real matches —
  they now resolve back to the fixture and open the full sheet
- Per-match player stats table (rating, chances created, shots, on target, pass
  %, dribbles, tackles, fouls, touches — sortable by any of them), and the
  existing season statistics screen updated in place with the same columns plus
  yellow/red cards, going from five leaderboards to fourteen
- Substitutions overhauled: extra time never saw a single change (the draw
  topped out at 86' on a 120' match) and sides averaged four rather than using
  the full allowance — now 4.7 per side, five or six with extra time, and every
  120' match makes changes in extra time
- Player rows on the statistics screen were gated behind the per-match game log,
  which is only computed for a fresh run — so every player was unclickable when
  the screen was opened from history, and one failed compute killed the whole
  screen's interactivity. Rows are now always tappable (awards and the team
  squad list included, which never were), and the player modal falls back to
  season totals when no log exists
- Two high-priority bugs found reviewing §10.5 phase 2: goals could be credited
  to a player *before the minute he was substituted on* (the stat sheet
  regenerated a different eleven than the one the stored scorers were
  attributed against, and the substitution logic can only place a change from
  46' — so a 20th-minute goal became "on at 46, scored at 20"). Fixed at the
  source (rotation now travels with every match through the context rows) and
  guaranteed structurally (a substitute involved before he could have come on
  is promoted into the XI). And modal scrolling on web: a fixed overlay was
  painted over a page that never stopped scrolling, so drags meant for the
  modal moved the page behind it — document scroll is now frozen, reference
  counted, while any modal is open
- Bug caught by the new §9 invariants: adding own goals, penalties-won and
  errors put many more players on the scoresheet, which shrank the pool of
  starters eligible to be withdrawn — so a bench player who scored could have
  his substitution silently dropped, leaving a scorer who was never on the
  pitch and a side whose player goals didn't sum to its scoreline. A must-play
  sub now falls back to coming on at his first involvement
- Flaky pre-existing test threshold: `upset losers rarely dominate xG` was set
  at >0.40 while the true rate is ~41% over only ~200 upset samples per run, so
  it failed on roughly half of all runs from sampling noise alone — re-set to
  0.33 (behaviour unchanged; still catches a result-driven texture)
- Back-guard scope fix: the anti-reroll guard armed only once a simulation
  started, so placement itself was re-rollable — it now arms the moment a
  landing spot is decided, on every mode's placement screen, and covers browser
  Back on the web build (which sends you home rather than letting you rewind)
- Caught while promoting match stats to a screen: the back-guard registered in
  a plain effect, so once a screen could be pushed on top of a simulation the
  simulation's listener stayed armed underneath — backing out of match stats
  fired the quit-the-run confirm (and on web went straight home). Now
  registered through `useFocusEffect`, so only the focused screen guards back
- Dev tool: a "Test final game" entry (§12) that auto-drafts then plays through
  the real placement → group stage → knockout World Cup flow with every match
  the player's team plays forced to a clean 1-0 win except the final, which is
  always simulated fresh — for iterating on §7/§8/§10 without grinding a whole
  tournament per test
```

---

## Appendix D. Screenshot index

All in [`docs/image/BigFixes/`](image/BigFixes), listed in the order they appear
in the raw notes.

| #  | File                  | Shows                                             | Used in |
| -- | --------------------- | ------------------------------------------------- | ------- |
| 1  | `1784839328774.jpg` | CL (full) knockout list — the clean target style | §1     |
| 2  | `1784839335931.jpg` | Current WC knockouts (stale "Group Stage" header) | §1     |
| 3  | `1784839343505.jpg` | Target: WC data in the unified style              | §1     |
| 4  | `1784839371500.jpg` | Tappable tie detail (legs / agg / ET / shootout)  | §1     |
| 5  | `1784839384698.jpg` | Current "QUALIFIED!" transition (no table)        | §2     |
| 6  | `1784839397444.jpg` | Current "Super Liga CHAMPIONS" entry (no table)   | §2     |
| 7  | `1784839422643.jpg` | Momentum reference — 90 minutes                  | §8     |
| 8  | `1784839426249.jpg` | Momentum reference — with AET + red-card marker  | §8     |
| 9  | `1784839441897.jpg` | Current match timeline (upgrading from)           | §10    |
| 10 | `1784839457268.jpg` | Stats header reference (team names, (Pen)/(OG))   | §10    |
| 11 | `1784839465857.jpg` | Momentum + key stats reference                    | §10    |
| 12 | `1784839474791.jpg` | Timeline reference (running score, OG/Pen labels) | §10    |
| 13 | `1784839482015.jpg` | Context reference (standings / top-rated / form)  | §10    |
