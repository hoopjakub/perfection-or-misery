// The player's own preferences (P8-21), kept on the device.
//
// The first of them is the skip warning: "Skip ahead?" is right the first time
// and a chore the hundredth, so the confirm can switch itself off and the You
// Settings screen can switch it back on. The Settings screen (P8-45,
// app/settings.tsx) reads and writes everything here: the two questions and
// less motion. (No haptics: the maintainer decided this game doesn't need them,
// so they were taken out of the app, P8-45's follow-up.)
//
// Persisted through `settingsStorage` (MMKV, read synchronously at start-up,
// P8-148; AsyncStorage in a build without MMKV — see src/lib/mmkv).
import { create } from 'zustand'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { settingsStorage } from '@/lib/mmkv'

const KEY = 'pom.settings.v1'

type Settings = {
  /** Ask before skipping ahead in a simulation. */
  skipWarning: boolean
  /** Ask before playing without a bench (it drops any subs already drafted). */
  noBenchWarning: boolean
  /** Less motion in the app, on top of the phone's own setting (which always
   *  applies): see src/hooks/useReducedMotion.ts. */
  reduceMotion: boolean
}

/** The last run you finished: the one thing "LAST TIME" and Home's "Again"
 *  both mean. They used to read two different places — the tags read the
 *  in-memory game store (which the next pick overwrote, and a reload wiped),
 *  Again read the newest saved run from the database (which a guest never
 *  has) — so they could disagree. Now both read this, written once when a
 *  finished run reaches its result screen (useRunSave). */
export type LastRun = { mode: string; difficulty: string | null }

type SettingsStore = Settings & {
  lastRun: LastRun | null
  setLastRun: (r: LastRun) => void
  setSkipWarning: (on: boolean) => void
  setNoBenchWarning: (on: boolean) => void
  setReduceMotion: (on: boolean) => void
}

const DEFAULTS: Settings = { skipWarning: true, noBenchWarning: true, reduceMotion: false }
const KEYS = Object.keys(DEFAULTS) as (keyof Settings)[]
type Saved = Settings & { lastRun: LastRun | null }
const pick = (s: Saved): Saved => ({ ...Object.fromEntries(KEYS.map(k => [k, s[k]])) as Settings, lastRun: s.lastRun })

function save(s: Saved) {
  settingsStorage.setItem(KEY, JSON.stringify(s)).catch(e => console.warn('[settings] save failed:', e))
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...DEFAULTS,
  lastRun: null,
  setLastRun: (r) => { set({ lastRun: r }); save(pick(get())) },
  setSkipWarning: (on) => { set({ skipWarning: on }); save(pick(get())) },
  setNoBenchWarning: (on) => { set({ noBenchWarning: on }); save(pick(get())) },
  setReduceMotion: (on) => { set({ reduceMotion: on }); save(pick(get())) },
}))

// Read once at start-up. A missing or damaged entry leaves the defaults.
function adopt(raw: string | null) {
  if (!raw) return
  try {
    const s = JSON.parse(raw) as Partial<Saved>
    for (const k of KEYS) if (typeof s[k] === 'boolean') useSettingsStore.setState({ [k]: s[k] } as Partial<Settings>)
    if (s.lastRun && typeof s.lastRun.mode === 'string') useSettingsStore.setState({ lastRun: s.lastRun })
  } catch (e) { console.warn('[settings] damaged entry, defaults kept:', e) }
}

// P8-148: on MMKV the saved settings are read here and now, before any screen
// draws. The first launch on MMKV brings over what AsyncStorage held.
const now = settingsStorage.readNow(KEY)
// The web's static render runs in Node, with no storage at all: nothing to
// read there, and the page loads the settings for real in the browser.
const rendering = Platform.OS === 'web' && typeof window === 'undefined'
if (!rendering) {
  if (now !== undefined) {
    if (now) adopt(now)
    else AsyncStorage.getItem(KEY).then(old => { if (old) { adopt(old); save(pick(useSettingsStore.getState())) } }).catch(() => {})
  } else {
    settingsStorage.getItem(KEY).then(adopt).catch(e => console.warn('[settings] load failed:', e))
  }
}
