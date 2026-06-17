import { supabase } from '@/lib/supabase'
import { calculateScore } from './leaderboard'
import type { SeasonResult } from '@/types/simulation'
import type { DraftedPlayer, GameMode } from '@/types/game'
import type { WCSeasonResult } from '@/engine/world-cup-sim'

export async function saveRun(params: {
  userId: string
  mode: GameMode
  formation: string
  teamOvr: number
  leagueId: string
  leagueName: string
  yearStart: number
  seasonResult: SeasonResult
  squad: DraftedPlayer[]
  matchdayHistory: unknown
}) {
  const score = calculateScore({
    mode: params.mode,
    finalPosition: params.seasonResult.finalPosition,
    teamsInLeague: params.seasonResult.teamsInLeague,
    teamOvr: params.teamOvr,
    losses: params.seasonResult.losses,
    draws: params.seasonResult.draws,
  })

  const { error } = await supabase.from('runs').insert({
    user_id: params.userId,
    mode: params.mode,
    formation: params.formation,
    team_ovr: params.teamOvr,
    league_id: params.leagueId,
    league_name: params.leagueName,
    year_start: params.yearStart,
    final_position: params.seasonResult.finalPosition,
    teams_in_league: params.seasonResult.teamsInLeague,
    tier: params.seasonResult.tier,
    wins: params.seasonResult.wins,
    draws: params.seasonResult.draws,
    losses: params.seasonResult.losses,
    goals_for: params.seasonResult.goalsFor,
    goals_against: params.seasonResult.goalsAgainst,
    score,
    squad: params.squad,
    // @ts-ignore - matchday_history column needs to be added to DB
    matchday_history: params.matchdayHistory,
  })

  if (error) throw error
}

// World Cup runs don't have a league position, so map how far the player
// advanced to a pseudo-position (out of 48) and reuse the shared scoring.
const WC_ROUND_TO_POSITION: Record<string, number> = {
  groups: 40,
  r32:    28,
  r16:    14,
  qf:     7,
  sf:     4,
  final:  2,
  winner: 1,
}

export async function saveWCRun(params: {
  userId: string
  formation: string
  teamOvr: number
  result: WCSeasonResult
  squad: DraftedPlayer[]
}) {
  const { result } = params
  const pt = result.playerTeam
  const finalPosition = WC_ROUND_TO_POSITION[result.playerFinalRound] ?? 48
  const teamsInLeague = 48

  const score = calculateScore({
    mode: 'world_cup',
    finalPosition,
    teamsInLeague,
    teamOvr: params.teamOvr,
    losses: pt.stats.lost,
    draws: pt.stats.drawn,
  })

  const { error } = await supabase.from('runs').insert({
    user_id: params.userId,
    mode: 'world_cup',
    formation: params.formation,
    team_ovr: params.teamOvr,
    league_id: 'wc_2026',
    league_name: 'FIFA World Cup',
    year_start: 2026,
    final_position: finalPosition,
    teams_in_league: teamsInLeague,
    // store the WC round reached as the "tier" descriptor
    tier: result.playerFinalRound,
    wins: pt.stats.won,
    draws: pt.stats.drawn,
    losses: pt.stats.lost,
    goals_for: pt.stats.goalsFor,
    goals_against: pt.stats.goalsAgainst,
    score,
    squad: params.squad,
  })

  if (error) throw error
}

export async function fetchRunById(runId: string) {
  const { data, error } = await supabase
    .from('runs')
    .select('*')
    .eq('id', runId)
    .single()

  if (error) throw error
  return data
}
