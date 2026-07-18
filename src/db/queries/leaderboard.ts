import { supabase } from '@/lib/supabase'
import { bestTierOf } from '@/data/tiers'

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

export type UserStats = {
  bestScore: number | null
  bestTier: string | null
  totalRuns: number
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

export async function fetchUserStats(userId: string): Promise<UserStats> {
  // Get total runs
  const { count: totalRuns, error: countError } = await supabase
    .from('runs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (countError) throw countError

  // Get best score
  const { data: bestRun, error: scoreError } = await supabase
    .from('runs')
    .select('score, tier')
    .eq('user_id', userId)
    .order('score', { ascending: false })
    .limit(1)
    .single()

  if (scoreError && scoreError.code !== 'PGRST116') throw scoreError

  // Best tier across ALL modes (league finishes, UCL exits, WC finishes incl.
  // 3rd-place) via the unified tier ranking — not just league tiers.
  let bestTier: string | null = null
  if (bestRun) {
    const { data: allTiers } = await supabase
      .from('runs')
      .select('tier')
      .eq('user_id', userId)
    if (allTiers) bestTier = bestTierOf(allTiers.map((r: any) => r.tier))
  }

  return {
    bestScore: bestRun?.score ?? null,
    bestTier,
    totalRuns: totalRuns ?? 0
  }
}

// One run's fields needed to compute achievements. difficulty/difficulty_meta
// are optional columns (added later) — the fetch degrades gracefully if the DB
// doesn't have them yet, so old runs still count toward "conquered a mode".
export type AchievementRun = {
  mode: string
  tier: string | null
  final_position: number | null
  difficulty: string | null
  difficulty_meta: { hardness?: number; screwLevel?: number } | null
}

export async function fetchAchievementRuns(userId: string): Promise<AchievementRun[]> {
  const base = 'mode, tier, final_position'
  // Try WITH the difficulty columns; if they don't exist yet, retry without.
  for (const cols of [`${base}, difficulty, difficulty_meta`, base]) {
    const { data, error } = await supabase
      .from('runs').select(cols).eq('user_id', userId)
    if (!error) return (data as unknown as AchievementRun[]).map(r => ({
      mode: r.mode, tier: r.tier ?? null, final_position: r.final_position ?? null,
      difficulty: (r as any).difficulty ?? null, difficulty_meta: (r as any).difficulty_meta ?? null,
    }))
    // 42703 = undefined_column; anything else is a real error.
    if (error.code !== '42703' && !/column .* does not exist/i.test(error.message)) throw error
  }
  return []
}

// A run counts as "won" (trophy / league title) for achievements when the player
// finished first: league modes → final_position 1; knockout modes → tier 'winner'.
export function isRunWon(run: { mode: string; tier: string | null; final_position: number | null }): boolean {
  if (run.mode === 'world_cup' || run.mode === 'champions_league' || run.mode === 'champions_league_custom') {
    return run.tier === 'winner'
  }
  return run.final_position === 1
}

export function calculateScore(params: {
  mode: string
  finalPosition: number
  teamsInLeague: number
  teamOvr: number
  losses: number
  draws: number
  difficultyMultiplier?: number   // from engine/difficulty scoreMultiplierFor (1 = neutral)
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

  // Difficulty (rerolls / hidden ratings / screw-level) scales the whole score —
  // an easy run with a fistful of rerolls is worth a fraction of a hard blind one.
  // chaos/cursed have no difficulty knob, so they pass 1 and keep only their mode
  // multiplier (which already rewards their inherent handicap).
  return Math.round(
    (positionScore - ovrPenalty + tierBonus)
    * (modeMultiplier[mode] ?? 1.0)
    * (params.difficultyMultiplier ?? 1.0)
  )
}