// Phase 9 · loading you can see (the maintainer, 19 Sept 2026): "once loading
// finishes, the content still waits a random 0.5–1 s before it appears, so each
// arrival feels deliberate rather than abrupt … screens that load, not plain
// taps … the real load times still get measured, so the wait never hides a
// slow load."
//
// Read as a FLOOR, not an extra wait: the content appears no sooner than a
// random 0.5–1 s after the load began. A load that already took longer isn't
// padded at all (so the pause never hides or worsens a slow one), and the real
// time is what net:* and the log record, measured before this. Only a
// screen's first load: a refresh after an action is a tap's answer, not an
// arrival.
import { useCallback, useRef } from 'react'

export async function settled<T>(p: Promise<T>): Promise<T> {
  const start = Date.now()
  const floor = 500 + Math.random() * 500
  const value = await p
  const left = floor - (Date.now() - start)
  if (left > 0) await new Promise(r => setTimeout(r, left))
  return value
}

/** `settled` for a screen's first load only; every later call passes straight through. */
export function useSettledOnce() {
  const first = useRef(true)
  return useCallback(<T,>(p: Promise<T>): Promise<T> => {
    if (!first.current) return p
    first.current = false
    return settled(p)
  }, [])
}
