// P8-150 / P8-167: the career, read off every saved run. The old career
// screen showed one accumulated row (your players' goals and awards) and
// little else; "many of its stats don't show". Everything here comes from the
// runs themselves — mode, tier, score, record, the squad you drafted, the
// pundits' call on you — so it's never out of step with what you played, and
// it needs no table of its own. Pure: runs in, a summary out (checked by
// scripts/verify-career.ts).
import { TIER_RANK, verdictOf } from '@/data/tiers'
import { isRunWon } from './feats'

export type CareerRun = {
  id: string
  mode: string
  tier: string | null
  score: number
  created_at: string
  final_position: number | null
  teams_in_league: number | null
  league_name: string
  year_start?: number | null
  wins: number
  draws: number
  losses: number
  goals_for?: number | null
  goals_against?: number | null
  difficulty?: string | null
  difficulty_meta?: { hardness?: number } | null
  duration_seconds?: number | null
  squad?: { name: string; birthYear?: number | null; primaryPosition?: string; isBench?: boolean; clubName?: string; season?: string }[] | null
  /** The pundits' place for you and the field's size (runs saved since 28 September 2026). */
  pundits_on_you?: { predicted: number; field: number } | null
}

export type Record_ = { key: string; label: string; value: string; run: CareerRun }
export type ModeLine = {
  mode: string
  runs: number
  won: number
  bestTier: string | null
  averageScore: number
  matches: { w: number; d: number; l: number }
  /** The last twelve scores, oldest first, each with its verdict. */
  recent: { score: number; verdict: 'perfection' | 'misery' | 'middle'; id: string }[]
}
export type Drafted = { name: string; times: number; position: string; averageScore: number }
export type PunditPoint = { id: string; date: string; diff: number }
export type CareerSummary = {
  runs: number
  won: number
  perfection: number
  seconds: number
  matches: { w: number; d: number; l: number }
  goals: { for: number; against: number }
  bestTier: string | null
  best: CareerRun | null
  records: Record_[]
  modes: ModeLine[]
  drafted: Drafted[]
  pundits: { points: PunditPoint[]; average: number | null; beaten: number }
}

const LEAGUE_MODES = new Set(['league', 'all_time', 'chaos', 'cursed'])
const byDate = (a: CareerRun, b: CareerRun) => a.created_at.localeCompare(b.created_at)
const tierRank = (t: string | null) => (t ? TIER_RANK[t] ?? -1 : -1)

export function summarise(runs: CareerRun[]): CareerSummary {
  const all = [...runs].sort(byDate)
  const matches = { w: 0, d: 0, l: 0 }
  const goals = { for: 0, against: 0 }
  for (const r of all) {
    matches.w += r.wins; matches.d += r.draws; matches.l += r.losses
    goals.for += r.goals_for ?? 0; goals.against += r.goals_against ?? 0
  }
  const best = all.reduce<CareerRun | null>((b, r) => (!b || r.score > b.score ? r : b), null)
  const bestTier = all.reduce<string | null>((b, r) => (tierRank(r.tier) > tierRank(b) ? r.tier : b), null)

  // ── Records: each the best run on one measure, and the run it came from ──
  const records: Record_[] = []
  const push = (key: string, label: string, pick: CareerRun | undefined, value: (r: CareerRun) => string) => { if (pick) records.push({ key, label, value: value(pick), run: pick }) }
  const max = (xs: CareerRun[], f: (r: CareerRun) => number) => xs.reduce<CareerRun | undefined>((b, r) => (!b || f(r) > f(b) ? r : b), undefined)
  const leagues = all.filter(r => LEAGUE_MODES.has(r.mode) && r.final_position != null)
  push('score', 'Best score', best ?? undefined, r => r.score.toLocaleString('en-US'))
  push('finish', 'Best league finish', max(leagues, r => -(r.final_position ?? 99) + (r.teams_in_league ?? 0) / 1000), r => `${r.final_position} of ${r.teams_in_league}`)
  push('wins', 'Most wins in a league run', max(leagues, r => r.wins), r => `${r.wins} wins`)
  const full = leagues.filter(r => r.wins + r.draws + r.losses >= 20)
  push('losses', 'Fewest defeats in a full season', max(full, r => -r.losses), r => (r.losses === 0 ? 'Unbeaten' : `${r.losses} defeat${r.losses === 1 ? '' : 's'}`))
  push('goals', 'Most goals in a run', max(all.filter(r => (r.goals_for ?? 0) > 0), r => r.goals_for ?? 0), r => `${r.goals_for} goals`)
  const hardWins = all.filter(r => isRunWon(r) && r.difficulty_meta?.hardness != null)
  push('hardest', 'Hardest run won', max(hardWins, r => r.difficulty_meta!.hardness!), r => `${r.difficulty_meta!.hardness!.toFixed(1)} of 11`)
  const called = all.filter(r => r.pundits_on_you)
  const beat = (r: CareerRun) => r.pundits_on_you!.predicted - (r.final_position ?? r.pundits_on_you!.predicted)
  const bestBeat = max(called, beat)
  if (bestBeat && beat(bestBeat) > 0) push('pundits', 'Proved the pundits most wrong', bestBeat, r => `${beat(r)} place${beat(r) === 1 ? '' : 's'} better than tipped`)

  // ── Each mode's history ──
  const modes: ModeLine[] = [...new Set(all.map(r => r.mode))].map(mode => {
    const rs = all.filter(r => r.mode === mode)
    const m = { w: 0, d: 0, l: 0 }
    for (const r of rs) { m.w += r.wins; m.d += r.draws; m.l += r.losses }
    return {
      mode, runs: rs.length, won: rs.filter(isRunWon).length,
      bestTier: rs.reduce<string | null>((b, r) => (tierRank(r.tier) > tierRank(b) ? r.tier : b), null),
      averageScore: Math.round(rs.reduce((a, r) => a + r.score, 0) / rs.length),
      matches: m,
      recent: rs.slice(-12).map(r => ({ score: r.score, verdict: verdictOf(r.tier), id: r.id })),
    }
  }).sort((a, b) => b.runs - a.runs)

  // ── The players you draft most: one footballer across seasons (name and birth year) ──
  const seen = new Map<string, { name: string; times: number; position: string; total: number }>()
  for (const r of all) {
    const once = new Set<string>()
    for (const p of r.squad ?? []) {
      const key = `${p.name}|${p.birthYear ?? ''}`
      if (once.has(key)) continue
      once.add(key)
      const cur = seen.get(key) ?? { name: p.name, times: 0, position: p.primaryPosition ?? '', total: 0 }
      cur.times++; cur.total += r.score
      seen.set(key, cur)
    }
  }
  const drafted = [...seen.values()].filter(d => d.times >= 2)
    .sort((a, b) => b.times - a.times || b.total - a.total || a.name.localeCompare(b.name)).slice(0, 10)
    .map(d => ({ name: d.name, times: d.times, position: d.position, averageScore: Math.round(d.total / d.times) }))

  // ── Against the pundits, run by run: places better (+) or worse (−) than they tipped ──
  const points = called.filter(r => r.final_position != null).map(r => ({ id: r.id, date: r.created_at, diff: beat(r) }))
  return {
    runs: all.length, won: all.filter(isRunWon).length,
    perfection: all.filter(r => verdictOf(r.tier) === 'perfection').length,
    seconds: all.reduce((a, r) => a + (r.duration_seconds ?? 0), 0),
    matches, goals, bestTier, best, records, modes, drafted,
    pundits: { points, average: points.length ? points.reduce((a, p) => a + p.diff, 0) / points.length : null, beaten: points.filter(p => p.diff > 0).length },
  }
}
