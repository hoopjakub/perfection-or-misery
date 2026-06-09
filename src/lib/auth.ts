import { supabase } from './supabase'

export async function ensureGuestSession(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) return

  const { error } = await supabase.auth.signInAnonymously()
  if (error) throw error
}