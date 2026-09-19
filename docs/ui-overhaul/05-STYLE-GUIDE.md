# 05 · Style guide: the Kit Drop system

> Part of the UI overhaul set. Start at [`00-README.md`](00-README.md). The why lives in [`04-DIRECTION.md`](04-DIRECTION.md).
> Status: **provisional.** This becomes `DESIGN.md` at the project root when the first build starts, and exact values get corrected by what survives that build. Every contrast figure in this file was computed, not estimated.

A token file can say "radius 0". It can't say that rivets are the one exception, or that orange must never be used as text on white. This guide is for the rules a style panel can't hold.

---

## 1. Token architecture

Three layers, borrowed from IBM Carbon's model. Components never read a primitive directly.

```
primitive   the raw value               ink = #0C0C0D     cotton = #F3F3F0
   ↓
role        what it means, per ground   text (on cotton) = ink
                                        text (on nylon)  = cotton
   ↓
component   where it's used             plate.primary.bg = role.you
```

- **Primitives** are colours, sizes and durations with material names (`cotton`, `nylon`, `safetyOrange`, `bootVolt`).
- **Roles** resolve per ground. `role.text` is ink on cotton and cotton on nylon. A screen asks for roles and declares which ground it stands on.
- **Components** are the few named uses that deserve a token (`plate.primary`, `tag.you`, `tape.colourway`).

**React Native note.** `StyleSheet.create` captures values when the module loads, which is why the current per-mode theming needs inline overrides everywhere. The new theme should expose roles through a hook keyed by ground and run (`useKit()` returning the resolved roles for the current ground, mode colourway and replaced-club colour) and build dynamic styles from it. Static layout values can stay in `StyleSheet`.

---

## 2. Colour

### 2.1 Primitives

| Name | Value | Material |
|---|---|---|
| `cotton` | `#F3F3F0` | White cotton twill. Neutral, very slightly cool of cream on purpose. |
| `label` | `#E2E2DE` | A printed care label; the sunken surface on cotton. |
| `ruleCotton` | `#CFCFCA` | Hairline rules on cotton. Decorative only. |
| `ink` | `#0C0C0D` | Screen-print ink. |
| `inkMuted` | `#5A5A60` | Secondary text on cotton. |
| `inkFaint` | `#8A8A90` | Placeholders and disabled text on cotton, large sizes only. |
| `nylon` | `#141416` | Black nylon; the floodlight ground. |
| `nylonRaised` | `#1F1F22` | A panel on nylon. |
| `ruleNylon` | `#34343A` | Hairline rules on nylon. Decorative only. |
| `cottonMuted` | `#A4A4AB` | Secondary text on nylon. |
| `safetyOrange` | `#FF5A00` | The zip-tie tag. |
| `bootVolt` | `#D5FF3F` | A 2014 boot. |

**Colourways** (the woven tape that says where you are):

| Mode | Values | Note |
|---|---|---|
| FIFA World Cup (full route) | `#3CAC3B` `#2A398D` `#E61D25` | Set by the maintainer. Three-band tape. |
| FIFA World Cup (finals) | the same tricolour | One competition, one identity. |
| UEFA Champions League (both) | `#2F4BFF` cobalt | |
| Chaos | `#C8261B` | Darkened from the current `#FF3B30` so cotton text passes. |
| Cursed | `#7234F0` | Darkened from the current `#A855F7` for the same reason. |
| All Time / League | the replaced club's primary colour | Read from the database at placement; see §2.5 for the contrast guard. |

### 2.2 Roles

| Role | On cotton | On nylon | Contrast |
|---|---|---|---|
| `bg` | `cotton` | `nylon` | n/a |
| `surface` (panels, plates) | `cotton` with ink border | `nylonRaised` | n/a |
| `sunken` (inputs, tag fields) | `label` | `#0B0B0C` | n/a |
| `text` | `ink` | `cotton` | 17.59 / 16.55 |
| `textMuted` | `inkMuted` | `cottonMuted` | 6.16 / 7.43 |
| `textFaint` (disabled, placeholder) | `inkFaint` | `#6C6C73` | 3.09 on cotton: large text or non-essential only |
| `rule` | `ruleCotton` | `ruleNylon` | decorative |
| `you` (fill) | `safetyOrange`, ink text | `safetyOrange`, ink text | ink on orange 6.25 |
| `you` (text) | **never** | `safetyOrange` | orange on nylon 5.88 · on cotton 2.81 ✗ |
| `perfection` (fill) | `bootVolt`, ink text | `bootVolt`, ink text | 16.95 |
| `perfection` (text) | **never** | `bootVolt` | volt on nylon 15.95 · on cotton 1.04 ✗ |
| `out` | hazard stripe, ink/cotton | hazard stripe, cotton/nylon | pattern, see §7.1 |
| `draw` / neutral result | `#6E6E74` | `cottonMuted` | 4.56 / 7.43 |
| `focus` | 2px ink outline, 2px offset | 2px cotton outline | n/a |

### 2.3 Family rules

- **Orange means you.** Your XI's rows, the player you're holding, the one primary action. If two things on a screen are orange, one of them is wrong.
- **Orange is never text on cotton**, and never used for errors.
- **Volt means the good end.** Wins, "through", promoted, Perfection. Volt is never a button colour and never text on cotton.
- **Out is a pattern.** Loss, eliminated, relegated, suspended, disabled. Never a red fill.
- **Red is not a role.** The only reds in the system are the Chaos colourway and the World Cup band, both tape. Destructive actions (delete account) use an ink plate with a hazard stripe and a verb label.
- **Colourways are location, not meaning.** They appear on tapes, run labels and the mode's own screens, never on results or states.
- **Nothing is colour-only.** Every coloured state also has a label, a glyph or a pattern.

### 2.4 Result and rating scales

**Match results (W / D / L):** a square tag with the letter in the tag mono. W on volt, D on neutral, L on hazard stripe. The letter carries the meaning; the fill confirms it.

**Player ratings (0–10):**

| Band | Treatment |
|---|---|
| 8.0 and up | Volt tag, ink figures, a small star glyph |
| 7.0–7.9 | Ink tag, cotton figures (on nylon: cotton tag, ink figures) |
| 6.0–6.9 | Outlined tag |
| 5.0–5.9 | Outlined tag, muted figures |
| below 5.0 | Hazard-striped edge, figures in text colour |

**Table zones** (from the real season's rules, see [`03-DUGOUT-COMPARISON.md`](03-DUGOUT-COMPARISON.md) §4): a 4px tape on the row's leading edge plus a code in the tag mono.

| Zone | Tape | Code |
|---|---|---|
| Title | volt | `CHAMP` |
| Champions League | cobalt, solid | `UCL` |
| Europa League | cobalt, dashed | `UEL` |
| Conference League | cobalt, dotted | `UECL` |
| Promotion or play-off | ink, dashed | `PO` |
| Relegation | hazard stripe | `DOWN` |

Europe shares one hue on purpose; the pattern and the code separate the three, and orange stays free to mean you. Every table carries a one-line legend.

### 2.5 The replaced club's colour

League runs take the colourway from the club the XI replaced. Club colours are arbitrary, so a guard applies: if the colour sits within 3:1 of the current ground, the tape gets 1px stitching in the opposite ink so it still reads as a tape. Text is never set on a club colour.

---

## 3. Type

### 3.1 The three voices

| Voice | Provisional face | Job | Floor |
|---|---|---|---|
| **Super** | Archivo, ExtraCondensed width, Black weight, italic | Verdicts, the home lockup, round names, a final's scoreline | 22px |
| **Tag** | Martian Mono, condensed width, Medium, caps | Garment-label data: IDs, positions, OVR, matchday codes, zone codes | 11px |
| **Workhorse** | Archivo, normal width, Regular to Bold | Tables, stats, stories, buttons' secondary text, every sentence | 13px (T2/T3), 15px (T1) |

**Why these, and what would replace them.** Both are open-licensed Google Fonts with variable axes, so one Archivo file covers the super and the workhorse, which keeps the Android bundle small. Neither is on the list of faces that signal a template. Swap either if the first build shows any of these: no tabular figures (must be verified on Android), no real italic at ExtraCondensed width, or a Black weight that clogs at 22px. Any replacement super must be an extra-condensed grotesque with a true italic; any replacement tag must be a mono with a condensed width.

### 3.2 Scale

Roles follow Material's structure (display, headline, title, body, label) so Android's font-size setting scales them sensibly.

| Token | Size / line | Voice | Used for |
|---|---|---|---|
| `super.xl` | 72 / 64 | Super | The verdict word |
| `super.l` | 48 / 44 | Super | Home lockup, final scoreline |
| `super.m` | 32 / 30 | Super | Screen titles on T1 screens, round names |
| `super.s` | 22 / 22 | Super | Section supers, plate labels on large buttons |
| `title` | 18 / 24 | Workhorse Bold | Card and section titles on T2/T3 |
| `body.l` | 15 / 22 | Workhorse | T1 body, stories |
| `body` | 13 / 18 | Workhorse | T2/T3 rows, stat labels |
| `figure.l` | 28 / 28 | Workhorse Bold, tabular | Scores in rows, OVR on the pitch |
| `figure` | 13 / 18 | Workhorse Medium, tabular | Table numbers |
| `tag` | 11 / 14 | Tag, caps, +4% tracking | Codes and data labels |
| `button` | 15 / 18 | Workhorse Bold, caps, +2% tracking | Plate buttons |

### 3.3 Rules

- **Italic belongs to the super.** Body text is never italic; a story's standfirst uses muted colour, not slant.
- **Caps belong to supers, tags and buttons.** Sentences are sentence case.
- **Straight quotes, not curly, and only around names and states of one to three words.** `"YOUR XI"`, `"MISERY"`, `"OUT"`. At most one quoted label per region of a screen. Never around a sentence.
- **Tabular figures on every number that shares a column** (`fontVariant: ['tabular-nums']`).
- **Supers cap their scaling.** Set `maxFontSizeMultiplier` around 1.3 on supers so a large system font setting enlarges the workhorse, not the verdict word off the screen.
- **Measure.** Stories and guide text run 60–70 characters a line; on wide web they sit in a column, never full width.
- **No text shadows, no gradient text, no glow.**

---

## 4. Space and density

### 4.1 Spacing scale

`4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`. More space above a heading than below it. One rhythm per screen.

### 4.2 Density tiers

Adopted from The Dugout and adjusted for Android's 48dp touch floor.

| Tier | Row height | Body | Used on |
|---|---|---|---|
| **T1** | 56 | `body.l` | Home, setup screens, the verdict, stories |
| **T2** | 48 | `body` | Draft lists, runs, ranks, results lists |
| **T3** | 36 (not tappable) or 48 (tappable) | `body` | League tables, match stats, player stats |

A T3 row that opens something keeps its visual height at 36 but extends its hit area to 48 with `hitSlop`.

### 4.3 Layout

| Width | Class | Layout |
|---|---|---|
| under 600 | Compact (phones) | One column, bottom bar, 16 margins |
| 600–1023 | Medium (large phones landscape, tablets, narrow web) | One or two columns, bottom bar, 24 margins |
| 1024 and up | Expanded (desktop web) | Navigation rail, two or three panes, 32 margins, 1440 content max |

The current 480px phone column on desktop is retired; see [`10-ADAPT-OPTIMIZE-A11Y.md`](10-ADAPT-OPTIMIZE-A11Y.md).

---

## 5. Shape

### 5.1 Corners

**The radius is 0.** Plates, panels, inputs, chips, tables, images and focus rings are square.

The complete list of round things:

| Element | Shape | Why |
|---|---|---|
| Rivets | 4px circles | They're rivets |
| Flags | Circles | Round flags read at 16px, and The Dugout's FotMob study found the same |
| The zip-tie tag's head | Rounded end with a hole | It's the object |
| The spin wheel's hub, if one appears | Circle | It's a mechanism |

Anything else with a radius is a bug.

### 5.2 Borders

| Weight | Where |
|---|---|
| Hairline (`StyleSheet.hairlineWidth`) | Rules between rows |
| 1px | Tags, inputs, secondary plates |
| 2px | Primary plates, the held player's tag, focus |
| 4px | Zone tapes, the colourway tape |

### 5.3 Depth

No blur shadows and no elevation colours. A plate that sits above the ground gets a **2px ink offset** down and to the right, like a label pressed onto fabric. Pressing it moves the plate into its offset. On nylon the offset is `#000000`.

---

## 6. Components at a glance

Full states and usage are in [`08-COMPONENTS.md`](08-COMPONENTS.md). The shapes:

```
PLATE (primary)                 PLATE (secondary)        TAG
┌•────────────────────────•┐    ┌•──────────────────•┐   ┌──────────────┐
│      START A RUN     →   │    │   VIEW SEASON      │   │ POS ST  OVR 91│
└•────────────────────────•┘▚   └•──────────────────•┘   └──────────────┘
 orange, ink text, offset       ink outline, no fill     1px, tag mono

ZIP TAG (you're holding this)   TAPE (colourway)         STRIPE (out)
  ◯═══╗                         ▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌       ╱╱╱╱╱╱╱╱╱╱╱╱╱╱
      ╚══ orange                 4px, stitched edges      45°, ink/ground
```

---

## 7. Patterns and materials

### 7.1 Hazard stripe

- **Angle** 45°, rising left to right.
- **Band** 6px ink and 6px ground at T1; 4px and 4px at T2/T3 and on tags.
- **Where** tag edges, table-row leading tapes, badges, the Misery verdict label, disabled plates.
- **Never** under body text. When a striped element carries text, the text sits on a solid ground inset of at least 4px.
- **Build** one SVG `<Pattern>` in `react-native-svg`, one `repeating-linear-gradient` on web.

### 7.2 Rivets

Four 4px dots, 6px in from each corner, in the plate's border colour. Primary plates, the verdict label and run labels only. Tags don't get rivets.

### 7.3 Woven tape

A 4px band in the colourway with 1px stitched dashes along both edges. Runs along the top of every in-run screen and the leading edge of run labels. The World Cup tape is three equal bands.

### 7.4 The zip-tie tag

Orange, a round head with a hole, a short strap. It hangs off whatever you're holding: the player on the draft rail, your club's row in a table, your run in a list. One on screen at a time. It swings once when attached (see [`06-MOTION.md`](06-MOTION.md)).

### 7.5 Texture

Grounds are flat. Texture appears only in the ceremony and on share labels, as a single static fabric image under 40KB per ground. No noise overlays on working screens.

---

## 8. Iconography

- **Base set:** Material Symbols in the **Sharp** style (square line ends and corners match the zero-radius rule; Apache 2.0; native to Android's expectations). Drawn from SVG with `react-native-svg`, not an icon font.
- **Custom football glyphs**, drawn on the same 24px grid with 2px strokes and square ends: goal, own goal, assist, penalty, missed penalty, yellow card, red card, sub on, sub off, injury, home (a house), away (a departing plane), kit tag, hanger, whistle.
- **Sizes:** 16, 20, 24. Nothing else. Every icon-only control has an accessibility label.
- **Emoji are not icons.** Flags stay (as round flag assets, not emoji), everything else is replaced. The 143 current glyphs are inventoried in [`08-COMPONENTS.md`](08-COMPONENTS.md) §6.

---

## 9. Brand mark

Nothing here exists yet; this is the brief for making it.

- **Wordmark.** `PERFECTION` over `MISERY` in the super, with MISERY carrying a hazard-stripe underline. Used on Home, the splash and share labels.
- **Compact mark.** A riveted plate reading `P/M` in the super, with an orange zip-tie tag hanging off its corner.
- **App icon.** The compact mark on nylon. Adaptive icon layers: nylon background, plate and tag foreground, a monochrome plate outline for themed icons.
- **Favicon.** At 16 and 32px the plate alone, with the tag as a single orange pixel cluster.
- **Must not resemble** any sportswear brand's mark, arrow logo or quotation-mark treatment used as a logo.
- **Delivers:** launcher icon, adaptive foreground, background and monochrome layers, splash, favicon, apple-touch-icon, web manifest icons, a 1200×630 default link preview.

---

## 10. Imagery

- **No photographs of real players.** The game has none and must not fabricate or scrape them.
- **Clubs are typographic.** A club appears as a tag: a three-letter code in the tag mono on a tape of its primary colour (`BAR` on blue-garnet). This replaces the missing crests honestly instead of faking them.
- **Nations use round flags.**
- **Competition marks are plain text in public builds** (see [`02-VIBECODE-AUDIT.md`](02-VIBECODE-AUDIT.md), TRU-12).
- **Materials are the art:** tags, tape, stripes, rivets, fabric. Illustration beyond that is out of scope.

---

## 11. Voice in one table

The full deck with rewrites is [`09-COPY-DECK.md`](09-COPY-DECK.md).

| Voice | Where | Sounds like |
|---|---|---|
| **The label** | Quoted names and states | `"YOUR XI"` `"OUT"` `"HOLDING"` |
| **The super** | Verdicts and moments | `MISERY.` `STAYS UP.` `WALKS.` |
| **The press** | Stories, the ticker | A sports desk: "Six clubs, two points, one relegation place." |
| **The tag** | Data | `MD 23/38` `OVR 88` `ID BAR-11/12` |
| **The guide** | Help, errors, empty states | A friend explaining it once, plainly |

System copy never uses exclamation marks. Buttons are verbs.

---

## 12. Do and don't

| Do | Don't |
|---|---|
| Put one orange action on a screen | Colour a second button orange "for balance" |
| Mark a loss with a hazard stripe and an L | Mark a loss with red alone |
| Use rules between rows | Wrap each row in a bordered card |
| Keep the super at 22px or bigger | Set a table header in the super |
| Quote a one-word state: `"OUT"` | Quote a sentence: `"Your run has ended"` |
| Square every corner | Round a plate "just a little" |
| Use the club's colour as a tape | Set text on a club colour |
| Show the verdict huge, once | Repeat the super on every section title |
| Say what the button does: `DISCARD 7 PICKS` | Label a destructive button "Yes" |
| Stitch a tape's edges when it's low contrast | Let a navy tape vanish into nylon |
