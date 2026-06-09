import { supabase } from '@/lib/supabase'

export type LeaderboardEntry = {
  id: string
  score: number
  tier: string
  mode: string
  league_id: string
  league_name: string
  final_position: number
  teams_in_league: number
  wins: number
  draws: number
  losses: number
  created_at: string
  profiles: { username: string | null }
}

export type LeaderboardFilter = {
  mode?: string
  leagueId?: string
  period?: 'day' | 'week' | 'month' | 'all'
  limit?: number
  offset?: number
}

export async function fetchLeaderboard(
  filter: LeaderboardFilter = {}
): Promise<LeaderboardEntry[]> {
  let query = supabase
    .from('runs')
    .select(`
      id, score, tier, mode, league_id, league_name,
      final_position, teams_in_league, wins, draws, losses,
      created_at,
      profiles!inner(username)
    `)
    .order('score', { ascending: false })
    .limit(filter.limit ?? 50)

  if (filter.mode)     query = query.eq('mode', filter.mode)
  if (filter.leagueId) query = query.eq('league_id', filter.leagueId)

  if (filter.period && filter.period !== 'all') {
    const cutoff = new Date()
    if      (filter.period === 'day')   cutoff.setDate(cutoff.getDate() - 1)
    else if (filter.period === 'week')  cutoff.setDate(cutoff.getDate() - 7)
    else if (filter.period === 'month') cutoff.setMonth(cutoff.getMonth() - 1)
    query = query.gte('created_at', cutoff.toISOString())
  }

  const { data, error } = await query
  if (error) throw error
  return (data as unknown as LeaderboardEntry[]) ?? []
}

export async function fetchPersonalBest(userId: string) {
  const { data, error } = await supabase
    .from('runs')
    .select('id, score, tier, mode, league_name, final_position, created_at')
    .eq('user_id', userId)
    .order('score', { ascending: false })
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function fetchRunHistory(userId: string, limit = 20) {
  const { data, error } = await supabase
    .from('runs')
    .select('id, score, tier, mode, league_name, final_position, created_at, wins, draws, losses')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}

export function calculateScore(params: {
  mode: string
  finalPosition: number
  teamsInLeague: number
  teamOvr: number
  losses: number
  draws: number
}): number {
  const { mode, finalPosition, teamsInLeague, teamOvr, losses, draws } = params

  const positionScore = ((teamsInLeague - finalPosition + 1) / teamsInLeague) * 1000
  const ovrPenalty    = Math.max(0, teamOvr - 80) * 10

  const modeMultiplier: Record<string, number> = {
    league:   1.0,
    all_time: 1.2,
    era:      1.1,
    chaos:    1.5,
    cursed:   1.3,
  }

  const tierBonus = losses === 0 && draws === 0 ? 750
                  : losses === 0               ? 400 : 0

  return Math.round(
    (positionScore - ovrPenalty + tierBonus) * (modeMultiplier[mode] ?? 1.0)
  )
}