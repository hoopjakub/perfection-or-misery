# 01 · Critique: where the app stands today

Method: dual-agent (A: design-review agent, source reading · B: detector agent, deterministic scan), synthesised and fact-checked in the parent session.

> Part of the UI overhaul set. Start at [`00-README.md`](00-README.md).
> Snapshot date: 14 September 2026. Every number below was re-measured against the code before it was written down.

---

## How this was produced

Two assessments ran in isolation and never saw each other's output.

- **Assessment A** read every screen, the theme and the shared components, and scored the app against Nielsen's ten heuristics, a cognitive-load checklist and three personas.
- **Assessment B** ran impeccable's design detector over `app/` and `src/components/`.
- The parent session then checked A's claims one by one: contrast ratios were recomputed, timings were read off the animation code, and every quoted string was found in source.

**What was not available.** There is no deployed web build, and the local debug server would not start (the launch config ran from the parent folder on Node 20.17, which Expo's current CLI rejects). So there was no live render to overlay. The maintainer's own Android screenshots from this week stand in as visual evidence for the match sheet and the Deep Match.

---

## Design health score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Good progress text ("7/11 picked", "Matchday 12 / 38"). Saving a run is invisible, and a failed fetch looks exactly like an empty state ("No runs yet. Be the first!"). |
| 2 | Match with the real world | 3 | Fluent football vocabulary. Jargon leaks: "SM (Finals)", "Placement weighting disabled", "screw-level", "top-6 UEFA-coefficient leagues". Formation blurbs promise tactics the engine doesn't model. |
| 3 | User control and freedom | 2 | No in-app way to abandon a run. On web, one back press fires a browser `alert` and ejects you home. Going back from the draft silently wipes your picks. |
| 4 | Consistency and standards | 2 | Four result screens with four layouts. One tier has three names. Three kinds of back control. 115 raw hex values in UI code despite a token file. |
| 5 | Error prevention | 2 | The draft's slot filtering and OVR previews are excellent. But runs only save when you tap a button, and "Skip, play with no bench" is one irreversible tap. |
| 6 | Recognition rather than recall | 3 | Squad stays visible while you pick. The reroll counter is an unlabeled "3 ⟳". Result rows in the simulation don't look tappable. |
| 7 | Flexibility and efficiency | 2 | Skip All and speed controls exist. Roughly 16 unskippable 2.5-second spins per run, a 2.6-second globe every time, no leaderboard filter. |
| 8 | Aesthetic and minimalist design | 2 | The league result screen stacks ten sections before Play Again. The simulation squeezes two tables side by side on a phone. |
| 9 | Error recovery | 1 | Register never clears its spinner after an error and prints the raw error message. Save failures are swallowed. Players can read "Run the database seeder first." |
| 10 | Help and documentation | 2 | How to Play is thorough but reads like release notes, says "11 real shapes" when there are 12, and hides behind 11px link text. |
| **Total** | | **22/40** | **Acceptable** |

A 22 is honest for a solo project with this much depth underneath. The engine is years ahead of the interface.

---

## Design specificity verdict

**Mostly interchangeable, with four moments that are unmistakably this game.**

Cover the name and the base layer could belong to any dark app:

- **Palette.** `src/theme.ts` is the stock Tailwind grey ramp (`#111827`, `#1F2937`, `#374151`, `#6B7280`, `#9CA3AF`, `#F9FAFB`) with stock Tailwind status colours. The default accent is `#3B82F6` blue, which is neither a perfection colour nor a misery colour.
- **Type.** No typeface at all. Hierarchy comes from weight 900 and letter-spacing on the system font.
- **Surfaces.** One-pixel-bordered rounded cards everywhere, sitting on blue and red radial glows on web.
- **Icons.** 143 emoji glyphs across 25 UI files, many standing in for icons ("📊 View Stats", "🏆 Biggest Win", "😬" empty states).
- **Brand assets.** The app icon, favicon, Android adaptive icon and splash are the untouched Expo template (a blue "A" on a construction grid, a wireframe target). `app.json` still carries Expo's default adaptive-icon background `#E6F4FE`.

The four authored moments prove the ambition is there:

1. The home lockup, PERFECTION / or / MISERY.
2. The slot-machine club spin in the draft.
3. The hand-built orthographic globe that lights up where you land.
4. The Deep Match final and its asymmetric ceremony.

The name's either/or idea never reaches the system itself. League runs are graded on the Perfection-to-Misery ladder; cup runs are graded with plain round names.

**Deterministic scan.** Zero findings on both scans, and that result is **no evidence rather than a pass**. Assessment B proved it: the detector only reads kebab-case CSS and CSS-in-JS template literals. A probe file with the same anti-patterns written as React Native `StyleSheet` objects produced zero findings; the identical rules as CSS produced three. Every style in this codebase is a `StyleSheet`, so the detector was blind here. A meaningful scan needs the rendered web build.

**Visual overlays.** None. No server was running and the browser overlay step was skipped.

---

## Overall impression

The data is deep, the drama is real, and the shell makes both look cheaper than they are. The single biggest opportunity is identity: a game named for two outcomes has one blue accent, no typeface and a template icon. Fix that and half of the "stale" feeling goes with it, because the structure underneath is mostly sound.

---

## What's working

1. **The globe as the moment of fate.** `GlobeReveal` holds the league or nation name back until the globe locks, then lights the country in the mode colour and springs the reveal card in. A random database pick becomes an event. That is exactly what a roguelike's assignment should feel like.
2. **The ceremony's asymmetry.** A win gets a gold wash, an original trophy and confetti. A loss gets a silver medal on a still, drained background and the line "One match away. The medal round your neck is the one nobody wants." Reduced motion is honoured. This is the product's thesis in colour and motion, and it is the best writing in the app.
3. **Decision support in the draft.** Every candidate slot shows the effective OVR, a swap previews "in 84 · out 79", players with no slot sort last and say "no slot", and hidden-rating modes sort by surname so list order can't leak ratings. It turns a genuinely hard problem into something readable, and the UI itself enforces the difficulty rules.

---

## Priority issues

### [P1] Runs only save when the player taps a button

- **What.** `saveCurrentRun()` in `result.tsx` and `persistRun()` in the three cup result screens run only inside Play Again and Home. Closing the app on the result screen loses the run. Failures only reach `console.error`. Guests are never saved at all, yet the register screen promises "Your guest runs stay."
- **Why it matters.** A roguelike with a leaderboard that quietly drops runs breaks trust in the score, the achievements and the career stats in one go.
- **Fix.** Save the moment the result screen mounts (the `savedRef` guard already exists). Show a small "Saved" or "Couldn't save · Retry" state on the verdict. Tell guests plainly that this run won't be kept, and rewrite the register subtitle.
- **Command.** `/impeccable harden`

### [P1] Contrast and legibility fail across the system

- **What.**
  - `textMuted #6B7280` measures **3.67:1** on cards and **3.98:1** on the page background. The comment above it in `theme.ts` claims at least 4.5:1. It is used 240 times, often at 9 to 11px.
  - White on the World Cup accent `#F5C518` is **1.63:1**. On the Champions League accent `#4FA9FF` it is **2.48:1**. On `warning #F59E0B` it is **2.15:1**. (Corrected 15 September 2026; the first version understated all three slightly. Every one still fails.) These are the main buttons of two modes.
  - 181 font sizes in UI code are 10px or smaller, and 17 are 8px or below. The formation dots in the draft are 6px.
- **Why it matters.** The primary actions of two whole modes are barely readable, and so is the draft's central visual.
- **Fix.** Give every accent an `onAccent` ink (dark ink on gold and light blue). Raise muted text to a value that clears 4.5:1. Set an 11px floor for anything a player must read.
- **Command.** `/impeccable audit`, then `/impeccable typeset`

### [P1] The main mode ends without a payoff, and Misery has no design

- **What.** The league result screen gives every tier the same card: an emoji, a title and a cheerleading blurb ("Your name is etched in glory and your fans will celebrate for decades"). The score is never shown on the screen where it is earned. Ten sections come before Play Again. Only cup finals get a ceremony.
- **Why it matters.** Peak-end rule. Most runs are league runs, and they end flat, in a voice that contradicts "Ready to suffer?".
- **Fix.** A league-end verdict beat built on the Ceremony pattern: position counts in, the tier is stamped on, the score appears with its difficulty multiplier. Misery gets its own drained, still treatment. Fold the history, graph and medical table under "Season details". Rewrite the tier copy in the game's own voice (see [`09-COPY-DECK.md`](09-COPY-DECK.md)).
- **Command.** `/impeccable delight` + `/impeccable distill`

### [P1] The brand identity is a template

- **What.** Expo template icon, favicon and splash. A stray nested `expo` block in `app.json` references `players_v4.db` and a background colour that never applies. `userInterfaceStyle` is `"light"` on a dark-only app. Tailwind greys, system font, blue default accent.
- **Why it matters.** The launcher and the browser tab say "unfinished Expo app" before the game says anything.
- **Fix.** The Kit Drop direction in [`04-DIRECTION.md`](04-DIRECTION.md) and the tokens in [`05-STYLE-GUIDE.md`](05-STYLE-GUIDE.md), plus a real mark and icon set.
- **Command.** `/impeccable colorize` + `/impeccable typeset`

### [P1] The match sheet's tab strip stacks vertically on Android

- **What.** In the maintainer's Android screenshots, Facts, Lineup and Stats render one under another inside the sticky header instead of side by side. The strip eats roughly a fifth of the screen on every scroll position.
- **Why it matters.** This is the screen every tap in the app leads to, and it permanently loses its most valuable space.
- **Fix.** Rebuild the sticky tab strip so its row layout survives the sticky-header wrapper on Android, and check it at 360dp.
- **Command.** `/impeccable adapt`

### [P2] The simulation screen is too cramped for a phone

- **What.** `simSplitGrid` sets Live Standings and Matchday Results side by side at a 1.2 to 1 ratio. On a phone that is two cards of roughly 190px each, with 10 to 11px table text. Speed controls are about 20px tall. The standings carry no title, Europe or relegation lines, although the tier is decided entirely by table position.
- **Why it matters.** This is where a player spends the run, and they can neither read it nor feel the stakes rising.
- **Fix.** One focus at a time: a Table / Results switch or a vertical stack. Zone lines tied to the tier thresholds. 48dp targets.
- **Command.** `/impeccable layout`

### [P2] Exits at high-stakes moments are harsh or missing

- **What.** Web back mid-season: `window.alert`, run reset, home. No "Abandon run" anywhere. The draft back button returns to formation select, where Continue calls `startRun()` and wipes every pick. Register locks its spinner after any error.
- **Fix.** An in-app "Abandon run" with a real confirmation screen, reused for web back. Confirm before discarding picks or skipping the bench. Reset loading in the register catch.
- **Command.** `/impeccable harden`

---

## Persona red flags

**Jordan, the first-timer**
- Every new player starts as a guest, so Home's first line is "Playing as Guest / Create an account to save your runs", not the game's pitch.
- Mode select has a tab called "SM (Finals)". The World Cup card still says "Global glory (Not full route for now)".
- Formation select shows 12 cards with 6px position labels. One description ends "PM Special" and contains "behind a two strikers".
- The draft's reroll counter has no label.
- The result screen never shows the score, so the numbers on the Ranks tab mean nothing.

**Casey, the distracted phone player**
- Close the app on the result screen and the run is gone.
- MOVE buttons have 3px vertical padding. Speed buttons, matchday arrows and the LIVE pill are all under 44px.
- By pick 9, the player list sits below eight squad rows and the pitch, with no auto-scroll back to it.
- Run state lives in memory, so an app kill mid-draft loses everything.

**Alex, the power user**
- About 16 spin animations per run with no tap to skip, plus the globe every time.
- Play Again sits at the bottom of a ten-section scroll and still routes through formation select.
- The leaderboard mixes league, UCL and World Cup scores with no filter.
- No keyboard shortcuts on web.

**The friend from the group chat** *(project persona, from PRODUCT.md)*
- Opens a shared web link on a phone. The tab title and preview are blank, the favicon is Expo's. There is no way to link to a specific run or match, because nothing has a URL.
- Watches one run as a guest, closes the tab, and that run never existed.

**The portfolio reviewer** *(project persona)*
- Opens the web build on a laptop: a 480px phone column floating on blue and red glows. The first 60 seconds show a template icon, system type and a dark dashboard. The globe and the Deep Match, the two strongest pieces of craft, are six screens deep.

---

## Minor observations

- A Champions League winner shows as **"WC Champion"** in Home's Best Tier (`TIER_LABEL.winner` in `src/data/tiers.ts`).
- Leaderboard and Runs each define their own `formatTier`, producing "Sf Exit", "R16 Exit" and "Q3 Exit" instead of the shared labels.
- One league tier has three names: "Almost Matters" on Home, "Mid-Table Comfort" on the result card, "almost_matters" in data.
- Achievements shows "Hardest won /10" while its footnote says "0–11 scale".
- Leaderboard and Runs load in `useEffect`, so they never refresh after a new run. Home uses `useFocusEffect` for exactly that reason.
- Simulation result rows are tappable with no chevron and no pressed state.
- Out-of-position OVR in the draft squad list is signalled by amber alone, and Team OVR uses the same amber.
- Guide and About render a back button at the root of a tab.
- Home's recent-run cards open the Runs tab, not the run.
- `paddingTop` of 52, 56 or 64 is hardcoded on 13 screens instead of using safe-area insets.
- The supabase edge function `submit-run` is never called and carries a different tier ladder from the app's own.
- `assets/modes/upscalemedia-transformed.jpeg` (1.65 MB) is referenced nowhere.
- The World Cup mode card uses the official FIFA World Cup 26 emblem, while the ceremony deliberately avoids trademarked trophy shapes.
- About shows version "1.0.0"; `app.json` says 0.0.1.

---

## Questions to consider

1. The game is called Perfection or Misery and its default accent is blue. What if the interface itself leaned toward one pole or the other as the run went?
2. Why does a losing UCL finalist get a designed ceremony, while a relegated league side gets the same card as the champion?
3. Is the score the game's main number? If yes, why isn't it on the result screen?
4. Should the spin be a spectacle on the first pick and a quick reveal after that?
5. With Guide and About folded into Profile, does a four-tab bar tell a clearer story about what this app is?

---

## What happens next

The brief already set the scope (everything, as a plan, no code), so the critique's usual follow-up questions were skipped. Every priority issue above is mapped to a screen in the `07` documents and to a phase in [`11-ROADMAP.md`](11-ROADMAP.md).
