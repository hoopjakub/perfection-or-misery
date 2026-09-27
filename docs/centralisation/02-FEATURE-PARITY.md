# 02 · Feature parity: what one mode has and another lacks

Part of the [centralisation set](00-README.md). **Status:** findings, as of 24 September 2026, with a proposal line on each item.

Each item names a feature that exists in at least one mode family and is missing or cut short in another. The families and their screens are in [01](01-MODE-MAP.md). Items the maintainer named in the P8-71 request are marked **(named)**.

Every item has the same shape:

- **Today**: what each family does, with evidence.
- **Base**: the proposal, meaning the one shared piece every family should get it from. Phase two builds these ([07](07-PHASE-TWO-PLAN.md)).

---

## 1 · Live screens

### F-01 · The press runs only in the league season **(named)**
**Today.** Only `LeagueSeason` writes press: `writePress` at `LeagueSeason.tsx:263`, the `press` tab at `:56`, and the live hand-off to the story page through `setLivePress` at `:270`. The classic Champions League, the World Cup and the full path never call `writePress`, so a cup run has no press at all, including the injuries and bans that P8-25 put in the press.
**Base.** The press writer runs once per round from the shared round loop (07 §2.1), whatever the stage. Cup stages need their own story kinds (group decided, through as a best third, a knockout upset, a tie won on penalties), and those belong in `src/engine/press.ts` next to the league ones.

### F-02 · Stories, the story page and its share card follow the press
**Today.** The run hub's stories and `app/game/story.tsx` read `runData.press ?? simResult.press` (`story.tsx:30`). A cup run has neither, so the page falls back to `NO_STORIES` (`story.tsx:21`), and the P8-69 share card can never be made for a cup run.
**Base.** This comes for free with F-01. It needs no change of its own.

### F-03 · The World Cup groups have no team of the matchday **(named)**
**Today.** `RoundTeam` is mounted in four places: the league season (`LeagueSeason.tsx:460`), the classic league phase (`simulation.tsx:678`), and the full path's domestic season and league phase (`custom-ucl-simulation.tsx:913, :1171`). `WCSimulation` (`simulation.tsx:729-1474`) has none.
**Base.** Mount `RoundTeam` from the shared round view, so every stage that has rounds gets it without anyone having to add it by hand.

### F-04 · No knockout round has a team of the round
**Today.** None of the knockout views (classic, World Cup, full path) mount `RoundTeam`. A knockout round is a round too, with its own fixtures and seeds.
**Base.** The same shared round view: "Team of the round of 16", built from the round's legs.

### F-05 · Speed chips exist in two families out of four
**Today.** The league season (`LeagueSeason.tsx:572`) and the full path (`custom-ucl-simulation.tsx:924, :1182`) have `Chips<Speed>`. The classic league phase and the World Cup groups hard-code `const speed: Speed = 'slow'` (`simulation.tsx:200, :759`); the comment says "the pace is locked". Nothing says why a cup should be slower to watch than a league.
**Base.** One speed setting in the settings store, so the choice carries across stages and runs (07 §2.3). Today each screen keeps its own. The speed values themselves are L-02.

### F-06 · The World Cup's matchday lookback is dead code **(named, "matchday per matchday look up")**
**Today.** `WCSimulation` declares `wcViewMD` (`simulation.tsx:756`) and computes `wcViewing`, `wcViewIdx` and `wcAtLive` from it (`:1120-1122`), but `setWcViewMD` is never called. There is no control that changes it, so the World Cup can't look back at an earlier group matchday. The league season, the classic league phase (`:652`) and the full path (`:875, :1144`) all can, with `BackToLive`.
**Base.** The shared round view owns the lookback and `BackToLive`. The dead state goes.

### F-07 · Standing movement is missing in the full path
**Today.** `StandingFigure` gets `delta={null}` in both of the full path's tables (`custom-ucl-simulation.tsx:866, :1140`), so it never shows the up/down movement. The league season (`LeagueSeason.tsx:516`) and the classic league phase (`simulation.tsx:647`) show it. The World Cup groups have no `StandingFigure` at all.
**Base.** The shared round view keeps the previous position itself, so no screen can forget to.

### F-08 · Your fixtures list: three versions, and none in the league
**Today.** The classic league phase has a *fixtures* tab (`simulation.tsx:661`, rows at `:638, :697`). The World Cup lists your three group matches (`:1278, :1359`). The full path shows your eight only in the review before the league phase starts (`custom-ucl-simulation.tsx:1110`), not during it. The league season has no fixture list.
**Base.** A "your fixtures" tab on every stage that has a schedule, built from the stage's fixtures.

### F-09 · Your own match plays out live in some stages only
**Today.** `LiveMatch` plays your match minute by minute in the World Cup groups (`simulation.tsx:1291`), the full path's qualifying (`custom-ucl-simulation.tsx:1033`) and every knockout. In the league season, the classic league phase and the full path's domestic season and league phase, your match arrives already finished, as a `ScorelineCard`.
**Base.** Decide once which one is the base; this is open decision D2 in the [README](00-README.md). The default: `LiveMatch` for your match everywhere, with the speed setting (F-05) deciding how long it takes, and `fast` skipping straight to the card.

### F-10 · Abandon is missing from the full path
**Today.** The full path has no `CloseRun` and never calls `askAbandon`. The only ways out are finishing the run or closing the app. The league season has its own abandon (L-12), and the classic and World Cup screens use the shared one.
**Base.** `CloseRun` in the shared run header (07 §2.4).

### F-11 · The full path and the knockouts have no wide layout
**Today.** `useSizeClass` appears in `LeagueSeason` and in both `simulation.tsx` components, but not in `custom-ucl-simulation.tsx` or `KnockoutPhaseView`. On a tablet or the web the full path and every knockout stay one narrow column.
**Base.** The shared stage shell lays out panes once ([10-ADAPT §2.2](../ui-overhaul/10-ADAPT-OPTIMIZE-A11Y.md) already defines the pattern).

### F-12 · The panel's view of a match: classic knockouts only
**Today.** `panelLine` (P8-57) is passed to `KnockoutPhaseView` for the classic Champions League and the World Cup (`simulation.tsx:599, :1241`). The full path's knockouts have no panel (it never met the pundits, F-22), and no group or league-phase match shows one (the roadmap's P8-57 note already lists the World Cup groups as still to do).
**Base.** The panel line hangs off the shared match row for your match, on every stage.

## 2 · Result screens

### F-13 · Matchday-by-matchday lookup after the run: league only **(named)**
**Today.** `result.tsx` has the `SeasonStrip` (`:456`) that picks a matchday and shows its results and team of the matchday. The three cup result screens have nothing like it. The classic league phase's eight matchdays, the World Cup's three group matchdays and the full path's domestic season and league phase can't be revisited after the run.
**Base.** One result screen section, "Round by round", fed by the stage model, for every stage with rounds.

### F-14 · Team of the matchday on the result screen: league only **(named)**
**Today.** `result.tsx:411` finds the viewed matchday's team in `night.teamsOfTheRound`. The cup result screens have no such section, although the classic and full-path league phases pick one live.
**Base.** Part of F-13's section.

### F-15 · The position graph: league only
**Today.** `PositionGraph` is drawn only by `result.tsx`. The classic league phase is a 36-club table over eight matchdays, and its position line would read just as well.
**Base.** Drawn by the league-shaped stage section (league seasons and league phases). Groups of four with three matchdays probably don't need it; see open decision D3.

### F-16 · Season highlights: league only
**Today.** Biggest win, worst loss, upsets and absences are read from `dbRunData.highlights` in `result.tsx:223-236` only.
**Base.** Computed per run by the same code (L-07) and shown by every result screen.

### F-17 · No bracket after the draw **(named)**
**Today.** Every cup result screen shows its knockouts as a list (`KnockoutRoundsView`, `cl-result.tsx:340`, `custom-ucl-result.tsx:370`, `wc-result.tsx:404`). The bracket shape exists only in `BracketPreview`, before the knockouts start (`simulation.tsx:586, :1228`, `custom-ucl-simulation.tsx:1203`), and there it shows the draw, not results. Once a knockout is played, no screen shows it as a bracket.
**Base.** One bracket component that draws a knockout at any point: drawn, in progress, finished. The preview, the live knockout header and the result screen all use it (C-07).

### F-18 · The pundits' calls on the knockouts aren't a bracket **(named, "bracket prediction table")**
**Today.** `PunditsTournament` (`VerdictBlock.tsx`, rows at `:305-312`) lists every tie as a row: "Arsenal v Inter · They backed Arsenal · RIGHT". It is a long list, not the bracket the pundits would have filled in.
**Base.** The F-17 bracket in a "their picks" state: the pundits' side goes through in each tie, marked right or wrong against what happened.

### F-19 · Manager of the season: league only
**Today.** `clubsForManagerAward` (`src/lib/awardsNight.ts`) explains why: "the cups predict rounds rather than places, so they have no manager award". Since P8-56 the cups have a pundits' tournament view that predicts a round for every club (`src/engine/cup-calls.ts`), so there is now something to measure a cup manager against.
**Base.** The manager score takes the stage model's expected finish, a place in a league or a round in a cup. Measured, with its numbers shown (the "measured, not invented" rule).

### F-20 · The full path's domestic season disappears from the result
**Today.** The domestic season is simulated live, but the store keeps only its tables (`customUclLeagues`, `src/store/gameStore.ts:43`). The run stats are computed from `clResult` plus the qualifying ties (`custom-ucl-result.tsx:112`), so the domestic matches count for no award, no player page and no season total. On the result screen the season is one line of text (`domesticLine`, `:230, :335`).
**Base.** The full path is a run of four stages (domestic, qualifying, league phase, knockouts), and every stage's matches are stored and counted the same way. The stage model (07 §2.1) makes this the natural shape rather than a special case.

### F-21 · A past cup run opens a different, older screen
**Today.** Opened from history, the classic Champions League renders `CLHistorySummary` (`cl-result.tsx:479`) and the World Cup `WCHistorySummary` (`wc-result.tsx:470`): whole pre-Kit-Drop screens built from `ScrollView`, `Text` and old styles. The league result screen reads the saved run (`dbRunData`) into the same screen it shows live.
**Base.** One result screen that renders from saved run data, whether the run just ended or ended a month ago.

## 3 · Setup screens

### F-22 · The full path skips the pundits
**Today.** `CustomCLPlacement` pushes `/game/custom-ucl-simulation` directly (`placement.tsx:431`). Every other family goes through `toPundits` (`placement.tsx:205`). This is why F-12 and the full path's verdict have no panel.
**Base.** The pundits screen predicts the first stage that has a table and the competition it leads to. For the full path, that means the domestic league, with a line on how far they think you'll get in Europe.

### F-23 · The spin reel is colourless in the World Cup **(named, "spin animation")**
**Today.** `spinItem` gives a club its season and colour, and a nation neither: `{ title: c.club_name, sub: undefined }` (`draft.tsx:194-197`). The reel falls back to `prim.inkFaint` for every item (`DraftParts.tsx`, `RackSpin`, the `colours` map), so a World Cup spin is a strip of grey. No reel item in any mode carries a crest or flag, only a colour swatch; the mark appears only after the landing, on the club card.
**Base.** The reel item is a team mark (A-01) plus name, in every mode. Nations use their flag colours, which the flag images already carry.

---

## 4 · Count

23 items: 12 on the live screens, 9 on the result screens, 2 in setup. Eight were named by the maintainer: F-01, F-03, F-06, F-13, F-14, F-17, F-18 and F-23. The "simulation tabs" the maintainer named are a drawing difference, C-12.
