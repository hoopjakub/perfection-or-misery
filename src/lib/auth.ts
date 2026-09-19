import { supabase } from './supabase'
import AsyncStorage from '@react-native-async-storage/async-storage'

export async function ensureGuestSession(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    return
  }
  const { error } = await supabase.auth.signInAnonymously()
  if (error) throw error
}

export async function loginWithUsername(
  username: string,
  password: string
): Promise<void> {
  // always lowercase for email construction
  const internalEmail = `${username.toLowerCase().trim()}@pom.internal`

  const { data, error } = await supabase.auth.signInWithPassword({
    email:    internalEmail,
    password: password,
  })

  if (error) {
    console.warn('[auth] login failed:', error.status)
    throw new Error('INVALID_CREDENTIALS')
  }

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

  const { data: updateData, error: updateError } = await supabase.auth.updateUser({
    email:    internalEmail,
    password: password,
  })

  if (updateError) {
    console.warn('[auth] updateUser failed:', updateError.status)
    throw updateError
  }

  // store display username with original casing
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ username: displayUsername, is_guest: false })
    .eq('id', user.id)

  if (profileError) throw profileError

  await new Promise(resolve => setTimeout(resolve, 1500))

  await supabase.auth.signOut()
  await AsyncStorage.clear()

  await new Promise(resolve => setTimeout(resolve, 500))

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email:    internalEmail,
    password: password,
  })

  // The account exists at this point but we're signed out. This used to return
  // quietly, so the register screen treated it as success and dropped the
  // player on Home with no session at all. Say so, and send them to sign in.
  if (signInError) {
    console.warn('[auth] sign in after upgrade failed:', signInError.status)
    throw new Error('SIGNIN_AFTER_UPGRADE')
  }

} 

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
  await AsyncStorage.clear()
}
/**
 * Delete the signed-in account and all its runs (Phase 6). The work happens in
 * the `delete-account` edge function, which needs the service role; the app
 * then signs out and falls back to a fresh guest session, as a new install would.
 */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' })
  if (error) throw error
  await signOut()
  await ensureGuestSession()
}
