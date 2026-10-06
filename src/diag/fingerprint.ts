// Phase 9, Diagnostics step 3 (docs/diagnostics/04-CHECKS.md §2): the engine
// fingerprint, and the synthetic matches the self-test runs.
//
// A saved run stores seeds, not sheets, and every sheet is rebuilt from its
// seed when it opens. That only works if the same code gives the same numbers
// on every engine it runs on. match-detail.ts leans on Math.exp/log/pow/sqrt,
// which the spec lets Hermes (the phone) and V8 (the web) round differently in
// the last bit; usually it vanishes, now and then it tips a 6.849 to a 6.851.
// So: 50 fixed synthetic matches, each sheet and Deep Match timeline hashed
// twice (every number at full precision, and as the screens show it), compared
// with src/diag/golden.ts, which Node writes (scripts/diag-golden.ts).
//
// Covered: the seeded layer (scorers, the sheet, the lineups, the timeline).
// Not covered: simulateMatch, which rolls results with Math.random; results are
// decided once and stored, so they don't need to replay.
//
// No RN, no database: the squads are made here from the seed, so a data
// rebuild never moves the fingerprint.
import { mulberry32 } from '@/lib/rng'
import { attributeMatchScorers } from '@/engine/stats'
import { generateMatchDetail, type MatchDetailInput } from '@/engine/match-detail'
import { buildDeepMatchTimeline } from '@/engine/deep-match'
import { ENGINE_VERSION } from '@/engine/version'
import type { RosterPlayer, MatchScorers } from '@/types/stats'

const XI = ['GK', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST']
const BENCH = ['GK', 'CB', 'CM', 'RW', 'ST']

/** A synthetic squad: an XI and five on the bench, rated around `base`. The self-test's benchmarks use it too. */
export function squad(clubId: string, base: number, rng: () => number): RosterPlayer[] {
  const mk = (pos: string, i: number, isBench: boolean): RosterPlayer => {
    const ovr = Math.round(base + (rng() - 0.5) * 10 - (isBench ? 4 : 0))
    const atkBias = pos === 'ST' || pos === 'LW' || pos === 'RW' ? 8 : pos === 'CAM' ? 5 : pos === 'CB' || pos === 'GK' ? -12 : -3
    return {
      playerId: `${clubId}-p${i}${isBench ? 'b' : ''}`, name: `${clubId} ${pos}${i}`, primaryPosition: pos,
      attack: Math.max(30, ovr + atkBias + Math.round((rng() - 0.5) * 6)), ovr, isBench: isBench || undefined,
      birthYear: 1995, yearStart: 2024, seasonLabel: '24/25', clubId, clubName: `Club ${clubId}`,
    }
  }
  return [...XI.map((p, i) => mk(p, i, false)), ...BENCH.map((p, i) => mk(p, 100 + i, true))]
}

export type SyntheticMatch = MatchDetailInput & { scorers: MatchScorers }

/**
 * One match, wholly from its seed: squads, score, scorers. The same seed gives
 * the same match on any device, so a violation the self-test finds on a phone
 * replays anywhere (`npx tsx scripts/verify-diag-golden.ts --replay <seed>`).
 */
export function syntheticMatch(seed: number): SyntheticMatch {
  const rng = mulberry32(seed)
  const homeOvr = 70 + Math.floor(rng() * 20), awayOvr = 70 + Math.floor(rng() * 20)
  const homePool = squad('H', homeOvr, rng), awayPool = squad('A', awayOvr, rng)
  // Goals weighted toward the usual 0–3, with the odd big score.
  const goals = () => { const r = rng(); return r < 0.25 ? 0 : r < 0.55 ? 1 : r < 0.8 ? 2 : r < 0.93 ? 3 : 4 + Math.floor(rng() * 3) }
  const homeGoals = goals(), awayGoals = goals()
  const extraTime = rng() < 0.2
  const scorers = attributeMatchScorers(homePool, awayPool, homeGoals, awayGoals, { rng: mulberry32(seed), lineups: { seed, benchSize: 9 } })
  return { seed, homePool, awayPool, homeGoals, awayGoals, scorers, extraTime, benchSize: 9 }
}

/** FNV-1a, 32 bits: a few lines, no dependency, plenty for 50 comparisons. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
}

/** A value the way the screens show it: ratings to one decimal, xG to two, everything else whole. */
export function shownOf(v: unknown, key = ''): unknown {
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return v
    if (/rating/i.test(key)) return Math.round(v * 10) / 10
    if (/^xg/i.test(key)) return Math.round(v * 100) / 100
    return Math.round(v)
  }
  if (Array.isArray(v)) return v.map(x => shownOf(x, key))
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) o[k] = shownOf(x, k)
    return o
  }
  return v
}

export const FINGERPRINT_SEEDS = 50
export const NAMED_SHEETS = 3   // seeds whose whole shown sheet is kept, so a mismatch can name a field

export type SeedPrint = { raw: number; shown: number; sheet: unknown }
export function fingerprintSeed(seed: number): SeedPrint {
  const input = syntheticMatch(seed)
  const d = generateMatchDetail(input)
  if (!d) return { raw: 0, shown: 0, sheet: null }
  const frames = buildDeepMatchTimeline(d, seed).frames
  const sheet = shownOf(d)
  return { raw: fnv1a(JSON.stringify({ d, frames })), shown: fnv1a(JSON.stringify({ d: sheet, frames: shownOf(frames) })), sheet }
}

export type Fingerprint = { engine: number; raw: number[]; shown: number[]; sheets: unknown[] }
export function computeFingerprint(): Fingerprint {
  const fp: Fingerprint = { engine: ENGINE_VERSION, raw: [], shown: [], sheets: [] }
  for (let seed = 1; seed <= FINGERPRINT_SEEDS; seed++) addSeed(fp, seed, fingerprintSeed(seed))
  return fp
}
export function addSeed(fp: Fingerprint, seed: number, p: SeedPrint): void {
  fp.raw.push(p.raw); fp.shown.push(p.shown)
  if (seed <= NAMED_SHEETS) fp.sheets.push(p.sheet)
}

/** The first place two values differ, as a path: `players[7].rating 6.8 ≠ 6.9`. */
export function firstDiff(a: unknown, b: unknown, path = ''): string | null {
  if (a === b) return null
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)])
    for (const k of keys) {
      const sub = firstDiff((a as any)[k], (b as any)[k], Array.isArray(a) ? `${path}[${k}]` : path ? `${path}.${k}` : k)
      if (sub) return sub
    }
    return null
  }
  return `${path || '(root)'} ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`
}

export type FingerprintStatus = 'MATCH' | 'RAW DIFFERS' | 'SHOWN DIFFERS' | 'STALE'
/** 04 §2.4: STALE when the golden file is from another engine version, then shown, then raw. */
export function compareFingerprint(now: Fingerprint, golden: Fingerprint): { status: FingerprintStatus; detail?: string } {
  if (now.engine !== golden.engine) return { status: 'STALE', detail: `golden is engine ${golden.engine}, this build is ${now.engine}` }
  const shownAt = now.shown.findIndex((h, i) => h !== golden.shown[i])
  if (shownAt >= 0) {
    const field = shownAt < NAMED_SHEETS ? firstDiff(now.sheets[shownAt], golden.sheets[shownAt]) : null
    return { status: 'SHOWN DIFFERS', detail: `seed ${shownAt + 1}${field ? ` · ${field}` : ''}` }
  }
  const rawAt = now.raw.findIndex((h, i) => h !== golden.raw[i])
  if (rawAt >= 0) return { status: 'RAW DIFFERS', detail: `seed ${rawAt + 1}` }
  return { status: 'MATCH' }
}
