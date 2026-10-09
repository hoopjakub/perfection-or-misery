/**
 * P8.5-24: the offline run queue (src/lib/runQueue.ts), against a fake server.
 *
 *   - a run that can't reach the server is queued, not lost;
 *   - a flush sends it once, and it leaves the queue;
 *   - a save that DID reach the server but whose answer was lost, sent again
 *     from the queue, is kept once (the server's unique client_id), not twice;
 *   - the run keeps the time it was played, not the time it was sent;
 *   - a run the server refuses leaves the queue but is KEPT as not saved, with
 *     its reason, and "try them again" puts it back (P9.75-06; it used to vanish);
 *   - a send that never answers times out, so the next flush isn't stuck behind it;
 *   - the queue is sent when the account becomes known, not only when the user
 *     id first arrives (the start-up race, P9.75-06 D-3);
 *   - offline, a flush sends nothing and keeps everything, in order;
 *   - queueing the same run twice keeps one.
 */
import { enqueue, flushQueue, requeueRefused, flushOnUserChange, type QueueDeps, type QueuedRun, type RefusedRun, type SendOutcome } from '../src/lib/runQueue'

let failures = 0
const check = (c: boolean, msg: string) => { if (!c) { failures++; console.log(`❌ ${msg}`) } }

// The fake server: a table keyed by client_id (unique, as supabase/runs-queue.sql
// makes it), a switch for the connection, and rows it refuses.
function world() {
  const table = new Map<string, { playedAt: string; at: number }>()
  let stored: QueuedRun[] = []
  let refusedStore: RefusedRun[] = []
  const state = { online: true, refuse: new Set<string>(), hang: false, sends: 0, clock: 1000 }
  const deps: QueueDeps = {
    load: async () => stored.map(i => ({ ...i })),
    save: async items => { stored = items.map(i => ({ ...i })) },
    loadRefused: async () => refusedStore.map(i => ({ ...i })),
    saveRefused: async items => { refusedStore = items.map(i => ({ ...i })) },
    send: async (item): Promise<SendOutcome> => {
      state.sends++
      if (state.hang) return new Promise<SendOutcome>(() => {})   // a request that never answers
      if (!state.online) return { result: 'offline' }
      if (state.refuse.has(item.clientId)) return { result: 'refused', why: 'impossible row' }
      if (!table.has(item.clientId)) table.set(item.clientId, { playedAt: item.playedAt, at: state.clock++ })
      return { result: 'sent', id: `id-${item.clientId}` }
    },
  }
  return { table, deps, state, stored: () => stored, refused: () => refusedStore }
}
const run = (n: number): QueuedRun => ({ clientId: `c${n}`, playedAt: `2026-10-0${n}T20:00:00Z`, payload: { tier: 'winner', n } })

;(async () => {
  // Queued while offline, then sent once on the way back.
  {
    const w = world()
    w.state.online = false
    await enqueue(w.deps, run(1))
    await enqueue(w.deps, run(2))
    check(w.stored().length === 2, 'two offline runs were not both queued')
    check((await flushQueue(w.deps)) === 2 && w.table.size === 0, 'an offline flush sent something or dropped something')
    check(w.stored().map(i => i.clientId).join() === 'c1,c2', 'the queue lost its order')
    w.state.online = true
    const sent: string[] = []
    const left = await flushQueue(w.deps, i => sent.push(i.clientId))
    check(left === 0 && w.stored().length === 0, 'the queue did not empty once online')
    check(sent.join() === 'c1,c2', `sent out of order: ${sent.join()}`)
    check(w.table.size === 2, 'not every run reached the server')
    check(w.table.get('c1')!.playedAt === run(1).playedAt, 'a queued run lost the time it was played')
    await flushQueue(w.deps)
    check(w.table.size === 2, 'a second flush sent something again')
  }
  // The answer was lost: the server has the run, the phone still queues it.
  {
    const w = world()
    await w.deps.send(run(3))          // it reached the server…
    await enqueue(w.deps, run(3))      // …but the phone never heard, so queued it
    await flushQueue(w.deps)
    check(w.table.size === 1, `a run sent twice is in the table ${w.table.size} times`)
    check(w.stored().length === 0, 'the duplicate stayed in the queue')
  }
  // Refused: out of the queue, kept as not saved with its reason, the next one
  // still goes; "try them again" sends it once the server takes it.
  {
    const w = world()
    w.state.refuse.add('c4')
    await enqueue(w.deps, run(4))
    await enqueue(w.deps, run(5))
    await flushQueue(w.deps)
    check(w.stored().length === 0, 'a refused run stayed in the queue')
    check(w.table.has('c5') && !w.table.has('c4'), 'the run after a refused one did not go')
    check(w.refused().length === 1 && w.refused()[0].clientId === 'c4' && w.refused()[0].why === 'impossible row', 'a refused run was lost instead of kept with its reason')
    w.state.refuse.delete('c4')
    check((await requeueRefused(w.deps)) === 1 && w.refused().length === 0 && w.stored().length === 1, '"try them again" did not move the run back into the queue')
    await flushQueue(w.deps)
    check(w.table.has('c4') && w.stored().length === 0, 'a run sent again was not saved')
  }
  // A send that never answers: the flush gives up on it and ends, the run stays,
  // and the next flush (connection fine) sends it.
  {
    const w = world()
    await enqueue(w.deps, run(7))
    w.state.hang = true
    const t0 = Date.now()
    const left = await flushQueue(w.deps, undefined, { timeoutMs: 50 })
    check(left === 1 && w.stored().length === 1, 'a hung send lost the run or emptied the queue')
    check(Date.now() - t0 < 2000, 'a hung send held the flush past its timeout')
    w.state.hang = false
    await flushQueue(w.deps, undefined, { timeoutMs: 50 })
    check(w.table.has('c7'), 'the flush after a hung one did not send the run')
  }
  // The session arrives in two steps: the user (still a guest), then the profile.
  {
    const guest = { userId: null, isGuest: true }, userStillGuest = { userId: 'u1', isGuest: true }, account = { userId: 'u1', isGuest: false }
    check(flushOnUserChange(guest, userStillGuest), 'no flush when the user first arrives')
    check(flushOnUserChange(userStillGuest, account), 'no flush when the account becomes known (the start-up race)')
    check(!flushOnUserChange(account, account), 'a flush on a change that changed nothing')
    check(!flushOnUserChange(account, guest), 'a flush on signing out')
  }
  // The same run queued twice is one run.
  {
    const w = world()
    await enqueue(w.deps, run(6)); await enqueue(w.deps, run(6))
    check(w.stored().length === 1, 'the same run was queued twice')
  }

  // S-2 (Phase 9.75): submit-run refuses an 11th run in a minute, counted by
  // when runs arrived (a queued run's created_at is backdated), and the app
  // keeps a run that met the limit queued instead of dropping it as refused.
  // The function runs on Deno and the app's sender on the phone, so both are
  // read from their source.
  {
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const fn = fs.readFileSync(path.join(__dirname, '../supabase/functions/submit-run/index.ts'), 'utf8')
    const limit = Number(fn.match(/RUNS_PER_MINUTE = (\d+)/)?.[1])
    check(limit === 10, `submit-run has no per-minute limit of 10 (found ${limit || 'none'})`)
    check(/\.gte\('received_at'/.test(fn) && /RUNS_PER_MINUTE\) return json\([^)]*\}, 429\)/.test(fn), "submit-run doesn't count arrivals in the last minute and answer 429")
    const sql = fs.readFileSync(path.join(__dirname, '../supabase/rate-limit.sql'), 'utf8')
    check(/received_at timestamptz not null default now\(\)/.test(sql), 'rate-limit.sql has no received_at column')
    const app = fs.readFileSync(path.join(__dirname, '../src/db/queries/runs.ts'), 'utf8')
    check(/status === 429/.test(app.match(/function offlineError[\s\S]*?\n\}/)?.[0] ?? ''), 'the app drops a run the limit turned away, instead of keeping it queued')
  }

  console.log(`${failures} failed`)
  if (failures === 0) console.log('✅ ALL CHECKS PASSED')
  process.exit(failures === 0 ? 0 : 1)
})()
