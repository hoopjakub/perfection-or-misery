# 12 · Phase two, final order

> Part of the [centralisation set](00-README.md). Status: **plan, 2 October 2026.** Supersedes the order in [`10-PHASE-TWO-REVISED.md`](10-PHASE-TWO-REVISED.md) (step P is done; closed items are gone). The item statuses are [`11-RE-AUDIT-2.md`](11-RE-AUDIT-2.md)'s. The Wave G audit's own findings ([`../audit-2026-10/00-README.md`](../audit-2026-10/00-README.md)) are folded in where they belong, and Wave F is step 6.

The two standing rules hold: **no browser self-testing** (every *Done when* is a typecheck, a `verify-*.ts` run or a grep count, plus what the maintainer checks), and **result-first stays**. A third, from the audit: **a fix that changes balance ships behind a check that failed before it** (lessons §1–2).

Phase 9 starts only once this is finished (the maintainer, 1 Oct).

---

## 1. The order

| Step | What | Closes | Size |
|---|---|---|---|
| **0** | Clear the ground | G-L4, G-L6, G-L7, P-2, M-1 (probe), C-17, C-05, L-10, L-11/C-09 | small, one sitting |
| **1** | Finish the team mark and the grounds | A-07, A-08, A-13, N-01, N-12, N-13 | medium |
| **2** | One set of engine helpers, and the engine's two logic fixes | L-01, L-02, L-03, L-14, N-11, L-15, N-04, N-15; **G-L1, G-L3** with checks C-1 to C-4 | medium |
| **3** | The stage model | L-04, L-05, L-06, C-04, L-13, N-05 leftovers, N-07 leftovers, F-20 | large |
| **4** | The stage shell for the live screens | F-03, F-05, F-06, F-07, F-08, F-09, **F-10**, F-11, N-03, C-10, C-12, C-13, L-12, L-16, S-01, S-02 | large |
| **5** | One knockout view | F-04, F-12, C-06, C-07 | medium |
| **6** | **One result screen = Wave F** | F-13 to F-16, F-21, C-01, C-02, C-03, C-08, C-14, C-16, L-07, L-08, L-09, N-09; P8.5-43, P8-54 | large |
| **7** | Press in every stage | F-01, F-02 | medium |
| **8** | The rest | F-19, A-09, A-11, C-11, C-15 (the match sheet on the Kit), C-18, N-06, N-10 id note, N-14, N-16 handover to Phase 9, N-18 | can be split |

Every item that's open, partly done, worse, wrong or unverified in 11 appears once.

## 2. Step 0 · Clear the ground

**Build**
- G-L6: `app/game/pundits.tsx` imports `ordinal` from `src/lib/format`; its local copy goes.
- G-L7 / C-05: `PenShootout.tsx` deleted with its two imports.
- G-L4: the guide's difficulty paragraph says Medium leans a little against you, in both languages.
- C-17: `FixtureList.tsx`, `StandingsRow`, `TeamMatchdays`, `BracketTeam`, `wcViewMD` deleted (or kept only if step 6 starts the same week, since it deletes their files anyway).
- L-11 / C-09: one `surname(name)` in `src/lib/format.ts` that keeps particles ("van Dijk"), four copies replaced.
- P-2: `vercel.json` headers make `/_expo/static/*` and `/assets/*` `immutable` for a year.
- M-1: the maintainer opens the production site, then the page-view query runs again (audit [`01-MEASURED.md`](../audit-2026-10/01-MEASURED.md) §1).

**Done when**
- `grep -rn "const ordinal\|function ordinal" app src` lists only aliases of the shared one; `grep -rn "PenShootout" app src` is empty; four `surname` copies become 0 local definitions; `verify-i18n` passes with a check that the guide's Medium sentence no longer says "straight" (C-4).
- `curl -I` on a production JS file shows `immutable`.
- M-1 has an answer written into the audit's 01.

## 3. Step 1 · The team mark and the grounds

As 10 §1 step 1, less what closed. `withFlag` (A-07) becomes `TeamMark` beside the name on the match sheet and its parts; flags by name (A-08) go through the id; one `RoundFlag` fallback (A-13); the cup modes' accents from `MODE_THEMES` by mode, not the Champions League's (N-01); the remaining fixed-ground components take `useScreenRoles` except the floodlit moments (N-12); one keyboard-safe wrapper in the kit used by login, register and chat (N-13).

*(Done 3 Oct: `MarkedName` in `MatchStatsParts` puts `TeamMark` beside every name on the match sheet; flags by id in the draft, the live final and the World Cup reveal; `themeForComp` in `src/theme.ts` gives the full path and the Europa/Conference modes their own colours; one `KeyboardSafe` in the kit with the chat's 'padding' fix; `RoundFlag` takes the whole name and makes its own code. N-12's five remaining pins are the floodlit moments, kept by decision. Also: `verify-i18n` now checks every screen for capitals outside `t()`, which found 32 strings Wave E missed, all moved. Checks S1-1 to S1-7.)*

**Done when** `withFlag` has 0 hits; `KeyboardAvoidingView` appears only inside the kit; `MODE_THEMES.champions_league` is read only where the mode is the Champions League.

## 4. Step 2 · Engine helpers and the two logic fixes

**Build, helpers**
- `compareStandings` in `src/engine/standings.ts`, used by all 14 copies (L-01, L-03).
- One speed table in `src/data/speed.ts`; the three screens read it (L-02). The values are the league's (2000/400/100) unless the maintainer prefers the full path's.
- One seeded Fisher–Yates `shuffle(rng, xs)` in `src/lib/rng.ts`; the seven biased shuffles and five private ones use it (L-14, N-11). Seeding each caller's stream is the start of idea I-6.
- L-15, N-04, N-15 as 10 described them.

**Build, logic** (audit [`02-LOGIC.md`](../audit-2026-10/02-LOGIC.md)), checks first:
1. Add C-1 (ratings tell the story), C-2 and C-3 (one scale, placement), C-4 (docs match), C-6 (upsets still happen). Run them; they fail.
2. G-L1: the result bump halved for a player who scored or assisted.
3. G-L3: one `teamStrength` for clubs and your XI, from `src/engine/rating.ts`, used by `scripts/lib/open-rating.ts`; rebuild the seed and the DB (`DB_VERSION` bump).
4. Re-run `verify-difficulty`, `measure-europe`, `verify-score`; write the before and after numbers into 02 §8. Retune `OVR_DELTA_DIVISOR` only if the spread of outcomes moved, and say why.

**Done when**
- `grep -rn "b.stats.points - a.stats.points" app src` is 0; `slow: 2` appears once; `sort(() => Math.random` is 0.
- C-1 to C-4 and C-6 pass, and each was seen failing before its fix (the commit before shows red).
- The maintainer plays one league run with an elite draft and one with a modest draft and says whether the strength felt right.

*(Done 3 Oct: `compareStandings`/`compareRows` in `src/engine/standings.ts` replace all 14 copies; `SPEED_MS` in `src/data/speed.ts`; `shuffle(rng, xs)` in `src/lib/rng.ts` replaces the seven biased sorts and the private copies; `inkOn` in `src/lib/contrast.ts` (N-15); `COMP_WEIGHT` in `score.ts` is the one copy of the European weights, with names through `t()` and colours through `themeForComp`, which closes N-04's drift without a new record. G-L1: the losing side's result bump is waived for a player who scored or assisted; C-1 checked at 20,000 matches (brace in a defeat median 7.7 → 8.0). G-L3: `clubStrength` in `rating.ts` rates clubs like your XI, `build-db` writes it, `DB_VERSION` 21, and `RATING_STRETCH = 1.5` in `match.ts` stretches every side alike; `OVR_DELTA_DIVISOR` untouched, because it would also have moved home advantage. C-2 −8…+5 → −1…+1; C-3 and C-6 pass; C-4 has been in `verify-i18n` since step 0. All numbers are in [02 §3 "as built"](../audit-2026-10/02-LOGIC.md). L-15 moves to step 8 with A-09. Checks S2-1 to S2-7; S2-1 is the maintainer's two runs.)*

## 5. Steps 3 to 5, 7 and 8

As [`10-PHASE-TWO-REVISED.md`](10-PHASE-TWO-REVISED.md) §1 describes them, with the item lists in the table above. Step 4 carries **F-10 (abandon in the full path)** and **F-05 (speed chips everywhere)** first, because they're the two the interface re-score holds against the app ([`../audit-2026-10/05-UI-RESCORE.md`](../audit-2026-10/05-UI-RESCORE.md)).

*(Step 3 done 3 Oct, phase two's stage model as a read layer, `src/engine/stages.ts`:*
- *L-04 / N-19: every match sheet is built by `matchRequest`, `tieRequest`, `legsRequest` or `cupTieRequest` from one match type (`ContextMatch`), with adapters for each family's shape (`leagueMatch`, `fixtureMatch`, `wcKnockoutMatch`, `cupTieMatches`, `runMatch`). The 20 hand-built requests, `koLegDetailRequest`, `koTieToMatchDetailRequest`, `openKoTie` and the old `cupTieRequest` are gone. `openMatchStats` no longer takes the dead accent.*
- *L-05: the full path's domestic and league-phase sheets carry their timeline (table, form, next match) and your formation.*
- *L-06 / C-04: one tie model (`clTie`, `wcTie`, `qualTie`, `runTie`) and one row builder (`tieVM`, `tieDetail` in SeasonParts), in place of six. Every tie now reads its second leg from side A's view (qualifying read it home-first) and says AET and the shootout in the app's language.*
- *L-13: `punditField` in `predictions.ts` builds the pundits' field for the pundits screen and both live panel lines.*
- *F-20: the domestic season is kept on the result (`domesticMatchdays`) and counted in the run's stats as its own stage, outside the European awards (P8-116's rule). Showing it on the result screen is step 6's.*
- *Found on the way: the full path's knockouts and live final passed your eleven without the bench, so with substitutes on their sheets couldn't field your subs. The Champions League results' timeline labelled league-phase games "Matchday n", so a game opened from a result's form rows was dated as a domestic fixture. The qualifying ladder's accent (step 1) was never drawn. All fixed.*
- *Checks: `scripts/verify-stages.ts` (adapters keep every field, legs add up to the engine's aggregate, ties land on their own timeline slot, each check seen failing), L-13 in `verify-predictions`, F-20 in `verify-run-stats`. Checklist S3-1 to S3-8.)*

*(Step 4 done 3 Oct, as shared parts rather than one shell component. Decisions taken on their written defaults: D2 your match live everywhere, Fast skips to the card; D5 a stage starts on a tap; D7 one speed setting.*
- *S-01 / S-02: `RunHeader` works out the skipped stages and "Tournament" from the mode (`runStagesFor`); the six screens' own `skipped` and `tournament` props are gone, and the pundits' strip now says Tournament in a cup.*
- *L-12 / F-10 / C-10: one `askAbandon` and `CloseRun` (now on the screen's own colours). The league's private confirm is gone; the full path has abandon on every phase and wears `RunHeader` with a `road` strip in place of its own `Road` header, in its competition's colours (the road was always the Champions League's blue). The World Cup groups pass their real pause; the knockouts need none (they hold while out of focus, checked).*
- *F-05 / N-03 / C-13: speed is one setting in `settingsStore`, kept between runs; `StageControls` (speed and the stage's skip) on all five table and group stages. The Champions League, Europa and Conference League phases and the World Cup groups were locked to slow. The league uses the shared `BackToLive`.*
- *F-03 / F-06 / F-07: the World Cup groups get the team of the matchday, a working lookback (its state was never set), a standing figure with movement, and a card for your match once played. The full path's two standing figures show movement.*
- *F-08 / C-12: a Fixtures tab (`YourFixtures`) on every table and group stage, one name across them. The press tab everywhere is step 7 (F-01).*
- *F-09: your match plays live on every table and group stage (`yourMatchPeriod` in LiveMatch.tsx); the next matchday, the rest of the round, the press and your form mark wait for it, a season or phase ends only when the last match does, and looking back doesn't restart it. Found on the way: the World Cup's live red cards were regenerated without rotation, availability, bench or your shape, so they could name a different player from the sheet; the shared builder regenerates as the sheet does.*
- *F-11: wide windows get panes on the full path's two stages and the bracket beside the rounds in every knockout.*
- *L-16: the pundits hand over to every stage the same way; a league no longer starts on arrival.*
- ***Not met:** the size target. `simulation.tsx` is 1,741 lines and `custom-ucl-simulation.tsx` 1,653 (the target was under half of 1,689 and 1,345): the missing features went in through shared parts, but each screen still runs its own matchday loop, which is most of the bulk. Halving them needs one stage loop (a `useStageLoop` hook the four families drive). It's timing code that needs testing on the screens, so it waits for the maintainer's step-4 playtest and is carried as step 4b.*
- *Checklist S4-1 to S4-14.)*

*(Step 5 done 3 Oct, one knockout view:*
- *C-06 / C-07: `src/components/season/KnockoutStage.tsx`. The classic Champions League, the World Cup and the full path all play their knockouts through `KnockoutStage`, which owns the preview, the reveal, the hold while you're scrolled away or another screen is on top, the skip and the Deep Match final. The full path's own knockout block, its copy of "newest first" and its timer are gone. One pace: 1.6 s after your round, each round's own delay otherwise (the full path used 2.2 and 4.2 s). `clKnockoutRounds` / `wcKnockoutRounds` build the rounds from the engine's results (the classic screen copied every match field by field).*
- *`KnockoutRoundsView.tsx` is gone; `KoRoundVM` lives with `BracketTree`, the qualifying ladder draws `TieRow`. `PenShootout.tsx` went in step 0.*
- *F-04: a team of the round under every settled knockout round, from every leg it played. F-12: the pundits' line on your match on every stage that has a panel (the league season, the league phase, the World Cup groups, the full path's domestic season); the full path's European stages have no panel to draw from.*
- *F-17 and F-18 were already built (P8-79: the result screens' brackets; P8-165: the pundits' tournament as a bracket marked right or wrong).*
- *Found on the way: the live bracket wrote its own "AET" and "pens 4-3" in English, a seventh copy of the tie line; `tieDetail` moved to `src/lib/tieDetail.ts` and the live bracket uses it. The full path's domestic season started on its own after the pundits (L-16's rule now holds there too).*
- *Check: `verify-stages` checks the bracket names the engine's winner and writes the one tie line for every tie, and names nobody in a round still being played (seen failing with the winner flipped).)*

*(Step 4b done 3 Oct:*
- *`TableStage` (`src/components/season/TableStage.tsx`) draws every table and group stage's round view: the line under the header, where you stand, the strip and its lookback, your match, the tabs or panes, "your match first". All five stages use it, so all five get the web keys (Space plays and pauses, the arrows scrub the strip), which only the league season had.*
- *`useStageLoop` (`src/hooks/useStageLoop.ts`): the matchday timer, the hold for your live match and the Fast skip, for the league season, the league phase and the full path's two stages. Its timer always calls the screen's latest matchday function. The World Cup groups keep their own two-step loop (the standings wait for your live match before they're applied), which doesn't fit it.*
- *`useStagePools` (`src/hooks/useStagePools.ts`): the squads and the injury ledger, with the knockouts' fallback as `ensure`.*
- *`recordResult` / `applyResult` / `updateForm` in `src/engine/standings.ts`: a result into the table, ten copies (engine/simulation.ts, cl-league-sim, play-fixture, quick-sim twice, the league season's screen, the full path's headless play; three verify scripts keep their own on purpose).*
- *Engine work moved out of the full path's screen into `src/engine/europe-path.ts`: `playCompetitionHeadless`, `otherCompetitions`, `resultWithoutYou`, and `playEuropeanSeason` (the summer's cups, entrants and ladders, which the quick-sim tester also wrote out).*
- ***Size, measured:** `simulation.tsx` 1,741 → 1,180 lines (−32%), `custom-ucl-simulation.tsx` 1,653 → 1,398 (−15%), `LeagueSeason.tsx` 635 → 580. The halving target is **not met**. What's left is each mode's own stages (the full path alone has seven: its domestic review and result, Europe's seasons, qualifying and its result, the league phase draw, out of Europe), their state, and the World Cup's group loop. Splitting the full path's stages into their own components is the next step if the size matters; it's a move, not shared code, so it's left for Phase 9.75's audit to weigh.*
- *Checklist S5-1 to S5-9.)*

*(Step 7 done 4 Oct, press in every stage (F-01, F-02):*
- *`src/engine/cup-press.ts`: `cupPress(stages, absences)`, pure like `writePress`: the stages played so far in, every story out. A league phase, and the full path's domestic season, go through the league's own `writePress` (a new `phase` flag keeps the title, the drop, the European places and "unbeaten after two games" out of a league phase). The World Cup's groups, qualifying and the knockouts get new kinds in `press.ts`: your match (so no round passes without a word), the league phase decided (straight through, play-off, out), your group decided, the race for the best thirds (in the engine's own table order, so it can't disagree with the draw), your tie, an upset (the winner rated 4+ below), a shootout, a knockout round's headline, and the winners. Your injuries and bans are written in the round they happen, on the ledger's competition clock.*
- *Adapters: `clPressStages` (classic, and the full path with its domestic season, its qualifying rounds by competition, and a league phase you never reached left out), `wcPressStages`, `knockoutStages` (one round-name map for the live knockouts and a finished result).*
- *Where it shows: a Press tab on every table and group stage (the classic league phase, the World Cup groups, the full path's domestic season and league phase), the press under the knockouts, the story page while the run is on (`setLivePress`), and the run hub's Press tab after it. RunData builds a cup run's press from its result, live or saved, so cup runs saved before today get a press too.*
- *Stories carry a `stage`; `storyWhen` says "Round of 16" or "League Phase · Matchday 3 of 8" on the story page, its share card, the press list and the ticker.*
- *The full path's split leagues: points are halved at the split, which a table rebuilt from results can't follow, so the domestic press stops at the regular season and its last regular matchday crowns nobody. The result keeps the regular season's length (`domesticRegular`).*
- *Found on the way: two logjams in the same round both wrote `logJam:jam:md`, one story twice (seen in 36-club league phases; possible in a league). The press now writes the biggest logjam only.*
- *Check: `verify-press` runs 300 seeded classic, World Cup and full-path runs (plus split full paths): every round writes a story, no story names a club outside its stage, ids never repeat, the press after any number of rounds is exactly the start of the finished one, what a story says matches the result (your tie, the winners, the best thirds against the draw), your injuries land in their round and nobody else's do, every word renders (en and sk). Seen failing with the fallback removed, the phase verdict on the latest round, the thirds sorted by points only, and a split season crowning a champion. Checklist S7-1 to S7-9.)*

*(Step 8 done 4 Oct, the rest. Phase two is complete.*
- *F-19: a manager award for the cups. Every club's round reached against the round the pundits tipped it for (`cupClubsForManagerAward` in `src/engine/awards.ts`, the pundits' own round calls from `predictions.ts`), scored on the league award's curve with rounds for places (`stageWorth`: out at the first stage 0, winners 10, quadratic) plus how far they went, the trophy and their stars. Shown as "Tipped: Round of 16 · Reached: Semi-finalists", with its own explanation (`awards.k.manager.howCup`). The classic Champions, Europa and Conference League and the World Cup; not the full path, whose pundits only call its domestic league, and not a cup with no knockouts played (the World Cup's old quick path), where there's nothing to judge. Live runs only: a saved cup run keeps neither the pundits' field nor their seed. Check: `verify-awards` over 200 seeded cups (the ladder matches the bracket, the tip is the pundits' call, going further always scores more, the winner never fell short of its tip; seen failing with the ladder shifted a round).*
- *A-09: the last placeholder colour, Kolos Kovalivka, set by hand from the club's own description (Wikipedia: "white and black"; shirt first, as Juventus and PAOK are) in `build-db.ts`'s `HAND_COLOURS`, and the build now fails if any club still has the placeholder. Both databases patched (the legal one by id: its name there is "Kovalivka Navy", which was likely drafted from the dark placeholder; the legal names are the maintainer's to change), `DB_VERSION` 22.*
- *A-11: the World Cup has a mark of its own, drawn in the kit (`WorldCupMark` in the kit's primitives: a globe on a plinth in the square badge, in the ground's line colour), in both brand modes since the real one isn't licensable.*
- *C-11: already met. Since Phase 5 the bubble only opens `openRules(topic)`, and its topics are the rulebook's; the leftover import in the full path is gone.*
- *C-18: done. No file imports the old theme's `colors`, `typography` or `spacing`. The last six moved to the kit's scales (`space`, `type`: the same values) and colours: one misery red for every red (an own goal, an injury, a red card, a missed penalty), the referee's `cardYellow` for a booking and VAR, gold for the man of the match. `ui.tsx` keeps only `PressCard` and `SaveStatusLine` (BackButton, DifficultyBadge and LoadFailed had no callers); the save line's guest and offline lines were English only and now come from `parts.saveGuest` / `parts.saveQueued` in both languages.*
- *C-15, the part that is centralisation: the match sheet's section heads are the kit's `SectionTag`, its ratings `RatingSquare`, its form rows the app's one form row (a result tag, home or away, the opponent, the score, as on the story page). **Left for the match sheet's redesign (Phase 11, with P8-48):** its 71 + 50 interim `ScaleText` lines, the context table (it highlights both sides of the match, which `LeagueTable` can't: there only your row is marked, in orange) and the knockout road (each leg opens its own sheet, which `TieRow` has no place for). Both need a shared part extended, which is a design decision.*
- *N-06: already met in Wave B (`src/data/national-cups.ts`, one table keyed by association).*
- *N-10: the career screen's "UCL Full Path" is "European Full Path" like the rest; the id stays `champions_league_custom` because saved runs carry it.*
- *N-14 and N-16: handed to Phase 9, as planned (the long lists' virtualisation, and the globe drawn once for the draw and About); noted in the roadmap's Phase 9.*
- *N-18: one owner block on everything shared (`ShareOwner`, `ownerPrefix` in `ProfileParts.tsx`): the verdict's card and now the story's card carry the owner's picture, name, club tag and badge team, and the story's shared text starts with whose run it was. The live run's verdict already named you (P8.5-04).*
- *Checklist S8-1 to S8-8.)*

## 6. Step 6 · One result screen (Wave F)

Specified in full in [`../audit-2026-10/08-RESULT-PAGES.md`](../audit-2026-10/08-RESULT-PAGES.md): steps F1 (league), F2 (every mode, four files to one) and F3 (the highlights and the share card). It needs steps 3 and 5 first: the result screen reads the stage model's `RunData` and links into the one knockout view.

*(Done 3 October 2026: F1 and F2 in full, F3 except I-3 (the share card, left for Phase 11's share-label design). Closes F-13 to F-16, F-21, C-01, C-02, C-03, C-08, C-14, C-16, L-07, L-08, L-09 and N-09 as far as the result screens go. What was built is in [08 §6, *Built*](../audit-2026-10/08-RESULT-PAGES.md).)*

## 7. After phase two

Re-score [`../audit-2026-10/05-UI-RESCORE.md`](../audit-2026-10/05-UI-RESCORE.md) (target 34/40), re-count this set's items (target: nothing open but step 8's deliberate leftovers), then Phase 9.

*(Done 5 October 2026.*
- *The re-score: **38/40** (was 30), in [05 §4](../audit-2026-10/05-UI-RESCORE.md). Aesthetic stays at 3 because of the match sheet (P8-48, Phase 11). Error recovery stays at 3 because a refused queued run is dropped with only a log line.*
- *The recount: all 90 items (72 from phase one, 18 from 09) were found in the set and matched to a step or to 08's and 11's closed lists. **87 are closed and 3 were handed over on purpose:** C-15's remainder (the match sheet's interim text, its two-sided table and the per-leg knockout road, Phase 11 with P8-48), N-14 (long lists, Phase 9) and N-16 (one globe, Phase 9). N-12 is closed by decision: its five pins are the floodlit moments, which stay dark.*
- *One gap in this document's table: **A-01** (one place decides a team's mark) was in 10's step 1 and fell out of the table above. Step 1's A-07 and A-08 finished it. Every club is marked by `TeamMark` (52 references), and the `flagForCountry` calls left take a country, not a club (the placement, a league's country, the pundits' countries, a club's association in the draw), which 05's A-08 allows.*
- *Not centralisation items, carried as they were: M-1 waits on the maintainer (the production page-view probe); step 4's size target for the two live screens is Phase 9.75's to weigh; Wave F's I-3 (the season card as the share image) is Phase 11's.*
- *Phase 8.5 is closed. Phase 9 is next.)*
