# DESIGN.md — Kit Drop, "Winner Stays" cut

> The design system as built. Read before any UI work.
> Status: **as built for Phases 1–3, and Phase 4 in progress** (17 September 2026). Source of the decisions: [`docs/ui-overhaul/04-DIRECTION.md`](docs/ui-overhaul/04-DIRECTION.md) (why) and [`docs/ui-overhaul/05-STYLE-GUIDE.md`](docs/ui-overhaul/05-STYLE-GUIDE.md) (the full rules). Where this file and the style guide disagree, this file describes the code; the guide describes the intent, and the differences are listed in §9.

A run is a kickabout that becomes a final. Setup happens in the stockroom on **white cotton**; the season, finals and every Misery verdict happen under floodlights on **black nylon**. Industrial streetwear grammar: straight-quoted labels, rivets, zip-tie tags, hazard tape, woven colour tape.

---

## 1. Where things live

| What | Where |
|---|---|
| Tokens: primitives, roles, colourways, fonts, type scale, spacing, density, borders | `src/theme.ts`, below the "KIT DROP" banner. Everything above that banner is the old dark palette, kept only for screens not yet rebuilt |
| Components | `src/components/kit/` (import from `@/components/kit`) |
| Fonts | registered in `app/_layout.tsx` (`KIT_FONTS`) |
| Web page CSS | `src/lib/webChrome.ts` |
| Brand assets | `scripts/brand-assets.py` → `assets/icon.png`, adaptive icon layers, `favicon.png`, `splash-icon.png` |
| Club codes | `src/data/club-codes.ts`, checked by `scripts/verify-club-codes.ts` |
| Tier names, verdict ends, mode tags | `src/data/tiers.ts` |

**Rule:** a rebuilt screen reads `ROLES[ground]` and kit components. It never imports `colors` and never writes a raw hex.

---

## 2. Colour

### 2.1 Grounds and roles

A screen declares its ground (`KitScreen ground="cotton" | "nylon"`) and asks for roles.

| Role | Cotton | Nylon | Contrast |
|---|---|---|---|
| `bg` | `#F3F3F0` cotton | `#141416` nylon | |
| `surface` | cotton | `#1F1F22` | |
| `sunken` | `#E2E2DE` label | `#0B0B0C` | |
| `text` | `#0C0C0D` ink | cotton | 17.59 / 16.55 |
| `textMuted` | `#5A5A60` | `#A4A4AB` | 6.16 / 7.43 |
| `textFaint` | `#8A8A90` (large or non-essential only) | `#6C6C73` | 3.09 on cotton |
| `rule` | `#CFCFCA` | `#34343A` | decorative |
| `line` (borders that must be seen) | ink | cotton | |
| `you` (fill) | orange `#FF5A00`, ink text | same | 6.25 |
| `youText` | **none** | orange | 2.81 on cotton ✗ · 5.88 on nylon |
| `perfection` (fill) | volt `#D5FF3F`, ink text | same | 16.95 |
| `perfectionText` | **none** | volt | 1.04 on cotton ✗ · 15.95 on nylon |
| `draw` | `#6E6E74` | cotton muted | 4.56 / 7.43 |
| `stripe` | ink / cotton | cotton / nylon | pattern |

Every figure is computed (`src/lib/contrast.ts`, the same formula as the deep-audit skill's `contrast.py`).

### 2.2 What colours mean

- **Orange means you.** One orange thing per screen: your row, the thing you hold, or the one primary action.
- **Volt means the good end.** Perfection, wins, through. Never a button, never text on cotton.
- **Out is a pattern.** The hazard stripe (`Stripe`) marks loss, eliminated, relegated, disabled. There is no red role.
- **Colourways are location, not meaning** (`colourwayFor(mode, clubColour)`): World Cup tricolour `#3CAC3B #2A398D #E61D25`, Champions League cobalt `#2F4BFF`, Chaos `#C8261B`, Cursed `#7234F0`, league runs the replaced club's colour. They appear on tape only, never behind text.
- **Nothing is colour-only.** Every coloured state also has a word, a letter or a pattern.

### 2.3 The old palette, fixed

`colors.textMuted` is now `#8A92A0`: 6.14 on `bg`, 5.66 on `bgCard`, 5.01 on `bgElevated`. The old `#6B7280` claimed 4.5:1 in a comment and measured 3.67.

---

## 3. Type

| Voice | Family key | Face | Use |
|---|---|---|---|
| Super | `Kit-Super` | Barlow Condensed 900 Italic | verdicts, the wordmark, screen titles on T1 screens |
| Super, upright | `Kit-SuperPlain` | Barlow Condensed 800 | reserved |
| Tag | `Kit-Tag`, `Kit-TagBold` | Martian Mono 500 / 700 | codes, labels, data: `OVR 88`, `MD 12/38` |
| Workhorse | `Kit-Body`, `-BodyMedium`, `-BodyBold`, `-BodyBlack` | Archivo 400/500/700/800 | sentences, tables, buttons |

| Token | Size / line | Voice |
|---|---|---|
| `superXl` | 72 / 72 | Super |
| `superL` | 48 / 48 | Super |
| `superM` | 32 / 32 | Super |
| `superS` | 22 / 24 | Super |
| `title` | 18 / 24 | Workhorse Bold |
| `bodyL` | 15 / 22 | Workhorse |
| `body` | 13 / 18 | Workhorse |
| `figureL` | 28 / 30 | Workhorse Bold, tabular |
| `figure` | 13 / 18 | Workhorse Medium, tabular |
| `tag` | 11 / 14, +0.44 tracking, caps | Tag |
| `button` | 15 / 18, +0.3 tracking, caps | Workhorse Black |

**Rules**

- All kit text goes through `KitText`. It caps supers at `maxFontSizeMultiplier` 1.3 and turns off Android font padding.
- **Never set `fontWeight` on kit text.** Each weight is its own family; Android silently falls back when a weight is requested for a custom font.
- Italic belongs to the super. Caps belong to supers, tags and buttons (the scale applies them; write copy in sentence case).
- Straight quotes around one- to three-word names and states only: `"YOU"`, `"WRONG PITCH"`. At most one quoted label per region.
- Tabular figures on any number that shares a column.

---

## 4. Space, density, shape

- **Spacing** `space[1..8]` = 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64.
- **Density** T1 rows 56 (Home, setup, stories) · T2 48 (lists) · T3 36 visual / 48 hit (tables).
- **Radius is 0.** The only round things: rivets, round flags, the zip tag's head.
- **Borders** hairline between rows · 1px tags, fields, secondary plates · 2px primary plates, focused fields · 4px tape.
- **Motion** springs in `src/lib/motion.ts` (snap, settle, throw, stamp, swing); the zip tag's swing is the only overshoot. Haptics go through `src/lib/haptics.ts`.
- **Depth** is a 2px offset in `roles.offset` (ink on cotton, black on nylon). Pressing moves the element into it. No blur shadows.
- **Focus (web)** 2px orange outline, 2px offset, square.

---

## 5. Components (built)

States listed are the ones built; the full lists are in `docs/ui-overhaul/08-COMPONENTS.md`.

| Component | Variants and states |
|---|---|
| `KitText` | every type token |
| `Stripe` | 4 or 6px bands |
| `Tape` | one or more colours; stitched edge when a colour is under 3:1 against the ground |
| `Rivets`, `ZipTag` (static), `Icon` | |
| `Plate` | primary, secondary, quiet, destructive · pressed · disabled with the missing step named · loading |
| `BackControl`, `SectionTag` | |
| `ListRow` | T1/T2 · link, value, trailing slot · pressed · danger edge |
| `Toggle` | on, off, pressed |
| `Field` | default, focused, error (striped edge + message), secure with SHOW/HIDE |
| `Checkbox` | unchecked, checked |
| `Tag` | data, you, win, draw, loss (striped), selected, hidden (`??`) |
| `RunLabel` | default, pressed, perfection (volt edge), misery (striped edge) · `RunLabelSkeleton` |
| `Wordmark` | superL, superM |
| `IdTag` | registered (with zip tag), guest |
| `RoundFlag` | flag, unknown nation |
| `ClubTag` | default, you, eliminated |
| `KitScreen` | cotton, nylon · scroll or fixed · safe-area top inset · status bar per ground |
| `StripedNotice`, `InlineError`, `EmptyState` | |
| `KitTabBar` | bottom bar, rail from 1024px · active tape |
| `RunHeader` | colourway tape, six-stage strip (current, done, skipped as `SET`), title, back or none |
| `ChoiceLabel` | mode and care labels · tape or hazard edge · `LAST TIME` · `SOON` (not tappable) · trailing figure |
| `StepControl`, `Chips`, `InlineConfirm` | 48dp steppers · selected/unselected · inline decision where a route can't be used |
| Draft parts (`src/components/setup/DraftParts.tsx`) | `RackSpin`, `ClubCard` (flips to its fact), `Hanger` (empty, filled, holding, lit target, focus), `PlayerTag` (available, no slot, chosen), `SwingTag` |
| Season parts (`src/components/season/SeasonParts.tsx`) | `LeagueTable`: zone tape and code on each row, a heavier rule where the zone changes, sliding rows, a one-beat orange tape when you cross a zone line, muted before kick-off, flags and group letters for nations · `ZoneLegend` · `StandingFigure` · `SeasonStrip`: W volt, D grey outline, L striped, unplayed empty, the matchday you're viewing underlined · `ScorelineCard` · `ResultRow` · `SegmentSwitch` · `FixtureRow` with pot and home/away tags · `GroupWall` · `StampLabel` with a volt edge or the stripe · `RoadTape` · `Ticker` · `StoryItem` |
| `TieCard`, `TieRow` | one tie, two sizes · aggregate and legs · bye · seed marker · through/out · flags for nations |
| Run chrome (`src/components/season/RunChrome.tsx`) | `ThumbBar` · `CloseRun` · `BackToLive` · the skip and abandon questions |
| Awards (`src/components/season/AwardsParts.tsx`) | `FormationPitch` (the team in its chosen shape, your players edged in orange, bench of honourable mentions) · `PlayerAwardCard` (winner, the numbers that won it, the pundits' pick, runners-up) · `ClubAwardCard` · `AwardsSection` (the plain, no-ceremony version) |
| `PunditsTable`, `PunditsRoundTable` | league: final place against the pundits' place · cups: round called against round reached, shortlist or the whole field |
| Pitch views (`src/components/match/PitchViews.tsx`) | `ShotMap` (goal volt, saved cotton, off target outline, blocked muted, woodwork orange; size is xG) · `AveragePositions` · `HeatMap` (volt at strength) |
| `VerdictBlock` | perfection (volt tape) · misery (hazard stripe) · middle (colourway) · score with its multiplier · the pundits' call · share |
| Zone tones | `top` volt, `mid` solid muted cotton, `low` broken muted cotton, `out` hazard stripe. The code (CHAMP, UCL, UEL, UECL, PO, DOWN, R16, IN, 3RD, OUT) always sits beside the tape |
| ConfirmScreen | `app/confirm.tsx`, opened with `openConfirm()` from `src/lib/confirm.ts` |

**Icons** use semantic names (`Icon name="runs"`), mapped to Ionicons' Sharp set in `primitives.tsx`. Sizes 16, 20, 24 only. An icon that is the only content of a control takes a `label`.

**Emoji are not icons.** Flags go through `RoundFlag`.

---

## 6. Patterns

- **Hazard stripe** at 45°, never under text; text sits on a solid inset beside it.
- **Tape** 4px, stitched when low contrast.
- **Zip tag** marks you or what you hold. One on screen at a time.
- **Labels** (riveted, offset) stand for a whole outcome: a run, a verdict, a mode.

---

## 7. Screens on the system

| Screen | Ground |
|---|---|
| Home (`app/(tabs)/index.tsx`) | cotton |
| You (`app/(tabs)/profile.tsx`) | cotton |
| Sign in, create account (`app/auth/`) | cotton |
| Confirm (`app/confirm.tsx`) | cotton |
| Not found (`app/+not-found.tsx`) | cotton |
| The tab bar / rail | cotton |
| Where you play, How hard, Custom rules, Your shape, the draft, the draw, the pundits (`app/game/`) | cotton |
| Your ratings (`app/game/reveal.tsx`) | nylon |
| The season: league (`src/components/season/LeagueSeason.tsx`), Champions League league phase, World Cup groups, knockouts, bracket preview, the live match (`app/game/simulation.tsx`, `src/components/LiveMatch.tsx`, `BracketPreview.tsx`) | nylon |
| The full Champions League path (`custom-ucl-simulation.tsx`) | nylon |
| Awards Night (`app/game/awards.tsx`) | nylon |
| The Deep Match and its ceremony (`app/game/deep-match.tsx`, `Ceremony.tsx`) | nylon |
| The match sheet (`app/game/match-stats.tsx`) and its parts | nylon tokens; layouts unchanged |
| The four result screens below the verdict, and the run's awards page | nylon tokens; the layout rebuild is Phase 5 |
| The verdict block on all four result screens (`src/components/season/VerdictBlock.tsx`) | nylon · the rest of those screens is still the old dark palette |

Everything else still uses the old palette and is rebuilt phase by phase (`docs/ui-overhaul/11-ROADMAP.md`). Until Phase 6 replaces it, web keeps the 480px column, so the rail only appears on native tablets wider than 1024.

---

## 8. Voice

System copy never uses exclamation marks. Buttons are verbs that say what happens (`Discard 7 picks`, `Keep my runs`). A disabled button names what's missing. Empty states say what's true and what to do. Full deck: `docs/ui-overhaul/09-COPY-DECK.md`.

---

## 9. Where the build differs from the style guide

| Guide | Built | Why |
|---|---|---|
| Super face: Archivo ExtraCondensed Black Italic | Barlow Condensed Black Italic | Static Google Fonts builds only ship Archivo at normal width. The guide's own fallback rule asks for a condensed grotesque with a true italic |
| Tag face at condensed width | Martian Mono at normal width | Same reason: the static build has no width axis |
| Super line heights 72/64, 48/44 … | line height = size | The tighter values clip the italic's ascenders on Android |
| Material Symbols Sharp as SVG | Ionicons Sharp, behind `Icon` | Already installed, same square ends; swapping is a one-table change |
| Round flag assets | The flag emoji clipped to a circle, behind `RoundFlag` | The asset set is a later swap; the component contract is final |
| NavRail on desktop web | Built, but web still renders inside the 480px column | Wide layouts are Phase 6 |
| Settings (reduced motion, haptics), privacy, terms, delete account on You | Not shown | Nothing reads those settings yet (Phase 2), and the pages and server deletion are Phase 6. A row that does nothing would lie |
