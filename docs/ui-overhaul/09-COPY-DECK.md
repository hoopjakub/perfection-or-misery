# 09 · Copy deck

> Part of the UI overhaul set. Start at [`00-README.md`](00-README.md). Voice summary: [`05-STYLE-GUIDE.md`](05-STYLE-GUIDE.md) §11.
> Method: the humanizer pass at **medium** intensity over every user-facing string in `app/` and `src/components/` (about 1,100 lines of copy were extracted and read).

Two kinds of rewrite live here, and they are kept apart on purpose:

- **Humanized** — the same facts, rebuilt so it reads like a person wrote it. Nothing is added. This is safe to ship as is.
- **Kit Drop voice** — new copy authored for the redesign. It may add a line of character. It needs the maintainer's approval before it ships.

Where the source said something wrong, the rewrite does not quietly fix it. It's listed under **Flags** at the end.

---

## 1. Voice rules

**Five voices, one game.**

| Voice | Rules | Example |
|---|---|---|
| **The label** | One to three words, caps, straight quotes around names and states | `"YOUR XI"` `"OUT"` |
| **The super** | Verdicts and moments. Short. Full stop allowed. Never a question | `MISERY.` |
| **The press** | Sports desk. Specific numbers. No cheerleading | "Four clubs, three points, one relegation place." |
| **The tag** | Data, abbreviated the way a kit label is | `MD 12/38 · OVR 88` |
| **The guide** | Plain, friendly, one idea per sentence. Explains once | "Subs only come on in the second half." |

**Always**
- Buttons are verbs that say what happens: `START THE SEASON`, `DISCARD 7 PICKS`.
- A disabled button names what's missing.
- Every empty state says what to do next.
- Numbers are figures with units: "3 rerolls", "38 matchdays".
- Straight quotes in labels, proper apostrophes in sentences.

**Never**
- Exclamation marks in system copy.
- Praise the result didn't earn ("legendary", "etched in glory").
- Developer language ("seeder", "for now", raw error strings).
- Emoji standing in for an icon.
- More than one em dash in a paragraph; most sentences need none.
- Song lyrics, slogans or catchphrases from real brands.

---

## 2. The tier ladder (league verdicts)

### 2.1 The names

The app uses three names for some tiers: the result card, `src/data/tiers.ts` and the raw keys all differ. One set has to win. Proposed canonical names, keeping the strongest existing name for each:

| Key | Result card today | Home/Runs today | **Proposed** |
|---|---|---|---|
| `perfection` | ULTIMATE PERFECTION | Perfection | **PERFECTION** |
| `almost_perfection` | ALMOST PERFECTION | Almost Perfection | **ALMOST PERFECTION** |
| `champions` | LEAGUE CHAMPIONS | Champions | **CHAMPIONS** |
| `title_contender` | TITLE CONTENDERS | Title Contender | **TITLE CONTENDERS** |
| `champions_league` | EUROPEAN ELITE | UCL Qualification | **CHAMPIONS LEAGUE** |
| `europa_glory` | EUROPA LEAGUE GLORY | Europa Glory | **EUROPA GLORY** |
| `almost_matters` | MID-TABLE COMFORT | Almost Matters | **ALMOST MATTERS** |
| `respectful_mediocrity` | RESPECTABLY MEDIOCRE | Respectful Mediocrity | **RESPECTABLE MEDIOCRITY** |
| `absolute_misery` | ABSOLUTE MISERY | Absolute Misery | **ABSOLUTE MISERY** |

*Maintainer to confirm.* The proposal keeps "Almost Matters" and "Respectable Mediocrity" because they carry the game's voice; "Mid-Table Comfort" and "European Elite" are the generic ones.

### 2.2 The lines

| Tier | Today | Humanized | Kit Drop voice |
|---|---|---|---|
| Perfection | "You won the league with a perfect 100% win record. A legendary achievement that will never be forgotten!" | You won the league and won every match. | Every match. Every point. Nothing left on the table. |
| Almost Perfection | "You went completely unbeaten throughout the season to lift the trophy. Simply sensational!" | You won the league without losing a match. | Champions, and nobody beat you. Somebody held you to a draw, though. |
| Champions | "You won the league! Your name is etched in glory and your fans will celebrate for decades." | You won the league. | League champions. Winner stays. |
| Title Contenders | "A podium finish! You pushed the champions to the absolute limit and proved you belong at the top." | A podium finish, pushing the champions all the way. | Close enough to see the trophy. Not close enough to lift it. |
| Champions League | "Top 4 finish! You have qualified for the prestigious UEFA Champions League to face the best in Europe." | A top-four finish and a place in the Champions League. | Top four. Tuesday nights in Europe next season. |
| Europa Glory | "You secured European football! A strong season finishing in the top 7. Continental nights await." | A top-seven finish and European football. | Europe, just about. Thursday nights it is. |
| Almost Matters | "A comfortable mid-table finish in the top half. Safe, respectable, but maybe a bit forgettable." | Top half, comfortably mid-table. Safe, respectable, a bit forgettable. | Top half. Nobody will remember it, including you. |
| Respectable Mediocrity | "You survived relegation, but only just. A season of scraping by. You need to recruit better next time." | You stayed up, only just, after a season of scraping by. Recruit better next time. | Stayed up. Barely. The draft needs a word with itself. |
| Absolute Misery | "Relegation! A disastrous campaign finishing in the bottom 3. The board is furious. Total heartbreak." | Relegated, bottom three, after a disastrous season. The board is furious. | Relegated. Walk off the pitch. |

The Kit Drop column drops "the board is furious" because PoM has no board; the humanized column keeps it because the source said it (see Flags).

### 2.3 Cup verdicts (`TIER_LABEL`)

| Key | Today | Proposed label | Kit Drop line |
|---|---|---|---|
| `winner` | WC Champion *(wrong for UCL winners)* | **CHAMPIONS** (with the competition as a tag) | Last ones standing. |
| `final` / `finalist` | WC Finalist / UCL Finalist | **RUNNERS-UP** | One match away. The medal nobody wants. *(from the existing Ceremony)* |
| `third` | Third Place | **THIRD PLACE** | Bronze. You won the game nobody wanted to play. |
| `fourth` | Semi 'No Medal' Finalist | **FOURTH** | Fourth, and no medal for it. |
| `sf` / `sf_exit` | Semi-Finalist | **SEMI-FINALISTS** | Out in the last four. |
| `qf` / `qf_exit` | Quarter-Finalist | **QUARTER-FINALISTS** | Out in the last eight. |
| `r16` / `r16_exit` | Round of 16 | **ROUND OF 16** | Out before it got serious. |
| `r32` | Round of 32 | **ROUND OF 32** | First knockout, first exit. |
| `playoff_exit` | Playoff Round | **KNOCKOUT PLAY-OFF** | Made the knockouts. Didn't make the knockouts. |
| `league_exit` / `groups` | League Phase / Group Stage | **LEAGUE PHASE** / **GROUP STAGE** | Home before the knockouts. |
| `quali_playoff_exit`, `q3_exit`, `q2_exit`, `q1_exit` | Qualifying round names | **OUT IN Q1 / Q2 / Q3 / PLAY-OFF** | Europe never saw you. |
| `not_qualified` | Did Not Qualify | **DIDN'T QUALIFY** | Your league had other plans. |

---

## 3. Home and the shell

| Where | Today | Humanized | Kit Drop voice |
|---|---|---|---|
| Home greeting, guest | Playing as Guest / Create an account to save your runs | Playing as a guest. Create an account to save your runs. | *(moved)* Runs aren't kept as a guest. `KEEP MY RUNS` |
| Home greeting, signed in | Hey, {username} / Ready to suffer? | *(unchanged, already human)* | Ready to suffer, {username}? |
| Home tagline | Draft your XI. Face the consequences. | *(unchanged)* | Draft an XI from real seasons. Find out which one you get. |
| Start button | START RUN | *(unchanged)* | START A RUN |
| Guide link | New here? Read how to play | *(unchanged)* | New here? How it works |
| Empty runs | 😬 No runs yet. Start suffering. | No runs yet. Start suffering. | No runs yet. |
| Ranks empty | 😬 No runs yet. Be the first! | No runs yet. | Nobody's on the board yet. |
| Tab labels | Play · Ranks · Profile · Runs · Guide · About | *(four destinations)* | PLAY · RUNS · RANKS · YOU |
| Runs, guest | Sign in to view your run history | Sign in to see your runs. | Runs aren't kept as a guest. `KEEP MY RUNS` |

---

## 4. Sign in and create account

| Where | Today | Humanized |
|---|---|---|
| Login title | Welcome back. / Sign in to your account. | Welcome back. Sign in. |
| Register title | Create account. / Your guest runs stay. We just add a username. | Create an account. *(the second line is false; see Flags)* |
| Register title, Kit Drop | | "KEEP YOUR RUNS" / Pick a username and a password. |
| No recovery (login) | ⚠️ There is no password recovery. If you forget your password, your account is gone. | There's no password recovery. Forget your password and the account is gone. |
| No recovery (register) | …no password recovery. If I forget my password, my account is gone forever. | I understand there's no password recovery. |
| Acknowledgement, Kit Drop | | `I'LL REMEMBER IT` |
| Username taken | That username is already taken. | That username's taken. |
| Short username | Username must be at least 3 characters. | Usernames need at least 3 characters. |
| Bad characters | Username can only contain letters, numbers, and underscores. | Letters, numbers and underscores only. |
| Short password | Password must be at least 6 characters. | Passwords need at least 6 characters. |
| Mismatch | Passwords do not match. | The passwords don't match. |
| Unchecked warning | You must accept the no-recovery warning. | Tick the box to confirm there's no recovery. |
| Any other error *(today: raw `e.message`)* | | That didn't work. Check your connection and try again. |

---

## 5. Where you play (modes)

| Mode | Today | Humanized | Kit Drop voice |
|---|---|---|---|
| All Time | Any league, any era / The full pool. Any club, any season, any league. The main experience. | Any club, any season, any league. The main mode. | Any club, any season, any league. |
| League | One league, all eras / Pick a league. Every spin comes from that league across all available seasons. Placement stays within it too. | Pick a league. Every spin and your placement come from it, across every season we have. | One league, every season we have. |
| Chaos | No mercy / Ratings hidden. No rerolls. Placement weighting disabled — you could end up anywhere. | Ratings hidden, no rerolls, and you could be placed anywhere. | No ratings. No rerolls. No idea where you'll land. |
| Cursed | You asked for this / Like Chaos but you also have no idea which position you're drafting for until after you pick. | Like Chaos, but you don't know which position you're drafting for until you've picked. | Chaos, and you don't know the position until after you pick. |
| UCL full path | Real leagues, real qualifying / Every UEFA league simulated from scratch. Qualify (or go straight in), survive the League Phase, then the knockouts. The full road to the trophy. Crown yourself the best club in Europe. | Every UEFA league is simulated. Qualify or go straight in, get through the league phase, then the knockouts. | Every UEFA league, played out. Earn your place, then the whole road. |
| UCL finals | Finals only / The 36-club League Phase and knockouts only, no qualifying — just the best clubs from Europe's top competitions. | The 36-club league phase and the knockouts. No qualifying. | Straight into the league phase. |
| World Cup finals | Global glory (Not full route for now) / The best 48 national teams in the world. Draft your squad and lead your country to victory. | 48 national teams. Draft a squad and take over a country. | 48 nations. One of them is yours now. |
| World Cup full route | The full road from qualifying to the final / Your confederation's qualifiers, the play-offs, then the tournament itself. The complete route. Become the champion of the world. | Your confederation's qualifiers, the play-offs, then the tournament. | Qualifying, play-offs, the tournament. `SOON` |
| Segments | Normal Modes · Special Modes · SM (Finals) | | LEAGUES · EUROPE · WORLD CUP |

---

## 6. How hard

| Where | Today | Humanized |
|---|---|---|
| Easy | 3 rerolls · ratings shown · your own matches tilt your way | *(already human; keep)* |
| Medium | 1 reroll · ratings shown · matches play it straight | *(keep)* |
| Hard | No rerolls · ratings hidden · the AI leans against you | *(keep)* |
| Custom | Dial in your own pain — rerolls, blind ratings, and how hard the AI screws you. | Set your own pain: rerolls, blind ratings, and how hard the AI leans on you. |
| Reroll note | More rerolls = an easier draft, but a real cut to your final score. | More rerolls make the draft easier and cut your score. |
| Ratings toggle | OVRs visible while drafting. / Draft blind — no OVRs. Harder, worth more. | Ratings shown while you draft. / Draft blind. Harder, and worth more. |
| Weighted picks | On — spins are drawn from the top-6 UEFA-coefficient leagues only. / Off — spins are drawn from the full pool. | On: spins only come from Europe's six strongest leagues. / Off: spins come from every league. |

**The screw-level taglines** in `src/engine/difficulty.ts` already have the voice and mostly stay. Two changes:

| Level | Today | Proposed |
|---|---|---|
| 1 Baby Mode | Trophies made of foam. You literally cannot lose. | Trophies made of foam. *(see Flags on "cannot lose")* |
| 5 Sweaty | *(quotes a well-known song lyric)* | Your hands have started to get involved. |

---

## 7. Formations

One line each, no promises about tactics the engine doesn't model (see Flags).

| Shape | Today (abridged) | Proposed |
|---|---|---|
| 4-3-3 | Classic attacking setup… Works best with technical midfielders. | Three up front, width on both sides. |
| 4-4-2 | The English classic. Two strikers up top, a solid midfield bank of four. Balanced and reliable. | Two strikers and a flat midfield four. |
| 4-2-3-1 | Two defensive mids protect the back four while a number 10 links play. The most tactically flexible. | Two holding mids and a number ten. |
| 3-5-2 | Three at the back with wing-backs providing width. Requires versatile players but can dominate midfield. | Three at the back, wing-backs, five across midfield. |
| 5-3-2 | Defensively solid with five at the back… Built to grind results. | Five at the back and two up top. |
| 3-4-3 | Three centre-backs and attacking wing-backs feed a front three. High-risk, high-reward… | A back three, wing-backs and a front three. |
| 4-1-4-1 | A lone striker and a banked four in midfield, shielded by a single holding mid… | One holding mid, a banked four, one striker. |
| 4-3-1-2 | Two strikers fed by a playmaker in the hole, with a flat three behind… | A playmaker behind two strikers. Narrow. |
| 4-1-2-1-2 | The narrow diamond… | The narrow diamond. |
| 5-4-1 | Five at the back, a flat four ahead, one striker up top. Maximum defensive solidity… | Five at the back, four in front, one striker. |
| 3-4-2-1 | Back three, wing-back width, and two roaming 10s behind a lone striker… | A back three and two tens behind one striker. |
| 3-4-1-2 | …behind a two strikers. All out attack. PM Special. | A back three, one ten, two strikers. |

---

## 8. The run

| Where | Today | Humanized / Kit Drop voice |
|---|---|---|
| Draft header | 7/11 picked · 3 ⟳ | `7/11` · `REROLLS 3` |
| Before spinning | 11 slots remaining / Spin a club to pick from | Spin a club-season. Pick one player from it. |
| Cursed hint | Spin for position first | Spin for a position first. |
| Picking | Pick a player | Pick one. |
| No player fits | No players fit your remaining slots. Spin another club. | Nobody here fits your open positions. `SPIN AGAIN` |
| Slot picker | Where does {name} play? | *(replaced by lit hangers; no copy)* |
| No compatible slot | No compatible slots open for this player. | He doesn't fit anywhere that's still open. |
| Move title | Move {name} to… / Bring on {name} at… | *(replaced by lit hangers)* |
| Swap preview | in 84 · out 79 | `IN 84` `OUT 79` |
| Fact box | Did you know? | *(on the back of the club tag)* `FLIP` |
| Bench intro | 2/5 subs drafted — 3 more to go. Subs get real minutes off the bench, at reduced odds to score or assist. | Subs come on in the second half and score less often. |
| Bench skip | Skip — play with no bench this run | `PLAY WITHOUT A BENCH` *(behind a confirmation)* |
| Draft done | Squad Complete / Time to find out where you end up. / SPIN PLACEMENT → | "SQUAD COMPLETE" / `TO THE DRAW →` |
| Placement ready | Where will you land? / {n} leagues eligible | Where are you going? `{n} LEAGUES IN THE DRAW` |
| Placement reveal | You've been placed in … Replacing {club} … Top opposition | YOU'RE "{CLUB}" · {LEAGUE} {SEASON} · STRONGEST RIVALS |
| Pre-season | Entering the League / Your squad replaces {club} for this season. Good luck! / START SEASON SIMULATION | "THE PUNDITS HAVE YOU {n}TH" / `START THE SEASON` |
| Season controls | Skip All · SLOW · Waiting for kickoff... | `SKIP TO THE LAST DAY` · `SPEED` · Kick-off shortly. |
| End of league season | VIEW FINAL RESULTS & REWARDS → | `TO THE AWARDS →` *(there are no "rewards")* |
| UCL qualifying exit | ELIMINATED / Your UEFA Champions League run ends in qualifying. The tournament continues without you — see how it plays out. | `OUT IN Q2` / Europe carries on without you. `SEE HOW IT ENDS` |
| WC groups | Your group is highlighted — top 2 + 8 best 3rd-placed reach the Round of 32. | Top two go through. So do the eight best third-placed teams. |
| Knockouts | Next round incoming... | `WATCH YOUR {ROUND}` |
| Live pause note | Time stopped — take your time, then resume. | Paused. |
| Deep Match lead-in | One match. Played out in full, minute by minute — you only get to watch it once. | One match, played out minute by minute. You only get to watch it once. |
| Deep Match empty timeline | Nothing yet — they're feeling each other out. | *(keep)* |
| Ceremony, loss | One match away. The medal round your neck is the one nobody wants. | *(keep: the best line in the app)* |

---

## 9. Results, stats and records

| Where | Today | Humanized / Kit Drop voice |
|---|---|---|
| League result header | Season Summary | *(the verdict needs no header)* |
| Position | Finished #6 out of 20 teams | `6TH OF 20` |
| Highlights | 🏆 Biggest Win · 💔 Worst Loss · ⚠️ Shock Defeats | Biggest win · Worst loss · Shock defeats |
| Stats link | 📊 View Stats | `SEE THE SEASON` |
| Stats hint | Tap a player to see every one of their matches | Tap a player for every match he played. |
| Board eligibility | *(invisible)* | `3+ MATCHES` · `200+ PASSES` |
| No eligible players | Nobody yet. | Nobody's qualified for this one yet. |
| Game log limit | Match-by-match logs are only kept for the run where the stats were computed. | Match-by-match detail is only kept for runs played on this device. |
| Awards | 🏆 Player of the Season · 🌟 Best U21 | Player of the Season · Best under-21 |
| Career empty | 🏟️ No career yet. Finish some runs. | No career yet. Finish a run. |
| Career guest | 🔒 Sign in to build a career. | Careers need an account. `KEEP MY RUNS` |
| Achievements footnote | Difficulty badges light up from your saved runs — win a mode on a difficulty and it stays earned. Custom shows the hardest custom run you've won (0–11 scale). | Win a mode on a difficulty and its badge stays. Custom shows the hardest custom run you've won, on a 0–11 scale. |
| Older run notice | Full tournament details aren't saved for this older run. Play a new Champions League to see the complete league table and bracket here. | This run is older than the full bracket and table. New runs keep everything. |
| Save, new | *(silent)* | `"SAVED"` · `COULDN'T SAVE · RETRY` · This run won't be kept. `KEEP IT` |

---

## 10. Errors and missing data

| Where | Today | Proposed |
|---|---|---|
| Placement, no UCL data | No UCL data found. Run the database seeder first. | This competition's data didn't load. `TRY AGAIN` `CHANGE MODE` |
| Placement, too few clubs | Only {n} UCL clubs found. Seed at least 8 clubs to play. | Not enough clubs loaded to play this. `CHANGE MODE` |
| Placement, no WC data | No FIFA World Cup data found. Run the database seeder first. | The World Cup data didn't load. `TRY AGAIN` `CHANGE MODE` |
| Draft, no squad | No squad drafted yet. / Back to Draft | There's no squad yet. `BACK TO THE DRAFT` |
| Sim, nothing to play | No squad or placement found. / ← Back to Mode Select | This run lost its place. `START AGAIN` |
| Results, nothing | No simulation result found. / ← Back to Modes | There's no result to show. `PLAY A RUN` |
| Match stats, nothing | No detailed stats available for this match. | No stat sheet for this match. |
| Any failed list fetch *(today: shows the empty state)* | | Couldn't load this. `RETRY` |
| Not found *(new)* | *(expo-router default)* | "WRONG PITCH" / `BACK TO PLAY` |

---

## 11. The Guide, rewritten

Medium intensity. Organised by task. Every fact in the current text survives unless it's flagged.

### Start a run
Pick where you play, how hard it is and a formation. Then draft a squad from real club-seasons, get placed somewhere in the world, and watch the competition play out. You finish on a tier: Perfection at the top, Absolute Misery at the bottom. Cup modes grade you on how far you got.

### The draft
Spin, and you land on a real club-season, like Ajax 2011/12. Pick one player from its squad who fits a position you still need. Players can cover nearby positions (a right winger at right midfield, a centre-back at full-back) for a small rating penalty, and the draft shows the adjusted rating before you commit. Keep going until all eleven are filled. Depending on difficulty, you get rerolls to skip a bad spin.

You can move a player later: into an open position, or swapped with a teammate if both fit each other's spots.

### The bench
After your eleven, spin for up to five subs the same way. Subs only come on in the second half, and they score and assist less often than starters. A small `SUB` tag marks their goals and assists, for every team. Every match sheet shows the real substitution minutes. You can play without a bench; then nobody gets one.

### Where you land
A globe spins and your country lights up.
- **All Time, League, Chaos, Cursed:** you take over a real club in a real season.
- **Champions League, finals:** you take over any club in that edition, big or small.
- **Champions League, full path:** you play a domestic season first; where you finish decides your route into Europe.
- **World Cup:** you take over one of the 48 nations.

### The season
League rounds update the table as they're played, and you can look back at any round. Your own World Cup group matches and every knockout tie play on a ticking clock, and the rest of the round waits until yours is over. You can pause a live match at any point, including between legs and during a shootout.

### Knockouts
You see the whole bracket before the first round. Pinch to zoom, drag to move around, double-tap to reset. Champions League ties have two legs, with home and away swapped. If it's level after extra time, it goes to penalties, taken by named players from your squad.

### Reading a match
Tap any finished match anywhere in the game. You get the team stats, a minute-by-minute timeline, both lineups with a rating out of 10 for every player, team ratings and the player of the match. The stats follow the result without copying it: a strong side can lose 1-0 while creating far more. Open the same match again and every number is identical.

### Ratings and awards
Every player builds an average rating and a player-of-the-match count over the run. The stats screen ranks goals, assists, clean sheets, ratings and more, and every player opens into a match-by-match log. Player of the Season and Best U21 weigh ratings and player-of-the-match awards alongside goals, assists and clean sheets, so a dominant holding midfielder can beat a striker to it.

### Difficulty and score
Difficulty changes the draft (rerolls, and whether you see ratings) and how hard your own matches are. Only your club's matches are affected; the rest of the competition plays straight.
- **Easy:** 3 rerolls, ratings shown, your matches tilt your way.
- **Medium:** 1 reroll, ratings shown, matches play it straight.
- **Hard:** no rerolls, ratings hidden, the AI leans against you.
- **Custom:** set rerolls (0–10), ratings on or off, and a 1–10 level from Baby Mode to Absolute Misery. Easy, Medium and Hard sit at 2, 4 and 6.

Harder settings score more. Rerolls and visible ratings cut your score; a blind Absolute Misery run is worth the most.

### Achievements
For every mode, Achievements shows which difficulties you've won a trophy on, plus your hardest Custom win on a 0–11 scale (0 is Baby Mode with ten rerolls and ratings on, 11 is Absolute Misery, no rerolls, drafting blind). It updates from your saved runs.

---

## 12. About, humanized

Medium intensity, first person kept, every fact kept.

> I'm a high school student from Slovakia, and Perfection or Misery is a solo project I build in whatever time school leaves me. Every mode, every screen and every line of the simulation engine. When the knockout bracket needed pinch-to-zoom or the globe needed to spin, I worked out how to build it.
>
> The idea comes from 38-0.app. I loved it and kept noticing things I'd do differently, so I made my own version with deeper simulation, real competitions and a lot more drama. It has grown into a Champions League path across all 53 UEFA leagues, a 48-team World Cup, live matches on a ticking clock, and FotMob-style stats with player ratings for every simulated match.
>
> **Under the hood**
> - React Native and Expo Router, with state in Zustand.
> - Club and player data from 50+ leagues in a local SQLite database, so the game runs offline.
> - A custom engine decides every match from team ratings, form and controlled randomness, goal by goal.
> - On top of it, every fixture gets a full stat sheet: possession, xG, passing, duels, a rating out of 10 for every player and a player of the match. That's thousands of matches per run, each rebuilt from one stored seed, so reopening a match shows the same numbers.
> - Champions League and World Cup knockouts handle two legs, extra time and shootouts, with named takers from your squad.
> - The globe on the draft, the placement and this page is a from-scratch map projection in SVG. No map library, just spherical trigonometry.
> - Live matches run on a real clock you can pause, and the knockout bracket zooms and pans like a map.
>
> Built with React Native, Expo, Zustand, SQLite and Supabase.

---

## Changes (humanizer summary)

- **Puffery cut:** "legendary achievement that will never be forgotten", "etched in glory", "Simply sensational", "Crown yourself the best club in Europe", "Become the champion of the world", "a full football universe". None carried a fact.
- **Exclamation marks removed** from every tier line and empty state.
- **Summary tails cut:** "and your fans will celebrate for decades", "Continental nights await", "Total heartbreak".
- **Changelog language removed** from the Guide ("— now —", "now weigh"), which described the game's history rather than the game.
- **Rhythm rebuilt:** the Guide's paragraph-length bullets split into short sentences of varied length; the About text went from three long paragraphs to two short ones and a list.
- **Em dashes:** 29 in UI strings; the rewrites use 2.
- **Left alone on purpose:** "Ready to suffer?", "Start suffering.", the screw-level taglines other than one, the Deep Match lines, and the loss ceremony line. They already sound like a person, and like this game.

## Flags

Things the source says that are wrong, contradictory or risky. The humanized copy did not fix them silently.

1. **"11 real shapes"** in the Guide. There are 12 formations.
2. **"ULTIMATE PERFECTION"** (result card, Guide) versus "Perfection" everywhere else. Resolve with §2.1.
3. **"Your guest runs stay."** on the register screen. Guest runs are never saved, so this promise is false today.
4. **"The board is furious."** PoM has no board. It's flavour presented as a fact.
5. **"You literally cannot lose."** (Baby Mode) is a claim the engine may not guarantee. Keep only if level 1 truly can't lose a match.
6. **The "Sweaty" tagline quotes a song lyric.** It shouldn't ship in a public release.
7. **Formation descriptions promise tactics** ("works best with technical midfielders", "can dominate midfield", "exposed on the counter"). The engine rates positions but models no chemistry or tactical style.
8. **Achievements' scale:** the summary tile says "/10", the footnote says "0–11".
9. **"Your score is based on your final position, team OVR, and bonus points…"** in the Guide doesn't mention the difficulty multiplier the same Guide explains two sections earlier.
10. **"VIEW FINAL RESULTS & REWARDS"** promises rewards that don't exist.
11. **"shot maps"** in About's list of what the stat generator produces. The match sheet has shot counts and splits but no shot map. The humanized About leaves it out of the list; restore it only if a shot map ships.
12. **About's version "1.0.0"** doesn't match `app.json` (0.0.1).
