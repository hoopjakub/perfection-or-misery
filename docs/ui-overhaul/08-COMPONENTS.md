# 08 · Components

> Part of the UI overhaul set. Start at [`00-README.md`](00-README.md). Visual rules: [`05-STYLE-GUIDE.md`](05-STYLE-GUIDE.md). Motion: [`06-MOTION.md`](06-MOTION.md). Where each is used: the `07` screen documents.

This is a component-centric inventory, organised the way the build will be: global components first, then the pieces that belong to one area.

Each global component carries **two state lists**:

- **All possible states** — the complete specification, so nobody invents a state later.
- **States in use** — only the states a screen in the `07` documents actually needs, with where. Build these. Anything in the first list and not the second is documented but not implemented until a screen asks for it.

---

## 1. What exists today, and what happens to it

| Today | File | Fate | Becomes |
|---|---|---|---|
| `PressCard` | `ui.tsx` | **Keep the behaviour, restyle** | The press behaviour inside Plate, Label and ListRow (travels into its offset; web hover steps the tone) |
| `BackButton` | `ui.tsx` | Restyle | BackControl |
| `StepSlider` | `ui.tsx` | Restyle, enlarge | StepControl (48dp steppers) |
| `DifficultyBadge` | `ui.tsx` | Replace | Tag (difficulty variant) |
| `AppModal` | `AppModal.tsx` | **Delete for content** | Routes; ConfirmScreen for decisions |
| `BracketPreview` | `BracketPreview.tsx` | Keep the gestures, restyle | Bracket (preview mode) |
| `KnockoutRoundsView`, `KnockoutTieRow` | `KnockoutRoundsView.tsx` | Merge | Bracket, TieRow |
| `Ceremony` | `Ceremony.tsx` | Keep the structure, redraw | VerdictStitch, Trophy, Medal, TagRain |
| `CustomUclViewers` (three modals) | `CustomUclViewers.tsx` | Delete the modals, keep the content | LeagueIndex route, League route, Tie route |
| `WCGroupModal` | `WCGroupModal.tsx` | Delete the modal | Group route |
| `InfoBubble`, `RulesModal` | `InfoBubble.tsx` | Replace | ContextHelpTag opening the Guide at a section |
| `FixtureList` | `FixtureList.tsx` | Restyle | FixtureRow list |
| `GlobeReveal`, `SpinningGlobe` | `GlobeReveal.tsx` | **Keep**, re-colour | Globe (the best authored piece in the app) |
| `LineupPitch` | `LineupPitch.tsx` | Merge | PitchHangers |
| `MatchLineupPitch`, `MatchBench` | `MatchLineupPitch.tsx` | Merge | KitWall, BenchRail |
| `LiveMatch` | `LiveMatch.tsx` | Keep the clock logic, restyle | MatchCard (live) |
| `PenShootout` | `PenShootout.tsx` | Restyle | PenaltyTagRow |
| `MatchStatsParts` (`StatBar`, `StatSideHeader`, `ScorerList`, `Timeline`, `PlayerRow`) | `MatchStatsParts.tsx` | Keep the data logic, restyle | MirroredStatBar, SideHeader, ScorerLines, Timeline, PlayerRow |
| `MomentumGraph` | `MomentumGraph.tsx` | Keep the data model, redraw | MomentumStrip |
| `MedicalTable` | `MedicalTable.tsx` | Restyle | MedicalTable |
| `QualifyingLadder` | `QualifyingLadder.tsx` | Rebuild as a track | QualifyingTrack |
| `SquadSummary` | `SquadSummary.tsx` | Merge | PitchHangers with season numbers (SQUAD tab) |
| `TeamLabel` | `TeamLabel.tsx` | Replace | ClubTag (code on colour tape) / RoundFlag for nations |
| Local `formatTier` ×2 | `leaderboard.tsx`, `runs.tsx` | **Delete** | Shared tier labels in `src/data/tiers.ts` |
| Local `MEDALS`, `YOUR_TINT`, loss `#DC2626` | several | Delete | Tokens |

---

## 2. Global components

### 2.1 Plate (buttons)

A riveted rectangle. The one control that commits to an action.

**Anatomy** · rivets · label (`button` type, caps) · optional trailing icon · 2px ink offset (primary only).

**Variants**

| Variant | Look | Use |
|---|---|---|
| Primary | Orange fill, ink text, offset | The one action per screen |
| Secondary | Ink outline, no fill | The alternative next to a primary |
| Quiet | Text only, caps, underline on press | Tertiary actions in a row |
| Destructive | Ink fill, cotton text, striped left edge | Delete account, discard picks |

**All possible states** · default · pressed · focused (keyboard) · hovered (web) · disabled with the missing step named · loading (tag-shaped progress bar inside the plate) · hold-in-progress (destructive only) · success flash.

**States in use**

| State | Where |
|---|---|
| default, pressed, focused, hovered | Everywhere |
| disabled with named step | B1 mode Continue, A3 sign-up, B4 before the XI is full |
| loading | A3 submitting, D1 saving (as SaveTag instead where possible) |
| hold-in-progress | A4 delete account |
| success flash | *Not in use* |

**Use when** it's the action that moves the player on. **Don't use** for navigation between peers (that's a tab), for filters (chips), or twice in orange on one screen.

**Accessibility** · role button · label is the visible text · 48dp minimum height · disabled plates stay focusable so screen readers can read the missing step.

### 2.2 Tag

The garment-label data unit. Everything small and factual.

**Anatomy** · 1px border · tag-mono caps text · optional leading glyph · optional striped edge.

**Variants** · data (`OVR 88`) · you (orange fill) · result (`W` volt, `D` neutral, `L` striped) · rating (the scale in the style guide) · zone code (`UCL`, `DOWN`) · pot (`POT 2`) · position (`ST`) · difficulty (`HARD`, with Chaos and Cursed striped) · honour (`POTM ×3`) · status (`"SAVED"`, `SOON`, `LAST TIME`).

**All possible states** · default · selected · striped (out) · hidden value (`??`) · pressed (when it's a link) · focused.

**States in use**

| State | Where |
|---|---|
| default | Everywhere |
| selected | B4 sort, D3 families, D8/D9 filters |
| striped | Results, zones, eliminated clubs, out-of-position picks, Chaos/Cursed |
| hidden value | B4 ratings hidden, B6 before the reveal, B7 hidden-rating rivals |
| pressed, focused | Tags that link (D3 percentile tags open the board) |

**Don't use** tags for sentences, or as buttons.

### 2.3 Label

A riveted garment label. For things that stand for a whole outcome or choice.

**Variants** · RunLabel (a run in a list) · VerdictLabel (the verdict itself) · ModeLabel (setup) · CareLabel (difficulty rules) · RevealLabel (placement) · ComingSoonLabel (no rivets, not tappable).

**All possible states** · default · pressed · focused · perfection (volt edge) · misery (striped) · last used (`LAST TIME` tag) · coming soon · loading outline · stitching (animating in).

**States in use**

| State | Where |
|---|---|
| default, pressed, focused | A2, B1, B2, D8 |
| perfection, misery | A2, D1, D8, D11 |
| last used | B1, B2, B3 |
| coming soon | B1 (World Cup full route) |
| loading outline | A2, D8 |
| stitching | D1 only |

### 2.4 Tape

A 4px woven band.

**Variants** · colourway (mode, World Cup tricolour, replaced club) · zone (solid, dashed, dotted, striped) · road (five-stage progress, custom UCL).

**All possible states** · default · stitched edge (low contrast against the ground) · drawing (animating in) · current (road stage with orange tag) · done (road stage stamped).

**States in use** · colourway default and stitched (every in-run screen) · drawing (lights on, B7 club colour) · zone variants (C1, C2, C3, D2, D7) · road current and done (C4).

### 2.5 Stripe

The hazard pattern. Not a component a screen renders alone; a fill other components use. Sizes 6/6 and 4/4. Never under text. See the style guide §7.1.

### 2.6 ZipTag

The orange tag that marks what you're holding or who you are.

**All possible states** · attached (static) · swinging (just attached) · detached · reduced-motion attached.

**States in use** · attached (C1 your row, D2, D8) · swinging (B4 pick and move) · detached (B4 cancelling a move).

**Rule** · one on screen at a time.

### 2.7 RunHeader

**Anatomy** · colourway tape · stage indicator (`STAGE 3 / 6` or the road tape) · stage title in the super · abandon control · context help tag.

**All possible states** · setup (cotton) · in season (nylon) · paused · abandon confirming · looking back (with `BACK TO LIVE`).

**States in use** · all five, across B1–C7.

### 2.8 NavBar and NavRail

**All possible states** · active item · inactive · pressed · focused · badge (new) · hidden during a run.

**States in use** · active, inactive, pressed, focused, hidden during a run. Badge *not in use* (there's nothing to notify about; The Dugout's lesson that dead entries teach the menu lies applies to unused badges too).

### 2.9 ListRow

Rules, not cards.

**Variants** · T1 (56) · T2 (48) · T3 (36 visual / 48 hit area) · link row (chevron) · value row (trailing value) · toggle row.

**All possible states** · default · pressed · focused · you (orange tag) · disabled · loading skeleton.

**States in use** · all six (A4, A5, D3–D10).

### 2.10 Table

League tables, stats boards, mini tables.

**Anatomy** · header row in the tag mono · T3 rows · zone tape column · you row · pinned row · legend line.

**All possible states** · default · sorted by a column · per-90 · you row in view · you row pinned · zone crossing beat · row reordering · looking back (frozen at a matchday) · loading skeleton · empty with rule ("Nobody's played 3 matches yet.") · couldn't load.

**States in use**

| State | Where |
|---|---|
| default, you row in view, legend | C1, C2, C3, D2, D7, B8 |
| sorted, per-90 | D3, D4 |
| you row pinned | C2 (36 clubs), D9 |
| zone crossing, reordering | C1, C2, C3 |
| looking back | C1, D7 (at the time of the match) |
| loading, empty, couldn't load | D2, D3, D9 |

### 2.11 SquareTabs and SegmentSwitch

**All possible states** · active (orange tape under it) · inactive · pressed · focused · sticky · overflow scroll (more tabs than fit).

**States in use** · active, inactive, pressed, focused everywhere; sticky on D7 (and it must stay one row on Android); overflow on D2 at narrow widths.

### 2.12 Chips and sort

**All possible states** · selected · unselected · pressed · focused · count badge.

**States in use** · selected, unselected, pressed, focused. Count badge *not in use*.

**Rule** · never more than four visible; group the rest (D3 families).

### 2.13 Form controls

| Component | All possible states | States in use |
|---|---|---|
| Field | default · focused · filled · error (striped edge + message) · disabled · with trailing action (SHOW) | All (A3) |
| Checkbox | unchecked · checked · focused · error | unchecked, checked, focused (A3) |
| Toggle (`ON`/`OFF` plate) | on · off · pressed · focused · disabled | on, off, pressed, focused (A4, B2 custom) |
| StepControl | default · at min · at max · focused · disabled | default, min, max, focused (B2 custom) |

### 2.14 ConfirmScreen, HoldToConfirm, DangerZone

Decisions that must interrupt, as a full screen route rather than a modal: back works, it can't stack, and it can't clip its own buttons off screen.

**ConfirmScreen anatomy** · the question in the super · what's lost, stated with numbers ("7 picks") · a verb plate for the destructive choice · a verb plate for staying.

**All possible states** · default · confirming (plate loading) · done.

**States in use** · default and done for: abandon run (RunHeader, system back), discard picks (B4), play without a bench (B5), sign out (A4). HoldToConfirm and DangerZone: delete account (A4).

### 2.15 Feedback

| Component | All possible states | States in use |
|---|---|---|
| StripedNotice | info · warning · with action | All three (A3, B4, B7, C4) |
| InlineError | default · retrying · resolved | All three (A2, D2, D3, D8, D9) |
| EmptyState | first time · filtered to nothing · guest | All three (A2, D8, D9, D10) |
| SaveTag | saving · saved · failed with retry · guest (not kept) | All four (D1) |
| Skeleton | row · label outline · tag | row, label outline (A2, D2, D7, D8) |

### 2.16 Icon

Material Symbols Sharp plus the custom football glyphs (style guide §8). Sizes 16, 20, 24. Every icon-only control carries a label.

### 2.17 RoundFlag and ClubTag

- **RoundFlag** · a circular flag asset at 16, 20 or 24. States: default, unknown nation (neutral circle with the three-letter code).
- **ClubTag** · the three-letter code on the club's colour tape. States: default, you (orange ZipTag attached), eliminated (striped), replaced club (`YOU TOOK OVER` tag).

---

## 3. Area components

### 3.1 Setup (07b)

| Component | Purpose | States in use |
|---|---|---|
| PitchShape / ShirtOutline | Formation preview | default, selected |
| FormationRack | Swipeable list of shapes | default, selected, scrolling |
| PitchHangers | The draft pitch | empty hanger, filled, eligible (lit), holding, in-out preview, out-of-position (striped edge), complete |
| PlayerTag | A player to pick | available, no slot (striped), hovered-eligible, holding, hidden rating |
| ClubTag (flippable) | The landed club-season | front, flipped to fact |
| RackSpin | The spin | first spin (full), later spins (short), landing, reduced motion |
| BenchRail | Five subs | empty, filled, holding |
| FlipTag | Ratings reveal | hidden, flipping, revealed |
| PotDraw / RevealLabel | Placement and draws | spinning, paused, landed |
| FixtureRow | A fixture in a draw | home, away, collapsed group |

### 3.2 Season (07c)

| Component | Purpose | States in use |
|---|---|---|
| SeasonStrip | Results so far, scrubbable | live, scrubbed back, complete |
| ScorelineSuper / MatchCard | A match under floodlights | pre-kick-off, live, paused, extra time, penalties, full time |
| Ticker | The run's press | scrolling, paused, reduced motion (static) |
| GroupTable / ThirdPlaceStrip | World Cup | live, complete, cut line crossing |
| QualifyingTrack | Custom UCL ladder | round pending, live tie, through, out, bye |
| Bracket / BracketPath | Knockouts | preview (fit), zoomed, your path, unknown slot, eliminated |
| PenaltyTagRow | Shootout | pending, scored, missed, decided early |
| KitWall | Lineups | team sheet (no ratings), live (ratings moving), final |
| MomentumStrip | Momentum | revealing to the minute, extra-time rescale |
| AwardCut / BallotTable | Awards Night | revealing, paused, skipped (full list) |
| VerdictStitch | The verdict | counting in, stitched perfection, stitched middle, stitched misery, from history (static) |

### 3.3 Results and records (07d)

| Component | Purpose | States in use |
|---|---|---|
| CompactVerdict | Top of the run hub | default |
| PositionGraph | Season position line | default, looking back |
| PressFeed / ArticleBody / FrozenTable | Stories | feed, story, you-related |
| MirroredStatBar / SideHeader | Match stats | home leads, away leads, level |
| MatchLogRow | A player's or club's match | played, unused sub, injured, suspended |
| TrendLine | Player rating over the run | default |
| Patch | Achievements | earned (sewn), not earned (outline) |
| ShareLabel | Sharing | generating, ready, fallback (copy link) |

---

## 4. Emoji and glyphs to replace

143 emoji and symbol glyphs appear in UI code today (flags counted separately below). Every functional one becomes an icon or a component.

| Glyph | Uses | Where | Replacement |
|---|---|---|---|
| ⚽ | 28 | Live feed, lineup pips, stats, squad summary, tie viewers | Custom `goal` glyph |
| 🏆 | 17 | Result screens, career, UCL viewers, simulations | `trophy` icon; Awards section heading as text |
| ★ | 12 | Player of the match markers | `star` icon inside a volt tag |
| 📊 | 11 | "View Stats" buttons, match stats links | Secondary plate with `leaderboard` icon, or a tab |
| ⚠️ | 7 | Shock defeats, no-recovery warning, simulations | StripedNotice; `warning` icon |
| ▲ ▼ | 6 each | Sub on and off markers | Custom `sub on` / `sub off` glyphs |
| ◆ | 6 | "Direct to R16" and championship-group markers | Zone Tag (`R16`, `CHAMP GROUP`) |
| ❌ ✅ | 5 / 4 | Penalty kicks | PenaltyTagRow (filled / striped) |
| ⏸ | 4 | Pause controls | `pause` icon |
| 📖 | 4 | "How it works" buttons | ContextHelpTag |
| 🏴 🏳️ 🌍 | 4 / 2 / 2 | Mode art, league-browser headings | ModeLabel colourway; RoundFlag where a nation is meant |
| 🌟 | 3 | Best U21 | Text heading; `U21` Tag |
| 💔 | 3 | Worst loss | LinkedMatchRow titled "Worst loss" |
| 🟥 🟨 | 3 / 2 | Cards | Custom `red card` / `yellow card` glyphs |
| 🥅 | 3 | Own goal | Custom `own goal` glyph |
| 🩹 | 3 | Injury | Custom `injury` glyph |
| ⚡ | 2 | Quick Sim Tester, a simulation label | `bolt` icon (developer builds only) |
| ✦ | 2 | "UCL✦" competition code | The words "full path" |
| 😬 | 2 | Empty states on Home and Ranks | EmptyState copy, no glyph |
| ✓ | 2 | Achievements, register | `check` icon |
| ⏩ | 2 | Skip All | `skip` icon + label |
| 🎫 💀 👑 🥈 🇪🇺 📈 🥱 | 1–2 each | Tier emoji on the league result card | VerdictLabel treatment per tier |
| 🔒 🏟️ 🎉 ⇄ ☠️ 🥉 🎯 🔁 🧤 | 1 each | Career empty state, UCL celebration, draft swap, Cursed mode, third place, assist, sub swap, clean sheet | `lock`, EmptyState, VerdictStitch, `swap_horiz`, hazard ModeLabel, bronze honour Tag, custom `assist`, custom `sub`, custom `clean sheet` |

**Flags.** 60+ flag emoji live in `src/data/geo-iso.ts` as data. They're replaced by RoundFlag assets, which also removes the need for the Twemoji web font workaround in `app/_layout.tsx`.

---

## 5. Code this deletes

Recorded so the redesign shrinks the codebase rather than growing it.

- Every content use of `AppModal`: `PlayerGamesModal`, `TeamRosterModal` (`stats.tsx`), `TeamMatchesModal` (`result.tsx`), `TeamModal` ×2, `KOTieModal`, `KOMatchModal`, `LeagueTableModal`, `LeaguesBrowserModal`, `KoTieDetailModal`, `WCGroupModal`, `RulesModal`. Their content survives as routes.
- The two local `formatTier` functions.
- The four result screens' duplicated hero, lineup, medical and button sections (one verdict and one hub replace them).
- `installFlagFont` and the Twemoji flag font once RoundFlag ships.
- The web chrome glows in `app/_layout.tsx` and `app/+html.tsx`.
- `public/index.html`, the nested `expo` block in `app.json`, `assets/modes/upscalemedia-transformed.jpeg`, `players_v3.db`, `players_v4.db`.
- The unused `submit-run` edge function's stale tier ladder, once saves route through a server function that uses the shared one.
