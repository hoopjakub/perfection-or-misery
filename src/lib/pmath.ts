// Phase 9.75 (P9.75-18) · Portable maths: the same bits in every JS engine.
//
// The engine's seeded layer (match sheets, the Deep Match, the shot map, the
// pundits' tournaments) called Math.pow, exp, sin, tanh, atan2 and hypot, about
// 2,700 times a sheet. The standard leaves those functions approximate, and V8
// (the web, Node, the golden fingerprint) and Hermes (the phone) each bring
// their own: a last-bit difference flips a comparison now and then, the random
// draws go another way, and the phone's self-test found a whole field changed
// (seed 1: home yellow cards 2 against 0). A run saved on one device read
// differently on the other.
//
// These are written with + - * / only, plus Math.round, Math.abs and
// Math.sqrt, which IEEE 754 defines exactly, so every engine computes the same
// result step by step. Accurate to about 1e-15 relative over the ranges the
// engine uses (scripts/verify-pmath.ts measures it against Math). The engine
// calls nothing else (verify-diag rule 2h).
// No React, no RN: scripts use it headless.

const LN2_HI = 6.93147180369123816490e-01
const LN2_LO = 1.90821492927058770002e-10
const INV_LN2 = 1.44269504088896338700e+00
const PIO2_HI = 1.57079632673412561417e+00
const PIO2_LO = 6.07710050650619224932e-11
const TWO_OVER_PI = 6.36619772367581382433e-01
const SQRT3 = Math.sqrt(3)

/** 2^k for an integer k, by doubling or halving: exact. */
function pow2i(k: number): number {
  let r = 1
  const b = k < 0 ? 0.5 : 2
  for (let i = Math.abs(k); i > 0; i--) r *= b
  return r
}

/** e^x. Range-reduced by ln 2, then a Taylor series to r^14 (|r| ≤ 0.35). */
export function pexp(x: number): number {
  if (x !== x) return NaN
  if (x > 709.78) return Infinity
  if (x < -745.2) return 0
  const k = Math.round(x * INV_LN2)
  const r = (x - k * LN2_HI) - k * LN2_LO
  let p = 1
  for (let n = 16; n >= 1; n--) p = 1 + (r / n) * p
  return p * pow2i(k)
}

/** ln x. x = m·2^e with m in [√½, √2), then 2·atanh((m−1)/(m+1)). */
export function plog(x: number): number {
  if (x !== x || x < 0) return NaN
  if (x === 0) return -Infinity
  if (x === Infinity) return Infinity
  let m = x, e = 0
  while (m >= 1.4142135623730951) { m /= 2; e++ }
  while (m < 0.7071067811865476) { m *= 2; e-- }
  const s = (m - 1) / (m + 1), s2 = s * s
  let q = 0
  for (let k = 16; k >= 0; k--) q = 1 / (2 * k + 1) + s2 * q
  return e * LN2_HI + (e * LN2_LO + 2 * s * q)
}

/** x^y. Small integer powers by multiplication; the rest through exp and log. */
export function ppow(x: number, y: number): number {
  if (y === 0) return 1
  if (Number.isInteger(y) && Math.abs(y) <= 64) {
    let r = 1, b = x, n = Math.abs(y)
    while (n > 0) { if (n % 2 === 1) r *= b; b *= b; n = Math.floor(n / 2) }
    return y < 0 ? 1 / r : r
  }
  if (x === 0) return y > 0 ? 0 : Infinity
  if (x < 0) return NaN
  return pexp(y * plog(x))
}

function sinPoly(r: number): number {
  const r2 = r * r
  let p = 1
  for (let n = 21; n >= 3; n -= 2) p = 1 - (r2 / (n * (n - 1))) * p
  return r * p
}
function cosPoly(r: number): number {
  const r2 = r * r
  let p = 1
  for (let n = 20; n >= 2; n -= 2) p = 1 - (r2 / (n * (n - 1))) * p
  return p
}

/** sin x. Reduced by π/2 (Cody–Waite), then the quadrant's series. */
export function psin(x: number): number {
  if (!isFinite(x)) return NaN
  const k = Math.round(x * TWO_OVER_PI)
  const r = (x - k * PIO2_HI) - k * PIO2_LO
  const q = ((k % 4) + 4) % 4
  return q === 0 ? sinPoly(r) : q === 1 ? cosPoly(r) : q === 2 ? -sinPoly(r) : -cosPoly(r)
}

/** tanh x, from exp. */
export function ptanh(x: number): number {
  if (x > 22) return 1
  if (x < -22) return -1
  const e = pexp(2 * x)
  return (e - 1) / (e + 1)
}

/** atan for |t| ≤ 2−√3, by its series. */
function atanSmall(t: number): number {
  const t2 = t * t
  let q = 0
  for (let k = 18; k >= 0; k--) q = (k % 2 === 0 ? 1 : -1) / (2 * k + 1) + t2 * q
  return t * q
}
/** atan z, reduced to |t| ≤ 2−√3 through 1/z and the π/6 identity. */
export function patan(z: number): number {
  if (z !== z) return NaN
  const neg = z < 0
  let a = Math.abs(z), base = 0, flip = false
  if (a > 1) { a = 1 / a; flip = true }
  if (a > 0.2679491924311227) { base = Math.PI / 6; a = (a * SQRT3 - 1) / (a + SQRT3) }
  let r = base + atanSmall(a)
  if (flip) r = Math.PI / 2 - r
  return neg ? -r : r
}

/** atan2(y, x), the angle of (x, y). */
export function patan2(y: number, x: number): number {
  if (x > 0) return patan(y / x)
  if (x < 0) return y >= 0 ? patan(y / x) + Math.PI : patan(y / x) - Math.PI
  return y > 0 ? Math.PI / 2 : y < 0 ? -Math.PI / 2 : 0
}

/** √(a² + b²). sqrt is exact in IEEE 754; Math.hypot isn't specified to be. */
export const phypot = (a: number, b: number): number => Math.sqrt(a * a + b * b)

/**
 * Two ids in a fixed order, by code unit. localeCompare follows the engine's
 * locale data, which V8 and Hermes don't share, and it's slow on Hermes: the
 * engine's tie-breaks (standings, awards, the press) use this instead, the
 * same order everywhere (Phase 9.75).
 */
export const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
