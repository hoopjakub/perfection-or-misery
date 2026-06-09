import { supabase } from './supabase'

async function getMyId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('NOT_AUTHENTICATED')
  return user.id
}

async function getMyProfile() {
  const myId = await getMyId()
  const { data } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', myId)
    .single()
  return data
}

export async function sendFriendRequest(toUsername: string): Promise<void> {
  const myId = await getMyId()

  const { data: target } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', toUsername)
    .single()

  if (!target) throw new Error('USER_NOT_FOUND')

  const { error } = await supabase
    .from('friend_requests')
    .insert({ from_user_id: myId, to_user_id: target.id })

  if (error?.code === '23505') throw new Error('REQUEST_ALREADY_SENT')
  if (error) throw error

  const myProfile = await getMyProfile()
  await supabase.from('notifications').insert({
    user_id: target.id,
    type:    'friend_request',
    payload: { fromUsername: myProfile?.username },
  })
}

export async function acceptFriendRequest(
  requestId: string,
  fromUserId: string
): Promise<void> {
  const myId = await getMyId()

  await supabase
    .from('friend_requests')
    .update({ status: 'accepted' })
    .eq('id', requestId)

  await supabase.from('friendships').insert([
    { user_id: myId,       friend_id: fromUserId },
    { user_id: fromUserId, friend_id: myId },
  ])

  const myProfile = await getMyProfile()
  await supabase.from('notifications').insert({
    user_id: fromUserId,
    type:    'friend_accepted',
    payload: { fromUsername: myProfile?.username },
  })
}

export async function rejectFriendRequest(requestId: string): Promise<void> {
  await supabase
    .from('friend_requests')
    .update({ status: 'rejected' })
    .eq('id', requestId)
}

export async function getFriends() {
  const myId = await getMyId()

  const { data, error } = await supabase
    .from('friendships')
    .select(`
      friend_id,
      profiles!friendships_friend_id_fkey(username, is_guest)
    `)
    .eq('user_id', myId)

  if (error) throw error
  return data ?? []
}

export async function getPendingRequests() {
  const myId = await getMyId()

  const { data, error } = await supabase
    .from('friend_requests')
    .select(`
      id, from_user_id, created_at,
      profiles!friend_requests_from_user_id_fkey(username)
    `)
    .eq('to_user_id', myId)
    .eq('status', 'pending')

  if (error) throw error
  return data ?? []
}