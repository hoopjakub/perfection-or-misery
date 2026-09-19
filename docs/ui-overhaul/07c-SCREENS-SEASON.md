# 07c · Screens: the season, the knockouts and the final

> Part of the UI overhaul set. Start at [`00-README.md`](00-README.md). Screen block format is explained at the top of [`07a-SCREENS-SHELL.md`](07a-SCREENS-SHELL.md).
> Pitches this area answers: **5 · The season**, **6 · The final**, **7 · The verdict** (its lead-in) in [`04-DIRECTION.md`](04-DIRECTION.md).

The lights are on. Everything in this document stands on nylon. It's where things happen to you, and where the player spends most of a run.

Three rules hold across every screen here:

1. **Nothing you haven't reached is shown.** Your match resolves before the rest of its round; a final's scoreline never appears before the Deep Match.
2. **The primary button names the next thing.** `PLAY MATCHDAY 12`, `WATCH YOUR TIE`, `OPEN THE DRAW`, `WATCH THE FINAL`.
3. **One focus at a time on a phone.** The table or the results, never both squeezed side by side.

---

## C1 · The league season

`app/game/simulation.tsx` (`LeagueSimulation`)

**Today**
- A progress card (matchday count, Play/Pause, Skip All, speed), then **Live Standings and Matchday Results side by side** at a 1.2 : 1 split. On a phone that's two columns of about 190px with 10–11px text.
- No zone lines on the standings, although the tier depends entirely on position.
- Your position change shows as a small ↑↓ number.
- Result rows open the match sheet but have no chevron and no pressed state.
- A matchday scrubber (‹ › LIVE) lets you look back.

**Readability, five fixes**
1. Stack the table and the results vertically, or put them behind a two-way switch; never side by side under 600px.
2. Draw zone lines with codes and a one-line legend.
3. Add a chevron and a pressed state to every tappable result row.
4. Make speed, pause, skip and the matchday arrows 48dp.
5. Show your position as a large tabular figure with its change, not a small arrow beside a row.

**Redesign, five moves**
1. **Your table under floodlights.** Full width, T3 rows, zone tapes and codes on the leading edge, your row carrying the orange tag. The row slides when positions change ([`06-MOTION.md`](06-MOTION.md) §5.4); crossing a zone line gets one beat.
2. **The round lands after your match.** Your fixture resolves first as a scoreline super at the top; the rest of the round follows as a results list you can open.
3. **Your season as a strip.** A continuous row of W/D/L labels along the top, one per matchday so far, scrubbable, replacing the paged chips.
4. **The ticker.** The run's press scrolls along the bottom as stories are written: "Four clubs, three points, one relegation place." Tap to read.
5. **Controls in the thumb zone:** `PLAY MATCHDAY 13` as the orange plate; pause, speed and skip-to-end as ink controls beside it. Skip-to-end asks once: `SKIP TO THE LAST DAY`.

**Wireframe**

```
[nylon]
┌──────────────────────────────────┐
│▌▌▌▌▌ Real Betis colourway tape ▌▌│
│ 6 SEASON · MD 12/38          ✕   │
│ W W D L W W D W L W D W          │  season strip, scrubbable
│ ┌──────────────────────────────┐ │
│ │ ⌂ BETIS  2 – 1  SEVILLA      │ │  your result first, super
│ │ Fekir 23' · Canales 71'      │ │
│ └──────────────────────────────┘ │
│ TABLE              RESULTS       │  switch, tape under active
│ ▌CHAMP 1 Barcelona   12  +18  28 │
│ ▌UCL   2 Real Madrid 12  +15  27 │
│ ▌UCL   3 Atlético    12  +9   24 │
│ ▌UCL   4 Sevilla     12  +6   22 │
│ ┆UEL   5 Getafe      12  +4   21 │
│ ◯      6 "YOUR XI"   12  +5   21 │  orange tag, tabular figures
│ …                                │
│ ╱DOWN 18 Leganés     12  -9   10 │
│ CHAMP · UCL · UEL · UECL · DOWN  │  legend
│ ▸ "Four clubs, three points…"    │  ticker
│ ┌•──────────────────────┐ ⏸ ▸▸  │
│ │  PLAY MATCHDAY 13  →  │        │
│ └•──────────────────────┘        │
└──────────────────────────────────┘
```

**States**

| State | Design |
|---|---|
| Before matchday 1 | Table in predicted order, greyed figures, `PLAY MATCHDAY 1` |
| Playing (auto) | Plate becomes `PAUSE`; strip and table update per round |
| Paused | Everything frozen, plate `CONTINUE` |
| Looking back | Strip scrubbed to an earlier matchday; a `BACK TO LIVE` tag; table shows that matchday's standings |
| Your match pending in a round | Rest of round hidden, "Your match first" |
| Zone crossed | One-beat tape under your row, haptic per the map |
| Season over | The strip complete; plate `TO THE AWARDS →` |
| Abandon | ✕ opens the confirmation screen |

**Built from** · RunHeader, Tape, SeasonStrip, ScorelineSuper, SegmentSwitch, LeagueTable, ZoneTape, ZoneLegend, ResultRow, Ticker, Plate, ConfirmScreen.

---

## C2 · The Champions League league phase

`app/game/simulation.tsx` (`CLSimulation`, league phase), and the same phase inside `custom-ucl-simulation.tsx`

**Today**
- A review screen with "Your squad plays 8 games in a 36-team single league table", a list of your fixtures with pots, and your lineup pitch.
- During play, the same side-by-side table and results as the league, with a locked "SLOW" speed badge.
- Zones described in text ("1-8 → R16 direct · 9-24 → Playoff · 25-36 out").

**Readability, five fixes**
1. Draw the three zones (top 8, 9–24, 25–36) as tapes with codes instead of a text line.
2. Stack table and results.
3. Show each fixture's pot as a numbered tag next to the opponent.
4. Explain "SLOW" (it's the only speed during the league phase) or remove the badge.
5. Keep your row visible when the 36-club table scrolls: pin it at the bottom when it's off screen.

**Redesign, five moves**
1. **The same season screen as C1,** with the league phase's own zones: `R16` (volt tape), `PLAYOFF` (cobalt dashed), `OUT` (stripe).
2. **Your eight as fixtures on a strip,** with pot tags and home/away glyphs, filling in as they're played.
3. **A pinned "you" row** at the bottom edge whenever your real row is scrolled out of view.
4. **The ticker writes cup-shaped stories:** "Eleven clubs on 10 points, and only one of them can be 8th."
5. **The phase ends with its own cut:** the table freezes, the zones stamp their codes once, and the plate reads `OPEN THE KNOCKOUT DRAW`.

**States** · Review (fixtures before play) · Playing · Paused · Looking back · Your position out of view (pinned row) · Phase complete, direct to R16 · Phase complete, into the playoff · Phase complete, out (the verdict follows, no knockouts for you).

**Built from** · As C1, plus PotTag, PinnedRow.

---

## C3 · The World Cup group stage

`app/game/simulation.tsx` (`WCSimulation`), `src/components/WCGroupModal.tsx`

**Today**
- "The Group Draw": groups listed with yours highlighted, "top 2 + 8 best 3rd-placed reach the Round of 32", then "Drawing groups..." and START WORLD CUP SIMULATION.
- Your group matches play live on the clock; others arrive as "LATEST" results.
- "Group Stage Complete" shows your group, all groups (each opening a modal), the best third-placed table, and CONTINUE TO KNOCKOUTS.

**Readability, five fixes**
1. Say "Top two go through. The eight best third-placed teams also go through." as two short lines.
2. Show the third-place race as a live table during the group stage, not only at the end.
3. Turn the group modal into a route (see [`03-DUGOUT-COMPARISON.md`](03-DUGOUT-COMPARISON.md) §5 and The Dugout's POM-REFERENCE §1.8).
4. Add round flags next to every nation name in tables, not only in some rows.
5. Label "LATEST" results with their group ("GROUP F").

**Redesign, five moves**
1. **The draw as a broadcast** (B7's reveal): pots, your group landing, your three fixtures filling in; the other eleven groups collapsed as flag strips.
2. **Your group is the table.** Four rows, zone tapes for `THROUGH` and `3RD RACE`, your row tagged; your three matches play live on the clock above it.
3. **The third-place race gets its own strip:** all twelve third-placed teams ranked, with a cut line at eight, updating as results land. This is the World Cup's real drama and today it only appears at the end.
4. **Other groups as a scrollable wall of mini tables,** each tap opening its group page.
5. **The group stage ends on your fate first:** `THROUGH AS WINNERS`, `THROUGH IN THIRD`, or `OUT` stamped over your group, then the bracket preview.

**States** · Draw · Your match live · Between your matches · Group complete: through · Group complete: waiting on third-place results · Out (the verdict follows) · Looking at another group.

**Built from** · RevealLabel, PotDraw, GroupTable, ThirdPlaceStrip, MiniTableWall, LiveMatchCard, StampLabel.

---

## C4 · The full Champions League path

`app/game/custom-ucl-simulation.tsx`

This mode is the deepest in the game: a real domestic season, every European league simulated, a qualifying ladder, then the league phase and knockouts.

**Today**
- **Domestic review:** "The field by squad strength · badges show what each finish earns", a table with OVR, KICK OFF THE SEASON →.
- **Domestic season:** live standings with split-league groups ("◆ CHAMPIONSHIP GROUP", "RELEGATION / EUROPE GROUP"), ⏩ Skip All.
- **World:** "Europe's Seasons Conclude / Every league simulated for real · tap any league to inspect its full table".
- **Qualifying:** "Two-legged ties · tap any tie for legs, extra time & shootouts", with live ties; an "ELIMINATED" screen if you go out.
- Then the league phase and knockouts as C2 and C5, with a leagues browser modal.

**Readability, five fixes**
1. Show the whole road at the top of every phase as five stages (`DOMESTIC · EUROPE'S SEASONS · QUALIFYING · LEAGUE PHASE · KNOCKOUTS`) with the current one marked.
2. Replace "badges show what each finish earns" with the actual berths drawn on the table ("1st → league phase", "2nd → Q3").
3. Replace the ⏩ emoji with the skip icon and name it (`SKIP TO THE LAST DAY`).
4. Make the split-league explanation a one-line `?` tag instead of a heading symbol.
5. Turn the leagues browser into a route listing every league with its champion and your country's berths.

**Redesign, five moves**
1. **The road is the header.** A tape of five stages across the run header; completed stages stamp `DONE`, the current one carries the orange tag.
2. **Berths drawn on the domestic table** as tapes with codes (`LP`, `Q3`, `Q2`, `UEL`), so your target is visible before a ball is kicked.
3. **"Europe's seasons" as a wall of champions:** 53 league labels, each with its champion's tag and flag, ending with "and you" at your league.
4. **The qualifying ladder as a vertical track** of rounds with your ties on it, byes marked, the live tie playing on the clock at its rung.
5. **Elimination is a verdict, not an error screen:** `OUT IN Q2` stamped on striped nylon, one line of press, and `SEE HOW IT ENDS` to follow the tournament without you.

**States** · Domestic review · Domestic season (plain or split format) · Europe's seasons · Qualifying (each round, live tie, between ties) · Eliminated in qualifying · Not qualified at all · Into the league phase (continues as C2).

**Built from** · RoadTape, LeagueTable with BerthTape, ChampionWall, QualifyingTrack, LiveMatchCard, StampLabel, LeagueIndex route.

---

## C5 · The knockouts

`app/game/simulation.tsx` (`KnockoutPhaseView`), `src/components/BracketPreview.tsx`, `src/components/LiveMatch.tsx`, `src/components/KnockoutRoundsView.tsx`, `src/components/PenShootout.tsx`

**Today**
- A bracket preview you can pinch, pan and double-tap to fit, with your tie highlighted and "PLAY IT OUT →". The Dugout's plan calls this bracket the reference for its own.
- Rounds reveal one at a time; your tie plays live on the clock (Leg 1, Leg 2, extra time, penalties kick by kick) with a pause control, then the rest of the round appears.
- From the first revealed round, `SKIP TO FINAL →` appears if you're in the final; the final itself hands off to the Deep Match.
- The live card uses ⏸ and ▶ glyphs as its pause control and 🟥 / ⚽ / 🥅 in the feed.

**Readability, five fixes**
1. Replace the glyph controls and feed emoji with icons.
2. Show the aggregate score as the largest number during a second leg.
3. Name the round and leg in the card header in the tag mono (`QF · LEG 2 · 67'`).
4. Mark "your" tie in every round list with the orange tag, not a border colour.
5. Keep the bracket preview's fit-to-screen as the default on every open, with a visible "fit" control.

**Redesign, five moves**
1. **The bracket keeps its interaction and gets the world:** square ties, flags, your path drawn as an orange line through the rounds you've won, unknown slots as `?` tags.
2. **Your tie is a match card under floodlights.** Scoreline super, aggregate beneath it, a clock, the scorer lines sliding in from each side ([`06-MOTION.md`](06-MOTION.md) §5.6).
3. **Penalties as a row of kit tags,** filled or striped per kick, revealed one by one, pausable.
4. **Going out is a verdict.** The tie ends, the round's other results appear, and `OUT IN THE QUARTER-FINALS` stamps over the bracket with the orange path ending there.
5. **The primary button always names the next tie** (`WATCH YOUR SEMI-FINAL`), and `SKIP TO THE FINAL` sits beside it whenever you're in the final.

**States** · Bracket preview · Your tie live (leg 1, leg 2, extra time, penalties) · Paused · Round complete · Through · Out · At the final (hands to C6).

**Built from** · Bracket, BracketPath, MatchCard, AggregateLine, PenaltyTagRow, StampLabel, Plate.

---

## C6 · The Deep Match

`app/game/deep-match.tsx`, `src/engine/deep-match.ts`, `src/components/Ceremony.tsx`

**Today**
- Three beats: team sheets (spoiler-free pitch and bench), live playback at half a second per minute with pause and skip, then a win or loss ceremony.
- Header scorers, the shared timeline, live lineups with moving ratings, a momentum graph that doesn't give away extra time, and a stat grid labelled by side.
- The ceremony: gold wash, original SVG trophy and confetti for a win; a silver medal on a drained screen for a loss. No audio. Reduced motion honoured.
- It shares the generic dark look of the rest of the app.

**Readability, five fixes**
1. Raise the stat grid's labels and values to 13px.
2. Put the clock and the scoreline in one unit so the eye reads them together.
3. Replace ⏸/▶ style controls with icons and 48dp targets.
4. Add a commentary line under the scoreline, assembled from the event fields the sheet already has.
5. Label the momentum graph's two halves with the team names at the ends, not only in the legend.

**Redesign, five moves**
1. **Team sheets as a kit wall.** Eleven shirt tags per side in formation, numbers and names only, the bench hanging below. The moment before the lights.
2. **The scoreline as a super** across the top, the clock as a tag beside it, and one line of commentary beneath ("68' · Fekir cuts inside and shoots over").
3. **Momentum as a strip of stitches,** home above and away below the seam, drawn up to the current minute, rescaling only when extra time actually starts.
4. **The final whistle is a cut to silence:** everything stops, the ground holds for a beat.
5. **The verdict is stitched on** ([`06-MOTION.md`](06-MOTION.md) §5.7): a volt `"CHAMPIONS"` label with the flash cut, or a `"RUNNERS-UP"` label with the stripe pulled across it. Trophy and medal stay original drawings, redrawn in the plate-and-rivet grammar.

**States** · Team sheets · Live · Paused · Skipped to the whistle · Extra time · Penalties · Ceremony: won · Ceremony: lost · Handing off to the verdict (spinner replaced by the Awards Night cut).

**Built from** · KitWall, ScorelineSuper, ClockTag, CommentaryLine, MomentumStrip, Timeline, StatBar, VerdictStitch, Trophy, Medal.

---

## C7 · Awards Night (new)

Borrowed from The Dugout's ceremony, sized for one run (see [`03-DUGOUT-COMPARISON.md`](03-DUGOUT-COMPARISON.md) §4).

**Today** · Player of the Season and Best U21 exist as lists on the stats screen. Nothing marks the moment they're decided.

**Readability, five fixes** *(to the current award cards while this beat is built)*
1. Replace 🏆 and 🌟 in the award titles with icons.
2. Show the winner of each award as the largest line, with the runners-up muted below.
3. Explain the score in one line ("goals, assists, ratings and how low the club finished").
4. Mark your drafted players in the lists with the orange tag.
5. Show Best U21 eligibility ("21 or under this season").

**Redesign, five moves**
1. **A count-down on nylon** between the final whistle and the verdict: Team of the Season, Golden Boot, Golden Glove, Best U21, then Player of the Season, podium in reverse.
2. **Each award is a cut:** the category in the super, a held beat, the winner's tag. Pausable and skippable throughout.
3. **Team of the Season picked by line** in the league's most common shape, drawn as a kit wall, with your players tagged.
4. **Three pundits disagree.** Player of the Season shows how each of three voters ranked the top five, so "he came third because two of them had him fourth" is readable.
5. **The pundits' predictions come back:** "They said Messi. It was Fekir."

**Wireframe**

```
[nylon]
┌──────────────────────────────────┐
│ AWARDS NIGHT            ⏸   SKIP │
│                                  │
│ GOLDEN BOOT                      │  super.m
│                                  │
│ ┌•──────────────────────────────•┐
│ │ BENZEMA                        │  winner tag, stamp
│ │ REAL MADRID · 21 GOALS         │
│ └•──────────────────────────────•┘
│ 2 Messi 19 · 3 ◯ Fekir 17        │  your player tagged
│                                  │
│ PREDICTED: BENZEMA ✓             │  tag
│                                  │
│ ▪▪▪▪▫ 4 of 5                     │  progress
└──────────────────────────────────┘
```

**States** · Revealing (one award at a time) · Paused · Skipped (the full list) · Your player won something (an extra beat and a haptic) · Complete (cuts to the verdict).

**Built from** · AwardCut, WinnerTag, KitWall, BallotTable, PredictionCheck, ProgressTicks.
