import { useCallback, useEffect, useRef, useState } from 'react'
import { log, noteSave } from '@/diag/log'
import { useUserStore } from '@/store/userStore'
import { useGameStore } from '@/store/gameStore'
import { useSettingsStore } from '@/store/settingsStore'
import { announceNewAchievements } from '@/lib/achievementToast'
import { RunQueuedError } from '@/db/queries/runs'

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
  | 'queued'   // P8.5-24: no connection; kept on the phone, goes up when it's back
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
      () => {
        setStatus('saved')
        // P8.5-36: anything this run earned pops up.
        const id = useUserStore.getState().user?.id
        if (id) announceNewAchievements(id)
      },
      (e) => {
        // P8.5-24: saved on the phone instead, not lost. It stays "in flight"
        // so leaving the screen doesn't try again: the queue sends it.
        if (e instanceof RunQueuedError) { setStatus('queued'); return }
        log.warn('save', 'run-save: failed', e)
        inflight.current = null
        setStatus('failed')
      },
    )
    inflight.current = p
    return p
  }, [applies, signedIn])

  // Phase 9: the save ledger says whether this run was saved (04-CHECKS §6).
  useEffect(() => {
    if (status === 'waiting') return
    noteSave('run', status === 'off' ? 'skipped · tester or a saved run' : status === 'guest' ? 'skipped · guest' : status === 'failed' ? 'failed' : status)
  }, [status])

  // A queued run that the queue has since sent: its id lands on the store.
  const savedRunId = useGameStore(s => s.savedRunId)
  useEffect(() => {
    if (status === 'queued' && savedRunId) {
      setStatus('saved')
      const id = useUserStore.getState().user?.id
      if (id) announceNewAchievements(id)
    }
  }, [status, savedRunId])

  // The guest/off status can change after mount (the auth listener resolves a
  // moment later), so keep the idle label in step until a save has begun.
  useEffect(() => {
    if (inflight.current) return
    setStatus(s => (s === 'saved' || s === 'failed' || s === 'queued') ? s : !applies ? 'off' : !signedIn ? 'guest' : 'waiting')
  }, [applies, signedIn])

  // A finished run is "last time" from here on, for guests and accounts alike.
  useEffect(() => {
    if (!applies) return
    const { mode, difficulty } = useGameStore.getState()
    if (mode) useSettingsStore.getState().setLastRun({ mode, difficulty: difficulty ?? null })
  }, [applies])

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
