// P8.5-24 (docs/release/02-OFFLINE.md §2.1): a finished run is never lost for
// want of a connection.
//
// Before this, a save that failed was retried only while the result screen was
// open, and gone once you left it. Now a run whose save can't reach the server
// waits here, on the phone, and goes up when the connection is back: on every
// start, whenever the app comes back online, and on returning to the
// foreground. Oldest first.
//
// Safe to send twice: each run carries the id the app made for it
// (`client_id`), and the database keeps one run per id (supabase/runs-queue.sql);
// submit-run answers a repeat as a success. So a save that reached the server
// but whose answer was lost can be sent again without counting twice. It's
// dated by when it was played (`played_at`), not when it arrived.
//
// A run the server refuses (an impossible row) is dropped from the queue with
// a log line: it would be refused every time. A guest's run is never queued
// (a guest's runs aren't kept at all).
//
// The core below takes its storage and its sender as arguments, so
// scripts/verify-run-queue.ts drives it headless with a fake server.
import { create } from 'zustand'

export type QueuedRun = { clientId: string; playedAt: string; payload: Record<string, unknown> }
/** What sending one run did: in (or already in), not reachable, or refused for good. */
export type SendOutcome = { result: 'sent'; id?: string } | { result: 'offline' } | { result: 'refused'; why: string }
export type QueueDeps = {
  load: () => Promise<QueuedRun[]>
  save: (items: QueuedRun[]) => Promise<void>
  send: (item: QueuedRun) => Promise<SendOutcome>
}

export async function enqueue(deps: QueueDeps, item: QueuedRun): Promise<number> {
  const items = await deps.load()
  if (!items.some(i => i.clientId === item.clientId)) items.push(item)
  await deps.save(items)
  return items.length
}

/** Send everything waiting, oldest first; stops at the first that can't get through.
 *  ponytail: in order, so a run waiting for another account (someone else
 *  signed in on this phone) holds up the ones behind it; skip past it if that
 *  ever matters. */
export async function flushQueue(deps: QueueDeps, onSent?: (item: QueuedRun, id?: string) => void): Promise<number> {
  let items = await deps.load()
  for (const item of [...items]) {
    const out = await deps.send(item)
    if (out.result === 'offline') break
    if (out.result === 'refused') console.warn(`[run-queue] dropped a run the server refused: ${out.why}`)
    else onSent?.(item, out.id)
    items = items.filter(i => i.clientId !== item.clientId)
    await deps.save(items)
  }
  return items.length
}

// ── The app's queue ──────────────────────────────────────────────────────────
// How many runs are waiting, for the offline strip and the save line.
export const useRunQueue = create<{ count: number }>(() => ({ count: 0 }))

const KEY = 'pom-run-queue'
let deps: QueueDeps | null = null
let flushing: Promise<number> | null = null

/** Wired once, from runs.ts (which owns sending a run). */
export function setRunQueueDeps(d: QueueDeps) { deps = d }

export async function queueRun(item: QueuedRun): Promise<void> {
  if (!deps) return
  useRunQueue.setState({ count: await enqueue(deps, item) })
}

/** Send what's waiting. One flush at a time; a second call joins the first. */
export function flushRunQueue(onSent?: (item: QueuedRun, id?: string) => void): Promise<number> {
  if (!deps) return Promise.resolve(0)
  if (flushing) return flushing
  const d = deps
  flushing = flushQueue(d, onSent)
    .then(n => { useRunQueue.setState({ count: n }); return n })
    .catch(e => { console.warn('[run-queue] flush failed:', e); return useRunQueue.getState().count })
    .finally(() => { flushing = null })
  return flushing
}

export const RUN_QUEUE_KEY = KEY
