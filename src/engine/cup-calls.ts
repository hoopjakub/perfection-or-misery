/**
 * The pundits' tournament for a cup (P8-165): each pundit's whole World Cup or
 * Champions League, played out before a ball is kicked, and later checked
 * against what happened.
 *
 * History. P8-24 checked each side's tipped round against the round it
 * reached, as a long table; P8-56 applied the pundits' ratings to the real
 * ties one by one. The maintainer, 25 and 28 September: the idea is right, the
 * execution lacks, "the bracket preview they never made" — and the long
 * checked table "is stupid and not worth it". So both are gone. What's left is
 * the one thing that reads as a pundit's prediction: their whole tournament.
 *
 * Their own draw. The groups (World Cup) and the league-phase fixtures
 * (Champions League) are drawn inside the simulation, after the pundits have
 * spoken, so each pundit makes their own draw the way the real one is made:
 * the field in four pots by their ratings, a World Cup group taking one side
 * from each pot, a Champions League side meeting two from each pot. Then they
 * play it out, leaning heavily on the side they rate higher, and build the
 * knockouts from THEIR tables the way the game builds the real ones. The same
 * tournament is shown before the run (the pundits screen) and after it (the
 * result screens), where it's scored against what happened.
 *
 * Pure and seeded: the same field, ratings and seed give the same tournament.
 */

import type { CLSeasonResult } from './cl-sim'
import type { WCSeasonResult } from './world-cup-sim'
import type { PredictionTeam } from './predictions'
import { mulberry32, deriveSeed } from '@/lib/rng'

// Each cup's ladder, best first; `step` is the index, so a lower step is further.
const CL_LADDER = ['winner', 'finalist', 'sf_exit', 'qf_exit', 'r16_exit', 'playoff_exit', 'league_exit']
const WC_LADDER = ['winner', 'final', 'sf', 'qf', 'r16', 'r32', 'groups']
const stepOn = (ladder: string[], key: string | undefined) => { const i = ladder.indexOf(key ?? ''); return i < 0 ? ladder.length : i }

/** How far every side really got in a Champions League, on its ladder's keys. */
export function clReached(result: CLSeasonResult): Map<string, string> {
  const reached = new Map<string, string>()
  result.leaguePhaseStandings.forEach((t, i) => { if (i >= 24) reached.set(t.clubId, 'league_exit') })
  const out = (matches: { teamA: { clubId: string }; teamB: { clubId: string }; winner: { clubId: string } }[], key: string) => {
    for (const m of matches) {
      const loser = m.winner.clubId === m.teamA.clubId ? m.teamB.clubId : m.teamA.clubId
      reached.set(loser, key)
    }
  }
  out(result.playoffRound, 'playoff_exit')
  out(result.r16, 'r16_exit')
  out(result.qf, 'qf_exit')
  out(result.sf, 'sf_exit')
  if (result.final) out([result.final], 'finalist')
  reached.set(result.winner.clubId, 'winner')
  return reached
}

/** How far every side really got in a World Cup, on its ladder's keys. */
export function wcReached(result: WCSeasonResult): Map<string, string> {
  const reached = new Map<string, string>()
  const LOSER_KEY: Record<string, string> = { r32: 'r32', r16: 'r16', qf: 'qf', sf: 'sf', final: 'final' }
  for (const r of result.knockoutRounds) {
    const key = LOSER_KEY[r.round]
    if (!key) continue   // the third-place match doesn't move anyone on the ladder
    for (const m of r.matches) {
      const loser = m.winner.clubId === m.teamA.clubId ? m.teamB.clubId : m.teamA.clubId
      reached.set(loser, key)
    }
  }
  reached.set(result.winner.clubId, 'winner')
  return reached
}

export type PunditSide = { clubId: string; clubName: string; isPlayer: boolean }
export type PunditTableRow = PunditSide & { played: number; gd: number; points: number; place: number }
export type PunditTable = { id: string; rows: PunditTableRow[] }
/** `real`: whether the side they sent through really got that far (null before the run). */
export type PunditTie = { a: PunditSide; b: PunditSide; goalsA: number; goalsB: number; winner: 'a' | 'b'; real: boolean | null }
export type PunditRound = { key: string; label: string; ties: PunditTie[] }
export type PunditScore = {
  /** Of the sides they put through to the knockouts, how many really got there. */
  qualified: number; qualifiedOf: number
  /** The Champions League only: league-phase places exactly right (one table, so places compare). */
  places?: number; placesOf?: number
  /** Of the sides they sent through a knockout round, how many really got that far. */
  through: number; ties: number
  champion: boolean
}
export type PunditTournament = {
  /** Their World Cup groups, or their one Champions League league phase. */
  tables: PunditTable[]
  rounds: PunditRound[]
  champion: PunditSide
  /** Against what happened; null before the run. */
  score: PunditScore | null
}

// How heavily it leans: the side they rate higher by `gap` wins LEAN(gap) of
// its games, 55% between equals, about 80% at a six-point gap, never above 90%.
// In a group or league game a draw takes half of what's left. Heavy on purpose:
// a pundit's bracket has the favourites going through, with an upset or two.
export const LEAN = (gap: number) => 0.55 + 0.35 * (1 - Math.exp(-Math.abs(gap) / 4))

type Rng = () => number
function play(rng: Rng, ra: number, rb: number, draws: boolean): [number, number] {
  const p = LEAN(ra - rb)
  const u = rng()
  if (draws && u >= p && u < p + (1 - p) / 2) { const g = Math.floor(rng() * 3); return [g, g] }
  const favWins = u < p
  const w = 1 + Math.floor(rng() * 3), l = Math.floor(rng() * w)
  const aWins = favWins === ra >= rb
  return aWins ? [w, l] : [l, w]
}

/** A seeded shuffle (Fisher–Yates on the tournament's own stream). */
function shuffled<T>(rng: Rng, xs: T[]): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

type Tally = PunditSide & { played: number; gf: number; ga: number; points: number }
const side = (t: { clubId: string; clubName: string; isPlayer?: boolean }): PunditSide => ({ clubId: t.clubId, clubName: t.clubName, isPlayer: !!t.isPlayer })

function tableOf(sides: PunditSide[], matches: [string, string][], rating: Map<string, number>, rng: Rng): Tally[] {
  const t = new Map(sides.map(s => [s.clubId, { ...s, played: 0, gf: 0, ga: 0, points: 0 }]))
  for (const [h, a] of matches) {
    const th = t.get(h), ta = t.get(a)
    if (!th || !ta) continue
    const [gh, ga] = play(rng, rating.get(h) ?? 0, rating.get(a) ?? 0, true)
    th.played++; ta.played++; th.gf += gh; th.ga += ga; ta.gf += ga; ta.ga += gh
    th.points += gh > ga ? 3 : gh === ga ? 1 : 0
    ta.points += ga > gh ? 3 : gh === ga ? 1 : 0
  }
  // Points, then goal difference, then how they rate the side (no coin tosses in a prediction).
  return [...t.values()].sort((x, y) => y.points - x.points || (y.gf - y.ga) - (x.gf - x.ga)
    || (rating.get(y.clubId) ?? 0) - (rating.get(x.clubId) ?? 0) || x.clubId.localeCompare(y.clubId))
}

function knockout(rng: Rng, rating: Map<string, number>, key: string, label: string, sides: PunditSide[],
  real: ((winner: string, round: string) => boolean) | null): { round: PunditRound; winners: PunditSide[] } {
  const ties: PunditTie[] = [], winners: PunditSide[] = []
  for (let i = 0; i + 1 < sides.length; i += 2) {
    const a = sides[i], b = sides[i + 1]
    const [ga, gb] = play(rng, rating.get(a.clubId) ?? 0, rating.get(b.clubId) ?? 0, false)
    const w = ga > gb ? a : b
    ties.push({ a, b, goalsA: ga, goalsB: gb, winner: ga > gb ? 'a' : 'b', real: real ? real(w.clubId, key) : null })
    winners.push(w)
  }
  return { round: { key, label, ties }, winners }
}

const rowsOf = (tally: Tally[]): PunditTableRow[] =>
  tally.map((t, i) => ({ clubId: t.clubId, clubName: t.clubName, isPlayer: t.isPlayer, played: t.played, gd: t.gf - t.ga, points: t.points, place: i + 1 }))

/** The field in four pots by their ratings, best first, each pot shuffled (their draw). */
function pots(rng: Rng, field: PredictionTeam[], rating: Map<string, number>, count = 4): PunditSide[][] {
  const ranked = [...field].sort((a, b) => (rating.get(b.clubId) ?? b.ovr) - (rating.get(a.clubId) ?? a.ovr) || a.clubId.localeCompare(b.clubId)).map(side)
  const size = Math.ceil(ranked.length / count)
  return Array.from({ length: count }, (_, p) => shuffled(rng, ranked.slice(p * size, (p + 1) * size)))
}

function score(qualifiers: PunditSide[], reachedKnockouts: (id: string) => boolean, rounds: PunditRound[], champion: PunditSide, realChampion: string,
  places?: { right: number; of: number }): PunditScore {
  const ties = rounds.flatMap(r => r.ties)
  return {
    qualified: qualifiers.filter(q => reachedKnockouts(q.clubId)).length, qualifiedOf: qualifiers.length,
    ...(places ? { places: places.right, placesOf: places.of } : {}),
    through: ties.filter(t => t.real).length, ties: ties.length,
    champion: champion.clubId === realChampion,
  }
}

// Winning a round means reaching the next one: whether the side they sent
// through really got at least that far.
const WC_THROUGH: Record<string, string> = { r32: 'r16', r16: 'qf', qf: 'sf', sf: 'final', final: 'winner' }
const CL_THROUGH: Record<string, string> = { playoff: 'r16_exit', r16: 'qf_exit', qf: 'sf_exit', sf: 'finalist', final: 'winner' }

export function worldCupPunditTournament(field: PredictionTeam[], rating: Map<string, number>, seed: number, actual?: WCSeasonResult | null): PunditTournament {
  const rng = mulberry32(deriveSeed(seed, 0x70c1))
  const reached = actual ? wcReached(actual) : null
  const real = reached ? (id: string, round: string) => stepOn(WC_LADDER, reached.get(id) ?? 'groups') <= stepOn(WC_LADDER, WC_THROUGH[round]) : null
  // Their draw: twelve groups, one side from each of their four pots.
  const p = pots(rng, field, rating)
  const groups = Array.from({ length: p[0].length }, (_, g) => p.map(pot => pot[g]).filter(Boolean))
  const tallies = groups.map((sides, g) => {
    const pairs: [string, string][] = []
    for (let i = 0; i < sides.length; i++) for (let j = i + 1; j < sides.length; j++) pairs.push([sides[i].clubId, sides[j].clubId])
    return { id: String.fromCharCode(65 + g), tally: tableOf(sides, pairs, rating, rng) }
  })
  const tables = tallies.map(g => ({ id: g.id, rows: rowsOf(g.tally) }))
  // The 32: the top two of every group and the eight best thirds, drawn into
  // a bracket as the game draws the real one.
  const thirds = tallies.map(g => g.tally[2]).filter(Boolean).sort((x, y) => y.points - x.points || (y.gf - y.ga) - (x.gf - x.ga)
    || (rating.get(y.clubId) ?? 0) - (rating.get(x.clubId) ?? 0))
  const qualifiers = [...tallies.flatMap(g => g.tally.slice(0, 2)), ...thirds.slice(0, 8)].map(side)
  let alive: PunditSide[] = shuffled(rng, qualifiers)
  const rounds: PunditRound[] = []
  for (const [key, label] of [['r32', 'Round of 32'], ['r16', 'Round of 16'], ['qf', 'Quarter-finals'], ['sf', 'Semi-finals'], ['final', 'Final']]) {
    if (alive.length < 2) break
    const k = knockout(rng, rating, key, label, alive, real)
    rounds.push(k.round); alive = k.winners
  }
  const champion = alive[0] ?? qualifiers[0]
  return {
    tables, rounds, champion,
    score: actual && reached ? score(qualifiers, id => stepOn(WC_LADDER, reached.get(id) ?? 'groups') <= stepOn(WC_LADDER, 'r32'), rounds, champion, actual.winner.clubId) : null,
  }
}

/** The league-phase pairs of a four-pot draw: every side meets two from each
 *  pot, one at home and one away across pots (exported for its check). */
export function potPairs(p: { clubId: string }[][]): [string, string][] {
  const pairs: [string, string][] = []
  for (let a = 0; a < p.length; a++) for (let b = a; b < p.length; b++) {
    const A = p[a], B = p[b], n = Math.min(A.length, B.length)
    if (n < 3) continue   // a pot of two can't give each side two different neighbours
    for (let i = 0; i < n; i++) {
      if (a === b) pairs.push([A[i].clubId, A[(i + 1) % n].clubId])
      else { pairs.push([A[i].clubId, B[i].clubId]); pairs.push([B[(i + 1) % n].clubId, A[i].clubId]) }
    }
  }
  return pairs
}

/** One opponent from each pot, their own included (the Conference League's
 *  six, P8-172): within a pot sides pair off two by two; across two pots side
 *  i meets side i, home and away alternating so nobody is always at home. */
export function onePerPotPairs(p: { clubId: string }[][]): [string, string][] {
  const pairs: [string, string][] = []
  for (let a = 0; a < p.length; a++) for (let b = a; b < p.length; b++) {
    const A = p[a], B = p[b], n = Math.min(A.length, B.length)
    if (a === b) { for (let i = 0; i + 1 < n; i += 2) pairs.push([A[i].clubId, A[i + 1].clubId]); continue }
    for (let i = 0; i < n; i++) pairs.push((a + b + i) % 2 ? [A[i].clubId, B[i].clubId] : [B[i].clubId, A[i].clubId])
  }
  return pairs
}

export function championsLeaguePunditTournament(field: PredictionTeam[], rating: Map<string, number>, seed: number, actual?: CLSeasonResult | null,
  /** The league phase's shape: four pots of two opponents, or six of one (the Conference League). */
  format: { pots: number; perPot: 1 | 2 } = { pots: 4, perPot: 2 }): PunditTournament {
  const rng = mulberry32(deriveSeed(seed, 0xc1a5))
  const reached = actual ? clReached(actual) : null
  const real = reached ? (id: string, round: string) => stepOn(CL_LADDER, reached.get(id) ?? 'league_exit') <= stepOn(CL_LADDER, CL_THROUGH[round]) : null
  // Their draw: two opponents from each of their four pots. Within a pot each
  // side meets its neighbours either side; across two pots, side i meets the
  // other pot's i and i + 1 — so every side plays eight, two from every pot.
  const p = pots(rng, field, rating, format.pots)
  const sides = p.flat()
  const tally = tableOf(sides, format.perPot === 1 ? onePerPotPairs(p) : potPairs(p), rating, rng)
  const tables = [{ id: 'League phase', rows: rowsOf(tally) }]
  // The knockouts the game's way: 9th–24th drawn into the play-off, 1st–8th
  // drawn against its winners, then a fixed tree.
  const ranked = tally.map(side)
  const po = knockout(rng, rating, 'playoff', 'Knockout play-off', shuffled(rng, ranked.slice(8, 24)), real)
  const direct = shuffled(rng, ranked.slice(0, 8))
  const rounds: PunditRound[] = [po.round]
  let alive = po.winners.flatMap((w, i) => (direct[i] ? [direct[i], w] : [w]))
  for (const [key, label] of [['r16', 'Round of 16'], ['qf', 'Quarter-finals'], ['sf', 'Semi-finals'], ['final', 'Final']]) {
    if (alive.length < 2) break
    const k = knockout(rng, rating, key, label, alive, real)
    rounds.push(k.round); alive = k.winners
  }
  const champion = alive[0] ?? ranked[0]
  let sc: PunditScore | null = null
  if (actual && reached) {
    const realOrder = actual.leaguePhaseStandings.map(t => t.clubId)
    const right = tables[0].rows.filter(r => realOrder.indexOf(r.clubId) + 1 === r.place).length
    sc = score(ranked.slice(0, 24), id => stepOn(CL_LADDER, reached.get(id) ?? 'league_exit') <= stepOn(CL_LADDER, 'playoff_exit'),
      rounds, champion, actual.winner.clubId, { right, of: tables[0].rows.length })
  }
  return { tables, rounds, champion, score: sc }
}
