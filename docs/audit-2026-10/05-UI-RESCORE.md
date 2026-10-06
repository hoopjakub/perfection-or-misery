# 05 · The interface, re-scored

> Part of the Wave G audit. Start at [`00-README.md`](00-README.md).
> Status: **re-score, 2 October 2026; scored again after phase two on 5 October 2026 (§4: 38/40).** The first re-score is of [`../ui-overhaul/01-CRITIQUE.md`](../ui-overhaul/01-CRITIQUE.md) (September, 22/40). The visual direction (Kit Drop, "Winner Stays") is locked and wasn't re-rolled; this scores how far the app has come against the same ten heuristics, with the evidence for each number.

---

## 1. The score

| # | Heuristic | Sept | Now | Why it moved, with evidence | What holds it back |
|---|---|---|---|---|---|
| 1 | Visibility of system status | 3 | **4** | Saving shows ("Saving your run…", "Saved to your runs", Retry), the offline strip and the run queue (P8.5-24), every one of 152 `Plate`s holds in and says "Waiting…" while it works (P8.5-01), the top loading bar on club screens | No field telemetry to say a screen is slow for someone ([`01-MEASURED.md`](01-MEASURED.md) §1) |
| 2 | Match with the real world | 3 | **3** | Real football words in two languages; "SM (Finals)" and "Placement weighting disabled" are gone; competition names are the competitions' own | The guide still says "screw-you-er" and calls Medium "played straight" when it tilts against you (02 G-L4) |
| 3 | User control and freedom | 2 | **3** | Abandon with a confirmation in the league and classic cups (`openConfirm`, 13 uses); no browser `alert` left (`useSimBackGuard.ts:17`); back from a match sheet always has somewhere to go | **The full path has no abandon** (F-10, 0 uses in `custom-ucl-simulation.tsx`); speed is locked to slow in the classic cups and the World Cup (F-05) |
| 4 | Consistency and standards | 2 | **3** | One mark for every team (`TeamMark`, 31 uses), one bracket (`BracketTree`, 11), one table, one tie row; raw hex in UI code down from 115 to 63 | **Four result screens, four layouts** (C-14); 13 files still import the old theme; three speed tables with three sets of values (L-02, worse: 2200/900/250 and 2000/400/100) |
| 5 | Error prevention | 2 | **3** | Runs save on their own and queue offline; destructive actions confirm (delete club, leave, abandon); the draft's slot filtering | "Play without a bench" is still one tap with no undo |
| 6 | Recognition rather than recall | 3 | **3** | The squad stays visible; tappable rows press in; labels on every reroll | The run hub's tabs are the best place to look something up, and the result screens don't send you there first (see 08) |
| 7 | Flexibility and efficiency | 2 | **3** | Spins 0.8 s (were 2.5 s), the globe 1.3 s after the first and skippable ([`01-MEASURED.md`](01-MEASURED.md) §3.5), Ranks filtered by mode, web keys on the run hub | Speed lock in cups (F-05); the result screens make you scroll past everything to reach what you want |
| 8 | Aesthetic and minimalist design | 2 | **2** | The Kit made every screen look like one product | **The result screens stack 13–20 blocks** (the league one 13, the World Cup 20), most of which the run hub already shows in tabs. The maintainer's "scrolling a long damn time to find anything" is this heuristic |
| 9 | Error recovery | 1 | **3** | `InlineError` with Retry (9 places), `EmptyState` (27), "This run's numbers couldn't be read" instead of a blank, register clears its spinner (`register.tsx:53`) and speaks plainly; no developer messages reach players | Save failures on the web show Retry, but a failure inside the queue is only visible on the next launch's strip |
| 10 | Help and documentation | 2 | **3** | The guide opens on a choice of topics (P8-72), the rulebook as a route with `?` bubbles, all in two languages | The guide's difficulty page is wrong about Medium (G-L4); no help on the result screens about where the rest went (08 fixes) |
| | **Total** | **22** | **30/40** | | |

30 is "good" on the critique's own scale. The eight points came from the redesign and Phase 8.5's plumbing; the two heuristics still at 2 or held at 3 by one big item each (aesthetic: the result screens; control: the full path's missing abandon) are exactly what phase two and Wave F are for.

## 2. What would move it next

| Heuristic | To reach | By | Where |
|---|---|---|---|
| 8 | 4 | One result screen, short, with the depth in the hub | Wave F, [`08-RESULT-PAGES.md`](08-RESULT-PAGES.md) |
| 3 | 4 | Abandon in the full path, speed chips in every stage | phase two step 4 (F-10, F-05) |
| 4 | 4 | One result screen (C-14), one speed table (L-02), the old theme gone (C-18) | phase two steps 4, 6, 8 |
| 2, 10 | 4 | The guide's difficulty text fixed in both languages; "screw-you-er" kept only as the custom slider's own name | step 0 |
| 1 | stays 4 (the top of the scale) | Phase 9's logs and Diagnostics, so a slow screen is seen by someone | Phase 9 |

**Target after phase two and Wave F: 34/40.** Re-score with this table when Wave F lands; a heuristic that doesn't move after its fix shipped means the fix missed.

## 3. Not done this time, and why

- **No independent assessments were rerun** (the impeccable critique flow). The direction is locked and the September assessments were verified against the code; this re-score checks each of their complaints against today's code instead, which is what a re-score needs. The impeccable flow runs again for Wave F's screens, where a new design is being made.
- **No personas walk.** The three September personas' red flags were checked individually: the score now shows on the result screen (verdict and `ResultFigures`), the leaderboard has a mode filter, and runs save on their own.

## 4. After phase two (5 October 2026)

Scored again with §2's table once centralisation phase two (steps 0–8) and Wave F had landed. Each "what holds it back" above was checked against the code on 5 October. The scale is 0–4 per heuristic, and a 4 means genuinely excellent (§2 had "4→5" for heuristic 1, which the scale doesn't allow).

| # | Heuristic | 2 Oct | 5 Oct | What moved it, with evidence | What still holds it, or would take it down |
|---|---|---|---|---|---|
| 1 | Visibility of system status | 4 | **4** | Unchanged | Still no field telemetry; Phase 9's logs and Diagnostics |
| 2 | Match with the real world | 3 | **4** | The guide says Medium leans slightly against you, in both languages, and `verify-i18n` fails if it ever says "straight" again (`scripts/verify-i18n.ts:173`). "Screw-you-er" is only the custom slider's own name, as §2 allowed | Nothing found |
| 3 | User control and freedom | 3 | **4** | The full path has abandon on every phase (`CloseRun` → `askAbandon`, `custom-ucl-simulation.tsx:327`); speed is one app setting with chips on all five table and group stages (`StageControls` in `RunChrome.tsx`), so no cup is locked to slow | Nothing found |
| 4 | Consistency and standards | 3 | **4** | One result screen (`app/game/result.tsx`, 68 lines, every mode through `ResultShell`); one speed table (`SPEED_MS`, `src/data/speed.ts:8`); no file imports the old theme; one knockout view, one table stage, one tie row, one match-sheet builder. Raw hex in `app/` and `src/components` `.tsx` files: 33 matches, 23 outside comments (counted with `grep -E "#[0-9A-Fa-f]{6}"`; the earlier 115 and 63 were counted another way, so compare loosely) | The match sheet is still on interim text (121 `ScaleText` lines) with its own table and knockout list (C-15's remainder, Phase 11 with P8-48) |
| 5 | Error prevention | 3 | **4** | "Play without a bench" asks first (`draft.tsx:399`, with the Settings switch "Ask before playing without a bench"). **Correction:** it already asked in the 1 October commit, so 2 October's "still one tap with no undo" was wrong, and the 3 should have been a 4 | Nothing found |
| 6 | Recognition rather than recall | 3 | **4** | The result screen ends in doors into the run hub, each with a one-line preview of what's behind it (`resultDoors`, `src/lib/resultStory.ts`); the depth moved into the hub's tabs (Pundits, Cup, Europe, Squad) | Nothing found |
| 7 | Flexibility and efficiency | 3 | **4** | Speed everywhere and kept between runs; the web keys (Space, the arrows) on all five table stages through `TableStage`, not only the league; Fast skips straight to your match's card; the result screen's actions are pinned (phone) or beside the verdict (wide) | Nothing found |
| 8 | Aesthetic and minimalist design | 2 | **3** | The result screens went from 13–20 blocks to three under the verdict (figures, the story, the doors) | **The match sheet**: one long scroll of sections on interim text, and it's the screen players open most after the result. Its redesign is P8-48 in Phase 11. Not a 4 until then |
| 9 | Error recovery | 3 | **3** | Unchanged | A run the server refuses is dropped from the queue with only a log line (`src/lib/runQueue.ts:47`), and the queue shows only while offline (`OfflineStrip`). Phase 9's logs will make the first visible to the maintainer, not to the player |
| 10 | Help and documentation | 3 | **4** | The guide's difficulty page is right; the result screen's doors say where the rest of the run went | Nothing found |
| | **Total** | **30** | **38/40** | | |

**The target was 34; the score is 38.** Two of the four points over target come from fixes that shipped as planned (2 and 10 needed only step 0 and Wave F). One is the correction on 5. One is 6, which §2 didn't plan for but Wave F's doors answered. Every heuristic §2 named moved after its fix shipped, so no fix missed.

**How far to trust it.** It's scored from the code, as 2 October's was, with no independent assessments and no screens opened (the maintainer tests). Phase two's checklist rows (S1 to S8 in [`../PHASE-9.5-CHECKLIST.md`](../PHASE-9.5-CHECKLIST.md)) haven't been checked yet, and a row that fails there takes its heuristic back down. The next full critique, with the impeccable flow's independent assessments, is Phase 11's.
