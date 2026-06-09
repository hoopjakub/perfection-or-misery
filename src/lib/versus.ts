import { supabase } from './supabase'

async function getMyId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('NOT_AUTHENTICATED')
  return user.id
}

export async function createVersusRun(params: {
  myRunId:     string
  opponentId?: string
  hardMode:    boolean
}): Promise<void> {
  const { myRunId, opponentId, hardMode } = params
  const myId = await getMyId()

  const { data: myRun } = await supabase
    .from('runs')
    .select('team_ovr, league_id, year_start')
    .eq('id', myRunId)
    .single()

  if (!myRun) throw new Error('RUN_NOT_FOUND')

  // build opponent query
  let oppQuery = supabase
    .from('runs')
    .select('id, team_ovr, user_id')
    .neq('user_id', myId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (opponentId) {
    oppQuery = oppQuery.eq('user_id', opponentId)
  } else if (!hardMode) {
    // within ±10 OVR of my team
    oppQuery = oppQuery
      .gte('team_ovr', myRun.team_ovr - 10)
      .lte('team_ovr', myRun.team_ovr + 10)
  }

  const { data: oppRun } = await oppQuery.single()
  if (!oppRun) throw new Error('NO_OPPONENT_FOUND')

  const { error } = await supabase.from('versus_runs').insert({
    challenger_id:     myId,
    opponent_id:       oppRun.user_id,
    challenger_run_id: myRunId,
    opponent_run_id:   oppRun.id,
    league_id:         myRun.league_id,
    year_start:        myRun.year_start,
    hard_mode:         hardMode,
    status:            'pending',
  })

  if (error) throw error
}

export async function getMyVersusRuns() {
  const myId = await getMyId()

  const { data, error } = await supabase
    .from('versus_runs')
    .select(`
      id, league_id, year_start, hard_mode,
      challenger_pos, opponent_pos, winner_id, status, created_at,
      challenger:profiles!versus_runs_challenger_id_fkey(username),
      opponent:profiles!versus_runs_opponent_id_fkey(username)
    `)
    .or(`challenger_id.eq.${myId},opponent_id.eq.${myId}`)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}