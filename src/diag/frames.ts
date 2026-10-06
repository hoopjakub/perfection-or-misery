// Phase 9, Diagnostics step 2 (docs/diagnostics/03-BUDGETS.md §2.5): the
// frame budgets, one key per scene, judged on p95 of the gap between frames.
//
// Two threads, two samplers. The Deep Match's clock and the ceremony are
// driven from JS, so a requestAnimationFrame loop there says when JS can't
// keep up. The globes (P8-164) and the bracket's pinch run on Reanimated's UI
// thread and never touch JS, so a JS loop would measure the wrong thread:
// useFrameCallback runs on the UI thread, collects the gaps there, and sends
// them across only every 30 frames (crossing on every frame would cause the
// jank it's measuring).
import { useEffect, useCallback } from 'react'
import { useFrameCallback, useSharedValue, runOnJS } from 'react-native-reanimated'
import { frame, frameReset, sample } from './perf'

/** Frames on the JS thread while `active`. */
export function useFrameSampler(key: string, active = true): void {
  useEffect(() => {
    if (!active || typeof requestAnimationFrame === 'undefined') return
    let id = 0
    const tick = () => { frame(key); id = requestAnimationFrame(tick) }
    id = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(id); frameReset(key) }
  }, [key, active])
}

const FLUSH = 30

/** Frames on the UI thread while `active` (a frame callback keeps the loop running, so keep it off when idle). */
export function useUiFrameSampler(key: string, active = true): void {
  const buf = useSharedValue<number[]>([])
  const flush = useCallback((gaps: number[]) => { for (const g of gaps) sample(key, g) }, [key])
  const cb = useFrameCallback(info => {
    'worklet'
    const gap = info.timeSincePreviousFrame
    if (gap == null) return
    const next = buf.value.concat(gap)
    if (next.length >= FLUSH) { runOnJS(flush)(next); buf.value = [] } else buf.value = next
  }, false)
  useEffect(() => {
    cb.setActive(active)
    // Off: send what's collected, so a short gesture still counts.
    return () => { cb.setActive(false); if (buf.value.length) { flush(buf.value); buf.value = [] } }
  }, [active])
}
