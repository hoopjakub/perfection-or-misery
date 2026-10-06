// The device's key-value storage.
//
// Settings are on MMKV (P8-148): it reads synchronously, so the saved settings
// are in place before the first screen draws, rather than arriving a moment
// after start-up from an asynchronous read. They "weren't kept over a reload"
// (the maintainer, 23 Sept) — the old path wrote to AsyncStorage and read it
// back in a promise, and anything that read or wrote before that promise
// landed saw the defaults. MMKV is a native module (react-native-mmkv, over
// react-native-nitro-modules, which must stay an explicit dependency), and on
// the web it's localStorage. If the native module isn't in a build, creating
// it throws: then settings fall back to AsyncStorage as before, and the
// console says so.
//
// The session (Supabase's auth storage) stays on AsyncStorage: it already
// survives a reload, and moving it would sign everyone out once.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { log } from '@/diag/log'
import { createMMKV, type MMKV } from 'react-native-mmkv'

export const sessionStorage = AsyncStorage
export const draftStorage   = AsyncStorage

let mmkv: MMKV | null = null
try {
  mmkv = createMMKV({ id: 'pom.settings' })
} catch (e) {
  log.warn('app', 'settings: MMKV unavailable in this build, using AsyncStorage', e)
}

/** Settings storage: synchronous when MMKV is there (`readNow`), else AsyncStorage. */
export const settingsStorage = {
  /** The saved value right now, or undefined when MMKV isn't available (then use getItem). */
  // Every call guarded: the web's static render runs in Node, with no
  // localStorage behind MMKV's web build, and a throw there would break the page.
  readNow(key: string): string | null | undefined {
    if (!mmkv) return undefined
    try { return mmkv.getString(key) ?? null } catch { return undefined }
  },
  getItem: (key: string): Promise<string | null> => {
    if (mmkv) { try { return Promise.resolve(mmkv.getString(key) ?? null) } catch { /* fall through */ } }
    return AsyncStorage.getItem(key)
  },
  setItem: (key: string, value: string): Promise<void> => {
    if (mmkv) { try { mmkv.set(key, value); return Promise.resolve() } catch { /* fall through */ } }
    return AsyncStorage.setItem(key, value)
  },
  /** Where settings live in this build, for the diagnostics. */
  kind: (): 'mmkv' | 'async-storage' => (mmkv ? 'mmkv' : 'async-storage'),
}
