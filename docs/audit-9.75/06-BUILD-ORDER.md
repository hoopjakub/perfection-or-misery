# 06 · One build order for Phase 9.75's coding

> Part of the Phase 9.75 audit. Start at [`00-README.md`](00-README.md).
> Status: **plan, 7 October 2026.** Merges the phone's findings ([`01`](01-PHONE-FINDINGS.md), [`02`](02-PHONE-PERFORMANCE.md)), centralisation round three ([`../centralisation/13-RE-AUDIT-3.md`](../centralisation/13-RE-AUDIT-3.md)) and the independent audit ([`03`](03-INDEPENDENT-LOGIC.md), [`04`](04-INDEPENDENT-SECURITY.md), [`05`](05-INDEPENDENT-UI.md)) into one order. Each step leaves the app shippable, `tsc` clean and every `verify-*` green, and starts with a check that fails today.

**Before step 1, the maintainer (about an hour, no code):** the dashboard checks in [`04`](04-INDEPENDENT-SECURITY.md) §2, `submit-run`'s deployed version first, since an old one answering 400 would *be* the offline bug.

---

### Step 1 · Clear the ground
**Build.** The stale instructions (L-9: `CLAUDE.md`, the dev skill, `PROJECT_STATE.md`), the dead theme exports (L-8), the `nylon` rename (R3-04), the hygiene items (R3-11, S-3, S-5), and **the 57 nameless players** (L-11, [`07`](07-SECOND-PASS.md)): the seed drops them, the build fails on an empty name, both databases rebuilt, `DB_VERSION` 23.
**Done when.** `build-db` fails on an empty player name (seen failing on today's seed) and both databases have none; no importer of `colors`/`spacing`/`typography` and the exports are gone; `CLAUDE.md` names no deleted file (a short list checked by `verify-diag`, which fails on `BackButton` today); `.env.example` committed and `.env` ignored.

*(Done 7 October 2026.*
- *L-11: the 57 nameless players are gone from the seed files and both databases (the affected squads keep 19 or more, keepers included); `build-open-seeds` drops a player without a name; `build-db` fails on one (the same query finds 57 in the old database). `DB_VERSION` 23, so phones re-copy the database.*
- *L-8: the old palette is private to `theme.ts` (only the mode themes and the pots read it); `spacing` and `typography` deleted.*
- *L-9: `CLAUDE.md`, the dev skill and `PROJECT_STATE.md` rewritten against today's kit, grounds, tokens and layouts; `verify-diag` now fails when any of the three names a component or path that doesn't exist (seen failing on the old `CLAUDE.md`: `BackButton`).*
- *R3-04: `nylon` (which held the everyday ground) renamed in the three files; the comments that still said those screens stand "on nylon" corrected.*
- *R3-11: `WCGroupModal` is `WCGroupSheet`; `TeamLabel` deleted, its one user now draws the app's `TeamMark` and the name through `countryName()` (it showed a raw flag emoji and the English name), and its "Matchday N" heading is translated.*
- *S-3: `submit-run` and `delete-account` send fixed messages; the database's words go to the function's log. **They need redeploying.** (Redeployed by the maintainer, 8 October 2026.)*
- ***S-5 not done, on purpose:** ignoring `.env` would break the EAS builds, which read the Supabase address and key from it (EAS uploads the working tree minus ignored files). Every value in it is public by design; it stays.*
- *Checklist 975-1 to 975-3.)*

### Step 2 · The offline queue, said and fixed (P9.75-06, L-2, L-3)
**Build.** Queue logging first (every enqueue, flush trigger, send answer, skip reason). Then: flush when `isGuest` turns false; a 20 s timeout per send; a refused run kept in a refused list with the server's reason, on Diagnostics and in the offline strip.
**Done when.** `verify-run-queue` passes three new cases that fail today (guest → account mid-flush, a send that never answers, a refused run kept); the maintainer's D-1 to D-6 pass on the phone.

*(Done 8 October 2026.*
- *The log says every step: why each flush ran (start-up, back online, back in the foreground, signed in, try again, Diagnostics), how many runs waited, each send's answer, and why a run was held back ("nobody signed in yet", "the account not known yet (still a guest)", "played under another account", "no answer in 20 s", the error's status and message). The next stuck run names its step in logcat.*
- *Q1, the start-up race: `flushOnUserChange` (`src/lib/runQueue.ts`) also fires when `isGuest` turns false; the layout uses it.*
- *Q2: each send has a 20-second limit (`SEND_TIMEOUT_MS`); one that runs out counts as offline and the flush ends, so a hung request can't block the rest of the session.*
- *Q3 / L-2: a refused run leaves the queue for a "not saved" list kept on the phone (`pom-run-refused`) with the server's reason and the time. The strip under the header says so in misery red (online or not) and opens Diagnostics, whose new SAVES section lists them, says how many wait, and has "Try them again" (back into the queue, then a flush) and a manual flush.*
- *Checks: `verify-run-queue` gains a refused run kept and sent again, a hung send that times out with the run kept, and the two-step session; seen failing with the old sign-in rule (1) and with refused runs dropped (3).*
- *Not settled by code: whether the phone's D-1 was Q1, Q2, Q3 or a server on an old `submit-run` (Q4 untested). The log answers it on the next run of D-1 to D-6. Checklist 975-4 to 975-6.)*

### Step 3 · Grounds, names and the spin (phase three step 1; P9.75-01, -02, -08)
**Build.** Floodlit only for whole screens (`LiveMatch` follows the screen); one display name for teams (R3-07); the reel's club id (R3-06); "Resume"/"Pause" through `t()` (L-12) and `verify-i18n`'s mixed-case rule (L-13).
**Done when.** The grounds check fails on any pin outside its named list (fails today on `LiveMatch`); Slovak `verify-i18n` fails on an English country name in a bracket or table (fails today on `BracketPreview`); the spin script finds a flag on every World Cup reel item and a crest wherever a club has one (fails today).

*(Done 8 October 2026.*
- *R3-01 / P9.75-01: `LiveMatch` stands on the screen's ground (`useScreenRoles()`), so in light mode it's a light card on a light screen. New `scripts/verify-grounds.ts` fails on a floodlit pin outside its list (the ceremonies, the pitches, the draft's club card, and the match sheet until P8-48) and on a listed file that no longer pins; seen failing on the old `LiveMatch`.*
- *R3-07 / P9.75-08: **the audit was wrong about `BracketPreview`**; it translates (01 §9 corrected). 22 lines in 13 files printed a team's name raw: placement, the player page (club and opponents), pundits, the story page, the custom Champions League viewers, `MedicalTable`, `MomentumGraph`'s legend, `AwardsParts` (6), `LeaguePhaseDraw`, `VerdictBlock`, and `LiveMatch`'s "rest of the round" line, shootout row and side names. Two more fed by props: `FixtureRow`'s opponent and the player stats table's team column. `verify-i18n` gains a rule over every screen's lines (a name field as a JSX child, or a hole in a visible string, outside `countryName()`); seen failing on 22. Not built: R3-07's one `displayName()` for the shared pieces. The rule stops new raw names, which was the point; a single function waits for phase three if it still earns its place.*
- *R3-06 / P9.75-02: the reel's items are built by `spinItem()` in `src/engine/draft.ts`, keyed by `club_id`. Keyed by the season row, no World Cup item found its flag and no club its crest. New `scripts/verify-spin.ts` reads all 970 reel items from the database: a flag on every World Cup item, a real club id on every item. Seen failing on 1,036.*
- ***L-14 (new, found here):** club facts never showed. The draft asked for them by season id, and 18 of the 20 keys in `club_facts.json` were club ids the data rebuild had renamed (`arsenal` is `arsenal_fc`). Both fixed; `verify-spin` fails on a fact key that isn't a club. (The public build still shows none, on purpose.)*
- *L-12 / L-13: "Resume"/"Pause" through `t()`; the shootout row's spoken label ("scored", "missed", "no kicks yet") too. `verify-i18n` gains a rule for capitalised English words in a ternary or a bare JSX child; seen failing on `LiveMatch`.*
- *Checklist 975-7 to 975-10.)*

### Step 4 · The run hub on the phone (P9.75-11, -12, -13)
**Build.** The probe first (`stats:board` around ranking, `ui:tab` already covers the mount). Then the boards as a `BoardList` (R3-08), ranking in one pass, the Teams tab one round at a time, the hub's first frame light with the body a frame later, the stats pass in chunks (D2 default).
**Done when.** On a release build: Stats `ui:tab` < 300 ms, the hub's `ui:navigate` < 350 ms, no stall over 500 ms on the result while stats compute. Proof the measures can fail: the 7 Oct readings.

*(Done 8 October 2026, in code. The readings come from the phone.*
- *The probes: `stats:board` (the Stats board ranked and sorted, apart from its rows' mount, which `ui:tab` already times) and `hub:teams` (the Teams tab's rebuild of the awards night). Two budgets, 37 runtime keys (`verify-budgets`).*
- *P9.75-11 / R3-08: a kit `BoardList` mounts a long list a page at a time (40 rows, 20 stories) and the next page as the screen nears its end; `KitScreen` tells its lists when. Not a `FlatList`: the hub's lists sit inside `KitScreen`'s ScrollView, where a nested `FlatList` mounts every row anyway. Used by the player and club boards, the press and the season's every-match list. The boards are worked out once per stat, mode and search. `verify-diag` rule 2d fails on a hub list mapped by hand; seen failing on the old hub (4 lists).*
- *The Teams tab already showed one round at a time; what it pays for on opening is rebuilding the awards night, now timed (`hub:teams`) rather than guessed at.*
- *P9.75-12: the hub works out the knockout once per run (it was walked by the tab list, the table and the bracket), and answers the tap with its header and tabs, mounting the tab's body a frame later.*
- *P9.75-13 / D2: the stats pass is a generator (`runStatsPass`); the app's three passes (league, Europe, World Cup, saved runs included) hand the thread back every 20 match sheets (`src/lib/chunked.ts`), the self-test runs it straight. Same steps, same order, same numbers. New `scripts/verify-chunked.ts`: identical results, the right number of turns, and the three passes chunked; seen failing on the old pass (3).*
- *Not done: the Table tab's 2.6 s (seen once). The hub's table has no reorder animation (`moveMs` isn't passed), so the audit's guess was wrong; the next reading says whether it comes back. The heap (P9.75-14) waits for step 10's probe.*
- *Done when is still the phone: Stats `ui:tab` < 300 ms, the hub's `ui:navigate` < 350 ms, no stall over 500 ms on the result while stats compute, on a release build. Checklist 975-11 to 975-13.)*

### Step 5 · The screen base does the shared jobs (phase three step 2; P9.75-07)
**Build.** `KitScreen` handles the keyboard (R3-02); one loading rule and the settle floor from the base (R3-03).
**Done when.** `verify-diag` fails on a `Field` outside a keyboard-safe screen (fails today on ten files); the maintainer types in the club invite, friends search, rename and report screens with the field visible.

*(Done 8 October 2026.*
- *R3-02 / P9.75-07: `KitScreen` keeps a field above the keyboard on every screen. Its frame shrinks by the keyboard (the padding `KeyboardSafe` used), and once the keyboard is up the focused field is scrolled into view if it ended under it; only the screen in front moves, since tabs and the screens under a stack stay mounted. A tap on a button with the keyboard up is a tap (`keyboardShouldPersistTaps`). `KeyboardSafe` is deleted: its three screens (sign-in, new account, the chat) would have been lifted twice.*
- *`verify-diag` rule 2e: every file with a text field stands on a keyboard-safe screen, a component traced up to the screens using it; it also fails if `KitScreen` stops handling the keyboard. Seen failing on the old code on exactly the ten screens 01 §8 named.*
- *R3-03: `LoadingScreen` in the kit for a whole screen waiting (the way back, the kit's loading bar, a line). Five screens drew their own: the run hub, a player's page, a club's page, the result screen, the draft. The settle floor moved to where a run is loaded (`useRunData`, first load only) and the result screen's saved-run fetch; before, none of those five had it. Lists keep `GhostRows`. Rule 2f fails on a screen's wait drawn by hand; seen failing on all five.*
- *Not done: the eight list screens still call `useSettledOnce` themselves; they load different things over the network, and moving them is churn without a fault to fix. `profile-edit` still has no floor.*
- *Checklist 975-14 and 975-15.)*

### Step 6 · Stages and competitions (phase three step 3; P9.75-04, -05)
**Build.** The knockouts' Press tab; your competition first and named in every competition list. **Ask the maintainer which run P9.75-05 was before building** (01 §6).
**Done when.** `verify-stages`' tab-set check (fails today on the knockouts); the hub's competition list holds the player's competition on every full-path run (fails today).

*(Done 8 October 2026.*
- *P9.75-04 / R3-05: the knockouts have the table stages' tabs on a phone, Rounds · Bracket · Press; on a wide window the press is a third pane beside the rounds and the bracket. The bracket left its button for its tab. The rounds stay mounted under the other tabs, so a live match keeps its place, and it waits while you're on another tab, as it does when you scroll away. `verify-stages` checks every stage family's tab ids (the league season, the league phase and groups, the full path, the knockouts); seen failing on the old knockouts (rounds, bracket, press).*
- *P9.75-05 / R3-10 (D5: the full path): `europeCompetitions()` (`src/engine/cl-sim.ts`) lists a full path's three competitions with yours first, marked "· YOU", and the hub's Europe tab switches over all three (it listed only the two played out headless). The hub's Bracket tab names its competition ("UEFA EUROPA LEAGUE · KNOCKOUTS"). `verify-europe-path` checks the list for each competition, named or not, and that the tab uses it; seen failing on the old tab.*
- *Not done: the result screen's "See the rest of Europe" still opens the other two only; the hub is where a run is read. Checklist 975-16 and 975-17.)*

### Step 7 · The draft's bench (phase three step 4; P9.75-03)
**Build.** One hanger builder for the eleven and the bench; targets that read at a glance.
**Done when.** One definition (grep); the maintainer sees where a held sub can go without hunting.

*(Done 8 October 2026.*
- *R3-09: one `hangerFor(place)` in the draft builds the eleven's hangers and the bench's. The bench now carries what a starter does: the club's mark behind the player, the position beside "SUB 1", and the same lit targets. While a player is held, every hanger that can't take him steps back (`dim`), so the places that can read at a glance, on the pitch and the bench alike. `verify-diag` rule 2g fails on a hanger drawn outside the builder; seen failing on the old bench.*
- *Checklist 975-18.)*

### Step 8 · Lifecycle and the rest (phase three step 5; L-4, L-5, S-2, S-6)
**Build.** The log's run ends with the run; history views don't write the ledger; a rate limit on `submit-run`; the advisories triaged.
**Done when.** The log test for a run left before its first pick (fails today); a saved run's result leaves the ledger alone (fails today); `submit-run` refuses an 11th run in a minute.

*(Done 8 October 2026.*
- *L-4 / R3-12: the log's run has one lifecycle. A new run closes one still open ("replaced"), `resetRun` closes it, and the draft closes the run it opened when it's left with no picks ("left"); only its own, so a late unmount can't end the next run. `verify-diag` checks it; seen failing on the old code (3).*
- *L-5 / R3-13: a saved run opened from history leaves the save ledger alone (`saveLedgerLine`, `useRunSave`'s new `history`); the tester's run says "skipped · tester". Seen failing on the old code.*
- *S-2: `submit-run` refuses an 11th run in a minute from one account (429), counted by arrival in a new `received_at` column (`supabase/rate-limit.sql`), not `created_at`, which a queued run backdates. Until the SQL is run, the function skips the limit rather than refuse saves. The app already keeps a 429'd run queued. `verify-run-queue` reads both; seen failing on the old function. **The maintainer: run `rate-limit.sql`, then redeploy `submit-run` (again).** (Done 8 October 2026.)*
- *S-6: triaged in [`04`](04-INDEPENDENT-SECURITY.md) §5: of 48 advisories, the two that reach a phone (`decode-uri-component` under `query-string`, `nanoid`) aren't exposed; the rest are build tooling. No downgrade taken.*
- *Checklist 975-19 to 975-21.)*

### Step 9 · Words (P9.75-09)
**Build.** The press rewritten by hand, three or more variants per story kind, seeded, in English and Slovak.
**Done when.** `verify-press`' variant check (fails today); the maintainer reads a whole run's press.

*(Done 8 October 2026, the code's part; the maintainer reads a run's press.*
- *Every story kind and every branch of one (won and lost, each fate of a group) has three or more variants in English and Slovak, written by hand: suspension, yoyo, goal fests, tight games, leaky defences, fortresses, the title (tight and clear), and every cup story (your match, the league phase and the groups decided, the best thirds, your tie, upsets, shootouts, rounds, winners). The cups' standfirsts, one fixed line each, now vary too.*
- *The variant turns with the matchday (`hash(kind:subject) + matchday`), so the same story about the same club never reads the same two matchdays running; still a pure function of the story, so a saved run reads the same each time it's opened. Old saved runs may read differently once (their stories are rebuilt from their rounds).*
- *`verify-press` checks every story it writes (league seasons and 1,200 cup runs, in both languages): three or more variants with three different headlines, and no repeat on consecutive matchdays. Seen failing on the old press (five kinds with two).*
- *Checklist 975-22.)*

### Step 10 · The maintainer's session and the close
**Build.** A release build; the maintainer repeats the phone session (a live match watched through, the hub's tabs, five saved runs for the heap probe, the self-test) and the new checklist rows.
**Done when.** The re-score of [`05`](05-INDEPENDENT-UI.md) reaches 38/40 from the phone; [`../PERF-LOG.md`](../PERF-LOG.md) has the release reading; L-6 (the fingerprint on Hermes) answered.

*(Prepared 8 October 2026; the session is the maintainer's.*
- *Ready for the heap probe: Diagnostics → Tools → **Drop caches** lets go of the session's saved runs and squads and logs the heap then and five seconds later (`perf` category): if it falls, it was the caches (cap them, L-7); if not, the screens kept under the one in front.*
- *Before the build: run `supabase/rate-limit.sql`, then redeploy `submit-run` (step 8 changed it).*
- *The build: `preview-personal` (a release build with the tools, real names) for the readings; nothing native changed since the 6 October Skia build, so the development build stays valid for everyday testing.*
- *The session: a live match watched through (the `sim/live` line), the run hub's tabs on a European run, five saved runs opened one after another with `mem:js` read after each and Drop caches at the end, the self-test (Diagnostics → Run self-test, P9-8 / L-6), then rows 975-1 to 975-24. The readings go into [`../PERF-LOG.md`](../PERF-LOG.md).)*

---

## Left out, and when

| Left out | Why | When |
|---|---|---|
| A seeded, replayable run (L-1, S-1) | Touches every draw in the engine and every saved run's meaning | decision D3; after 1.0 by default |
| Storing run totals with the saved run (D2 option 2) | A column and two paths | if chunking (step 4) isn't enough |
| The globe's redraw on Skia | Needs a release build's `frame:globe` reading | after step 10's reading |
| The match sheet (C-15, 8 of 13 unlabelled pressables) | Phase 11's redesign | Phase 11 |
| Splitting the live screens | A move, not shared code | when their size slows a fix |

## Risks

| Risk | Likelihood | What happens | Mitigation |
|---|---|---|---|
| The offline bug is server-side | medium | step 2's client fixes don't move D-1 | the dashboard check before step 1 |
| The Stats tab's cost is somewhere else | low | `BoardList` doesn't move `ui:tab` | the probe first in step 4 |
| `LiveMatch` on light reads worse | medium | the maintainer prefers the dark card | the decision is his (D1); the check's named list can hold it |
| A release build changes the picture | high (in a good way) | some steps' targets met already | step 4 and 10 judge on release numbers |

## Documents to update when built

- [`../ui-overhaul/11-ROADMAP.md`](../ui-overhaul/11-ROADMAP.md) Phase 9.75: a *(Done …)* note per step.
- [`../PHASE-9.5-CHECKLIST.md`](../PHASE-9.5-CHECKLIST.md): a row per fix.
- [`../centralisation/13-RE-AUDIT-3.md`](../centralisation/13-RE-AUDIT-3.md): each R3 item's status.
- [`../release/02-OFFLINE.md`](../release/02-OFFLINE.md): the refused list and the timeout.
- `DESIGN.md`: floodlit for whole screens only.
