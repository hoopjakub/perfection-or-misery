# 08 · Wave F: one short result screen, the depth in the run hub

> Part of the Wave G audit. Start at [`00-README.md`](00-README.md).
> Status: **as built (F1, F2, F3 except I-3), 3 October 2026; plan, 2 October 2026.** What landed and what didn't is in §6, *Built*. Roadmap P8.5-43 (Wave F) and centralisation phase two's step 6 (P8-54, "one result screen") planned as one piece of work, as the maintainer asked: *"we want the user experience to be good, so scrolling a long damn time to find anything? come on, some of the stuff comes with centralization hand in hand."* The visual language is Kit Drop as locked; the screen's own design goes through the impeccable flow when it's built (§7).

---

## 1. Today

Four result screens, one per family, each a single long scroll. In order, as they render (2 October):

| Screen | File | Blocks before Play again | What's on it |
|---|---|---|---|
| League | `app/game/result.tsx` (1,018 lines) | **13** | mode banner, verdict, figures, the pundits' whole table, awards/run plates, season strip + position graph, one matchday's results + its team, the final table, the cup, highlights, medical, lineup, squad |
| Classic Champions League | `app/game/cl-result.tsx` (776) | **14** | verdict, figures, the pundits' tournament, three plates, champions, the bracket, your league phase, the full league phase table, medical, lineup, squad |
| World Cup | `app/game/wc-result.tsx` (885) | **20** | verdict, figures, your matches, the pundits' tournament, three plates, the champions, the bracket, your group, best thirds, the grounds map, every group, medical, lineup, squad |
| European full path | `app/game/custom-ucl-result.tsx` (520) | **17** | verdict, figures, pundits, plates, champions, bracket, league phase, the 36-club table, qualifying, domestic leagues, medical, lineup, squad, the rest of Europe |

Three things stand out:

1. **Play again and Home are at the very bottom** (`<ResultActions>` at `result.tsx:593`, `cl-result.tsx:407`, `wc-result.tsx:509`, `custom-ucl-result.tsx:476`). The action you most often want next is the last thing on the page.
2. **Most of it is already in the run hub, in tabs.** `app/game/run.tsx` has Table/Groups, Bracket, Season, Teams, Stats, Press and Squad (`:41`), each mounted only when opened. The result screens draw the same tables, brackets and squads again, inline, all at once (P-4 in [`04-PERFORMANCE.md`](04-PERFORMANCE.md)).
3. **Four layouts for one job** (C-14, U-2). The family differences are which tables and which bracket, which is data, not a different screen.

## 2. What a player wants after a run

Reasoned from how the game is played, not from colours (P8.5-43 asks for this first), and checked against the playtest notes in the roadmap:

| Moment | Wants | Today |
|---|---|---|
| The second the run ends | **The verdict**: what tier, what score, beat the pundits or not | Yes, at the top (the verdict block) |
| Seconds later | **Again**, or **home** | At the bottom of 13–20 blocks |
| If it went well | **To show someone** | Share sits inside the verdict; good |
| If something surprised them | **The story**: the match that decided it, the player who carried it, the one that got away | Scattered: highlights in the league only (F-16), MOTM nowhere on the page |
| Sometimes | **One specific thing**: the table, the bracket, a match, a player | Present, but you scroll past everything else to find it |
| Rarely, later | Everything | The run hub, one tap from the plate, and from Runs |

Roguelikes that are good at this (a run's end screen in the deck-builders and action roguelikes of the last decade) share the same shape: the verdict, a handful of numbers, **one** call to action, and a door to the full history. They don't put the full history on the end screen. *This is a pattern observation, not a cited study.*

## 3. The proposal

**One result screen for every mode (phase two step 6), short enough that its last block is above the fold on a tall phone and one swipe away on a short one.** Everything else is a door into the run hub, which becomes the one place a run's detail lives.

Top to bottom:

1. **The verdict** (`VerdictBlock`, unchanged): tier, line, score with its multiplier, the pundits' check, share.
2. **The actions, right under it**: Play again (primary) and Home. On a phone they also live in a `ThumbBar` pinned to the bottom, so they're always one thumb away however far you scroll.
3. **Figures** (`ResultFigures`): one row, unchanged.
4. **Three highlights**, picked from what the run actually produced, each a tappable row that opens its match, player or story:
   - the deciding match (the title-clincher, the knockout exit, the relegation decider, else the biggest win);
   - the star: the player with the best season rating in your XI;
   - one of: the one that got away (idea I-2), the rival (I-4), the best press headline.
5. **Doors**: one row each, with a one-line preview, opening the run hub on that tab:
   - **Table** or **Groups** · "3rd of 20, 71 pts" / "Group C, 2nd"
   - **Bracket** (cups) · "Out in the quarter-final to Inter"
   - **Your season** · "21W 8D 9L, best run 7 unbeaten"
   - **Awards** · "Player of the season: …"
   - **Squad** · "Top scorer: … (18)"
   - **Europe** (full path) · "The rest of Europe: Liverpool won the Champions League"
6. Nothing else. The medical table, the lineup pitch, every group and the grounds map move to the hub's tabs (Squad gets the medical table and the lineup; Groups gets every group; the World Cup's grounds go under Bracket).

**What changes in the hub.** It must open for a run that has just finished and isn't saved yet (today `hasHub` already covers fresh runs, `result.tsx:431`), gain an **Awards** tab (Awards Night's results, not its ceremony), and take the result screen's blocks listed in 6.

### 3.1 Wireframes

Phone (~360 pt):

```
┌────────────────────────────────────┐
│ ◂                         2025/26 │
│  ALMOST PERFECTION                 │  verdict: tier, line,
│  3rd of 20 · 4,812 pts ×1.24       │  score and multiplier
│  The pundits said 9th. Wrong.      │  pundits' check
│  [ Share ]                         │
│ ┌────────────────┐ ┌─────────────┐ │
│ │  Play again  ▶ │ │    Home     │ │  actions, right here
│ └────────────────┘ └─────────────┘ │
│  PTS 71  W 21  D 8  L 9  GD +29    │  figures
│ ── THE STORY ───────────────────── │
│  ⚽ The decider  2–1 v Arsenal  ›  │  three highlights,
│  ★ Your star   Kane 7.9 avg    ›   │  each opens its page
│  ↺ Got away    Saka, 16 goals  ›   │
│ ── THE REST ────────────────────── │
│  Table      3rd of 20, 71 pts  ›   │  doors into the
│  Your season 21W 8D 9L         ›   │  run hub's tabs
│  Awards     POTS: Kane         ›   │
│  Squad      Top scorer Kane 18 ›   │
├────────────────────────────────────┤
│ [ Play again ▶ ]        [ Home ]   │  ThumbBar, pinned
└────────────────────────────────────┘
```

Wide (≥1024): verdict and actions on the left third; the story and the doors in the right two-thirds, side by side; no ThumbBar.

## 4. States

**Every possible state:** fresh run, saving · fresh run, saved · fresh run, save failed (Retry) · fresh run, offline (queued) · a saved run opened from Runs · a saved run from before match-by-match detail (no highlights, no hub tabs that need matches: the doors say so) · an older cup run (`CLHistorySummary`/`WCHistorySummary` today, F-21) · a guest's run (no share link) · someone else's run opened from a link (no Play again, an owner line) · a Chaos or Cursed run (mode banner) · a hunting run (hunting tag) · Slovak.

**In use at launch:** all of them. The older-run screens (F-21) become the same screen with fewer highlights and fewer doors, not a separate component.

## 5. What it's built from

| Piece | Exists | Change |
|---|---|---|
| `VerdictBlock`, `ResultFigures`, `ShareLinkPlate` | yes | none |
| `ResultActions` | yes | moves under the verdict; a `ThumbBar` copy on phones |
| Highlights | league-only today (`result.tsx:441`) | one `runHighlights(runData)` in `src/lib/`, every mode; a script can call it (lessons: logic that decides what a page says goes where a script can reach it) |
| Doors | `ListRow` | a `value` preview per door from `RunData` |
| The run hub | `app/game/run.tsx` | an Awards tab; takes the medical table, lineup, every group, the grounds |
| `RunData` | `src/lib/runData.ts` | already the one shape for live and saved runs; the result screen reads it too, instead of its own `simResult` / `dbRunData` branches |

## 6. Implementation

### Step F1 · The one screen, league first
**Build**
- `app/game/result.tsx` rebuilt to §3 on `RunData`; `runHighlights` in `src/lib/` with a `scripts/verify-highlights.ts` that runs it over synthetic seasons.
- The run hub gains Awards and the moved blocks.

**Done when**
- `result.tsx` renders at most 6 blocks below the verdict (count the top-level children; fails at 13 today).
- `<ResultActions` appears before the first highlight in the file (grep order; fails today).
- `verify-highlights` passes: every season yields 1–3 highlights, each pointing at a real match or player id.
- **Maintainer checks:** finish a league run on a phone-width window; Play again is visible without scrolling; every door lands on the right hub tab.

### Step F2 · Every mode on the same screen
**Build**
- `cl-result.tsx`, `wc-result.tsx` and `custom-ucl-result.tsx` deleted; the routes point at the one screen, which picks its doors from the run's mode.
- F-21's history summaries go too.

**Done when**
- Four result files become one (`ls app/game/*result*.tsx` lists one; fails today with four).
- No `StatBox`, `StandingsRow`, `TeamMatchdays` or `BracketTeam` left in `app/` (C-14, C-17).
- **Maintainer checks:** one run in each family, and one old saved cup run from Runs.

### Step F3 · The extras
**Build:** I-2 (the one that got away) and I-4 (rivals) as highlight candidates; I-3 (the season card) as the share image.
**Done when:** `verify-highlights` covers both; the share card has one definition (N-18).

### Built (3 October 2026)

- **F1 and F2 together.** `app/game/result.tsx` is a 68-line router: it loads a saved run (and its crest), picks the family from the run's mode and hands it on. The families are `src/components/season/results/LeagueResult.tsx`, `CupResults.tsx` (`ClassicCupResult`, `WorldCupResult`, `FullPathResult`) and `OlderRunResult.tsx` (F-21). Each keeps only its verdict, figures and save, and draws through `ResultShell.tsx`: verdict, figures, the story (1–3 rows), the doors. On a phone the actions sit in a pinned `ThumbBar`; on a wide window they sit under the verdict in the left pane.
- **The story** is `src/lib/resultStory.ts` (`runHighlights`, `resultDoors`). `scripts/verify-highlights.ts` runs it over 3,000 synthetic leagues and 2,000 cup runs (42,519 checks). It was seen failing when the decider rule was broken on purpose.
- **The depth moved to the hub** (`app/game/run.tsx`, `src/components/season/RunMore.tsx`): new Pundits, Cup and Europe tabs (shown only when the run has them), the World Cup's grounds under Bracket, and Squad opening on the lineup and the medical table. `RunData.more` carries what they need, for live and saved runs. Cup saves now keep the pundits' seed and the got-away list in `highlights`.
- **Done-whens:** `ls app/game/*result*.tsx` lists one file; no `StatBox`, `StandingsRow`, `TeamMatchdays` or `BracketTeam` in `app/`; `ResultActions` comes before the story in `ResultShell`; three blocks below the verdict (figures, story, doors), plus the pinned bar.
- **Routes:** `cl-result`, `wc-result` and `custom-ucl-result` are deleted. `runRoute()` returns `/game/result` for every mode, Awards Night has lost its `?to=` key, and the quick-sim tester's full path now runs under `champions_league_custom` (it ran under the classic mode's name and relied on its own route).
- **L-07:** `stashRunStats` / `takeRunStats` are gone. Awards Night and the verdict both read `liveRunData()`'s cache.
- **Removed as dead:** `ResultSection`, `YourMatches`, `TitleWithInfo`, `berthLabel`, `SquadSummary.tsx`, and the 50 translation keys only the old screens used (en and sk).
- **F3:** I-2 (the one that got away, recorded at the draft) and I-4 (the rival) are story candidates. **I-3, the season card as the share image, is not built:** the verdict's share is still text (`shareText`), and one share card (N-18) belongs with the share label's design in Phase 11's UI overhaul (07d D11). Recorded here rather than half-built.
- **The pundits' cup line:** the verdict already compares the pundits' call with how far you got, so the Pundits door on a cup run reads "Their tournament against yours" rather than repeating it.

## 7. Design pass

When F1 starts, run `impeccable:impeccable` on the new screen for the shape (not the direction, which is locked): hierarchy, spacing, and how the verdict's moment hands over to the actions without losing the payoff. P8-111's ceremony and the verdict's stamp stay.

## 8. Risks

| Risk | Likelihood | What happens | Mitigation |
|---|---|---|---|
| The payoff feels smaller with less on the page | medium | the maintainer liked seeing everything at once | the verdict and the three highlights carry the payoff; the doors' previews tell you what's behind them; F1 ships on the league alone first so it can be judged |
| The hub can't open a fresh, unsaved run in some mode | low | a door leads nowhere | `RunData` already covers live runs; F1's done-when lands every door |
| Older saved runs lack the data for highlights | certain | fewer highlights | the screen shows what exists; no placeholder rows |

## 9. Documents to update when built

- `docs/ui-overhaul/07d-SCREENS-RESULTS.md`: replace the per-mode result layouts with this one.
- `docs/centralisation/12-PHASE-TWO-FINAL.md` step 6: closed by F1–F2.
- `docs/ui-overhaul/11-ROADMAP.md`: P8.5-43 and P8-54 *(Done …)*.
- `docs/PHASE-9.5-CHECKLIST.md`: rows for each mode's result screen and the hub's new tabs.

## 10. Shape (impeccable `shape`, 3 October 2026)

Run as §7 asked, for the shape only: Kit Drop stays the world (DESIGN.md), no direction re-rolled, no browser. Mode: **Operate**. The player has just finished a run and wants, in order: the verdict, then again or home, sometimes the story, rarely everything.

**Decisions taken with the maintainer (3 Oct):**
- **The pundits** (the league's whole table, P8-24, and the cups' tournament played out, P8-165) get a **Pundits tab in the run hub** and a door here ("They had you 9th · you finished 3rd"). Their one line stays in the verdict.
- **Actions:** on a phone, one **pinned bar** (Play again, Home), always a thumb away, and not repeated under the verdict; on a wide window, the buttons sit under the verdict and there's no bar. Never two copies on screen.
- **Awards:** the door opens the **existing awards page** (results, no ceremony); no second rendering as a hub tab.

**Sequence, top to bottom (phone):**
1. The mode banner (Chaos, Cursed) when the run has one.
2. **The verdict** (`VerdictBlock`, unchanged): the focal moment and the payoff. Nothing competes with it above the fold.
3. **The figures** (`ResultFigures`), one row.
4. **The story** (`SectionTag`), one to three rows, then **the rest**, the doors.
5. An owner line on someone else's run.
6. The pinned bar (`ThumbBar`) with `ResultActions`; the page keeps room under its last row so the bar never covers it.

**Wide (expanded):** two panes (`PaneRow`). Left, a third: banner, verdict, figures, the actions. Right, two thirds: the story and the doors side by side.

**Row anatomy:**
- **A story row** (`ListRow`, T1): what it is ("The decider", "Your star", "The one that got away", "Your rival", "The headline") as the label, the fact as the value ("2–1 v Arsenal", "Kane · 7.9"), a link chevron. It opens the match sheet, the player page or the story. No row without a subject to open.
- **A door** (`ListRow`, T2): the hub tab's name as the label, one line of what's behind it as the value, a link chevron. It opens the hub on that tab (or, for Awards, the awards page).

**States:** fresh and saving / saved / save failed (Retry) / offline and queued, all carried by `ResultActions` as today · a saved run from Runs (the actions say Home; no Play again from someone else's run) · an older run without match detail (fewer story rows, the doors that need matches left out, the hub's "missing" line explains) · someone else's run (owner line, no Play again) · Chaos or Cursed (banner) · a hunting run (its tag in the verdict's meta) · Slovak (labels through `t()`; values are one line and truncate rather than wrap the row).

**Built from:** `VerdictBlock`, `ResultFigures`, `ResultActions`, `ListRow`, `SectionTag`, `ThumbBar`, `PaneRow`/`Pane`, `ModeBanner`. New: `ResultShell` (this layout, once), `runHighlights` and `resultDoors` (what it says, in `src/lib`, checked by `scripts/verify-highlights.ts`).

**Anti-goals:** no table, bracket, squad or medical on this page; no placeholder rows; no second verdict; no colour as the only signal (the doors' previews are words).
