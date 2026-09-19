# 07a · Screens: the shell, Home and everything around a run

> Part of the UI overhaul set. Start at [`00-README.md`](00-README.md).
> Pitches this area answers: **1 · First contact** and **9 · Your record** in [`04-DIRECTION.md`](04-DIRECTION.md).
> Tokens and components: [`05-STYLE-GUIDE.md`](05-STYLE-GUIDE.md), [`08-COMPONENTS.md`](08-COMPONENTS.md). Copy: [`09-COPY-DECK.md`](09-COPY-DECK.md).

**How to read the screen documents.** Every screen gets the same block:

- **Today** — what's there now, with evidence.
- **Readability, five fixes** — changes that make the current screen clearer without changing what it is. Useful on their own if the redesign is phased.
- **Redesign, five moves** — the Kit Drop version of the screen.
- **Wireframe** — low fidelity, structure only. Boxes are regions, not pixel positions.
- **States** — every state the screen must design for.
- **Built from** — the components it uses.

Grounds are marked on each wireframe: `[cotton]` or `[nylon]`.

---

## A1 · The navigation shell

`app/(tabs)/_layout.tsx`, `app/_layout.tsx`, `app/+html.tsx`

**Today**
- Six tabs: Play, Ranks, Profile, Runs, Guide, About. Profile repeats Runs, Guide and About as menu rows.
- The active colour is always the default blue, whatever mode you last played.
- On desktop web the whole app is a 480px column with blue and red radial glows behind it.
- Every screen hardcodes its top padding (52, 56 or 64) instead of reading safe-area insets.

**Readability, five fixes**
1. Cut to four destinations: Play, Runs, Ranks, You. Guide and About move inside You.
2. Replace hardcoded top padding with safe-area insets so content never sits under a notch or cutout.
3. Give each tab a label under its icon at 12px, not 10px.
4. Make the active state more than a colour: a 4px tape above the active tab plus the filled icon.
5. Remove the back buttons that render at the root of Guide and About tabs.

**Redesign, five moves**
1. **A bottom bar on phones, a rail on wide screens.** Under 1024px: a 64dp bar on cotton with ink icons and the orange tape marking where you are. From 1024px: a left rail with the wordmark at the top and the same four destinations.
2. **The run takes over the shell.** Once a run starts, the bar is replaced by the run's own header: the colourway tape, the stage you're on, and an "Abandon run" control that opens a real confirmation screen.
3. **Web gets a real layout.** The phone column and its glows go. Expanded widths use two or three panes (see [`10-ADAPT-OPTIMIZE-A11Y.md`](10-ADAPT-OPTIMIZE-A11Y.md)).
4. **System back always works.** Android's back gesture and the browser's back button step back one screen. During a run, back opens the same Abandon confirmation the header uses, instead of `window.alert` and an ejection.
5. **A branded not-found route** (`app/+not-found.tsx`): `"WRONG PITCH"` in the super, one plate back to Play.

**Wireframe**

```
PHONE [cotton]                          DESKTOP WEB [cotton]
┌──────────────────────────┐           ┌────────┬────────────────────────────┐
│ status bar (inset)       │           │ PoM    │                            │
│                          │           │        │   content (up to 3 panes)  │
│   screen content         │           │ ▌PLAY  │                            │
│                          │           │  RUNS  │                            │
│                          │           │  RANKS │                            │
├──────────────────────────┤           │  YOU   │                            │
│ ▀▀▀▀                     │           │        │                            │
│ PLAY  RUNS  RANKS  YOU   │           │        │                            │
└──────────────────────────┘           └────────┴────────────────────────────┘
 orange tape over the active tab         orange tape beside the active item

IN A RUN [nylon from the season onward]
┌──────────────────────────┐
│▌▌▌▌▌▌▌ colourway tape ▌▌▌│
│ ✕ ABANDON   STAGE 3 / 6  │
│ "THE DRAFT"              │
```

**States**

| State | Design |
|---|---|
| Default | Four destinations, one active |
| In a run | Bar replaced by the run header |
| Offline (web) | A slim striped strip under the header: "Offline. Your run is kept on this device." |
| Update available (web) | A tag in the rail or header: `NEW VERSION · RELOAD` |

**Built from** · NavBar, NavRail, RunHeader, Tape, ConfirmScreen.

---

## A2 · Home (Play)

`app/(tabs)/index.tsx`

**Today**
- Header reads "Playing as Guest / Create an account to save your runs" for every new player, with a blue Sign Up pill.
- A centred PERFECTION / or / MISERY lockup with blue and red text glow.
- A blue START RUN button, a small "New here? Read how to play" link, three stat tiles (Best Score, Best Tier, Total Runs), then recent runs.
- Recent run cards open the Runs tab rather than the run. Guests never see stats because their runs aren't saved.
- A Champions League winner shows as "WC Champion" in Best Tier.

**Readability, five fixes**
1. Lead with the game, not the account: move the guest nudge below the start button as one muted line.
2. Show the real label for every tier (fix `TIER_LABEL.winner`, which says "WC Champion" for any champion).
3. Make each recent-run card open that run.
4. Replace the 😬 empty state with words and an action: "No runs yet." and the start button above it doing the work.
5. Raise "New here? Read how to play" to 13px and give it a visible tap target of 48dp.

**Redesign, five moves**
1. **The poster.** `PERFECTION` in `super.l` italic caps, `MISERY` beneath it on a hazard-striped underline. No glow, no centred symmetry: the lockup sits hard left, the way an advert super sits.
2. **One orange plate in the thumb zone.** `START A RUN →` anchored above the bar. A returning player sees a second, ink-outlined plate beside it: `AGAIN: ALL TIME · HARD`, which restarts with the last mode and difficulty.
3. **Your last three verdicts as garment labels.** Each label: the colourway tape, the tier in the super, club and season in the tag mono, score in tabular figures. Tap opens the run hub.
4. **One number that matters.** Best verdict and best score as a single label ("BEST · CHAMPIONS · 1,842"), not three equal tiles.
5. **The guest line where it's true.** "Runs aren't kept as a guest." with an inline `KEEP MY RUNS` link, shown under the labels only once a guest has finished a run.

**Wireframe**

```
[cotton]
┌──────────────────────────────────┐
│                                  │
│  PERFECTION                      │  super.l, italic
│  MISERY                          │  on a hazard-striped underline
│  ╱╱╱╱╱╱╱╱╱╱╱╱╱╱                  │
│                                  │
│  Draft an XI from real seasons.  │  body.l, muted
│  Find out which one you get.     │
│                                  │
│  LAST RUNS                       │  tag
│  ┌•──────────────────────────•┐  │
│  │▌ "CHAMPIONS"      1,842    │  │  run label, tap → run hub
│  │▌ BAR-11/12 · ALL TIME · HD │  │
│  └•──────────────────────────•┘  │
│  ┌•──────────────────────────•┐  │
│  │▌ "MISERY" ╱╱╱╱     211     │  │
│  └•──────────────────────────•┘  │
│                                  │
│ ┌•───────────────────────•┐┌───┐ │
│ │    START A RUN   →      ││AGN│ │  thumb zone
│ └•───────────────────────•┘└───┘ │
├──────────────────────────────────┤
│ PLAY   RUNS   RANKS   YOU        │
└──────────────────────────────────┘
```

**States**

| State | Design |
|---|---|
| First ever visit | Lockup, the two lines of pitch, START A RUN. No labels section. |
| Returning, has runs | Labels section and the AGAIN plate |
| Guest after a run | The "Runs aren't kept as a guest" line |
| Loading runs | Label outlines in `label` grey, no spinner |
| Couldn't load runs | One striped line: "Couldn't load your runs." with `RETRY` |

**Built from** · Wordmark, Plate (primary, secondary), RunLabel, Tag, EmptyState, InlineError.

---

## A3 · Sign in and create account

`app/auth/login.tsx`, `app/auth/register.tsx`

**Today**
- A "← Back" text glyph instead of the shared back button.
- Register's subtitle promises "Your guest runs stay", but guest runs are never saved.
- After an error, register never clears its spinner and shows the raw error message ("show real error for now").
- A ⚠️ emoji warning about no password recovery; register requires ticking an acknowledgement.
- No password visibility toggle on three password fields.

**Readability, five fixes**
1. Clear the loading state in every error path and show human messages next to the field they belong to.
2. Rewrite the register subtitle to what actually happens (see [`09-COPY-DECK.md`](09-COPY-DECK.md)).
3. Add show/hide to every password field.
4. Replace the emoji warning with a striped notice block and plain words.
5. Use the shared back control.

**Redesign, five moves**
1. **A form that looks like a tag.** Username and password as fields on a `label` grey ground with 1px ink borders and square corners; labels in the tag mono above them.
2. **The no-recovery rule as a hazard notice**, stated once, above the button, with the acknowledgement written as a verb: `I'LL REMEMBER IT`.
3. **One primary plate per screen** (`CREATE ACCOUNT` / `SIGN IN`) in the thumb zone, the switch link above it.
4. **Keyboard-safe layout.** The plate rides above the keyboard on both platforms (the current layout only adjusts on iOS).
5. **Links to the privacy policy and terms** under the button, which a public release needs.

**Wireframe**

```
[cotton]
┌──────────────────────────────────┐
│ ‹                                │
│ "KEEP YOUR RUNS"                 │  super.m
│ Pick a username and a password.  │
│                                  │
│ USERNAME                         │  tag
│ ┌──────────────────────────────┐ │
│ │ your_name                    │ │
│ └──────────────────────────────┘ │
│ PASSWORD                     SHOW│
│ ┌──────────────────────────────┐ │
│ │ ••••••••                     │ │
│ └──────────────────────────────┘ │
│ ╱╱╱ There's no password recovery.│  striped notice
│     Lose it and the account goes.│
│ [ ] I'LL REMEMBER IT             │
│                                  │
│ Already have one? Sign in        │
│ ┌•────────────────────────────•┐ │
│ │       CREATE ACCOUNT         │ │
│ └•────────────────────────────•┘ │
│ Privacy · Terms                  │
└──────────────────────────────────┘
```

**States**

| State | Design |
|---|---|
| Empty | Plate disabled with its missing step named ("ENTER A USERNAME") |
| Field error | That field's edge striped, message under it |
| Username taken | Message under the field, the field keeps its value |
| Submitting | Plate shows a tag-shaped progress bar, fields locked |
| Network error | A striped notice above the plate with `TRY AGAIN`; nothing is cleared |
| Success | Straight back to where you came from, with a `"SAVED"` tag if a run was waiting |

**Built from** · Field, Plate, StripedNotice, Checkbox (square), BackControl.

---

## A4 · You (was Profile)

`app/(tabs)/profile.tsx`

**Today**
- An avatar circle with an initial, "Guest account" or "Registered", a blue CREATE ACCOUNT button for guests.
- Menu rows: My Runs, Achievements, Career Stats, How to Play, About Me, Sign Out.
- Sign Out is one tap on an account that can't be recovered.

**Readability, five fixes**
1. Remove My Runs (it's a destination now) so the menu stops duplicating the bar.
2. Rename "About Me" to "About" (the tab and the screen already disagree).
3. Put Sign Out last and apart from the other rows.
4. Add a short confirmation before signing out that reminds the player there's no recovery.
5. Replace the circle avatar with a square initial tag so it follows the zero-radius rule.

**Redesign, five moves**
1. **An ID tag, not a profile card.** `ID "USERNAME"` in the tag mono, runs played, best verdict, a registered or guest state as a tag.
2. **Three groups:** Your record (Achievements, Career), Help (Guide, About), Account (privacy, terms, sign out, delete account).
3. **Delete account** at the very bottom inside a striped danger zone, with hold-to-confirm, a verb label and a short cooldown. Required for a store release.
4. **Settings that belong to the player, not the world:** reduced motion override, haptics on or off, number format. No toggles that change how the game simulates.
5. **Guests see one plate, `KEEP MY RUNS`,** and nothing that pretends they have a record.

**Wireframe**

```
[cotton]
┌──────────────────────────────────┐
│ "YOU"                            │  super.m
│ ┌──────────────────────────────┐ │
│ │ ID  MARTIN           REG     │ │  tag, square initial
│ │ 47 RUNS · BEST "CHAMPIONS"   │ │
│ └──────────────────────────────┘ │
│ YOUR RECORD                      │  tag
│ Achievements                   › │  rows with rules
│ Career                         › │
│ HELP                             │
│ Guide                          › │
│ About                          › │
│ SETTINGS                         │
│ Reduced motion        SYSTEM  ▾ │
│ Haptics                  [ON]    │
│ ACCOUNT                          │
│ Privacy · Terms                › │
│ Sign out                       › │
│ ╱╱╱╱╱╱╱╱╱ DANGER ╱╱╱╱╱╱╱╱╱╱╱╱╱╱ │
│ Delete my account      HOLD  ▮  │
├──────────────────────────────────┤
│ PLAY   RUNS   RANKS   YOU        │
└──────────────────────────────────┘
```

**States** · Registered · Guest · Signing out (confirmation screen) · Deleting (hold, then cooldown notice) · Couldn't load profile (inline error).

**Built from** · IdTag, ListRow, SectionTag, Toggle (square), DangerZone, HoldToConfirm, ConfirmScreen.

---

## A5 · Guide (was How to Play)

`app/(tabs)/how-to-play.tsx`

**Today**
- Fourteen long prose sections with bold spans, written like release notes ("— now —", "now weigh average rating").
- Says "11 real shapes" when there are 12, and calls the top tier "ULTIMATE PERFECTION" while the rest of the app says "Perfection".
- Mentions "⏸ PAUSE" as an emoji control.
- Reached from a tab, from Profile and from an 11px link on Home.

**Readability, five fixes**
1. Break each section into short paragraphs and lists; cap every paragraph at three sentences.
2. Correct the facts (12 formations, the tier names the app actually uses).
3. Put a table of contents at the top that jumps to each section.
4. Replace emoji control references with the real icons.
5. Remove changelog language ("now", "new") so the guide describes the game, not its history.

**Redesign, five moves**
1. **Organised by what you're doing, not by feature:** Start a run · The draft · Where you land · The season · The verdict · Reading a match · Difficulty and score.
2. **Collapsible sections** with the first one open, so the guide is one screen tall until you ask for more.
3. **Show, don't describe.** Each section carries one small live example built from real components: a tier ladder with every label, a W/D/L strip, a zone legend, a rating scale.
4. **Contextual entry points.** A `?` tag on the draft, the table and the verdict opens the guide at the matching section instead of the top.
5. **Reading layout on wide screens:** a 66-character column with a sticky contents list beside it.

**States** · Collapsed · A section open · Opened from context (scrolled to its section, highlighted briefly).

**Built from** · Accordion, TierLadder, ResultStrip, ZoneLegend, RatingScale, ContextHelpTag.

---

## A6 · About

`app/(tabs)/about.tsx`

**Today**
- A spinning globe with Slovakia lit, "Made in Slovakia 🇸🇰", the maintainer's story, a technical "Under the hood" list, "Built with", a version number.
- Tapping the version eight times reveals the Quick Sim Tester, in production builds too.
- Shows version 1.0.0; the app config says 0.0.1.

**Readability, five fixes**
1. Read the version from the app config.
2. Tighten the story paragraphs; the humanizer pass in [`09-COPY-DECK.md`](09-COPY-DECK.md) keeps every fact and cuts the puffery.
3. Turn "Under the hood" into a scannable list of five lines, not paragraph-length bullets.
4. Make the 38-0.app credit a proper link row.
5. Use a round flag asset instead of the emoji.

**Redesign, five moves**
1. **The maker's label.** The globe stays (it's authored work and belongs here) under a garment label: `MADE BY` · name · `SK` round flag · `SOLO` tag.
2. **The story in the press voice**, set as a short article at reading measure.
3. **Credits as a tag list:** data sources, inspiration, libraries.
4. **The tester moves behind a developer build flag.** Release builds keep the eight-tap easter egg only if it can't write anything, which it already guarantees.
5. **A version tag with a changelog link** (`V 0.1.0 · WHAT'S NEW`).

**States** · Default · Developer build (tester visible after the taps).

**Built from** · Globe, MakerLabel, ArticleBody, TagList, VersionTag.
