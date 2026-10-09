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
    // The id comes from the caller's token, never the request, but it still goes
    // into three filter strings below, so it's checked to be a UUID first: one
    // rule for every filter string (P8.5-23, docs/release/03-INJECTION.md).
    const id = user.id
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return new Response(JSON.stringify({ error: 'bad id' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    const uuid = (v: string) => v // checked just above

    // Rows first, in case a table has no ON DELETE CASCADE to auth.users.
    // Each delete is best-effort: a missing table must not strand the account.
    const steps: [string, (q: any) => any][] = [
      ['notifications',   q => q.delete().eq('user_id', id)],
      ['friend_requests', q => q.delete().or(`from_user_id.eq.${uuid(id)},to_user_id.eq.${uuid(id)}`)],
      ['friendships',     q => q.delete().or(`user_id.eq.${uuid(id)},friend_id.eq.${uuid(id)}`)],
      ['versus_runs',     q => q.delete().or(`challenger_id.eq.${uuid(id)},opponent_id.eq.${uuid(id)}`)],
      ['career_stats',    q => q.delete().eq('user_id', id)],
      // P8-88: the profile's details and look (they cascade from profiles too).
      ['profile_details', q => q.delete().eq('user_id', id)],
      ['profile_looks',   q => q.delete().eq('user_id', id)],
      ['runs',            q => q.delete().eq('user_id', id)],
      ['profiles',        q => q.delete().eq('id', id)],
    ]
    const failed: string[] = []
    for (const [table, del] of steps) {
      const { error } = await del(admin.from(table))
      // Phase 9.75 (S-3): which table, not the database's words (those go to the log).
      if (error) { failed.push(table); console.error('delete-account', table, error.message) }
    }

    // P8-88: the avatar file (avatars/<id>/…). Best-effort like the rows.
    const { data: files } = await admin.storage.from('avatars').list(id)
    if (files?.length) {
      const { error: fileError } = await admin.storage.from('avatars').remove(files.map((f: { name: string }) => `${id}/${f.name}`))
      if (fileError) failed.push(`avatars: ${fileError.message}`)
    }

    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) { console.error('delete-account deleteUser', error.message); return new Response(JSON.stringify({ error: 'The account could not be deleted.', failed }), { status: 500, headers: cors }) }
    return new Response(JSON.stringify({ deleted: true, failed }), { status: 200, headers: cors })
  } catch (err) {
    console.error('delete-account failed', err)
    return new Response(JSON.stringify({ error: 'Something went wrong deleting the account.' }), { status: 500, headers: cors })
  }
})
