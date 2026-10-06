// Phase 9, Diagnostics step 1 (docs/diagnostics/02-POM-ARCHITECTURE.md §4):
// the app's one log. About ninety console.warn/console.error calls used to go
// to a console nobody sees on a phone. They come here: a ring of the last
// 1,000 lines in memory, in named categories (the maintainer, 1 Oct: "every
// action and everything that happens … in named categories", so he can send
// exactly the slice asked for). Warnings and errors are also kept on the
// device, so the next launch can show what went wrong before a crash.
//
// Where a line can be read: the Diagnostics screen and its log (every build);
// the Metro terminal in development; and, on the phone, Android's own log in
// EVERY build, so a release build on the maintainer's phone can be watched
// live from a PC (`adb logcat -s ReactNativeJS`, each line starts "POM").
//
// No React, no RN: the storage is handed in by src/diag/install.ts, and
// scripts can import anything that logs.

export type Level = 'debug' | 'info' | 'warn' | 'error'
export type Cat =
  | 'boot' | 'db' | 'sim' | 'stats' | 'deep' | 'ui' | 'save' | 'net' | 'auth' | 'app'
  | 'run'      // a run's start and end (RUN STARTED / RUN ENDED)
  | 'screen'   // a screen opened, drawn, left
  | 'perf'     // a timed operation: how long, and the memory in use after it
export type Entry = {
  t: number          // ms since 1970
  level: Level
  cat: Cat
  msg: string
  data?: string      // already made safe and short
  ctx?: string       // where in a run: "league MD12", "ucl QF L2"
  run?: string       // the run it belongs to (RUN STARTED's tag), for "this run only"
  prev?: true        // from an earlier session, read back at start-up
}

// 1,000, was 300: the maintainer asked for "an absurd amount", and a run with
// its perf and screen lines is a few hundred on its own. Small objects; the
// memory is a few hundred KB at most.
const RING = 1000
const KEEP = 100     // warnings and errors kept on the device
const entries: Entry[] = []
// This session's warnings and errors, kept apart from the ring: a burst of
// info lines mustn't push one out before it's written to the device.
const trouble: Entry[] = []

// `debug` lines are dropped unless Diagnostics has been opened this session
// (or a development build), the same switch The Dugout uses.
let debugOn = typeof __DEV__ !== 'undefined' ? __DEV__ : false
export const enableDebugLog = () => { debugOn = true }

let context: string | undefined
/** Set by the run's screens as it moves on; cleared when the run ends. */
export const setLogContext = (ctx?: string) => { context = ctx }

/** An error or a Supabase answer, as a short line with nothing personal in it. */
function describe(data: unknown): string | undefined {
  if (data === undefined) return undefined
  let s: string
  if (data instanceof Error) s = `${data.name}: ${data.message}`
  else if (typeof data === 'string') s = data
  else {
    try {
      // Supabase errors carry message/code/status; anything else, as JSON.
      const o = data as Record<string, unknown>
      s = o && typeof o === 'object' && ('message' in o || 'code' in o)
        ? [o.code, o.status, o.message].filter(v => v != null).join(' ')
        : JSON.stringify(data)
    } catch { s = String(data) }
  }
  return s.length > 300 ? s.slice(0, 297) + '…' : s
}

// Who also gets each line on the console. The phone: always, because there
// the console IS Android's log, readable over USB from a release build (the
// maintainer's VS Code terminal). The web: only in development, so a player's
// browser console stays quiet. Node (the scripts): always.
const isPhone = typeof navigator !== 'undefined' && (navigator as any).product === 'ReactNative'
const isDev = typeof __DEV__ !== 'undefined' && __DEV__
const mirror = isPhone || isDev || typeof window === 'undefined'
const stamp = (t: number) => new Date(t).toISOString().slice(11, 23)

function write(level: Level, cat: Cat, msg: string, data?: unknown) {
  if (level === 'debug' && !debugOn) return
  const e: Entry = { t: Date.now(), level, cat, msg, data: describe(data), ctx: context, run: run?.tag }
  entries.push(e)
  if (entries.length > RING) entries.shift()
  if (mirror) {
    const line = `POM ${stamp(e.t)} ${level} ${cat}${e.ctx ? ` [${e.ctx}]` : ''} ${msg}`
    if (level === 'error') console.error(line, data ?? '')
    else if (level === 'warn') console.warn(line, data ?? '')
    else console.log(line, data ?? '')   // the one console.log the app keeps
  }
  if (level === 'warn' || level === 'error') {
    trouble.push(e)
    if (trouble.length > KEEP) trouble.shift()
    persistSoon()
  }
}

export const log = {
  debug: (cat: Cat, msg: string, data?: unknown) => write('debug', cat, msg, data),
  info:  (cat: Cat, msg: string, data?: unknown) => write('info', cat, msg, data),
  warn:  (cat: Cat, msg: string, data?: unknown) => write('warn', cat, msg, data),
  error: (cat: Cat, msg: string, data?: unknown) => write('error', cat, msg, data),
}

/** Newest last. */
export const logEntries = (): readonly Entry[] => entries

// ── Kept on the device ───────────────────────────────────────────────────────
export type LogStore = { read: () => string | null | undefined | Promise<string | null | undefined>; write: (s: string) => void | Promise<void> }
let store: LogStore | null = null
let timer: ReturnType<typeof setTimeout> | null = null

function persistNow() {
  if (timer) { clearTimeout(timer); timer = null }
  if (!store) return
  try { Promise.resolve(store.write(JSON.stringify(trouble))).catch(() => {}) } catch { /* nowhere left to say so */ }
}
// Debounced: a noisy moment writes once, two seconds after it settles.
function persistSoon() {
  if (!store || timer) return
  timer = setTimeout(persistNow, 2000)
}
/** Write now: a fatal error is about to end the session. */
export const flushLog = persistNow

/** Wire the device's storage, and read the last session's warnings and errors back in, marked `prev`. */
export async function attachLogStore(s: LogStore): Promise<void> {
  store = s
  try {
    const old = JSON.parse((await s.read()) || '[]') as Entry[]
    if (Array.isArray(old) && old.length) {
      entries.unshift(...old.filter(e => !e.prev).map(e => ({ ...e, prev: true as const })))
      if (entries.length > RING) entries.splice(0, entries.length - RING)
    }
  } catch { /* a damaged entry: start clean */ }
  // They're in memory now. Clear the stored copy, or a quiet session would
  // show the same old trouble as "last session" again next time.
  persistNow()
}

// ── A run's start and end (the maintainer, 1 Oct: RUN STARTED / RUN ENDED) ───
// The tag is made here, four characters, so the lines of one run can be picked
// out of a log; it's not the saved run's id and means nothing outside it.
let run: { tag: string; mode: string; at: number } | null = null
export function runStarted(mode: string, detail = ''): void {
  run = { tag: Math.random().toString(36).slice(2, 6), mode, at: Date.now() }
  context = mode
  saveLedger.run = saveLedger.career = 'not attempted'   // a new run hasn't been saved yet
  write('info', 'run', `RUN STARTED ${run.tag} · ${mode}${detail ? ` · ${detail}` : ''}`)
}
export function runEnded(how: 'finished' | 'abandoned'): void {
  if (!run) return
  write('info', 'run', `RUN ENDED ${run.tag} · ${run.mode} · ${how} after ${Math.round((Date.now() - run.at) / 1000)} s`)
  run = null
  context = undefined
}

// ── The save ledger (docs/diagnostics/04-CHECKS.md §6) ───────────────────────
// Whether THIS run was saved, said plainly, for the Diagnostics screen.
export const saveLedger = { run: 'not attempted', career: 'not attempted', schemaRetries: 0 }
export function noteSave(part: 'run' | 'career', state: string): void {
  if (saveLedger[part] === state) return
  saveLedger[part] = state
  write('info', 'save', `${part}: ${state}`)
}
export function noteSchemaRetry(): void { saveLedger.schemaRetries++ }
