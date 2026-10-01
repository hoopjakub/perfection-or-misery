/**
 * P8.5-24: the offline run queue (src/lib/runQueue.ts), against a fake server.
 *
 *   - a run that can't reach the server is queued, not lost;
 *   - a flush sends it once, and it leaves the queue;
 *   - a save that DID reach the server but whose answer was lost, sent again
 *     from the queue, is kept once (the server's unique client_id), not twice;
 *   - the run keeps the time it was played, not the time it was sent;
 *   - a run the server refuses is dropped (it would be refused every time);
 *   - offline, a flush sends nothing and keeps everything, in order;
 *   - queueing the same run twice keeps one.
 */
import { enqueue, flushQueue, type QueueDeps, type QueuedRun, type SendOutcome } from '../src/lib/runQueue'

let failures = 0
const check = (c: boolean, msg: string) => { if (!c) { failures++; console.log(`❌ ${msg}`) } }

// The fake server: a table keyed by client_id (unique, as supabase/runs-queue.sql
// makes it), a switch for the connection, and rows it refuses.
function world() {
  const table = new Map<string, { playedAt: string; at: number }>()
  let stored: QueuedRun[] = []
  const state = { online: true, refuse: new Set<string>(), sends: 0, clock: 1000 }
  const deps: QueueDeps = {
    load: async () => stored.map(i => ({ ...i })),
    save: async items => { stored = items.map(i => ({ ...i })) },
    send: async (item): Promise<SendOutcome> => {
      state.sends++
      if (!state.online) return { result: 'offline' }
      if (state.refuse.has(item.clientId)) return { result: 'refused', why: 'impossible row' }
      if (!table.has(item.clientId)) table.set(item.clientId, { playedAt: item.playedAt, at: state.clock++ })
      return { result: 'sent', id: `id-${item.clientId}` }
    },
  }
  return { table, deps, state, stored: () => stored }
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
  // Refused for good: dropped, and the next one still goes.
  {
    const w = world()
    w.state.refuse.add('c4')
    await enqueue(w.deps, run(4))
    await enqueue(w.deps, run(5))
    await flushQueue(w.deps)
    check(w.stored().length === 0, 'a refused run stayed in the queue')
    check(w.table.has('c5') && !w.table.has('c4'), 'the run after a refused one did not go')
  }
  // The same run queued twice is one run.
  {
    const w = world()
    await enqueue(w.deps, run(6)); await enqueue(w.deps, run(6))
    check(w.stored().length === 1, 'the same run was queued twice')
  }

  console.log(`${failures} failed`)
  if (failures === 0) console.log('✅ ALL CHECKS PASSED')
  process.exit(failures === 0 ? 0 : 1)
})()
