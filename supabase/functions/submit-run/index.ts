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
])

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

    // Same tolerance as the app's old insertRun: an optional column the table
    // doesn't have yet is dropped and the insert retried, so the core run saves.
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    for (let attempt = 0; attempt < 10; attempt++) {
      const { error } = await admin.from('runs').insert(row)
      if (!error) return json({ score: row.score, tier: row.tier }, 200)
      const missing = error.code === 'PGRST204' ? error.message?.match(/Could not find the '([^']+)' column/)?.[1] : undefined
      if (missing && missing in row && !['mode', 'tier', 'score', 'user_id'].includes(missing)) { delete row[missing]; continue }
      return json({ error: error.message }, 400)
    }
    return json({ error: 'Too many missing columns' }, 400)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
