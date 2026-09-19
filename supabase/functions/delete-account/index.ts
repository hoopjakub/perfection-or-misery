// Deletes the calling user's account and everything tied to it (Phase 6;
// store policy and GDPR both require in-app deletion). The client can't do
// this itself: removing an auth user needs the service role, which must
// never ship in the app. The caller is identified from their own JWT, so a
// user can only ever delete themselves.
//
// Deploy: supabase functions deploy delete-account
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const authHeader = req.headers.get('Authorization') ?? ''

    // Who is asking: resolved from their token, never from the request body.
    const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await asCaller.auth.getUser()
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors })

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const id = user.id

    // Rows first, in case a table has no ON DELETE CASCADE to auth.users.
    // Each delete is best-effort: a missing table must not strand the account.
    const steps: [string, (q: any) => any][] = [
      ['notifications',   q => q.delete().eq('user_id', id)],
      ['friend_requests', q => q.delete().or(`from_user_id.eq.${id},to_user_id.eq.${id}`)],
      ['friendships',     q => q.delete().or(`user_id.eq.${id},friend_id.eq.${id}`)],
      ['versus_runs',     q => q.delete().or(`challenger_id.eq.${id},opponent_id.eq.${id}`)],
      ['career_stats',    q => q.delete().eq('user_id', id)],
      ['runs',            q => q.delete().eq('user_id', id)],
      ['profiles',        q => q.delete().eq('id', id)],
    ]
    const failed: string[] = []
    for (const [table, del] of steps) {
      const { error } = await del(admin.from(table))
      if (error) failed.push(`${table}: ${error.message}`)
    }

    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) return new Response(JSON.stringify({ error: error.message, failed }), { status: 500, headers: cors })
    return new Response(JSON.stringify({ deleted: true, failed }), { status: 200, headers: cors })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors })
  }
})
