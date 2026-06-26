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

## 7. Open decisions

- Which leagues to actually ship in the bundled DB (all 10? + non-European?) vs. keep scrape-only.
- Cup draw realism (true random vs lightly seeded).
- Whether cups get full POTS/U21 awards or a lighter "cup highlights" stat block.
- How far back to go per competition (UCL/EURO editions tie to format changes).
