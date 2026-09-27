import { router } from 'expo-router'

// One tap, one screen (the maintainer, 23 Sept: "you can double tap on stuff to
// open it more than one times"). A second tap before the first screen arrived
// pushed the route twice — two match sheets, two player pages stacked.
//
// Fixed once here rather than at 83 call sites: router.push / navigate /
// replace are wrapped so that
//  - the SAME navigation again within DUPLICATE_MS is dropped (the double tap),
//  - and any navigation marks the app "busy" until the navigation state moves
//    (NavGuard, in the root layout, blocks every tap meanwhile and shows that
//    it's loading).
// A different navigation during that window still goes through: a screen that
// redirects itself as it mounts (a missing run sending you home) must never be
// swallowed. Only a person's second tap is blocked, by NavGuard's layer.

const DUPLICATE_MS = 800
let last: { key: string; at: number } | null = null
let busy = false
const listeners = new Set<() => void>()

// The tap bar for a button that doesn't go anywhere (the maintainer, 24 Sept:
// Home, Pause, Skip gave nothing but a darker press). A pulse shows the same
// bar for PULSE_MS without blocking anything — the press is acknowledged, the
// app stays usable. Plates, list rows and the back control send it.
const PULSE_MS = 450
// A flag a timer turns off (not "now < until": a store snapshot must not
// change between two reads of the same render).
let pulseOn = false
let pulseTimer: ReturnType<typeof setTimeout> | null = null
export const pulseActive = () => pulseOn
export function pulseTap() {
  pulseOn = true
  if (pulseTimer) clearTimeout(pulseTimer)
  pulseTimer = setTimeout(() => { pulseOn = false; listeners.forEach(fn => fn()) }, PULSE_MS)
  listeners.forEach(fn => fn())
}

export const isNavBusy = () => busy
export function subscribeNavBusy(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } }
export function setNavBusy(on: boolean) {
  if (busy === on) return
  busy = on
  listeners.forEach(fn => fn())
}

let installed = false
export function installNavGuard() {
  if (installed) return
  installed = true
  // back and the dismisses leave a screen too: busy (the layer and the bar)
  // until the navigation state moves, but never dropped as duplicates — a
  // quick second back is a real second back.
  for (const method of ['back', 'dismiss', 'dismissAll'] as const) {
    const original = router[method].bind(router) as (...args: unknown[]) => void
    ;(router as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => {
      setNavBusy(true)
      original(...args)
    }
  }
  for (const method of ['push', 'navigate', 'replace'] as const) {
    const original = router[method].bind(router) as (...args: unknown[]) => void
    ;(router as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => {
      const key = `${method}:${JSON.stringify(args[0])}`
      const now = Date.now()
      if (last && last.key === key && now - last.at < DUPLICATE_MS) return
      last = { key, at: now }
      setNavBusy(true)
      original(...args)
    }
  }
}
