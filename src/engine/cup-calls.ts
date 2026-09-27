/**
 * The pundits' pre-season calls for a cup, checked against how far every side
 * really got (P8-24 for the Champions League and the World Cup).
 *
 * A league's pundits predict a place; a cup's predict a round — "semi-
 * finalists", "out in the group" — from each side's place in their ranking of
 * the whole field. This rebuilds every side's call from the run's seed, works
 * out the round each side actually reached from the stored result, and orders
 * both on one ladder so "beat the call by two rounds" is a number.
 *
 * Pure: result + field + seed in, rows out.
 */

import type { CLSeasonResult } from './cl-sim'
import type { WCSeasonResult } from './world-cup-sim'
import { predictTable, predictChampionsLeagueRound, predictWorldCupRound, punditRatings, expectedPoints, type PredictionTeam } from './predictions'

export type CupCallRow = {
  clubId: string
  clubName: string
  isPlayer: boolean
  tipped: { key: string; label: string; step: number }
  reached: { key: string; label: string; step: number }
  /** Rounds better (positive) or worse (negative) than the call. */
  diff: number
}

// Each cup's ladder, best first; `step` is the index, so a lower step is further.
const CL_LADDER = [
  { key: 'winner', label: 'Champions' }, { key: 'finalist', label: 'Runners-up' },
  { key: 'sf_exit', label: 'Semi-finals' }, { key: 'qf_exit', label: 'Quarter-finals' },
  { key: 'r16_exit', label: 'Round of 16' }, { key: 'playoff_exit', label: 'Knockout play-off' },
  { key: 'league_exit', label: 'League phase' },
]
const WC_LADDER = [
  { key: 'winner', label: 'Champions' }, { key: 'final', label: 'Runners-up' },
  { key: 'sf', label: 'Semi-finals' }, { key: 'qf', label: 'Quarter-finals' },
  { key: 'r16', label: 'Round of 16' }, { key: 'r32', label: 'Round of 32' },
  { key: 'groups', label: 'Group stage' },
]

const onLadder = (ladder: typeof CL_LADDER, key: string) => {
  const step = Math.max(0, ladder.findIndex(r => r.key === key))
  return { key, label: ladder[step].label, step }
}

function rows(field: PredictionTeam[], seed: number, reached: Map<string, string>, ladder: typeof CL_LADDER,
  call: (place: number) => { key: string }, fallback: string): CupCallRow[] {
  const pred = predictTable(field, seed)
  return pred.table.map(r => {
    const tipped = onLadder(ladder, call(r.predicted).key)
    const got = onLadder(ladder, reached.get(r.clubId) ?? fallback)
    return { clubId: r.clubId, clubName: r.clubName, isPlayer: r.isPlayer, tipped, reached: got, diff: tipped.step - got.step }
  }).sort((a, b) => a.reached.step - b.reached.step || b.diff - a.diff || a.clubName.localeCompare(b.clubName))
}

export function championsLeagueCalls(result: CLSeasonResult, field: PredictionTeam[], seed: number): CupCallRow[] {
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
  return rows(field, seed, reached, CL_LADDER, predictChampionsLeagueRound, 'league_exit')
}

export function worldCupCalls(result: WCSeasonResult, field: PredictionTeam[], seed: number): CupCallRow[] {
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
  return rows(field, seed, reached, WC_LADDER, predictWorldCupRound, 'groups')
}

// ── The whole tournament, as the pundits saw it (P8-56) ──────────────────────
// Before a cup starts the pundits can't know the groups or the bracket — they
// are drawn after the preview. So the check applies the same belief they had
// (`punditRatings`, the same seed) to what was actually drawn: every real group
// in the order they rated its sides, with the points they'd expect, beside how
// it finished; every real knockout tie with who they'd have picked (the side
// they rated higher — pundits back the favourite) and whether it went through;
// and their champion. Checkable, and never a second opinion that disagrees
// with the pre-season table.
type Side = { clubId: string; clubName: string; isPlayer?: boolean }

export type GroupCall = {
  id: string
  rows: { clubId: string; clubName: string; isPlayer: boolean; predicted: number; points: number; actual: number }[]
}
export type TieCall = { round: string; a: Side; b: Side; pick: string; winner: string; right: boolean }
export type TournamentCalls = {
  groups: GroupCall[]
  ties: TieCall[]
  champion: Side | null
  /** Ties they called right, of all ties. */
  right: number
}

const tieCall = (rating: Map<string, number>, round: string, a: Side, b: Side, winner: string): TieCall => {
  const ra = rating.get(a.clubId) ?? 0, rb = rating.get(b.clubId) ?? 0
  const pick = ra > rb || (ra === rb && a.clubId < b.clubId) ? a.clubId : b.clubId
  return { round, a, b, pick, winner, right: pick === winner }
}

const championPick = (field: PredictionTeam[], rating: Map<string, number>): Side | null => {
  const top = [...field].sort((x, y) => (rating.get(y.clubId) ?? 0) - (rating.get(x.clubId) ?? 0) || x.clubId.localeCompare(y.clubId))[0]
  return top ? { clubId: top.clubId, clubName: top.clubName, isPlayer: top.isPlayer } : null
}

export function worldCupTournament(result: WCSeasonResult, field: PredictionTeam[], seed: number): TournamentCalls {
  const rating = punditRatings(field, seed)
  const groups: GroupCall[] = result.groups.map(g => {
    const ids = g.teams.map(t => t.clubId)
    const predicted = [...g.teams].sort((x, y) => (rating.get(y.clubId) ?? 0) - (rating.get(x.clubId) ?? 0) || x.clubId.localeCompare(y.clubId))
    return {
      id: g.id,
      rows: predicted.map((t, i) => ({
        clubId: t.clubId, clubName: t.clubName, isPlayer: !!t.isPlayer, predicted: i + 1,
        points: expectedPoints(rating.get(t.clubId) ?? t.ovr, predicted.filter(o => o.clubId !== t.clubId).map(o => rating.get(o.clubId) ?? o.ovr), g.teams.length - 1),
        actual: ids.indexOf(t.clubId) + 1,
      })),
    }
  })
  const ties = result.knockoutRounds
    .filter(r => r.round !== 'third')
    .flatMap(r => r.matches.map(m => tieCall(rating, r.round, m.teamA, m.teamB, m.winner.clubId)))
  return { groups, ties, champion: championPick(field, rating), right: ties.filter(t => t.right).length }
}

export function championsLeagueTournament(result: CLSeasonResult, field: PredictionTeam[], seed: number): TournamentCalls {
  const rating = punditRatings(field, seed)
  const rounds: [string, { teamA: Side; teamB: Side; winner: { clubId: string } }[]][] = [
    ['playoff', result.playoffRound], ['r16', result.r16], ['qf', result.qf], ['sf', result.sf],
    ['final', result.final ? [result.final] : []],
  ]
  const ties = rounds.flatMap(([round, ms]) => ms.map(m => tieCall(rating, round, m.teamA, m.teamB, m.winner.clubId)))
  return { groups: [], ties, champion: championPick(field, rating), right: ties.filter(t => t.right).length }
}
