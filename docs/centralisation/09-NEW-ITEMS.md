# 09 · New items: what Phase 8 added since phase one

> Part of the [centralisation set](00-README.md). Status: **findings**, from the code on **29 September 2026**. Numbered N-01 onward so they can sit beside phase one's F, C, L, A and S items.

Between 24 and 28 September the app gained the Europa and Conference League modes, a cup inside every league run, a full path through three competitions, clubs with a chat, a much bigger profile, the pundits' tournament, seasons and a new globe. Each was built as well as the time allowed, and several reached for a shared piece where one existed. Where one didn't, some of them made a new copy. This document lists those, plus the places the maintainer's playtest of 29 September (roadmap P8.5-01 to P8.5-19) touches the "one base" rule.

Each item has a **class** from [`04-COMPUTED-DIFFERENTLY.md`](04-COMPUTED-DIFFERENTLY.md) (*Wrong*, *Divergent*, *Fragile*, *Unverified*) or **Parity** for a feature one family has and another lacks, the evidence, and **Base**: the proposal.

---

## 1 · The Europa and Conference League modes (P8-172)

### N-01 · They wear the Champions League's colours in the older parts · *Divergent*
**Today.** The two modes run on the Champions League's live screen and result screen, which still read `MODE_THEMES.champions_league` directly: `const theme = MODE_THEMES.champions_league` at `app/game/simulation.tsx:220`, whose accent goes to every match sheet opened from the league phase (`simulation.tsx:563, :605, :631`), and `const CL = MODE_THEMES.champions_league` at `app/game/cl-result.tsx:46`. The colourway tape is right (Europa orange, Conference green, from `colourwayFor(comp.mode)`); the accents in the older parts are Champions League blue.
**Base.** The accent comes from the run's competition, through `useModeTheme` or the competition config (`src/data/europe.ts`), never a named mode. Closes with step 1 of the revised plan ([`10-PHASE-TWO-REVISED.md`](10-PHASE-TWO-REVISED.md)).

### N-02 · "Your eight" in a six-game league phase · *Wrong*
**Today.** The classic league phase says "Your eight" three times (`simulation.tsx:665`, the fixtures tab label at `:698`, the pane title at `:727`). In the Conference League mode you play six.
**Base.** The count comes from the competition (`comp.matchdays`), as the full path's review already does ("Your six").

### N-03 · The speed lock came with them · *Parity*
The Europa and Conference League modes are locked to slow like the Champions League (F-05, `simulation.tsx:219`). Nothing to add beyond F-05; listed so the fix covers five modes, not three.

### N-04 · The competition's facts live in six places · *Fragile*
**Today.**

| Fact | Where |
|---|---|
| Names | `EUROPE` (`src/data/europe.ts`), `MODE_LABELS` (`src/theme.ts:158`), `EURO_TIER_COMPS` (`src/data/tiers.ts:88`) |
| Colours | `COLOURWAYS` and `MODE_THEMES` (`src/theme.ts`) |
| Score weights, 0.8 and 0.65 | `score.ts:94` (the full-path ladder), `score.ts:107-108` (the classic ladders), `tiers.ts:88` (the tier ranks) |
| Mode cards | `src/data/modes.ts` |

`europe.ts`'s own header says it holds "how its scores weigh against the Champions League's", but its type has no weight; the weights are in the three places above. That's a document drifting from its code in the file that was meant to stop drift.
**Base.** One competition record per competition, holding its names, colours, shape and weight. The shared score (`score.ts`) has to stay importable by the edge function, so the record lives where both can import it (a plain data file with no app imports, as `europe.ts` already is).

## 2 · The league run's cup (P8-173)

### N-05 · The cup's ties have no match sheet · *Parity*
**Today.** A cup tie reuses `ResultRow`, which is right, with its round and "after extra time" or "4–3 on penalties" in the `round` line (`LeagueSeason.tsx`, `app/game/result.tsx`). It's the only match in the game with no seed, no scorers and no sheet to open: `simulateKnockout` decides it, and nothing attributes it. It isn't in the run hub, the stats or anyone's match log.
**Base.** A cup round is a knockout stage in the stage model (07 §2.1), played with a seed and attributed once like every other match, so it gets the sheet, the stats and the run hub for free. Until then, say plainly on the cup's section that its matches have no sheet.

### N-06 · Cup names in two tables · *Fragile*
**Today.** `src/engine/domestic-cup.ts` has `CUP_NAME` keyed by league id (five cups) and `CUP_BY_COUNTRY` keyed by country (ten), and The Dugout has 52 names in `src/world/cupNames.ts`. See [`../europe/06-CUPS-FOR-EVERY-NATION.md`](../europe/06-CUPS-FOR-EVERY-NATION.md).
**Base.** One table keyed by association, with all 55.

## 3 · The full path through three competitions (P8-52)

### N-07 · Only your competition is played past qualifying · *Parity*
**Today.** `simulateEurope` (`src/engine/europe-path.ts`) builds all three league-phase fields, and then only yours is played. The maintainer wants to see how the other two finished (P8.5-16); today there's nothing to show.
**Base.** The other two league phases and knockouts are played headless when yours starts (the same engine, no attribution needed until opened), and the result screen gets a competition switch. The measure to take first is the cost: two more 36-club league phases and brackets, on a phone.

### N-08 · Europe's ceremony draws clubs without marks · *Divergent*
**Today.** The holders and the cup winners on the rest-of-Europe screen are `ListRow`s with a name and a value (`custom-ucl-simulation.tsx`, the `world_sim` phase). The last place A-01 missed. P8.5-13 also asks for the cups as brackets.
**Base.** `TeamMark` rows; each cup opens its bracket (`BracketTree`).

### N-09 · The qualifying screens show one ladder, the league phases none · *Parity*
**Today.** After qualifying, the ladder shows your competition's ties and your own (`runQualTies`), and there's no list of who got into each league phase (P8.5-14).
**Base.** The three league-phase fields listed under the qualified stamp, with marks, and the qualifying ladder's competition switch kept on the result screens too.

### N-10 · The mode is still named for one competition · *Divergent*
**Today.** `champions_league_custom` is labelled "UEFA Champions League · Full path" (`MODE_LABELS` at `theme.ts:158`, the card at `modes.ts:49`), tagged "UCL Full Path" (`tiers.ts:132`), and its achievement reads "Win the full UCL journey" (`achievements.tsx:26`). Since P8-52 a season on it can end in any of the three competitions, and a Conference League win counts as conquering "the full UCL journey" (`isRunWon` counts `uecl_winner`).
**Base.** The mode's name and its achievements follow what it is now; see [`../europe/07-THE-EUROPEAN-PATH.md`](../europe/07-THE-EUROPEAN-PATH.md) §4. The id stays (saved runs carry it).

## 4 · Engine helpers

### N-11 · Two more private shuffles · *Fragile*
**Today.** The new code shuffles properly (seeded Fisher–Yates) but each file has its own: `shuffled` in `src/engine/domestic-cup.ts` and in `src/engine/cup-calls.ts`, beside the seven biased ones (L-14).
**Base.** L-14's one `shuffle(arr, rng)`.

## 5 · The screens and the grounds

### N-12 · Sixteen components are fixed to one ground · *Divergent*
**Today.** These components set their ground once, at module level (`const roles = ROLES.nylon` or `ROLES.cotton`), so they draw the same whatever page they're on:

| Ground | Components |
|---|---|
| Nylon | `BracketPreview`, `BracketTree`, `Ceremony`, `KnockoutRoundsView`, `LiveMatch`, `match/PitchViews`, `MedicalTable`, `OfflineStrip`, `QualifyingLadder`, `season/LeagueSeason`, `season/ResultParts`, `season/RunChrome`, `season/VerdictBlock` (and `LineupPitch` inside its function) |
| Cotton | `LegalPage`, `kit/nav` |

On top of those, the draw's globe panel is painted `prim.nylon` by hand (`app/game/placement.tsx:117`). That's the "black box" behind the globe in the maintainer's screenshot: a nylon panel on a cotton page. A bracket opened from a cotton screen is the same.
**What the maintainer asked (29 September).** "Every component needs a light and a dark variant", noted for Phase 8.5. The locked direction has two grounds set by the scene, not a theme toggle ([`../ui-overhaul/04-DIRECTION.md`](../ui-overhaul/04-DIRECTION.md) §2.2, decision of 14 September). The two readings are covered in [`../ui-overhaul/13-CARRY-FORWARD.md`](../ui-overhaul/13-CARRY-FORWARD.md) §3.1; either way the first step is the same.
**Base.** A shared component never picks its ground. It takes `roles` from its caller (most kit pieces already do) or from a ground context set by `KitScreen`. The count above is the done-when: zero module-level `ROLES.nylon`/`ROLES.cotton` in `src/components`.

### N-13 · Two ways to keep a field above the keyboard · *Divergent*
**Today.** Sign-in and sign-up use `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}` (`app/auth/login.tsx:47`, `register.tsx:72`); the club chat uses `'padding' : undefined` (`app/club/chat.tsx:86`), so on Android nothing lifts its field. That's P8.5-06's "you can't see what you type".
**Base.** One keyboard-safe screen wrapper in the kit, used by every screen with a text field. Check on the phone: Android's edge-to-edge layout (SDK 54) changes how `adjustResize` behaves, so the wrapper is proven on a device, not assumed.

### N-14 · One list is virtualised · *Parity*
**Today.** The club chat is the only `FlatList` in the app (`chat.tsx:33, :87`). Ranks, Runs, the stats boards and the 36-club tables still render every row. Phase 9 owns it ([`../ui-overhaul/10-ADAPT-OPTIMIZE-A11Y.md`](../ui-overhaul/10-ADAPT-OPTIMIZE-A11Y.md) §3.2); listed so it isn't forgotten.

### N-15 · The ink-on-a-colour rule, five times · *Fragile*
**Today.** "Ink or cotton, whichever reads better on this colour" is written at `src/components/ClubParts.tsx:13`, `kit/labels.tsx:209`, `kit/primitives.tsx:250` and `:408`, and a variant over two colours at `profile/ProfileParts.tsx:119`. It's the rule that makes P8-177's free colour picker safe, so it matters that it can't drift.
**Base.** One `inkOn(colour)` in `src/lib/colour.ts`, beside the picker's maths.

### N-16 · The globe twice · *Parity*
**Today.** The draw uses `GlobeReveal`, with the zoom and fog of P8-164. About uses `SpinningGlobe` (`app/about.tsx:92`), which spins and never lands (P8.5-12 asks for the new one there).
**Base.** About lands on Slovakia with the same reveal, then keeps turning.

## 6 · You, your profile and sharing

### N-17 · Your profile drawn two ways · *Divergent*
**Today.** Your public page and the editor's preview draw `ProfileCard` (`app/u/[id].tsx:79`, `app/profile-edit.tsx:178`). The You tab draws a `LookBand` and the `IdTag` (`app/(tabs)/profile.tsx:120`), so the frame, theme, banner picture, status, about line and badges never show there (P8.5-02).
**Base.** The You tab wears `ProfileCard` too; one card, three places.

### N-18 · Two share cards, and the run's owner only sometimes · *Divergent*
**Today.** The verdict's share card (`VerdictBlock`) and the story's (`app/game/story.tsx:155`) are separate captures. The verdict names its owner only for a saved run opened again (`ownerId` is left out for the run you've just played), and then as YOUR RUN, not your name (P8.5-04).
**Base.** One share frame for both, which always carries the owner: name, picture and club tag.

## 7 · The playtest notes, against this set

Where each of the maintainer's 29 September notes (roadmap Phase 8.5, part zero) meets a centralisation item. Notes with no item here are features, not duplication.

| Note | Items |
|---|---|
| P8.5-01 · the continue button on some screens | To ask; the forward plates are drawn per screen (C-13, S-01) |
| P8.5-02 · profile changes not on You | N-17 |
| P8.5-04 · the share picture should say whose run | N-18 |
| P8.5-06 · the chat's field under the keyboard | N-13 |
| P8.5-11 · the draft card's flag | Feature (the card is shared already) |
| P8.5-12 · the globe: About, France, the black box | N-16, N-12; France's zoom is a data fix (its outline includes French Guiana), measured in the roadmap note |
| P8.5-13 · crests and brackets in Europe's ceremony | N-08, A-01 |
| P8.5-14 · who else got into the league phases | N-09 |
| P8.5-15 · the full path's pundits | F-22 |
| P8.5-16 · the other competitions on the result screen | N-07 |
| P8.5-18 · the Leagues button in the knockouts | C-06 (the full path's own knockout copy) |
| P8.5-19 · the stakes list cut off | Feature |

## 8 · Count

18 items: N-01 to N-18. Wrong: 1 (N-02). Divergent: 7 (N-01, N-08, N-10, N-12, N-13, N-17, N-18). Fragile: 4 (N-04, N-06, N-11, N-15). Parity: 6 (N-03, N-05, N-07, N-09, N-14, N-16).
