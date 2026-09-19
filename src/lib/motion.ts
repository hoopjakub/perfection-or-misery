// Motion tokens (docs/ui-overhaul/06-MOTION.md §3). Reanimated 4 springs take
// `duration` (≈ time to settle) and `dampingRatio` (1 = no bounce). The zip
// tag's swing is the only overshoot in the app.
export const spring = {
  snap:   { duration: 300, dampingRatio: 1 },    // presses, toggles, the tab tape
  settle: { duration: 450, dampingRatio: 1 },    // route moves, a tag flying home
  throw:  { duration: 400, dampingRatio: 0.85 }, // released from a gesture
  stamp:  { duration: 250, dampingRatio: 0.9 },  // a label landing from oversize
  swing:  { duration: 600, dampingRatio: 0.55 }, // the zip tag. Nothing else.
} as const

export const STAGGER_MS = 40
export const STAGGER_CAP_MS = 400

/** Delay for the i-th item of a staggered list, capped (§3.3). */
export const staggerDelay = (i: number, step = STAGGER_MS) => Math.min(i * step, STAGGER_CAP_MS)
