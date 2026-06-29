# More Competitions & Modes — Plan & Scraper Reference

Living doc for expanding beyond the top-5 leagues + UCL + WC: more **leagues**, then new **competition types** (international cups, domestic cups) with their own **modes**, **scrapers**, and **stats**. Also records scraper behaviour, the available-league survey, and known caveats.

Status: **planning + partial build.** League scraping (multi-season, full squads, crest colours) is live; cups/modes are not built yet.

---

## 1. Re-scraping & overwrite behaviour (answered)

- **A re-scrape fully overwrites** that league's JSON. `scrapeLeague` builds the club set fresh from the live scrape and `writeFileSync`s the whole file — so running `SEASONS=10` after a `SEASONS=3` run gives you the full 10-season file (not a merge of the two runs).
- **Curated identity is preserved across runs.** `loadExisting()` reads the *current* file first and re-applies each club's `id` / `primary_color` / `secondary_color` / `short_name` / `logo` by normalised name. So once a club has good colours (hand-set or crest-derived), a later re-scrape keeps them. Empty/corrupt seed files are tolerated (caught → treated as "no curation").
- **Implication:** safe to re-run anytime; you won't lose colour curation. The only thing that changes is the season coverage + refreshed squads/values.

---

## 2. Available leagues (surveyed on Transfermarkt)

All codes below were probed live and return the correct club table via the (now relegation-playoff-safe) participant parser. URL shape: `/{slug}/startseite/wettbewerb/{CODE}/saison_id/{YEAR}`.

### Tier-1 European — strong 10-year data (recommended)
| League | Country | TM code | Clubs 25/26 | Data |
|---|---|---|---|---|
| Premier League | England | `GB1` | 20 | A+ |
| LaLiga | Spain | `ES1` | 20 | A+ |
| Bundesliga | Germany | `L1` | 18 | A+ |
| Serie A | Italy | `IT1` | 20 | A+ |
| Ligue 1 | France | `FR1` | 18 | A+ |
| Eredivisie | Netherlands | `NL1` | 18 | A |
| Liga Portugal | Portugal | `PO1` | 18 | A |
| Süper Lig | Turkey | `TR1` | 18 | A− |
| Pro League | Belgium | `BE1` | 16 | A− |
| Scottish Premiership | Scotland | `SC1` | 12 | B+ |

That's a clean **top-10**. Below are also viable:

### Tier-2 European — usable
| League | Country | TM code | Clubs | Notes |
|---|---|---|---|---|
| Super League | Switzerland | `C1` | 12 | good data |
| Bundesliga | Austria | `A1` | 12 | good data |
| Super League 1 | Greece | `GR1` | 14 | good data |
| (Eliteserien NO `NO1`, Allsvenskan SE `SE1`, Superliga DK `DK1`, Ekstraklasa PL `PL1`, Czech `TS1`) | — | — | — | smaller valuations |

### Non-European — available, with caveats
| League | TM code | Clubs | Caveat |
|---|---|---|---|
| Brazil Série A | `BRA1` | 20 | calendar-year season; valuations rougher |
| Argentina | `AR1N` | 28 | **28 clubs**, Apertura/Clausura split seasons |
| MLS (USA) | `MLS1` | 30 | **30 clubs**, calendar-year season |
| Liga MX (Mexico) | `MEXA`/`MEXC` | 18 | Apertura/Clausura split (two codes per year) |
| Saudi Pro League | `SA1` | 18 | great data **only since ~2023**; thin before |

### Second tiers (for future lower-league modes)
| League | TM code | Clubs |
|---|---|---|
| Championship (England) | `GB2` | 24 |
| 2.Bundesliga | `L2` | 18 |
| (LaLiga2 `ES2`, Serie B `IT2`, Ligue 2 `FR2`) | — | — |

**Season-mapping caveats:** `saison_id` = the starting calendar year (2015 = 2015/16). For **split-season** leagues (Argentina, Liga MX) one `saison_id` doesn't map cleanly to one of our seasons — those need special handling before we trust their multi-season output. **MLS/Brazil** are single calendar-year seasons (fine, but the "year_start/year_end" labelling is cosmetic). **Saudi** only has rich market values from ~2023, so a 10-year pull would have mushy/floor OVRs for the early years.

---

## 2b. Leagues whose FORMAT needs custom code (not just a round-robin)

The current sim treats every league as a simple double round-robin of `games_per_season`. Several leagues don't work that way — they need **per-league format handling** (custom fixtures, standings, and sometimes point arithmetic). The scraper already pulls their squads fine; this is about the **sim/standings**, and these are real code changes, not config.

| League | Quirk | What it needs |
|---|---|---|
| **Belgium (Pro League, `BE1`)** | 16 teams play a 30-game regular season, then **points are halved** and it splits into **Champions' Play-offs** (top 6, +10 games — title & Europe decided here) and Europe/relegation groups. Final table ≠ regular-season table. | A two-phase mode: regular season → halve points → playoff mini-league. Until then it's only an approximation as a 30-game round-robin. |
| **Scotland (Premiership, `SC1`)** | 12 teams, 33 games (3 rounds), then the league **splits top-6 / bottom-6** for 5 more games = 38. Who-plays-whom changes after the split. | Split-phase fixture/standings logic. `games=38` covers the count but not the split structure. |
| **Argentina (`AR1N`) / Liga MX (`MEXA`/`MEXC`)** | **Apertura/Clausura** — two championships per calendar year, each its own table + playoffs. 28 (Arg) / 18 (Mex) clubs. | Decide what one "season" means for us, plus playoff brackets. Scrape-wise the `saison_id`↔season mapping is also ambiguous (see §2). |
| **MLS (`MLS1`)** | 30 clubs in **two conferences**, calendar-year, then a large MLS Cup **playoff bracket**. | Conference tables + playoff bracket mode. |
| **Leagues with relegation/promotion play-offs** (Bundesliga, Ligue 1, etc.) | A 16th/18th-place team plays a 2nd-division side in a **relegation play-off**. TM lists those play-off opponents on the startseite (see §6 — parser already excludes them), but the *play-off itself* isn't modelled. | Optional: model the end-of-season relegation play-off. Low priority. |

**Takeaway:** before shipping Belgium / Scotland / split-season leagues as real modes, add a `format` field per league and branch the fixture+standings generator on it. Top-5 are all plain double round-robins, so they're unaffected.

---

## 3. UCL & WC scraper status + the format problem

- **WC (`scrape-wc.ts`)** — built & working. National teams, best ~26 by value, verein ids resolved from the FIFA ranking, `_nt` ids. (See the overhaul doc.)
- **UCL (`scrape-ucl.ts`)** — built on the shared lib (improved ratings, full squads, `_ucl` ids) but **single-season only** and tied to the current 36-team league-phase (Swiss) format.

### ⚠️ The format problem (IMPORTANT — gates UCL/WC back-catalogue)

The scraper just pulls squads; the hard part is that **the competition's structure changed between eras**, so the **sim mode must branch on the edition/season**. These are significant code changes and must be designed before we add historical UCL/WC editions.

**Champions League — two completely different structures:**
| Era | Format | Sim needs |
|---|---|---|
| **…–2023/24** (old) | 32 teams · **8 groups of 4** · top 2 advance · → Round of 16 → QF → SF → Final (two-legged KO until the one-off final) | classic group-stage + 16-team bracket |
| **2024/25–** (current, built) | 36 teams · single **Swiss league phase** (each plays 8 *different* opponents, one combined table) · top 8 → R16 directly · 9th–24th → **knockout play-off round** → R16 → … Final | what `cl-sim.ts` does today |

→ A historical UCL needs the **old group format** path, selected by season. The current `cl-sim` only knows the Swiss model.

**World Cup — 32 vs 48 teams:**
| Era | Format | Sim needs |
|---|---|---|
| **1998–2022** | 32 teams · **8 groups of 4** · top 2 → Round of 16 → QF → SF → Final | 32-team group + 16-bracket |
| **2026–** (current, built) | 48 teams · **12 groups of 4** · top 2 + 8 best third-placed → **Round of 32** → R16 → … Final | what `world-cup-sim.ts` does today |

→ A historical WC needs the **32-team format** (groups of 4 → R16) plus "best third-placed" logic differences; the current `wc-sim` is 48-team only.

**Also format-specific (future):** EURO (24 teams: 6 groups of 4 → R16 incl. best thirds), Copa América, Europa/Conference League (their own group/Swiss eras).

**Design note:** introduce an explicit `format`/edition descriptor on the competition (e.g. `ucl_group_8x4`, `ucl_swiss_36`, `wc_32`, `wc_48`) and have the sim pick the bracket+group logic from it, rather than hard-coding the current format. Parked deliberately until we build modes (below).

---

## 4. Planned competitions & modes (roadmap)

Each new competition = **scraper** (participants + squads, reusing the shared lib) + **sim mode** (its format) + **stats** wiring (the existing attribution/awards/career system, adapted to the format).

### 4.0 — Mode menu: Normal vs Special (UI, DONE)

The **Choose Mode** screen (`app/game/mode-select.tsx`) is split by a top segmented
control into two categories (`ModeCategory = 'normal' | 'special'` on each
`ModeConfig`):

- **Normal Modes** — the draft-an-XI-into-a-domestic-league experience and its
  variants: **All Time, League, Era, Chaos, Cursed**. These share one sim shape
  (a league season) and differ only in pool/visibility/reroll rules.
- **Special Modes** — real competitions with their **own formats**: **Champions
  League, World Cup** today; **EURO, Copa América, Europa League, Conference
  League, Copa Libertadores**, domestic cups, etc. as they land. Every item in
  Phases A–B below is a *special* mode.

New competitions are added by appending a `ModeConfig` with `category: 'special'`
(+ its `GameMode` id, scraper, and sim branch). The categories list is `CATEGORIES`
in the same file. This split is also the natural home for the **full-competition
journeys** described in §8.

### Phase A — International cups
- **UEFA EURO** — national teams (reuse `scrape-wc.ts` machinery: NT parser + FIFA-ranking id resolution), 24 teams, group stage → knockout. Mode ≈ a 24-team WC variant.
- **UEFA Europa League** & **Conference League** — clubs (reuse the UCL machinery), league-phase/Swiss or group + knockout depending on season. `_uel` / `_uecl` id suffixes.
- **Copa América** — national teams, like EURO.

### Phase B — Domestic cups (different systems)
- **FA Cup (England), Copa del Rey (Spain), DFB-Pokal (Germany), Coppa Italia, Coupe de France** — single-elimination, **all tiers** (giant-killing is the appeal), often single-leg with replays/extra-time. Needs:
  - a scraper that pulls entrants across **multiple divisions** (not just the top flight),
  - a **knockout-from-round-1** mode (variable bracket size, byes, single-leg + ET + pens — our shootout engine already handles this),
  - seeding/draw logic (cups are random draws, not seeded).

### Stats for cups (notes)
- Knockout-only → far fewer games → smaller goal/assist tallies. The awards "carry" model already scales with games, so cups will naturally produce smaller award scores — fine, but POTS for a cup may be less meaningful (consider a "Cup hero" / top-scorer highlight instead).
- Shootout kicks still never count as goals (existing rule).
- Career accumulation already keys by **competition**, so `fa_cup`, `euro`, `europa_league` slot in as new `Competition` values with no schema change.

---

## 5. Scraper architecture (recap)

- `scripts/lib/transfermarkt.ts` — shared: fetch+retry, position/demonym maps, `parseParticipants` (scoped to the league clubs table), `fetchClubSquad` (kader + performance pages → full ~26-30 squad with real goals/assists/apps), `fetchNationSquad` + `fetchNationIndex` (national teams), `finalizePlayers`, and the **improved OVR model** (market value → log curve, age correction for wonderkids/veterans, playing-time nudge).
- `scripts/lib/colors.ts` — crest → primary/secondary brand colours (pngjs, no native deps), cached per club.
- `scripts/scrape-league.ts` — multi-season, one file per league, clubs keyed by stable TM verein id (seasons merge across years), curated-colour preservation + crest fallback.
- `build-db.ts` already ingests multiple `club_seasons` per club and keys `player_seasons` by `player+year` — no change needed for multi-season or new leagues.

---

## 6. Known issues & caveats

- **Relegation-playoff leak — FIXED.** `parseParticipants` used to grab every `/verein/` link on the startseite, which pulled the "Subsequent competitions" relegation-playoff box in too — giving a **19-team Bundesliga (Paderborn)** and a **21-team Ligue 1 (3 Ligue 2 sides)**. Fixed by scoping to the first `table.items` (the league clubs table). Verified: Bundesliga 18, Ligue 1 18, top-5 all correct. **Watch for it returning** if TM changes the startseite layout — symptom is an off-by-N league size; the existing data scraped *before* this fix still has the stray clubs and should be cleaned manually.
- **Split-season / calendar-year leagues** (Argentina, Liga MX; MLS, Brazil) — `saison_id` ↔ our-season mapping isn't 1:1; needs handling before trusting multi-season pulls.
- **Saudi** — only ~last 3 years have rich market values.
- **Performance / runtime** — measured **~40 minutes for 3 seasons × top-5** (~2.5-3s/club: kader + performance + crest fetch + polite delay, ~300 clubs). Scales linearly: **10 seasons × 10 leagues ≈ several hours**. Run **per-league** and/or **incrementally** (`SEASONS=`/`FROM=`/`TO=`), not all at once. Consider lowering the per-club delay only if TM tolerates it.
- **DB size** — top-5 × 10 seasons ≈ ~25-30k player-seasons; +5 more leagues pushes the bundled SQLite asset up a few MB. Fine for SQLite, just a bigger app download.

---

## 6b. Club & competition facts on the placement screen (planned)

When you're placed and shown the **team OVR + lineup** for the club you're replacing, add a **"Did you know?" facts card** *between* the lineup and the enter CTA, showing a fact (or a few) about that club — and the enter button should be **renamed to the actual competition** (e.g. "Enter the Bundesliga" / "Enter the Champions League" / "Enter the World Cup" instead of a generic "Enter the league"). (The chemistry breakdown that used to sit here was removed — chemistry is no longer a mechanic.)

### UX
- Placement screen order: **team OVR + lineup → club facts card → CTA (named after the competition)**.
- Facts: pull from the club's fact list (random one, or rotate 2-3). For competitions, show **competition-specific** facts where available, else fall back to the club's general facts.

### Data — needs a much bigger facts set (the important part)
`scripts/club_facts.json` currently only covers ~20 (originally top-flight) clubs, keyed by club id → `string[]`. To support this everywhere it must grow to:
- **Per-club domestic facts** for **every club across every scraped league/season** (top-5 now, more later) — not just 20.
- **Champions League-specific club facts** (UCL pedigree/history) — keyed for the `_ucl` club ids (e.g. "X has won the European Cup N times").
- **World Cup nation facts** — keyed for the `_nt` nation ids (e.g. titles, best finishes, iconic moments).
- **General nation facts** (for future international comps — EUROs/Copa nations beyond WC).

### Structure (proposed)
Keep one fact bank but key by the **id used in that competition** so the right facts surface:
```jsonc
{
  "arsenal":      ["…domestic facts…"],          // league
  "arsenal_ucl":  ["…UCL-specific facts…"],       // Champions League run
  "brazil_nt":    ["…World Cup / national facts…"]
}
```
Lookup: try the competition-scoped id first (`<club>_ucl` / `<nation>_nt`), then fall back to the base club id, then to a generic "no facts yet" state. Facts are **content** (manual curation and/or scraped/generated) — a sizeable ongoing task, scaled per competition.

### Caveat
`club_facts.json` is imported directly into the app bundle (`src/lib/clubFacts.ts`) — if it's ever empty/invalid the **whole app fails to compile** (Hermes "invalid expression"). Keep it valid JSON and never commit it empty.

---

## 6c. UCL placement — globe & "any club" (partly done)

- **Any club — DONE.** UCL placement now picks **uniformly over all 36 clubs** (was the 3 weakest), so you can land on Real Madrid or a minnow — matching the WC "any nation" change.
- **Globe for UCL — needs data.** The league/WC globe lights up a *country*, but UCL clubs have **no country stored** in the seed (`{club_id, club_name, historical_ovr, colours}` only). To land the globe on a club's country we'd need a **club → country/ISO mapping**, ideally captured by the UCL scraper (the Transfermarkt participants page lists each club's country) and stored on the club, then `isoForClub(clubId)` feeding `GlobeReveal`. Until then UCL keeps its club-name roulette.
- **"Something more fun" options to consider:** globe that spins across Europe then zooms to the club's country + crest; or a crest-roulette with the club's brand colours; or a short "draw" animation themed like the UCL bracket. Lowest-effort high-value step is the scraper capturing club country, then reuse the existing globe.

## 7. Open decisions

- Which leagues to actually ship in the bundled DB (all 10? + non-European?) vs. keep scrape-only.
- How facts get authored at scale (manual vs scraped/generated) and how many per club.
- Cup draw realism (true random vs lightly seeded).
- Whether cups get full POTS/U21 awards or a lighter "cup highlights" stat block.
- How far back to go per competition (UCL/EURO editions tie to format changes).
- **Journeys (§8):** finals-only vs full-qualification campaigns; how to seed entrants; how long is too long; whether qualifying and finals are one career "competition" or two.

---

## 8. Full-competition journeys — qualifiers → finals (vision)

> The north star for **Special Modes**: don't just drop the player into a finished
> tournament — let them play the **whole campaign**, from qualification through to
> lifting (or not lifting) the trophy. "**Your World Cup**", "**Your EUROs**", your
> Libertadores run. This is a big, multi-release effort; this section captures the
> design so we build toward it deliberately rather than bolting it on.

### 8.1 — The two journey archetypes

Every competition we'd add fits one of two shapes. Both reuse engine primitives we
**already have** (round-robin groups, two-legged KO, extra time, `simulateShootout`);
the new work is **stringing phases into a campaign** and **sourcing the entrant/berth
data**.

1. **National-team journeys** — *Your World Cup / Your EUROs / Your Copa América.*
   You draft a **national squad** and carry one nation through:
   `Qualification campaign → Final tournament (groups → knockouts → final)`.
   - WC qualification is **per-confederation** and very different per region
     (UEFA groups → winners + playoff path; CONMEBOL single round-robin league of
     10; CONCACAF/AFC/CAF multi-round). EURO qualifying = groups → playoffs.
   - The drafted XI **is** the nation for the entire journey (squad fixed, or allow
     a re-draft between qualification and finals — open decision).

2. **Club continental journeys** — *Your Champions League / Europa / Conference /
   Copa Libertadores.*
   `(Qualifying rounds) → League/Group phase → Knockouts → Final.`
   - **Copa Libertadores:** preliminary **Stages 1–3** (two-legged KO) → **group
     stage** (8 groups of 4) → R16 → QF → SF → Final (one-off). Entry stage depends
     on the club's domestic berth (champions/runners-up enter the group stage,
     lower berths start in the qualifying stages).
   - **UEFA:** UCL/Europa/Conference each have qualifying rounds (champions path /
     league path) feeding the main phase. Our current UCL mode is **finals-phase
     only** (the Swiss-36 league phase onward) — a journey would *prepend* the
     qualifying rounds.

### 8.2 — What it needs (engine)

- **A `Campaign` descriptor** — an ordered list of **phases**, each phase being one
  of our existing format primitives with its own entrants, advancement rule, and
  output feeding the next phase:
  - `group` (round-robin, top-N advance) — reuse `fixtures.ts` + league standings.
  - `swiss` (UCL-36 style) — reuse `cl-sim.ts`.
  - `two_leg_ko` / `single_leg_ko` (+ ET + pens) — reuse `knockout-match.ts`.
  - `playoff_path` (mini-bracket for last qualification slots).
  Tie this to the **`format`/edition descriptor** idea from §2b/§3 — a journey is
  just a *sequence* of those descriptors instead of a single one.
- **Campaign state + save/resume.** A journey spans **many** matchdays (a full WC
  qualification + finals is easily 15–25+ matches), so `gameStore` must persist a
  **multi-stage campaign cursor** (current phase, standings/bracket so far, the
  player nation/club's path), not just a single `SeasonResult`. The existing
  per-run MMKV persistence pattern extends to this; the shape is bigger.
- **Pacing.** Long campaigns need the existing **Skip / Sim-All** affordances at the
  phase level, plus a campaign overview screen (where am I, what's next).

### 8.3 — What it needs (data — the hard part)

The engine work is tractable; the **data** is the real cost, and it's competition-
and confederation-specific:

- **Entrant lists & berths per edition.** Who's actually *in* each phase. For club
  comps this derives from **domestic-league finishes** — we won't simulate every
  domestic league to fill UCL/Libertadores, so we'd **seed entrants from real
  historical entrant lists** per season (scrape the participants per round), or a
  rule that maps our scraped league tables → berths.
- **Confederation qualification structures.** WC/continental qualifying formats vary
  by region **and era** — each needs encoding (groups sizes, how many advance,
  playoff paths). This is the bulk of the modelling.
- **National-team pools beyond the WC 48.** Qualification involves **many more
  nations** than the 48-team finals (UEFA alone has 50+). The WC scraper machinery
  (`fetchNationSquad` / `fetchNationIndex`, `_nt` ids) extends to them, but it's a
  much larger national-team scrape.
- **Libertadores / CONMEBOL** specifically: South American club squads aren't in the
  current top-5+UCL+WC dataset at all — needs a **new league/continental scrape**
  (Brazil `BRA1`, Argentina `AR1N`, etc. from §2, plus the Libertadores participants),
  with the split-season caveats from §2 to resolve first.

### 8.4 — Build order (decided)

The journeys ship as **Special Modes** (§4.0). Chosen order, lowest data-cost first:

1. **Finals-only special modes** (where we are): UCL Swiss phase, WC 48 finals.
   Keep these as standalone special modes.
2. **🇪🇺 "Your EUROs" first** — **national teams only, no club scraping**, so it's the
   cheapest journey to build and proves the `Campaign` engine end to end. Qualifying
   (groups → playoff path) → 24-team finals. Data = ~55 UEFA NT squads, all reachable
   through the existing `fetchNationIndex` / `fetchNationSquad` machinery (one season).
3. **🏆 "Your Champions League"** — the first **club** journey: qualifying rounds →
   Swiss-36 league phase → knockouts. Requires the contributing-league club data
   (§9.4) **and** Europa League as a dependency (the EL winner takes a UCL berth — §9.6).
4. **🌍 "Your World Cup"** — confederation qualifying → 48-team finals. Largest NT
   scrape (qualification spans far more than the 48 finalists) and the most varied
   per-confederation qualifying formats.

Each step reuses the engine primitives; the gating factor at every step is the
**entrant/qualification data** for that competition. Copa América / Copa Libertadores
follow once their confederation data (§9.5) is scraped.

---

## 9. Journeys — data architecture & competition coverage

This section nails down **how the database actually gets built** for the journeys, and
**which leagues** each continental competition needs. Read §5 (scraper recap) first.

### 9.1 — How the pipeline works today (so we extend it, not reinvent it)

```
scrape-*.ts  →  scripts/seed/<comp>.json  →  build-db.ts  →  assets/db/players_v5.db
```

- **The seed shape is generic.** Every seed file — domestic league, UCL, WC — is the
  same object: `{ league:{ id, name, country, games_per_season, tier }, clubs:[ { id,
  league_id, name, short_name, colours, logo, seasons:[ { id, club_id, year_start,
  year_end, historical_ovr, league_position, players:[ … ] } ] } ] }`. A **"league"
  row is just a competition-edition container** — that's why UCL and WC already fit the
  schema with zero changes.
- **One shared scrape primitive.** `parseParticipants(doc)` turns *any* TM competition
  page into `{slug, vereinId}[]`; `fetchClubSquad` (clubs) / `fetchNationSquad`
  (nations) pull full squads + real goals/assists/apps; `finalizePlayers` applies the
  OVR model; `teamStrength` sets the club-season OVR. `build-db.ts` blindly ingests
  **every** `seed/*.json`. **So a new competition = a new seed file + (if its format
  differs) a sim branch. No schema or build-db changes.**
- **Clubs are NOT merged across competitions.** Real Madrid is `real_madrid` in
  `la_liga.json` and `real_madrid_ucl` in `champions_league.json`, with player ids
  suffixed (`_ucl`, `_nt`). Each competition file carries **its own copy** of the
  squads. Cost: duplication. Benefit: every competition is self-contained and can be
  scraped/rebuilt independently.

### 9.2 — The lever: direct-participant scrape vs domestic-derived berths

Because of 9.1, there are **two ways** to populate a continental journey, and we should
deliberately pick per competition:

- **(A) Direct-participant scrape (cheap, recommended default).** Scrape the actual
  entrant list of **each qualifying round + the main phase** straight off TM (the comp's
  teilnehmer / round pages already list them), exactly like `scrape-ucl.ts` does for the
  league phase. We do **one season** (the current edition), so the JSON is big but
  bounded. **No domestic-league data required** — the clubs come in via
  `parseParticipants` regardless of which league they're from. This is the fastest path
  to a working journey.
- **(B) Domestic-derived berths (richer, more work).** Scrape the contributing domestic
  leagues, then map **league finishes → competition berths** (champions enter here,
  4th-place enters the playoff round, etc.) and *generate* the bracket ourselves. This
  is what makes a *replayable* journey where your drafted club's domestic result could
  change who qualifies — but it needs the full league set **and** a berth-rules table
  per country, and it runs into the split-season caveats (§2) for South America.

**Plan:** ship journeys on **(A)** first (one real edition, scraped entrants per round),
and treat **(B)** as a later enhancement once we've expanded the domestic-league set
anyway (the "grow to ~20 leagues" goal). The league lists below are what **(B)** needs —
and they double as the "more normal-mode leagues" roadmap.

### 9.3 — New scraper: `scrape-cup.ts` (multi-round, one edition)

A continental journey scraper generalises `scrape-ucl.ts`:

- Walk the competition's **rounds** for one `saison_id` (qualifying R1/R2/R3/playoff →
  group or Swiss phase → KO). TM exposes each round's participants; `parseParticipants`
  already handles the table scoping.
- Emit **one seed file per competition** (`champions_league.json` already exists;
  add `euro.json`, `europa_league.json`, `copa_libertadores.json`, …) with the clubs
  that appear, plus a small **`stages[]` / qualification descriptor** on `league` (the
  §8.2 `Campaign`) recording the round structure and which clubs enter where.
- Reuse id suffixes per comp (`_uel`, `_uecl`, `_lib`, `_euro` for NT). Curated
  colours/short-names preserved via the existing `loadExisting()` pattern.

### 9.4 — Leagues that feed the **Champions League** (UEFA)

> **Authoritative numbers live in §10.1** (real UEFA allocation + the live coefficient
> ranking, researched from Wikipedia). The table below is the practical "which leagues
> to scrape" view; use §10.1 for exact berth counts and the association order.

UCL 2026/27 = 36 clubs in the league phase, fed from ~16 leagues; the **qualifying
path** pulls champions from many more. For strategy (A) we just scrape the UCL rounds
directly; this table is for strategy (B) and for deciding which domestic leagues to add
to the normal pool. **Bold = already in the game.** Association ranks are the current
coefficient order (§10.1).

| Tier | Country | League | TM code | Why it's in UCL |
|---|---|---|---|---|
| Core (league-phase regulars) | **England** | **Premier League** | `GB1` | 4–5 berths |
| | **Spain** | **LaLiga** | `ES1` | 4–5 |
| | **Italy** | **Serie A** | `IT1` | 4–5 |
| | **Germany** | **Bundesliga** | `L1` | 4–5 |
| | **France** | **Ligue 1** | `FR1` | 3–4 |
| | Netherlands | Eredivisie | `NL1` | 1–2 + quali |
| | Portugal | Liga Portugal | `PO1` | 1–2 + quali |
| | Belgium | Pro League | `BE1` | champion + quali (format quirk §2b) |
| Strong (regular qualifiers) | Austria | Bundesliga | `A1` | Salzburg / Sturm |
| | Czechia | Fortuna Liga | `TS1` | Slavia / Sparta |
| | Greece | Super League | `GR1` | Olympiacos / PAOK |
| | Turkey | Süper Lig | `TR1` | Galatasaray |
| | Switzerland | Super League | `C1` | Young Boys |
| | Scotland | Premiership | `SC1` | Celtic |
| | Ukraine | Premier League | *verify* | Shakhtar / Dynamo Kyiv |
| | Serbia | SuperLiga | *verify* | Red Star |
| | Croatia | HNL | *verify* | Dinamo Zagreb |
| Qualifying-path (champions route) | Denmark | Superliga | `DK1` | champion |
| | Norway | Eliteserien | `NO1` | Bodø/Glimt |
| | Sweden | Allsvenskan | `SE1` | champion |
| | Poland | Ekstraklasa | `PL1` | champion |
| | Cyprus | First Division | *verify* | Pafos (2025/26) |
| | Kazakhstan | Premier League | *verify* | Kairat (2025/26) |
| | Israel / Romania / Hungary / Bulgaria … | — | *verify* | champions path long tail |

→ **~16 leagues cover the league phase; ~20–25 cover realistic qualifying.** Matches the
"at most 20" instinct. For strategy (A) we don't need any of these as leagues — we scrape
the UCL rounds — but adding the **Core + Strong** set as normal-mode leagues is the
high-value overlap (more domestic content *and* enables strategy B later).

### 9.5 — Leagues that feed **Copa Libertadores** (CONMEBOL)

Cleaner than UCL: **all 10 CONMEBOL nations, no outside qualification.** None of these
are in the game yet, so Libertadores needs a **fresh South-American scrape** regardless
of strategy. Mind the **split-season / calendar-year caveats** from §2 (Argentina
Apertura/Clausura; Brazil calendar-year) before trusting multi-season — but for **one
edition** it's fine. TM codes *verify on TM* (only European codes were probed in §2).

| Country | League | TM code (verify) | Libertadores berths (approx) |
|---|---|---|---|
| Brazil | Série A | `BRA1` | ~7 (most; incl. holders) |
| Argentina | Liga Profesional | `AR1N` | ~6 |
| Uruguay | Primera División | *verify* | ~4 |
| Colombia | Primera A | *verify* | ~4 |
| Chile | Primera División | *verify* | ~4 |
| Paraguay | División Profesional | *verify* | ~4 |
| Ecuador | LigaPro Serie A | *verify* | ~4 |
| Peru | Liga 1 | *verify* | ~4 |
| Bolivia | División Profesional | *verify* | ~4 |
| Venezuela | Primera División | *verify* | ~4 |

Format: preliminary **Stages 1–3** (two-legged KO) → **group stage** (8×4) → R16 → QF →
SF → **one-off Final**. Entry stage depends on domestic berth (champions/high finishers
enter the group stage; lower berths start in the qualifying stages). Strategy (A) scrapes
each stage's participants directly; strategy (B) needs the 10 leagues + a CONMEBOL
berth-rules table. → **Full detail in §14** (incl. the per-country berth-determination mess
that makes strategy A strongly preferred here).

### 9.6 — The Europa League dependency (and cross-competition qualification)

**The EL winner qualifies for the next UCL.** So a *fully accurate* UCL entrant list
depends on a Europa League result — a **cross-competition link**. Options, simplest first:

1. **Snapshot (strategy A):** since we scrape **one real edition**, the EL-winner berth
   is **already baked into** the real UCL entrant list we scrape. No EL sim needed for a
   standalone UCL journey. ✅ ship this first.
2. **Europa as its own journey:** build `europa_league` as a sibling club journey
   (qualifying → league phase → KO). Independently valuable; reuses everything.
3. **Linked campaigns (later):** if we ever simulate a whole European season, the EL/UECL
   winners would *feed* the next UCL bracket — a `Campaign` that spans competitions. Big
   scope; park it. Conference League (UECL) slots in the same way.

**Takeaway:** the EL dependency does **not** block a UCL journey on strategy (A) — the
real edition already contains the EL-winner berth. Europa League is worth building next
as its own mode, not as a UCL prerequisite.

### 9.7 — Net build/data plan

| Mode | Strategy | New scrape needed | New sim/format work |
|---|---|---|---|
| EUROs journey | A | ~55 UEFA NT squads (1 season) | groups → playoff path → 24-team finals; `Campaign` engine v1 |
| UCL journey | A | UCL qualifying-round participants (1 edition) on top of existing league phase | qualifying rounds prepended to existing Swiss-36 sim |
| Europa League | A | EL participants per round (1 edition) | group/Swiss + KO (reuses UCL paths) |
| WC journey | A | confederation qualifying NT squads (far > 48) | per-confederation qualifying formats → 48 finals |
| Libertadores | A | full CONMEBOL scrape (1 edition, all stages) | Stages 1–3 → groups → KO |
| Strategy B (any) | B | the §9.4 / §9.5 **domestic leagues** + berth-rules tables | berth mapping + bracket generation |

The recommended path: **EUROs → UCL (+Europa next) → WC**, all on **strategy A** (one real
edition, participants scraped per round), with the domestic-league expansion (§9.4 Core+Strong,
§9.5 CONMEBOL) pursued in parallel because it *also* enriches normal modes and unlocks
strategy B replayability later.

---

## 10. Real allocation data (researched — the source of truth)

> These are the **actual** formats/allocations, pulled from Wikipedia, not estimates.
> We target the **2026/27** continental editions, whose entrants are decided by
> **2025/26 domestic finishes** — i.e. our existing `year_start = 2025` club-seasons.
> So strategy B (§9.2) is genuinely buildable from data we already have for the top-5,
> plus the contributing leagues (§9.4) for the rest.
>
> Sources:
> [2026–27 UEFA Champions League](https://en.wikipedia.org/wiki/2026%E2%80%9327_UEFA_Champions_League) ·
> [UEFA coefficient](https://en.wikipedia.org/wiki/UEFA_coefficient) ·
> [UEFA Euro 2024 qualifying](https://en.wikipedia.org/wiki/UEFA_Euro_2024_qualifying) ·
> [2025 Copa Libertadores](https://en.wikipedia.org/wiki/2025_Copa_Libertadores).
> Re-verify against the live page when we build each (allocations shift yearly).

### 10.1 — Champions League 2026/27 (UEFA)

→ **See the dedicated full specification in §12** (all 55 associations, the complete
round-by-round access list, title-holder redistribution, pots & draw constraints,
both tiebreaker regimes, the knockout bracket, and the calendar). §10.1 is intentionally
just this pointer to keep a single source of truth.

### 10.2 — EURO (UEFA national teams)

→ **See the dedicated full specification in §13** (Euro 2028: hosts & reserved-slot rule,
the 12-group qualifying, the Nations League play-off scenarios, and the 24-team finals).
§10.2 is intentionally just this pointer.

### 10.3 — Copa Libertadores (CONMEBOL)

→ **See the dedicated full specification in §14** (stage-by-stage entry, group seeding &
pots, knockout bracket, and the per-country berth-determination mess). §10.3 is
intentionally just this pointer.

### 10.4 — Build recipe: our data → the 2026/27 entrant list

Because 2026/27 entrants come from **2025/26 finishes**, strategy B reduces to:
1. Have each contributing league's **2025/26 final table** (we have top-5; need §9.4 for
   the rest — `league_position` is already stored on every `club_season`).
2. Walk the **coefficient order** (§10.1 table) and apply the allocation rules to map
   `(association rank, league position)` → the berth/round each club enters.
3. Emit the access list; the `Campaign` engine (§8.2) runs the ladder.

For **strategy A** we skip 1–2 and scrape the **real** 2026/27 round participants directly
— but the allocation tables above are still what the **"?" explainers (§11)** teach, and
what we'd validate the scrape against.

---

## 11. In-app "how it works" explainers — `?` info bubbles (planned)

This system is **genuinely complex** — pots, EPS, champions vs league path, "best
third-placed", two-legged ties, away-goals/penalties, coefficient-based berths. A new
player will not intuit *why* they entered at the third qualifying round or *how* their 8
Swiss opponents were chosen. **We want the journeys to teach the real system**, not hide it.

**The feature:** small, **clickable `?` bubbles** placed next to each non-obvious element
across the special-mode/journey screens. Tapping opens a short, plain-language popover
(progressive disclosure — one concept per bubble), e.g.:

- On the **placement/seeding screen:** "What's a pot?", "Why am I in Pot 3?",
  "What are European Performance Spots?", "Champions Path vs League Path".
- On the **league-phase fixtures:** "Why only 8 games?", "How were my opponents picked?"
  (2 from each pot, no same-association).
- On **qualifying ties:** "Two-legged tie", "Away goals / extra time / penalties".
- On the **bracket/standings:** "Top 8 vs 9th–24th vs 25th–36th", "Best third-placed".
- For **EURO/Libertadores:** the Nations-League play-off path; CONMEBOL stage entry by
  domestic berth; the one-off neutral final.

**Implementation notes:**
- A reusable `<InfoBubble topic="ucl_pots" />` component → a small popover/bottom-sheet,
  content keyed by topic in one **explainers content file** (same caution as
  `club_facts.json`: keep it valid, it can be bundled). Content is **competition- and
  format-aware** (a `ucl_swiss_36` pot explainer differs from a `wc_48` groups one), so
  key explainers by the **format/edition descriptor** from §3/§8.2.
- Keep copy short and concrete; link related bubbles. This doubles as onboarding for the
  whole special-mode system and is worth a pass of real curation (like the facts set §6b).

---

## 12. Champions League — full specification (2026/27)

> The complete, down-to-the-detail reference for the UCL journey. Sourced from
> [2026–27 UEFA Champions League](https://en.wikipedia.org/wiki/2026%E2%80%9327_UEFA_Champions_League),
> [UEFA coefficient](https://en.wikipedia.org/wiki/UEFA_coefficient),
> [2025–26 league phase](https://en.wikipedia.org/wiki/2025%E2%80%9326_UEFA_Champions_League_league_phase),
> and [UEFA CL Regulations Art. 18 (tiebreakers)](https://documents.uefa.com/r/Regulations-of-the-UEFA-Champions-League-2025/26/Article-18-Equality-of-points-league-phase-Online).
> **81 teams · 53 of 55 associations** (Russia suspended; Liechtenstein has no league).

### 12.1 — Full association coefficient ranking (all 55)

This is the ordering every berth rule indexes into ("association N"). Values as of
2026-06 (the live 5-yr men's association coefficient). **Bold = already in our DB.**

| # | Assoc | Coeff | # | Assoc | Coeff | # | Assoc | Coeff |
|---|---|---|---|---|---|---|---|---|
| 1 | **England** | 101.852 | 20 | Austria | 23.450 | 39 | Moldova | 9.375 |
| 2 | **Italy** | 87.660 | 21 | Ukraine | 23.212 | 40 | Liechtenstein | 8.500 |
| 3 | **Spain** | 82.368 | 22 | Romania | 23.000 | 41 | Faroe Islands | 8.250 |
| 4 | **Germany** | 80.116 | 23 | Croatia | 22.156 | 42 | North Macedonia | 7.134 |
| 5 | **France** | 67.653 | 24 | Slovenia | 21.468 | 43 | Malta | 7.125 |
| 6 | Portugal | 62.650 | 25 | Israel | 20.750 | 44 | Albania | 6.500 |
| 7 | Belgium | 56.850 | 26 | Azerbaijan | 18.562 | 45 | Belarus | 6.375 |
| 8 | Netherlands | 50.729 | 27 | Slovakia | 18.250 | 46 | Lithuania | 6.000 |
| 9 | Turkey | 46.375 | 28 | Bulgaria | 17.687 | 47 | Gibraltar | 5.874 |
| 10 | Czechia | 43.025 | 29 | Russia* | 17.332 | 48 | Montenegro | 5.833 |
| 11 | Poland | 42.125 | 30 | Serbia | 16.250 | 49 | Northern Ireland | 5.625 |
| 12 | Greece | 40.412 | 31 | Iceland | 15.020 | 50 | Luxembourg | 5.375 |
| 13 | Denmark | 34.306 | 32 | Rep. Ireland | 14.468 | 51 | Andorra | 5.332 |
| 14 | Norway | 33.612 | 33 | Armenia | 13.187 | 52 | Georgia | 4.750 |
| 15 | Cyprus | 31.568 | 34 | Bosnia & H. | 12.093 | 53 | Estonia | 4.541 |
| 16 | Switzerland | 26.950 | 35 | Kosovo | 11.656 | 54 | Wales | 4.124 |
| 17 | Sweden | 24.500 | 36 | Kazakhstan | 10.875 | 55 | San Marino | 2.665 |
| 18 | Hungary | 24.437 | 37 | Finland | 10.250 |  |  |  |
| 19 | Scotland | 24.150 | 38 | Latvia | 10.250 |  |  |  |

> \* **Russia (29): suspended → 0 teams.** Knock-on: where a rule would take a club from
> Russia, it's skipped and the next association down is used (e.g. Ukraine's champion is
> bumped from First → Second qualifying round to fill the gap). **Liechtenstein (40)** also
> fields 0 (no domestic league). So "associations 16–55" in practice = 16–55 **minus 29 & 40**.
>
> **Coefficient =** 5-season sum of each association's clubs' UCL/UEL/UECL results
> (2 pts win, 1 draw), ÷ clubs entered that season. Used **2 years in advance** to set
> the access list; re-verify when building (it shifts yearly).

### 12.2 — Berth allocation (how many per association)

- **Ranks 1–5:** 4 teams each · **Rank 6:** 3 · **Ranks 7–15:** 2 each · **Ranks 16–55:** 1 each
  (skipping Russia & Liechtenstein).
- **+2 European Performance Spots (EPS):** one extra **league-phase** berth to the two
  associations with the best **single-season** European performance the prior year — a
  *different* metric from the 5-yr coefficient. **2026/27 → England & Spain** (their
  5th-placed club enters the league phase).
- **+2 title-holder berths:** the **UCL holder** and **UEL holder** each get a league-phase
  place if they didn't already qualify domestically (see redistribution, §12.4).

### 12.3 — Complete access list (round-by-round, both paths)

Read top-down = where every team starts. CH = Champions Path, LP = League Path.

**League phase (36 direct entrants):**
- Champions of associations **1–10** (10)
- Runners-up of associations **1–6** (6)
- Third-placed of associations **1–5** (5)
- Fourth-placed of associations **1–4** (4)
- **Highest-coeff champion of assoc 23** (1) — the only champion from 11–23 promoted straight in
- **Highest-coeff runner-up of assoc 7** (1)
- **2 EPS** holders (England 5th, Spain 5th)
- **5** Play-off CH winners + **2** Play-off LP winners

**Play-off round (14 → 7 advance):**
- CH (10): champions of assoc **11–14** (4) + 6 Third-QR CH winners
- LP (4): 4 Third-QR LP winners

**Third qualifying round (20 → 10 advance):**
- CH (12): 12 Second-QR CH winners
- LP (8): runners-up of assoc **8–9** (2) + third-placed of assoc **6** (1) + fourth-placed of assoc **5** (1) + 2 highest-coeff runners-up of assoc **11–12** + 2 Second-QR LP winners

**Second qualifying round (28 → 14 advance):**
- CH (24): champions of assoc **15–22** (8) + 2 highest-coeff champions of assoc **27–28** + 14 First-QR winners
- LP (4): runners-up of assoc **10, 13–15** (4)

**First qualifying round (28 → 14 advance):**
- CH only: champions of associations **24–25 and 29–55** (minus Russia & Liechtenstein)

> Sanity check on the 36: `10+6+5+4 = 25` league-position berths `+1 (assoc-23 champ) +1
> (assoc-7 RU) +2 EPS +7 play-off winners = 36`. ✓

### 12.4 — Title-holder redistribution (the real 2026/27 case)

When a holder qualifies domestically, its reserved berth is freed and the access list
"slides up" — **higher club-coefficient teams move into stronger entry points.** The 2026/27
worked example (both holders qualified via league):

- **UCL holder PSG** (qualified via Ligue 1) → **Shakhtar Donetsk** (highest club-coeff among
  the would-be CH entrants) takes a **direct league-phase** spot instead of 2nd QR; **Slovan
  Bratislava & Celje** bump up from 1st → 2nd QR (CH).
- **UEL holder Aston Villa** (qualified via PL 4th) → **Sporting CP** (highest club-coeff among
  would-be CH/LP entrants) takes a **direct league-phase** spot instead of 3rd QR (LP);
  **Bodø/Glimt & Olympiacos** bump up from 2nd → 3rd QR (LP).

**Modelling note:** for **strategy A** (scrape the real edition) this is already baked in.
For **strategy B** (derive from league tables) we need a **club-coefficient** value per club to
resolve "highest-coeff among the would-be entrants" — capture it from TM/Wikipedia per club,
or approximate with our `historical_ovr` as a proxy (good enough for a game).

### 12.5 — League phase: pots & draw constraints

- **36 teams → 4 pots of 9**, ranked by **2025 UEFA club coefficient**. The **UCL title holder
  is forced into Pot 1** as the top seed; the rest fill by coefficient.
- Each team plays **8 matches = 2 opponents from each of the 4 pots**, **one home + one away
  per pot** (so 4 home, 4 away).
- **Constraints:** no opponent from your **own association**; **at most 2 opponents from any
  single association**. Never the same opponent twice. One combined 36-team table.

> `cl-sim.ts` already implements this Swiss draw + table; verify it enforces the pot split
> (2/pot) and the same-association cap when we wire the journey.

### 12.6 — League phase: standings & tiebreakers

Ranking is by **points** (3/1/0). When level, UEFA applies criteria in this order
(Regulations Art. 18). Note the **MD1–7 vs after-MD7** difference:

**Up to & including Matchday 7** (simple set, to keep the live table readable):
1. Goal difference (league phase) → 2. Goals scored → 3. Away goals scored →
4. Wins → 5. Away wins → *(still level: equal rank, ordered alphabetically by abbreviation)*

**From Matchday 8 (final standings)** — the full set:
1. GD → 2. Goals scored → 3. Away goals → 4. Wins → 5. Away wins →
6. **Opponents' collective points** → 7. opponents' collective GD → 8. opponents' collective
goals scored → 9. **lower disciplinary total** → 10. **higher club coefficient**.

> There is **no head-to-head** in the Swiss model (everyone plays a different schedule), which
> is why goal difference is the first separator — unlike the old group stage.

### 12.7 — Knockout phase structure & seeding

- **1st–8th:** bye straight to the **Round of 16** (seeded).
- **9th–24th:** **knockout play-off** (two-legged). **9th–16th are seeded**, drawn against
  **17th–24th** (unseeded); the **8 winners** join the R16.
- **25th–36th:** eliminated from all European competition (no UEL drop, unlike the old group stage).
- The bracket from the play-offs through to the final is **fixed/seeded by league-phase
  position** (your finishing rank determines your side of the draw — better rank = nominally
  easier path, like a tennis seeding).
- **Two-legged:** play-offs, R16, QF, SF. **Final: single match, neutral venue.**
  Ties level after two legs → extra time → penalties (our `knockout-match.ts` /
  `simulateShootout` already handle this).

### 12.8 — Calendar (2026/27)

- **Qualifying:** 7 Jul – 26 Aug 2026 (Prelim → Play-off round).
- **League phase:** MD1 8–10 Sep 2026 … MD8 27/28 Jan 2027 (**8 matchdays**).
- **Knockout play-offs:** 16–24 Feb 2027 · **R16:** 9–17 Mar · **QF:** 6–14 Apr ·
  **SF:** 27 Apr–5 May · **Final:** 5 Jun 2027.

> For a *journey* we don't need real dates, but the matchday **count/order** matters for
> pacing and the campaign overview (§8.2): Prelim/Q1/Q2/Q3/PO (2 legs each) → 8 league MDs →
> PO/R16/QF/SF (2 legs) → final. A holder-less full run from 1st qualifying = up to ~21 matches.

---

## 13. EURO — full specification (Euro 2028)

> The dedicated reference for the **"Your EUROs"** journey (the **first** journey to build,
> §8.4 — national teams only, no club scraping). Sourced from
> [UEFA Euro 2028](https://en.wikipedia.org/wiki/UEFA_Euro_2028) and
> [Euro 2028 qualifying](https://en.wikipedia.org/wiki/UEFA_Euro_2028_qualifying).
> **24-team finals · 54 associations enter qualifying** (Russia suspended).

### 13.1 — Hosts & the reserved-slot rule (the one real wrinkle)

- **Hosts: England, Scotland, Wales, Republic of Ireland** (UK & Ireland). Northern
  Ireland was an original host but **dropped as a venue** (Casement Park delays), so it is
  *not* a guaranteed host — **4 hosts**, 9 stadiums, final at Wembley.
- **Hosts do NOT auto-qualify.** UEFA only guarantees automatic qualification for **up to 2**
  host associations, so **all 4 hosts play the qualifying group stage** drawn into separate
  groups.
- **Reserved slots:** **2** finals places are held for the **2 best-ranked host nations**
  (by overall qualifying-group ranking) **that fail** to qualify as a group winner or one of
  the 8 best runners-up. How many of those 2 slots get used flexes the play-off size (§13.4).

### 13.2 — Finals format (24 teams)

- **24 teams → 6 groups of 4.**
- Advance: **group winners + runners-up (12)** + the **4 best third-placed teams (4)** =
  **16 → Round of 16** → QF → SF → **Final**. **No third-place play-off.**
- Knockout ties: single match, level → extra time → penalties.

> **Engine fit:** identical shape to our **WC-48** sim (`world-cup-sim.ts`), just **6 groups +
> 4 best-thirds** instead of 12 groups + 8 best-thirds. The "best third-placed" ranking +
> the which-group-winner-plays-which-third bracket table is the only fiddly bit, and we
> already solved it for the WC. This is why EURO is the cheap first journey.

### 13.3 — Qualifying group stage

- **12 groups**: **8 groups of 4** + **4 groups of 5** (the groups of 4 are the teams whose
  slots interleave with the **Nations League Finals** — those nations play fewer qualifiers).
- Direct qualifiers: **12 group winners + 8 best runners-up = 20**.
- Round-robin home/away within each group; standard points (3/1/0).

### 13.4 — Play-offs (the Nations League path) — scenario-dependent

The remaining places (after 20 direct + 0–2 reserved-host) come from **play-offs seeded off
the UEFA Nations League**. The number of play-off berths depends on how many reserved-host
slots were consumed:

| Reserved-host slots used | Play-off spots | Play-off shape |
|---|---|---|
| 2 | 2 | 2 paths · single-leg SF + final |
| 1 | 3 | 3 paths · single-leg SF + final |
| 0 | 4 | 4 home-and-away play-off ties |

**Participants:** the **worst-ranked group runners-up** (those not in the best 8) **+ Nations
League group winners** (from Leagues A/B/C) who didn't already qualify. Always sums to **24**:

| Source | Teams |
|---|---|
| Group winners | 12 |
| Best runners-up | 8 |
| Reserved host slots | 0–2 |
| Play-off winners | 2–4 |
| **Total** | **24** |

### 13.5 — Modelling notes (how we actually build "Your EUROs")

- **Player-as-host case matters.** If the drafted nation **is** a host (Eng/Sco/Wal/IRL),
  it plays qualifying but has the **reserved-slot safety net** — a distinct, teachable
  outcome (great `?`-bubble moment, §11). If not a host, it's qualify-on-merit.
- **Abstract the Nations League.** We don't simulate a whole separate Nations League. Two
  clean options: (a) **fix the play-off field** from the real edition (strategy A); or
  (b) seed the play-off from **our NT OVRs** as a stand-in for NL ranking (strategy B).
  Recommend **A for v1** — the play-off entrants are known for the real edition.
- **Collapse the scenario branching for v1.** The 0–2 host-slot / 2–4 play-off matrix is the
  most complex rule in the whole journey. For a first build, model the **most common case**
  (assume the standard play-off size) and treat reserved host slots as a simple "host that
  finishes 3rd-or-worse but top-2 among hosts still gets in" check. Full scenario fidelity is
  a later polish.
- **Reuse everything:** group round-robin (`fixtures.ts` + standings), best-thirds + bracket
  (from `world-cup-sim.ts`), single-leg KO + ET + pens (`knockout-match.ts`). The **only**
  new sim pieces are the qualifying-group → direct/play-off split and the play-off mini-bracket
  (single-leg SF+final), both small.

### 13.6 — Data: which national teams, and our coverage gap

- **Need: all 54 UEFA national-team squads** (current). We currently have **WC 2026** nations
  only (~48 globally, of which only ~13–16 are UEFA), so **most UEFA nations are missing** —
  the minnows especially (San Marino, Gibraltar, Andorra, Faroe Islands, …).
- **How to scrape (two options):**
  - **(A) Direct participants:** scrape the **Euro 2028 qualifying entrant list** off TM/Wiki
    (all 54) and pull each squad via the existing `fetchNationSquad`. Cleanest match to the
    journey.
  - **(B) FIFA-ranking index:** `fetchNationIndex` paginates the FIFA world ranking; today it
    pulls ~10 pages (~250 teams) which already covers every UEFA nation **including** the
    minnows — then **filter to UEFA**. Need a nation→confederation tag (small static map) so
    we keep only UEFA. Reuses the WC machinery almost verbatim.
- **Seed file:** `scripts/seed/euro.json`, nation ids suffixed **`_euro`** (mirrors `_nt`/`_ucl`),
  one edition. The NT OVR model (market value + age, no playing-time term) applies unchanged.
- **Caveat:** low-ranked UEFA nations have **thin market-value data** → floor-ish OVRs (like the
  Saudi caveat in §2). Fine — it makes drafting a minnow appropriately brutal.

### 13.7 — Calendar / pacing

- **Qualifying:** Mar–Nov 2027 (group draw 6 Dec 2026 in Belfast); **play-offs Mar 2028**.
- **Finals:** Jun–Jul 2028 (final 9 Jul 2028, Wembley).
- **Journey match count:** qualifying = up to **10 group matchdays** (groups of 5) or **6**
  (groups of 4) → optional play-off (1–2 matches) → finals **3 group + up to 4 KO = 7**. So a
  full non-host campaign ≈ **13–18 matches**; shorter and snappier than the UCL journey.

---

## 14. Copa Libertadores — full specification (CONMEBOL)

> The dedicated reference for the **"Your Libertadores"** journey. Sourced from
> [2025 Copa Libertadores](https://en.wikipedia.org/wiki/2025_Copa_Libertadores),
> [Copa Libertadores](https://en.wikipedia.org/wiki/Copa_Libertadores), and
> [Qualifying method (Argentina)](https://en.wikipedia.org/wiki/Qualifying_method_of_Copa_Libertadores_in_Argentina).
> **47 teams · all 10 CONMEBOL associations · no outside qualification.** Structurally the
> cleanest journey (one confederation, fixed berths) — but the **per-country berth math is
> the messiest of any competition** (§14.5), which is why strategy A is strongly preferred.

### 14.1 — Berth allocation (47 teams)

| Association | Total | → Group stage | → Qualifying stages |
|---|---|---|---|
| Brazil | 8 | 6 | 2 |
| Argentina | 7 | 5 | 2 |
| Bolivia, Chile, Colombia, Ecuador, Paraguay, Peru, Uruguay, Venezuela | 4 each | 2 each | 2 each |

- **+2 title-holder berths**, both **straight to the group stage**: the **Copa Libertadores
  holder** and the **Copa Sudamericana holder** (in 2025: Botafogo & Racing). If a holder also
  qualified via its league, the freed league berth passes down that nation's order.
- Brazil & Argentina's extra berths (and the holders being Brazilian/Argentine in 2025) are
  why they field 8/7 while everyone else fields 4.

### 14.2 — Stage entry (which berth starts where)

| Entry point | Teams | Who |
|---|---|---|
| **Group stage** | **28** | Both holders · Brazil 1–5 · Argentina 1–5 · **berths 1–2 of all other 8 nations** |
| **Second stage** | 13 | Brazil 6–7 · Argentina 6 · **berth 3 of all other 8 nations** (+ 2 of the 3 first-stage winners… see below) |
| **First stage** | 6 | **berth 4** of Bolivia, Ecuador, Paraguay, Peru, Uruguay, Venezuela (the 6 lowest-coefficient nations) |

> So the four highest-ranked of the "4-berth" nations (Argentina/Brazil aside) — i.e.
> Chile, Colombia + two others by CONMEBOL rank — get their berth 3 into the **second stage**
> and have **no first-stage team**, while the six lowest send their berth 4 into the **first
> stage**. (The exact six can shift yearly with the CONMEBOL ranking — verify per edition.)

### 14.3 — Qualifying stages (all two-legged, straight to penalties)

| Stage | Teams | Ties | Advance | Losers go to |
|---|---|---|---|---|
| First | 6 | 3 two-legged | 3 | eliminated |
| Second | 16 (3 first-stage winners + 13 direct) | 8 two-legged | 8 | **Copa Sudamericana** |
| Third | 8 | 4 two-legged | **4 → group stage** | **Copa Sudamericana** |

- **Tie rule (important & different from UEFA):** if level on aggregate after two legs,
  **no extra time** — straight to a **penalty shoot-out**. Higher-ranked team hosts leg 2.
- The **4 third-stage winners** fill the group stage to **32** (28 direct + 4).

> Note the **Sudamericana drop**: losing CONMEBOL clubs parachute into the *secondary*
> continental cup. We won't model Sudamericana — for a journey, a qualifying loss simply
> **ends the run** (optionally with a "dropped to Sudamericana" flavour line + `?` bubble).

### 14.4 — Group stage & knockouts

- **32 teams → 8 groups of 4** (A–H), home-and-away round-robin, **3/1/0**.
- **Seeding:** **4 pots by CONMEBOL ranking**; **no two clubs from the same association in a
  group** — *except* third-stage winners (all placed in **Pot 4**) may share a group with a
  compatriot.
- **Group tiebreakers (in order):** points → goal difference → goals scored → away goals →
  CONMEBOL ranking.
- **Progression:** **1st & 2nd → Round of 16**; **3rd → Copa Sudamericana** (run ends for us);
  4th eliminated.
- **Round of 16 seeding:** **8 group winners (Pot 1) drawn vs 8 runners-up (Pot 2)**; winners
  host leg 2. Unlike UEFA, **same-association OR same-group pairings ARE allowed** in the R16.
- **R16 → QF → SF:** all **two-legged**, same penalties-if-level rule (**no away-goals rule** —
  abolished), no extra time before pens.
- **Final:** **single match at a neutral, pre-selected venue** (2025: Lima). No away goals.

> **Engine fit:** group stage = our round-robin + standings (with CONMEBOL-specific
> tiebreakers); two-legged KO + shoot-out = `knockout-match.ts` / `simulateShootout` (which
> we'd configure to **skip extra time** and go straight to pens for this competition); the
> single-match final is trivial. The genuinely new bits are the **3-stage qualifying ladder
> with pot seeding** and the **Sudamericana "drop = eliminated" handling**.

### 14.5 — The per-country berth-determination mess (why strategy A wins here)

Unlike UEFA (uniform "league position N → berth"), **each CONMEBOL nation decides its
Libertadores berths differently**, so a plain league table does **not** tell you who qualifies:

- **Argentina / Brazil / Chile** run **European-format** single tables — *but* a berth can be
  taken by winning the **domestic cup** (Copa Argentina, Copa do Brasil, Copa Chile), which
  reshuffles the league-position berths. (Argentina 2026 e.g. mixes Apertura champ, Clausura
  champ, Copa Argentina champ, and aggregate-table places.)
- **Bolivia, Colombia, Ecuador, Paraguay, Peru, Uruguay, Venezuela** use **Apertura/Clausura**
  split seasons (two champions/year) plus aggregate-table places; **Peru & Ecuador** have
  **bespoke multi-stage domestic playoffs** to decide berths.

**Implication:** **strategy B (derive entrants from our league tables) is impractical for
Libertadores** without encoding 10 different national berth-rule sets + domestic cups +
Apertura/Clausura splits (the §2 split-season caveat squared). → **Use strategy A:** scrape
the **real entrant list per stage** for one edition. The §2 split-season problem also means we
should pull the **continental** participants directly rather than trusting a multi-season
domestic scrape.

### 14.6 — Data: leagues & how to scrape (none of this exists yet)

- **None of the 10 CONMEBOL leagues are in our DB.** Even with strategy A (continental
  participants), we still scrape each entrant **club's squad** — so we need those clubs'
  TM pages regardless. A `scrape-cup.ts` (the §9.3 generalisation of `scrape-ucl.ts`) walking
  the Libertadores rounds for one `saison_id` is the cleanest path.
- **Seed file:** `scripts/seed/copa_libertadores.json`, club ids suffixed **`_lib`**.
- **CONMEBOL domestic-league TM codes** (for adding them as *normal* leagues and/or strategy B
  later) — **all `*verify*` on TM** (§2 only probed European codes); known/likely:

  | Country | League | TM code | Domestic format |
  |---|---|---|---|
  | Brazil | Série A | `BRA1` | European (calendar-year) |
  | Argentina | Liga Profesional | `AR1N` | Apertura/Clausura (28 clubs) |
  | Uruguay | Primera División | *verify* | Apertura/Clausura |
  | Colombia | Primera A | *verify* | Apertura/Clausura |
  | Chile | Primera División | *verify* | European |
  | Paraguay | División Profesional | *verify* | Apertura/Clausura |
  | Ecuador | LigaPro Serie A | *verify* | bespoke multi-stage |
  | Peru | Liga 1 | *verify* | bespoke multi-stage |
  | Bolivia | División Profesional | *verify* | Apertura/Clausura |
  | Venezuela | Primera División | *verify* | Apertura/Clausura |

- **OVR/data caveat:** Brazilian & Argentine squads have solid TM market values; the smaller
  CONMEBOL leagues are **thinner** (floor-ish OVRs, §2 Saudi-style). Acceptable — and it makes
  the strength gap between a Flamengo and a Bolivian minnow feel real.

### 14.7 — Calendar / pacing

- **Qualifying (stages 1–3):** Feb 2025 · **Group stage:** Apr–May (6 MDs) · **R16:** Aug ·
  **QF:** Sep · **SF:** Oct · **Final:** late Nov (2025: 29 Nov, single match in Lima).
- **Journey match count:** from group stage = 6 group MDs + R16/QF/SF (2 legs each = 6) +
  final = **13 matches**; from the first qualifying stage add up to **6** more (3 two-legged
  ties) → **~19 matches**. Comparable to the UCL journey, longer than EURO.

---

## 15. World Cup — full specification (2026)

> The dedicated reference for the **"Your World Cup"** journey (the **last/largest**, §8.4).
> Good news: the **48-team finals are already built** (`world-cup-sim.ts`) — the whole new
> effort is **qualification**, which is the hardest of any competition because **six
> confederations each run a completely different format**. Sourced from
> [2026 FIFA World Cup](https://en.wikipedia.org/wiki/2026_FIFA_World_Cup) and
> [2026 FIFA World Cup qualification](https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_qualification).
> **48 teams · ~210 nations enter qualifying globally.**

### 15.1 — Finals format (48 teams — already implemented)

- **48 teams → 12 groups of 4.** Advance: **top 2 of each group (24) + 8 best third-placed
  (8) = 32 → Round of 32** → R16 → QF → SF → **Final**, **plus a third-place play-off**.
- Single-match knockouts; level → extra time → penalties. A winner plays **8 matches**
  (3 group + R32 + R16 + QF + SF + Final).
- **vs the old 32-team format:** 64 → **104 matches**, 32 → 39 days; and a **tiebreaker
  change** — head-to-head is now weighted earlier vs the old goal-difference-first order
  (*verify the exact order when we touch group tiebreaks*; our `world-cup-sim.ts` already
  encodes a WC tiebreak set — confirm it matches 2026).

> This is the part we already do (groups → best-thirds → R32 bracket → KO + 3rd place — see
> the overhaul doc / `world-cup-sim.ts`). **EURO (§13) reuses this exact machinery at 6
> groups + 4 thirds.** So the finals are essentially free; everything below is the new work.

### 15.2 — Confederation slot allocation (the 48)

| Confederation | Direct | Hosts | Inter-conf play-off entrants | Final berths |
|---|---|---|---|---|
| **UEFA** (Europe) | 16 | — | 0 | **16** |
| **CAF** (Africa) | 9 | — | 1 | **9** |
| **AFC** (Asia) | 8 | — | 1 | **8** |
| **CONCACAF** (N/C America) | 3 | **3** (USA, Canada, Mexico) | 2 | **6** |
| **CONMEBOL** (S. America) | 6 | — | 1 | **6** |
| **OFC** (Oceania) | 1 | — | 1 | **1** (first-ever guaranteed berth) |
| **Inter-confederation play-off** | — | — | (6 entrants) | **2** |
| **Total** | 43 | 3 | — | **48** |

> Direct (43) + hosts (3) + inter-conf play-off winners (2) = **48**. ✓ The play-off **entrants**
> column sums to 6 (CONMEBOL 1, CONCACAF 2, CAF 1, AFC 1, OFC 1) competing for **2** berths.

### 15.3 — Inter-confederation play-off (6 teams → 2 berths)

- **6 teams**, one from each of CONMEBOL/CAF/AFC/OFC plus **two** from CONCACAF.
- **Mini-tournament:** the **2 highest FIFA-ranked** entrants are **seeded** straight into the
  two **finals**; the other **4** play **two single-match semi-finals**; the **2 winners**
  qualify. (2026 winners: DR Congo, Iraq.)

### 15.4 — Per-confederation qualifying formats (the six-headed beast)

The player's nation routes them into **their confederation's** qualifying. Each is different:

| Conf | Field | Format → direct qualifiers | Play-off route |
|---|---|---|---|
| **UEFA** | 54 | **12 groups** (4–5 teams) → **12 group winners** direct; then a **12-team play-off** (12 runners-up + 4 best NL group winners → 4 paths) → **4 winners**. **16 total.** | within UEFA (no inter-conf) |
| **CONMEBOL** | 10 | **single round-robin league** (18 matchdays, home/away) → **top 6** direct | **7th** → inter-conf play-off |
| **CONCACAF** | 32 (+3 hosts) | 3 rounds → final round of **3 groups**; **3 group winners** direct | **2 best runners-up** → inter-conf play-off |
| **CAF** | 54 | **9 groups of 6** → **9 group winners** direct; 4 best runners-up play a mini-play-off | **1 winner** → inter-conf play-off |
| **AFC** | 46 | multi-tier: R1 KO → R2 (9 groups of 4) → R3 (3 groups of 6, **top 2 = 6 direct**) → R4 (2 groups of 3, **2 winners direct**). **8 total.** | **R4 runners-up → R5 → 1** to inter-conf play-off |
| **OFC** | 11 | knockout + final group → **1 winner** direct | **runner-up** → inter-conf play-off |

> The **CONMEBOL single league of 10** is by far the simplest (one round-robin, top 6) — which
> is why §8.4 originally floated it as the *engine* vertical-slice. UEFA reuses much of the EURO
> qualifying machinery (§13.3). CONCACAF/CAF/AFC/OFC are progressively more bespoke.

### 15.5 — Data: the largest scrape by far

- **Need: ~210 national-team squads** (every FIFA member that enters qualifying), vs the **48**
  finalists we already have (`world_cup.json`, `_nt`). That's the **biggest data lift** of any
  journey.
- **How:** the same NT machinery — **`fetchNationIndex` already paginates the FIFA ranking**
  (bump pages to cover the long tail), then `fetchNationSquad` per nation. A **nation →
  confederation** map (small static table, ~210 rows) is **required** here (to route qualifying
  *and* to filter/colour), and it **doubles as the EURO UEFA filter** (§13.6).
- **Seed:** extend `world_cup.json` or a sibling `wc_qualifying.json`; reuse `_nt` ids so a
  nation's squad is shared between the finals mode and the journey.
- **Caveat (big):** the long tail of FIFA minnows has **almost no market-value data** → floored
  OVRs. That's *fine* for realism (minnows should be weak) but means OVR can't distinguish, say,
  two Pacific microstates — acceptable.

### 15.6 — Modelling notes (how to scope "Your World Cup")

- **The six-format problem is the whole challenge.** Supporting every confederation's qualifying
  faithfully is a lot. Options, smallest first:
  1. **v1 — one confederation:** ship "Your World Cup" routing only through **CONMEBOL**
     (single round-robin of 10 → top 6 + play-off). Simplest possible, proves the finals-link.
  2. **v2 — add UEFA** (reuse EURO qualifying machinery) — covers the nations most players pick.
  3. **v3 — the rest** (CONCACAF/CAF/AFC/OFC) + the **inter-confederation play-off** mini-bracket.
- **Generic-campaign fallback:** rather than six bespoke sims, model each confederation as a
  **parameterised `Campaign`** (group sizes, #groups, #direct, #play-off) from §8.2 — most
  reduce to "groups → top-N + a play-off". Only AFC's multi-tier ladder really needs special care.
- **Strategy A still applies:** scrape the **real 2026 qualifying participants** per confederation
  for one edition; we don't *derive* WC entrants from anything (there's no league-table source for
  national teams anyway).
- **Reuse:** groups + best-thirds + R32 bracket + 3rd-place (all in `world-cup-sim.ts`),
  single-leg KO + ET + pens (`knockout-match.ts`). New: the **per-confederation qualifying
  campaigns** + the **inter-confederation play-off**.

### 15.7 — Calendar / pacing

- **Qualifying** runs across **2023–2026** confederation-by-confederation; **finals** Jun–Jul 2026
  (USA/Canada/Mexico).
- **Journey match count** varies wildly by confederation: CONMEBOL = **18** qualifiers alone;
  UEFA = **6–10** group + up to 2 play-off; AFC can exceed **20** across its tiers. Then the
  finals add **3 group + up to 5 KO (incl. 3rd-place) = up to 8**. A CONMEBOL run is the longest
  single-table grind; most others are shorter. Expect a campaign-overview/pacing screen (§8.2) to
  matter most here.
