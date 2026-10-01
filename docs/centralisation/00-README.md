# 00 · Centralisation: one base, only extend (P8-71)

**Date:** 24 September 2026; **re-audited 29 September 2026**, after Phase 8. **Status:** research complete, re-audited. Phase two (the changes) is planned in [10](10-PHASE-TWO-REVISED.md), which supersedes 07's order, and is not started.

> **29 September 2026, the re-audit.** Of the 72 items, 10 are closed (the one team mark and the one bracket did most of it), 16 partly, 36 still open, 4 worse and 2 still wrong; 18 new items came with Phase 8 ([08](08-RE-AUDIT.md), [09](09-NEW-ITEMS.md)). The maintainer's playtest notes of that day go first ([10](10-PHASE-TWO-REVISED.md) §2).

## What this is

P8-71 in the [roadmap](../ui-overhaul/11-ROADMAP.md) asked for the app to "feel like one thing, not pieces put together". The maintainer split it into two phases. Phase one is research: find everything that is drawn, computed or behaves differently although it should be the same, and every feature one mode has and another lacks. Phase two makes the changes. This set is phase one.

It goes mode by mode and screen by screen. The seven mode ids run through four families of screens (league season, classic Champions League, full path, World Cup), and most of what's wrong comes from those four having grown apart: the same table, match row, tie, shootout, crest and helper written two to seventeen times, with each copy fixed or extended on its own. The findings are split by kind into four documents, walked screen by screen in a fifth, and turned into a build order in the last.

## The short version

| Kind | Document | Items | What they are |
|---|---|---|---|
| Feature parity | [02](02-FEATURE-PARITY.md) | 23 (F-01 to F-23) | features one family has and another lacks |
| Drawn differently | [03](03-DRAWN-DIFFERENTLY.md) | 18 (C-01 to C-18) | one idea drawn by several components |
| Computed differently | [04](04-COMPUTED-DIFFERENTLY.md) | 16 (L-01 to L-16) | one calculation written several times; 2 wrong today |
| Marks and colours | [05](05-MARKS-AND-COLOURS.md) | 13 (A-01 to A-13) | crests, flags and club colours |
| Screen-only | [06](06-SCREEN-WALK.md) | 2 (S-01, S-02) | found on one screen, nowhere else |
| **Total** | | **72** | |

Many items are groups. C-01 alone is twelve table drawings, and A-01 is seventeen places that each decide what a team's mark is. Counted by place in the code rather than by idea, the items point at more than 150 separate spots.

## Reading order

| # | Document | Answers |
|---|---|---|
| 01 | [Mode map](01-MODE-MAP.md) | Which screens each mode passes through, what each screen is built from, and what is already shared |
| 02 | [Feature parity](02-FEATURE-PARITY.md) | What does one mode have that another lacks? |
| 03 | [Drawn differently](03-DRAWN-DIFFERENTLY.md) | Where is one thing drawn by several components? |
| 04 | [Computed differently](04-COMPUTED-DIFFERENTLY.md) | Where is one answer worked out several times, and which copies are wrong? |
| 05 | [Marks and colours](05-MARKS-AND-COLOURS.md) | Why do nation flags and crests still break? |
| 06 | [Screen walk](06-SCREEN-WALK.md) | For one screen, which items touch it? |
| 07 | [Phase two plan](07-PHASE-TWO-PLAN.md) | What is the base, and how does each step prove itself? (Its order is superseded by 10.) |
| 08 | [The re-audit](08-RE-AUDIT.md) | Where does each of the 72 items stand on 29 September, after Phase 8? |
| 09 | [New items](09-NEW-ITEMS.md) | What did Phase 8 add that should share one base, and where do the playtest notes meet this set? |
| 10 | [Phase two, revised](10-PHASE-TWO-REVISED.md) | In what order now, starting with the playtest notes, and how does each step prove itself? |

## Findings worth knowing up front

1. **The nation flags break because of a default, not the data.** Batch 13 fixed the flag table. But `ClubName` shows a drawn initials badge unless the caller remembers to pass a flag, and four callers don't (the pundits table, the run hub rankings, the stories). `ResultRow` always draws a crest. The pundits' verdict tables draw no mark at all, in every mode, which is the "no images" screenshot. One `TeamMark` that decides by the team's id closes eight items (A-01 to A-08).
2. **Two helpers are wrong today.** The classic and full-path result screens print "21th", "22th" and "23th" for league-phase places (L-10), and every `surname` copy turns "van Dijk" into "Dijk" (L-11). Both are cheap to fix, and they're in step 0.
3. **The World Cup's matchday lookback is dead code.** The state exists, and nothing ever sets it (F-06). The groups also lack the team of the matchday, the speed chips and the standing figure that the league season has.
4. **The full path has drifted furthest.** No abandon button, no pundits, no standing movement, its own slower speed values, match sheets opened without rotation or context, and a domestic season that counts for nothing on the result screen (F-07, F-10, F-20, F-22, L-02, L-05).
5. **The league screens are the reference.** The league season is the most complete live screen, and the league result screen is the only one with round-by-round lookup, a team of the matchday, a position graph and highlights (F-13 to F-16). The base grows out of those two screens.
6. **Copies breed bugs.** The standings order is written 16 times, match-sheet requests are built by hand in 16 places, the awards night is built in 6. Two batch-13 bugs (P8-156, the lost crests, and P8-159, leg 2 skipping extra time) were copies drifting apart.

### Worth knowing from the re-audit (29 September)

7. **Where a shared piece existed, it got used; where it didn't, new code copied.** `TeamMark` (31 call sites) and `BracketTree` (9) spread by themselves. The standings order (14 copies), the speed table (3) and the match-sheet request (18) didn't have one, and three items got worse ([08](08-RE-AUDIT.md) §7).
8. **The "21th" and "Dijk" bugs are still there** (L-10, L-11): step 0 was never done.
9. **The Europa and Conference League modes inherited the Champions League's gaps**, and one is wrong: "Your eight" for a six-game league phase (N-02).
10. **Sixteen shared components are fixed to one ground**, which is the "black box" behind the globe and the bracket (N-12); it's what "a light and a dark variant for every component" means in practice.

## Decisions taken

- **Phase two builds a read model, not a new engine.** Runs become a list of stages (table, groups, knockout) built from the engine's existing results (07 §2.1). How a result is decided doesn't change.
- **A team's mark is decided by its id, in one place** (`TeamMark`, 05 A-01). No caller passes a flag, and no caller looks one up by name.
- **"Only extend".** A mode can add a tab, a section or a stage to the base (the World Cup's thirds, the full path's qualifying). It can't redraw or recompute what the base already does.
- **The result screen rebuild is P8-54's batch.** P8-54 already plans one skeleton for all four modes "after P8-71's centralisation has given tables, ties and scorelines one component each". Steps 1, 3 and 5 of the plan are that precondition (07 step 6).

## Open decisions

| # | Decision | Default if nobody decides |
|---|---|---|
| D1 | Which step comes first | Steps 0 and 1 together: the cheapest, and they fix the breakage the maintainer named |
| D2 | Your own match in a league or league phase: played out live (`LiveMatch`) or shown as a finished card | Live everywhere; the fast speed skips straight to the card (F-09) |
| D3 | Does a World Cup group get a position graph? | No; league seasons and league phases only (F-15) |
| D4 | The standings tiebreak | Keep points, goal difference and goals scored, and add one final deterministic tiebreak; no competition-specific rules (L-01) |
| D5 | Does a stage start on arrival or wait for a tap? | Wait for the first tap, everywhere (L-16) |
| D6 | The seven qualifying clubs without a crest | Accept the drawn fallback and say so in `PROJECT_STATE` (A-10) |
| D7 | Should the cups keep a pace locked to slow? | No; one speed setting for every stage (F-05) |

## How this was made

- Read from the code on 24 September 2026, file by file, with grep sweeps to count call sites and copies. Every item cites `path:line` as of that date. Line numbers will drift as phase two lands.
- Measured where possible: a scratch script checked every World Cup nation's flag by name and by id (48 of 48 resolve both ways), and every player nationality (157 of 182 have no flag). Database queries listed the clubs without crests (7) and the ones still on the placeholder colour (5). Raw `<Text>` and old-theme imports were counted per file.
- Several claims were dropped or corrected while checking. The awards pitch doesn't draw event marks. `LineupPitch` is already a kit wrapper. The web build already installs a flag-emoji font. The three copies of the pundits' field (L-13) and the colour lookups (L-15) agree today and are listed as fragile, not wrong.
- No app was launched. The maintainer tests features themselves, and the repo's rule is no browser self-testing. What only a phone can show is written as *Maintainer checks* in the plan.
- Companion skills: the Kit Drop direction is locked (`DESIGN.md`, `docs/ui-overhaul/04-DIRECTION.md`), and this audit looks at structure, so `impeccable` wasn't run. The release-credibility checklist (`vibecode-audit`) doesn't apply to centralisation. Every page went through the humanizer.
- Not done:
  - the career page's grouping of non-league modes wasn't checked (06 §5);
  - three things need a probe script before they're called bugs: whether the full path rotates (L-05), whether the live and result teams of the matchday agree (L-09), and whether the confirm route pauses a sim through `usePauseOnBlur` (L-12).

## Related

- [11-ROADMAP](../ui-overhaul/11-ROADMAP.md): P8-71 (this), P8-54 (the result screens, step 6), P8-48 (the match screens), P8-50 (the formation pitch, already centralised).
- [08-COMPONENTS](../ui-overhaul/08-COMPONENTS.md): the component list phase two updates.
- [PROJECT_STATE](../PROJECT_STATE.md).
