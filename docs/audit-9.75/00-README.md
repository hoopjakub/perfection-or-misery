# Phase 9.75 audit: the plan

> Written 7 October 2026. Status of the set: **plan.** No app code has changed.
> Companions: [`../centralisation/13-RE-AUDIT-3.md`](../centralisation/13-RE-AUDIT-3.md) (centralisation round three, kept in its own set so its numbering carries on), [`../PERF-LOG.md`](../PERF-LOG.md) (the phone's first reading), [`../PHASE-9.5-CHECKLIST.md`](../PHASE-9.5-CHECKLIST.md) (the 9.5 statuses), the roadmap's Phase 9.75 ([`../ui-overhaul/11-ROADMAP.md`](../ui-overhaul/11-ROADMAP.md)).

## What this is

Phase 9.5 put the app on the maintainer's phone for the first time since Phase 9: a development build on a POCO X6, the whole checklist, and a shared log. Most of it worked. What didn't is fifteen items (P9.75-01 to -15), from a dark card on light screens to an offline queue that never sends and a tab that freezes the phone for four seconds.

This set does what Phase 9.75 asks before any code: it traces each of those to its cause in the code, re-runs the centralisation audit over what Phases 9 and 9.5 added, and audits the whole app again from scratch, without starting from the earlier lists. It ends in one build order. Nothing is fixed here.

## The short version

| Part | Result |
|---|---|
| The phone's findings | 15 items: **7 causes confirmed in code**, 1 partly (the offline queue: one cause confirmed, three candidates), 5 hypotheses with the probe that settles each, 1 writing task, 1 not a fault yet |
| Centralisation round three | 3 carried items (1 moved), **13 new (R3-01 to -13)**, a 5-step plan; five are "a shared part exists, only some screens use it" |
| Independent logic | 10 findings: 4 wrong, 3 divergent (two of them stale docs), 2 unverified, 1 fragile |
| Independent security | 0 blockers; 1 high (a submitted run's results are the app's word, known), 2 medium, 4 low; 5 dashboard checks |
| The interface, re-scored with the phone | **32/40** (was 38 from code alone) |
| The phone's timings | Stats tab 3.9–4.7 s, the hub opening 0.8–1.6 s, a cup run's stats 1.7 s, the heap 20 → 104 MB |

## Reading order

| # | Document | What it answers |
|---|---|---|
| 01 | [`01-PHONE-FINDINGS.md`](01-PHONE-FINDINGS.md) | The ten non-timing findings: cause, fix, a check that fails today |
| 02 | [`02-PHONE-PERFORMANCE.md`](02-PHONE-PERFORMANCE.md) | The timings: where the time likely goes, the probe for each, the fix after it |
| — | [`../centralisation/13-RE-AUDIT-3.md`](../centralisation/13-RE-AUDIT-3.md) | Centralisation round three: the counts again, R3-01 to -13, phase three in steps |
| 03 | [`03-INDEPENDENT-LOGIC.md`](03-INDEPENDENT-LOGIC.md) | Logic and state from scratch: what's wrong, what isn't checked, what a second run does |
| 04 | [`04-INDEPENDENT-SECURITY.md`](04-INDEPENDENT-SECURITY.md) | Security and release: findings by severity, what only the dashboard can show |
| 05 | [`05-INDEPENDENT-UI.md`](05-INDEPENDENT-UI.md) | The ten heuristics with the phone's evidence; accessibility measured |
| 06 | [`06-BUILD-ORDER.md`](06-BUILD-ORDER.md) | One order for the coding: ten steps, each with a check that fails today |
| 07 | [`07-SECOND-PASS.md`](07-SECOND-PASS.md) | The second pass: three hypotheses measured (one confirmed, two ruled out), three new findings (57 nameless players, an English "Pause", a blind spot in the Slovak check) |
| 08 | [`08-PHONE-SESSION-2.md`](08-PHONE-SESSION-2.md) | The release build on the phone, 8 Oct: rows 975-x, P9.75-16 to -30, the first release readings, the fingerprint failing on Hermes, decisions D6–D9 |
| 09 | [`09-PHONE-SESSION-3.md`](09-PHONE-SESSION-3.md) | The third session, 9 Oct: the fingerprint's second cause (a random comparator, engine 3), achievements on a dead network, rich club and nation facts, the cups' draw before the pundits, the limit test, screens that keep what they showed |

## Worth knowing up front

1. **The offline queue has a confirmed bug, and maybe a server-side cause.** At start-up the queue flushes while the player still reads as a guest, stops, and never tries again (`_layout.tsx:122`, `userStore.ts:41`, `:68`). Separately, an outdated `submit-run` answering 400 would make the app delete the run silently. **Check the function's deployed version on the dashboard before any code** ([`04`](04-INDEPENDENT-SECURITY.md) §2).
2. **The World Cup spin's missing flags are a one-word bug**, and club spins have had it too: the reel looks marks up by the club-season id instead of the club id (`draft.tsx:222`). It passed on the web on 3 October because that check looked at the landed card.
3. **"Pavúk" is the bracket, not a pundit.** The Slovak word for bracket. *(Corrected 8 October 2026, step 3: `BracketPreview` does translate, through `ClubName` and `BracketTree`. The untranslated names were on 22 other lines across 13 files, the live match's "rest of the round" line among them; see 01 §9.)*
4. **The Stats tab mounts every player in the competition at once**, hundreds of rows, on the phone's JS thread: the likeliest of the 4–5 s. Probe, then virtualise.
5. **The project's own instructions are stale** (`CLAUDE.md`, the dev skill, `PROJECT_STATE.md`): they point a builder at deleted components and the old theme. Fixed first, because they misdirect everything after.
6. **The 38/40 of 5 October was optimistic**, as it warned it might be. With the phone's evidence it's 32.
7. **The second pass found 57 players with no name** in both databases (23 squads, Conference and Europa League sides), from the open-data seed; and it ruled out two suspects: the draft's query is indexed (0.7 ms), and ranking the Stats board takes about 1 ms, so mounting its rows is the cost ([`07`](07-SECOND-PASS.md)).

## Decisions taken in this plan

- **The phone's evidence outranks a code-only score.** The re-score uses what the maintainer saw.
- **Every cause not traced in code is a hypothesis with its probe**, and the build order puts the probe before the fix (steps 2 and 4).
- **Centralisation round three lives in its own set** (`centralisation/13`), as rounds one and two did, so its numbering carries on.
- **Floodlit means whole screens** (proposed in 01 §2, the maintainer's call in D1): a card inside an everyday screen follows the screen.

## Decisions (the maintainer, 7 October 2026)

| # | Decision | Answer |
|---|---|---|
| D1 | The live match card on light screens | **Follows the screen** (the default) |
| D2 | A cup run's stats pass | **Chunk it now** (the default) |
| D3 | A seeded, replayable run | **No**: every run is drafted anew; a run isn't meant to be replayed. L-1 and S-1 stay as written: the leaderboard's results are the app's word, guarded by `submit-run`'s plausibility rules |
| D4 | Debug lines on Android's log in the public build | **Warnings and errors only** in the public build (the default) |
| D5 | P9.75-05's run | **The full path**: the hypothesis in [`01`](01-PHONE-FINDINGS.md) §6 holds |

## How this was made

- Read: the roadmap's Phase 9.75, the 9.5 checklist with the maintainer's statuses, his shared log (212 lines) and logcat lines, the centralisation set (08, 11, 12), the Wave G audit, the diagnostics set, and the code, traced end to end for each finding (7 Oct).
- Measured: line counts, call sites, imports, pins, field screens, loading looks, unlabelled pressables (brace-aware; a first naive count was wrong and was redone), `npm audit --omit=dev`, the tracked `.env` (names only, no values).
- Skills: the deep-audit method. **Not run, and why:** the impeccable critique flow and the vibecode checklist. The first needs the app open in a browser, and the maintainer tests the app himself. The second is a website's checklist, and the website's audit is Phase 10's. The phone's own pass stands in for the browser here.
- Not done: nothing was run on the phone or in a browser; every timing is the maintainer's dev-build reading; release numbers come in step 10.
