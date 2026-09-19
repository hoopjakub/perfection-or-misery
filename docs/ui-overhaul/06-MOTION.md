# 06 · Motion and feel

> Part of the UI overhaul set. Start at [`00-README.md`](00-README.md). World and tokens: [`04-DIRECTION.md`](04-DIRECTION.md), [`05-STYLE-GUIDE.md`](05-STYLE-GUIDE.md).
> Status: provisional values, to be tuned on a real mid-range Android phone in the first build.

Motion here has four jobs and no others: acknowledge a touch, explain a change of state, keep you oriented when the screen changes, and carry the handful of moments this game exists for. If removing an animation would lose nothing but decoration, it goes.

---

## 1. The motion thesis

| | |
|---|---|
| **Focal moments** | The verdict being stitched on. The draft's rack spin. The lights coming on when the season starts. The zip-tie tag swinging onto what you picked. |
| **Continuity** | Drilling from a row into its match, player or club. Table rows changing position. Moving from setup to the season. |
| **Feedback** | Every plate press, every pick, every goal for your side, every drop into a relegation place. |
| **Budget** | Transforms and opacity on the UI thread, 60fps on a mid-range Android phone. No state update per animation frame. Loops stop when the screen is hidden. |

---

## 2. Character

The reference is a 2014 boot advert, so the motion is fast, physical and certain. It borrows the attitude, not the chaos: cuts land on purpose, nothing wobbles for fun.

- **Serious by default.** Springs with no bounce for everything functional. This is the same call as Linear's interface: the precision is the brand.
- **One overshoot in the whole app.** The zip-tie tag swings when it attaches. Everything else settles.
- **Cuts are allowed.** Between scenes a hard cut with a short content fade is more in character than a slide.
- **Scale carries weight.** Big moments arrive oversized and settle to their size. Small interactions never scale beyond a press.
- **Enter slower, leave faster.** Exits take about two thirds of their entrance.
- **Direction means something.** Home-side events come from the left, away-side from the right. Drilling in moves forward; going back moves back.

The test from the brief applies. With the logo hidden, the combination of square plates, the stripe, the tag swing and the stitched verdict should still say which app this is.

---

## 3. Tokens

### 3.1 Springs

Values follow the response and damping model from Apple's "Animate with Springs" (WWDC23): response is roughly the time to settle, damping ratio 1.0 means no bounce. In Reanimated 4 these map to `withSpring(value, { duration, dampingRatio })`; confirm the exact config keys against the installed version in the first build.

| Token | Response | Damping | Used for |
|---|---|---|---|
| `spring.snap` | 300 ms | 1.0 | Presses, toggles, tab tape, chips, small layout changes |
| `spring.settle` | 450 ms | 1.0 | Route transitions, a tag flying to its position, table reorders |
| `spring.throw` | 400 ms | 0.85 | Anything released from a gesture: flicking the rack, scrubbing the season strip. Keeps the finger's velocity |
| `spring.stamp` | 250 ms | 0.9 | A label landing from oversize: the verdict, a score change, a spin landing |
| `spring.swing` | 600 ms | 0.55 | The zip-tie tag. Nothing else |

Springs are interruptible and keep velocity when retargeted, which is why they replace the current fixed-duration timings. A player who taps again mid-animation should never wait for the first animation to finish.

### 3.2 Durations for non-spring motion

| Duration | Use |
|---|---|
| 80 ms | Plate press travel |
| 120 ms | Content fade on a scene cut |
| 150–250 ms | Save chip, a tag's colour change, the tab tape |
| 300–450 ms | Staggers (total), stripe draws on small elements |
| 500–900 ms | Authored beats: count-ins, the Misery stripe pull, award reveals |

### 3.3 Stagger

- Lead with the most important element, then 40–60 ms between siblings.
- **Cap the total stagger at 400 ms.** A 20-row table staggers its first 8 rows and the rest arrive together.
- Only lists that appear as lists stagger. Sections of a scrolling page never do.

---

## 4. Scene grammar

How the screen changes when you move.

| Movement | Treatment | Why |
|---|---|---|
| Switching destinations (Play, Runs, Ranks, You) | Hard cut, content fades in over 120 ms | Peers, not a hierarchy. Material's fade-through, made faster |
| Going deeper (a row into its match, player, club, story) | The row expands into the new page (container transform); fallback is a 24px forward slide with fade on `spring.settle` | The thing you tapped becomes the page, so you never lose your place |
| Going back | The reverse, at two thirds of the time | Leaving should feel quicker than arriving |
| Stepping through setup (mode → difficulty → shape) | Shared-axis slide on the horizontal axis | A sequence, so it moves like one |
| **Lights on** (setup to the season) | One-frame cut from cotton to nylon. The colourway tape draws across the top in 250 ms. The table staggers in | The run changes scene, and it should feel like it |
| Back to cotton (verdict to run hub) | A 200 ms crossfade | The emotional part is over |

On web, drill-in and back use the View Transitions API where the browser supports it, with the same fallback.

---

## 5. Signature sequences

### 5.1 The rack spin (draft)

The current spin sets React state twenty times over about 2.1 seconds, then fades a card in over 400 ms, and it can't be skipped. Sixteen of those per run is where Alex gives up.

**The redesign.**

```
0 ms      tap SPIN · light haptic
0–900     a strip of 12 pre-rendered club-season tags whips past right to left,
          accelerating then braking; a horizontal skew (max 8°) and motion blur
          sell the speed
900–1400  the last three tags slow enough to read
1400      the landed tag snaps into the frame · spring.stamp · medium haptic
1400–1700 the squad opens below as a rail of player tags, staggered 40 ms
```

- **The first spin of a run** plays in full.
- **Every later spin** is 450 ms of whip and the snap. A tap during the whip lands it immediately.
- **Implementation.** One animated translate on a strip that's built once, driven on the UI thread. The landed club is decided before the animation starts, as it is now. No per-tick state.
- **Reduced motion.** The landed tag fades in over 150 ms. No strip, no blur.

### 5.2 Picking a player

```
tap a player tag
0–350     the tag lifts off the rail and flies on a short arc to the only
          hanger he fits · spring.settle
350       it hooks on · the zip-tie tag attaches and swings · spring.swing
          · light haptic
350–600   Team OVR rolls to its new value (tabular figures, 250 ms)
```

If more than one position fits, the eligible hangers light first and the flight starts from your tap on one. Out-of-position picks land with a thin stripe on the tag's edge and the reduced OVR already showing, so the cost is visible at the moment of the choice.

### 5.3 The draw

- The globe keeps its current reveal on a run's first placement. After that it runs at half length, and a tap locks it.
- Your label lands with `spring.stamp`.
- Your fixtures fill in beneath as fixtures, staggered 50 ms, total capped at 400 ms. Everyone else's arrive as collapsed names with no motion.
- A pause control is always visible. Paused means frozen exactly where it is.

### 5.4 The live table

- Row reorders use Reanimated layout transitions (`Layout` on each row, keys stable), `spring.settle`. The project already learned that `LayoutAnimation` breaks inside a `ScrollView`.
- Your row carries the orange tag, so your movement is always the one you see.
- **Crossing a zone line** gets one beat: the zone's tape and code slide under your row once, 300 ms. Dropping into the relegation zone adds a warning haptic. Climbing into Europe or the title place adds a success haptic. Nobody else's movement makes a sound or a buzz.

### 5.5 The ticker

- The run's press scrolls along the bottom of the season screen at a constant 40 px per second. A ticker is a machine, so linear motion is correct here and nowhere else.
- Touching it pauses it and opens the story.
- It stops when the screen is hidden and doesn't run at all under reduced motion, where the latest headline sits still.

### 5.6 Goals

- The score changes with a hard cut on the digit, which lands from 1.15 scale on `spring.stamp`.
- The scorer line slides in from the scoring side: home from the left, away from the right.
- Your side's goals get a medium haptic. Nothing else does.
- A disallowed or missed moment (a saved penalty) uses no celebration motion at all.

### 5.7 The verdict

The focal moment of the whole app.

```
nylon ground, silence
0–700     final position counts in from the bottom of the table · tabular
          figures · decelerating
700–900   a held beat. Nothing moves.
900       the label drops from 1.35× and lands · spring.stamp · heavy haptic
```

**If it's the good end of the ladder:** at the moment of landing a single full-bleed volt frame cuts in for 80 ms, the advert's flash cut, and then the label sits in volt. The score arrives below with its difficulty multiplier. The existing confetti is kept but redrawn as falling kit tags and tape offcuts in the brand colours, capped at 40 pieces.

**If it's Misery:** no flash and no particles. The label lands in ink, then a hazard stripe is pulled across it left to right over 500 ms, linear, like tape off a roll. Then nothing moves. The stillness is the point, and it's what the current Ceremony already gets right for a lost final.

**Reduced motion:** the position appears, the label appears, the stripe is simply there. The outcome is identical.

### 5.8 Awards Night

- Each award is a cut: the category in the super, a held beat of 600 ms, the winner's tag.
- The last three (the podium for Player of the Season) hold for 900 ms each.
- Pause and skip are always visible. Skipping jumps to the complete list, which stays readable.

### 5.9 Sharing a verdict

The label lifts off the verdict screen and slides up into the system share sheet on `spring.settle`. On web, the same label becomes the link preview.

---

## 6. Microinteractions

Each one has to survive its hundredth use. If it would annoy a friend on their twentieth run, it's cut.

| Interaction | Motion | Haptic |
|---|---|---|
| Press a plate | Travels 2 px into its offset, 80 ms; releases on `spring.snap` | Light (primary plates only) |
| Press a row | Background steps to the pressed tone, no movement | None |
| Toggle | A square `ON`/`OFF` plate flips its fill, `spring.snap` | Selection |
| Change tab | The tape under the tab slides to the new one, `spring.snap` | None |
| Scrub the season strip | Follows the finger; `spring.throw` on release; rubber-bands at both ends | Selection tick per matchday |
| Sort or filter chip | Instant fill change | Selection |
| Save confirmed | A `"SAVED"` tag slides in, holds 1.5 s, fades | None |
| Save failed | The tag appears striped with `RETRY`; it stays until handled | Warning |
| Field error | The field's edge becomes a stripe and the message appears under it. **No shake.** | Warning |
| Long lists | Native overscroll and rubber-banding, never a hard stop | None |

---

## 7. Haptics map

Using `expo-haptics`, already installed. Native only; web gets none. Respect the system setting.

| Pattern | When |
|---|---|
| Selection | Scrub ticks, chips, toggles |
| Impact light | Primary plate press, a tag attaching |
| Impact medium | A spin landing, your side scores |
| Impact heavy | The verdict landing, the final whistle of the Deep Match |
| Notification warning | You drop into the relegation zone; a save fails |
| Notification success | Perfection; promotion into a title or Europe place at the final whistle |

A run should produce a handful of heavy and warning haptics, not dozens. If a playtest feels buzzy, the map is wrong.

---

## 8. Reduced motion

Read once through Reanimated's reduced-motion hook (or `AccessibilityInfo.isReduceMotionEnabled` where a hook isn't available) and pass it down.

- Every transition becomes a crossfade or an instant cut, as Android's own guidance asks.
- Springs resolve instantly.
- Loops (ticker, confetti) don't start.
- **No outcome ever depends on motion.** The spin still lands, the verdict still says Perfection or Misery, the stripe is still there.

---

## 9. Tools

| Option | Decision | Reason |
|---|---|---|
| **Reanimated 4 + Gesture Handler + react-native-svg** | **Use for everything** | All three are installed. They cover springs, gestures with velocity, layout transitions and the stripe pattern, on native and web. |
| RN `Animated` | Retire gradually | The current screens use it; new work shouldn't add more. |
| Lottie | Don't add | Timeline files can't read tokens, so every colourway would need its own file. |
| Rive | Revisit after the first build | Its state machines would suit the tag swing and the verdict reacting to Perfection or Misery. It also adds a native module and a web runtime. Only worth it if the Reanimated tag swing looks stiff on a real phone. |
| Audio | Not in scope | The Deep Match ruled it out for good reasons (device mute, autoplay rules), and the same applies everywhere. |

---

## 10. Checking it

Before any motion ships:

- [ ] Every animation above explains feedback, state or continuity, or is one of the named focal moments.
- [ ] Tapping mid-animation interrupts it; nothing makes the player wait.
- [ ] The fifteenth spin of a run takes under half a second.
- [ ] 60fps on a mid-range Android phone during the spin, the table reorder and the ticker (measure with the performance monitor, don't assume).
- [ ] With reduced motion on, a full run can be played and every outcome is still shown.
- [ ] Loops stop when the app goes to the background or the screen loses focus.
- [ ] Haptics fire only where the map says, and not at all on web.
