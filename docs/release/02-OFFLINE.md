# 02 · Offline

> Part of the [release set](00-README.md). Status: **findings and plan**, read from the code on 29 September 2026.

The maintainer: "do we do like your runs offline can get saved online when you are back online? Also the app should still work, but as soon as it doesn't have access to the internet it should automatically change some stuff around."

## 1 · Today

| What | Offline today | Evidence |
|---|---|---|
| Playing a run | **Works.** The player database is bundled; the whole run is simulated on the device | `src/db/setup.ts`, the engine |
| Saving a finished run | **Fails, and is lost** if you leave the result screen | `useRunSave` (`src/hooks/useRunSave.ts`): one attempt when the stats are ready; on failure the status becomes `failed` and the screen offers a retry. Nothing keeps the run anywhere once the screen is gone |
| A run in progress (up to kick-off) | Kept on the device (P8-149, `src/lib/runKeeper.ts`), network or not | |
| Knowing you're offline | **Web only.** The offline strip listens to the browser's `online`/`offline` events; the phone app has no detection | `src/components/OfflineStrip.tsx` (its own comment: native "would need expo-network, a new native build") |
| Ranks, profiles, clubs, friends, the chat, season badges, the career | Need the network; they show their load error | |
| First launch with no network | The guest session (`signInAnonymously`) needs the network, so a player who opens the app offline for the first time has no session | `src/lib/auth.ts:10-15` |

**So the answer is no:** a run finished offline isn't saved when the phone is back online.

## 2 · The plan

### 2.1 A save queue
**When a save fails, the run goes into a queue on the device instead of vanishing.**
- The queue is the exact row `insertRun` would have sent (`src/db/queries/runs.ts`), written to MMKV (already used by `runKeeper.ts`), keyed by a client-made id.
- On every app start, on coming back online, and on returning to the foreground, the queue is flushed oldest first.
- **Each queued run carries its own id, and the server refuses a second insert with the same id** (a unique column on `runs`, or the `submit-run` function checking it). Without that, a save that reached the server but whose answer was lost would be sent again and counted twice.
- The run's timestamp is when it was **played**, not when it was sent, so a run played in the last hour of a season counts for that season's board (P8-152 reads runs between dates).
- A run stays in the queue until the server has it; the verdict screen says "Saved on this phone. It'll go up when you're online."
- Score validation stays on the server: a queued run is scored and checked by `submit-run` like any other, so the queue can't be used to post a made-up run. **Risk to decide:** a player could edit the queue file on a rooted phone. The server checks (`invalidRun`) already reject impossible rows; a queued run is no weaker than a live one, since both are reported by the app.
- **A guest's runs aren't queued,** since a guest's account isn't kept (unchanged rule).

### 2.2 An offline mode that changes the app
With `expo-network` (a native module, so a new build) the app knows when it's offline and changes around, as the maintainer asked:

| Area | Offline behaviour |
|---|---|
| Home | A strip: "Offline. You can play; your runs will go up when you're back." |
| Starting a run | Unchanged |
| The verdict | "Saved on this phone" with the queue count, no retry button |
| Ranks, Clubs, the chat, friends, profiles | A plain offline state, not an error ("You're offline. This needs a connection."), and the last loaded copy where there is one |
| Share | The picture still works (it's made on the phone); the link is kept for later |
| Sign-in and sign-up | Disabled with the reason |
| First launch offline | Play as an offline guest (no session); the account step waits for the network |

### 2.3 Steps
1. `expo-network` and one `useOnline()` hook; the offline strip on native too.
2. The queue, the unique run id, the flush triggers.
3. Each online-only screen's offline state.

**Done when.** A `verify-run-queue.ts` script fakes a failing insert and checks that the run is queued, flushed once on success, never twice when the first attempt actually reached the server, and keeps its played-at time. **Maintainer checks:** airplane mode, finish a run, close the app, reopen online, find the run in Runs.
