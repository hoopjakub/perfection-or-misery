---
name: pom-dev
description: >-
  Engineering conventions and working style for the "Perfection or Misery"
  football-management roguelike (Expo SDK 54 / React Native / TypeScript /
  expo-router, with a web build). Use this skill for ANY coding work in this
  repo — features, bug fixes, engine/simulation changes, UI work, refactors,
  or "look over X" reviews. Trigger it even when the request doesn't name the
  skill: if the task touches the match/stats engine, the draft/placement/
  simulation/result screens, the deep-stats or ratings system, modals, theming,
  the Zustand store, or the SQLite player DB, this skill applies. It encodes how
  to verify changes (typecheck filter, headless tsx scripts, the quick-sim
  browser walkthrough), the architectural patterns to preserve (result-first
  engine + deterministic seeded generation, attribute-once-store-on-match,
  player-only difficulty), and the UI/code conventions the maintainer expects
  (shared primitives over copy-paste, theme tokens over hardcoded hex, Ionicons
  over emoji-as-icon, WHY-comments). Skip only for pure prose/design-doc writing
  with no code.
---

# Perfection or Misery — dev conventions

A mobile football-management roguelike: draft an XI from random real
club-seasons, get placed in a competition, simulate it, get a tier + score.
Modes: `league`/`all_time`/`era`/`chaos`/`cursed`, `champions_league`,
`champions_league_custom`, `world_cup`. Runs on native (dev build) **and web**.

**Read `docs/PROJECT_STATE.md` first** on any non-trivial task, then the relevant
`docs/Next Up - *.md` design docs — they carry locked decisions and the "why."

## Golden rules (the maintainer notices when these slip)

1. **Verify behaviour, don't just typecheck.** Engine/stat changes get a headless
   `scripts/verify-*.ts` run over thousands of iterations; UI/flow changes get a
   real browser walkthrough. "It compiles" is not "it works." See *Verification*.
2. **Preserve the architecture, don't fight it.** The engine is **result-first**;
   deep stats are a **deterministic seeded texture layer** on top. Don't invert
   this or make the scoreline an output of the stat generator. See *Architecture*.
3. **Share, don't copy-paste.** A pattern used in 2+ places becomes a primitive
   or a theme token. The repo already has `PressCard`, `BackButton` (`src/components/ui.tsx`),
   nav helpers (`src/lib/nav.ts`), `ratingColor`/`withAlpha`/`colors.pots`/`colors.gold`
   (`src/theme.ts`), `summariseScorers`, shared shootout/attribution helpers. Reach
   for these before writing a new one; add to them rather than duplicating.
4. **Comment the WHY, generously.** This codebase's comments explain *why a
   decision was made*, what the gotcha is, and what the previous approach was and
   why it changed — not what the line does. Match that density and voice. A
   non-obvious constant, an ordering constraint, a platform workaround, or a
   balance choice deserves a sentence or two. Terse magic numbers are a regression.
5. **Keep AI-vs-AI fair.** Modifiers that help/hurt the player (e.g. difficulty)
   apply **only to matches where a team `isPlayer`** — never globally — so the rest
   of the table/bracket stays honest.

## Environment & commands

- Windows. Bash and PowerShell both available. Node 20.17.
- **Not Expo Go** — native needs a dev build (`npx expo start --dev-client`).
- Web: `npm run web` or `npx expo start --web` (serves on **:8081**).
- `.npmrc` has `legacy-peer-deps`; `react-native-nitro-modules` must stay an
  explicit dep; `typescript ~5.9.2`. `club_facts.json` must stay valid JSON or
  the app won't compile.
- Player data is a **bundled, read-only** SQLite DB (`assets/db/players_v5.db`,
  `DB_VERSION` in `src/db/setup.ts`). On web it's loaded into memory via
  `SQLite.deserializeDatabaseAsync` (no filesystem/OPFS).

## Verification (do this, in this order)

### 1. Typecheck — filter the noise
```bash
npx tsc --noEmit 2>&1 | grep -v "^scripts/" | grep -v "^supabase/"
```
`scripts/` (tsx) and `supabase/` (Deno) are separate runtimes — their errors are
expected and ignored. Clean output from everything else is the bar.

### 2. Headless engine/stat verification — the project's testing idiom
For any change to the match engine, stat generator, ratings, attribution, or
balance, write or extend a `scripts/verify-*.ts` and run it with `npx tsx`.
The house style (see `scripts/verify-match-detail.ts`, `verify-difficulty.ts`):
- Simulate **thousands** of matches/runs.
- A `check(cond, msg)` helper that increments a failure counter and logs `❌`.
- **Invariant checks** (things that must always hold: possession sums to 100,
  a scorer was on the pitch, a red-carded player's minutes end at the red, subs
  come on ≥46', …) **plus sanity aggregates** (avg xG per team, MOTM correlates
  with goal involvement, strikers out-rate defensive mids, a +12 OVR favourite
  wins comfortably, difficulty shifts the player's win-rate but not AI-vs-AI).
- Print a summary and `process.exit(failures === 0 ? 0 : 1)`; end on
  `✅ ALL CHECKS PASSED`.
Determinism matters: the same seed must produce byte-identical output, so these
scripts are reproducible and diffable across runs.

### 3. Browser walkthrough — the quick-sim tester
The fastest way to exercise draft → sim → result → stats end-to-end without
manually drafting 11 players: **About tab → tap the version number ("1.0.0") 8×**
to reveal the hidden Quick Sim Tester, then League/UCL/UCL✦/WC. It auto-drafts,
simulates headlessly, and lands on the result screen (stats included).
- Prefer `get_page_text` / `read_page` over screenshots — screenshots tend to
  time out on this RN-web app; text tools are reliable.
- Direct-navigating to a `/game/*` URL reloads the app and **wipes the in-memory
  Zustand store** — reach result/stats screens via in-app navigation instead.
- Check `read_console_messages(onlyErrors)` — it should be empty.
- The dev server can take ~30s to first-bundle and the SQLite worker occasionally
  stalls on a cold boot; a reload clears it. That's infra, not your change.

## Architecture (what to preserve)

- **Result-first engine** (`src/engine/match.ts`): `simulateMatch` rolls the
  win/draw/loss + scoreline from OVR + form + home advantage. Everything else is
  downstream of the decided result.
- **Deterministic deep-stats layer** (`src/engine/match-detail.ts`): from a stored
  per-match **seed** (mulberry32), regenerates the full FotMob-style sheet
  (possession, xG, shots, passes, duels, cards, per-player 0–10 ratings, MOTM),
  **adopting the already-attributed scorers verbatim**. Same seed → identical
  sheet, so the live view, the match-detail modal, and a history reload all agree.
  Only the seed is persisted; the expansion is reproduced on open.
- **Attribute once, store on match**: scorers (and seeds) are attributed a single
  time when a result is created and stored on the match object, so every later
  view is consistent. New per-match data should follow the same pattern.
- **Stats aggregation** (`src/engine/run-stats.ts`): `computeRunStats` regenerates
  each match's detail from its seed to accumulate ratings/POTM and a per-player
  game log. `computeLeague/CL/WCRunStats` are the per-mode entry points.
- **Per-mode theming** (`src/theme.ts` `MODE_THEMES` + `useModeTheme`): WC / UCL /
  chaos / cursed get distinct accents; league modes use the league accent. Pull
  the accent from the hook, don't hardcode a mode's colour.
- **Substitutes**: 45'+ rule (`SUB_MIN_MINUTE = 46`), reduced scoring odds, `isBench`
  flag; symmetric (off = nobody uses subs). Applies to every club, not just yours.
- **Difficulty is one model** (`src/engine/difficulty.ts`): easy/medium/hard are
  aliases for screw-levels 2/4/6 of a 1–10 scale, plus custom (rerolls 0–10,
  ratings toggle, screw-level). `resolveDifficulty(difficulty, custom)` is the
  single source for the match tilt (`setMatchTilt` in match.ts, player-only),
  reroll allowance, hidden ratings, the 0–11 `hardness` rating, and the run
  `scoreMultiplier` (harder settings score more). Persisted per-run as
  `difficulty` + `difficulty_meta` (optional columns, auto-dropped by `insertRun`
  if absent) and read back by the achievements screen. Don't re-derive any of
  these anywhere else.

## UI conventions

- **Shared feedback primitives**: use `PressCard` for any tappable card/row (adds
  pressed scale+dim and web hover lift) and `BackButton` for headers. Every
  interactive element needs press feedback; a bare `Pressable` with no pressed
  style is a regression.
- **Icons**: `@expo/vector-icons` `Ionicons`, not emoji-as-functional-icon.
  (Decorative text emoji in copy is fine; a ▶/⏸/🔄 standing in for a control is not.)
- **Theme tokens, not hardcoded hex.** `colors.*`, `spacing`, `radius`,
  `typography`, `shadows`; `ratingColor(r)` for 0–10 rating chips; `withAlpha(hex, pct)`
  instead of `color + '33'`; `colors.pots` / `colors.gold` / `colors.overlay`.
  `textMuted` must stay ≥4.5:1 on `bgCard`.
- **Modal scroll pattern**: a capped card (`maxHeight: '80–92%'`) with a header,
  a scroll body, and a footer (Close) must give the **scroll body `flexShrink: 1`**
  (not a fixed `maxHeight`) so it fills only the space between header and footer —
  otherwise long content overflows and clips the footer off-screen. Uses `AppModal`
  (`src/components/AppModal.tsx`), which sidesteps RN-web's `<Modal>` sizing glitch.
- **Web/desktop**: mobile-first, capped to a centered ~480px column with hairline
  edges + ambient backdrop (`app/_layout.tsx`, `app/+html.tsx`). Style for both
  light and dark where relevant; keep flag-emoji font handling intact.

## Working style

- Match the surrounding code's idiom, comment density, and naming — read the file
  before editing.
- Bulk mechanical edits (swapping a pattern across many files) via a `python -c`/
  heredoc with `assert old in s` guards is accepted and fast; still typecheck after.
- When scope balloons, prefer the contained, verifiable slice and say what you
  deferred and why — the maintainer values honest boundaries over half-finished
  big-bang changes. Note genuine follow-ups (e.g. "KO live reds need per-leg seeds
  on `KnockoutTie`") rather than silently dropping them.
- After a batch, leave `tsc` clean and the relevant `verify-*.ts` green.
