# 03 · The independent audit: logic and state

> Part of the Phase 9.75 audit. Start at [`00-README.md`](00-README.md).
> Status: **findings and plan, 7 October 2026.** Read from the code on that day, deliberately not starting from the earlier audits' lists (the maintainer: "completely independent of everything, to find issues"). Where a finding turns out to repeat an older one, it says so.

Classes as the deep-audit method uses them: **Wrong** (incorrect today, with a reproduction), **Fragile** (breaks under a named condition), **Unverified** (no check would notice), **Divergent** (two answers to one question, or docs against code), **Hypothesis** (not yet probed).

---

## 1. Findings

| # | Finding | Class | Evidence (7 Oct) | Proposed check / fix |
|---|---|---|---|---|
| L-1 | **A run seen on the phone can't be replayed.** Results, draws, placements and the draft's spins draw from `Math.random` (25 uses in 11 engine files: `match.ts`, `cl-sim.ts`, `world-cup-sim.ts`, `cl-draw.ts`, `cl-qualifying.ts`, `fixtures.ts`, `placement.ts`, `draft.ts`, `knockout-match.ts`, `stats.ts`, `quick-sim.ts`). The seeded layer (sheets, timelines) replays; the run doesn't. | Unverified | grep, 7 Oct | Decision D3: one run seed, threaded through every draw. It also makes a phone bug report reproducible and lets the server re-run a submitted run. Large; after 1.0 unless D3 says otherwise |
| L-2 | **A queued run is lost on a server 400.** `submit-run` answers 400 for an insert error and 422 for a refused run; the app's queue treats both as permanent and deletes the run with one log line. | Wrong (by design, but silent) | `offlineError`, `runs.ts:91`; `flushQueue`, `runQueue.ts`; `submit-run/index.ts` | Kept in a refused list, shown ([`01-PHONE-FINDINGS.md`](01-PHONE-FINDINGS.md) §7, Q3) |
| L-3 | **The queue's start-up flush stops for a signed-in player.** | Wrong | `_layout.tsx:122`, `userStore.ts:41`/`:68` (01 §7, Q1) | `verify-run-queue`: guest → account mid-flush (fails today) |
| L-4 | **The log's run outlives the run.** `runStarted` on `startRun`; `runEnded` only on the result or abandon. Leaving a draft before the first pick never ends it. | Wrong | the maintainer's log, 7 Oct; `draft.tsx:141` | R3-12 ([`../centralisation/13-RE-AUDIT-3.md`](../centralisation/13-RE-AUDIT-3.md)). *Fixed 8 Oct, step 8* |
| L-5 | **Opening a saved run writes the save ledger** ("skipped · tester or a saved run"), so Diagnostics can say the live run wasn't saved when it was. | Wrong | `useRunSave` status `off` for history views → `noteSave` | R3-13. *Fixed 8 Oct, step 8* |
| L-6 | **The fingerprint has never run on the phone.** P9-8 is marked checked in the bulk pass, but the shared log has no `self-test` lines; whether Hermes rebuilds seeds as V8 does is still unknown. | Unverified | the log, 7 Oct | The maintainer runs the self-test once (Diagnostics → Run self-test) and shares the report; un-check P9-8 until then |
| L-7 | **Two unbounded session caches.** `saved` in `runData.ts` keeps every saved run's whole `RunData`; the roster cache keeps every club-season read. Correct, but with no limit. | Fragile (long sessions) | `runData.ts`, `seasons.ts` | Cap `saved` at three runs; see [`02-PHONE-PERFORMANCE.md`](02-PHONE-PERFORMANCE.md) §5 for the probe first |
| L-8 | **The old theme still exports `colors`, `spacing`, `typography`** with no users, while `CLAUDE.md` and the dev skill still tell a builder to use them. | Divergent | `theme.ts:3`, `:179`, `:195`; no importer | Delete the exports; fix the docs (L-9) |
| L-9 | **The project's own instructions are stale.** `CLAUDE.md` and `.claude/skills/pom-dev/SKILL.md`: `BackButton` "in ui.tsx" (deleted in phase two step 8), the `colors.*`/`spacing`/`typography` tokens (no importer), "capped to a centered ~480px column" (no frame cap since Phase 6), "Shared feedback primitives: PressCard … BackButton". `docs/PROJECT_STATE.md`: the `cl-result` and `wc-result` routes (merged into `result` in Wave F) and `SquadSummary`, `PenShootout` (deleted). Every future session reads these first. | Divergent | grep, 7 Oct | Rewrite the UI conventions in both files against today's kit; a line in `verify-diag` that fails when `CLAUDE.md` names a file or export that doesn't exist (a small list of known names) |
| L-10 | **P9-8 and the bulk "Phase 9 all works"**: rows that needed a specific action (P9-6 the probes, P9-14 the first reading, P9-20 the live line) can't all have been seen in one session that watched no live match. | Divergent (doc) | the checklist v the log | P9-8 and P9-20 back to unchecked; P9-6 is answered by the 7 Oct reading; P9-14 partly (a dev build, not the release build it asks for) |

## 2. What holds (checked, so it isn't re-done)

- **The seeded layer replays within one engine**: `verify-diag-golden` (50 matches, raw and shown hashes) and `verify-match-detail` / `verify-deep-match` with `--seed` (3,841,896 and 2,645,369 checks).
- **Difficulty stays on your matches**: `verify-difficulty`.
- **One table order, one tie line, one stage model**: phase two's checks (`verify-stages`, `verify-press`, `verify-awards` and the rest), all green on 6 Oct.
- **The legal build ships no real names**: `verify-legal-bundle` on a real export, green on 6 Oct.

## 3. Second time round (the Dugout's "season one is the easy season")

| Situation | What happens | Verdict |
|---|---|---|
| A second run in one session | `startRun` resets the store; `liveRunData`'s new guard drops a stale answer (Phase 9) | holds |
| A second saved run opened | its `RunData` is kept beside the first (L-7) | holds, unbounded |
| After sign-out and in again | the session's keys go, the rest stays (Phase 9's fix); a queued run waits for its own account | holds; D-6 not yet checked on the phone |
| After a reload mid-season | the season is lost (by design, `verify-reload`: 21 of 34 store fields) | written down; still a gap worth a decision after 1.0 |
| After a `DB_VERSION` bump | the phone re-copies the database (`db:install`, timed) | holds |
| After an `ENGINE_VERSION` bump | every saved run's sheets change; the golden check forces the decision | holds |

## 4. Order

L-3 and L-2 with P9.75-06 (the offline step); L-4 and L-5 with phase three step 5; L-8 and L-9 in the first step of coding (cheap, and they misdirect the rest); L-6 and L-10 are the maintainer's next session; L-1 and L-7 wait for their decisions and probes.
