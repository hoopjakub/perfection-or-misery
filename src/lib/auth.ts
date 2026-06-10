import { supabase } from './supabase'
import AsyncStorage from '@react-native-async-storage/async-storage'

export async function ensureGuestSession(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    console.log('[auth] existing session found:', session.user.id, 'anon:', session.user.is_anonymous)
    return
  }
  console.log('[auth] no session, creating anonymous...')
  const { error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  console.log('[auth] anonymous session created')
}

export async function loginWithUsername(
  username: string,
  password: string
): Promise<void> {
  // always lowercase for email construction
  const internalEmail = `${username.toLowerCase().trim()}@pom.internal`
  console.log('[auth] attempting login with:', internalEmail)

  const { data, error } = await supabase.auth.signInWithPassword({
    email:    internalEmail,
    password: password,
  })

  if (error) {
    console.log('[auth] login failed:', error.message, error.status)
    throw new Error('INVALID_CREDENTIALS')
  }

  console.log('[auth] login success:', data.user.id)
}

export async function upgradeGuestAccount(params: {
  username: string
  password: string
}): Promise<void> {
  const { username, password } = params
  const displayUsername = username.trim()           // keep original casing: "Kolka"
  const trimmed         = displayUsername.toLowerCase() // for email: "kolka"
  const internalEmail   = `${trimmed}@pom.internal`

  // check username taken — case insensitive check
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .ilike('username', trimmed)  // ilike = case insensitive LIKE
    .maybeSingle()

  if (existing) throw new Error('USERNAME_TAKEN')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('NO_USER')
  console.log('[auth] current user id:', user.id, 'anon:', user.is_anonymous)

  console.log('[auth] calling updateUser...')
  const { data: updateData, error: updateError } = await supabase.auth.updateUser({
    email:    internalEmail,
    password: password,
  })

  if (updateError) {
    console.log('[auth] updateUser failed:', updateError.message, updateError.status)
    throw updateError
  }
  console.log('[auth] updateUser success:', updateData.user.email)

  // store display username with original casing
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ username: displayUsername, is_guest: false })
    .eq('id', user.id)

  if (profileError) throw profileError
  console.log('[auth] profile updated with display username:', displayUsername)

  await new Promise(resolve => setTimeout(resolve, 1500))

  await supabase.auth.signOut()
  await AsyncStorage.clear()

  await new Promise(resolve => setTimeout(resolve, 500))

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email:    internalEmail,
    password: password,
  })

  if (signInError) {
    console.log('[auth] sign in after upgrade failed:', signInError.message)
    return
  }

  console.log('[auth] signed in after upgrade:', signInData.user.id)
} 

export async function signOut(): Promise<void> {
  console.log('[auth] signing out...')
  await supabase.auth.signOut()
  await AsyncStorage.clear()
  console.log('[auth] signed out')
}