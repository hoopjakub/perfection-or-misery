# 12 · The overview (Phase 7)

Written 19 September 2026, after walking the web build at desktop (1024 × 768) and phone (375 × 812) sizes in the browser: setup (Where you play, How hard, Your shape), the draft, a full league run through the Quick Sim Tester, the result screen, the run hub (Table, Stats), a player's page, a match sheet, Home, Ranks and You. The maintainer covers the Android pass and supplies the screenshots for the `07` documents (the browser tool here can look at a screen but can't save a picture of it).

## Fixed during the walk

| What was wrong | Where | Fix |
|---|---|---|
| Space in the draft spun a new club while you were picking, a free reroll | `app/game/draft.tsx` | Space only spins when the Spin plate is showing |
| The table's zone code wrapped ("CHAM / P") | `LeagueTable` | Code column widened to fit CHAMP / UECL / DOWN, one line |
| Result screens' plates stretched across the whole window | four result screens, `ResultActions` | Plates keep the reading column's width |
| The hub's table was a lookalike, not the shared table, and its columns drifted apart on desktop | `app/game/run.tsx` | The shared `LeagueTable` with clickable rows; the hub's content pane capped at 820px |
| The mode rack left an orphan card (four modes in three columns) | `app/game/mode-select.tsx` | Two columns on wide windows |
| The shape screen's pitch was squat on desktop | `app/game/formation-select.tsx` | A pitch's proportions (0.78) in the wide layout |
| A serif flash before the fonts arrive on web | `src/theme.ts` `font` | Each face has a fallback stack on web (condensed, mono, system sans) |
| "Go back" did nothing on a page opened by a reload or a link | kit `BackControl`, the match sheet's empty state | Falls back to Home when there's no history |
| Ranks cut the tag line off on a phone ("WO…") | kit `RunLabel` | The tag line may take two lines |
| Privacy, Terms and Delete account had no icons, unlike the rows above them | You | Icons added to the kit set (`privacy`, `terms`, `delete`) |
| Player, club and story pages had the generic browser title | those routes | `PageMeta` with the player's, club's or story's own title |
| Back during a run fired an OS alert (Android) or `window.alert` (web) | `useSimBackGuard`, `app/confirm.tsx` | P8-26 built: back opens the Abandon screen; back again abandons (`backConfirms`, through React Navigation's `beforeRemove`, so "Keep playing" still stays). Not yet tried on a device. |

## The three targets

### Critique (target 32/40): **31/40**

| # | Heuristic | Was | Now | Why |
|---|---|---|---|---|
| 1 | Visibility of system status | 3 | 4 | The save line, the offline strip, skeletons, InlineError distinct from empty states |
| 2 | Match with the real world | 3 | 3 | Jargon remains in the guide ("screw-you-er"); tournaments still say "season" (P8-78) |
| 3 | User control and freedom | 2 | 3 | Abandon exists everywhere, back routes to it, the draft asks before discarding picks; the new back flow needs a device check before it earns a 4 |
| 4 | Consistency and standards | 2 | 3 | One result design, shared tables and parts; but About, the guide, the match sheet's cards, the squad and lineup cards are still the old look (20 files on the old colours, 63 raw hex values) |
| 5 | Error prevention | 2 | 3 | Runs save themselves, decisions go through the confirm route, the free-reroll hole is closed |
| 6 | Recognition rather than recall | 3 | 3 | Labelled counters and tappable rows; the position and rating graphs still have no legend (P8-66) |
| 7 | Flexibility and efficiency | 2 | 3 | Keyboard shortcuts, skip and speed, stats families with per-90; Ranks still has no filter (P8-85) |
| 8 | Aesthetic and minimalist design | 2 | 3 | Results lead with the verdict and read in columns; the maintainer still calls the hub and Home bland (P8-67), and a guest's Home is mostly empty space |
| 9 | Error recovery | 1 | 3 | Retry on every failed fetch, save retry, plain-language errors, reload-safe empty states |
| 10 | Help and documentation | 2 | 3 | The rulebook route, `?` bubbles, a corrected guide; the guide is still one long page (P8-72) |

The point short is consistency (4) or aesthetics (8), and both are Phase 8's identity pass by definition.

### Native audit (target 15/20): **13/20**

| # | Dimension | Was | Now | Evidence |
|---|---|---|---|---|
| 1 | Accessibility | 1 | 3 | 207 roles, labels and states (was 0); kit contrast computed ≥ 4.5:1; heading levels fixed (one `h1` per page); old screens still lack roles |
| 2 | Performance | 2 | 2 | Web first paint 0.6 s (was 28 s LCP). Still no `FlatList` anywhere, `simulation.tsx` holds 31 `useState` |
| 3 | Appearance and theming | 2 | 2 | Kit tokens on every rebuilt screen, but 20 files on the old colour set and `userInterfaceStyle: "dark"` over cotton screens (P8-65) |
| 4 | Platform conformance | 2 | 3 | Four destinations, Ionicons Sharp, safe-area insets, back through the Abandon route; `predictiveBackGestureEnabled` still false |
| 5 | Adaptivity | 1 | 3 | Size classes, a rail from 1024px, two- and three-pane layouts on every area except knockouts and the Deep Match; `orientation: "portrait"` still locks every device |

Two points away: virtualized long lists (Ranks, Runs, stats boards, the 36- and 90-club tables) and unlocking orientation on medium and expanded windows (needs `expo-screen-orientation` and a native build). Both are Phase 9 work, which is the performance pass.

### Vibecode audit (target: no blockers, no credibility items): **met, with two accepted items**

No blockers: the only key in the bundle is the public anon key; SEC-1 was a false positive on icon names. The two credibility items are the maintainer's decisions: the `vercel.app` address (the domain doesn't matter to him) and the "coming soon" World Cup full route (a deliberate teaser).

## The five-question test, per screen

Could it be any other app? · Is any colour not encoding something? · Does every indicator have a legend? · Is the one most important thing obvious? · Would a fan know it's football? · Do the numbers line up?

| Screen | Result | What fails |
|---|---|---|
| Home | Passes 5 of 6 | Nothing says football to a guest: the middle of the screen is empty |
| Where you play | Passes | Colourway tapes are never explained (it's where you play, not how good) |
| How hard | Passes | — |
| Your shape | Passes | — |
| Draft | Passes | — |
| Season (league) | Passes 5 of 6 | Position graph has no scale or legend (P8-66) |
| Result screens | Passes 5 of 6 | Same graph; the squad and lineup cards are the old look |
| Run hub | Passes 4 of 6 | Bland (P8-67); no flags or survival tags (P8-79); no team stats (P8-80) |
| Player page | Passes 5 of 6 | Rating trend has no scale or legend (P8-66) |
| Match sheet | Passes 4 of 6 | Old-look cards; penalty takers missing (P8-81) |
| Ranks | Passes | Needs filters and "you" (P8-85) |
| You | Passes | — |
| About, Guide | Fail 2 | Still the old navy theme: they could be any other app (P8-65, P8-72) |

## Screenshots for the `07` documents

The maintainer takes these on the phone; they replace the wireframes with "as built" notes. In order: Home (guest and signed in), Where you play, How hard, Your shape, Draft (idle, picking, bench), The draw, Pundits, Season (table, results, press), Champions League league phase, World Cup groups, Knockouts, Deep Match, Awards Night, the four result screens, the run hub's tabs, a player, a club, a story, a match sheet's five tabs, Runs, Ranks, You, Achievements, Career, Privacy.

## What Phase 7 hands to Phase 8 and 9

- **Phase 8:**
  - The old-look screens and cards: About, the guide, the match sheet's cards, `LineupPitch`, `SquadSummary`, `MedicalTable` (P8-65, P8-71).
  - The graph legends (P8-66), the hub's design (P8-67), the guest Home.
  - Tournament wording (P8-78) and the real bracket (P8-79).
- **Phase 9:**
  - `FlatList` for every long list.
  - Split `simulation.tsx`'s state.
  - Orientation unlocked on tablets and desktops.
