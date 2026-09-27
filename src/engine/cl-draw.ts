// P8-114: the Champions League league-phase draw, the real one.
//
// UEFA's rules (2024 onwards, the 2025–26 draw procedure; The Dugout keeps the
// papers in docs/reference/uefa): 36 clubs in four pots of nine, the title
// holders top of pot 1. Every club draws two opponents from EACH pot, one at
// home and one away, so eight matches, four home and four away. A club never
// meets one from its own association, and meets at most two from any other.
//
// Before this, each club's eight came from fixed offsets inside the pots (club
// i of pot 1 always hosted club i of pot 2), so it wasn't a draw at all, and
// two English clubs could meet.
//
// ── Why it searches, and why that's bounded AND fast ────────────────────────
// The format has no slack (The Dugout found this the hard way): pot 1's nine
// clubs have exactly 72 match slots, and the 36 clubs need exactly 72 pot-1
// opponents between them, so one wrong pairing anywhere can't be recovered
// later. A greedy pass essentially never finishes; The Dugout's greedy and
// most-constrained-first drafts both drew 0 of 20 fields. So this backtracks:
// it always fills the slot with the fewest legal opponents left, fails the
// moment any slot has none, and gives up after STEP_BUDGET steps.
//
// The Dugout's first draw was bounded and still froze the game for 160
// seconds, searching a field that was provably impossible. So before any
// search, a count says whether the country cap can hold at all (`minimumCap`),
// and each fallback is cheaper than the last. Measured by
// scripts/verify-draw.ts: the time per draw and how often a rule had to give.

import type { CLTeam } from './cl-sim'

export type DrawnFixture = { home: CLTeam; away: CLTeam }
/** Which rule had to give, if any: none; the at-most-two cap (raised as far
 *  as the field forces); or the country rule altogether. */
export type DrawRelaxed = 'none' | 'cap' | 'country'
export type LeaguePhaseDraw = { fixtures: DrawnFixture[]; relaxed: DrawRelaxed }

const PER_COUNTRY = 2
// Steps per attempt. A clean pass is 144 (one per match). Measured by
// verify-draw over hundreds of fields: 800 draws every field 4,000 did, in a
// tenth of the time (the slowest draw 88 ms, down from 830); at 400 it starts
// losing draws that exist and falls back to dropping the country rule.
const STEP_BUDGET = 800
const ATTEMPTS = 4

/**
 * The smallest per-country cap these pots can be drawn under, by counting (no
 * search); Infinity when not even dropping the cap would do, because a pot is
 * all one country.
 *
 * The count (a refinement of The Dugout's `minimumViableCap`): every club of
 * country c, in ANY pot, needs two opponents from pot P, none of them from c.
 * Those must be pot P's other clubs, and each of them can meet at most `cap`
 * clubs of c. So with K(c) clubs in the field and k clubs of c in pot P:
 *
 *     2·K(c) ≤ cap · (|P| − k)        for every pot P and country c
 *
 * At the real cap of two that's k + K(c) ≤ 9: a country with six clubs can
 * have at most three in any pot. That's why the real 2025–26 pot 1 had three
 * English clubs, and why every other pot-1 club had to draw two of them (the
 * count holds with nothing to spare). PoM's 2025 edition, potted by rating,
 * put four English clubs in pot 1 and could never be drawn. A draw failing
 * this can't be found however long you search, and searching it anyway is how
 * The Dugout's draw spent 160 seconds finding nothing.
 */
export function minimumCap(pots: number[][], countries: (string | undefined)[]): number {
  const total = new Map<string, number>()
  for (const c of countries) if (c) total.set(c, (total.get(c) ?? 0) + 1)
  let cap = PER_COUNTRY
  for (const p of pots) {
    const here = new Map<string, number>()
    for (const i of p) { const c = countries[i]; if (c) here.set(c, (here.get(c) ?? 0) + 1) }
    for (const [c, K] of total) {
      const others = p.length - (here.get(c) ?? 0)
      if (others <= 0) return Infinity
      cap = Math.max(cap, Math.ceil((2 * K) / others))
    }
  }
  return cap
}

/**
 * Make the pots drawable. PoM pots by rating (it has no club coefficients),
 * and rating can stack one country into a pot beyond what any draw can take:
 * the 2025 edition put five English clubs in pot 1, and five English clubs
 * can't each find two non-English opponents among the other four. UEFA's
 * coefficients happen to spread the big countries (its real pot 1 had three
 * English clubs). So where a pot breaks the count, the weakest club of the
 * crowded country swaps with the nearest-rated club of another country in the
 * next pot (the one above, from pot 4), until the pots pass. Pots stay by
 * rating as closely as the draw allows. Mutates `teams`' pots.
 */
export function balancePots(teams: CLTeam[], countryOf: (t: CLTeam) => string | undefined, pinned: Set<string> = new Set()): void {
  const countries = teams.map(countryOf)
  const potsNow = () => [1, 2, 3, 4].map(p => teams.map((t, i) => (t.pot === p ? i : -1)).filter(i => i >= 0))
  // Bounded: each swap moves a club one pot; a field needs a handful at most.
  for (let guard = 0; guard < teams.length; guard++) {
    const pots = potsNow()
    const bad = crowded(pots, countries)
    if (!bad) return
    const { pot, country } = bad
    const to = pot < pots.length - 1 ? pot + 1 : pot - 1
    // The holders never move: they're the top seed of pot 1 by rule.
    const mine = pots[pot].filter(i => countries[i] === country && !pinned.has(teams[i].clubId)).sort((x, y) => teams[x].ovr - teams[y].ovr)
    const x = to > pot ? mine[0] : mine[mine.length - 1]   // down: the weakest; up: the strongest
    const others = pots[to].filter(i => countries[i] !== country && !pinned.has(teams[i].clubId))
    if (x === undefined || others.length === 0) return
    const y = others.reduce((best, i) => Math.abs(teams[i].ovr - teams[x].ovr) < Math.abs(teams[best].ovr - teams[x].ovr) ? i : best)
    const px = teams[x].pot
    teams[x].pot = teams[y].pot
    teams[y].pot = px
  }
}

// The (pot, country) most over the cap-two count, if any: k + K(c) > |P|.
function crowded(pots: number[][], countries: (string | undefined)[]): { pot: number; country: string } | null {
  const total = new Map<string, number>()
  for (const c of countries) if (c) total.set(c, (total.get(c) ?? 0) + 1)
  let worst: { pot: number; country: string; over: number } | null = null
  pots.forEach((p, pot) => {
    const here = new Map<string, number>()
    for (const i of p) { const c = countries[i]; if (c) here.set(c, (here.get(c) ?? 0) + 1) }
    for (const [c, k] of here) {
      const over = k + total.get(c)! - p.length
      if (over > 0 && (!worst || over > worst.over)) worst = { pot, country: c, over }
    }
  })
  return worst
}

/**
 * Draw the eight opponents of every club. `teams` carry their pot already
 * (buildCLTeams); `countryOf` says each club's association (undefined = not
 * known, and then no country rule applies to it). Null when the field can't
 * take the format at all (pots of unequal size, or under three): the caller
 * falls back to the old fixed pairing.
 */
export function drawLeaguePhase(
  teams: CLTeam[],
  countryOf: (t: CLTeam) => string | undefined,
  rng: () => number = Math.random,
): LeaguePhaseDraw | null {
  const n = teams.length
  const pots = [1, 2, 3, 4].map(p => teams.map((t, i) => (t.pot === p ? i : -1)).filter(i => i >= 0))
  const size = pots[0].length
  if (size < 3 || pots.some(p => p.length !== size)) return null
  const countries = teams.map(countryOf)
  const cap = minimumCap(pots, countries)
  const tries: [DrawRelaxed, boolean, number][] = [
    ['none', true, PER_COUNTRY], ...(cap > PER_COUNTRY && cap < Infinity ? [['cap', true, cap] as [DrawRelaxed, boolean, number]] : []),
    ['country', false, Infinity],
  ]
  // The cap only rises when the count proves 2 impossible: then trying 2 is
  // the 160 seconds The Dugout spent, so it's skipped.
  for (const [relaxed, sameCountryBanned, limit] of tries) {
    if (relaxed === 'none' && cap > PER_COUNTRY) continue
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const pairs = search(n, pots, teams.map(t => t.pot - 1), sameCountryBanned ? countries : teams.map(() => undefined), limit, rng)
      if (pairs) return { fixtures: pairs.map(([h, a]) => ({ home: teams[h], away: teams[a] })), relaxed }
    }
  }
  return null
}

// One attempt. slot(i, q, s): club i's opponent from pot q, s = 0 at home,
// 1 away; -1 while open. Filling i's (q, home) with j fills j's (pot i, away).
function search(
  n: number, pots: number[][], potOf: number[], countries: (string | undefined)[], cap: number, rng: () => number,
): [number, number][] | null {
  const P = pots.length
  const slot = new Int16Array(n * P * 2).fill(-1)
  const at = (i: number, q: number, s: number) => (i * P + q) * 2 + s
  const met = Array.from({ length: n }, () => new Map<string, number>())
  let steps = 0

  const legal = (i: number, q: number, s: number, j: number): boolean => {
    if (j === i || slot[at(j, potOf[i], 1 - s)] !== -1) return false
    if (slot[at(i, q, 1 - s)] === j) return false          // never the same club twice
    const ci = countries[i], cj = countries[j]
    if (ci && cj) {
      if (ci === cj) return false
      if ((met[i].get(cj) ?? 0) >= cap || (met[j].get(ci) ?? 0) >= cap) return false
    }
    return true
  }
  const options = (i: number, q: number, s: number): number[] => pots[q].filter(j => legal(i, q, s, j))

  // The open slot with the fewest legal opponents; null when all are filled.
  // A slot with none left means this branch is dead.
  const mostConstrained = (): { i: number; q: number; s: number; opts: number[] } | 'dead' | null => {
    let best: { i: number; q: number; s: number; opts: number[] } | null = null
    for (let i = 0; i < n; i++) for (let q = 0; q < P; q++) for (let s = 0; s < 2; s++) {
      if (slot[at(i, q, s)] !== -1) continue
      const opts = options(i, q, s)
      if (opts.length === 0) return 'dead'
      if (!best || opts.length < best.opts.length) { best = { i, q, s, opts }; if (opts.length === 1) return best }
    }
    return best
  }
  const bump = (i: number, c: string | undefined, by: number) => { if (c) met[i].set(c, (met[i].get(c) ?? 0) + by) }

  const fill = (): boolean => {
    if (++steps > STEP_BUDGET) return false
    const next = mostConstrained()
    if (next === null) return true
    if (next === 'dead') return false
    const { i, q, s, opts } = next
    // A random order is the draw: the same field gives a different eight each run.
    for (let k = opts.length - 1; k > 0; k--) { const r = Math.floor(rng() * (k + 1)); [opts[k], opts[r]] = [opts[r], opts[k]] }
    for (const j of opts) {
      slot[at(i, q, s)] = j; slot[at(j, potOf[i], 1 - s)] = i
      bump(i, countries[j], 1); bump(j, countries[i], 1)
      if (fill()) return true
      slot[at(i, q, s)] = -1; slot[at(j, potOf[i], 1 - s)] = -1
      bump(i, countries[j], -1); bump(j, countries[i], -1)
      if (steps > STEP_BUDGET) return false
    }
    return false
  }
  if (!fill()) return null

  const out: [number, number][] = []
  for (let i = 0; i < n; i++) for (let q = 0; q < P; q++) out.push([i, slot[at(i, q, 0)]])   // each match once, from its home side
  return out
}
