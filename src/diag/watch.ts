// Phase 9, Diagnostics step 2 (docs/diagnostics/02-POM-ARCHITECTURE.md §3.3,
// 03-BUDGETS.md §2.6): what the app watches while it runs.
//
// Stalls. React Native has no long-task API we can count on, so a 250 ms
// timer measures how late each tick fires: over 50 ms late means the JS thread
// was blocked for about that long. Each stall remembers the screen and the
// timed work still open, so a report says "840 ms on /game/result during
// stats:league", not just that something was slow (The Dugout said "self").
//
// Memory. The JS heap every 10 s, where the engine says: Chromium's
// performance.memory on the web, Hermes' instrumented stats on the phone.
// Neither is promised, so the first reading logs which source answered (the
// plan's "probe", answered by the maintainer's first log from the phone).
//
// Both stop in the background, and spans that cross it are dropped (perf.ts).
import { AppState, Platform } from 'react-native'
import { sample, openKey, wentBackground, inSelfTest } from './perf'
import { log } from './log'

const TICK = 250
const STALL = 50

let route = '/'
/** The root layout says where we are; a stall is pinned to it. */
export const setRoute = (path: string) => { route = path }

export type Stall = { ms: number; route: string; during?: string; at: number }
let worst: Stall | null = null
let stalls = 0
export const stallSummary = () => ({ count: stalls, worst })

let tickTimer: ReturnType<typeof setTimeout> | null = null
let memTimer: ReturnType<typeof setInterval> | null = null
let expected = 0
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

function tick() {
  const late = now() - expected
  // The self-test's own busy loops aren't the app's stalls (04-CHECKS §1).
  if (late > STALL && !inSelfTest()) {
    stalls++
    sample('stall:js', late)
    const s: Stall = { ms: Math.round(late), route, during: openKey(), at: Date.now() }
    if (!worst || s.ms > worst.ms) worst = s
    // The long ones are worth a line of their own in the log.
    if (late > 200) log.info('app', `stall ${s.ms} ms on ${route}${s.during ? ` during ${s.during}` : ''}`)
  }
  expected = now() + TICK
  tickTimer = setTimeout(tick, TICK)
}

let memSource: string | null = null
/** The JS heap in MB where the engine says, else undefined. */
export function heapMB(): number | undefined {
  const pm = (globalThis as any).performance?.memory
  if (pm?.usedJSHeapSize) { memSource ??= 'performance.memory'; return pm.usedJSHeapSize / 1048576 }
  const hs = (globalThis as any).HermesInternal?.getInstrumentedStats?.()
  const bytes = hs?.js_heapSize ?? hs?.js_allocatedBytes
  if (typeof bytes === 'number') { memSource ??= 'HermesInternal'; return bytes / 1048576 }
  return undefined
}
let memLogged = false
function pollMemory() {
  const mb = heapMB()
  if (mb !== undefined) sample('mem:js', mb)
  if (!memLogged) {
    memLogged = true
    log.info('app', mb !== undefined ? `memory read from ${memSource}: ${Math.round(mb)} MB` : `no memory reading on this engine (${Platform.OS})`)
  }
}

function start() {
  if (tickTimer) return
  expected = now() + TICK
  tickTimer = setTimeout(tick, TICK)
  pollMemory()
  memTimer = setInterval(pollMemory, 10_000)
}
function stop() {
  if (tickTimer) clearTimeout(tickTimer)
  if (memTimer) clearInterval(memTimer)
  tickTimer = null; memTimer = null
}

let watching = false
export function startWatching(): void {
  if (watching) return
  watching = true
  // The web's static render runs this in Node at build time; nothing to watch there.
  if (typeof window === 'undefined' && Platform.OS === 'web') return
  start()
  AppState.addEventListener('change', st => {
    if (st === 'active') { start(); log.info('app', 'back in the foreground') }
    else { stop(); wentBackground(); log.info('app', `to the background (${st})`) }
  })
  // The probe for a real long-task feed (Chromium on the web; maybe Hermes
  // one day). Kept apart from stall:js, never merged into it.
  try {
    const PO = (globalThis as any).PerformanceObserver
    if (PO?.supportedEntryTypes?.includes('longtask')) {
      new PO((list: any) => { for (const e of list.getEntries()) sample('stall:observed', e.duration) }).observe({ entryTypes: ['longtask'] })
      log.info('app', 'long tasks observed')
    }
  } catch { /* not on this engine */ }
}
