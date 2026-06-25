import { supabase } from '@/lib/supabase'
import type { CareerStats, CareerPlayerLine, Competition, PlayerStatLine } from '@/types/stats'

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

export async function mergeCareerFromRun(userId: string, params: {
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
  if (error) console.warn('[career] upsert failed:', error)
}
