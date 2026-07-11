import { supabase } from '@/lib/supabase'
import { calculateScore } from './leaderboard'
import type { SeasonResult } from '@/types/simulation'
import type { DraftedPlayer, GameMode } from '@/types/game'
import type { WCSeasonResult } from '@/engine/world-cup-sim'
import type { CLSeasonResult } from '@/engine/cl-sim'

// Insert a run, tolerating optional columns that may not exist in Supabase yet
// (highlights / matchday_history / wc_result / cl_result / future stats columns).
// On a PostgREST "column not found" error we drop that column and retry, so the
// core run always saves even before the optional columns are added to the table.
async function insertRun(row: Record<string, unknown>): Promise<void> {
  const payload: Record<string, unknown> = { ...row }
  for (let attempt = 0; attempt < 10; attempt++) {
    const { error } = await supabase.from('runs').insert(payload as any)
    if (!error) return
    const missing = error.code === 'PGRST204'
      ? error.message?.match(/Could not find the '([^']+)' column/)?.[1]
      : undefined
    if (missing && missing in payload) {
      console.warn(`[saveRun] '${missing}' column missing in DB — dropping it and retrying`)
      delete payload[missing]
      continue
    }
    throw error
  }
}

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
  stats?: unknown
  awards?: unknown
}) {
  const score = calculateScore({
    mode: params.mode,
    finalPosition: params.seasonResult.finalPosition,
    teamsInLeague: params.seasonResult.teamsInLeague,
    teamOvr: params.teamOvr,
    losses: params.seasonResult.losses,
    draws: params.seasonResult.draws,
  })

  await insertRun({
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
    // Optional columns — auto-dropped by insertRun if not present in the DB yet.
    matchday_history: params.matchdayHistory,
    highlights: {
      biggestWin: params.seasonResult.biggestWin,
      worstLoss:  params.seasonResult.worstLoss,
      upsets:     params.seasonResult.upsets,
    },
    stats:  params.stats,
    awards: params.awards,
  })
}

// Knockout competitions (WC / UCL) don't have a league position. Score them on a
// ROUND-REACHED ladder (so progress is rewarded and scores sit alongside league
// scores), and report a real FINISH position (1–4 podium, then by round).
function knockoutScore(base: number, teamOvr: number, losses: number): number {
  const ovrPenalty = Math.max(0, teamOvr - 80) * 10        // reward underdog squads
  const unbeaten   = losses === 0 ? 200 : 0                // bonus for an unbeaten run
  return Math.round(Math.max(0, base - ovrPenalty + unbeaten))
}

// World Cup — finish position (with the 3rd-place playoff the top 4 are exact).
const WC_ROUND_TO_POSITION: Record<string, number> = {
  winner: 1, final: 2, third: 3, fourth: 4, sf: 4, qf: 8, r16: 16, r32: 32, groups: 40,
}
const WC_ROUND_SCORE: Record<string, number> = {
  groups: 150, r32: 350, r16: 550, qf: 800, fourth: 950, sf: 950, third: 1150, final: 1300, winner: 1650,
}

export async function saveWCRun(params: {
  userId: string
  formation: string
  teamOvr: number
  result: WCSeasonResult
  squad: DraftedPlayer[]
  stats?: unknown
  awards?: unknown
}) {
  const { result } = params
  const pt = result.playerTeam
  const finalPosition = WC_ROUND_TO_POSITION[result.playerFinalRound] ?? 48
  const teamsInLeague = 48
  const score = knockoutScore(WC_ROUND_SCORE[result.playerFinalRound] ?? 100, params.teamOvr, pt.stats.lost)

  await insertRun({
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
    // Full tournament so the WC result page can be rebuilt from history.
    // Optional columns — auto-dropped by insertRun if not present in the DB yet.
    wc_result: result,
    stats:  params.stats,
    awards: params.awards,
  })
}

// Champions League — finish position + round-reached score ladder.
const CL_ROUND_TO_POSITION: Record<string, number> = {
  league_exit:  30,
  playoff_exit: 24,
  r16_exit:     16,
  qf_exit:      8,
  sf_exit:      4,
  finalist:     2,
  winner:       1,
}
const CL_ROUND_SCORE: Record<string, number> = {
  league_exit: 200, playoff_exit: 350, r16_exit: 550, qf_exit: 800, sf_exit: 1050, finalist: 1300, winner: 1650,
}

export async function saveCLRun(params: {
  userId: string
  formation: string
  teamOvr: number
  result: CLSeasonResult
  squad: DraftedPlayer[]
  stats?: unknown
  awards?: unknown
}) {
  const { result } = params
  const pt = result.playerTeam
  const finalPosition = CL_ROUND_TO_POSITION[result.playerFinalRound] ?? 36
  const teamsInLeague = 36
  const score = knockoutScore(CL_ROUND_SCORE[result.playerFinalRound] ?? 100, params.teamOvr, pt.stats.lost)

  await insertRun({
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
    // Full tournament so the CL result page can be rebuilt from history.
    // Optional columns — auto-dropped by insertRun if not present in the DB yet.
    cl_result: result,
    stats:  params.stats,
    awards: params.awards,
  })
}

// Custom Champions League path — qualifying exits score lower than the same
// round reached via the classic (finals-only) mode, since the journey started
// much earlier; still on the same ladder so runs compare sensibly.
const CUSTOM_CL_ROUND_TO_POSITION: Record<string, number> = {
  not_qualified: 99, q1_exit: 90, q2_exit: 70, q3_exit: 55, quali_playoff_exit: 40,
  ...CL_ROUND_TO_POSITION,
}
const CUSTOM_CL_ROUND_SCORE: Record<string, number> = {
  not_qualified: 20, q1_exit: 50, q2_exit: 90, q3_exit: 130, quali_playoff_exit: 170,
  ...CL_ROUND_SCORE,
}

export async function saveCustomUclRun(params: {
  userId: string
  formation: string
  teamOvr: number
  result: CLSeasonResult
  squad: DraftedPlayer[]
  stats?: unknown
  awards?: unknown
  qual?: unknown          // QualifyingResult — stored so history can rebuild the ladder
  leagueTables?: unknown  // SimLeagueTable[] — stored so history can rebuild the league viewer
}) {
  const { result } = params
  const pt = result.playerTeam
  const finalPosition = CUSTOM_CL_ROUND_TO_POSITION[result.playerFinalRound] ?? 90
  const teamsInLeague = 36
  const score = knockoutScore(CUSTOM_CL_ROUND_SCORE[result.playerFinalRound] ?? 30, params.teamOvr, pt.stats.lost)

  await insertRun({
    user_id: params.userId,
    mode: 'champions_league_custom',
    formation: params.formation,
    team_ovr: params.teamOvr,
    league_id: 'cucl_2025',
    league_name: 'Champions League (Custom Path)',
    year_start: 2025,
    final_position: finalPosition,
    teams_in_league: teamsInLeague,
    tier: result.playerFinalRound,
    wins: pt.stats.won,
    draws: pt.stats.drawn,
    losses: pt.stats.lost,
    goals_for: pt.stats.goalsFor,
    goals_against: pt.stats.goalsAgainst,
    score,
    squad: params.squad,
    // Full tournament + qualifying ladder + domestic tables so the result page
    // can be rebuilt IDENTICALLY from history. The qualifying ladder and the 53
    // simulated league tables are nested INSIDE cl_result (a jsonb column that
    // exists) rather than separate columns — so nothing is dropped even without
    // a Supabase migration. The result page reads them back from here.
    cl_result: { ...result, _customUclQual: params.qual, _customUclTables: params.leagueTables },
    stats:  params.stats,
    awards: params.awards,
  })
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
