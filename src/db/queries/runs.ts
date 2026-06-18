import { supabase } from '@/lib/supabase'
import { calculateScore } from './leaderboard'
import type { SeasonResult } from '@/types/simulation'
import type { DraftedPlayer, GameMode } from '@/types/game'
import type { WCSeasonResult } from '@/engine/world-cup-sim'
import type { CLSeasonResult } from '@/engine/cl-sim'

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
    // @ts-ignore - highlights column (jsonb) needs to be added to DB
    highlights: {
      biggestWin: params.seasonResult.biggestWin,
      worstLoss:  params.seasonResult.worstLoss,
      upsets:     params.seasonResult.upsets,
    },
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
    // @ts-ignore - wc_result column (jsonb) needs to be added to DB.
    // Stores the full tournament so the WC result page can be rebuilt from history.
    wc_result: result,
  })

  if (error) throw error
}

// Champions League: no league position either, so map the round reached to a
// pseudo-position (out of 36) and reuse the shared scoring.
const CL_ROUND_TO_POSITION: Record<string, number> = {
  league_exit:  30,
  playoff_exit: 24,
  r16_exit:     16,
  qf_exit:      8,
  sf_exit:      4,
  finalist:     2,
  winner:       1,
}

export async function saveCLRun(params: {
  userId: string
  formation: string
  teamOvr: number
  result: CLSeasonResult
  squad: DraftedPlayer[]
}) {
  const { result } = params
  const pt = result.playerTeam
  const finalPosition = CL_ROUND_TO_POSITION[result.playerFinalRound] ?? 36
  const teamsInLeague = 36

  const score = calculateScore({
    mode: 'champions_league',
    finalPosition,
    teamsInLeague,
    teamOvr: params.teamOvr,
    losses: pt.stats.lost,
    draws: pt.stats.drawn,
  })

  const { error } = await supabase.from('runs').insert({
    user_id: params.userId,
    mode: 'champions_league',
    formation: params.formation,
    team_ovr: params.teamOvr,
    league_id: 'ucl_2025',
    league_name: 'UEFA Champions League',
    year_start: 2025,
    final_position: finalPosition,
    teams_in_league: teamsInLeague,
    // store the CL round reached as the "tier" descriptor
    tier: result.playerFinalRound,
    wins: pt.stats.won,
    draws: pt.stats.drawn,
    losses: pt.stats.lost,
    goals_for: pt.stats.goalsFor,
    goals_against: pt.stats.goalsAgainst,
    score,
    squad: params.squad,
    // @ts-ignore - cl_result column (jsonb) needs to be added to DB.
    // Stores the full tournament so the CL result page can be rebuilt from history.
    cl_result: result,
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
