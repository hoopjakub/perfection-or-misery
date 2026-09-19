import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Database } from '@/types/supabase'

// Phase 6: the web build is exported with `web.output: "static"`, which renders
// every route once in Node at build time. There's no window, no localStorage
// and (on Node 20) no WebSocket there, and this module runs at import. So during
// that render the client gets an inert realtime transport and no session
// storage or refresh timer. It only has to exist; nothing is fetched at build
// time, and the browser and the native app get the normal client.
const buildTime = typeof window === 'undefined'

class NoSocket {
  readyState = 3   // CLOSED
  constructor(_url: string) {}
  close() {}
  send() {}
}

export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: buildTime ? undefined : AsyncStorage,
      autoRefreshToken: !buildTime,
      persistSession: !buildTime,
      detectSessionInUrl: false,
    },
    ...(buildTime ? { realtime: { transport: NoSocket as never } } : {}),
  }
)
