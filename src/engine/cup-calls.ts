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
import { predictTable, predictChampionsLeagueRound, predictWorldCupRound, type PredictionTeam } from './predictions'

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
