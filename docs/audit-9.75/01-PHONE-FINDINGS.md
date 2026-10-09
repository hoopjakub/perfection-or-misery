# 01 · What the phone found: causes and fixes

> Part of the Phase 9.75 audit. Start at [`00-README.md`](00-README.md).
> Status: **plan, 7 October 2026.** Code read on 7 October 2026; line numbers are from that day. Every cause marked **confirmed** was traced in the code; **hypothesis** means likely but not yet probed on the phone (see [`../audit-2026-10/`](../audit-2026-10/00-README.md) lessons: a cause isn't found until the number moves).

The maintainer's first pass of [`../PHASE-9.5-CHECKLIST.md`](../PHASE-9.5-CHECKLIST.md) on the POCO X6 (a development build) turned up ten things that aren't timings. Each gets: what was seen, the cause, the fix, and a check that fails before the fix. The timings (P9.75-11 to -15) are in [`02-PHONE-PERFORMANCE.md`](02-PHONE-PERFORMANCE.md).

---

## 1. The findings at a glance

| # | Seen | Cause | Status | Fix size |
|---|---|---|---|---|
| P9.75-01 | The live match in light mode looks wrong, "other screens as well" | Nine components pinned to the dark floodlit ground inside light screens | confirmed | medium |
| P9.75-02 | No flags on the World Cup spin | The reel is keyed by the club-season id, the flag table by the club id | confirmed | one line, plus a check |
| P9.75-03 | Subs don't look like starters; can't see where a sub can go | Bench hangers get no mark, no position, no stripe; targets are only a thicker edge | confirmed | small |
| P9.75-04 | The knockouts' press is at the bottom of a long scroll | `KnockoutStage` draws it under every round | confirmed | small |
| P9.75-05 | Can't find your own knockouts (a Europa League run) | The Europe tab lists only the *other* competitions; yours is under Table and Bracket, which don't say which competition | hypothesis | small |
| P9.75-06 | Offline runs never go up (D-1 to D-3) | One start-up race confirmed; two more candidates | partly confirmed | medium |
| P9.75-07 | The keyboard covers the clubs' invite field | Ten screens with a text field have no keyboard handling | confirmed | medium |
| P9.75-08 | "Croatia" on "Pavúk" in Slovak | 22 lines in 13 files print team names without `countryName()` (not `BracketPreview`, which translates; corrected in step 3) | fixed, step 3 | small |
| P9.75-09 | The press reads generated | Templates, not hand-written lines | (a writing task) | large, words only |
| P9.75-10 | Achievement toasts unconfirmed | Nothing earned in the session | (not a fault yet) | none |

---

## 2. P9.75-01 · The live match on light screens

**Seen.** "The live match thing in season normal isn't applied for light mode, it just does not have the other component. Other screens as well."

**Cause (confirmed).** On 1 October the floodlit moments (the live match, the draw's reveal, the verdict, the ceremonies) were decided to stay dark in both modes. That was written for whole screens. But `LiveMatch` isn't a screen: it's a card inside the season screens, which stand on the everyday ground (`simulation.tsx:501`, `LeagueSeason.tsx:505`, `KnockoutStage.tsx:194`, all `ground={EVERYDAY}`). In light mode that puts a dark card on a light page. Every component pinned the same way:

| Component | Pin | Where it sits | Should follow the screen? |
|---|---|---|---|
| `LiveMatch` | `ROLES[FLOODLIT]` (`LiveMatch.tsx:23`) | inside the season, league-phase, group and knockout screens | **yes** (this is the report) |
| `LineupPitch` | `ROLES[FLOODLIT]` (`:26`) | pitch drawings | no: the pitch is green in both |
| `PitchViews` | `ROLES[FLOODLIT]` (`match/PitchViews.tsx:17`) | the match sheet's pitch views | no, same reason |
| `Ceremony` | `ROLES[FLOODLIT]` (`:36`) | a whole screen | no: a floodlit moment as decided |
| `DraftParts` (a card face) | `ROLES.nylon` (`:201`) | the draft | check on the phone |
| `MatchStatsParts` header crest and mark | `ROLES.nylon` (`:173`, `:570`) | the match sheet's header | yes, with the sheet's redesign (P8-48) |
| `match-stats.tsx` section heads, tags | `ROLES[FLOODLIT]` (`:374`, `:467`, `:895`, `:1069`) | the match sheet | yes, with P8-48 |
| `ui.tsx` hover | `ROLES[FLOODLIT]` (`:50`) | the match sheet's cards | yes, with P8-48 |

**Fix.** `LiveMatch` takes the screen's roles (`useScreenRoles()`, as P8.5-25 did for nine other components), keeping one thing dark if the maintainer wants a "broadcast" feel: the score itself. The match sheet's pins go with its redesign. The decision log is amended: *floodlit = whole screens only; a card inside an everyday screen follows the screen.*

**Check.** A static rule in `verify-diag` (or a new `verify-grounds`): no file under `src/components` or `app/` pins `ROLES[FLOODLIT]` or `ROLES.nylon` except a named list (the ceremony, the pitches, the match sheet until P8-48), each with its reason. It fails today on `LiveMatch`.

**The maintainer checks.** A league season in light mode: the live match card is a light card with dark text; in dark mode it looks as before.

---

## 3. P9.75-02 · The World Cup spin has no flags

**Seen.** S1-3 failed on the phone: the World Cup spin's cards are empty.

**Cause (confirmed).** `spinItem` (`app/game/draft.tsx:222-223`) builds each reel item with `clubId: c.id` and `flag: getFlag(c.id)`. `c.id` is the **club-season** id (`brazil_wc_2026` in the database); `getFlag` and the crest lookups are keyed by the **club** id (`brazil_nt`, `flagMap.ts:11`). So every reel item has no flag and no crest. The card you land on is right because it uses `spin.club.club_id` (`draft.tsx:608`), which is why the 3 October web check passed: it looked at the landed card. **Club spins have the same fault**: their reel shows colours, never crests, although P8-163 meant it to wear them.

**Fix.** `clubId: c.club_id` and `getFlag(c.club_id)` in both branches.

**Check.** The reel item builder moves out of the screen into `src/lib/` (it's one pure function), and a small script spins 200 times per mode against the database and fails when an item has no flag (World Cup) or no crest where the club has one. Fails today.

---

## 4. P9.75-03 · The bench in the draft

**Seen.** "The subs don't have the things as the players in the starting eleven, make it the same; hard to see swapping from bench, like where you can swap to."

**Cause (confirmed).** Starters' hangers (`draft.tsx:491`) pass `mark` (their club or flag faintly behind them), the slot's position as `label`, `outOfPosition` and an effective rating. The bench hangers (`draft.tsx:549`) pass none of that: the label is "SUB 1", no mark, no stripe, the raw rating. While you hold a bench player, the slots he can take are `state="target"`: a thicker cotton edge (`Hanger`, `DraftParts.tsx:289`), which is faint on the green pitch.

**Fix.**
1. A bench hanger looks like a starter's: the same `mark`, the label "SUB · ST" (the position), the rating.
2. A target slot is unmistakable: a solid fill in the "you" colour at low strength plus the note ("IN 84"), and every slot that **isn't** a target dims while you hold someone. The same on the bench rail when you hold a starter.
3. The holding strip above the pitch says what you can do: "Tap a lit spot to bring him on."

**Check.** None automatic beyond typecheck; this one is the maintainer's eye. P9.5 row: "hold a sub: the slots he can take are obvious at a glance; the bench looks like the eleven."

---

## 5. P9.75-04 · The knockouts' press

**Seen.** "Why do I have to scroll all the way down, just put it so you can just switch like a normal person."

**Cause (confirmed).** `KnockoutStage` passes `pressFor` to `KnockoutPhaseView`, which draws the press list under all the rounds. The table and group stages have a Press **tab** (step 7, `TableStage`); the knockouts don't.

**Fix.** A `SegmentSwitch` at the top of the knockouts, *Rounds · Bracket · Press*, the same one the table stages use; on a wide window, the panes the table stages use. The bracket that today sits beside the rounds on wide windows becomes the second tab on a phone.

**Check.** `verify-stages` gains: every stage family exposes the same tab ids for the same kinds of content (a static list per family). Fails today on the knockouts' missing Press.

---

## 6. P9.75-05 · Your own knockouts

**Seen.** "You cannot find your own knockout phase, like if you were in the Europa League you cannot find it."

**Cause (hypothesis).** On a full-path run the run hub's Europe tab shows `RestOfEurope` (`RunMore.tsx:159`), a switch over the **other** competitions only. A Europa League player who opens it finds the Champions League and the Conference League, not the Europa League. Theirs is under Table and Bracket, which never name the competition. The data is there (`knockoutRun(data)` builds the bracket from the run's own matches, `run.tsx:303`). If the maintainer was on a classic Europa League run instead, this hypothesis is wrong and the Bracket tab itself needs checking. **Ask which run it was before fixing.**

**Fix (if the hypothesis holds).** The Europe tab's switch includes your own competition, first and marked "YOU", showing the same table and bracket as the Table and Bracket tabs; the Bracket tab's heading names the competition ("EUROPA LEAGUE · KNOCKOUTS").

**Check.** A RunData-level test: for every full-path result in `verify-europe-path`'s runs, the hub's competition list contains the player's competition. Fails today.

---

## 7. P9.75-06 · Offline runs never go up

**Seen.** D-1: the run says "queued" and then "doesn't seem to appear again. Stuck somewhere", never in Supabase or Runs. D-2: turning the network back on doesn't send it. D-3: reopening the app online doesn't either. D-4 (the played date) works.

**The path.** A run saves through `insertRun` → offline → `queueRun` (stored in MMKV, `runQueue.ts`) → later `flushSavedRuns` (on start, on the online event, on returning to the foreground, and when the signed-in user changes, `_layout.tsx:117-122`) → `send` (`runs.ts`, `setRunQueueDeps`) → `sendPayload` → `submit-run`.

**Causes.**

| # | Cause | Evidence | Explains | Status |
|---|---|---|---|---|
| Q1 | **The start-up race.** When the session restores, `setSession` puts the user in the store and the subscription flushes at once (`_layout.tsx:122`). At that moment `isGuest` is still its initial `true` (`userStore.ts:41`); `fetchProfile` sets it later (`:68`). `send` answers `offline` for a guest, the flush stops, and nothing flushes again when `isGuest` turns false | traced | D-3 fully | **confirmed** |
| Q2 | **A hung send.** A request started as the connection dropped can hang with no timeout. `flushRunQueue` keeps one flush at a time (`runQueue.ts`, `flushing`): every later flush returns the same hung promise, for the rest of the session | code allows it | D-2 | hypothesis |
| Q3 | **A silent drop.** `submit-run` answers 422 for a refused run and 400 for an insert error (`submit-run/index.ts`); the app's `offlineError` (`runs.ts:91`) calls both permanent, and `flushQueue` drops the run with one log line | code | D-1 "gone" if the server said 400 | hypothesis |
| Q4 | The online event not firing on this phone (`expo-network`'s `isInternetReachable` can stay `null`) | none yet | D-2 | hypothesis |

**Fix, in this order.**
1. **Make it say why first** (Name the reason): log every enqueue, every flush (who triggered it), every send's answer, and every skip with its reason (`save` category). The maintainer runs D-1 to D-3 once with `adb logcat` and sends the slice.
2. Q1: also flush when `isGuest` turns false (the user store's subscription checks `isGuest` too).
3. Q2: a 20-second timeout on each send (an `AbortController` around the invoke); a timed-out send counts as offline, and the flush ends.
4. Q3: a refused run isn't deleted: it moves to a `refused` list kept on the device, shown on Diagnostics with the server's reason, and the offline strip says "1 run couldn't be saved". The heuristic re-score holds error recovery at 2 until this lands ([`05-INDEPENDENT-UI.md`](05-INDEPENDENT-UI.md)).

**Check.** `verify-run-queue` (it drives the queue headless with a fake server) gains: a user who arrives as a guest and becomes an account mid-flush gets their run sent (fails today); a send that never resolves doesn't block the next flush (fails today); a refused run is kept, not lost (fails today).

**The maintainer checks.** D-1 to D-3 again, then D-5 and D-6, which weren't run.

---

## 8. P9.75-07 · The keyboard over the invite field

**Cause (confirmed), and it's wider.** The kit has `KeyboardSafe` (P8.5-06); three screens use it (login, register, the chat). Ten screens with a text field don't:

`app/(tabs)/clubs.tsx`, `app/(tabs)/leaderboard.tsx`, `app/crest-edit.tsx`, `app/diagnostics/log.tsx`, `app/friends.tsx`, `app/game/run.tsx` (the stats search), `app/profile-edit.tsx`, `app/rename.tsx`, `app/report.tsx`, and `ClubView` (the invite field, in the Clubs tab and a club's page).

**Fix.** `KitScreen` takes the job: when a screen has a field, it lifts its content above the keyboard the way `KeyboardSafe` does, and scrolls the focused field into view (`keyboardShouldPersistTaps="handled"` and `automaticallyAdjustKeyboardInsets` on the scroll view). One place, every screen.

**Check.** `verify-diag` gains: every file that renders `<Field` or `<TextInput` is under a keyboard-safe screen (a static check on the file or its route). Fails today on ten files. *(Built 8 Oct as rule 2e; it failed on exactly these ten. 06 step 5.)*

---

## 9. P9.75-08 · "Croatia" on the bracket in Slovak

**Seen.** "Pavúk says Croatia instead of Chorvátsko." *Pavúk* is the Slovak word for the bracket (`parts.theBracket`, `hub.tabBracket`), not a person.

**Cause (corrected 8 October 2026).** ~~`BracketPreview` prints team names as they come.~~ Wrong: `BracketPreview` draws its names through `ClubName` and `BracketTree`, and both translate (`BracketTree.tsx:305`); so do the match sheet's bracket and table. The untranslated names were elsewhere: 22 lines in 13 files printed a team's name as stored, among them the live match's "rest of the round" line (`LiveMatch.tsx`), which sits on the knockout screen whose bracket button and pane say *Pavúk*, and the shootout row's names. Which one the phone showed can't be told from the report; all of them are fixed and a rule now fails on any new one.

**Fix.** Short-term: `countryName()` in `BracketPreview`. Properly: centralisation round three's R3-09 ([`../centralisation/13-RE-AUDIT-3.md`](../centralisation/13-RE-AUDIT-3.md)): a team's displayed name always goes through one function, so a new view can't forget.

**Check.** `verify-i18n` (POM_LANGUAGE=sk) renders each bracket and table builder's label list for a World Cup run and fails on an English country name. *(As built: a line rule over every screen, not a render; it failed on 22 lines and passes now. See 06 step 3.)*

---

## 10. P9.75-09 · The press reads generated

**Seen.** S7 works "but needs another pass, since the stories are not handmade".

**Not a fault, a writing job.** Every story kind in `src/engine/press.ts` and `cup-press.ts`, in English and Slovak, rewritten by hand with several variants per kind, chosen by the story's seed (the press is a pure function of the rounds played, so the choice must stay seeded). The maintainer's voice notes in the roadmap (the press, P8-105: quotes only where someone speaks) still hold.

**Check.** `verify-press` already renders every kind in both languages; it gains "every kind has at least three variants, and no two adjacent stories of one run share a variant".

---

## 11. P9.75-10 · Achievement toasts

Not a fault yet. On the next build: play a run that earns one (a first win of a mode does), and check the toast slides in at the top in both modes.

---

## 12. Documents to update when built

- `docs/ui-overhaul/11-ROADMAP.md` Phase 9.75: a *(Done …)* note per P9.75 item.
- `docs/PHASE-9.5-CHECKLIST.md`: re-check rows S1-3, D-1 to D-6, C-3, and new rows for each fix.
- `DESIGN.md` and the 1 October decision: floodlit is for whole screens.
- `docs/release/02-OFFLINE.md`: the refused list, the timeout, the guest-to-account flush.
