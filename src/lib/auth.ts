import { supabase } from './supabase'
import { log } from '@/diag/log'
import { checkName } from './moderation'
import AsyncStorage from '@react-native-async-storage/async-storage'

// A username is at most 38 characters: the matchdays of a league season, and
// the 38 of the 38-0 idea the game started from. Long enough for any real
// name, short enough to sit on a tab and a run label. The database holds the
// same limit (supabase/friends.sql), so it can't be got round.
export const USERNAME_MAX = 38

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
    log.warn('auth', 'auth: login failed', error.status)
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
  // P8.5-44: asked BEFORE the sign-in email changes below. The username's
  // own check (supabase/moderation.sql) only runs on the profile, after the
  // email, so a refused name would leave the account half-renamed.
  if ((await checkName(displayUsername)) === 'blocked') throw new Error('BAD_WORD')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('NO_USER')

  const { data: updateData, error: updateError } = await supabase.auth.updateUser({
    email:    internalEmail,
    password: password,
  })

  if (updateError) {
    log.warn('auth', 'auth: updateUser failed', updateError.status)
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
  await clearSession()

  await new Promise(resolve => setTimeout(resolve, 500))

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email:    internalEmail,
    password: password,
  })

  // The account exists at this point but we're signed out. This used to return
  // quietly, so the register screen treated it as success and dropped the
  // player on Home with no session at all. Say so, and send them to sign in.
  if (signInError) {
    log.warn('auth', 'auth: sign in after upgrade failed', signInError.status)
    throw new Error('SIGNIN_AFTER_UPGRADE')
  }

} 

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
  await clearSession()
}

// Phase 9 (diagnostics D4): signing out used to call AsyncStorage.clear(),
// which wipes every key the app has. On the web that's the same localStorage
// the settings, the offline run queue (P8.5-24), the run keeper and the
// diagnostics log live in, so a sign-out lost runs waiting to go up. Only the
// session's own keys go now: Supabase keeps it under `sb-<project>-auth-token`.
async function clearSession(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys()
  await AsyncStorage.multiRemove(keys.filter(k => k.startsWith('sb-')))
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
