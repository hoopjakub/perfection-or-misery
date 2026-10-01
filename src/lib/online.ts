// P8.5-24 (docs/release/02-OFFLINE.md §2.2): is the app online? One answer
// for every screen and the run queue.
//
// The web asks the browser (navigator.onLine and its online/offline events).
// The phone asks expo-network, a native module added 1 Oct 2026: a build made
// before it has no module, so the require is guarded and such a build simply
// reports "online" (the old behaviour: a save that fails says so and retries).
//
// "Online" means a connection that reaches the internet as far as the system
// knows (isInternetReachable when the system says, else isConnected). It's a
// hint, not a promise: a request can still fail, and every caller still
// handles that.
import { useSyncExternalStore } from 'react'
import { Platform } from 'react-native'

let online = true
const listeners = new Set<() => void>()
const emit = (next: boolean) => { if (next !== online) { online = next; listeners.forEach(fn => fn()) } }

let started = false
function start() {
  if (started) return
  started = true
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return
    const sync = () => emit(navigator.onLine)
    sync()
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return
  }
  try {
    const Network = require('expo-network')
    const read = (s: { isConnected?: boolean | null; isInternetReachable?: boolean | null }) =>
      emit(s.isInternetReachable ?? s.isConnected ?? true)
    Network.getNetworkStateAsync().then(read).catch(() => {})
    Network.addNetworkStateListener(read)
  } catch { /* a build without expo-network: stays "online" */ }
}

export const isOnline = () => { start(); return online }
export function onOnlineChange(fn: () => void) { start(); listeners.add(fn); return () => { listeners.delete(fn) } }

/** Whether the app is online, re-rendering when it changes. */
export function useOnline(): boolean {
  return useSyncExternalStore(onOnlineChange, isOnline, isOnline)
}
