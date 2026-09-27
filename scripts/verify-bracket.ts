// P8-79: the bracket's ties come out in bracket order, so the lines joining
// two ties to the one their winners play next are true.
// npx tsx scripts/verify-bracket.ts
import { orderBracket, type BracketColumn, type BracketTie } from '../src/lib/bracket'
import { mulberry32 } from '../src/lib/rng'

let failures = 0
function check(cond: boolean, msg: string) { if (!cond) { failures++; if (failures < 20) console.log('❌', msg) } }

function shuffle<T>(a: T[], rng: () => number): T[] {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] }
  return b
}
const side = (id: string) => ({ clubId: id, name: id })

// A knockout of `teams` sides; `seeds` sides join in the second round (the
// Champions League shape: a play-off of 16 feeding a round of 16 with 8 seeds).
function knockout(rng: () => number, teams: number, seeds = 0): BracketColumn[] {
  let alive = Array.from({ length: teams }, (_, i) => `t${i}`)
  const cols: BracketColumn[] = []
  let round = 0
  while (alive.length > 1) {
    if (round === 1 && seeds) alive = alive.flatMap((w, i) => [`s${i}`, w])   // each seed meets a play-off winner
    const ties: BracketTie[] = []
    for (let i = 0; i < alive.length; i += 2) ties.push({ a: side(alive[i]), b: side(alive[i + 1]), winner: rng() < 0.5 ? 'a' : 'b' })
    alive = ties.map(t => (t.winner === 'a' ? t.a!.clubId! : t.b!.clubId!))
    cols.push({ key: `r${round}`, label: `Round ${round}`, ties: shuffle(ties, rng) })   // the draw order, not the bracket's
    round++
  }
  return cols
}

for (let run = 0; run < 2000; run++) {
  const rng = mulberry32(run + 1)
  const cols = orderBracket(run % 2 ? knockout(rng, 32) : knockout(rng, 16, 8))
  for (let i = 0; i < cols.length - 1; i++) {
    const cur = cols[i].ties, next = cols[i + 1].ties
    const w = (t: BracketTie) => (t.winner === 'a' ? t.a!.clubId : t.b!.clubId)
    if (cur.length === next.length * 2) {
      next.forEach((t, k) => check(w(cur[2 * k]) === t.a!.clubId && w(cur[2 * k + 1]) === t.b!.clubId, `run ${run} round ${i}: ties ${2 * k}, ${2 * k + 1} feed tie ${k}`))
    } else if (cur.length === next.length) {
      next.forEach((t, k) => check([t.a!.clubId, t.b!.clubId].includes(w(cur[k])), `run ${run} round ${i}: tie ${k} feeds tie ${k}`))
    } else check(false, `run ${run} round ${i}: ${cur.length} ties then ${next.length}`)
  }
}

// A round whose next round isn't drawn yet keeps its order.
const pending = orderBracket([
  { key: 'a', label: 'A', ties: [{ a: side('x'), b: side('y') }, { a: side('p'), b: side('q') }] },
  { key: 'b', label: 'B', ties: [{ a: null, b: null }] },
])
check(pending[0].ties[0].a!.clubId === 'x', 'an undrawn next round leaves the order alone')

console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} failures`)
process.exit(failures === 0 ? 0 : 1)
