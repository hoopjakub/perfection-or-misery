import { supabase } from '@/lib/supabase'
import { calculateScore } from './leaderboard'
import type { SeasonResult } from '@/types/simulation'
import type { DraftedPlayer, GameMode } from '@/types/game'

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

export async function fetchRunById(runId: string) {
  const { data, error } = await supabase
    .from('runs')
    .select('*')
    .eq('id', runId)
    .single()

  if (error) throw error
  return data
}
