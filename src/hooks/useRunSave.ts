import { useCallback, useEffect, useRef, useState } from 'react'
import { useUserStore } from '@/store/userStore'

// ── useRunSave ───────────────────────────────────────────────────────────────
// Every result screen used to save the run only when you pressed Play Again or
// Return to Home. Close the app (or refresh the tab) on the result screen and
// the run was simply gone — the most expensive way to lose a finished season.
//
// The save now fires on its own the moment the screen has everything it needs
// (`ready`: the run stats have finished computing, so the saved row carries
// them), and the exit buttons just wait for that same save instead of starting
// their own. One in-flight promise per screen means a double tap, both buttons,
// or the auto-save racing a button press can never insert the run twice.
//
// The screen hands its save function over with `setTask` on every render (it
// closes over the latest result/stats, and lives below the screen's early
// returns, so it can't be a hook dependency). The task must THROW on failure —
// that's what turns into the "failed · retry" state instead of a silent loss.

export type RunSaveStatus =
  | 'off'      // not a savable run: history view or the quick-sim tester
  | 'guest'    // playing without an account — nothing will be kept
  | 'waiting'  // savable, stats still computing
  | 'saving'
  | 'saved'
  | 'failed'

export function useRunSave({ applies, signedIn, ready }: {
  applies: boolean   // a fresh, real run (not history, not quick-sim)
  signedIn: boolean  // a real account, not a guest session
  ready: boolean     // everything the saved row should carry is computed
}) {
  const task = useRef<(() => Promise<void>) | null>(null)
  const inflight = useRef<Promise<void> | null>(null)
  const [status, setStatus] = useState<RunSaveStatus>(
    !applies ? 'off' : !signedIn ? 'guest' : 'waiting',
  )

  const start = useCallback((): Promise<void> => {
    if (!applies || !signedIn || !task.current) return Promise.resolve()
    // Saving or already saved → reuse, never insert twice. A failed attempt
    // cleared this, so a retry (or leaving the screen) tries once more.
    if (inflight.current) return inflight.current
    setStatus('saving')
    const p = task.current().then(
      () => setStatus('saved'),
      (e) => {
        console.warn('[run-save] failed:', e)
        inflight.current = null
        setStatus('failed')
      },
    )
    inflight.current = p
    return p
  }, [applies, signedIn])

  // The guest/off status can change after mount (the auth listener resolves a
  // moment later), so keep the idle label in step until a save has begun.
  useEffect(() => {
    if (inflight.current) return
    setStatus(s => (s === 'saved' || s === 'failed') ? s : !applies ? 'off' : !signedIn ? 'guest' : 'waiting')
  }, [applies, signedIn])

  useEffect(() => {
    if (applies && signedIn && ready) void start()
    if (applies && !signedIn) useUserStore.setState({ guestFinishedRun: true })
  }, [applies, signedIn, ready, start])

  return {
    status,
    setTask: (fn: () => Promise<void>) => { task.current = fn },
    /** Await before leaving the screen: reuses the save, or retries a failed one. */
    flush: start,
    retry: start,
  }
}
