# 06 · Cups for every nation

> Part of [the Europe research](00-README.md). Status: **research and plan**, 29 September 2026. Nothing here is built. Companion: [`04-DOMESTIC-CUPS.md`](04-DOMESTIC-CUPS.md) (the rules), [`05-THE-FULL-PATH.md`](05-THE-FULL-PATH.md) (where every cup is played today).

The maintainer, 29 September: "for domestic cups making them for all nations. Not just the top 5." Today there are two kinds of cup in the game. A league run plays its league's cup, and there are five leagues. The full path plays every association's cup to find the cup winners the access lists need, but only keeps the winner, calls most of them "the Latvia cup", and never shows one. This document is what "every nation" takes.

---

## 1 · What exists (29 September)

| Where | What's played | What's shown | Names |
|---|---|---|---|
| League run (P8-173) | The league's top flight, a bracket of 16, rounds between matchdays | A Cup tab, your tie under your match card, the cup section and the Double on the verdict | FA Cup, Copa del Rey, Coppa Italia, DFB-Pokal, Coupe de France (`CUP_NAME` in `src/engine/domestic-cup.ts`, keyed by league id) |
| Full path (P8-52) | All 53 associations' top flights, played whole, after the domestic season (`playEveryCup`, `src/engine/europe-path.ts`) | A line on the domestic result ("You won the …"), and the winners as a list in the ceremony | Ten by country (`CUP_BY_COUNTRY`), everyone else "the {country} cup" |

Two tables for one fact (N-06 in the centralisation set), and 43 of 53 associations without their cup's real name.

## 2 · The names, all 55

Source: The Dugout's `src/world/cupNames.ts`, whose Transfermarkt ids were each probed rather than guessed (six guessed ids had pointed at the wrong competition; its header comment). It has 52. The three it lacks are marked **added**: their names come from the 2026–27 Conference League's team list on Wikipedia (the competition each winner played in), read 29 September; Austria's is the competition's own name, not probed.

| Rank | Association (as in the database) | Cup |
|---|---|---|
| 1 | England | FA Cup |
| 2 | Italy | Coppa Italia |
| 3 | Spain | Copa del Rey |
| 4 | Germany | DFB-Pokal |
| 5 | France | Coupe de France |
| 6 | Portugal | Taça de Portugal |
| 7 | Belgium | Beker van België |
| 8 | Netherlands | KNVB Beker |
| 9 | Turkey | Türkiye Kupası |
| 10 | Czechia | MOL Cup |
| 11 | Poland | Puchar Polski |
| 12 | Greece | Kypello Elladas |
| 13 | Denmark | DBU Pokalen |
| 14 | Norway | NM-Cupen |
| 15 | Cyprus | Kypello Kyprou |
| 16 | Switzerland | Schweizer Cup |
| 17 | Sweden | Svenska Cupen |
| 18 | Hungary | Magyar Kupa |
| 19 | Scotland | Scottish Cup |
| 20 | Austria | ÖFB-Cup (**added**) |
| 21 | Ukraine | Ukrainian Cup |
| 22 | Romania | Cupa României |
| 23 | Croatia | Hrvatski nogometni kup |
| 24 | Slovenia | Pokal Slovenije |
| 25 | Israel | Gvia haMedina |
| 26 | Azerbaijan | Azərbaycan Kuboku |
| 27 | Slovakia | Slovnaft Cup |
| 28 | Bulgaria | Bulgarian Cup |
| 29 | Russia | Russian Cup (suspended; no entrant) |
| 30 | Serbia | Kup Srbije |
| 31 | Iceland | Mjólkurbikarinn |
| 32 | Rep. Ireland | FAI Cup |
| 33 | Armenia | Armenian Cup |
| 34 | Bosnia | Kup BiH |
| 35 | Kosovo | Kupa e Kosovës |
| 36 | Kazakhstan | Kazakhstan Cup |
| 37 | Finland | Suomen Cup |
| 38 | Latvia | Latvian Football Cup (**added**) |
| 39 | Moldova | Cupa Moldovei |
| 40 | Liechtenstein | Liechtensteiner Cup (no league in the database; see §4.3) |
| 41 | Faroe Islands | Løgmanssteypið |
| 42 | North Macedonia | Kup na Makedonija |
| 43 | Malta | Maltese FA Trophy |
| 44 | Albania | Kupa e Shqipërisë |
| 45 | Belarus | Belarusian Cup |
| 46 | Lithuania | Lithuanian Cup |
| 47 | Gibraltar | Rock Cup |
| 48 | Montenegro | Montenegrin Cup |
| 49 | Northern Ireland | Irish Cup (**added**) |
| 50 | Luxembourg | Coupe de Luxembourg |
| 51 | Andorra | Copa Constitució |
| 52 | Georgia | David Kipiani Cup |
| 53 | Estonia | Eesti Karikas |
| 54 | Wales | Welsh Cup |
| 55 | San Marino | Coppa Titano |

The ranks are this game's (`UEFA_ASSOCIATIONS` in `src/data/uefa-coefficients.ts`), which is the 2026–27 access list's order. The Dugout keys the same names by country code ("cz", "sco"); this game keys associations by rank and a country name ("Czechia", "Rep. Ireland", "Bosnia"), so the table is keyed by rank.

Three names are sponsors' (MOL Cup, Slovnaft Cup, Mjólkurbikarinn). They're what the competitions are called, and they change when the sponsor does; the table's comment should say so, so a rename is expected, not a bug.

## 3 · The formats

**Today every cup in the game is one match a round, extra time, then penalties.** That's true of most real cups. Where it isn't:

| Cup | Real format that differs | Checked |
|---|---|---|
| Copa del Rey | Two-legged semi-finals | Yes: the 2025–26 semi-finals were two legs, February and March (si.com and Atlético de Madrid's site, read 29 Sept) |
| Coppa Italia, Taça de Portugal, Beker van België | Two-legged semi-finals, as commonly reported | **Not checked**; check each before modelling it |
| Türkiye Kupası | A group stage in recent seasons | **Not checked** |
| Every cup | The whole pyramid enters, the big clubs later | True everywhere; this game has only top flights (§4.1) |

**Proposal:** keep one match a round everywhere until each exception is checked, then add two-legged semi-finals as a per-cup flag (the knockout engine already plays two legs for Europe, `simulateTwoLegs`). No group stages.

## 4 · What "every nation" takes

### 4.1 The field: top flights only
The Dugout's cup "belongs to the country, not the league": the whole pyramid enters, which is where giant-killings come from (its `cup.ts` header). This game's database has one division per association, so a cup here is its top flight. That's honest if it's said, and [`04-DOMESTIC-CUPS.md`](04-DOMESTIC-CUPS.md) §3 already says it on screen for league runs. A lower division would mean scraping second tiers for 53 associations, which is out of scope.

### 4.2 The full path: every cup kept, shown and named
1. **One table of 55 names**, keyed by rank (§2), replacing both of today's (N-06).
2. **Every cup kept whole**, not just its winner: `playEveryCup` already builds the full `DomesticCup` for each association and throws it away. Keep them on the run (a few dozen ties each, the size of one league run's cup).
3. **Shown as brackets** (P8.5-13): each cup in the ceremony opens as its bracket (`BracketTree`, with a cup-shaped adapter). The cups aren't two-legged, so each column is one match per tie.
4. **Your own cup played through your season**, the way a league run's is: its rounds between your domestic matchdays, your tie shown when it lands. Today it's played headless after the season, and the first you hear is a line on the result screen. This reuses the league run's cup machinery once it's a stage in the stage model ([`../centralisation/10-PHASE-TWO-REVISED.md`](../centralisation/10-PHASE-TWO-REVISED.md) step 3).
5. **The cup's matches get seeds and sheets** like every other match (N-05).

### 4.3 Liechtenstein, and Russia
Russia is suspended and sends nobody. Liechtenstein has no league of its own (its clubs play in Switzerland), so the database has none of its clubs, and its cup winner's Conference League Q1 place goes unfilled; the qualifying ladder's byes absorb it, as [`05-THE-FULL-PATH.md`](05-THE-FULL-PATH.md) §3 describes. Two options, both small:
- **Leave it** and say so in the ceremony ("Liechtenstein's cup winners, who play in Switzerland, aren't in this game").
- **Add Vaduz** as a single club with its 2025–26 squad (it plays in the Swiss second tier, so it isn't in the Swiss top flight either). One scrape.

**Default:** leave it, and say so.

### 4.4 League runs for every nation (an idea, not a plan)
League mode offers five leagues because only five leagues have multi-season data. The full path's database holds one season (2025–26) of all 53 top flights with real squads, and now every one of them has a cup. A league run could offer them too: "any European league, 2025–26 only", with its cup, its real zones from the access list (the stakes list already computes them) and the Double. The engine needs nothing new. The questions are the maintainer's: whether a one-season league belongs in League mode or a mode of its own, how the ladder's tiers read for a league whose champion goes to Champions League Q1, and whether a 10-club league makes a good run (a 10-club league plays 18 matchdays in a double round-robin, or 27 in a triple).
**Default:** not in Phase 8.5; recorded here so it's decided rather than lost.

## 5 · Implementation

### Step 1 · One name table
**Build.** A `NATIONAL_CUPS` table keyed by rank (§2) in `src/data/`, read by the league run's cup and the full path. `CUP_NAME` and `CUP_BY_COUNTRY` go.
**Done when.** `grep -rn "CUP_NAME\|CUP_BY_COUNTRY" src` is empty; a check prints a name for all 53 associations in the database and fails on any fallback "the … cup".

### Step 2 · Keep every cup, show it as a bracket
**Build.** `playEveryCup` returns the cups; the run keeps them; the ceremony lists each with the winner's mark and opens its bracket (P8.5-13).
**Done when.** `verify-europe-path` checks every kept cup: one winner, the winner won every tie it played, the bracket's rounds halve. **Maintainer checks:** open three cups from the ceremony.

### Step 3 · Your cup through your season
**Build.** After the stage model (centralisation step 3): the full path's domestic stage has its cup rounds between matchdays, as a league run's does.
**Done when.** The full path's domestic season shows a Cup tab; your ties open sheets.

### Step 4 · Two-legged semi-finals where they're real
**Build.** A per-cup flag, set only for cups checked in §3.
**Done when.** `verify-cup` plays a two-legged semi-final and checks the aggregate decides it.

## 6 · Left out

| What | Why | When |
|---|---|---|
| Lower divisions in the cup | No data below the top flights | If second tiers are ever scraped |
| League cups (EFL Cup and others) | England's EFL Cup gives a Conference League place today ([`05-THE-FULL-PATH.md`](05-THE-FULL-PATH.md) §7) | With that place |
| Super Cups | Not part of a one-season run | Never, unless a multi-season mode exists |
| Real cup draws (seeding, regional rounds) | Open draws are what most cups do; the rest is detail | If a cup's format is checked and differs |
