# 07d · Screens: the verdict, the run and your record

> Part of the UI overhaul set. Start at [`00-README.md`](00-README.md). Screen block format is explained at the top of [`07a-SCREENS-SHELL.md`](07a-SCREENS-SHELL.md).
> Pitches this area answers: **7 · The verdict**, **8 · The afterlife**, **9 · Your record**, **10 · Sharing** in [`04-DIRECTION.md`](04-DIRECTION.md).

The verdict stands on nylon. Once it's delivered, everything goes back to cotton: the run becomes a place you read.

**No modals in this area.** Today the player game log, the club squad, the group results, tie details, a club's matches and the competition rules are all modals. Each becomes a route with its own URL.

---

## D1 · The verdict (every mode)

`app/game/result.tsx`, `cl-result.tsx`, `wc-result.tsx`, `custom-ucl-result.tsx` (the top of each)

**Today**
- **League:** "Season Summary" header, a tier card with an emoji, the tier title, "Finished #6 out of 20 teams", a generic description ("You won the league! Your name is etched in glory…"), then ten more sections. **The score never appears.**
- **Cup modes:** a hero header, a player summary, and ten more sections, with the round reached as the title.
- **Saving happens only when you tap Play Again or Home.** Closing the app here loses the run. Guests are never saved.
- Four screens, four layouts.

**Readability, five fixes**
1. Save the run the moment the screen opens, and show whether it saved.
2. Show the score and its difficulty multiplier on the tier card.
3. Rewrite every tier description in the game's voice (see [`09-COPY-DECK.md`](09-COPY-DECK.md)).
4. Replace the tier emoji with the tier's label treatment.
5. Put Play Again and Home at the top of the screen as well as the bottom.

**Redesign, five moves**
1. **One verdict for every mode.** Position (or round reached) counts in, the label is stitched on, the score lands with its multiplier ([`06-MOTION.md`](06-MOTION.md) §5.7). League, UCL, custom UCL and World Cup differ only in their data.
2. **Misery has its own design.** A hazard-striped label, no flash, no particles, and a line of press that doesn't pretend it went well. Perfection gets volt and the flash cut. Everything in between gets an ink label.
3. **Three things below the verdict, no more:** the pundits' predictions checked ("They had you 14th. You finished 6th."), the season in five headlines, and your best player.
4. **Saved, visibly.** A `"SAVED"` tag after the stitch. Guests see "This run won't be kept." with `KEEP IT`, which creates an account and saves this run.
5. **Two exits and a share:** `PLAY AGAIN` (orange), `SEE THE SEASON` (ink, into the run hub), and a share control that sends the verdict label.

**Wireframe**

```
[nylon]
┌──────────────────────────────────┐
│▌▌▌▌ Real Betis colourway tape ▌▌▌│
│ LA LIGA 2019/20 · HARD           │  tag
│                                  │
│            6TH                   │  counts in
│ ┌•──────────────────────────────•┐
│ │ "EUROPA LEAGUE"                │  stitched label, super.xl
│ └•──────────────────────────────•┘
│ SCORE 1,240 × 1.4 = 1,736        │  tabular
│ "SAVED"                          │
│                                  │
│ THEY HAD YOU 14TH.               │  press voice
│ ▸ Betis finish sixth and ruin…   │  five headlines, first shown
│ ▸ Fekir: 17 goals from a …       │
│ BEST · FEKIR 7.62 AVG            │
│                                  │
│ ┌•────────────────────┐┌───────┐ │
│ │   PLAY AGAIN   →    ││ SHARE │ │
│ └•────────────────────┘└───────┘ │
│   SEE THE SEASON                 │
└──────────────────────────────────┘
```

**States**

| State | Design |
|---|---|
| Perfection | Volt label, flash cut, tag-and-tape confetti |
| A good finish | Ink label with a volt edge |
| Mid-table | Ink label |
| Misery | Striped label, stripe pull, stillness |
| Cup: champion | Volt label; arrives after the Deep Match ceremony without repeating it |
| Cup: out | Striped label naming the round |
| Saving | A tag-shaped progress bar under the score |
| Save failed | Striped `COULDN'T SAVE · RETRY`, stays until handled |
| Guest | `This run won't be kept.` + `KEEP IT` |
| Opened from history | No count-in or stitch; the verdict is simply there |

**Built from** · Tape, VerdictStitch, CountIn, ScoreLine, SaveTag, PredictionCheck, HeadlineList, Plate, ShareControl.

---

## D2 · The run hub (replaces the long result scroll)

Everything below the tier card on today's four result screens.

**Today**
- **League:** Campaign Stats tiles, your lineup and squad summary, Season Highlights (🏆 Biggest Win, 💔 Worst Loss, ⚠️ Shock Defeats), Matchday History (a row of up to 38 chips, that matchday's fixtures and table), a Position Tracking graph, the Medical table, Final Standings, 📊 View Stats, Play Again and Home. Ten sections.
- **UCL:** summary, lineup, medical, full 36-club standings, your matchdays, a sideways-scrolling bracket, winner card, buttons, a rules modal, a team modal.
- **World Cup:** summary, lineup, your group, medical, all groups, best third-placed teams, bracket, winner, a group modal.
- **Custom UCL:** as UCL plus the qualifying ladder and a domestic leagues browser modal.

**Readability, five fixes**
1. Collapse everything after Final Standings under a "Season details" disclosure.
2. Move Final Standings (or the bracket) directly under the verdict: it's the record of what happened.
3. Replace the emoji highlight labels with icons and plain titles.
4. Replace the 38-chip matchday row with the season strip from C1.
5. Use the shared tier labels everywhere (the league screen, Home and Runs currently disagree).

**Redesign, five moves**
1. **A hub with tabs, on cotton.** `TABLE` (or `BRACKET` / `GROUPS`), `SEASON`, `STATS`, `PRESS`, `SQUAD`. One route per tab, so a friend can be sent straight to your bracket.
2. **TABLE / BRACKET** is the final record: zones drawn, your row tagged, every row a link to that club's page; the bracket keeps pinch and pan.
3. **SEASON** is your strip of results, the position graph and the highlights as linked match rows ("Biggest win · 5–0 v Espanyol"), plus the medical table.
4. **PRESS** is the run's stories as a feed (rules, not cards), grouped by phase; each story opens as a story page (D6).
5. **SQUAD** is your pitch and bench with season numbers on every tag, each player linking to his page.

**Wireframe**

```
[cotton]
┌──────────────────────────────────┐
│ ‹ RUN · LA LIGA 2019/20          │
│ "EUROPA LEAGUE" · 1,736          │  compact verdict label
│ TABLE  SEASON  STATS  PRESS  SQUAD│  tabs, orange tape under active
│ ────────────────────────────────  │
│ ▌CHAMP 1 Barcelona  38  +47  87 › │
│ ▌UCL   2 Real Madrid 38 +38  81 › │
│ …                                 │
│ ◯┆UEL 6 "YOUR XI"   38  +12  59 › │
│ …                                 │
│ ╱DOWN 20 Espanyol   38  -34  25 › │
│ CHAMP · UCL · UEL · UECL · DOWN   │
└──────────────────────────────────┘
```

**States** · Fresh run · Opened from history (older runs without full data show what exists and say what's missing, as the cup screens already do) · Loading · Couldn't load (inline error with retry).

**Built from** · CompactVerdict, TabBar (horizontal, square), LeagueTable, Bracket, SeasonStrip, PositionGraph, LinkedMatchRow, MedicalTable, PressFeed, PitchHangers.

---

## D3 · Season stats (the STATS tab)

`app/game/stats.tsx`

**Today**
- "Player Statistics": a search box with rank chips on results, 🏆 Player of the Season and 🌟 Best U21 cards, fourteen leaderboards behind a horizontally scrolling chip row, Team Stats, Your Players, a rules modal for the custom path.
- Tapping a player opens a modal game log; tapping a club opens a modal squad.
- Each board has an eligibility rule (average rating needs 3 matches, pass percentage needs 200 passes), which is good and invisible.

**Readability, five fixes**
1. State each board's eligibility rule under its title ("3+ matches").
2. Group the fourteen boards into four families (Scoring, Creating, Defending, Discipline) so no more than four chips show at once.
3. Replace the award emoji with icons and put the winner's line first.
4. Show the player's club and position on every leaderboard row.
5. Mark your players with the orange tag in every list, not only in "Your Players".

**Redesign, five moves**
1. **Boards as T3 tables** with rules, tabular figures and a `TOTAL / PER 90` switch (with a minutes threshold for per 90).
2. **Every name is a link** to the player page (D4); every club to the club page (D5). No modals.
3. **Awards move to their own section** with Awards Night's results, including the pundits' ballots.
4. **Search is in the run header** and finds any player or club in the competition from any tab.
5. **Percentile tags** beside a player's figures when they're in the competition's top 10% for his position (`TOP 5% · ST`).

**States** · Fresh run · From history (the game-log limitation stated once) · No eligible players for a board ("Nobody's played 3 matches yet.") · Search with no match.

**Built from** · FamilyChips, StatsTable, TotalPer90Switch, PlayerLink, ClubLink, PercentileTag, AwardsSection.

---

## D4 · Player page (new route, replaces the game-log modal)

**Today** · A modal: name, club, position, season, average and POTM in one line; twelve season totals as boxes; every match in the run as an expandable row with the full match sheet inside.

**Readability, five fixes**
1. Make it a route so back works and it survives a reload.
2. Put the average rating and POTM count as the two largest numbers.
3. Show minutes played, which qualify every per-game figure.
4. Colour-grade each match's rating with the rating scale, paired with the figure.
5. Say plainly when match-by-match detail isn't available for an older run.

**Redesign, five moves**
1. **A player tag as the header:** name in the super, `POS · CLUB · SEASON` in the tag mono, a drafted-by-you tag if he's yours.
2. **Season numbers as a T3 table** with the per-90 switch and rank against his position in the competition.
3. **Every match as a row:** opponent, result tag, minutes, rating tag, goal and assist glyphs. Each row opens the match sheet.
4. **A rating trend line** across the run, the one graph a player page earns.
5. **Honours from this run** as tags: `POTM ×3`, `TEAM OF THE SEASON`, `BEST U21 · 2ND`.

**States** · Played · Unused all season (says so, lists the matches he was on the bench for) · Injured or suspended spells marked on the match list · Older run without per-match detail.

**Built from** · PlayerHeaderTag, StatsTable, TotalPer90Switch, MatchLogRow, RatingTag, TrendLine, HonourTag.

---

## D5 · Club page (new route, replaces the squad and club-matches modals)

**Today** · Two different modals: a club's squad from the stats screen, and a club's matches from the result screen or UCL table.

**Readability, five fixes**
1. One route instead of two modals.
2. Show the club's finish and record at the top.
3. List the squad by position group, not alphabetically.
4. Show each match's scoreline with a result tag.
5. Link every player to his page.

**Redesign, five moves**
1. **The club as a tag:** the three-letter code on its colour tape, the name in the super, finish and record in the tag mono.
2. **Tabs:** `MATCHES` (every result, linking to sheets), `SQUAD` (by position with season numbers), `RECORD` (form strip, goals for and against, the position graph).
3. **The club's stories** from the run's press, filtered.
4. **Head to head with you:** both results against your XI, always first if they exist.
5. **Replaced club marked:** when this is the club your XI took over, a tag says so and links to the verdict.

**States** · Your replaced club · A rival you played · A club from another league (custom UCL path, reached from the leagues index) · Eliminated club (cups).

**Built from** · ClubTag, TabBar, MatchLogRow, SquadList, FormStrip, PositionGraph, PressFeed.

---

## D6 · Story page (new route)

The run's press, opened. Borrowed from The Dugout's article reader.

**Today** · Doesn't exist.

**Readability, five fixes** *(targets for the first version)*
1. A measure of 60–70 characters.
2. The headline, a one-line standfirst, then at most three short paragraphs.
3. The frozen table the story was about, set inside the article.
4. The matchday and phase it was written on.
5. Links from every club named to its page.

**Redesign, five moves**
1. **Typeset as a back page:** headline in the super, standfirst muted, body in the workhorse.
2. **The graphic is the table as it stood that week,** never recalculated.
3. **Share a story** as a label, like a verdict.
4. **Next and previous story** at the foot, in order of the run.
5. **Stories about your XI carry the orange tag** in the feed.

**States** · Default · Referencing a match (a linked match row inside the story).

**Built from** · ArticleBody, FrozenTable, ShareControl, StoryPager.

---

## D7 · The match sheet

`app/game/match-stats.tsx`, `src/components/MatchStatsParts.tsx`, `src/components/MatchLineupPitch.tsx`, `src/components/MomentumGraph.tsx`

**Today**
- The best screen in the app and already a route. Header with scorers, a compact score that fades into the top bar, sticky tabs for Facts, Lineup and Stats.
- **On Android the tab strip renders its three tabs stacked vertically** inside the sticky header, eating about a fifth of the screen (the maintainer's screenshots).
- Facts: player of the match, momentum and key stats with a side header, timeline, top rated, form going in, next match, the table or bracket at the time. Lineup: pitch with ratings, bench, ratings list with expandable per-player sheets. Stats: four stat blocks with side headers and a sortable player table.

**Readability, five fixes**
1. Fix the tab strip so it stays one row on Android.
2. Raise stat values and labels from 10–12px to 13px.
3. Put the team names above every stat block (partly done this week) and colour-pair each bar with its side's label.
4. Mark "form going in" results with result tags, not coloured letters alone.
5. Collapse the "at the time of this match" table to your two clubs' rows plus the rows between them, expandable.

**Redesign, five moves**
1. **The header as a match card:** both clubs as tags, the scoreline in the super, `FT` / `AET` / `PENS` as a tag, scorers beneath.
2. **Tabs as square tabs with the orange tape,** sticky, always one row.
3. **Stats as mirrored bars on rules,** home to the left and away to the right of a centre line, the leading side's bar in ink and the other in `label` grey.
4. **The lineup as the kit wall** from the Deep Match with ratings on the tags and sub markers as glyphs.
5. **Every player a link** to his page and every club to its page, so the sheet becomes a hub in itself.

**States** · League match · Two-legged tie leg · Final (links to the Deep Match replay of the numbers, never the playback) · Loading (skeleton rows on cotton) · Stats unavailable for a legacy match.

**Built from** · MatchCard, SquareTabs, MirroredStatBar, SideHeader, Timeline, KitWall, RatingTag, FormStrip, MiniTable, Bracket.

---

## D8 · Runs

`app/(tabs)/runs.tsx`

**Today**
- "My Runs" with a back button on a tab, seven sort chips with icons, run cards with a tier-coloured left border (or a full mode-coloured border for Chaos and Cursed), a difficulty badge, score, W/D/L.
- Tier names come from a local `formatTier` ("Sf Exit", "Q3 Exit"). Loads once and doesn't refresh after a new run.
- Guests see "Sign in to view your run history" with no button.

**Readability, five fixes**
1. Use the shared tier labels.
2. Refresh on focus, as Home does.
3. Give guests a `KEEP MY RUNS` button.
4. Reduce the sort to four options (Date, Score, Tier, Difficulty) and add a mode filter.
5. Remove the back button from the tab root.

**Redesign, five moves**
1. **A wardrobe of verdict labels.** Each run is a riveted label with its colourway tape, tier, club and season, mode and difficulty tags, score.
2. **Misery labels are striped,** Perfection labels volt-edged, so a scroll through your runs reads your history at a glance.
3. **Filter by mode, sort by one control,** above the list, sticky.
4. **Each label opens the run hub** (D2).
5. **Personal bests pinned at the top:** best score overall and best verdict per mode.

**States** · Has runs · Filtered to nothing ("No World Cup runs yet.") · Guest · Loading (label outlines) · Couldn't load (inline error, retry).

**Built from** · RunLabel, FilterChips, SortControl, PinnedBests, EmptyState, InlineError.

---

## D9 · Ranks (was Leaderboard)

`app/(tabs)/leaderboard.tsx`

**Today** · Top 50 runs across every mode in one list, gold/silver/bronze rank circles, username, tier (local `formatTier`), league name, difficulty badge, score, date. A failed load shows "No runs yet. Be the first!". Scores are written by the client and not verified.

**Readability, five fixes**
1. Filter by mode: a league score and a World Cup score aren't comparable.
2. Use the shared tier labels.
3. Distinguish "couldn't load" from "empty".
4. Mark your own entries with the orange tag.
5. Refresh on focus.

**Redesign, five moves**
1. **A T3 table,** rank in tabular figures, username, verdict tag, difficulty tag, score. Podium ranks get volt, silver and bronze tags rather than coloured circles.
2. **Friends first:** the people you've played against or added, then everyone, as two sections.
3. **Your best entry pinned** at the bottom when it's out of view.
4. **Every row opens that run's hub** read-only.
5. **Honest labelling** until server-side scoring lands: the section is called `FRIENDS & RIVALS`, not "global" (see [`02-VIBECODE-AUDIT.md`](02-VIBECODE-AUDIT.md), SEC-7).

**States** · Default · Filtered · Empty for a mode · Couldn't load · You're not on it yet.

**Built from** · RanksTable, ModeFilter, PodiumTag, PinnedRow, InlineError.

---

## D10 · Achievements and Career

`app/game/achievements.tsx`, `app/game/career.tsx`

**Today**
- **Achievements:** three summary tiles (Trophies, "Hardest won /10", Modes cleared), a card per mode with difficulty badges, a footnote that says "0–11 scale", contradicting the tile.
- **Career:** Players Fielded, Goals For and Against, a competition filter, a 🏆 Awards Cabinet, and a leaderboard of your players by goals, assists, clean sheets and appearances. Its empty and guest states use "← Back" text links.

**Readability, five fixes**
1. Fix the hardness scale so the tile and the footnote agree.
2. Replace the cabinet emoji with icons.
3. Use the shared back control.
4. Show each mode card's missing difficulties as what's left to win, not greyed badges alone.
5. Add the competition name to every career row instead of the `LGE`, `UCL✦` codes.

**Redesign, five moves**
1. **Achievements as a patch collection:** one woven patch per mode and difficulty won, sewn in when earned, outlined when not.
2. **The hardest win as a single label** with its knobs listed as tags.
3. **Career as your all-time squad:** a kit wall of the players who've scored most for you, then the tables.
4. **The cabinet as rows of honour tags** per player (`POTS ×2 · 2019/20 LA LIGA`).
5. **Both live inside You** (A4), each a route.

**States** · Guest (one plate, `KEEP MY RUNS`) · No runs yet · Partial collection · Loading · Couldn't load.

**Built from** · Patch, HardestWinLabel, KitWall, CareerTable, HonourTag, FilterChips.

---

## D11 · The share label (new)

**Today** · Nothing designed to share. `react-native-view-shot` and `expo-sharing` are installed and unused; a web link has no preview.

**Readability, five fixes** *(targets for the first version)*
1. Legible at thumbnail size in a chat: verdict in the super, one number.
2. No private data: username optional.
3. The app's name and web address on the label.
4. Correct at both a story size (9:16) and a square.
5. Alt text on web previews.

**Redesign, five moves**
1. **The verdict label, cut out:** colourway tape, tier, club and season, mode and difficulty, score, on the ground of its outcome (striped nylon for Misery, volt edge for Perfection).
2. **Two taps:** share control on the verdict, then the system share sheet.
3. **On web, every run has a URL** whose link preview is this label.
4. **Stories share the same way,** as a headline label.
5. **Nothing is claimed that the run didn't do:** the label is generated from the saved result only.

**States** · Generating · Ready · Sharing unavailable (web without the share API: copy link instead).

**Built from** · ShareLabel, Tape, VerdictLabel, ShareControl.
