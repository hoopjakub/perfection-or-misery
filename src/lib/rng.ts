// Deterministic seeded RNG (mulberry32) — powers the deep match-stat
// generator. Same seed → byte-identical output stream, on every platform,
// forever. See docs/"Next Up - Deep Match Stats & Ratings.md" §2/§7: matches
// persist a compact seed and regenerate their full stat sheet on open, so the
// generator MUST be fully deterministic.

export type Rng = () => number   // drop-in for Math.random: uniform [0, 1)

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A fresh random 32-bit seed (sim time only — never used during regeneration). */
export function randomSeed(): number {
  return (Math.random() * 4294967296) >>> 0
}

/** Derive an independent sub-stream from a base seed (avoids stream overlap). */
export function deriveSeed(seed: number, salt: number): number {
  let h = (seed ^ salt) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B)
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35)
  return (h ^ (h >>> 16)) >>> 0
}

/** Stable 32-bit hash of a string — a fallback seed for legacy matches saved
 *  before seeds existed (derived from match identity, so it never changes). */
export function hashSeed(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// ── Seeded distribution helpers ─────────────────────────────────────────────

export function rngInt(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1))
}

export function rngPoisson(rng: Rng, lambda: number): number {
  if (lambda <= 0) return 0
  const L = Math.exp(-lambda)
  let k = 0, p = 1
  do { k++; p *= rng() } while (p > L)
  return k - 1
}

/** Approx-normal via sum of 3 uniforms (cheap, bounded — fine for stat noise). */
export function rngNoise(rng: Rng): number {
  return (rng() + rng() + rng()) / 1.5 - 1   // roughly [-1, 1], centre-weighted
}

/** Weighted index pick. Returns -1 for an empty/all-zero pool. */
export function rngWeightedIndex(rng: Rng, weights: number[]): number {
  let total = 0
  for (const w of weights) total += Math.max(0, w)
  if (total <= 0) return -1
  let roll = rng() * total
  for (let i = 0; i < weights.length; i++) {
    roll -= Math.max(0, weights[i])
    if (roll <= 0) return i
  }
  return weights.length - 1
}

/** Split an integer `total` across recipients proportionally to `weights`,
 *  respecting per-recipient integer `minimums`, exactly summing to `total`
 *  (largest-remainder). Deterministic given the same inputs. */
export function distributeInt(
  total: number,
  weights: number[],
  minimums?: number[],
): number[] {
  const n = weights.length
  const mins = minimums ?? new Array(n).fill(0)
  const out = mins.slice()
  let remaining = total - out.reduce((a, b) => a + b, 0)
  if (remaining <= 0 || n === 0) return out

  const wSum = weights.reduce((a, b) => a + Math.max(0, b), 0)
  if (wSum <= 0) { out[0] += remaining; return out }

  const shares = weights.map(w => (Math.max(0, w) / wSum) * remaining)
  const floors = shares.map(Math.floor)
  let used = floors.reduce((a, b) => a + b, 0)
  for (let i = 0; i < n; i++) out[i] += floors[i]

  // hand out the leftover by largest fractional remainder (stable order)
  const rema = shares.map((s, i) => ({ i, frac: s - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (let k = 0; used < remaining; k++, used++) out[rema[k % n].i]++
  return out
}
