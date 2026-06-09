import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function assignTier(
  position: number, total: number,
  unbeaten: boolean, perfectSeason: boolean
): string {
  const isFirst   = position === 1
  const isTop4    = position <= 4
  const isTopHalf = position <= Math.floor(total / 2)
  const isBot3    = position > total - 3

  if (isFirst && perfectSeason) return 'perfection'
  if (isFirst && unbeaten)      return 'almost_perfection'
  if (isFirst)                  return 'champions'
  if (isTop4)                   return 'title_contender'
  if (position <= 7)            return 'europa_glory'
  if (isTopHalf)                return 'almost_matters'
  if (!isBot3)                  return 'respectful_mediocrity'
  return 'absolute_misery'
}

function calculateScore(params: {
  mode: string, finalPosition: number, teamsInLeague: number,
  teamOvr: number, losses: number, draws: number
}): number {
  const { mode, finalPosition, teamsInLeague, teamOvr, losses, draws } = params
  const positionScore = ((teamsInLeague - finalPosition + 1) / teamsInLeague) * 1000
  const ovrPenalty    = Math.max(0, teamOvr - 80) * 10
  const modeMultiplier: Record<string, number> = {
    league: 1.0, all_time: 1.2, era: 1.1, chaos: 1.5, cursed: 1.3,
  }
  const tierBonus = losses === 0 && draws === 0 ? 750
                  : losses === 0               ? 400 : 0
  return Math.round(
    (positionScore - ovrPenalty + tierBonus) * (modeMultiplier[mode] ?? 1.0)
  )
}

Deno.serve(async (req: Request) => {
  try {
    const {
      squad, leagueId, leagueName, yearStart,
      mode, formation, results
    } = await req.json()

    const authHeader = req.headers.get('Authorization')!
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new Response('Unauthorized', { status: 401 })

    const { finalPosition, teamsInLeague, wins, draws, losses, goalsFor, goalsAgainst } = results

    // recalculate team ovr from squad server-side
    const teamOvr = Math.round(
      squad.reduce((sum: number, p: { ovr: number }) => sum + p.ovr, 0) / squad.length
    )

    const unbeaten      = losses === 0
    const perfectSeason = losses === 0 && draws === 0
    const tier  = assignTier(finalPosition, teamsInLeague, unbeaten, perfectSeason)
    const score = calculateScore({ mode, finalPosition, teamsInLeague, teamOvr, losses, draws })

    const { error } = await supabase.from('runs').insert({
      user_id:         user.id,
      mode,
      formation,
      team_ovr:        teamOvr,
      league_id:       leagueId,
      league_name:     leagueName,
      year_start:      yearStart,
      final_position:  finalPosition,
      teams_in_league: teamsInLeague,
      tier,
      wins,
      draws,
      losses,
      goals_for:       goalsFor,
      goals_against:   goalsAgainst,
      score,
      squad,
    })

    if (error) return new Response(JSON.stringify({ error }), { status: 400 })
    return new Response(JSON.stringify({ score, tier }), { status: 200 })

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})