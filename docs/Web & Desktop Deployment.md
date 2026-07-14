# Running Perfection or Misery in a Browser (and on PC)

The decided plan: **Option A** for the database (real `expo-sqlite` WASM path,
not a Supabase fallback), hosted on **Vercel**, as **just a website** your
friend opens in a normal browser — no PWA, no Electron.

## The good news: most of this already works

The app is built on **Expo Router**, which supports web as a first-class
target already — the same file-based screens under `app/` render on web with
no rewrite. The project is already set up for it:

- `package.json` has a `"web": "expo start --web"` script.
- `app.json` already has a `web.favicon` entry.
- Metro (not the old Webpack bundler) is Expo's web bundler since SDK 50, and
  is what SDK 54/56 use — this project is already on SDK 54, so no bundler
  migration is needed.

Try it locally right now:

```bash
npx expo start --web
```

Most of the app's dependencies already have solid web support and need no
changes:

- **`react-native-reanimated` + `react-native-gesture-handler`** — both support
  web. The pinch-zoom bracket, the standings row-reorder animation, and every
  other animated bit should just work.
- **`react-native-svg`** — has web support; the hand-rolled globe (orthographic
  projection, no d3-geo) renders as inline SVG either way, so it's unaffected.
- **`@supabase/supabase-js`** — a universal JS client, runs in a browser
  natively. Auth, the leaderboard, and run history all work unchanged.
- **`react-native-mmkv`, `react-native-nitro-modules`, `react-native-view-shot`,
  `react-native-chart-kit`, `d3-geo`** — installed, but a repo-wide check found
  **none of these are actually imported anywhere in `app/` or `src/`** right
  now. If that's still true when you do this, they're not a web-compatibility
  risk at all — they're just unused dependencies.

## The one real blocker: the bundled SQLite database (Option A)

The whole player/league dataset ships as a **read-only SQLite file**
(`assets/db/players_v5.db`), copied onto the device's filesystem at launch via
`expo-file-system` and queried through `expo-sqlite`. This is the one piece
that doesn't port over for free, and it's the part worth budgeting real time
for — it's "the more faithful but more finicky option" by design, since it
keeps the exact same queries and the exact same bundled `.db` rather than
re-routing data through Supabase.

- `expo-sqlite` **does** support web, but it runs SQLite compiled to
  WebAssembly (via `wa-sqlite`) backed by the browser's **OPFS** (Origin
  Private File System) for persistence — not a plain file copy like on
  iOS/Android.
- Three things need to be true for this to work:
  1. **Metro needs to be configured to handle `.wasm` assets** — a
     `metro.config.js` addition (`resolver.assetExts` needs `wasm` added, or
     equivalent per the current Expo SQLite web guide — check
     `docs.expo.dev/versions/latest/sdk/sqlite` for the exact snippet at
     build time, since Expo's setup instructions do shift between SDKs).
  2. **Vercel must send two response headers on every request** (see below)
     — `Cross-Origin-Embedder-Policy: require-corp` and
     `Cross-Origin-Opener-Policy: same-origin`. These enable
     `SharedArrayBuffer`, which the WASM SQLite build needs.
  3. **The load path needs a web equivalent.** On native, `db/setup.ts` copies
     `assets/db/players_v5.db` into the filesystem via `expo-file-system` and
     `expo-asset`. On web there's no equivalent "copy a bundled file onto disk"
     step — the `.db` file needs to be fetched (as a static asset served
     alongside the site) and loaded into OPFS at runtime instead. This is the
     part that needs actual testing, not just config — treat it as its own
     task, separate from the Metro/header wiring.

This only affects the DB layer (`src/db/`) — the rest of the app (screens,
engine, simulation logic) is platform-agnostic already and doesn't need to
know or care that the data's coming from a WASM-backed SQLite instance instead
of the native module.

## Building for web

Once the app runs correctly locally under `--web`:

```bash
npx expo export --platform web
```

This produces a static build in `dist/` — plain HTML/JS/CSS.

## Hosting on Vercel

Deploy the exported `dist/` folder to Vercel as normal (via the Vercel CLI,
or connecting the repo and pointing the build output at `dist/`). The one
non-default step is the COOP/COEP headers the WASM SQLite path needs — add a
`vercel.json` at the project root:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" },
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" }
      ]
    }
  ]
}
```

Without this, the browser won't grant `SharedArrayBuffer`, and the WASM
SQLite database won't initialize — worth confirming this is actually working
(check the browser console for a SharedArrayBuffer/COOP-COEP error) before
assuming the rest of the app is broken if the DB layer fails on first deploy.

## Just a website — nothing more

Confirmed scope: your friend opens a URL in Chrome/Edge/Firefox on their PC,
same as any other website. No PWA manifest, no "Install app" prompt, no
Electron/Tauri wrapper — none of that is needed and it's deliberately left out
of scope here.

## Recommended build order

1. Get `npx expo start --web` rendering the app locally at all (catches any
   screen-level issues before touching the database).
2. Wire up the `expo-sqlite` WASM/OPFS path locally — Metro config, then the
   `players_v5.db` load-into-OPFS step, then confirm actual queries return
   real data in a local `--web` session.
3. `npx expo export --platform web`, deploy the `dist/` output to Vercel with
   the `vercel.json` headers above.
4. Load the deployed URL in an actual browser and click through a full run
   (draft → placement → simulation → result) to confirm the WASM DB path
   works under real hosting conditions, not just `expo start --web`'s local
   dev server (which may behave slightly differently around headers).

Sources:
- [SQLite - Expo Documentation](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- [The Current State Of SQLite Persistence On The Web: May 2026 Update](https://powersync.com/blog/sqlite-persistence-on-the-web)
- [Publish your web app - Expo Documentation](https://docs.expo.dev/deploy/web/)
- [Develop websites with Expo - Expo Documentation](https://docs.expo.dev/workflow/web/)
- [react-native-mmkv - npm](https://www.npmjs.com/package/react-native-mmkv)
