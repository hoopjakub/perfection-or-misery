import { supabase } from './supabase'
import { log } from '@/diag/log'
import { checkName } from './moderation'
import AsyncStorage from '@react-native-async-storage/async-storage'

// A username is at most 38 characters: the matchdays of a league season, and
// the 38 of the 38-0 idea the game started from. Long enough for any real
// name, short enough to sit on a tab and a run label. The database holds the
// same limit (supabase/friends.sql), so it can't be got round.
export const USERNAME_MAX = 38

// Phase 10.5 (docs/release/09-GUESTS.md, option C): a guest has no session at
// all. Every launch used to sign in anonymously, which made an account per
// install and per browser (99 guests to 11 accounts on 9 Oct), stalled on
// shared wifi at Supabase's 30 anonymous sign-ins an hour, and blocked the
// "require current password" setting. Now the app plays signed out, and a
// guest's runs wait on the phone until sign-up (adoptGuestRuns).
//
// An older version's anonymous session is dropped at start-up, locally (no
// request: on a dead network it mustn't wait). Nothing is lost: a guest's runs
// were never saved under it.
export async function dropAnonymousSession(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user?.is_anonymous) return
  await supabase.auth.signOut({ scope: 'local' })
  await clearSession()
  log.info('auth', 'auth: an old guest session was dropped')
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

/**
 * Make an account (Phase 10.5): a plain sign-up with the internal address.
 * The database's trigger (handle_new_user) makes the profile, with the name in
 * lower case from the address and is_guest false; the name's own casing is
 * written after. Then the guest's runs kept on this phone become the account's.
 * Errors: USERNAME_TAKEN, BAD_WORD (the moderation's list), SIGNIN_AFTER_UPGRADE
 * (the account exists but the session didn't come: sign in by hand).
 */
export async function registerAccount(params: {
  username: string
  password: string
}): Promise<void> {
  const displayUsername = params.username.trim()           // keep original casing: "Kolka"
  const internalEmail   = `${displayUsername.toLowerCase()}@pom.internal`

  // taken, case-insensitively
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .ilike('username', displayUsername.toLowerCase())
    .maybeSingle()
  if (existing) throw new Error('USERNAME_TAKEN')
  // P8.5-44: before the account exists, so a refused name makes nothing.
  if ((await checkName(displayUsername)) === 'blocked') throw new Error('BAD_WORD')

  const { data, error } = await supabase.auth.signUp({ email: internalEmail, password: params.password })
  if (error) {
    log.warn('auth', 'auth: sign-up failed', error.status)
    // The address is taken in Auth even if the profile check missed it (a race).
    if (/registered|already/i.test(error.message)) throw new Error('USERNAME_TAKEN')
    throw error
  }
  // With email confirmation off (the internal address receives no mail) the
  // session comes with the sign-up. If it doesn't, sign in.
  let userId = data.session?.user?.id
  if (!userId) {
    const { data: signed, error: signInError } = await supabase.auth.signInWithPassword({ email: internalEmail, password: params.password })
    if (signInError || !signed.user) { log.warn('auth', 'auth: sign in after sign-up failed', signInError?.status); throw new Error('SIGNIN_AFTER_UPGRADE') }
    userId = signed.user.id
  }

  // The name as typed, casing and all. A failure here leaves the lower-case name: logged, not fatal.
  const { error: profileError } = await supabase.from('profiles').update({ username: displayUsername, is_guest: false }).eq('id', userId)
  if (profileError) log.warn('auth', 'auth: keeping the name\'s casing failed', profileError.code)

  // "Keep my runs": the runs played as a guest on this phone go up now.
  const { adoptGuestRuns } = await import('@/db/queries/runs')
  await adoptGuestRuns(userId).catch(e => log.warn('save', 'guest: adopting the runs failed', e))
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
 * then signs out and plays on as a guest, with no session (Phase 10.5).
 */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' })
  if (error) throw error
  await signOut()
}
