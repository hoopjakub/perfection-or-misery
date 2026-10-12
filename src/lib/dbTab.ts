// The game open in two browser tabs (the PC sweep, 11 Oct 2026). The web's
// database runs in expo-sqlite's worker, whose file storage (OPFS) one tab at a
// time may hold: a second tab's open failed with "Access Handles cannot be
// created if there is another open Access Handle", every run in that tab then
// failed without a word, and the failure was cached so it never tried again.
//
// Now a tab takes a Web Lock before it opens the database and keeps it for as
// long as it lives. A second tab finds the lock taken, says so (the strip at
// the top, OfflineStrip), waits, and opens the database by itself the moment
// the first tab closes. Browsers without Web Locks open straight away, as before.
import { create } from 'zustand'

/** True while another tab has the game's database and this one is waiting for it. */
export const useDbElsewhere = create<{ waiting: boolean }>(() => ({ waiting: false }))

const LOCK = 'perfection-or-misery-db'
let held: Promise<void> | null = null

/** Resolves once this tab holds the lock (at once if nobody else has it). */
export function holdDbLock(): Promise<void> {
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined
  if (!locks) return Promise.resolve()
  held ??= new Promise<void>(resolve => {
    // Kept until the tab closes: the callback's promise never settles.
    const keep = () => { useDbElsewhere.setState({ waiting: false }); resolve(); return new Promise<void>(() => {}) }
    locks.request(LOCK, { ifAvailable: true }, lock => {
      if (lock) return keep()
      useDbElsewhere.setState({ waiting: true })
      void locks.request(LOCK, keep)
      return undefined
    })
  })
  return held
}
