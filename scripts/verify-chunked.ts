// Phase 9.75 (P9.75-13, D2) · The stats pass gives the screen a turn:
//   npx tsx scripts/verify-chunked.ts
// Fails on:
//  · the chunked driver returning anything but what the straight one does
//    (same steps, same order: a saved run's numbers can't depend on it);
//  · a long pass that never hands the thread back, or one that hands it back
//    more often than its chunk size says;
//  · an app stats pass (league, Europe, World Cup) that runs straight through.
//    run-stats.ts can't load headless (it reads the database), so that part
//    reads the source.
import fs from 'fs'
import path from 'path'
import { drain, drainInChunks } from '../src/lib/chunked'

let failures = 0
const check = (ok: boolean, msg: string) => { if (!ok) { failures++; console.log(`❌ ${msg}`) } }

// A pass shaped like the stats pass: state built up per unit, a result at the end.
function* pass(n: number): Generator<void, number[]> {
  const out: number[] = []
  let x = 7
  for (let i = 0; i < n; i++) { x = (x * 31 + i) % 1009; out.push(x); yield }
  return out
}

async function main() {
  for (const n of [0, 1, 19, 20, 21, 180]) {
    let turns = 0
    const chunked = await drainInChunks(pass(n), 20, async () => { turns++ })
    const straight = drain(pass(n))
    check(JSON.stringify(chunked) === JSON.stringify(straight), `${n} units: the chunked result differs from the straight one`)
    check(turns === Math.floor(n / 20), `${n} units in chunks of 20: ${turns} turns, expected ${Math.floor(n / 20)}`)
  }

  const src = fs.readFileSync(path.join(__dirname, '../src/engine/run-stats.ts'), 'utf8')
  for (const fn of ['computeLeagueRunStatsNow', 'computeCLRunStatsNow', 'computeWCRunStatsNow']) {
    const body = src.slice(src.indexOf(`async function ${fn}`)).split(/\r?\n\}\r?\n/)[0]
    check(/computeRunStatsChunked\(/.test(body), `${fn} runs the stats pass straight through (no turn for the screen)`)
  }

  console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}
main()
