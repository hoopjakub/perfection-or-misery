import { supabase } from './supabase'
import { fetchMyPlace } from '@/db/queries/leaderboard'

// P8-90: friends. Requests, accepting and removing go through the database
// functions in supabase/friends.sql, which check the request and write every
// row themselves; the tables are closed to direct writes. The first version of
// this file inserted into friendships and notifications directly (neither
// table allowed it) and never looked at the errors, so accepting a friend
// failed silently. Every call here throws what went wrong.

export type PlayerRef = {
  id: string
  username: string
  avatar_path?: string | null
  badge_team_id?: string | null
  badge_team_name?: string | null
}
export type Relationship = 'self' | 'friends' | 'sent' | 'received' | 'none'
export type FriendRequest = { id: string; created_at: string; player: PlayerRef }
export type Friend = PlayerRef & {
  latestRun?: { id: string; mode: string; tier: string; score: number; created_at: string } | null
  worldRank?: number | null
}

async function myId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('NOT_AUTHENTICATED')
  return user.id
}

// The profile's newer columns (supabase/profile.sql) are asked for, and left
// out again if the database doesn't have them.
const PLAYER_COLS = 'id, username, avatar_path, badge_team_id, badge_team_name'
async function players(ids: string[]): Promise<Map<string, PlayerRef>> {
  if (!ids.length) return new Map()
  let res = await (supabase as any).from('profiles').select(PLAYER_COLS).in('id', ids)
  if (res.error) res = await (supabase as any).from('profiles').select('id, username').in('id', ids)
  if (res.error) throw res.error
  return new Map((res.data ?? []).map((p: PlayerRef) => [p.id, p]))
}

/** Players whose username contains the query (members only, never you). */
export async function searchPlayers(query: string): Promise<PlayerRef[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const me = await myId()
  const { data, error } = await (supabase as any).from('profiles').select('id')
    .ilike('username', `%${q.replace(/[%_]/g, m => `\\${m}`)}%`)
    .eq('is_guest', false).neq('id', me).limit(20)
  if (error) throw error
  const found = await players((data ?? []).map((r: { id: string }) => r.id))
  return [...found.values()].sort((a, b) => a.username.localeCompare(b.username))
}

/** 'sent', 'accepted' (they had asked you first), 'already_friends' or 'already_sent'. */
export async function sendFriendRequest(targetId: string): Promise<string> {
  const { data, error } = await (supabase as any).rpc('send_friend_request', { target: targetId })
  if (error) throw error
  return data as string
}

export async function respondToRequest(requestId: string, accept: boolean): Promise<void> {
  const { error } = await (supabase as any).rpc('respond_friend_request', { request_id: requestId, accept })
  if (error) throw error
}

export async function removeFriend(friendId: string): Promise<void> {
  const { error } = await (supabase as any).rpc('remove_friend', { friend: friendId })
  if (error) throw error
}

/** Requests waiting on you, and the ones you sent that haven't been answered. */
export async function getRequests(): Promise<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }> {
  const me = await myId()
  const { data, error } = await (supabase as any).from('friend_requests')
    .select('id, from_user_id, to_user_id, created_at')
    .or(`from_user_id.eq.${me},to_user_id.eq.${me}`).eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw error
  const rows = (data ?? []) as { id: string; from_user_id: string; to_user_id: string; created_at: string }[]
  const other = (r: typeof rows[number]) => (r.from_user_id === me ? r.to_user_id : r.from_user_id)
  const who = await players(rows.map(other))
  const toReq = (r: typeof rows[number]): FriendRequest | null => {
    const p = who.get(other(r)); return p ? { id: r.id, created_at: r.created_at, player: p } : null
  }
  return {
    incoming: rows.filter(r => r.to_user_id === me).map(toReq).filter((x): x is FriendRequest => !!x),
    outgoing: rows.filter(r => r.from_user_id === me).map(toReq).filter((x): x is FriendRequest => !!x),
  }
}

/** Your friends, each with their latest run and their world rank (the place
 *  of their best run on the all-time board). */
// ponytail: two small queries per friend for the rank; fine for a friends
// list, batch it into one database function if lists grow past a few dozen.
export async function getFriends(): Promise<Friend[]> {
  const me = await myId()
  const { data, error } = await supabase.from('friendships').select('friend_id').eq('user_id', me)
  if (error) throw error
  const ids = (data ?? []).map(r => r.friend_id as string)
  const who = await players(ids)
  const { data: runs, error: runsError } = await (supabase as any).from('runs')
    .select('id, user_id, mode, tier, score, created_at').in('user_id', ids)
    .order('created_at', { ascending: false }).limit(Math.max(50, ids.length * 5))
  if (runsError) throw runsError
  const ranks = await Promise.all(ids.map(id => fetchMyPlace(id, {}).catch(() => null)))
  return ids.map((id, i) => {
    const p = who.get(id)
    if (!p) return null
    return { ...p, latestRun: (runs ?? []).find((r: { user_id: string }) => r.user_id === id) ?? null, worldRank: ranks[i]?.place ?? null }
  }).filter((f): f is NonNullable<typeof f> => !!f).sort((a, b) => a.username.localeCompare(b.username))
}

/** P8-99: just your friends' ids, for the friends-only board. */
export async function friendIds(): Promise<string[]> {
  const me = await myId()
  const { data, error } = await supabase.from('friendships').select('friend_id').eq('user_id', me)
  if (error) throw error
  return (data ?? []).map(r => r.friend_id as string)
}

/** Where you stand with one player, for the button on their profile. */
export async function relationshipWith(targetId: string): Promise<{ state: Relationship; requestId?: string }> {
  const me = await myId()
  if (me === targetId) return { state: 'self' }
  const { data: f, error } = await supabase.from('friendships').select('friend_id').eq('user_id', me).eq('friend_id', targetId).maybeSingle()
  if (error) throw error
  if (f) return { state: 'friends' }
  const { data: r, error: rError } = await (supabase as any).from('friend_requests').select('id, from_user_id')
    .or(`and(from_user_id.eq.${me},to_user_id.eq.${targetId}),and(from_user_id.eq.${targetId},to_user_id.eq.${me})`)
    .eq('status', 'pending').maybeSingle()
  if (rError) throw rError
  if (!r) return { state: 'none' }
  return r.from_user_id === me ? { state: 'sent', requestId: r.id } : { state: 'received', requestId: r.id }
}

// ── Notifications ────────────────────────────────────────────────────────────
export type Notice = { id: string; type: string; payload: { fromUserId?: string; fromUsername?: string }; read: boolean; created_at: string }

export async function getNotifications(limit = 20): Promise<Notice[]> {
  const me = await myId()
  const { data, error } = await (supabase as any).from('notifications')
    .select('id, type, payload, read, created_at').eq('user_id', me)
    .order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return data ?? []
}

export async function unreadCount(): Promise<number> {
  const me = await myId()
  const { count, error } = await (supabase as any).from('notifications')
    .select('id', { count: 'exact', head: true }).eq('user_id', me).eq('read', false)
  if (error) throw error
  return count ?? 0
}

export async function markAllRead(): Promise<void> {
  const me = await myId()
  const { error } = await (supabase as any).from('notifications').update({ read: true }).eq('user_id', me).eq('read', false)
  if (error) throw error
}
