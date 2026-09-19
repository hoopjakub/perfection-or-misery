# The UI overhaul

A plan to take Perfection or Misery from a generic dark app to something with its own identity, without losing any of the depth underneath. **No code was changed to produce it.** Product truth lives in [`../../PRODUCT.md`](../../PRODUCT.md); this folder is the design and UX plan built on it.

Written 14 September 2026. Status of the set: **plan, direction locked**.

---

## The short version

- **Where it stands.** 22/40 on Nielsen's heuristics, 8/20 on a native technical audit. The engine and the stats are years ahead of the interface. The shell looks like a template: Expo's own icon, Tailwind greys, a blue accent, no typeface, 143 emoji standing in for icons.
- **What it becomes.** **Kit Drop, "Winner Stays" cut.** A run is a kickabout that becomes a final. Setup happens in the stockroom on white cotton; the season, finals and every Misery verdict happen under floodlights on black nylon. Safety orange means you, boot volt means Perfection, a hazard stripe means out. Chosen by the maintainer's steer after two rolled rounds.
- **What it borrows from The Dugout.** A press that writes stories from the table, real qualification zones, the pundits' predictions, Awards Night, and a draw you watch like a broadcast, all sized to fit inside one run.
- **What it refuses.** Modals for content, colour without meaning, praise the result didn't earn, and anything shown before the player has reached it.

---

## The documents

| # | Document | What it answers | Status |
|---|---|---|---|
| 00 | This file | How to read the set; decisions | Living |
| 01 | [Critique](01-CRITIQUE.md) | How good is the UI today, and what hurts most? | Snapshot |
| 02 | [Vibecode audit](02-VIBECODE-AUDIT.md) | What makes it look unfinished, and what blocks a public release? | Snapshot |
| 03 | [The Dugout comparison](03-DUGOUT-COMPARISON.md) | Where is The Dugout deeper, and what fits inside one run? | Reference |
| 04 | [Direction](04-DIRECTION.md) | What world, why, and the ten workflow pitches | Locked |
| 05 | [Style guide](05-STYLE-GUIDE.md) | Tokens, type, colour families, corner rules, icons, the mark | Provisional → `DESIGN.md` |
| 06 | [Motion and feel](06-MOTION.md) | Springs, scene cuts, signature sequences, haptics | Provisional |
| 07a | [Screens: shell and Home](07a-SCREENS-SHELL.md) | Navigation, Home, auth, You, Guide, About | Plan |
| 07b | [Screens: setup](07b-SCREENS-SETUP.md) | Mode, difficulty, shape, draft, bench, ratings reveal, the draw, the pundits | Plan |
| 07c | [Screens: the season](07c-SCREENS-SEASON.md) | League, UCL, World Cup, full UCL path, knockouts, Deep Match, Awards Night | Plan |
| 07d | [Screens: results and records](07d-SCREENS-RESULTS.md) | Verdict, run hub, stats, player, club, story, match sheet, Runs, Ranks, records, sharing | Plan |
| 08 | [Components](08-COMPONENTS.md) | Every component, all states vs states in use, emoji replacements, deletions | Plan |
| 09 | [Copy deck](09-COPY-DECK.md) | Every string rewritten, voice rules, factual flags | Plan |
| 10 | [Adapt, optimize, accessibility](10-ADAPT-OPTIMIZE-A11Y.md) | Native audit, wide layouts, performance, TalkBack and WCAG | Plan |
| 11 | [Roadmap](11-ROADMAP.md) | Seven phases, engine work, targets, keeping the docs alive | Plan |

Every screen in the `07` documents gets **five readability fixes** (useful even if the redesign is phased) and **five redesign moves**, a low-fidelity wireframe, its full list of states and the components it's built from.

---

## Reading order

| If you are… | Read |
|---|---|
| **The maintainer deciding what to do next** | This file → [11 Roadmap](11-ROADMAP.md) → [01 Critique](01-CRITIQUE.md) priority issues |
| **Building a screen** | [04 Direction](04-DIRECTION.md) pitch → the screen in `07` → [05 Style guide](05-STYLE-GUIDE.md) → [08 Components](08-COMPONENTS.md) → [06 Motion](06-MOTION.md) |
| **Writing copy** | [09 Copy deck](09-COPY-DECK.md) §1, then the table for the area |
| **Preparing the public release** | [02 Vibecode audit](02-VIBECODE-AUDIT.md) blockers → [10](10-ADAPT-OPTIMIZE-A11Y.md) §5–6 → [11](11-ROADMAP.md) phase 6 |
| **New to the project** | [`../PROJECT_STATE.md`](../PROJECT_STATE.md), [`../../PRODUCT.md`](../../PRODUCT.md), then [04 Direction](04-DIRECTION.md) |

---

## Words this set uses

| Term | Meaning |
|---|---|
| **Ground** | The surface a screen stands on: **cotton** (white, for setup and reading) or **nylon** (black, for live play and verdicts) |
| **Plate** | A riveted button. One orange plate per screen |
| **Tag** | A small bordered data label in the mono (`OVR 88`, `W`, `UCL`) |
| **Label** | A riveted garment label standing for an outcome or a choice (a run, a verdict, a mode) |
| **Tape** | A 4px woven band: the **colourway** (which competition, or the club you replaced) or a **zone** (UCL, DOWN) |
| **Stripe** | The hazard pattern that means out: loss, eliminated, relegated, disabled |
| **Zip tag** | The orange tag on whatever you're holding, or on you |
| **Super** | The extra-condensed italic caps used for verdicts and moments |
| **T1 / T2 / T3** | Density tiers: roomy, list, dense table |
| **The verdict** | The end of a run: the tier stitched on, and the score |
| **The press** | Stories written from the table as a run plays |
| **Lights on** | The cut from cotton to nylon when the season starts |
| **States in use** | The subset of a component's states that a real screen needs; the only ones to build |

---

## How this was made

- **Research.** Every screen, the theme and the shared components in this repo were read. The Dugout's design documents (`UI-VOICE.md`, `FOTMOB-UI.md`, `GDD.md`, `SCOPE.md`, `PLAN-0.1.4.md`) and its news, awards and theme source were read for the comparison.
- **Critique.** impeccable's two isolated assessments (a design review and the deterministic detector), synthesised here and fact-checked against the code. The snapshot is saved in `.impeccable/critique/`.
- **Audit.** The vibecode-audit skill's static scanner plus a manual pass across its checklist, including a security pass of the Supabase setup and the git history.
- **Copy.** The humanizer skill at medium intensity over roughly 1,100 extracted lines of UI copy.
- **Direction.** impeccable's new-work flow: a resonance-ranked list of worlds from football culture, an externally rolled assignment, dealt challengers weighed on audience identification and product clarity, and the maintainer's choice on a decision page.

**Not done, and why**

- **No code changes.** The brief asked for a plan.
- **No live render.** There is no deployed build, and the local debug server wouldn't start (it ran from the parent folder on Node 20.17, below what the current Expo CLI accepts). The maintainer's own Android screenshots stood in for the match sheet and the Deep Match. Phase 7 re-scores against real renders.
- **No image mock-ups.** No image generation was available in this session; wireframes are text.
- **`DESIGN.md` not written yet.** impeccable's shape flow stops before persistence. The style guide becomes `DESIGN.md` in Phase 1.
- **The critique's follow-up questions were skipped.** The brief had already set priority and scope: everything, as a plan.

---

## Decision log

Add to this, dated, with the reason. A decision that isn't here didn't happen.

| Date | Decision | Why | By |
|---|---|---|---|
| 2026-09-14 | Audience: the maintainer and friends plus a portfolio, built as if for public release | Store and web credibility must be high; the web side has none today | Maintainer |
| 2026-09-14 | Platform: Android and web equal (`adaptive`) | Desktop web gets real layouts instead of a phone column | Maintainer |
| 2026-09-14 | Depth: deepen each run; no career carry-over | The Dugout is the career game; PoM stays a roguelike | Maintainer |
| 2026-09-14 | Round 1 assigned The Board (stadium scoreboards) | Rolled | Re-rolled by the maintainer |
| 2026-09-14 | Round 2 assigned Page 302 (Teletext results) | Rolled | Re-rolled by the maintainer with a steer toward Kit Drop |
| 2026-09-14 | **Direction locked: Kit Drop, "Winner Stays" cut** | Streetwear grammar young fans already wear, plus the energy of Nike Football's 2014 "Winner Stays" advert, which the maintainer named. Inspired, not copied: no brand marks or slogans | Maintainer |
| 2026-09-14 | Two grounds set by phase, not a theme toggle | The scene decides: reading in daylight, drama under lights | Confirmed with the direction |
| 2026-09-14 | No modals for content; every surface is a route | Modals can't be linked, reloaded or backed out of predictably, and PoM has shipped two modal bugs | Carried from The Dugout's POM-REFERENCE §1.8 |
| 2026-09-14 | Misery is a pattern, not a colour | Readable for colour-blind players and in greyscale screenshots | Direction |
| 2026-09-16 | Tier names: the copy deck §2.1 proposal, used everywhere | One registry (`src/data/tiers.ts`) so screens can't disagree | Built in Phase 0 on the maintainer's go-ahead |
| 2026-09-16 | Super face: Barlow Condensed Black Italic; workhorse Archivo; tags Martian Mono | Archivo ExtraCondensed isn't in the static builds; the guide's fallback rule picked Barlow | Built in Phase 1 |
| 2026-09-16 | Icons: Ionicons Sharp behind a semantic `Icon`, not Material Symbols | Already installed, same square ends, swappable in one table | Built in Phase 1 |
| 2026-09-16 | Quick Sim Tester only in dev and `development`/`preview` EAS builds | Developer tool in public builds (audit BLD-3/4) | Built in Phase 0 |

### Open decisions

| Decision | Options | Where |
|---|---|---|
| Official UEFA and FIFA marks in a public release | Keep for the friends build, replace with original marks for the store | [02](02-VIBECODE-AUDIT.md) TRU-12 |
| Typefaces on a real phone | Keep Barlow/Archivo/Martian Mono if tabular figures and the italic hold up on Android; otherwise swap per the stated criteria | [`DESIGN.md`](../../DESIGN.md) §9 |
| Web domain | Maintainer's choice | [02](02-VIBECODE-AUDIT.md) DEP-1 |
| Rive for the tag swing and the verdict | Only if Reanimated looks stiff on a real phone | [06](06-MOTION.md) §9 |
| A player-facing "night grounds" preference | After launch, not before | [02](02-VIBECODE-AUDIT.md) POL-1 |
