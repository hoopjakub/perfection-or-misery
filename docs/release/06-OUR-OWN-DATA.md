# 06 · Data of our own

> Part of the [release set](00-README.md). Status: **needed now, first in Phase 8.5** (raised 29 September 2026, evening). **Not legal advice.** Companion to [01](01-NAMES-MARKS-AND-THE-LAW.md) L4 and [07](07-ASKING-TRANSFERMARKT.md).
>
> The maintainer, after reading further notes on scraping in the EU: "it may be an actual problem if I do speak up about it, meaning we have to change it pretty soon and actually change it right now." This document started as a fallback in case Transfermarkt said no. **It's now the plan**, whatever Transfermarkt answers.

## 1 · Why it's urgent

### 1.1 Transfermarkt's terms forbid how the data was collected
Transfermarkt's Terms of Use, §11.1, read on 29 September 2026 at [transfermarkt.com/intern/anb](https://www.transfermarkt.com/intern/anb):

> "The User is not permitted to access or copy the Digital Content using bots, spiders, screen scraping or other automated processes."

The same clause forbids using the content to train or develop AI and **expressly reserves text and data mining** under §44b of the German copyright act (the opt-out that turns off the EU's general data-mining exception for their site). The company is Transfermarkt GmbH & Co. KG in Hamburg.

The game's squads, minutes, market values and crests were all collected by scripts (`scripts/lib/transfermarkt.ts`, `scrape-league.ts`, `scrape-ucl.ts`, `scrape-wc.ts`, `scrape-custom-ucl.ts`, `scrape-crests.ts`, `scrape-stadiums.ts`, and the crest colours in `scripts/lib/colors.ts`). That's the collection method the terms forbid. The only other outside source the scripts use is `flagcdn.com` for flags.

### 1.2 The database right
The EU gives a database's maker a *sui generis* right when getting, checking or presenting its contents took substantial investment (Directive 96/9/EC). Extracting a substantial part, or repeatedly extracting small parts, needs permission. Transfermarkt's volunteer-maintained squads, stats and market values are the kind of database this right protects, and the game bundles a large extract of it in every build.

**A correction to the notes the maintainer found:** they cite *Ryanair v PR Aviation* (CJEU, C-30/14, 15 January 2015) as confirming the database right against scraping "facts". It says something different, and for us it's worse. The court held that a database **not** protected by copyright or the database right falls outside the Directive, so its owner can restrict use **by contract**, through the site's terms ([Pinsent Masons](https://www.pinsentmasons.com/out-law/news/website-operators-can-prohibit-screen-scraping-of-unprotected-data-via-terms-and-conditions-says-eu-court-in-ryanair-case), [Kluwer Copyright Blog](https://legalblogs.wolterskluwer.com/copyright-blog/ryanair-ltd-v-pr-aviation-bv-contracts-rights-and-users-in-a-low-cost-database-law/)). So either Transfermarkt's database is protected by the database right, or its terms bind anyone who uses the site. Either way, arguing "it's only facts" doesn't help.

### 1.3 GDPR, and why a new source doesn't make it go away
Player names, dates of birth and nationalities are personal data. The Dutch data protection authority's guidance of 1 May 2024 called scraping personal data "almost always" a breach of the GDPR, and it reads "legitimate interest" narrowly: purely commercial interest doesn't count ([Pinsent Masons](https://www.pinsentmasons.com/out-law/news/dutch-web-scraping-guidance-warn-businesses-gdpr-breach-risk), [Securiti](https://securiti.ai/scraping-almost-always-illegal-netherlands-dpa-declares/)). That's one regulator's view, and Dutch lawyers criticised it (for example [Ius Mentis](https://blog.iusmentis.com/2024/05/02/autoriteit-persoonsgegevens-bedrijven-mogen-internet-vrijwel-nooit-scrapen-nou-nou-nou/)), but it shows the direction.

**What the notes don't say:** the GDPR applies to the data, not only to the scraping. A database of real players built from Wikidata is still personal data about real people. Changing the source fixes the contract and database-right problem; the GDPR needs its own answer:
- **Minimise:** store what the game needs (name, position, nationality, age *in that season*), not a full date of birth, never contracts, agents, fees or anything private.
- **A lawful basis written down:** legitimate interest in a free, non-commercial game about publicly known professional careers, with the balancing test recorded. A lawyer should read it.
- **Transparency and objection:** the privacy page says the game contains public football careers, where they come from, and how a player can ask to be removed, and removal is honoured.
- **The legal flavour's altered names** ([01](01-NAMES-MARKS-AND-THE-LAW.md) L1) take most of this away: an altered name isn't about an identifiable person.

### 1.4 The risk, in the notes' own terms

| Risk | Scenario | Where PoM is today |
|---|---|---|
| Low | A few pages, personal or research use, not redistributed | Not here |
| Medium | Systematic scraping into a personal database | The personal flavour on the maintainer's phone |
| **High** | Republishing the data, large-scale collection, any commercial use | **Any public build, the web build, and speaking about it publicly with the data still in use** |

The web build at `perfection-or-misery.vercel.app` is already public and loads the same database. **It's in the high row today.**

## 2 · What the game needs

Read in `scripts/lib/transfermarkt.ts`, 29 September:

| Field | Used for | Hard to replace? |
|---|---|---|
| Squad per club-season | The draft, every mode | No: facts, several open sources |
| Name, position, age, nationality | Cards, flags, positions | No |
| Appearances, minutes, goals, assists | The playing-time term in OVR, stats | Medium: open coverage is thinner |
| **Market value** | **The base of every OVR** (`deriveOvr`: `73 + 8·log10(value)`, then age and minutes) | **Yes.** It's Transfermarkt's own estimate; only a licence gets it |
| Crests, crest colours, stadiums | Personal-flavour crests, club colours, grounds | Crests: drop them. Colours and stadiums: open sources |

## 3 · Sources

### 3.1 Free and open (the base)

Checked 29 September 2026 unless marked:

| Source | What it has | Licence | Use |
|---|---|---|---|
| **Wikidata** | Players, clubs, spells at clubs with dates (`P54` with `P580`/`P582`), club colours (`P6364`), stadiums, competitions | **CC0 (public domain)** | **The backbone:** identity, squads, colours, grounds |
| **openfootball** (`football.json`, `europe`, `worldcup.json`) | Fixtures and results, big leagues from 2010/11, European leagues, World Cups | **Public domain (CC0)** | Club strength from results (§4.4); who was in which league |
| **Wikipedia** (player career tables, infoboxes, club-season and league-season articles) | Squads, appearances and goals per club-season, league tables, careers | Text under CC BY-SA 4.0; facts taken with credit; automated access allowed under its API rules (§4.3) | **The main source** (decided 29 Sept, §4.1–§4.3) |
| football-data.co.uk | 30+ years of results and odds as CSV, top leagues | Free to download; **terms not checked** | Odds are a strong club-strength signal, if the terms allow |
| football-data.org (free tier) | Fixtures, standings, some squads, about 12 competitions | Free tier **non-commercial**, credit required | Current seasons only |
| StatsBomb open data | Event data for selected matches | Free, **non-commercial**, credit with logo | Too narrow for the game; fine for a thesis chart |
| BigBallsData | Per-season player stats for the top five leagues (from the maintainer's notes) | **Not checked** | Check the licence before use |

### 3.2 Paid APIs (from the maintainer's notes; prices not re-checked)

| Source | Claimed | Price (as noted) |
|---|---|---|
| API-Football (API-Sports) | Multi-season player stats, transfers, line-ups, hundreds of competitions | about $19 a month (Pro) |
| TheStatsAPI | 84,000+ players, 10 years, xG, odds, 150+ competitions | about $50 a month |
| Sportmonks | 2,500+ leagues, history from 2000 | about €99 a month |
| iSports API | 20+ years, season stats | Varies |
| Sportradar, Opta / Stats Perform | Official, league-licensed | Enterprise contracts |

**The catch with paid APIs:** they license **access through the API**, usually for display in your app while you pay. PoM **ships a database inside the app** and works offline. That's storing and redistributing the data, which API terms commonly restrict, and the rights may end when the subscription does. **Before paying for any of them:** read its terms for "store", "cache", "redistribute" and "offline", and get written confirmation that a bundled database in a free app is allowed. Until one says yes in writing, none of them is a drop-in replacement.

### 3.3 Not usable

| Source | Why |
|---|---|
| Transfermarkt (scraping) | §1.1 |
| **FotMob** | Its terms prohibit it, per the maintainer's notes (**not re-read this session**). Its data is licensed from Opta. The notes say its CEO once offered a researcher Excel exports; that's a one-off permission, not a licence |
| **Sofascore** | No public data licence found; only by asking them |
| FBref / Sports Reference | Terms forbid automated access; data from Opta |
| SoFIFA / EA FC ratings | EA's data |
| Kaggle/GitHub datasets scraped from Transfermarkt | They carry Transfermarkt's problem |

**Sibling note:** The Dugout's data came from a FotMob scrape (its memory notes). The same problem applies there if it's ever public.

## 4 · The plan: a PoM rating from facts

**Decided 29 Sept:** options **1, 2, 3, 4 and 8** of §5.2. **Wikipedia is the main source** (the maintainer: "Wikipedia should be a great enough source"), with Wikidata as the id and join layer, openfootball for results, and **league strength built into the rating**.

### 4.1 What Wikipedia actually has (probed 29 September)

Five API requests, read as wikitext:

| Where | What's there | Example |
|---|---|---|
| **A player's "Career statistics" table** | Season by season, per club: division, league apps and goals, cups, continental, total. A fixed shape ("Appearances and goals by club, season and competition") | Thierry Henry: `Club · Season · League (Division, Apps, Goals) · National cup · League cup · Continental · Other · Total` |
| **A player's infobox** | Every spell: years, club, league apps and goals (`years1`, `clubs1`, `caps1`, `goals1`…) | Henry: seven spells, 1994–2014 |
| **A club-season article** (big clubs) | A "Player statistics" table: number, position, nationality, name, apps and goals per competition | *2003–04 Arsenal F.C. season*: 34 players used, apps with substitute appearances in brackets, cards |
| **A club article** (any club, even small) | The **current** squad: number, position, nationality, name | *S.P. Tre Penne* (San Marino): 20 players, as of April 2026 |
| **A league-season article** | The clubs, the final table, often top scorers | *2015–16 Slovak First Football League* exists; *2015–16 FC Spartak Trnava season* doesn't |

The maintainer's reading holds for the big leagues: history goes deep (clubs' league positions back to the 1880s; season articles; most players' whole careers). For small leagues only the **current** squad is on the club's page, so their historical squads have to come from the players' own pages.

### 4.2 Player-first, not club-first

Because club-season articles exist only for big clubs and their tables are hand-made (each one laid out a little differently), the reliable shape is the **player's career table**, which is the same template everywhere. So the pipeline works backwards:

1. **Which clubs, which seasons:** the league-season articles (clubs and final table), cross-checked with openfootball.
2. **Who might have been there:** Wikidata's club spells (`P54`, with start and end dates) for each club, plus the club-season article's squad where one exists, plus the current squad on the club's page.
3. **Who was there, and how much they played:** each candidate's own page. Take the career-statistics row for that club and season (league apps, goals). With no table, fall back to the infobox spell (years, apps over the spell, spread across its seasons, flagged as an estimate).
4. **Keep the ids:** the Wikidata id (`Q…`) is the player id; the Wikipedia page is the evidence.
5. **A coverage report** per club-season: players found, how many from career tables and how many from infobox estimates, and the squad size. Below about 18 players, the club-season isn't used.

### 4.2a What the probe measured (30 September 2026)

`scripts/probe-wikipedia.ts` (on `scripts/lib/wikipedia.ts`), three league levels, about 1,050 requests on the first run, zero on re-runs (cached). "Today" is the Transfermarkt-built squad size, used only as a yardstick.

| League-season | Route | Clubs with ≥18 players | Avg squad | What each player carries |
|---|---|---|---|---|
| **England 2018–19** | history: club players category + Wikidata spells → career row | **20 / 20** | 25.8 who actually played (today 27.8 incl. unused) | **92% confirmed by a career row** (league apps and goals for that season); 8% infobox estimates |
| **Slovakia 2025–26** | current: club page squad | **12 / 12** | 27.1 (today 26.2) | Name, number, position, nationality for all; 64% have an article and a birth date; playing time from a career row 16%, from infobox apps at the club 34% |
| **San Marino 2025–26** | current: club page squad | **15 / 16** (the U22 academy side has no squad listed) | 22.0 (today 27.1) | Name, number, position, nationality for all; only 11% have an article; almost no ages or apps |

**What it changed:**
1. **Two routes, as the game has two kinds of club-season.** Top leagues' past seasons: player-first. Every other association's current season: the club page's squad, with the players' own pages adding age and playing time where they exist.
2. **Categories, not only Wikidata, for candidates.** Wikidata's club spells missed real squad members (6 of 18 checked at Wolves, Rúben Neves among them); the club's players category found them. With categories, England's weakest clubs went from 12–14 players to 20–29.
3. **Three levels of data, so the rating needs a confidence per player.** Full (a season row: apps, goals, age), partial (age, maybe spell apps), and bare (name, position, nationality only, which is most of San Marino). A bare player is rated from the league band, the club's table position and his position, with a small spread: honest, and the minnows play like minnows.
4. **Traps now handled in the library:** "unknown value" dates in Wikidata come back as a link, not a date, and silently failed the date filter (Conor Coady vanished); older career tables put the season before the club; Slovak clubs keep the squad under `==Players== / ===Current squad===`; newer league tables write the order as `team_order = …` with non-ASCII codes (ŽIL); a whole-league query was cut off mid-response, so queries go one club at a time.
5. ~~**Worth probing next:** the local-language Wikipedias~~ *(Probed 30 Sept, `scripts/probe-local-wikis.ts`: not worth it.)* For every player in the English squad lists, a Slovak or Italian page was looked for through the Wikidata sitelink, the local club page's squad list, and a page under his name.

   | | Article | Age | Playing time |
   |---|---|---|---|
   | Slovakia, English only → with sk.wikipedia | 64% → **64%** | 64% → 64% | 34% → 40% |
   | San Marino, English only → with it.wikipedia | 11% → **13%** | 11% → 13% | 6% → 9% |

   Every Slovak page found belonged to a player who already had an English one; San Marino's Italian club pages list the squad but link almost nobody. **So the pipeline stays English-only**, and the local libraries (`lang` in `scripts/lib/wikipedia.ts`) stay available for later spot uses.

### 4.2b The first calibration (30 September 2026)

`scripts/lib/open-rating.ts` (the model), `scripts/lib/open-squads.ts` (the history route as a library), `scripts/calibrate-open-rating.ts` (the report). England 2018–19, 474 players, **no valuation data anywhere in the model**; today's ratings are printed beside ours as a yardstick only.

| | Ours (v1) | The game today |
|---|---|---|
| Mean | **81.0** | 81.2 |
| Spread (sd) | 5.2 | 4.6 |
| Range | 65–92 | 60–92 |
| Correlation with today's | **0.84** (from facts alone) | |

- **Our top 15** reads right: Salah 91, then Laporte, Bernardo Silva, Sterling, Van Dijk, Mané, Milner, Kanté at 90, Agüero, Ederson, Gündoğan, David Silva, Alisson, Hazard, Eriksen at 89.
- **Fixed in v1:** one-game squad players at a top club came out at 78–81 (the club level carried them), so the role penalty is steeper below a regular's share. The band was then raised a point to re-centre the mean.
- **Known limits, for the next version:**
  - Veteran backup keepers (Čech, Speroni, Forster) are marked down for not playing, because nothing factual says "was good".
  - **January signings** (Almirón) are measured against the whole season rather than the games after they arrived. The fix: take the share of games available since the spell began, from the career row or the infobox years.
  - Good players at relegated sides (Fulham's Seri, Anguissa, Mitrović) sit lower than their reputation. That's the club-level design working as intended; measuring production against the team's own goals would soften it.
  - Wolves' average ranks above Arsenal's because a small squad of ever-presents all score high on role. Worth a look when the club averages feed team strength.

### 4.2c The full build (from 30 September 2026)

`scripts/build-open-seeds.ts` rebuilds every competition the modes use and writes seeds in today's shapes to `scripts/seed-open/`, so `build-db.ts` and the app don't change.

| What | Route | Source article |
|---|---|---|
| Five leagues, 2018–19 to 2025–26 | history, all seasons of a league at once (one player page serves his whole career) | `scripts/lib/open-leagues.ts` maps each league-season to its article; `scripts/check-open-leagues.ts` confirms 85 of 88 parse to the right club count |
| 55 associations, 2025–26 | current (club-page squads); the five reuse the history build | same map |
| Champions League 2024–25 and 2025–26, Europa and Conference League 2025–26 | each club's squad from its league build; 2024–25 sides from outside the five by the history route for that one club, rated as a runner-up in their association's band | — |
| World Cup 2026 | the squads article (48 × 26, with birth year, caps, club) | `2026 FIFA World Cup squads` |

**Rules settled this round:**
- **Low-data players (the maintainer, 30 Sept):** where Wikipedia has little on a league or a player, "they aren't probably the best players in their squad, so we can assign numbers ourselves". So a *bare* player (a name, position and nationality) sits about 3 below his club's level, with a small fixed spread from his name so a squad isn't flat. The players someone wrote an article about are rated from their facts.
- **League bands from the association rank:** six anchor points read off the game's current scale (rank 1 ≈ 81 average, 5 ≈ 77, 9 ≈ 72.5, 20 ≈ 69.5, 35 ≈ 66, 55 ≈ 62), and the club spread narrowing from 8.5 to 5. Rank 1 reproduces England's calibrated band exactly.
- **January signings:** an infobox spell starting in the season's second calendar year halves the games he could have played.
- **Seasons in progress:** "games he could play" is the matchdays so far, read from the league's most-used player.
- **Nationality** from Wikidata ("country for sport", else citizenship) with its demonym, written in whichever form the app's `flagForNationality` turns into a flag.
- **Club counts that differ from today's game:** Kazakhstan 2025 (Wikipedia 14, game 16), Malta 2025–26 (12 vs 14), Lithuania 2025 (10 vs 9). Wikipedia's table is taken as right; the old scrape looks out of date.
- **Not carried over:** `stadiums.json` (Transfermarkt-derived; the grounds get their own Wikidata step). Club colours still come from today's seeds for now (the one Transfermarkt-derived field left, §4.8).
- **Assists and minutes:** Wikipedia's career tables record league apps and goals only, so the rebuild has no assists or minutes.
- **Scale:** the category of a big club runs back to its founding, so candidates are thinned by birth year in one Wikidata query per 150 names before any page is fetched, and player pages are cached trimmed to their lead, infobox and career table (`getPlayerPages`).

### 4.2d The full build's result (30 September 2026, evening)

1,678 of 1,716 club-seasons, 47,113 player-seasons (96% of today's count), 99.2% with a flag; `verify-open-seeds.ts` passes, and on the open database `verify-draw`, `verify-europe-path`, `verify-zones` and `verify-club-codes` pass (`verify-nationality`: 11 rare values without a flag, chiefly "British", 42 players whose Wikidata record says United Kingdom and not a home nation). Per league: Premier League 92%, La Liga 88%, Serie A 98%, Ligue 1 112%, Bundesliga 92%, the 55 associations 93%, Champions League 103%, Europa League 94%, Conference League 98%, World Cup 100% (1,248 of 1,248). Over 100% is real: our squads count everyone who played for the club that season (January leavers included), today's lists one moment's squad. Review: [`open-data/Open data coverage.xlsx`](<open-data/Open data coverage.xlsx>).

Found and fixed on the way (each one was silently losing or inventing players):
- Wikipedia links a club only at its **first mention** in a career table; later spells are plain text ("Newcastle United", "Watford"), which read as the next link in the row ("Premier League") and dropped whole spells. Now the cell's text, mapped to the link earlier in the same table (bare "Watford" resolves to the town).
- Spanish clubs file players under **"X footballers"**, not "X players" (Getafe had 8); SPAL's category is under a **short name** that's neither its link nor its article (from Wikidata's aliases).
- **Club matching** was per club and broke ties badly (AC Milan and Lyon vanished from every season); now one-to-one with Wikidata aliases, initials (HB, KÍ), letters NFD doesn't fold (ı, ł) and a spelling fallback (Nürnberg/Nuremberg), in `scripts/lib/club-match.ts`.
- The **game's own line-ups for several small leagues were a season out of date**: the build follows Wikipedia's 2025 tables, gives 27 promoted clubs new identities (colours from Wikidata where it has them), and leaves 32 no-longer-top-flight clubs out.
- The infobox fallback **padded** squads with players away on loan or with no apps (Parma 2020–21: 50); it now needs apps and no loan elsewhere, with a looser pass only where a club couldn't field a team.
- **FIFA codes** sit on national teams and federations; nationality for squad-list players now comes from the countries' IOC codes (flags 59.7% → 99.2%).
- Five clubs with no squad anywhere open (Kazincbarcika, Primorje, Domžale, Rabotnički, Pas de la Casa, all bottom half) are left out of the pool; thin squads are topped up from the club's own history, then Wikidata (capped at 22, youngest first).

### 4.2e The switch, and the empty-team bug (30 September 2026, night)

The maintainer played on the open database and asked to switch fully; `npm run build-db` now builds from `scripts/seed-open/`. His playtest found empty teams (Chelsea, Barcelona) in every mode. Cause: `build-db.ts` keys a player-season on `${player.id}_${year}` and skips repeats (`INSERT OR IGNORE`); the old seeds give each competition's copy its own suffix (`_ucl`, `_uel`, `_uecl`, `_cucl`, `_nt`), the open seeds didn't, so 7,611 player-seasons went to whichever file loaded first and the other copies came out empty or with a handful. Fixed with the old suffixes, a club-specific id for a player at two clubs of one league in one season, and a hash id for names in scripts slugify strips. Guards: `verify-open-seeds.ts` fails on any repeated id, and `build-db.ts` now exits with an error if any club-season has no players. The database has all 47,113 player-seasons (smallest squad 14, average 28).

Crests: 957 of the database's 1,031 clubs have one; the rest are the 48 national teams (flags) and the 26 promoted clubs new to the game.

### 4.3 How it's fetched (allowed, unlike the others)

Wikipedia is the one big source whose rules allow automated access, on conditions ([API etiquette](https://www.mediawiki.org/wiki/API:Etiquette), [User-Agent policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy), [Robot policy](https://wikitech.wikimedia.org/wiki/Robot_policy)):
- A **User-Agent naming the tool and a contact** (the project's address, `perfectionormisery@gmail.com`, never a personal one), with "bot" in it; never a browser's.
- **One request at a time** (at most three at once), under five a second unauthenticated; `maxlag=5` on batch requests, and a pause when told to wait.
- **Ask for wikitext through the Action API** (`action=parse&prop=wikitext`) or the REST API and parse the templates; don't scrape rendered HTML. For a full rebuild, the **database dumps** avoid hitting the live site at all.
- **Cache every page** locally, so a re-run re-reads the cache, not Wikipedia.
- A wikitext parser in the scripts only, never the app (for example `wtf_wikipedia`, MIT; check at build time).
- **Credit:** "Contains data from Wikipedia (CC BY-SA 4.0) and Wikidata (CC0)" on About and in the licences screen. Only facts are taken, no article text, so share-alike doesn't reach the game's code.

So the presentation line holds exactly: most good sources don't allow it, Wikipedia does, and the data was built from there.

### 4.4 How strong the club was, and the league
The maintainer: league strength must count. Three layers, all from facts:
1. **League level:** the association's UEFA coefficient for that season (published figures, also tabled on Wikipedia) sets the league's band. A title winner in San Marino and one in England shouldn't be anywhere near each other.
2. **Place in the league:** the final position from the league-season article moves the club within the band.
3. **Form across the season:** a club **Elo** from openfootball's public-domain results (and European ties), which catches what a table doesn't (a strong side that finished fifth).

Club level = league band + position offset, nudged by Elo. The same idea The Dugout's rating uses: the league sets the band, the rest places you in it.

### 4.5 How good the player was in that team
`OVR = club level (§4.4) + role in the squad + production + age curve`
- **Role:** share of the season's league appearances (Wikipedia has apps, not minutes; substitute appearances count less where a season table shows them in brackets).
- **Production:** goals and assists per appearance, weighted by position.
- **Age:** the current model's curve, as a correction.
- **Calibration:** tune the constants so the distribution matches today's game, because every mode's balance sits on it (the rating scale is a currency: move it and every threshold built on it moves too). Compare against today's OVR for the seasons both have: a correlation and a list of the biggest disagreements to read by eye. This comparison is done once, offline, in the scratchpad, and **the old database never goes into the new build**.

### 4.6 Names in the public build (option 8)
The legal flavour ships altered names ([01](01-NAMES-MARKS-AND-THE-LAW.md) L1) and lets the player rename any player or club in the app, stored on the phone. The game never ships, hosts or links to a file of real names made by someone else.

### 4.7 Filling the gaps (option 3)
Where a club-season the modes need is thin, the maintainer (or a volunteer) adds the missing spells to **Wikidata** or the missing career rows to **Wikipedia**, from clubs' own sites, league sites and match reports, never from Transfermarkt or FotMob. It then comes in through the same pipeline, and it improves Wikipedia for everyone, which is worth a line in the thesis too.

### 4.8 Colours, grounds, flags
Club colours from Wikidata (CC0) with a hand-picked fallback; stadiums from Wikidata. Flags stay on flagcdn (**check** its licence; the flag artwork it serves is usually public domain or CC0).

### 4.9 Where it runs
New `scripts/build-open-*.ts` writing `players_open_vN.db` with the same schema, so the app doesn't change. Attribution (Wikidata, openfootball, Wikipedia) goes on About and in the licences screen.

## 5 · What happens to the Transfermarkt data

| Now | Recommendation |
|---|---|
| The scrape scripts | **Stop running them from today.** Keep them in history until the open build replaces them, then delete them (the maturita can describe them from git history) |
| The web build | **The first thing to switch** to the open database, because it's public now. Until then, consider taking the web build down or limiting it to the maintainer; that's his call |
| Public APK or site download | None ships with Transfermarkt data. The legal flavour only ever gets the open database |
| The personal flavour | See §5.1 |
| Crests (`assets/crests`, 772 files) | From Transfermarkt's image host, so the same problem. They go from the legal flavour already; see §5.1 for the personal one |

### 5.1 The personal flavour and the presentation (for the maintainer)
He planned to present on the personal build and to talk about the legal side openly (L5). With what's now known, showing the Transfermarkt-based build to a committee **while** explaining that its data breaches the site's terms is the "speaking up about it" risk he named. **Recommendation:** present on the **open-data build**, and tell the story as it happened: the first version was scraped, research showed why that isn't allowed, and the data was rebuilt from public-domain sources with a rating model of our own. That's stronger in the defence, and it's true. The personal flavour, if kept at all, stays on his phone and isn't shown. **His decision; logged in [`../maturita/06-NOTES.md`](../maturita/06-NOTES.md).**

**Decided 29 Sept: present on the open-data build.** His framing: "I wanted to use web scraping, but realised for most good data sources it's a thing that's impossible and I have to build my own." One word needs changing so it stays true, because the first version *was* built on scraped data and the git history, the docs and anything on the CD show it: **"I started with web scraping, but realised that for most good data sources it isn't allowed, so I built my own."** Same story, same tone, and nothing a committee member can catch out.

### 5.2 · Every option besides scraping

| # | Option | What you get | Cost | Catch |
|---|---|---|---|---|
| 1 | **Public-domain data** (Wikidata, openfootball) | Players, clubs, spells, colours, stadiums, results | Free, no conditions | Gaps in old seasons and small leagues; no minutes |
| 2 | **Openly licensed data with credit** (Wikipedia, CC BY-SA) | Squads, appearances, goals per club-season | Free; credit Wikipedia | Share-alike applies to the text you copy; facts are fine with credit |
| 3 | **Fill the gaps yourself, in Wikidata** | Missing spells and seasons added by you, from clubs' own sites, Wikipedia and match reports, then used under CC0 like everything else | Your time | Must not be copied from Transfermarkt or FotMob into Wikidata either; that moves the problem, doesn't solve it |
| 4 | **Your own rating** (§4) | The one number the game can't do without, from facts | Your time | Needs calibration so the game still feels the same |
| 5 | **Free API tiers** (football-data.org and similar) | Current squads and fixtures | Free, non-commercial, credit | Current seasons only; check that storing it offline is allowed |
| 6 | **Paid APIs** (API-Football about $19/month, TheStatsAPI, Sportmonks) | Deep, multi-season player data | Monthly, for as long as you use it | Offline, bundled storage often isn't allowed; get it in writing (§3.2) |
| 7 | **A licence or permission from the site** (the Transfermarkt enquiry, [07](07-ASKING-TRANSFERMARKT.md); FotMob has given researchers exports) | Their exact data, legally | Usually priced for companies | Slow, may be no |
| 8 | **Player-made data** (the old PES "option file" model) | The public build ships altered or neutral names; players can edit names themselves in the app | Free | The game can't ship or link to someone else's scraped file, or it's back to square one |
| 9 | **Fictional players** on real club-seasons' strength | No personal data at all | Free | Loses much of the appeal; best as a fallback mode |

**Decided 29 Sept:** 1 + 2 + 4 as the base (Wikipedia first, §4), 3 to fill the gaps that matter, 8 for names in the public build. 7 stays open through the email; 6 only if a provider confirms offline storage in writing.

## 6 · Risks

| Risk | Answer |
|---|---|
| Coverage gaps in old seasons and small leagues | The coverage report; the pool gets smaller, not wrong |
| The new ratings feel different | Calibration (§4.5) and a play-test before switching |
| Wikidata errors | Two sources per squad; disagreements listed |
| Real names are still personal data | §1.3 minimisation, a written basis, a removal path; altered names in the legal flavour |
| A paid API looks tempting | §3.2: only with written permission for a bundled offline database |

## 7 · Steps (Phase 8.5, first: P8.5-32)

1. **Today:** no more scraping runs.
2. ~~**Probe (measure before building)**~~ *(Done 30 Sept: §4.2a.)* Three league-seasons at three levels, for example the Premier League 2003–04, the Slovak league 2015–16 and San Marino's 2020–21, run through §4.2. The number that decides the scope: **the share of players found with a career-table row for that season**, per level. If the small league's share is too low, the plan says which leagues and seasons the modes can honestly offer.
3. ~~League band, position offset; the OVR model; the calibration report.~~ *(Done 30 Sept: bands by association rank, model v2, calibration §4.2b; the Elo layer is left out for now, since the table position already carries most of it.)*
4. The full open database for every mode *(built 30 Sept: `scripts/build-open-seeds.ts` → `scripts/seed-open/`; `npm run build-db` puts it in the app; checked by `scripts/verify-open-seeds.ts` and the five DB verify scripts with `POM_DB`)*; the maintainer plays every mode on it; then the web build switched; then the flavours (P8.5-30).
4a. ~~Still Transfermarkt-derived and to replace: club colours, `stadiums.json`, the crests. Then the TM scrapers and TM seeds deleted.~~ *(Done 30 Sept: colours from the Wikipedia infobox kit (871 club records), then Wikidata P6364 (42), with 57 clubs keeping their old colours for now (the gap, in `_report.json`); grounds from Wikidata P115, then the infobox (761 clubs, `src/data/stadiums.ts`); the scrapers, the TM library and `scripts/seed/` deleted (in git history), the game's club identities kept without players in `scripts/seed-identity/`; crests stay for the personal flavour only, P8.5-30.)*
5. ~~The privacy page's section on player data (§1.3), the attribution on About.~~ *(Done 30 Sept: `app/privacy.tsx` "Real footballers in the game", `app/about.tsx` "Data".)*
6. ~~The scrape scripts deleted.~~ *(Done 30 Sept.)* The crest images stay, for the personal flavour only (P8.5-30 keeps them out of the legal build).

**Done when.** The open database covers every mode's minimum pool; the calibration report is written and read by the maintainer; a script confirms the shipped database has no Transfermarkt ids, no market values and no field whose only source is Transfermarkt; the web build serves it; no file in `assets/` came from Transfermarkt's image host.

## 8 · For the maturita

The same game built twice, once on a scraped commercial database and once on public-domain facts with its own rating model, and what that costs in coverage. Logged in [`../maturita/06-NOTES.md`](../maturita/06-NOTES.md).
