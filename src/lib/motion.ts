import { withDelay, withSpring, withTiming } from 'react-native-reanimated'

// Motion tokens (docs/ui-overhaul/06-MOTION.md §3). Reanimated 4 springs take
// `duration` (≈ time to settle) and `dampingRatio` (1 = no bounce). The zip
// tag's swing is the only overshoot in the app.
export const spring = {
  snap:   { duration: 300, dampingRatio: 1 },    // presses, toggles, the tab tape
  settle: { duration: 450, dampingRatio: 1 },    // route moves, a tag flying home
  throw:  { duration: 400, dampingRatio: 0.85 }, // released from a gesture
  stamp:  { duration: 250, dampingRatio: 0.9 },  // a label landing from oversize
  swing:  { duration: 600, dampingRatio: 0.55 }, // the zip tag. Nothing else.
  // A verdict read out (P8-35 feedback: the 250ms stamp felt too fast for an
  // award). Slower and dead — no bounce, because a statement doesn't wobble.
  verdict: { duration: 700, dampingRatio: 1 },
} as const

export const STAGGER_MS = 40
export const STAGGER_CAP_MS = 400

/** Delay for the i-th item of a staggered list, capped (§3.3). */
export const staggerDelay = (i: number, step = STAGGER_MS) => Math.min(i * step, STAGGER_CAP_MS)

/**
 * An entrance that STAMPS rather than fades (06-MOTION §3, "stamps, not fades",
 * P8-35): the element arrives oversize and lands on `spring.stamp`, with its
 * opacity cut in fast so there's no drift. For verdict-like moments — an award
 * read out, a label landing. Pass it as a Reanimated `entering`.
 */
export const stampIn = (from = 1.15, land: { duration: number; dampingRatio: number } = spring.stamp, fadeMs = 90, delayMs = 0) => () => {
  'worklet'
  return {
    initialValues: { opacity: 0, transform: [{ scale: from }] },
    animations: {
      opacity: withDelay(delayMs, withTiming(1, { duration: fadeMs })),
      transform: [{ scale: withDelay(delayMs, withSpring(1, land)) }],
    },
  }
}

/** The heavy version, for a verdict: a held breath, then it comes down from
 *  half as big again and lands slowly. Awards Night reads each award with it. */
export const verdictIn = () => stampIn(1.5, spring.verdict, 260, 200)
