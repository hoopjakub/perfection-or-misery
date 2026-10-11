import { useCrestStore } from '@/store/crestStore'
import { log } from '@/diag/log'
import { choiceHex } from '@/theme'
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { Session, User } from '@supabase/supabase-js'

type Profile = {
  id: string
  username: string | null
  is_guest: boolean
  // P8-88 (supabase/profile.sql): absent until that file is applied.
  avatar_path?: string | null
  badge_team_id?: string | null
  badge_team_name?: string | null
  // P8-181 (supabase/clubs.sql): your club's tag, kept on the profile by the club functions.
  club_tag?: string | null
  // P8.5-44 (supabase/moderation.sql): a ban, and a name the moderator took away.
  banned_at?: string | null
  must_rename?: boolean
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
        log.warn('auth', 'userStore: fetchProfile failed', error.code)
        set({ profile: null, isGuest: true })
      } else {
        set({ profile: data, isGuest: data?.is_guest ?? true })
        // P8-132: your crest, with the profile. Loaded lazily, so this store
        // doesn't pull the profile queries in at start-up.
        import('@/db/queries/profile').then(m => m.fetchCrest(user.id)).then(c => useCrestStore.getState().setMine(c)).catch(() => {})
        // P8-168: and your pin, so every pin in the app wears your colour.
        import('@/db/queries/profile').then(m => m.fetchPin(user.id)).then(p => useCrestStore.getState().setPin(p ? { hex: choiceHex(p.colour) } : null)).catch(() => {})
      }
    } catch (err) {
      log.error('auth', 'userStore: fetchProfile threw exception', err)
      set({ profile: null, isGuest: true })
    }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null, user: null, profile: null, isGuest: true })
    forgetAccount()
  },
}))

// Phase 10.5 (the maintainer, 11 Oct 2026: "custom crest doesn't reset when you
// sign out"): what the app holds for the account, dropped the moment it signs
// out, by whichever way (You → Sign out, deleting the account, a session that
// ends). Here, in the listener, because every way passes it; the store's own
// signOut() did part of this and the You screen never called it.
// Kept on purpose: the device's preferences (language, light or dark, speed,
// motion, the warnings), like any app; the screens kept per account (src/lib/
// kept.ts, keyed by the account's id, so another account never sees them); a
// run in progress and a guest's runs (the device's, not the account's).
function forgetAccount() {
  useCrestStore.getState().setMine(null)
  useCrestStore.getState().setPin(null)
  useCrestStore.getState().setActive(null)
  // Lazily: noticeStore and settingsStore read this store, so a static import would be a cycle.
  import('./noticeStore').then(m => m.useNoticeStore.getState().clear()).catch(() => {})
  import('./settingsStore').then(m => m.useSettingsStore.getState().setLastRun(null)).catch(() => {})
}

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
      forgetAccount()
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
          log.error('auth', 'userStore: auth listener: profile fetch failed', err)
        })
      }
    }
  })
}