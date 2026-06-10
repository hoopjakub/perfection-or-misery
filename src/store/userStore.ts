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

  setSession: (session) => set({
    session,
    user: session?.user ?? null,
    isLoading: false,
  }),

  fetchProfile: async () => {
    const { user } = get()
    if (!user) return

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    set({ profile: data, isGuest: data?.is_guest ?? true })
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null, user: null, profile: null, isGuest: true })
  },
}))

export function initAuthListener() {
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('[userStore] auth event:', event, 'user:', session?.user?.id ?? 'none')

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
        console.log('[userStore] fetching profile...')
        await useUserStore.getState().fetchProfile()
      }
    }
  })
}