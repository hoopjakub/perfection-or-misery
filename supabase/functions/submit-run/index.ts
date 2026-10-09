// Saves a finished run, scored on the server (Phase 6).
//
// The app sends the whole run row it would have inserted itself. This function
// decides who it belongs to (from the caller's token, never the body), refuses
// rows no run could produce, re-scores it with the ONE shared formula
// (../_shared/score.ts, the same file the app scores with) and inserts it with
// the service role. Once it's deployed and the app has EXPO_PUBLIC_SERVER_SCORING=1,
// supabase/policies.sql takes INSERT on `runs` away from the app entirely.
//
// Limit, said plainly: the app simulates the season, so the server can't prove
// a result happened. It can make every score follow the formula, stop anyone
// posting under someone else's name, and reject impossible rows.
//
// Deploy: supabase functions deploy submit-run
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { scoreRun, invalidRun, type RunRow } from '../_shared/score.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// Columns the app may send. Anything else in the body is dropped, so a client
// can't set `id`, `created_at` or anything a future migration adds.
const ALLOWED = new Set([
  'mode', 'formation', 'team_ovr', 'league_id', 'league_name', 'year_start', 'final_position',
  'teams_in_league', 'tier', 'wins', 'draws', 'losses', 'goals_for', 'goals_against', 'squad',
  'difficulty', 'difficulty_meta', 'matchday_history', 'highlights', 'stats', 'awards',
  'wc_result', 'cl_result',
  // P8-88: the run's length in seconds, for the profile's playing time
  // (runs.duration_seconds, added by supabase/profile.sql).
  'duration_seconds',
  // P8.5-24 (supabase/runs-queue.sql): the app's own id for the run, so a run
  // sent twice from the offline queue is kept once; and when it was played.
  'client_id', 'played_at',
])

// A queued run is dated by when it was played, so it counts for the season it
// was played in, but never more than this far back (or in the future): the
// date is the app's word, and an old season's board must not be reachable.
const MAX_BACKDATE_MS = 14 * 24 * 3600 * 1000
// S-2 (Phase 9.75): one account saves at most this many runs a minute. A run
// takes minutes to play; ten in a minute is a script, or a queue, and the app
// keeps a 429'd run queued for later. Counted by arrival (received_at,
// supabase/rate-limit.sql), not created_at, which a queued run backdates.
export const RUNS_PER_MINUTE = 10

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user } } = await asCaller.auth.getUser()
    if (!user) return json({ error: 'Unauthorized' }, 401)
    // Guests' runs are never kept (the app says so); the server agrees.
    if (user.is_anonymous) return json({ error: 'Guest runs are not saved' }, 403)

    const body = await req.json() as Record<string, unknown>
    const row: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body)) if (ALLOWED.has(k)) row[k] = v

    const invalid = invalidRun(row as RunRow)
    if (invalid) return json({ error: `Run refused: ${invalid}` }, 422)

    row.user_id = user.id
    row.score = scoreRun(row as RunRow)
    if (row.client_id != null && !(typeof row.client_id === 'string' && UUID.test(row.client_id))) delete row.client_id
    const played = typeof row.played_at === 'string' ? Date.parse(row.played_at) : NaN
    const now = Date.now()
    if (Number.isFinite(played) && played <= now + 5 * 60 * 1000 && played >= now - MAX_BACKDATE_MS) row.created_at = new Date(played).toISOString()
    else delete row.played_at

    // Same tolerance as the app's old insertRun: an optional column the table
    // doesn't have yet is dropped and the insert retried, so the core run saves.
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // S-2: the caller's runs that arrived in the last minute. A table without
    // received_at yet (rate-limit.sql not run) skips the limit, never the save.
    const since = new Date(now - 60_000).toISOString()
    const recent = await admin.from('runs').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('received_at', since)
    if (recent.error) console.error('submit-run rate limit skipped', recent.error.code, recent.error.message)
    else if ((recent.count ?? 0) >= RUNS_PER_MINUTE) return json({ error: 'Too many runs at once. Try again in a minute.' }, 429)
    for (let attempt = 0; attempt < 10; attempt++) {
      // The id comes back so the app can share the run's link (/r/<id>).
      const { data, error } = await admin.from('runs').insert(row).select('id').single()
      if (!error) return json({ id: data?.id, score: row.score, tier: row.tier }, 200)
      // The same run again (its client_id is already saved): it's in, so this
      // is a success, with the id it was saved under.
      if (error.code === '23505' && typeof row.client_id === 'string') {
        const { data: had } = await admin.from('runs').select('id').eq('client_id', row.client_id).eq('user_id', user.id).maybeSingle()
        if (had) return json({ id: had.id, score: row.score, tier: row.tier, duplicate: true }, 200)
      }
      const missing = error.code === 'PGRST204' ? error.message?.match(/Could not find the '([^']+)' column/)?.[1] : undefined
      if (missing && missing in row && !['mode', 'tier', 'score', 'user_id'].includes(missing)) { delete row[missing]; continue }
      // Phase 9.75 (S-3): the database's own message stays in the function's log;
      // the app gets a fixed one (it carried table and column names before).
      console.error('submit-run insert failed', error.code, error.message)
      return json({ error: 'The run could not be saved.', code: error.code }, 400)
    }
    return json({ error: 'Too many missing columns' }, 400)
  } catch (err) {
    console.error('submit-run failed', err)
    return json({ error: 'Something went wrong saving the run.' }, 500)
  }
})
