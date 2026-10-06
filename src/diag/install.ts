// Phase 9, Diagnostics step 1 (docs/diagnostics/02-POM-ARCHITECTURE.md §4.3):
// where the log meets the device. Called once, first thing, from the root
// layout. Three jobs:
//   1. Keep warnings and errors on the device. MMKV, not AsyncStorage: its
//      writes are synchronous, so the line written as a fatal error ends the
//      session actually lands (the web: localStorage, also synchronous).
//   2. Catch a fatal JS error (the phone) or an uncaught one (the web), log it
//      with where it happened, write the log now, then let the old handler run
//      so the app behaves as it did before.
//   3. Mark where this session starts.
import { Platform } from 'react-native'
import { settingsStorage } from '@/lib/mmkv'
import { log, flushLog, attachLogStore } from './log'
import { startWatching, heapMB } from './watch'
import { setSampleListener } from './perf'

const KEY = 'pom.diag.log.v1'
let installed = false

export function installDiagnostics(): void {
  if (installed) return
  installed = true
  attachLogStore({ read: () => settingsStorage.getItem(KEY), write: s => settingsStorage.setItem(KEY, s) })
    .then(() => log.info('boot', `session started (${Platform.OS})`))

  startWatching()
  // The maintainer's "every action … with its time and its cost": every timed
  // operation is a perf line with the memory in use after it. Not the ones
  // that come by the hundred (a frame, a match sheet: the run's stats line
  // already covers its sheets) or that log themselves (stalls, memory).
  setSampleListener((key, ms) => {
    if (/^(frame|stall|mem|bench):|^detail:generate$/.test(key)) return
    const mb = heapMB()
    log.info('perf', `${key} ${ms >= 100 ? Math.round(ms) : ms.toFixed(1)} ms${mb !== undefined ? ` · heap ${Math.round(mb)} MB` : ''}`)
  })
  // The web console can run the self-test before the Diagnostics screen exists:
  // `await runSelfTest()`. Loaded on first use, not at start-up (it brings the
  // golden fingerprint, 78 KB).
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    (globalThis as any).runSelfTest = (...a: unknown[]) => import('./checks').then(m => (m.runSelfTest as any)(...a))
  }

  const EU = (globalThis as any).ErrorUtils
  if (EU?.getGlobalHandler && EU?.setGlobalHandler) {
    const previous = EU.getGlobalHandler()
    EU.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      log.error('app', isFatal ? 'fatal error' : 'uncaught error', error)
      flushLog()
      previous?.(error, isFatal)
    })
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.addEventListener('error', e => { log.error('app', 'uncaught error', e.error ?? e.message); flushLog() })
    window.addEventListener('unhandledrejection', e => { log.error('app', 'unhandled promise', e.reason); flushLog() })
  }
}
