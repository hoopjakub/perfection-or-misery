# 07b · Screens: setting up a run

> Part of the UI overhaul set. Start at [`00-README.md`](00-README.md). Screen block format is explained at the top of [`07a-SCREENS-SHELL.md`](07a-SCREENS-SHELL.md).
> Pitches this area answers: **2 · Setup**, **3 · The draft**, **4 · The draw** in [`04-DIRECTION.md`](04-DIRECTION.md).

The whole area stands on cotton. It's the stockroom: you're choosing, and choosing is reading. The lights come on at the end of it.

The run is six stages, and every setup screen shows where you are among them in the run header: `1 WHERE · 2 HOW HARD · 3 SHAPE · 4 DRAFT · 5 DRAW · 6 SEASON`.

---

## B1 · Where you play (was Mode select)

`app/game/mode-select.tsx`

**Today**
- A three-way segment: "Normal Modes", "Special Modes", "SM (Finals)".
- Mode cards expand in place to reveal a league picker, four difficulty chips, and for Custom two sliders, a ratings toggle and a weighted-picks toggle, all inside one card.
- The World Cup card still reads "Global glory (Not full route for now)". The UCL mode art is a white mark on a light tile; the World Cup art is the official FIFA 26 emblem.
- Continue sits at 40% opacity without saying what's missing.

**Readability, five fixes**
1. Rename the segments to what they contain: "Leagues", "Europe", "World Cup".
2. Remove the developer note from the World Cup subtitle.
3. Name the missing step on the disabled Continue ("PICK A LEAGUE", "PICK A DIFFICULTY").
4. Move difficulty off the mode card onto its own screen (B2), so a card never holds more than its own description.
5. Explain Chaos and Cursed in one plain line each instead of "Placement weighting disabled".

**Redesign, five moves**
1. **A rack of modes.** Full-width garment labels you scroll vertically, one per mode, each carrying its colourway tape, the mode name in the super and one line saying what the run is ("Any club, any season, any league").
2. **Grouped by where the football happens:** Leagues (All Time, League, Chaos, Cursed), Europe (UCL full path, UCL finals), World Cup (finals, and the full route as a coming-soon label in its tricolour).
3. **Picking a mode is one tap and moves you on.** League mode adds one step: the leagues as tags with round flags, then on.
4. **Chaos and Cursed look dangerous.** Their labels wear a hazard edge and their rule sheet is printed on the label ("No rerolls. Ratings hidden. You don't know the position until you pick.").
5. **Plain-text competition names.** Mode art uses the colourway tape and the super, not trademarked emblems (see [`02-VIBECODE-AUDIT.md`](02-VIBECODE-AUDIT.md), TRU-12).

**Wireframe**

```
[cotton]
┌──────────────────────────────────┐
│▌ 1 WHERE · 2 · 3 · 4 · 5 · 6     │  run header
│ "WHERE YOU PLAY"                 │  super.m
│ LEAGUES                          │  tag
│ ┌•──────────────────────────────•┐
│ │▌ ALL TIME                    › │  label, colourway tape
│ │  Any club, any season, any     │
│ │  league.                       │
│ └•──────────────────────────────•┘
│ ┌•──────────────────────────────•┐
│ │╱ CHAOS                       › │  hazard edge
│ │  No rerolls. Ratings hidden.   │
│ └•──────────────────────────────•┘
│ EUROPE                           │
│ ┌•──────────────────────────────•┐
│ │▌ CHAMPIONS LEAGUE · FULL PATH› │
│ └•──────────────────────────────•┘
│ WORLD CUP                        │
│ ┌──────────────────────────────┐ │
│ │▌▌▌ THE FULL ROUTE   SOON     │ │  tricolour, no rivets, not tappable
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

**States** · Default · Returning player (last mode marked with a `LAST TIME` tag) · Coming-soon label (not tappable, no press feedback) · League mode sub-step (league tags).

**Built from** · RunHeader, ModeLabel, ComingSoonLabel, LeagueTag, RoundFlag.

---

## B2 · How hard (new screen, split from mode select)

**Today** · Difficulty lives inside the mode card as four chips plus a hidden Custom panel with two sliders and two toggles.

**Readability, five fixes**
1. Show what each difficulty changes as three short facts, not one sentence: rerolls, ratings, how the AI treats you.
2. Show the score multiplier next to each difficulty, since difficulty changes the score.
3. Label Custom's screw level with its named band (the app already has the names) rather than "Difficulty 7/10".
4. Make the slider steppers 48dp.
5. Stop the reroll slider and screw-level slider from sitting in the same card as two toggles.

**Redesign, five moves**
1. **Four care labels.** Easy, Medium, Hard, Custom, each as a label listing its rules the way a garment lists washing instructions: `REROLLS 3 · RATINGS SHOWN · YOUR MATCHES TILT YOUR WAY · SCORE ×0.8`.
2. **Custom opens its own screen** with three controls, one per row, and a live readout of the resulting hardness and multiplier.
3. **Substitutes join the rule sheet.** Instead of a toggle above the formation grid, "Play with a bench" is a line on the difficulty's rules that Custom can change. It still applies to every club equally, and now it's stated where the rules live.
4. **Weighted picks** (full UCL path) sits on the Custom screen with one line explaining that it narrows spins to the top leagues.
5. **Chaos and Cursed skip this screen.** Their difficulty is their identity, so the stage indicator marks step 2 as `SET`.

**Wireframe**

```
[cotton]
┌──────────────────────────────────┐
│▌ 1 · 2 HOW HARD · 3 · 4 · 5 · 6  │
│ "HOW HARD"                       │
│ ┌•──────────────────────────────•┐
│ │ EASY                   ×0.8   │
│ │ REROLLS 3                     │  tag lines
│ │ RATINGS SHOWN                 │
│ │ YOUR MATCHES TILT YOUR WAY    │
│ └•──────────────────────────────•┘
│ ┌•──────────────────────────────•┐
│ │ HARD                   ×1.4   │
│ │ REROLLS 0 · RATINGS HIDDEN    │
│ │ THE AI LEANS AGAINST YOU      │
│ └•──────────────────────────────•┘
│ ┌──────────────────────────────┐ │
│ │ CUSTOM                     › │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

**States** · Default · Previously used difficulty marked · Custom screen · Chaos/Cursed (skipped, shown as set).

**Built from** · CareLabel, StepControl, Toggle, LiveReadout.

---

## B3 · Your shape (was Formation select)

`app/game/formation-select.tsx`

**Today**
- A substitutes toggle card above everything, then 12 small formation cards whose position dots use 6px labels, then an info card listing each slot's accepted positions.
- Defaults to 4-3-3. Six `console.log` calls fire on Continue.
- One description reads "…behind a two strikers. All out attack. PM Special."

**Readability, five fixes**
1. Raise the position labels on the formation diagrams to 11px and the diagrams themselves to at least 96px wide.
2. Move the substitutes toggle off this screen (it becomes a rule in B2).
3. Correct and shorten every description to one line (see the copy deck).
4. Show the accepted positions only for the selected shape, as tags, not as a list of "accepts: …" text.
5. Remove the console logging.

**Redesign, five moves**
1. **Shirts on a pitch.** The selected formation fills the upper half as a real shape of numbered shirt outlines; the other eleven sit below as a horizontal rack of small diagrams you swipe.
2. **One line of character per shape** in the press voice, no promises about tactics the engine doesn't model.
3. **The shape tells you what the draft will ask for:** "You'll need a CAM and two strikers."
4. **Returning players land on their last shape**, marked `LAST TIME`.
5. **The plate says the shape:** `DRAFT A 4-2-3-1 →`.

**Wireframe**

```
[cotton]
┌──────────────────────────────────┐
│▌ 1 · 2 · 3 SHAPE · 4 · 5 · 6     │
│ "YOUR SHAPE"                     │
│ ┌──────────────────────────────┐ │
│ │        [9]                   │ │  shirt outlines,
│ │  [11]  [10]  [7]             │ │  positions in tag mono
│ │     [8]    [6]               │ │
│ │ [3]  [5]  [4]  [2]           │ │
│ │        [1]                   │ │
│ └──────────────────────────────┘ │
│ 4-2-3-1                          │  super.s
│ Two holding mids and a ten.      │
│ YOU'LL NEED  CDM ×2 · CAM · ST   │  tags
│                                  │
│ ◂ 4-3-3 │ 4-4-2 │▌4-2-3-1│ 3-5-2 ▸│  swipe rack
│ ┌•────────────────────────────•┐ │
│ │    DRAFT A 4-2-3-1   →       │ │
│ └•────────────────────────────•┘ │
└──────────────────────────────────┘
```

**States** · Default (last shape or 4-3-3) · Swiping the rack · Cursed mode (a note that positions are hidden until you pick).

**Built from** · PitchShape, ShirtOutline, FormationRack, Tag, Plate.

---

## B4 · The draft

`app/game/draft.tsx`

**Today**
- Header: "Draft", "7/11 picked", and an unlabelled reroll count with an icon.
- A small pitch of dots with 6px initials, a spin zone, then "Your Squad" listed above the picker, which pushes the player list further down with every pick.
- Picking takes two taps and a modal ("Where does X play?") for every player, even when only one position fits.
- Each spin is a 20-step slot animation (about 2.1 seconds plus a 400 ms fade) with no way to skip.
- "Did you know?" club facts appear above the player list.
- Ratings-hidden modes sort players by surname so the list can't leak OVR, and unavailable players sort last with a "no slot" label. Both are good.

**Readability, five fixes**
1. Label the reroll count ("REROLLS 2").
2. Keep the player list directly under the spin result; collapse "Your Squad" into the pitch so it doesn't grow down the page.
3. Assign automatically when exactly one open position fits, and skip the modal.
4. Enlarge the pitch initials to 11px, and show the effective OVR under each filled position when ratings are visible.
5. Mark out-of-position picks with a stripe as well as amber, so the cost isn't colour-only.

**Redesign, five moves**
1. **The pitch is the screen.** Eleven hangers on a pitch in your shape fill the top half. Empty hangers show their position in the tag mono; filled ones show the player's tag with name and effective OVR. It never scrolls away.
2. **The rack spin** ([`06-MOTION.md`](06-MOTION.md) §5.1). SPIN sits in the thumb zone. The club-season lands as a tag (`BAR · 2011/12`), the squad opens below as a rail of player tags.
3. **One tap to pick.** Tap a player: if one hanger fits, his tag flies there; if several fit, those hangers light and you tap one. No modal.
4. **Moves are drag or tap on the pitch.** Tap a filled hanger to hold it (the zip-tie tag attaches); compatible hangers light, with the in/out OVR shown on each; tap one to swap. Bench players sit on a rail below the pitch and move the same way.
5. **The club fact becomes the club's tag reverse.** Flip the landed club tag to read its fact, so it's there for the curious and out of the way for everyone else.

**Wireframe**

```
[cotton]
┌──────────────────────────────────┐
│▌ 4 DRAFT  7/11   REROLLS 2   ✕   │  run header
│ ┌──────────────────────────────┐ │
│ │        ┌ST┐                  │ │
│ │ ┌Messi 94┐ ┌CAM┐ ┌RW┐        │ │  hangers; filled = player tag
│ │     ┌Xavi 88┐ ┌Busq 86┐     │ │
│ │ ┌LB┐ ┌Pique 87┐┌CB┐ ┌RB┐    │ │  empty = position tag
│ │        ┌GK┐                  │ │
│ │ TEAM OVR 88 ▲2               │ │  tabular, rolls on change
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ BAR · 2011/12        ⟲ FLIP  │ │  landed club tag
│ └──────────────────────────────┘ │
│ SORT  OVR · POS · A–Z            │
│ ┌──────────────┐┌──────────────┐ │
│ │ ST  Villa    │ │ CB  Puyol   │ │  player tags, 2 across
│ │ ESP   OVR 85 │ │ ESP  OVR 84 │ │
│ └──────────────┘└──────────────┘ │
│ ┌──────────────┐┌──────────────┐ │
│ │╱LW  Pedro    │ │ GK  Valdés  │ │  striped edge = no open slot
│ │ NO SLOT      │ │ ESP  OVR 82 │ │
│ └──────────────┘└──────────────┘ │
│ ┌•────────────────────────────•┐ │
│ │           SPIN   ⟳           │ │  thumb zone
│ └•────────────────────────────•┘ │
└──────────────────────────────────┘
```

**States**

| State | Design |
|---|---|
| Before the first spin | Empty pitch, SPIN plate, one line: "Spin a club-season. Pick one player from it." |
| Spinning | Rack animation; tap lands it |
| Picking | Club tag, sort, player rail; the hangers that each hovered player fits are outlined |
| Holding a player (move) | Zip-tie tag on him; compatible hangers show in/out OVR |
| No player fits | A striped notice: "Nobody here fits your open positions." with `SPIN AGAIN` (free, like today) |
| Out of rerolls | REROLLS tag at 0, reroll control hidden, not disabled |
| Ratings hidden | OVRs replaced by `??`; sort offers position and A–Z only |
| Cursed | A position spin first; the chosen hanger pulses once before the club spin |
| XI complete | The pitch full; the rail swaps to "THE BENCH" or straight to the draw if subs are off |
| Leaving mid-draft | Back or ✕ opens a confirmation: `DISCARD 7 PICKS` / `KEEP DRAFTING` |

**Built from** · RunHeader, PitchHangers, PlayerTag, ClubTag (flippable), SortChips, StripedNotice, ZipTag, Plate, ConfirmScreen.

---

## B5 · The bench

Part of `app/game/draft.tsx` today.

**Today** · "Draft Your Bench" with a people icon, "SPIN FOR A SUB →", a nested scrolling list of the sub's club, and a text link "Skip — play with no bench this run" that is one irreversible tap.

**Readability, five fixes**
1. Show bench progress as five slots, not "2/5 subs drafted — 3 more to go".
2. Remove the nested scroll inside the page scroll.
3. Put the skip behind a confirmation with a verb label: `PLAY WITHOUT A BENCH`.
4. State the bench rule once in plain words: subs come on in the second half and score less often.
5. Use the same spin feel and the same player tags as the XI.

**Redesign, five moves**
1. **Five hangers on a bench rail** under the pitch, labelled `SUB 1–5`.
2. **Same spin, same tap-to-pick,** landing on the bench rail.
3. **Swap bench and XI on the pitch** by holding a player, as in B4.
4. **The skip lives on the rule sheet in B2,** so it's a decision made before the draft, not an escape hatch after it. A late skip is still possible from the run header's menu, with confirmation.
5. **A complete squad gets a moment:** the pitch and bench flash their tags in order (40 ms stagger) and the plate becomes `TO THE DRAW →`.

**States** · Bench slots empty · Spinning · Picking · Bench complete · Bench off (screen skipped).

**Built from** · BenchRail, PitchHangers, PlayerTag, Plate, ConfirmScreen.

---

## B6 · The ratings reveal (new beat, hidden-rating runs only)

**Today** · Hard, Chaos, Cursed and hidden-rating Custom runs hide every OVR during the draft, then placement and the simulation header immediately show "Team OVR" and your top five players' OVRs. The secret leaks in a header pill.

**Readability, five fixes**
1. Stop showing Team OVR on placement for hidden-rating runs until the reveal.
2. Stop showing individual OVRs in placement's "Your XI" strip for those runs.
3. Keep the simulation header's Team OVR hidden until the reveal has played.
4. Show `??` consistently wherever a hidden rating would appear.
5. Say once, on the draft, that ratings will be revealed after the squad is complete.

**Redesign, five moves**
1. **A deliberate beat between the draft and the draw.** On nylon, each position's `??` flips to its real OVR in formation order, 60 ms apart.
2. **Team OVR last,** as a super, with a verdict in the press voice: "Blind, you built an 84."
3. **Best and worst pick called out** as tags: `STEAL · PUYOL 84 FOR A CB` / `BLUNDER · A 71 IN GOAL`.
4. **Skippable with one tap,** which lands straight on the full numbers.
5. **It feeds the press.** A blind draft that rates in the top quarter becomes the run's first story.

**States** · Revealing · Revealed · Skipped.

**Built from** · FlipTag, SuperNumber, CalloutTag, Plate.

---

## B7 · The draw (placement for every mode)

`app/game/placement.tsx` (`LeaguePlacement`, `CLPlacement`, `CustomCLPlacement`, `WCPlacement`)

**Today**
- Four separate components with four layouts. The globe reveal is shared and is the best moment in the app.
- League placement shows "Team OVR" and your top five players, a "League Pool" filter in League mode after the league was already chosen, "Where will you land?", then the reveal: league, season, "Replacing X", top three opposition with OVRs coloured red or green.
- Error states say "Run the database seeder first." and "Seed at least 8 clubs to play."
- The UCL draw, custom UCL "Road to the UEFA Champions League" and the World Cup draw each carry their own list styles.

**Readability, five fixes**
1. Replace developer error copy with states a player can act on ("This competition's data didn't load." with `TRY AGAIN` and `CHANGE MODE`).
2. Remove the League Pool filter from League mode, where the league is already chosen.
3. Pair the red and green opposition OVRs with a text comparison ("+4 on you", "−3") so they aren't colour-only.
4. Give the globe's lock a visible pause and skip.
5. Use one layout for "what you got" across all four modes: where, when, who you replaced, the three strongest rivals.

**Redesign, five moves**
1. **One reveal component, four data sources.** The globe (or, for the Champions League, the pot) turns; your fate lands as a riveted label: `YOU'RE "REAL BETIS"` · `LA LIGA 2019/20`.
2. **Your fixtures fill in as fixtures,** not a list: home with the house glyph, away with the plane, first few rounds visible, the rest collapsed.
3. **Everyone else's draw is a list of names you can open,** per The Dugout's broadcast draw: your ties are the foreground.
4. **The run takes your club's colour** at the moment of the reveal: the tape along the top re-dyes to the replaced club's primary colour.
5. **The plate names the next thing:** `WHAT THE PUNDITS THINK →`.

**Wireframe**

```
[cotton → the globe sits on a nylon panel]
┌──────────────────────────────────┐
│▌ 5 THE DRAW                  ⏸   │
│ ┌──────────────────────────────┐ │
│ │ [nylon]                      │ │
│ │          ◐ globe             │ │
│ │                              │ │
│ └──────────────────────────────┘ │
│ ┌•──────────────────────────────•┐
│ │ YOU'RE "REAL BETIS"            │  riveted label, stamp motion
│ │ LA LIGA · 2019/20 · 20 CLUBS   │
│ └•──────────────────────────────•┘
│ STRONGEST RIVALS                 │
│ Barcelona         OVR 90  +6 ON YOU│
│ Real Madrid       OVR 89  +5     │
│ Atlético          OVR 86  +2     │
│ YOUR FIRST FIXTURES              │
│ MD1  ⌂  Villarreal               │
│ MD2  ✈  Sevilla                  │
│ ▸ 36 more                        │
│ ┌•────────────────────────────•┐ │
│ │ WHAT THE PUNDITS THINK  →    │ │
│ └•────────────────────────────•┘ │
└──────────────────────────────────┘
```

**States** · Ready · Spinning (pausable) · Paused · Revealed · Data failed to load · Hidden-rating run (rival OVRs shown as `??` until B6 has played).

**Built from** · Globe, PotDraw, RevealLabel, FixtureRow, CollapsedList, Tape, Plate.

---

## B8 · The pundits' predictions (new)

Borrowed from The Dugout's season preview, sized for one run (see [`03-DUGOUT-COMPARISON.md`](03-DUGOUT-COMPARISON.md) §4).

**Today** · Doesn't exist. The simulation screen shows a "Team OVR" and "Entering the League / Your squad replaces X for this season. Good luck!" card before a START SEASON SIMULATION button.

**Readability, five fixes** *(applied to the current pre-season card while this screen is built)*
1. Replace "Good luck!" with the one fact that matters: where the squad ranks by strength.
2. Show the predicted finish from squad strength as a single number.
3. Show the three clubs closest above and below you.
4. Rename the button to what happens: `START THE SEASON`.
5. Keep hidden ratings hidden (see B6).

**Redesign, five moves**
1. **A predicted table** from squad strength, your row tagged, the zones drawn on it, on cotton.
2. **Two over-achievers and two under-achievers** the pundits expect, as tags with one line each.
3. **Three names to be wrong about:** predicted Player of the Season, top scorer and best under-21.
4. **A verdict line in the press voice:** "The pundits have you 14th."
5. **The lights come on.** `START THE SEASON` cuts the ground to nylon ([`06-MOTION.md`](06-MOTION.md) §4) and the predictions are kept for the verdict to check.

**Wireframe**

```
[cotton]
┌──────────────────────────────────┐
│▌ 6 SEASON · PRE-SEASON           │
│ "THE PUNDITS HAVE YOU 14TH"      │  super.m
│ PREDICTED                        │
│ ▌1 Barcelona                 90  │  zone tapes
│ ▌2 Real Madrid               89  │
│ …                                │
│ ◯14 "YOUR XI"                84  │  orange tag
│ ╱18 Leganés                  76  │
│ THEY'LL SURPRISE                 │
│ Getafe · Villarreal              │
│ THEY'LL DISAPPOINT               │
│ Valencia · Espanyol              │
│ THREE NAMES                      │
│ POTS  Messi · BOOT  Benzema      │
│ U21   Fati                       │
│ ┌•────────────────────────────•┐ │
│ │     START THE SEASON  →      │ │
│ └•────────────────────────────•┘ │
└──────────────────────────────────┘
```

**States** · League run · Champions League (predicted league-phase position and pot) · World Cup (predicted group finish and round reached) · Hidden-rating run (strength column hidden, order still shown).

**Built from** · MiniTable, ZoneTape, CalloutTag, SuperLine, Plate.
