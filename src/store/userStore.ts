import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { Session, User } from '@supabase/supabase-js'

type Profile = {
  id: string
  username: string | null
  is_guest: boolean
}

type UserStore = {
  session: Session | null
  user: User | null
  profile: Profile | null
  isGuest: boolean
  isLoading: boolean
  // A guest finished a run this session. Home only tells guests their runs
  // aren't kept once that's true for them (07a A2), not on the first visit.
  guestFinishedRun: boolean
  setSession: (session: Session | null) => void
  fetchProfile: () => Promise<void>
  signOut: () => Promise<void>
}

export const useUserStore = create<UserStore>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  isGuest: true,
  isLoading: true,
  guestFinishedRun: false,

  setSession: (session) => set({
    session,
    user: session?.user ?? null,
    isLoading: false,
  }),

  fetchProfile: async () => {
    const { user } = get()
    if (!user) {
      return
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (error) {
        console.warn('[userStore] fetchProfile failed:', error.code)
        set({ profile: null, isGuest: true })
      } else {
        set({ profile: data, isGuest: data?.is_guest ?? true })
      }
    } catch (err) {
      console.error('[userStore] fetchProfile threw exception:', err)
      set({ profile: null, isGuest: true })
    }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null, user: null, profile: null, isGuest: true })
  },
}))

export function initAuthListener() {
  supabase.auth.onAuthStateChange((event, session) => {
    // only handle these specific events, ignore the rest
    if (event === 'SIGNED_OUT') {
      useUserStore.setState({
        session:   null,
        user:      null,
        profile:   null,
        isGuest:   true,
        isLoading: false,
      })
      return
    }

    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
      // prevent duplicate fetches — check if we already have this session
      const currentSession = useUserStore.getState().session
      if (currentSession?.user?.id === session?.user?.id && event === 'TOKEN_REFRESHED') {
        // just update the session token silently, don't refetch profile
        useUserStore.setState({ session })
        return
      }

      useUserStore.getState().setSession(session)

      if (session) {
        useUserStore.getState().fetchProfile().catch(err => {
          console.error('[userStore] auth listener: profile fetch failed', err)
        })
      }
    }
  })
}