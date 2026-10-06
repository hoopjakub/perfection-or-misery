import { supabase } from '@/lib/supabase'
import { noteSave } from '@/diag/log'
import { timeAsync } from '@/diag/perf'
import { log } from '@/diag/log'
import type { CareerStats, CareerPlayerLine, Competition, PlayerStatLine } from '@/types/stats'
import type { CareerRun } from '@/lib/careerSummary'
import { shownRuns } from '@/lib/shownNames'

// `career_stats` isn't in the generated Supabase types yet — use an untyped client.
const db = supabase as any

// One row per user: { user_id, players jsonb (CareerPlayerLine[]), goals_for, goals_against }.
// Career tracks YOUR drafted players only, keyed by playerId + seasonLabel + competition.

export async function fetchCareer(userId: string): Promise<CareerStats | null> {
  const { data, error } = await db
    .from('career_stats')
    .select('players, goals_for, goals_against')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null
  return {
    players:      ((data as any).players as CareerPlayerLine[]) ?? [],
    goalsFor:     (data as any).goals_for ?? 0,
    goalsAgainst: (data as any).goals_against ?? 0,
  }
}

async function mergeCareerFromRunNow(userId: string, params: {
  competition:  Competition
  yourPlayers:  PlayerStatLine[]
  goalsFor:     number
  goalsAgainst: number
  potsWinnerId?: string
  u21WinnerId?:  string
}): Promise<void> {
  const existing = (await fetchCareer(userId)) ?? { players: [], goalsFor: 0, goalsAgainst: 0 }
  const key = (playerId: string, season: string) => `${playerId}|${season}|${params.competition}`
  const map = new Map(existing.players.map(p => [key(p.playerId, p.seasonLabel), p]))

  for (const yp of params.yourPlayers) {
    const k = key(yp.playerId, yp.seasonLabel)
    const cur: CareerPlayerLine = map.get(k) ?? {
      playerId: yp.playerId, name: yp.name, seasonLabel: yp.seasonLabel, competition: params.competition,
      goals: 0, assists: 0, cleanSheets: 0, matchesPlayed: 0, runs: 0, potsWins: 0, u21Wins: 0,
    }
    cur.goals       += yp.goals
    cur.assists     += yp.assists
    cur.cleanSheets += yp.cleanSheets
    cur.matchesPlayed += yp.matchesPlayed ?? 0
    cur.runs        += 1
    if (yp.playerId === params.potsWinnerId) cur.potsWins += 1
    if (yp.playerId === params.u21WinnerId)  cur.u21Wins  += 1
    map.set(k, cur)
  }

  const { error } = await db.from('career_stats').upsert({
    user_id:       userId,
    players:       [...map.values()],
    goals_for:     existing.goalsFor + params.goalsFor,
    goals_against: existing.goalsAgainst + params.goalsAgainst,
    updated_at:    new Date().toISOString(),
  } as any, { onConflict: 'user_id' })
  if (error) log.warn('save', 'career: upsert failed', error)
  noteSave('career', error ? 'failed' : 'saved')
}

// ── P8-150: the career read off every saved run ──────────────────────────────
// Only the columns the summary needs (never the stats or the history: a whole
// career of those would be megabytes), and the pundits' call on you out of the
// highlights without the rest of them. Optional columns step down as ever.
const CAREER_BASE = 'id, mode, tier, score, created_at, final_position, teams_in_league, league_name, year_start, wins, draws, losses, goals_for, goals_against, squad'
const CAREER_COLS = [
  `${CAREER_BASE}, difficulty, difficulty_meta, duration_seconds, pundits_on_you:highlights->punditsOnYou`,
  `${CAREER_BASE}, difficulty, difficulty_meta, duration_seconds`,
  `${CAREER_BASE}, difficulty, difficulty_meta`,
  CAREER_BASE,
]
// ponytail: every run a player has; paginate (or summarise in the database) if careers grow into the thousands.
export async function fetchCareerRuns(userId: string): Promise<CareerRun[]> {
  for (const cols of CAREER_COLS) {
    const { data, error } = await db.from('runs').select(cols).eq('user_id', userId).order('created_at', { ascending: true }).limit(2000)
    if (!error) return shownRuns((data ?? []) as CareerRun[])
    if (error.code !== '42703' && !/column .* does not exist|failed to parse/i.test(error.message)) throw error
  }
  return []
}

// Phase 9: timed for the Diagnostics screen (save:career, docs/diagnostics/03-BUDGETS.md).
export const mergeCareerFromRun = (...a: Parameters<typeof mergeCareerFromRunNow>) => timeAsync('save:career', () => mergeCareerFromRunNow(...a))
