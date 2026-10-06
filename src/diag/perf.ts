// Phase 9, Diagnostics step 1 (docs/diagnostics/02-POM-ARCHITECTURE.md §3):
// the recorder. The Dugout's shape: a ring of the last 256 samples per key,
// with count, last, min, max and total kept over all of them, and p50/p95
// worked out only when someone asks (a report, the screen). Recording costs
// a clock read and two array writes, so it can stay on in release builds,
// which is the point: the numbers worth having come from the slow phone.
// No React, no RN, so scripts can use it.
import { budgetSpec } from './budgets'

const RING = 256

type Series = { ring: Float64Array; count: number; last: number; min: number; max: number; total: number }
const series = new Map<string, Series>()

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

// While the self-test runs, the game's own keys are left alone: its 200 match
// sheets would otherwise land in detail:generate and its busy loops in
// stall:js (04-CHECKS §1). Only bench:* is written then.
let quiet = 0
export async function selfTestScope<T>(fn: () => Promise<T>): Promise<T> {
  quiet++
  try { return await fn() } finally { quiet-- }
}
export const inSelfTest = () => quiet > 0

// Who hears each sample (src/diag/install.ts writes the perf log lines). Kept
// as a hook so this file stays free of the log and of React Native.
let listener: ((key: string, value: number) => void) | null = null
export const setSampleListener = (fn: typeof listener) => { listener = fn }

export function sample(key: string, value: number): void {
  if (quiet && !key.startsWith('bench:')) return
  listener?.(key, value)
  let s = series.get(key)
  if (!s) { s = { ring: new Float64Array(RING), count: 0, last: 0, min: Infinity, max: -Infinity, total: 0 }; series.set(key, s) }
  s.ring[s.count % RING] = value
  s.count++
  s.last = value
  if (value < s.min) s.min = value
  if (value > s.max) s.max = value
  s.total += value
}

// Background time isn't a performance number (02 §3.2): a span that crossed a
// trip to the background (a phone in a pocket mid-save) is dropped, not kept.
// src/diag/watch.ts bumps this when the app leaves the foreground.
let epoch = 0
export function wentBackground(): void { epoch++ }

// The keys whose work is running right now, innermost last: a stall can then
// say what it happened during (02 §3.3), not just that it happened.
const open: string[] = []
/** The innermost timed operation still running, for the stall detector. */
export const openKey = (): string | undefined => open[open.length - 1]

/** Time a synchronous piece of work. Rethrows, so an error still reaches its caller. */
export function time<T>(key: string, fn: () => T): T {
  const t0 = now()
  open.push(key)
  try { return fn() } finally { open.pop(); sample(key, now() - t0) }
}

const nextFrame = (fn: () => void) => (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(fn) : setTimeout(fn, 0))

/**
 * Work the player waits to SEE (a matchday, a skip): from now until the first
 * frame after it, since the state it sets is only on screen then (03 §2.3).
 */
export function timeToFrame<T>(key: string, fn: () => T): T {
  const t0 = now(), e = epoch
  open.push(key)
  try { return fn() } finally { open.pop(); nextFrame(() => { if (e === epoch) sample(key, now() - t0) }) }
}

export async function timeAsync<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const t0 = now(), e = epoch
  open.push(key)
  // ponytail: two async operations interleaving pop each other's key; the
  // attribution is a hint, not a record. A per-call token if it ever misleads.
  try { return await fn() } finally { open.splice(open.lastIndexOf(key), 1); if (e === epoch) sample(key, now() - t0) }
}

// Spans that start in one place and end in another (a tap, then the next
// screen's first frame). The Dugout's lesson: a mark alone measures nothing.
const marks = new Map<string, { t: number; e: number }>()
export function mark(name: string): void { marks.set(name, { t: now(), e: epoch }) }
/**
 * Record the time since mark `from`, once (the mark is used up). Nothing if it
 * was never marked, crossed a trip to the background, or is older than
 * `withinMs` (a tap two minutes before a screen change didn't cause it).
 */
export function measure(key: string, from: string, withinMs = Infinity): number | undefined {
  const m = marks.get(from)
  if (!m) return undefined
  marks.delete(from)
  const ms = now() - m.t
  if (m.e !== epoch || ms > withinMs) return undefined
  sample(key, ms)
  return ms
}

// Frames: one key per scene, so two animations can't write each other's gaps.
const lastFrame = new Map<string, number>()
export function frame(key: string): void {
  const t = now()
  const prev = lastFrame.get(key)
  lastFrame.set(key, t)
  if (prev !== undefined) sample(key, t - prev)
}
/** On unmount: or the first frame back would record the whole time away. */
export function frameReset(key: string): void { lastFrame.delete(key) }

export type Status = 'UNMEASURED' | 'OK' | 'WARN' | 'FAIL'
export type Reading = { key: string; n: number; count: number; last: number; min: number; max: number; mean: number; p50: number; p95: number; status: Status }

function pct(sorted: number[], p: number): number {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0
}

/** One key's numbers. `n` is how many the percentiles cover (at most 256), `count` all ever. */
export function reading(key: string): Reading {
  const s = series.get(key)
  if (!s) return { key, n: 0, count: 0, last: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, status: 'UNMEASURED' }
  const n = Math.min(s.count, RING)
  const sorted = Array.from(s.ring.subarray(0, n)).sort((a, b) => a - b)
  const p95 = pct(sorted, 0.95)
  const spec = budgetSpec(key)
  // Judged on p95 once there are five samples; on the last one before that.
  const judged = s.count >= 5 ? p95 : s.last
  const status: Status = !spec ? 'OK' : judged > spec.hardFail ? 'FAIL' : judged > spec.target ? 'WARN' : 'OK'
  return { key, n, count: s.count, last: s.last, min: s.min, max: s.max, mean: s.total / s.count, p50: pct(sorted, 0.5), p95, status }
}

export const recordedKeys = (): string[] => [...series.keys()]

/** Everything recorded so far, worst first. */
export function readings(): Reading[] {
  const rank: Record<Status, number> = { FAIL: 0, WARN: 1, OK: 2, UNMEASURED: 3 }
  return recordedKeys().map(reading).sort((a, b) => rank[a.status] - rank[b.status] || a.key.localeCompare(b.key))
}

/** For tests and the self-test's own runs. */
export function resetPerf(): void { series.clear(); marks.clear(); lastFrame.clear(); open.length = 0 }

// On the web, readable from the console and from browser scripts later
// (02 §1): `pomPerf.readings()`.
if (typeof window !== 'undefined') (globalThis as any).pomPerf = { readings, reading }
