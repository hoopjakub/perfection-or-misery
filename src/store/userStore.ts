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
  supabase.auth.onAuthStateChange((_event, session) => {
    useUserStore.getState().setSession(session)
    if (session) useUserStore.getState().fetchProfile()
  })
}