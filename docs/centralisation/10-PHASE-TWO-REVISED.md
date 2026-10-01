# 10 · Phase two, revised

> Part of the [centralisation set](00-README.md). Status: **plan**, 29 September 2026. Supersedes the order in [`07-PHASE-TWO-PLAN.md`](07-PHASE-TWO-PLAN.md); 07's §2 (what the base is) still stands and isn't repeated here.

Phase one's plan was written before Phase 8's last three batches. [`08-RE-AUDIT.md`](08-RE-AUDIT.md) found that part of its step 1 got built along the way, most of steps 0 and 2 didn't, and a few items got worse. [`09-NEW-ITEMS.md`](09-NEW-ITEMS.md) added 18 items. And the maintainer's playtest of 29 September put nineteen notes at the front of Phase 8.5 ("done first, before moving onto the phase thing"). This plan puts them in one order.

The two standing rules from 07 still hold: **no browser self-testing** (each *Done when* is a typecheck, a `verify-*.ts` run or a grep count, plus what the maintainer checks on a phone), and **result-first stays** (nothing here changes how a result is decided).

---

## 1 · The order

| Step | What | Closes | Size |
|---|---|---|---|
| **P** | The playtest notes, built on the right shared pieces | roadmap P8.5-01 to P8.5-19, N-02, N-13, N-16, N-17, N-18, F-22 | four batches (§2) |
| **0** | Clear the ground | C-17 (with `PenShootout`), L-10, L-11, C-09 | small |
| **1** | Finish the team mark, and give every component its ground | A-01, A-07, A-08, A-13, N-01, N-08, N-12 | medium |
| **2** | One set of engine helpers | L-01, L-02, L-03, L-14, L-15, N-04, N-11, N-15 | small |
| **3** | The stage model | L-04, L-05, L-06, C-04, L-13, N-05, N-07, F-20 | large |
| **4** | The stage shell for the live screens | F-03, F-05 to F-11, N-03, C-10, C-12, C-13, L-12, L-16, S-01, S-02 | large |
| **5** | One knockout view | F-04, F-12, C-05, C-06, C-07 | medium |
| **6** | One result screen (P8-54) | F-13 to F-16, F-21, C-01, C-02, C-03, C-08, C-14, C-16, L-07, L-08, L-09, N-09 | large |
| **7** | Press in every stage | F-01, F-02 | medium |
| **8** | The rest | F-19, A-09, A-11, C-11, C-15, C-18, N-06, N-10, N-14 | can be split |

Every open, partly-done, worse or wrong item in 08 and every item in 09 appears once. The closed ones (F-17, F-18, F-23, A-02 to A-06, A-10, A-12) are gone from the list.

## 2 · Step P: the playtest notes, first

The notes are the maintainer's, and they come first. Each one either builds a shared piece or uses one, so none of them adds a copy that phase two then has to undo. Four batches, each shippable on its own:

### P1 · Quick corrections
- P8.5-18: remove the Leagues button from the full path's knockout header.
- P8.5-19: the stakes list on two lines (the competition and round, then the path), and the Champions League's row naming its competition like the others (`PositionStakes`, `src/components/CustomUclViewers.tsx`).
- N-02: "Your eight" reads the competition's matchday count (`simulation.tsx:665, :698, :727`).
- P8.5-11: the draft card's flag untilted and whole-card; the shade only behind the name.
- P8.5-12, France: the zoom frames the country's main landmass. The fix is in `GlobeReveal.tsx`: take the centre and reach from the polygon the country's capital sits in (or the biggest polygon), not from all of them. Check Norway (Svalbard), Denmark and the Netherlands the same way.
- P8.5-12, About: `GlobeReveal` lands on Slovakia there too (N-16).

**Done when.** `tsc` clean; `grep -n "Your eight" app/game/simulation.tsx` empty; a scratch check prints the zoom's centre for France within mainland France (about 2°E, 46°N) and for every other nation within its own biggest polygon. **Maintainer checks:** the France reveal; the About globe; a Conference League run's fixtures tab.

### P2 · You, your profile and sharing
- P8.5-02: the You tab wears `ProfileCard` (N-17).
- P8.5-04: one share frame for the verdict and the story, always with the owner's name, picture and club tag (N-18). This reverses the old "username optional" line in [`../ui-overhaul/07d-SCREENS-RESULTS.md`](../ui-overhaul/07d-SCREENS-RESULTS.md) D11; that document gets a note.

**Done when.** `ProfileCard` has three call sites (`u/[id]`, the editor, You); the share frame has one definition and two users. **Maintainer checks:** change the banner and frame, go back to You; share a verdict and a story to a chat.

### P3 · Clubs
P8.5-05 to P8.5-10, in this order, because the later ones need the first ones' tables:
1. **Owner actions** (P8.5-05): delete a club, hand it over, choose the next owner when leaving. Three `security definer` functions beside `leave_club` in `supabase/clubs.sql`, each checking `auth.uid()` is the owner.
2. **The chat** (P8.5-06): the kit's keyboard-safe wrapper (N-13) under the field, and a real chat design: messages grouped by sender, your own on the right in orange's role colour, times, the sender's mark. The wrapper replaces the auth screens' own handling too.
3. **Clubs in the tab bar** (P8.5-07): a fifth destination. The roadmap's four-destination rule ([`../ui-overhaul/07a-SCREENS-SHELL.md`](../ui-overhaul/07a-SCREENS-SHELL.md) A1) gives way on the maintainer's word; Material allows five.
4. **Invite-only and passwords** (P8.5-08): a club's `join_policy` (open, password, invite) and a lock in the search results. The password is checked inside `join_club`, stored only as a hash (`crypt()` from `pgcrypto`), never readable through the table.
5. **The clubs leaderboard** (P8.5-09): a view summing members' run scores, read like Ranks.
6. **The swearing filter** (P8.5-10): the word list and the replacements in one data file, applied when a message is sent (so every reader sees the same text), switchable per club by its owner, with the maintainer's "Come on, seriously?" lines. Decided: a funny word per swear, not `#####`.

**Done when.** Each SQL change has a `supabase/*.sql` file the maintainer runs, and a short test he can do from two accounts (a second account can't delete someone else's club, can't read a password club's chat without joining, can't join an invite-only club uninvited). A `scripts/verify-profanity.ts` checks the replacements (every listed word is replaced, case and punctuation kept, a clean message is untouched, a word inside a longer word isn't mangled: "Scunthorpe" stays).

### P4 · The full path
- P8.5-15, F-22: the pundits screen for the full path. It predicts the domestic league (the table it already knows how to draw) and says where they think your season goes in Europe.
- P8.5-13, N-08: Europe's ceremony with marks, and each cup as its bracket.
- P8.5-14, N-09: under the qualified stamp, the three league-phase fields.
- P8.5-16, N-07: the other two competitions played out, and a competition switch on the result screen. Measure the cost on the phone first; if it's slow, play them when the result screen asks, not when your league phase starts.
- P8.5-17: the draw's bowl.

**Done when.** `verify-europe-path` also checks that all three competitions produce a winner, and that the result's three brackets each have one champion who won their final. **Maintainer checks:** a full path from the draw to the result.

## 3 · Steps 0 to 8, updated

Only what changed from 07 is written here.

### Step 0 · Clear the ground
Adds `PenShootout.tsx` (now unused). Otherwise as 07: delete the dead copies (08 C-17), move the 11 local `ordinal` copies and the 4 `surname` copies onto `src/lib/format.ts`.
**Done when.** `grep -rn "function ordinal\|const ordinal" app src` finds only `src/lib/format.ts`; `scripts/verify-format.ts` passes (1 to 40, "van Dijk", "Mac Allister", "Kaká").

### Step 1 · Finish the team mark; every component takes its ground
The mark is most of the way there (08 A-01). What's left: the match sheet (`withFlag` ×17), the deep match, the draft card's by-name lookup, Europe's ceremony. **New in this step:** no shared component picks its own ground (N-12), and no screen names a mode to get its accent (N-01).
**Done when.**
- `grep -rn "withFlag\|withCountryFlag" app src` is empty.
- `grep -rn "^const roles = ROLES\.\(nylon\|cotton\)" src/components` is empty (16 today).
- `grep -rn "MODE_THEMES\.\(champions_league\|world_cup\)" app src` is empty (12 hits today: 9 for the Champions League, 3 for the World Cup).
- **Maintainer checks:** a bracket opened from a cotton page is drawn on cotton; the Europa League's match sheets wear orange.

**Added 1 Oct 2026 (the maintainer):** the result pages' YOUR LINEUP pitch doesn't show each player's little flag or the crest backgrounds that the draft's lineup shows. One pitch, one look: the result's lineup takes the draft's.

**Added 1 Oct 2026 (the maintainer):** the match sheet (a match's result page) has no light variant: it's still the old dark screen. It joins the light and dark pass here.

### Step 2 · One set of engine helpers
As 07, plus: the two new private shuffles (N-11), one `inkOn(colour)` (N-15), and one competition record holding the names, colours, shape and weight (N-04).
**Done when.** 07's greps, plus `grep -rn "0\.65" supabase/functions/_shared/score.ts src/data/tiers.ts` finds only the record's own line, and `grep -rn "function shuffled" src/engine` is empty.

### Step 3 · The stage model
As 07, plus three stages the model didn't know about: the league run's cup as a knockout stage with seeds and attributed scorers (N-05), the full path's domestic season (F-20), and the full path's other two competitions (N-07).
**Done when.** 07's `verify-stages.ts`, which also covers a league run with its cup and a full path with its three competitions: every match, including every cup tie, has a seed and opens a sheet.

### Step 4 · The stage shell
As 07. The families to migrate are now five modes on four families: the league season (with its cup), the Champions League, Europa League and Conference League league phases (one family), the World Cup groups, and the full path.
**Done when.** 07's conditions; and the Europa and Conference League modes have the speed chips (N-03).

### Steps 5 to 8
As 07. Step 6 (P8-54) gains the competition switch for the full path (N-09, P8.5-16, if step P4 hasn't built it already). Step 8 adds the full path's name (N-10, decided in [`../europe/07-THE-EUROPEAN-PATH.md`](../europe/07-THE-EUROPEAN-PATH.md)), the cup-name table (N-06) and a note for Phase 9's lists (N-14). A-09 gets its build check this time: `scripts/build-db.ts` fails if any club row carries `#1E293B`, which today's 6 rows would fail.

## 4 · Decisions

| # | Decision | State | Default if nobody decides |
|---|---|---|---|
| D1 | Which step first | **Answered by the maintainer:** the playtest notes (step P) | |
| D2 | Your match live or as a card | Open | Live everywhere; fast skips to the card |
| D3 | A World Cup group's position graph | Open | No |
| D4 | The standings tiebreak | Open | Points, goal difference, goals, then one deterministic tiebreak |
| D5 | Stage starts on arrival or on a tap | Open | On a tap |
| D6 | Clubs without a crest | **Closed** by P8-171 | |
| D7 | The cups' pace locked to slow | Open | One speed setting everywhere |
| D8 | "Light and dark variants" (N-12): a component that works on either ground, or a player-facing dark and light theme | **Decided 29 Sept** | **A real dark mode and light mode, like any app.** Every component has a dark and a light variant; Settings gets *Appearance: System / Dark / Light* (following the phone by default). This is part of 1.0.0, not after launch; it replaces the POL-1 deferral in [`../ui-overhaul/02-VIBECODE-AUDIT.md`](../ui-overhaul/02-VIBECODE-AUDIT.md). The website follows the same pair ([`../website/05-OPEN-QUESTIONS.md`](../website/05-OPEN-QUESTIONS.md) Q8) |
| D9 | The other two competitions: played when your league phase starts, or when the result asks | New | When the result asks, unless the phone measures both under a second |
| D10 | Clubs as a fifth tab | **Answered by the maintainer:** yes (P8.5-07) | |

## 5 · Risks

| Risk | Where | What limits it |
|---|---|---|
| Step P's four batches land as one change the maintainer can't test in a sitting | P | Four batches, each shippable, in the order above |
| Moving components off a fixed ground changes how the nylon screens look | Step 1 | Every current nylon screen passes nylon explicitly; the change is invisible there and visible only where a component sat on the wrong ground |
| Playing the other two competitions costs seconds on a phone | P4, step 3 | Measure first; D9's default plays them lazily |
| The profanity filter mangles clean words | P3 | `verify-profanity.ts` with the Scunthorpe case, and whole-word matching |
| A club password stored readably | P3 | Hashed with `pgcrypto`, checked inside `join_club`, no select policy on the hash column |

## 6 · Documents to update when this is built

- This set: each item marked *(closed, date)* where it's defined; the README's status.
- [`../ui-overhaul/11-ROADMAP.md`](../ui-overhaul/11-ROADMAP.md): each P8.5 note's *Done* line.
- [`../ui-overhaul/07a-SCREENS-SHELL.md`](../ui-overhaul/07a-SCREENS-SHELL.md) A1: five destinations (D10).
- [`../ui-overhaul/07d-SCREENS-RESULTS.md`](../ui-overhaul/07d-SCREENS-RESULTS.md) D11: the owner on every share.
- [`../ui-overhaul/08-COMPONENTS.md`](../ui-overhaul/08-COMPONENTS.md): `TeamMark`, the ground rule, the keyboard wrapper, the share frame.
- `CLAUDE.md`: `inkOn`, the competition record and the ground rule in golden rule 3's list.
