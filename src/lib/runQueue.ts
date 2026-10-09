// P8.5-24 (docs/release/02-OFFLINE.md §2.1): a finished run is never lost for
// want of a connection.
//
// Before this, a save that failed was retried only while the result screen was
// open, and gone once you left it. Now a run whose save can't reach the server
// waits here, on the phone, and goes up when the connection is back: on every
// start, whenever the app comes back online, on returning to the foreground,
// and when the player's account is known. Oldest first.
//
// Safe to send twice: each run carries the id the app made for it
// (`client_id`), and the database keeps one run per id (supabase/runs-queue.sql);
// submit-run answers a repeat as a success. So a save that reached the server
// but whose answer was lost can be sent again without counting twice. It's
// dated by when it was played (`played_at`), not when it arrived.
//
// Phase 9.75 (P9.75-06: on the phone a queued run "doesn't seem to appear
// again. Stuck somewhere", and turning the network on or reopening the app
// didn't send it). Three changes, each with its check in verify-run-queue:
//  - Every flush says why it ran and every run held back says why, in the log
//    (`save` category), so the next time a run sticks the log names the step.
//  - A send that never answers (a request started as the connection dropped)
//    times out after SEND_TIMEOUT_MS and counts as offline. Before, the one
//    flush allowed at a time waited on it forever, and every later flush
//    joined the same hung wait for the rest of the session.
//  - A run the server refuses is no longer deleted. It moves to a "couldn't be
//    saved" list with the server's reason, which Diagnostics shows and can
//    send again (a server that refused it for being out of date, say, until
//    it was redeployed). It used to vanish with one log line.
// A guest's run is never queued (a guest's runs aren't kept at all).
//
// The core below takes its storage and its sender as arguments, so
// scripts/verify-run-queue.ts drives it headless with a fake server.
import { create } from 'zustand'
import { log } from '@/diag/log'

export type QueuedRun = { clientId: string; playedAt: string; payload: Record<string, unknown> }
/** A run the server refused, kept with the reason and when it happened. */
export type RefusedRun = QueuedRun & { why: string; refusedAt: string }
/** What sending one run did: in (or already in), not now (with why), or refused for good. */
export type SendOutcome = { result: 'sent'; id?: string } | { result: 'offline'; why?: string } | { result: 'refused'; why: string }
export type QueueDeps = {
  load: () => Promise<QueuedRun[]>
  save: (items: QueuedRun[]) => Promise<void>
  send: (item: QueuedRun) => Promise<SendOutcome>
  loadRefused: () => Promise<RefusedRun[]>
  saveRefused: (items: RefusedRun[]) => Promise<void>
}

export const SEND_TIMEOUT_MS = 20_000

export async function enqueue(deps: QueueDeps, item: QueuedRun): Promise<number> {
  const items = await deps.load()
  if (!items.some(i => i.clientId === item.clientId)) items.push(item)
  await deps.save(items)
  log.info('save', `queue: run kept on the phone (${items.length} waiting)`)
  return items.length
}

/** A send that doesn't answer in time counts as offline, so the flush can end. */
function withTimeout(p: Promise<SendOutcome>, ms: number): Promise<SendOutcome> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve({ result: 'offline', why: `no answer in ${Math.round(ms / 1000)} s` }), ms)
    p.then(r => { clearTimeout(timer); resolve(r) }, e => { clearTimeout(timer); resolve({ result: 'offline', why: String((e as Error)?.message ?? e) }) })
  })
}

/** Send everything waiting, oldest first; stops at the first that can't get through.
 *  ponytail: in order, so a run waiting for another account (someone else
 *  signed in on this phone) holds up the ones behind it; skip past it if that
 *  ever matters. */
export async function flushQueue(
  deps: QueueDeps,
  onSent?: (item: QueuedRun, id?: string) => void,
  opts: { why?: string; timeoutMs?: number } = {},
): Promise<number> {
  let items = await deps.load()
  if (items.length) log.info('save', `queue: flush (${opts.why ?? 'asked'}), ${items.length} waiting`)
  for (const item of [...items]) {
    const out = await withTimeout(deps.send(item), opts.timeoutMs ?? SEND_TIMEOUT_MS)
    if (out.result === 'offline') {
      log.info('save', `queue: held back: ${out.why ?? 'offline'}`)
      break
    }
    if (out.result === 'refused') {
      log.warn('save', `queue: the server refused a run, kept as not saved: ${out.why}`)
      const refused = await deps.loadRefused()
      if (!refused.some(r => r.clientId === item.clientId)) refused.push({ ...item, why: out.why, refusedAt: new Date().toISOString() })
      await deps.saveRefused(refused)
    } else {
      log.info('save', 'queue: run sent')
      onSent?.(item, out.id)
    }
    items = items.filter(i => i.clientId !== item.clientId)
    await deps.save(items)
  }
  return items.length
}

/** "Try them again": the refused runs go back into the queue (and out of the refused list). */
export async function requeueRefused(deps: QueueDeps): Promise<number> {
  const refused = await deps.loadRefused()
  for (const r of refused) await enqueue(deps, { clientId: r.clientId, playedAt: r.playedAt, payload: r.payload })
  await deps.saveRefused([])
  return refused.length
}

/**
 * Whether a change of who's signed in should send the queue. A flush only gets
 * through for a signed-in account (a guest's answer is "not yet"), and the
 * session arrives in two steps: the user first, while `isGuest` still holds its
 * starting `true`, then the profile that turns it false. The old rule fired on
 * the first step only, met "not yet", and never fired again: a queued run
 * waited until the network or the app's foreground changed (P9.75-06, D-3).
 */
export function flushOnUserChange(
  prev: { userId?: string | null; isGuest: boolean },
  next: { userId?: string | null; isGuest: boolean },
): boolean {
  if (!next.userId) return false
  return next.userId !== prev.userId || (prev.isGuest && !next.isGuest)
}

// ── The app's queue ──────────────────────────────────────────────────────────
// How many runs are waiting, and how many the server refused, for the offline
// strip, the save line and Diagnostics.
export const useRunQueue = create<{ count: number; refused: number }>(() => ({ count: 0, refused: 0 }))

const KEY = 'pom-run-queue'
const REFUSED_KEY = 'pom-run-refused'
let deps: QueueDeps | null = null
let flushing: Promise<number> | null = null

/** Wired once, from runs.ts (which owns sending a run). */
export function setRunQueueDeps(d: QueueDeps) {
  deps = d
  d.loadRefused().then(r => useRunQueue.setState({ refused: r.length })).catch(() => {})
}

export async function queueRun(item: QueuedRun): Promise<void> {
  if (!deps) return
  useRunQueue.setState({ count: await enqueue(deps, item) })
}

/** Send what's waiting. One flush at a time; a second call joins the first. */
export function flushRunQueue(onSent?: (item: QueuedRun, id?: string) => void, why?: string): Promise<number> {
  if (!deps) return Promise.resolve(0)
  if (flushing) return flushing
  const d = deps
  flushing = flushQueue(d, onSent, { why })
    .then(async n => { useRunQueue.setState({ count: n, refused: (await d.loadRefused()).length }); return n })
    .catch(e => { log.warn('save', 'run-queue: flush failed', e); return useRunQueue.getState().count })
    .finally(() => { flushing = null })
  return flushing
}

/** The runs waiting on the phone, as they'll be sent (the achievements count them, P9.75-23). */
export const queuedPayloads = async (): Promise<Record<string, unknown>[]> => (deps ? (await deps.load()).map(i => i.payload) : [])

/** The refused runs, for Diagnostics. */
export const refusedRuns = (): Promise<RefusedRun[]> => (deps ? deps.loadRefused() : Promise.resolve([]))

/** Diagnostics' "Try them again". */
export async function retryRefused(onSent?: (item: QueuedRun, id?: string) => void): Promise<number> {
  if (!deps) return 0
  const n = await requeueRefused(deps)
  useRunQueue.setState({ refused: 0, count: (await deps.load()).length })
  if (n) await flushRunQueue(onSent, 'try again')
  return n
}

export const RUN_QUEUE_KEY = KEY
export const RUN_REFUSED_KEY = REFUSED_KEY
