import { supabase } from '@/lib/supabase'
import {
  scoreRun, invalidRun, type RunRow,
  WC_ROUND_TO_POSITION, CL_ROUND_TO_POSITION, CUSTOM_CL_ROUND_TO_POSITION,
} from '../../../supabase/functions/_shared/score'
import type { SeasonResult } from '@/types/simulation'
import type { DraftedPlayer, GameMode } from '@/types/game'
import type { WCSeasonResult } from '@/engine/world-cup-sim'
import type { CLSeasonResult } from '@/engine/cl-sim'
import { resolveDifficulty, type Difficulty, type CustomDifficulty } from '@/engine/difficulty'

// Build the difficulty columns saved on every run so the achievements/leaderboard/
// run-history screens can read back exactly how hard a run was. `difficulty` is
// the raw preset/custom label (or 'chaos'/'cursed' — those store their FIXED
// screw-level here too, resolved via `mode`, rather than saving null and losing
// the info); `difficulty_meta` carries the resolved knobs + the 0–11 hardness.
// Both are optional columns (auto-dropped by insertRun if the DB lacks them).
function difficultyColumns(
  difficulty: Difficulty | null, custom: CustomDifficulty | null | undefined, mode?: GameMode | null,
  weightedPicksOverride?: boolean | null,
) {
  const isFixedMode = mode === 'chaos' || mode === 'cursed'
  if (!difficulty && !isFixedMode) return { difficulty: null, difficulty_meta: null }
  const r = resolveDifficulty(difficulty, custom, mode, weightedPicksOverride)
  return {
    // Chaos/Cursed store their mode name as the "difficulty" label (their level
    // is fixed, not chosen) so the run-history UI has something to badge on.
    difficulty: isFixedMode ? mode : difficulty,
    difficulty_meta: {
      rerolls: r.rerolls, ratingsShown: r.ratingsShown, screwLevel: r.screwLevel, hardness: r.hardness,
      // CL (full) only — see Big Fixes §4. Omitted elsewhere (see DifficultyMeta).
      ...(mode === 'champions_league_custom' ? { weightedPicks: r.weightedPicksEffective } : {}),
    },
  }
}

// Insert a run, tolerating optional columns that may not exist in Supabase yet
// (highlights / matchday_history / wc_result / cl_result / future stats columns).
// On a PostgREST "column not found" error we drop that column and retry, so the
// core run always saves even before the optional columns are added to the table.
//
// Phase 6: every run is scored HERE, once, by the shared formula
// (supabase/functions/_shared/score.ts); the save functions no longer score.
// With EXPO_PUBLIC_SERVER_SCORING=1 the row goes to the `submit-run` edge
// function instead, which re-scores and validates it and inserts it as the
// caller. Flip the flag once that function is deployed, then apply
// supabase/policies.sql so the table no longer takes inserts from the app.
const SERVER_SCORING = process.env.EXPO_PUBLIC_SERVER_SCORING === '1'

async function insertRun(row: Record<string, unknown>): Promise<void> {
  const payload: Record<string, unknown> = { ...row, score: scoreRun(row as RunRow) }
  const invalid = invalidRun(row as RunRow)
  if (invalid) console.warn(`[saveRun] this run would be refused by the server: ${invalid}`)
  if (SERVER_SCORING) {
    const { error } = await supabase.functions.invoke('submit-run', { body: payload })
    if (error) throw error
    return
  }
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
  difficulty: Difficulty | null
  custom?: CustomDifficulty | null
  stats?: unknown
  awards?: unknown
}) {

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
    squad: params.squad,
    ...difficultyColumns(params.difficulty, params.custom, params.mode),
    // Optional columns — auto-dropped by insertRun if not present in the DB yet.
    matchday_history: params.matchdayHistory,
    highlights: {
      biggestWin: params.seasonResult.biggestWin,
      worstLoss:  params.seasonResult.worstLoss,
      upsets:     params.seasonResult.upsets,
      // §10.5 phase 4 — the medical table rides along in `highlights` so it
      // survives a history load without needing its own column.
      absences:   params.seasonResult.absences ?? [],
    },
    stats:  params.stats,
    awards: params.awards,
  })
}

// Knockout competitions (WC / UCL) don't have a league position. Score them on a
// ROUND-REACHED ladder (so progress is rewarded and scores sit alongside league
// scores), and report a real FINISH position (1–4 podium, then by round).

// World Cup — finish position (with the 3rd-place playoff the top 4 are exact).

export async function saveWCRun(params: {
  userId: string
  formation: string
  teamOvr: number
  result: WCSeasonResult
  squad: DraftedPlayer[]
  difficulty: Difficulty | null
  custom?: CustomDifficulty | null
  stats?: unknown
  awards?: unknown
}) {
  const { result } = params
  const pt = result.playerTeam
  const finalPosition = WC_ROUND_TO_POSITION[result.playerFinalRound] ?? 48
  const teamsInLeague = 48

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
    squad: params.squad,
    ...difficultyColumns(params.difficulty, params.custom),
    // Full tournament so the WC result page can be rebuilt from history.
    // Optional columns — auto-dropped by insertRun if not present in the DB yet.
    wc_result: result,
    stats:  params.stats,
    awards: params.awards,
  })
}

// Champions League — finish position + round-reached score ladder.

export async function saveCLRun(params: {
  userId: string
  formation: string
  teamOvr: number
  result: CLSeasonResult
  squad: DraftedPlayer[]
  difficulty: Difficulty | null
  custom?: CustomDifficulty | null
  stats?: unknown
  awards?: unknown
}) {
  const { result } = params
  const pt = result.playerTeam
  const finalPosition = CL_ROUND_TO_POSITION[result.playerFinalRound] ?? 36
  const teamsInLeague = 36

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
    squad: params.squad,
    ...difficultyColumns(params.difficulty, params.custom),
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

export async function saveCustomUclRun(params: {
  userId: string
  formation: string
  teamOvr: number
  result: CLSeasonResult
  squad: DraftedPlayer[]
  difficulty: Difficulty | null
  custom?: CustomDifficulty | null
  weightedPicksOverride?: boolean | null   // Big Fixes §4 — CL (full) only
  stats?: unknown
  awards?: unknown
  qual?: unknown          // QualifyingResult — stored so history can rebuild the ladder
  leagueTables?: unknown  // SimLeagueTable[] — stored so history can rebuild the league viewer
}) {
  const { result } = params
  const pt = result.playerTeam
  const finalPosition = CUSTOM_CL_ROUND_TO_POSITION[result.playerFinalRound] ?? 90
  const teamsInLeague = 36

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
    squad: params.squad,
    ...difficultyColumns(params.difficulty, params.custom, 'champions_league_custom', params.weightedPicksOverride),
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
