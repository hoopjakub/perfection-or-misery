import { useEffect, useRef, useState } from 'react'
import { SPEED_MS, type Speed } from '@/data/speed'

/**
 * A table or group stage's matchday loop (centralisation step 4b): wait the
 * speed's beat, play the next matchday, and when your match is in it at Slow
 * or Normal, hold everything until it has played out live (F-09, decision D2).
 * Fast skips your match to its card, including when you switch to Fast while
 * it plays. The league season, the league phase and the full path's two
 * stages each had this timer, this hold and this skip written out.
 *
 * `step` plays one matchday and returns that matchday when your match in it
 * should play live (null otherwise). It's always the latest one the screen
 * rendered, so the timer can't play a matchday from an older state.
 */
export function useStageLoop(o: {
  /** The stage is playing (its phase, and you've pressed play). */
  running: boolean
  speed: Speed
  step: () => number | null
  /** Re-arms the timer when it changes: the matchday counter. */
  tick: unknown
  /** Your live match has finished, or Fast skipped it. */
  onLiveDone?: (md: number) => void
}) {
  const [liveMD, setLiveMD] = useState<number | null>(null)
  const stepRef = useRef(o.step)
  stepRef.current = o.step
  const doneRef = useRef(o.onLiveDone)
  doneRef.current = o.onLiveDone
  useEffect(() => {
    if (!o.running || liveMD != null) return
    const timer = setTimeout(() => { const live = stepRef.current(); if (live != null) setLiveMD(live) }, SPEED_MS[o.speed])
    return () => clearTimeout(timer)
  }, [o.running, liveMD, o.speed, o.tick])
  const liveDone = () => {
    const md = liveMD
    setLiveMD(null)
    if (md != null) doneRef.current?.(md)
  }
  useEffect(() => { if (o.speed === 'fast' && liveMD != null) liveDone() }, [o.speed, liveMD])
  return { liveMD, liveDone, clearLive: () => setLiveMD(null) }
}

/** Whether your match in a matchday plays live: at Slow and Normal, not Fast. */
export const playsLive = (yours: boolean, speed: Speed) => yours && speed !== 'fast'
