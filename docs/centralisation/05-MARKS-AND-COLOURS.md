# 05 · Marks and colours: crests, flags and club colours

Part of the [centralisation set](00-README.md). **Status:** findings, as of 24 September 2026, with a proposal line on each item.

The maintainer's report: "nation logos and other logos are still breaking", and the pundits' whole-tournament groups have "no images". This document explains both. Batch 13 fixed the data (the flag table, P8-58; the crests and colours, P8-156 and P8-157). What still breaks is the drawing: seventeen places each decide on their own whether a team gets a crest, a flag, an emoji, or nothing, and several decide wrong for a nation.

## How a mark is meant to work

- A **club** shows its crest: `crestFor(clubId, name)` (`src/lib/brand.ts`), the real image in `real` brand mode and the drawn Kit Drop badge otherwise (the default, `brand.ts:14`).
- A **nation** shows its flag: `getFlag(clubId)` (`src/lib/flagMap.ts:33`) turns a `<nation>_nt` id into an emoji, and `RoundFlag` turns the emoji into the bundled flag image (`flagImageOf`, `src/lib/flags.ts:13`).
- `ClubName` (`src/components/kit/labels.tsx:66`) is the kit piece meant to do both. **But it only shows a flag if the caller passes `flag`.** Without one, a nation gets the drawn crest: a badge with its initials. That one default explains most of the breakage below.

---

## 1 · Who decides

### A-01 · Seventeen places decide what a team's mark is
| # | Where | A club gets | A nation gets |
|---|---|---|---|
| 1 | `ClubName`, `labels.tsx:66` | crest | flag **only if the caller passes it**; otherwise a drawn crest (A-02) |
| 2 | `TeamLabel` (old), `src/components/TeamLabel.tsx:32` | crest | flag, by id |
| 3 | `LeagueTable` row, `SeasonParts.tsx:150` | crest | flag if the row carries one |
| 4 | `Flagged`, `SeasonParts.tsx:617` (drawn at `:623`) | crest | flag if passed |
| 5 | `ResultRow`, `SeasonParts.tsx:335, :339` | crest | **drawn crest, always** (A-03) |
| 6 | `ScorelineCard`, `SeasonParts.tsx:270` | **nothing** | **nothing** (A-05) |
| 7 | `FixtureRow`, `SeasonParts.tsx:509` | **nothing** | flag if passed |
| 8 | `GroupWall`, `SeasonParts.tsx:545` | nothing | flag if passed |
| 9 | `TieCard`, `SeasonParts.tsx:680, :685` | nothing | flag if the view model has one |
| 10 | `LiveMatch` side, `LiveMatch.tsx:313` | **nothing** | flag, by id |
| 11 | deep match, `app/game/deep-match.tsx:224-227` | nothing | flag, **by name** |
| 12 | match sheet header, `match-stats.tsx:368, :377` | crest | no mark, an emoji in the text instead (A-07) |
| 13 | match sheet parts, `MatchStatsParts.tsx:636` | crest | drawn crest |
| 14 | draft club card, `DraftParts.tsx:143-145` | crest | flag, by name (`draft.tsx:539`) |
| 15 | placement, `placement.tsx:128-129` | crest | flag, by name |
| 16 | club page head, `app/game/club.tsx:80` | crest, its id looked up **by name** from the table | **drawn crest** |
| 17 | `BracketPreview`, `BracketPreview.tsx:246, :315` | crest | flag, by id then by name |

On top of these, two helpers put an emoji inside a string (`withFlag`, `withCountryFlag`, A-07), and `CustomUclViewers` draws an emoji as `Text` (`CustomUclViewers.tsx:170`).

**Base.** One `TeamMark({ clubId, name, size })`, which reads `getFlag(clubId)` itself and draws `RoundFlag` for a nation and `Crest` for a club. No caller passes a flag, and no caller looks one up by name. `ClubName` draws a `TeamMark` and its name, and every row and card above draws `ClubName` or `TeamMark`. A nation can then never get the wrong mark, because no caller gets a say.

## 2 · Where nations break today

### A-02 · `ClubName` without a flag: nations shown as initials badges **(named)**
**Today.** Four callers pass no `flag`, so a World Cup run shows each nation as a drawn crest with its initials:
- the pundits screen table (`app/game/pundits.tsx:228`), for every nation in the draw;
- the run hub's stat rankings (`app/game/run.tsx:86`);
- the story page table and the share card (`app/game/story.tsx:90, :157`).

**Base.** A-01's `TeamMark`.

### A-03 · Every World Cup result row draws nations as crests **(named)**
**Today.** `ResultRow` always draws `Crest` (`SeasonParts.tsx:335, :339`) and has no flag prop. It is used for the World Cup's live group results (`simulation.tsx:1337`), the run hub's matches (`run.tsx:294`) and "Your matches" on the result screen (`ResultParts.tsx:83`, used by `wc-result.tsx`).
**Base.** A-01.

### A-04 · The pundits' verdict tables have no marks at all **(named, "no images")**
**Today.** All three pundits' tables on the result screens draw the team as a bare name: `PunditsTable` (`VerdictBlock.tsx:181`), `PunditsRoundTable` (`:235`), and `PunditsTournament`'s groups and ties (`:289, :307`). This is the maintainer's screenshot of the whole-tournament groups. It applies to every mode, not just the World Cup; clubs have no crests there either.
**Base.** These tables become `LeagueTable` with a predicted-place column (C-01), which draws `TeamMark`.

### A-05 · The hero cards have no mark
**Today.** `ScorelineCard` (your result after every matchday) has no mark for either side (`SeasonParts.tsx:270-300`). `LiveMatch` shows a flag for a nation and nothing for a club (`LiveMatch.tsx:313-316`). `FixtureRow` does the same for your upcoming opponents (`SeasonParts.tsx:509`). So the biggest team names on the live screens are the only ones without a crest.
**Base.** A-01, at the card's size.

### A-06 · The club page looks up its own id by name
**Today.** `club.tsx:80` passes `data.table.find(r => r.clubName === name)?.clubId` to `Crest`, although the page was opened with the club's id. The detour by name gains nothing, and because it always draws `Crest`, a nation's page shows a drawn crest instead of its flag.
**Base.** `TeamMark` with the route's id.

### A-07 · Flags as emoji inside text
**Today.** `withFlag` (`match-stats.tsx:882`, 13 call sites in that file) and `withCountryFlag` (`MatchStatsParts.tsx:234`, 2 call sites) prepend the flag emoji to a nation's name. That emoji never becomes the bundled flag image (P8-58 only converts `RoundFlag`), so the match sheet draws flags a second way: as emoji glyphs, from the phone's emoji font or, on the web, the Twemoji flag font `app/_layout.tsx:20-36` installs for Windows. They don't match the round flag images on every other screen, and a screen reader reads the emoji out as part of the name. For nations the match sheet header also drops its crest slot (`match-stats.tsx:368, :377`) and relies on the emoji. The same pattern shows up in `custom-ucl-result.tsx:399` (the full path's "Domestic leagues" list, `#1 🇩🇪 Bundesliga`) and `CustomUclViewers.tsx:170`.
**Base.** Names are plain text, and the mark is `TeamMark` beside it. Both helpers are deleted.

### A-08 · Flags looked up by name in six places · *measured: agrees today*
**Today.** `flagForCountry(name)` (`src/data/geo-iso.ts:134`) is used for teams in `deep-match.tsx:224`, `draft.tsx:539`, `match-stats.tsx:368, :377, :883`, `MatchStatsParts.tsx:235`, `placement.tsx:520` (the World Cup draw; `:381` and `:447` hold a real country name and are fine) and as the fallback in `BracketPreview.tsx:246, :315`. A scratch check on 24 September 2026 ran both lookups over the 48 World Cup nations in the bundled database: all 48 resolve by name and by id, to the same flag. So nothing breaks today. The next rename (a scraper writing "Korea Republic" as "South Korea", "Türkiye" as "Turkey") breaks every by-name call silently while the by-id ones keep working.
**Base.** By id only (A-01). `flagForCountry` stays for places that really hold a country name (a pundit's country, a league's country).

## 3 · Data gaps

### A-09 · Five clubs still have the placeholder colour
**Today.** After P8-157, five club rows still carry the scrapers' slate placeholder `#1E293B`, which reads as black: `juventus_fc`, `juventus_fc_ucl`, `juventus_fc_cucl` (Juventus FC), `paok_thessaloniki_cucl` (PAOK) and `kolos_kovalivka_cucl` (Kolos Kovalivka). No row for these clubs has real colours to copy.
**Base.** Add them to `COLOUR_FIX` in `scripts/build-db.ts` by hand (Juventus and PAOK are black and white; Kolos Kovalivka's colours need looking up), then bump the database version. Also add a build check that fails when any row still has the placeholder.

### A-10 · Seven clubs without a bundled crest
**Today.** Checked against `logoMap.ts` on 24 September 2026: AC Sparta Prague (both copies), FC Kharkiv, Epicentr Kamyanets-Podilskyi, Turan-Tovuz IK, FC Ararat Yerevan and JK Trans Narva, all from the full path's qualifying. This only shows in `real` brand mode; the default `original` mode draws every crest.
**Base.** Scrape the seven, or accept the drawn fallback for qualifying minnows and say so in `docs/PROJECT_STATE.md`. Open decision D6.

### A-11 · The World Cup has no competition mark
**Today.** `competitionCrestFor` gives the Champions League and each league a real mark, but "the World Cup has no Transfermarkt mark yet, so it wears the drawn one" (`brand.ts`, above `competitionCrestFor`).
**Base.** A drawn World Cup mark in the Kit Drop style, since the real one isn't licensable anyway (the maturita licensing notes).

### A-12 · 157 of 182 nationalities have no flag
**Today.** Measured the same day: of the 182 distinct `players.nationality` values, 157 are demonyms ("German", "Spanish", "Brazilian") that `flagForCountry` can't resolve, because it expects a country name. Nothing draws a player's nationality flag yet (the draft's `PlayerTag` shows the word, `DraftParts.tsx:275`), so nothing is broken. But the first flag beside a player's name would be missing for most of them.
**Base.** A demonym → ISO table beside `NATION_ISO`, before anyone draws a player flag.

### A-13 · `RoundFlag`'s fallback code is written five ways
**Today.** When a flag is missing, `RoundFlag` shows the first three letters of `code`. Callers pass `name` (`labels.tsx:82`, `placement.tsx:128`, `DraftParts.tsx:143`), `name.slice(0, 3)` (`LiveMatch.tsx:316`, `deep-match.tsx:227`, `SeasonParts.tsx:509, :545, :623`), `p.country.slice(0, 3)` (`pundits.tsx:154`), `l.id.slice(0, 3).toUpperCase()` (`mode-select.tsx:79`) or `winner.clubName.slice(0, 3)` (`wc-result.tsx:396`). The fallback reads "IR " for IR Iran on one screen and "IRA" on another, in mixed case.
**Base.** `TeamMark` passes `clubCode(name)`, the same three-letter code the club page's tag already uses (`club.tsx:81`).

---

## 4 · Count

13 items. Four were named by the maintainer (A-02, A-03, A-04, and A-07 behind the "logos breaking" report). A-01 is the one fix that closes A-02 to A-08.
