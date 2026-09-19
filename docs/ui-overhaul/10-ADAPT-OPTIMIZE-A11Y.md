# 10 · Adapt, optimize, accessibility

> Part of the UI overhaul set. Start at [`00-README.md`](00-README.md).
> PRODUCT.md sets the platform as **adaptive**: Android and web are equal. This document is the technical side of that promise: a native audit from source, then the plans for layout, performance and accessibility.

---

## 1. Native technical audit

Audited from source against impeccable's native audit and Android's Material guidance. No device or browser run was possible (see [`01-CRITIQUE.md`](01-CRITIQUE.md), "What was not available").

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 1 | Zero `accessibilityLabel`, `accessibilityRole` or `accessibilityState` props anywhere in `app/` or `src/`. Muted text is 3.67:1. White on two mode accents is 1.63:1 and 2.48:1. Many targets under 48dp. |
| 2 | Performance | 2 | No `FlatList` anywhere: leaderboards, stats boards (hundreds of players), 36- and 90-club tables and 100-run histories all render inside `ScrollView`. `simulation.tsx` holds 48 pieces of state and one memo. Each draft spin sets state 20 times. |
| 3 | Appearance and theming | 2 | Tokens exist and are partly used; 115 raw hex values remain. `userInterfaceStyle` says light on a dark app. Mode theming needs inline overrides because `StyleSheet` captures colours at load. |
| 4 | Platform conformance | 2 | Six bottom destinations (Material allows three to five). Emoji as icons. Custom switches. `predictiveBackGestureEnabled: false`. On web, back fires `window.alert`. Hardcoded top padding instead of insets. |
| 5 | Adaptivity | 1 | `orientation: "portrait"` for every device. Desktop web is a fixed 480px column. No window size classes. `KeyboardAvoidingView` only adjusts on iOS. |
| **Total** | | **8/20** | **Poor** |

**Conformance verdict.** It reads as a custom game UI rather than a ported website, which is fine for a game, but it breaks the guarantees an Android user relies on: a readable screen reader pass, 48dp targets, sp-respecting text, and a back gesture that behaves. The Kit Drop world is allowed to look nothing like Material; it isn't allowed to ignore what Material protects.

### Findings by severity

| Sev | Issue | Where | Fix | Command |
|---|---|---|---|---|
| **P1** | No screen reader labels or roles on any control | Every screen | Roles and labels on every Plate, Tag link, tab, toggle and icon control; announce state changes | `/impeccable audit` → `/impeccable harden` |
| **P1** | Muted text and accent buttons fail contrast | `src/theme.ts`, mode CTAs | Kit Drop roles (all text pairs computed ≥ 4.5:1, see style guide §2.2) | `/impeccable colorize` |
| **P1** | Unvirtualized long lists | `leaderboard.tsx`, `stats.tsx`, `runs.tsx`, `cl-result.tsx`, `custom-ucl-result.tsx`, `CustomUclViewers.tsx` | `FlatList` with stable keys and `getItemLayout` for fixed-height rows | `/impeccable optimize` |
| **P1** | Desktop web is a phone column | `app/_layout.tsx` | Window size classes and multi-pane layouts (§2) | `/impeccable adapt` |
| **P1** | Sticky tab strip stacks vertically on Android | `app/game/match-stats.tsx` | Rebuild the sticky row so its direction survives the sticky wrapper | `/impeccable adapt` |
| **P2** | Whole-screen re-renders during the season | `simulation.tsx` (48 `useState`, 1 memo) | Split into memoised panels reading narrow store selectors | `/impeccable optimize` |
| **P2** | Spin animation driven by React state | `draft.tsx` (20 updates per spin) | One UI-thread transform on a prebuilt strip ([`06-MOTION.md`](06-MOTION.md) §5.1) | `/impeccable animate` |
| **P2** | Touch targets under 48dp | Draft MOVE, speed and matchday controls, LIVE pill, steppers, back control | 48dp minimum via size or `hitSlop` | `/impeccable harden` |
| **P2** | No text-scaling strategy | Every screen | Workhorse scales freely; supers cap at 1.3; layouts tested at 200% | `/impeccable typeset` |
| **P2** | Portrait locked everywhere | `app.json` | Portrait on compact phones; unlock medium and expanded | `/impeccable adapt` |
| **P2** | Predictive back disabled; web back uses `alert` | `app.json`, `useSimBackGuard` | Re-enable; route back through the Abandon confirmation screen | `/impeccable harden` |
| **P3** | Android keyboard handling | `app/auth/*.tsx` | Adjust on Android too; plate rides above the keyboard | `/impeccable adapt` |
| **P3** | Hardcoded top padding | 13 screens | Safe-area insets | `/impeccable layout` |

### Positive findings

- **Reduced motion** is already honoured in the Ceremony, with the outcome still delivered. That's the pattern for everything in [`06-MOTION.md`](06-MOTION.md) §8.
- **Heavy work is deterministic and cached by design**: match sheets regenerate from a seed only when opened.
- **The bracket uses real gestures** (Gesture Handler and Reanimated) on the UI thread.
- **The game runs offline.** No network is needed to play a run.

---

## 2. Adapt: one product, three widths

Structure comes from window size classes, never from checking which device it is.

### 2.1 Classes

| Class | Width | Devices | Navigation | Panes |
|---|---|---|---|---|
| Compact | < 600 | Phones in portrait | Bottom bar | One |
| Medium | 600–1023 | Large phones in landscape, small tablets, foldables open, narrow browser windows | Bottom bar | One or two |
| Expanded | ≥ 1024 | Tablets in landscape, desktop browsers | Left rail | Two or three, 1440 max content |

**Orientation.** Compact stays portrait during a run (one-handed, thumb-zone plates). Medium and expanded unlock rotation and restructure rather than stretch.

### 2.2 Area by area

| Area | Compact | Expanded |
|---|---|---|
| Home | The poster, labels below, plate in the thumb zone | Lockup on the left third; last runs and bests on the right; the plate under the lockup |
| Setup | One decision per screen | Mode rack on the left, the selected mode's rules and difficulty on the right, shape and plate below |
| Draft | Pitch on top, rail below, SPIN at the bottom | Pitch in the centre, the club tag and player rail on the right, bench along the bottom; no scrolling at all |
| Placement | Globe, label, rivals, fixtures stacked | Globe on the left, the reveal and fixtures on the right |
| Season | Table / Results switch, strip on top, ticker at the bottom | Three panes: your match and the results on the left, the table in the centre, the press feed on the right |
| Knockouts | Bracket full width with pinch and pan | Bracket in the centre, your tie's live card pinned on the right |
| Deep Match | Scoreline, stats, timeline, lineups stacked | Kit walls on both flanks, scoreline and momentum in the centre, timeline below |
| Verdict | Stacked | The label centred at full size, predictions and headlines beneath in two columns |
| Run hub | Tabs across the top | Tabs as a left column inside the content; the table and a selected club's page side by side |
| Match sheet | Tabs | Facts and Lineup side by side, Stats as a third pane on the widest screens |
| Stats | Families as chips | Families as a list on the left, the board in the centre, the selected player's page on the right |
| Runs, Ranks | One column | Two columns of labels / the table with filters in a side panel |

### 2.3 Input

| Input | Rule |
|---|---|
| Touch | 48dp targets, primary plates in the thumb zone, no hover-only affordances |
| Mouse (web) | Hover steps the tone of rows and plates; cursor is a pointer on everything clickable; tooltips on icon-only controls |
| Keyboard (web) | Visible square focus ring on every control; logical tab order; shortcuts below |

**Web keyboard shortcuts**

| Key | Action |
|---|---|
| `Space` | Spin (draft) · Pause or resume (season, live matches, reveals) |
| `←` `→` | Scrub the season strip · Previous and next story |
| `Enter` | The screen's primary plate |
| `Esc` | Back · During a run, opens the Abandon confirmation |
| `/` | Search the run |
| `1`–`5` | Run hub tabs |

---

## 3. Optimize

Measure first; the numbers below are what to capture, not guesses about what they are.

### 3.1 Measure

| Metric | Where | How |
|---|---|---|
| Cold start to interactive Home | Android release build, mid-range phone | Android vitals / a timestamp log from process start |
| First web load (LCP, INP, CLS) and transfer size | Production web build, throttled mobile profile | Lighthouse |
| Time to deserialize the player database on web | Web build | Timestamp around the database load |
| Frame rate during a spin, a table reorder and the ticker | Android mid-range phone | Performance monitor |
| Re-renders per matchday during the season | Dev build | React DevTools profiler |

### 3.2 Change

| Area | Change | Why |
|---|---|---|
| **Lists** | `FlatList` (built into React Native) for every list over about 30 rows, with stable keys and `getItemLayout` on fixed-height T3 rows | Leaderboards, stats boards and big tables currently mount every row |
| **The season screen** | Split `simulation.tsx` into memoised panels (table, results, strip, ticker, controls) that read narrow Zustand selectors | A matchday update shouldn't re-render the controls or the ticker |
| **Animations** | Transform and opacity only, on the UI thread through Reanimated; no per-frame state | Spin, reorder, verdict, ticker |
| **The draft spin** | One prebuilt strip of tags, one animated value | Replaces 20 state updates per spin |
| **Web database load** | Show a designed loading beat while the 10.9 MB database deserializes; load it once per session; consider a slimmer web subset if the measure is poor | Web first load is where a stranger decides |
| **Web output** | `web.output: "static"` so each route ships real HTML and metadata | Faster first paint, link previews, crawlable pages |
| **Fonts** | One variable Archivo file and one Martian Mono file, subset to Latin plus Latin Extended; `font-display: swap` on web | Three voices without three font families |
| **Icons** | SVG components for the icons in use only, not a full icon font | Only the glyphs in [`08-COMPONENTS.md`](08-COMPONENTS.md) §4 ship |
| **Flags** | Round flag SVGs for the nations in the data, replacing the Twemoji web font | Removes a font download and a workaround |
| **Assets** | Delete the unused 1.65 MB JPEG and the two old database files | Repo weight |
| **Loops** | Stop the ticker, confetti and globe spin when the screen loses focus or the app goes to the background | Battery, and no work nobody sees |
| **Match sheets** | Keep regenerating on open; cache the last few in memory so back-and-forth between a sheet and its players doesn't recompute | Cheap already; this just avoids repeats |

---

## 4. Accessibility

Target: WCAG 2.2 AA on web, and a TalkBack pass on Android where a player can complete a full run.

### 4.1 Screen readers

- **Every control has a role and a label.** Plates are buttons, tabs are tabs, toggles announce on or off, icon-only controls say what they do ("Pause the season").
- **State changes are announced.** A goal for your side, a verdict, a save failure and a zone crossing use a polite live region (`accessibilityLiveRegion` on Android, `aria-live` on web).
- **Tables read as sentences per row.** "6th, Your XI, 38 played, goal difference plus 12, 59 points, Europa League place."
- **Graphs have a text summary.** The momentum strip and the position graph each carry one: "Real Betis on top for most of the second half."
- **Reveals are skippable and announce their result** so a screen reader user isn't waiting on an animation they can't see.
- **Focus order follows reading order**, and focus moves to the new page's title after a route change.

### 4.2 Vision

- **Contrast.** Every text pair in [`05-STYLE-GUIDE.md`](05-STYLE-GUIDE.md) §2.2 was computed and clears 4.5:1. Non-text elements that carry meaning (zone tapes, rating tags, the stripe) clear 3:1 against their ground or get stitched edges.
- **Never colour alone.** Results carry letters, zones carry codes, Misery is a pattern, your row carries a tag.
- **Text scaling.** Workhorse text scales with the system setting up to 200% without clipping; supers cap at 1.3×; rows grow rather than truncate club names.
- **Minimum sizes.** 11px for tags, 13px for reading.

### 4.3 Motor

- **48dp targets** with 8dp between adjacent targets.
- **No gesture is the only way.** Pinch-zoom on the bracket has zoom buttons; scrubbing the strip has previous and next controls; drag to move a player has tap-to-hold.
- **No time limits.** Every reveal and live match can be paused indefinitely.
- **Hold-to-confirm** (delete account) has a keyboard and switch-access equivalent: a second confirmation step.

### 4.4 Motion and cognition

- **Reduced motion** as specified in [`06-MOTION.md`](06-MOTION.md) §8.
- **One decision at a time** in setup; no screen shows more than four peer options without grouping.
- **Plain language**, with jargon (xG, OVR, aggregate) explained once in a context help tag.

---

## 5. Android specifics

- **Edge to edge.** Draw behind the status and navigation bars and apply insets; nothing hardcodes top padding.
- **Back.** Re-enable predictive back. Back steps one screen; inside a run it opens the Abandon confirmation screen (the same one the header uses).
- **Immersive mode.** The app currently hides the system navigation bar. Keep it hidden during live match playback and the Deep Match only; show it everywhere else, so system navigation stays predictable.
- **Splash.** Use the Android splash screen with the compact mark on nylon, and hold it only until the database is ready.
- **Icons.** Adaptive icon with background, foreground and monochrome layers so themed icons work.
- **Haptics** per the map in [`06-MOTION.md`](06-MOTION.md) §7, respecting the system setting.
- **Store requirements** in [`02-VIBECODE-AUDIT.md`](02-VIBECODE-AUDIT.md): privacy policy, in-app and web account deletion, data-safety form.

## 6. Web specifics

- **Real layouts** at medium and expanded widths (§2); the 480px column and its glows are removed.
- **Static output with per-route metadata:** title, description, canonical URL, and a link preview image. Run pages use their verdict label as the preview.
- **Installable.** A web manifest with the icon set, theme colour and a standalone display mode, so friends can add it to a home screen.
- **Offline.** The game already runs without a network once loaded; say so in an offline strip rather than failing silently when saving.
- **Branded not-found route** instead of the default.
- **A clean console** on every route in a production build (see the audit's "Couldn't verify").
