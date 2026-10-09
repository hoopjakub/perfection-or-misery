// P9.75 (the phone, 9 Oct 2026): "loading of stuff like your runs, profile,
// ranks… it takes some time to load and for runs you don't even see the ghost
// outlines and the sorting arrives after it… same for You, where you don't see
// your stats and the colours of the banner for a second or two… think of how
// the game does stuff, does it make sense?"
//
// It didn't. Every tab refetched from nothing each time it came into view, and
// kept nothing between visits or launches, so each visit replayed the arrival:
// zeros, a default banner, then the real thing popping in, piece by piece.
// Now a screen shows what it showed last time, at once (the session's copy, or
// the one kept on the phone from the last launch, read synchronously from
// MMKV so it's the very first frame), and refreshes it quietly; a change lands
// in place. Ghost rows and the settle floor (src/lib/loading.ts) are left for
// the one load that has nothing to show yet: a phone's first.
//
// Keys carry the user's id, so one account never sees another's.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { settingsStorage } from './mmkv'
import { settled } from './loading'
import { log } from '@/diag/log'

const PREFIX = 'pom-kept-'
const memory = new Map<string, unknown>()

/** The last answer for `key`, from this session or the last one; undefined if none. */
export function readKept<T>(key: string): T | undefined {
  if (memory.has(key)) return memory.get(key) as T
  const raw = settingsStorage.readNow(PREFIX + key)
  if (!raw) return undefined
  try { const v = JSON.parse(raw) as T; memory.set(key, v); return v } catch { return undefined }
}

export function keep<T>(key: string, value: T): void {
  memory.set(key, value)
  settingsStorage.setItem(PREFIX + key, JSON.stringify(value)).catch(() => {})
}

/** Change a kept answer in place (only one that exists): what a screen
 *  will show next, before the server says so. The next fetch replaces it. */
export function keepUpdate<T>(key: string, fn: (v: T) => T): void {
  const v = readKept<T>(key)
  if (v !== undefined) keep(key, fn(v))
}

/**
 * For a screen with its own load() (it loads again after an action: joining a
 * club, answering a request): the answer is kept under `key` when it lands, and
 * the settle floor applies only while nothing was kept. Seed the screen's first
 * state from readKept(key) so it opens on what it showed last time.
 */
export function arrive<T>(key: string, p: Promise<T>): Promise<T> {
  return (readKept(key) === undefined ? settled(p) : p).then(v => { keep(key, v); return v })
}

/**
 * `fetcher`'s answer for `key`, refetched whenever the screen comes into view
 * or `key` changes. `data` is the kept answer until the new one lands, so it's
 * undefined only when nothing was ever fetched for this key (show ghosts then).
 * A null `key` (no user yet) fetches nothing.
 */
export function useKept<T>(key: string | null, fetcher: () => Promise<T>, what: string): { data: T | undefined; failed: boolean; reload: () => void } {
  const [data, setData] = useState<T | undefined>(() => (key ? readKept<T>(key) : undefined))
  const [failed, setFailed] = useState(false)
  const [tick, setTick] = useState(0)
  const fetchRef = useRef(fetcher)
  fetchRef.current = fetcher
  // Another key (a filter, a page): its own kept answer at once, if any.
  const shownKey = useRef(key)
  useEffect(() => {
    if (shownKey.current === key) return
    shownKey.current = key
    setData(key ? readKept<T>(key) : undefined)
    setFailed(false)
  }, [key])
  useFocusEffect(useCallback(() => {
    if (!key) return
    let active = true
    const fresh = fetchRef.current()
    // Nothing to show yet: the first arrival keeps its floor. Otherwise the
    // kept answer is on screen and the new one just replaces it.
    ;(readKept(key) === undefined ? settled(fresh) : fresh)
      .then(v => { keep(key, v); if (active) { setData(v); setFailed(false) } })
      .catch(e => { log.warn('net', `${what}: load failed`, e); if (active) setFailed(true) })
    return () => { active = false }
  }, [key, tick]))
  return { data, failed, reload: useCallback(() => setTick(n => n + 1), []) }
}
