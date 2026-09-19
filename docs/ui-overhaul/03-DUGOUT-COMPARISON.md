# 03 · The Dugout: what it has, and what a single run should borrow

> Part of the UI overhaul set. Start at [`00-README.md`](00-README.md).
> Sources read for this: The Dugout's `docs/UI-VOICE.md`, `docs/FOTMOB-UI.md`, `docs/GDD.md` §B3–B5, `docs/SCOPE.md` §11, §17–20, `docs/PLAN-0.1.4.md` (steps 6e, 10b, 11, 11e, 12, 12.5, 17 and the 0.2.0 list), `docs/PROJECT_STATE.md` chunk 9, and the source of `src/world/news.ts`, `src/ui/screens/News.svelte`, `src/ui/components/NewsStory.svelte` and `src/ui/theme/tokens.css`.

The Dugout is the maintainer's other football game: a multi-season manager career in Svelte. It is PoM's successor on the simulation side. This document asks two questions. Where is it genuinely deeper? And which of that depth fits inside one PoM run, which PRODUCT.md has now settled as the scope ("deepen each run", no career carry-over).

---

## 1. Side by side

| | The Dugout | Perfection or Misery |
|---|---|---|
| **The world** | 62 leagues, 944 clubs, 27,575 players in `world_v3.bin`, down to regional and youth tiers | Top-five leagues 2018–2025, two UCL editions, World Cup 2026, around 50 leagues for the custom UCL path |
| **Time** | Decades. The world remembers every season | One season. A run is minutes long |
| **How a league works** | Data-defined pyramids: promotion, relegation, play-offs, regionalised tiers, equal-exchange invariants checked after every season | One top-flight season. Tiers use a generic ladder (1st, top 3, top 4, top 7, top half, bottom 3) for every league |
| **Qualification** | Real bands scraped from FotMob per league per season; the published colours shown as data with a legend | Custom path: real UCL berths by association rank, split formats (Belgium play-off, Scotland split). League mode: none shown |
| **Competitions** | Domestic cups, super cups, all three UEFA competitions and the Super Cup, draws as broadcast events with pots built to UEFA's rule | UCL classic and full path, World Cup; the knockout bracket that The Dugout's own plan calls "the reference" |
| **News** | 30 story kinds derived from the table every matchday, with four rules; an inbox of 19 message types | None |
| **Awards** | Team of the Week, Month and Year picked by line; a Ballon d'Or decided by a modelled jury, announced as a night on the calendar, with every ballot readable | Player of the Season and Best U21 at the end of a run |
| **Match engine** | Simulated in six ordered steps; a shot log; commentary assembled from event fields | Result-first with a deterministic, FotMob-depth stat sheet regenerated from a seed |
| **Drama layer** | Draw bowl, award ceremony | Globe reveal, live knockout clock, Deep Match final, win and loss ceremonies |
| **Look** | Its own voice doc admits it reads as AI-made (Inter, emerald accent, rounded cards) and plans a FotMob-style rebrand | Tailwind greys, system font, blue accent, template icon |

The short version: The Dugout knows far more about **why a table matters**. PoM is far better at **making a moment land**. The redesign should carry the first into the second.

---

## 2. Where The Dugout is deeper, in detail

### 2.1 The news is written from the table

`src/world/news.ts` is the single most transferable idea in that codebase. Its own header says it best: the table already contains a narrative every week (a leader pulling clear, three clubs a point apart above the drop) and none of it reached the player, who "could go and look at a grid of numbers and infer it himself".

It is pure: a table and a matchday go in, stories come out. Four rules keep it from turning into noise:

1. **Your league only.** Ninety-five relegation scraps a season would bury everything.
2. **Not before matchday 10.** A title race declared in August is noise with a headline on it.
3. **Every story has a cooldown** (7 matchdays, 9 for a club's form).
4. **The numbers are baked in.** A story carries the rows it was about, frozen, so April can't rewrite what March said.

The 24 table-derived kinds include `runawayLeader`, `titleRace`, `summit`, `relegationBattle`, `hotStreak`, `coldStreak`, `championFinalDay`, `survivedFinalDay`, `sixPointer`, `topVsBottom`, `logJam`, `drawSpecialists`, `overachiever` and `unluckyTable`, each with tuned thresholds (a run is 13+ points from the last five; a runaway lead is 10 points).

The writing is the other half. Each kind has three headline variants chosen deterministically from the story's identity, a standfirst and up to three paragraphs, and it reads like a sports desk rather than a notification:

> "{club} and {other} meet at {home} with {gap} points separating them and {left} rounds of the season remaining."

The feed is designed as reading, not as widgets: one story per line, rules instead of cards, the headline as the row and the standfirst muted beneath it, grouped by season with a sticky heading. An opened story is typeset as prose at about 62 characters a line with the frozen table set inside the article "the way a newspaper sets a graphic into a column".

### 2.2 Leagues that behave like leagues

- **The pyramid is data.** A league definition carries its size, direct promotion and relegation counts, play-off specs and regionalised siblings. After every simulated season five invariants are asserted (exact size, no club in two leagues, equal exchange, no multi-tier jumps without a rule, even fixture counts).
- **Qualification bands are real.** The first version hand-maintained UCL/UEL/UECL places per league and was wrong for many of them. FotMob publishes the real indices per league per season, so they were scraped. Two traps worth knowing: a play-off band lists entrants rather than places, and a split league's legend describes the regular season.
- **The colours are data too.** Every table row carries its qualification colour and the table carries its own legend. After inventing a palette, the project reverted to the competitions' own colours (UCL blue, UEL orange, UECL green), because FotMob colours a place by outcome, not by competition.

### 2.3 Awards that are decided, not sorted

Step 12.5's principle: "An award is decided, not assigned." Sorting a column produces a game where the best statistic wins every year and nobody argues.

- **Team of the Week** is picked by line in a 1-4-4-2, not by rating alone, because ratings pay for goals and the eleven highest ratings would be nine forwards. The month is earned from the weeks.
- **The Ballon d'Or** has 30 nominees and a jury of one journalist per country, each submitting a ranked ballot scored 15, 12, 10, 8, 7, 5, 4, 3, 2, 1. A voter favours his countrymen (+22%) and the league he watches (+12%). A runaway season is never overturned; a tight one comes out differently from the merit table.
- **The ceremony is an event, not a message.** It counts down from thirtieth to first, slower over the podium, and afterwards the full thirty stay readable with every ballot openable, because "he came third because the German and Italian voters split" is an argument and only arguments are worth a screen.

### 2.4 Design rules PoM has never written down

From `UI-VOICE.md` ("how to stop looking AI-made") and the measured FotMob study:

- **Density is the aesthetic.** A football game's ancestors are Opta, Transfermarkt, FotMob, matchday programmes and Teletext, and none of them look like a SaaS dashboard.
- **Tabular figures wherever numbers align.** "Non-tabular numerals in a league table is the single most amateur thing an interface can do."
- **Colour encodes data and never decorates.** Every indicator has a legend; nothing is colour-only.
- **Rules and dividers over cards.** A hairline between rows is denser and more honest than a bordered box around each.
- **One dominant element per screen.** An even grid says nothing matters more than anything else.
- **Every number gets a comparison.** "160 M €" is data; "160 M € · 8th highest in the league" is information.
- **Measured from FotMob:** 14px body, headings at 23px weight 500 (hierarchy by size, not shouting weight), cards with no border and no shadow separated only by a one-step lift, four icon sizes and no more (12, 14, 16, 18), each with an accessible label.
- **Density tiers.** Every screen declares T1 (44px rows, 15px), T2 (34px rows, 13px) or T3 (28px rows).
- **The shell takes the club's colour.** One CSS variable re-tints the interface to the club you manage.
- **The test before shipping:** could this be any other app? Is any colour not encoding information? Does every indicator have a legend? What is the one most important thing, and does the layout say so? Would a fan recognise this as football? Do the numbers line up?

### 2.5 Interaction principles earned the hard way

- **A day that waits.** When a draw is pending, the world holds the clock and the advance button changes to "Watch the draw". A button that stops working without saying why is indistinguishable from a bug.
- **No walls at boundaries.** A season turning should not need a human to clear a screen first; the review becomes something you read, not something you dismiss.
- **No toggles for world behaviour.** If nobody should want the OFF state, there is no setting.
- **Live values are live.** A screen-local snapshot is stale the moment anything else writes.
- **Dead menu entries teach that the menu lies.** Unbuilt features are declared explicitly and removed from the "soon" list the moment they ship.
- **Previous matchdays and any competition anywhere** are the two capabilities its next release is built around.

---

## 3. Where PoM is already ahead

It would be wrong to copy The Dugout wholesale. PoM leads on:

- **The moment.** Globe placement, the live clock on your own knockout ties, the Deep Match and its ceremony. The Dugout's plan names PoM's bracket as the reference for its own, because PoM's names the round, marks your tie, shows unknowns as "?", states the stakes and pans and zooms.
- **Per-match depth.** Every simulated match has a full stat sheet, lineups on a pitch with ratings, a momentum graph and a timeline. The Dugout's match sheet names what it does not yet have (touches, dribbles, possession lost, four FotMob team stats).
- **Routes over dialogs.** The Dugout opens its match sheet as a dialog. PoM's is a real route, which the POM-REFERENCE guidance for The Dugout itself now recommends.
- **Voice.** "Ready to suffer?" and a ladder called Absolute Misery. The Dugout's voice doc wishes it sounded this much like football.

---

## 4. "Deepen each run": the translation

Every row here is something that fits inside one run and needs no career layer. Each is designed properly in the `07` screen documents; this is the inventory.

| The Dugout's system | PoM's single-run version | Lives on |
|---|---|---|
| News from the table | **The run's press.** Stories derived from your league's table (or your group and bracket) as the season plays, with the same four rules scaled to a run: nothing before a quarter of the season, cooldowns, numbers frozen, your competition only. Kinds that fit one season: title race, runaway leader, summit, relegation battle, six-pointer, log jam, hot and cold streaks, unbeaten, winless, draw specialists, final-day champion, final-day survival. Cup kinds PoM needs and The Dugout doesn't: group of death, the best-third-place scramble, giant killing, holders out, heartbreak on penalties. | A ticker during simulation; a "season in headlines" section on the result screen; full articles as routes |
| Inbox | **Not needed.** A run is short and you're watching it. Personal moments (your striker's hat-trick, your out-of-position centre-back's own goal) become stories in the same feed instead of a second system. | Same feed |
| Season preview (10b) | **The pundits' predictions.** Before kick-off: the predicted table from squad strength, two over- and two under-achievers, and three names to be wrong about (Player of the Season, top scorer, best U21). The verdict checks them: "They had you 14th. You finished 3rd." | Before the season starts; revisited on the verdict |
| Qualification bands as data | **Real stakes in every league table.** Zone lines for title, Champions League, Europa League, Conference League and relegation, from the real season's rules rather than one generic ladder, each with a legend. The tier ladder reads its thresholds from the same source, so the tier and the table can't disagree. | Live standings, final table, match sheet context |
| Team of the Week / Year | **Team of the Matchday and Team of the Season** picked by line in the league's most common shape, not by rating alone. A "you made the team" moment for your drafted players. | Matchday results; the awards beat |
| Ballon d'Or ceremony | **The Awards Night.** At the end of every run, a skippable, pausable count-down of the run's honours: Team of the Season, Golden Boot, Golden Glove, Young Player, then Player of the Season. A small pundit panel of three voters who disagree makes the result arguable. | Between the final whistle and the verdict |
| The draw as a broadcast | **Placement and every draw become pausable reveals.** Your ties in the foreground, drawn as fixtures with home and away marked; everyone else's collapsed underneath as names you can open. | Placement, UCL draw, World Cup group draw |
| A day that waits | **The run waits for you.** The simulation already holds the rest of a round until your match ends. Extend it: the primary button always names the next thing ("Watch your final", "Open the draw"), and nothing advances past a moment you haven't seen. | Every simulation phase |
| No walls | **The result saves itself.** The verdict is saved on arrival; leaving is never a precondition for keeping it. | Result screens |
| Club colour tint | **You wear the club you replaced.** The run's colourway tape takes the primary colour of the club your XI took over (already in the database). | The whole run |
| Previous matchdays, any competition | **Everything simulated is browsable.** The custom UCL path already simulates every European league; every one of those tables, and every matchday of your own season, becomes reachable from the run. | Run hub |
| FM's long fixture strip | **Your season as a strip.** Thirty-eight results as one continuous row of W/D/L labels you can scrub, instead of paging matchday chips. | Simulation and result |
| Player profile (step 12) | **A player page inside the run**: every match, totals with a per-90 toggle, rank against his position in the competition. A route, not a modal. | Stats hub |
| World-wide search | **One search for the run**: any player or club in the competition, from anywhere. | Run hub header |
| Commentary from fields | **A commentary line on the Deep Match**, assembled from the events the sheet already has, no prose generator. | Deep Match |

What stays out on purpose: youth academies, transfers, contracts, boards, job markets and multi-season history. They are career systems, and PRODUCT.md rules the career out.

---

## 5. The Dugout's UI plan, carried over and upgraded

The Dugout's plan for its interface has three parts: the voice rules above, the measured FotMob study, and its 0.2.0 list plus "step 17, the overview" (go through every screen and find what is inconsistent, missing or stupid, judged by looking rather than by suites). PoM adopts all three and goes further in five places where The Dugout's own plan stops short.

### Adopted as written

- Density tiers T1/T2/T3, declared per screen.
- Tabular figures on every aligned number.
- Colour as data only, with a legend for every indicator and never colour alone.
- Rules over cards for lists and tables.
- One dominant element per screen.
- A four-size icon discipline with accessible labels.
- Round flags instead of emoji flags.
- The pitch as the lineup, ratings on the shirts (PoM already has it).
- Hierarchy through size, not a wall of weight 900.
- The five-question test before any screen ships.
- A step-17 overview as the last phase of the redesign.

### Upgraded, because PoM is a game about moments and The Dugout is a tool about seasons

1. **An identity, not just a correction.** The Dugout's plan is to take FotMob's look, and its own notes warn against copying FotMob's shape. PoM gets a world of its own: Kit Drop (see [`04-DIRECTION.md`](04-DIRECTION.md)).
2. **Two grounds, set by the story.** Setup and reading happen on white cotton; live play, finals and Misery happen on black nylon. The Dugout is dark everywhere.
3. **Motion as material.** The Dugout's motion is a bowl and a count-down. PoM gets a full motion identity with springs, cuts, a signature spin and a verdict stamp ([`06-MOTION.md`](06-MOTION.md)).
4. **Routes everywhere.** The Dugout's match sheet is a dialog "you glance at and close". In PoM every surface is a route with a URL: the match, the player, the club, the story, the run.
5. **Shareable outcomes.** A verdict label you can send to the group chat, with a proper link preview on web. The Dugout has no reason to spread; PoM does.
