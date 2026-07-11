# Perfection or Misery ⚽

A football management roguelike built with Expo / React Native. Draft an XI,
get placed into a competition (a real league, the Champions League, or the
World Cup), watch it simulate, and see whether you achieve perfection — or
suffer misery.

## Requirements

- Node.js 20+
- npm
- A physical device or emulator/simulator (Android Studio / Xcode)

> **This app does NOT run in Expo Go.** It uses native modules (SQLite,
> Reanimated, gesture-handler, nitro-modules) that Expo Go doesn't ship with.
> You need a **development build** — see below.

## Setup

```bash
git clone <this repo>
cd perfection-or-misery
npm install
```

`npm install` uses `legacy-peer-deps` (already set in `.npmrc`) — don't drop
that flag, some Expo/RN peer ranges conflict otherwise.

### Environment variables

Copy `.env` (or create one) with your own Supabase project:

```
EXPO_PUBLIC_SUPABASE_URL=your-project-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

The anon key is safe to ship client-side (Supabase's Row Level Security does
the actual gatekeeping). Without this, the app still runs locally — you just
won't be able to save runs or view the leaderboard.

### The player database

`assets/db/players_v5.db` is already built and committed, so a fresh clone
works out of the box — no scraping needed. If you want to regenerate it from
the scraped seed data in `scripts/seed/*.json`:

```bash
npm run build-db
```

## Running it

```bash
npx expo start --dev-client --clear
```

Then open the **development build** on your device/emulator (not Expo Go).
If you don't have a dev build installed yet, create one first:

```bash
npx expo run:android   # or: npx expo run:ios
```

Connect via your LAN IP, or pass `--tunnel` to `expo start` if LAN doesn't
reach your device.

## Useful scripts

| Command                | What it does                                      |
|-------------------------|----------------------------------------------------|
| `npx expo start --dev-client` | Start the Metro bundler                     |
| `npx expo run:android` / `run:ios` | Build & install a dev build             |
| `npm run build-db`     | Rebuild `assets/db/players_v5.db` from `scripts/seed/*.json` |
| `npx tsc --noEmit`     | Typecheck the whole project                        |

## Project structure (short version)

```
app/            expo-router screens (mode-select → draft → placement → simulation → result)
src/engine/     pure simulation logic (no RN) — matches, leagues, CL, WC, knockouts
src/components/ shared UI (pitch view, live match viewer, bracket, globe reveal, …)
src/db/         SQLite queries + the bundled-DB versioning/copy logic
src/store/      Zustand store — all per-run state
scripts/        scrapers + the DB build script (run with tsx, never bundled into the app)
docs/           deeper design notes, if you want the full picture
```

For a much deeper technical writeup, see `docs/PROJECT_STATE.md`.

## Gotchas

- **Not Expo Go** — see above.
- **Typecheck noise**: `npx tsc --noEmit` will show errors under `scripts/` and
  `supabase/functions/` — those are separate runtime contexts (Node/tsx and
  Deno respectively) and are expected to not typecheck cleanly against the
  app's `tsconfig`. Ignore them.
- **EAS builds from git** — uncommitted changes won't show up in an EAS build.
