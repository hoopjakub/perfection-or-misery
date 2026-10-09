import React, { useEffect, useRef, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import Svg, { Path, Rect, Circle } from 'react-native-svg'
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useBootReady } from '@/lib/bootReady'
import { log } from '@/diag/log'
import { prim } from '@/theme'
import { LOGO } from './logoParts'

// Phase 10, step 1a (the maintainer, 9 Oct 2026): the opening, "from the
// compact logo to the full logo, so it opens up", and the app's loading zone:
// "it must play always at least once, and if the app isn't yet ready it would
// do it once more (however not waiting for the animation to finish if the app
// is ready) … until it gets ready it would loop."
//
// The native splash shows the compact mark (the wordmark out, the gap closed:
// assets/splash-icon.png, drawn by scripts/brand-logo.cjs from the same paths
// as below) `SIZE` wide on nylon. This overlay mounts on the app's first frame
// with that exact picture, so the hand-off can't be seen. Then, one cycle:
//   hold        140 ms on the first cycle: still the splash
//   open        480 ms: the triangles part, 60 units each, back to their
//               places (the pin rides with the top one), the mark grows a little;
//               the wordmark unfolds out of the seam from 190 ms (scaleY from
//               the seam, like a label opened flat, not a fade)
//   hold        450 ms on the first cycle, 350 after: the full logo
//   then        ready (src/lib/bootReady.ts) → clear (220 ms) to the app;
//               not ready → fold back (the wordmark shuts, the triangles close)
//               and open again, until it is.
// The first cycle always plays to its hold. After that, the moment start-up is
// ready the overlay clears from wherever the loop is. A ceiling of 10 s clears
// it whatever happens, so a stuck start-up can't trap the player behind it.
// Reduced motion: the full logo, still, cleared when ready (at least 450 ms).
// Every launch, on the phone only: the web paints its static HTML first, and
// an overlay there would only delay it (Lighthouse). No tap-to-skip: it plays
// once by design. No haptics (the maintainer's rule).
const SIZE = 200                       // = expo-splash-screen's imageWidth (app.json; verify-brand)
const K = SIZE / LOGO.canvas           // logo units → points
const VB_Y = Number(LOGO.viewBox.split(' ')[1])
// Where the seam sits in the square, for the wordmark's transform origin.
const SEAM_PCT = `${((LOGO.seamY - VB_Y) / LOGO.canvas) * 100}%`
const GROW = 0.15
const OPEN_MS = 480, WORD_DELAY = 190, WORD_MS = 300
const HOLD_FIRST = 450, HOLD_LOOP = 350
const SHUT_MS = 200, CLOSE_DELAY = 100, CLOSE_MS = 340, REST_MS = 120
const CEILING_MS = 10_000

function Layer({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width={SIZE} height={SIZE} viewBox={LOGO.viewBox}>{children}</Svg>
    </Animated.View>
  )
}

export function LogoIntro() {
  const [show, setShow] = useState(() => Platform.OS !== 'web')
  const reduced = useReducedMotion()
  const ready = useBootReady(s => s.ready)
  const open = useSharedValue(reduced ? 1 : 0)   // the triangles: 0 compact, 1 in place
  const word = useSharedValue(reduced ? 1 : 0)   // the wordmark: 0 shut, 1 open
  const veil = useSharedValue(1)                 // the overlay itself
  const firstDone = useRef(false)
  const clearing = useRef(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const readyRef = useRef(ready)
  readyRef.current = ready

  const after = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)) }
  const finish = () => setShow(false)
  const clear = () => {
    if (clearing.current) return
    clearing.current = true
    timers.current.forEach(clearTimeout)
    veil.value = withTiming(0, { duration: 220 }, done => { if (done) runOnJS(finish)() })
  }

  // One cycle: open, hold, then clear or fold back and go again.
  const cycle = (first: boolean) => {
    if (clearing.current) return
    const t0 = first ? 140 : 0
    open.value = withDelay(t0, withTiming(1, { duration: OPEN_MS, easing: Easing.out(Easing.cubic) }))
    word.value = withDelay(t0 + WORD_DELAY, withTiming(1, { duration: WORD_MS, easing: Easing.out(Easing.cubic) }))
    after(t0 + WORD_DELAY + WORD_MS + (first ? HOLD_FIRST : HOLD_LOOP), () => {
      firstDone.current = true
      if (readyRef.current) { clear(); return }
      word.value = withTiming(0, { duration: SHUT_MS, easing: Easing.in(Easing.cubic) })
      open.value = withDelay(CLOSE_DELAY, withTiming(0, { duration: CLOSE_MS, easing: Easing.inOut(Easing.cubic) }))
      after(CLOSE_DELAY + CLOSE_MS + REST_MS, () => cycle(false))
    })
  }

  useEffect(() => {
    if (!show) return
    after(CEILING_MS, () => { log.warn('boot', `the opening logo cleared at its ${CEILING_MS / 1000} s ceiling: start-up wasn't ready`); clear() })
    if (reduced) after(HOLD_FIRST, () => { firstDone.current = true; if (readyRef.current) clear() })
    else cycle(true)
    return () => timers.current.forEach(clearTimeout)
  }, [])

  // Ready after the first cycle: clear now, from wherever the loop is.
  useEffect(() => { if (ready && firstDone.current) clear() }, [ready])

  const mark = useAnimatedStyle(() => ({ transform: [{ scale: 1 + GROW * open.value }] }))
  const top = useAnimatedStyle(() => ({ transform: [{ translateY: LOGO.shift * K * (1 - open.value) }] }))
  const bottom = useAnimatedStyle(() => ({ transform: [{ translateY: -LOGO.shift * K * (1 - open.value) }] }))
  const words = useAnimatedStyle(() => ({ opacity: Math.min(1, word.value * 4), transform: [{ scaleY: 0.02 + 0.98 * word.value }] }))
  const overlay = useAnimatedStyle(() => ({ opacity: veil.value }))

  if (!show) return null
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, overlay]} accessible accessibilityRole="image" accessibilityLabel="Perfection or Misery">
      <View style={styles.fill}>
        <Animated.View style={[styles.mark, mark]}>
          <Layer style={top}>
            <Rect {...LOGO.stick} fill={prim.orange} />
            <Circle {...LOGO.head} fill={prim.orange} />
            <Circle {...LOGO.hole} fill="black" />
            <Path d={LOGO.volt} fill={prim.volt} />
          </Layer>
          <Layer style={bottom}>
            <Path d={LOGO.red} fill={prim.misery} />
          </Layer>
          <Layer style={[words, { transformOrigin: `50% ${SEAM_PCT}` }]}>
            <Path d={LOGO.wordmark} fill="white" />
          </Layer>
        </Animated.View>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: prim.nylon, zIndex: 1000, elevation: 1000 },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mark: { width: SIZE, height: SIZE },
})
