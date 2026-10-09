// Phase 9.75 (P9.75-13, decision D2): long work that gives the screen a turn.
// A European run's stats pass regenerates 150 to 200 match sheets from their
// seeds; done in one go on the JS thread it froze the result screen for 1.4 s
// on the phone. The work is written once as a generator that yields after each
// unit; `drain` runs it straight through (the self-test, scripts), and
// `drainInChunks` hands the thread back every `size` units, so taps and frames
// get through and the screen fills in when it's done. Same steps, same order,
// so the result is identical either way (scripts/verify-chunked.ts).
// No React, no RN: scripts drive it headless.

export function drain<R>(gen: Generator<unknown, R>): R {
  let r = gen.next()
  while (!r.done) r = gen.next()
  return r.value
}

/** The thread's turn: a macrotask, so a frame and pending touches come first. */
const turn = () => new Promise<void>(resolve => setTimeout(resolve, 0))

export async function drainInChunks<R>(gen: Generator<unknown, R>, size: number, onTurn: () => Promise<void> = turn): Promise<R> {
  let r = gen.next()
  for (let n = 1; !r.done; n++) {
    if (n % size === 0) await onTurn()
    r = gen.next()
  }
  return r.value
}
