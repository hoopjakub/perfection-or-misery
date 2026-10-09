# 13 · The third re-audit: after Phases 9 and 9.5

> Part of the [centralisation set](00-README.md). Status: **findings and plan, 7 October 2026**, re-measured from the code on that day for Phase 9.75 ([`../audit-9.75/00-README.md`](../audit-9.75/00-README.md)). Line numbers are from that day. Status words as in [`08-RE-AUDIT.md`](08-RE-AUDIT.md).

Phase two closed 87 of 90 items on 5 October ([`12-PHASE-TWO-FINAL.md`](12-PHASE-TWO-FINAL.md) §7). Since then Phase 9 added the diagnostics, loading states, a list, timing wrappers and logging across the app, and the 9.5 pass on the phone showed what the code alone didn't. This re-audit counts again: the three items handed on, then new items numbered on as **R3-01** onward.

---

## 1. The short version

| | Count |
|---|---|
| Items carried from phase two | 3 (C-15 remainder, N-14, N-16) |
| … of which moved | 1 (N-14 partly: Runs is virtualised; the run hub's boards aren't) |
| New items (R3) | 13 |
| … from the phone's findings | 7 (R3-01, -02, -03, -05, -06, -09, -12) |
| … found re-measuring | 6 |

**The pattern behind most of them:** Phase 9 added good shared parts (`KeyboardSafe`, `GhostRows`, `useSettledOnce`, `timeToFrame`) and applied each to *some* screens. Phase two's rule ("one base, only extend") says the base should apply them, not each screen. Five of the thirteen are "a shared part exists but only some screens use it".

---

## 2. The three carried items

| # | Item | 5 Oct | 7 Oct | Evidence |
|---|---|---|---|---|
| C-15 | The match sheet on the kit | Partly (rest to Phase 11) | **Partly, unchanged** | `match-stats.tsx` 1,257 lines; `ScaleText` still in 8 files (`match-stats.tsx`, `MatchStatsParts.tsx`, `MatchLineupPitch.tsx`, `MomentumGraph.tsx`, `InfoBubble.tsx`, `TeamLabel.tsx`, `ui.tsx`, `WCGroupModal.tsx`); 8 of the app's 13 unlabelled pressables are on it. Stays with Phase 11 (P8-48) |
| N-14 | Long lists | Open | **Partly** | Runs is a `FlatList` (Phase 9). The run hub's player and club boards, the press list and the teams of the round still mount every row (and the Stats board is the phone's worst reading, [`../audit-9.75/02-PHONE-PERFORMANCE.md`](../audit-9.75/02-PHONE-PERFORMANCE.md) §2) |
| N-16 | The globe drawn twice | Partly | **Partly, unchanged** | Both globes share one module's land and projection; the redraw waits for Skia (installed 6 Oct, unused) |

---

## 3. New items

| # | Item | Kind | Evidence (7 Oct) | Base to share |
|---|---|---|---|---|
| R3-01 | **Cards pinned to the dark ground inside light screens** | drawn differently | `LiveMatch` (`ROLES[FLOODLIT]`, `:23`) inside everyday screens; nine pins in all ([`../audit-9.75/01-PHONE-FINDINGS.md`](../audit-9.75/01-PHONE-FINDINGS.md) §2) | `useScreenRoles()`; floodlit only for whole screens, named in a list a check reads |
| R3-02 | **Keyboard handling on 3 of 13 screens with a field** | behaves differently | `KeyboardSafe` in login, register, chat; not in ten others (01 §8) | `KitScreen` handles the keyboard itself. *Built 8 Oct (Phase 9.75 step 5); `KeyboardSafe` deleted* |
| R3-03 | **Four loading looks** | drawn differently | `<Loader>` in 8 files, `GhostRows` in 6, `RunLabelSkeleton` in 3, a plain "reading…" line in 6 | one rule: lists get ghost rows of their own shape, a screen gets the top bar, a button gets its waiting look; `useSettledOnce` applied by the same base, not per screen (it's on 8 screens; profile-edit, the run hub and others don't have it). *Built 8 Oct (step 5) for whole-screen waits: `LoadingScreen`, the floor in `useRunData`; the list screens keep theirs* |
| R3-04 | **`nylon` means the everyday ground in three files** | naming drift | `const nylon = ROLES[EVERYDAY]` in `simulation.tsx:82`, `custom-ucl-simulation.tsx:96`, `KnockoutStage.tsx:38`. The name says "the dark ground" and holds the light one; a reader fixing P9.75-01 will be misled | rename to `roles`; one word, one meaning |
| R3-05 | **The press: a tab on table stages, a list under the knockouts** | behaves differently | `TableStage` has a Press tab; `KnockoutStage` draws `pressFor` under every round (01 §5) | one stage tab set: the same ids for the same content on every stage |
| R3-06 | **Two ids for a club in the draft** | computed differently | `spinItem` keys the reel by `c.id` (club-season), everything else by `club_id` (`draft.tsx:222-223`, 01 §3) | a `ClubSeasonRow` → mark helper that only takes the club id |
| R3-07 | **Team names translated at the leaf, in 13 files** | computed differently | `countryName()` called by 13 files; 22 lines in 13 others printed a name raw (not `BracketPreview`, which translates: corrected 8 Oct, 01 §9) | one `displayName(clubId, name)` the shared name pieces (`ClubName`, `TeamMark`, the table and bracket rows) use; screens never call `countryName` on a team |
| R3-08 | **Boards and lists: one virtualised, the rest not** | behaves differently | Runs is a `FlatList`; the hub's boards, press and teams aren't | a kit `BoardList` (a `FlatList` with fixed rows and a header), used by every board. *Built 8 Oct (Phase 9.75 step 4) as paged rows, not a `FlatList`: the lists sit inside the screen's ScrollView* |
| R3-09 | **The bench and the eleven drawn differently** | drawn differently | starters' `Hanger` gets `mark`, position, stripe; bench hangers get none (`draft.tsx:491` v `:549`) | one `hangerFor(player, place)` for both |
| R3-10 | **Your competition missing from the Europe switch** | behaves differently | `RestOfEurope` lists only the others (`RunMore.tsx:159`) | one competition list for the run, yours first, used by the switch and the tabs' headings |
| R3-11 | **Leftover names and files** | hygiene | `WCGroupModal.tsx` opens a route, not a modal (the name's stale); `TeamLabel.tsx` has one user (`WCGroupModal`); `ui.tsx` holds two unrelated parts | rename `WCGroupModal` → `WCGroupSheet`; fold `TeamLabel` into its one user |
| R3-12 | **Two answers to "which run is this line from"** | computed differently | `runStarted` on `startRun`, `runEnded` only on the result or abandon; leaving a draft before the first pick never ends the run, so its tag stays on every later line (the maintainer's log, 7 Oct: `[europa_league]` on history screens) | one run lifecycle: `resetRun` and leaving setup end the log's run too |
| R3-13 | **The save ledger written by history views** | computed differently | `useRunSave` notes `skipped · tester or a saved run` when a *saved* run's result opens (the log, 7 Oct), overwriting the live run's state | only the live run writes the ledger |

---

## 4. Phase three: the plan in steps

Each step leaves the app shippable, with `tsc` clean and every `verify-*` green, and starts with a check that fails today.

### Step 1 · Grounds and names
**Build.** R3-01 (floodlit only for whole screens; `LiveMatch` follows the screen), R3-04 (rename), R3-07 (one display name for teams), R3-06 (the reel's club id).
**Done when.** A grounds check fails on any pin outside its named list (fails today on `LiveMatch`); `verify-i18n` in Slovak fails on an English country name in any bracket or table builder (as built: a rule over every screen's lines; failed on 22, see [`../audit-9.75/06-BUILD-ORDER.md`](../audit-9.75/06-BUILD-ORDER.md) step 3); the spin script finds a flag on every World Cup reel item (fails today).

*(Done 8 October 2026 as Phase 9.75's step 3: R3-01, R3-06 and R3-07 built, R3-04 in its step 1; [`../audit-9.75/06-BUILD-ORDER.md`](../audit-9.75/06-BUILD-ORDER.md) step 3 has the detail. R3-07 shipped as `countryName()` at the leaf plus a `verify-i18n` rule, not the one `displayName()`.)*

### Step 2 · The screen base does the shared jobs
**Build.** R3-02 (`KitScreen` handles the keyboard), R3-03 (one loading rule, the settle floor applied by the base), R3-08 (`BoardList` for every board).
**Done when.** `verify-diag` fails on a `Field` outside a keyboard-safe screen (fails today on ten files); no board renders more than the visible rows on mount (the phone's Stats tab under 300 ms, release build).

### Step 3 · One stage shell for the press and the competitions
**Build.** R3-05 (the knockouts' Press tab), R3-10 (your competition first in every competition list).
**Done when.** `verify-stages` checks every stage family exposes the same tab ids for the same content (fails today on the knockouts); the hub's competition list contains the player's competition on every full-path run in `verify-europe-path` (fails today).

*(Done 8 Oct as Phase 9.75 step 6; [`../audit-9.75/06-BUILD-ORDER.md`](../audit-9.75/06-BUILD-ORDER.md).)*

### Step 4 · The draft's pieces
**Build.** R3-09 (one hanger builder for the eleven and the bench, with clear targets).
**Done when.** The bench hanger and a starter's are built by the same function (one definition, grep); the maintainer sees the targets at a glance.

*(Done 8 Oct as Phase 9.75 step 7.)*

### Step 5 · Lifecycle and hygiene
**Build.** R3-12, R3-13, R3-11.
**Done when.** `verify-diag`'s log test: a run started and left before its first pick logs RUN ENDED; opening a saved run doesn't change the ledger (fails today).

*(Done 8 Oct as Phase 9.75 step 8; R3-11 in its step 1. Phase three is built; what's left is the maintainer's checks.)*

---

## 5. Left out, and when

| Left out | Why | When |
|---|---|---|
| The match sheet's redesign (C-15) | A design job, already Phase 11's | Phase 11 with P8-48 |
| Splitting the live screens further (step 4b's size target) | `simulation.tsx` 1,208 and `custom-ucl-simulation.tsx` 1,432 lines; the remaining bulk is mode-specific stages, a move rather than shared code | when a fix in them is slowed by their size |
| The globe redraw (N-16) | waits on a release build's `frame:globe` reading | after the next release-build session |
