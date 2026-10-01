import { supabase } from '@/lib/supabase'

// P8-181: clubs (supabase/clubs.sql). Creating, joining, leaving and editing
// go through the database's own functions, so each is one step that can't
// half-happen; reading is plain selects (clubs and their members are public,
// the chat is the members'). Until the SQL has run, every read says so
// (`ClubsUnavailable`) and the screens show a notice rather than an error.

export type Club = {
  id: string
  name: string
  tag: string
  colour: string
  about: string | null
  member_limit: number | null
  owner_id: string
  created_at: string
}
export type ClubMember = { user_id: string; role: 'owner' | 'member'; joined_at: string; username: string | null; avatar_path: string | null }
export type ClubMessage = { id: number; club_id: string; user_id: string; body: string; created_at: string }

/** The same limits supabase/clubs.sql checks. */
export const CLUB_LIMITS = { name: [3, 30] as const, tag: [2, 4] as const, about: 190, message: 500 }
export const MEMBER_LIMITS: { id: string; label: string; value: number | null }[] = [
  { id: 'none', label: 'No limit', value: null }, { id: '10', label: '10', value: 10 }, { id: '25', label: '25', value: 25 },
  { id: '50', label: '50', value: 50 }, { id: '100', label: '100', value: 100 },
]
export const cleanTag = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CLUB_LIMITS.tag[1])

export class ClubsUnavailable extends Error { constructor() { super('CLUBS_NOT_SET_UP') } }
const missing = (e: { code?: string; message?: string } | null) =>
  !!e && (['42P01', '42883', 'PGRST202', 'PGRST205', '42703', 'PGRST204'].includes(e.code ?? '') || /does not exist|could not find/i.test(e.message ?? ''))
const db = () => supabase as any
function fail(e: { code?: string; message?: string }): never {
  if (missing(e)) throw new ClubsUnavailable()
  throw e
}

/** What went wrong, in words a player can act on. */
export function clubErrorText(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e)
  if (e instanceof ClubsUnavailable) return 'Clubs need the database set up first: run supabase/clubs.sql.'
  if (/ALREADY_IN_A_CLUB/.test(m)) return "You're already in a club. Leave it first."
  if (/CLUB_FULL/.test(m)) return 'That club is full.'
  if (/GUEST/.test(m)) return 'Make an account to join a club.'
  if (/LIMIT_BELOW_MEMBERS/.test(m)) return 'The limit can’t be below the members the club already has.'
  if (/clubs_tag_unique|duplicate key.*tag/i.test(m)) return 'Another club has that tag.'
  if (/clubs_name_unique|duplicate key.*name/i.test(m)) return 'Another club has that name.'
  if (/check constraint/i.test(m)) return 'Something in there is too long or too short.'
  return 'That didn’t go through. Try again.'
}

export async function fetchClub(id: string): Promise<{ club: Club; members: ClubMember[] } | null> {
  const { data: club, error } = await db().from('clubs').select('*').eq('id', id).maybeSingle()
  if (error) fail(error)
  if (!club) return null
  const { data: rows, error: e2 } = await db().from('club_members').select('user_id, role, joined_at, profiles(username, avatar_path)').eq('club_id', id).order('joined_at')
  if (e2) fail(e2)
  const members: ClubMember[] = (rows ?? []).map((r: any) => ({ user_id: r.user_id, role: r.role, joined_at: r.joined_at, username: r.profiles?.username ?? null, avatar_path: r.profiles?.avatar_path ?? null }))
  return { club: club as Club, members }
}

/** The club a player is in, if any. */
export async function fetchClubOf(userId: string): Promise<Club | null> {
  const { data, error } = await db().from('club_members').select('clubs(*)').eq('user_id', userId).maybeSingle()
  if (error) fail(error)
  return (data?.clubs as Club | undefined) ?? null
}

/** Clubs by name or tag, the biggest first; the ones with room are marked by the caller. */
export async function searchClubs(query: string): Promise<(Club & { members: number })[]> {
  const q = query.trim()
  const base = () => db().from('clubs').select('*, club_members(count)').order('created_at', { ascending: false }).limit(30)
  let rows: any[]
  if (q.length >= 2) {
    // P8.5-23 (docs/release/03-INJECTION.md, I1): the search text used to go
    // into one `.or()` filter STRING, with %,() stripped by hand: hand-escaping
    // a filter language is the pattern that breaks the day someone adds a
    // character. Now it's two plain `.ilike()` filters, whose values the
    // builder sends as parameters, run together and merged. LIKE's own
    // wildcards (% _ and the escape \) are escaped so they match themselves.
    const like = (s: string) => `%${s.replace(/[\\%_]/g, c => '\\' + c)}%`
    // A query with no tag characters ("@@") would search tags for "%%", i.e.
    // everything, so the tag half only runs when there's a tag to look for.
    const tag = cleanTag(q)
    const [byName, byTag] = await Promise.all([
      base().ilike('name', like(q)),
      tag ? base().ilike('tag', like(tag)) : Promise.resolve({ data: [], error: null }),
    ])
    if (byName.error) fail(byName.error)
    if (byTag.error) fail(byTag.error)
    rows = [...new Map([...(byName.data ?? []), ...(byTag.data ?? [])].map((c: any) => [c.id, c])).values()]
  } else {
    const { data, error } = await base()
    if (error) fail(error)
    rows = data ?? []
  }
  return rows.map((c: any) => ({ ...c, members: c.club_members?.[0]?.count ?? 0 }))
    .sort((a: any, b: any) => b.members - a.members)
}

export type ClubInput = { name: string; tag: string; colour: string; about: string; limit: number | null }

export async function createClub(input: ClubInput): Promise<string> {
  const { data, error } = await db().rpc('create_club', { p_name: input.name, p_tag: cleanTag(input.tag), p_colour: input.colour, p_about: input.about, p_limit: input.limit })
  if (error) fail(error)
  return data as string
}
export async function updateClub(input: ClubInput): Promise<void> {
  const { error } = await db().rpc('update_club', { p_name: input.name, p_tag: cleanTag(input.tag), p_colour: input.colour, p_about: input.about, p_limit: input.limit })
  if (error) fail(error)
}
export async function joinClub(id: string): Promise<void> {
  const { error } = await db().rpc('join_club', { p_club: id })
  if (error) fail(error)
}
export async function leaveClub(): Promise<void> {
  const { error } = await db().rpc('leave_club')
  if (error) fail(error)
}
export async function removeFromClub(userId: string): Promise<void> {
  const { error } = await db().rpc('remove_from_club', { p_user: userId })
  if (error) fail(error)
}

// ── The chat ─────────────────────────────────────────────────────────────────
export const CHAT_PAGE = 50

/** The latest messages, oldest first (the order they're read in). */
export async function fetchMessages(clubId: string): Promise<ClubMessage[]> {
  const { data, error } = await db().from('club_messages').select('*').eq('club_id', clubId).order('created_at', { ascending: false }).limit(CHAT_PAGE)
  if (error) fail(error)
  return ((data ?? []) as ClubMessage[]).reverse()
}

export async function sendMessage(clubId: string, userId: string, body: string): Promise<void> {
  const text = body.trim().slice(0, CLUB_LIMITS.message)
  if (!text) return
  const { error } = await db().from('club_messages').insert({ club_id: clubId, user_id: userId, body: text })
  if (error) fail(error)
}

export async function deleteMessage(id: number): Promise<void> {
  const { error } = await db().from('club_messages').delete().eq('id', id)
  if (error) fail(error)
}

/** New messages as they're written (Realtime; the members-only read policy
 *  decides who receives them). Returns the unsubscribe. */
export function subscribeMessages(clubId: string, onMessage: (m: ClubMessage) => void, onDelete: (id: number) => void): () => void {
  const channel = supabase.channel(`club-chat-${clubId}`)
    .on('postgres_changes' as never, { event: 'INSERT', schema: 'public', table: 'club_messages', filter: `club_id=eq.${clubId}` } as never, (p: any) => onMessage(p.new as ClubMessage))
    .on('postgres_changes' as never, { event: 'DELETE', schema: 'public', table: 'club_messages' } as never, (p: any) => { if (p.old?.id) onDelete(p.old.id) })
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}
