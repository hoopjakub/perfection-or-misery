// P8-91: a tie read "as it stands" starts at nothing, never goes backwards,
// and ends on the full result.
// npx tsx scripts/verify-live-bracket.ts
import { scoreAt } from '../src/lib/liveBracket'
import { mulberry32 } from '../src/lib/rng'

let failures = 0
function check(cond: boolean, msg: string) { if (!cond) { failures++; if (failures < 20) console.log('❌', msg) } }
const ev = (minute: number) => ({ minute, scorerName: 'X', scorerId: 'x' }) as any
const goals = (rng: () => number, n: number, max: number) => Array.from({ length: n }, () => ev(1 + Math.floor(rng() * max)))

for (let run = 0; run < 3000; run++) {
  const rng = mulberry32(run + 11)
  const two = run % 2 === 0
  const n = () => Math.floor(rng() * 4)
  const l1h = n(), l1a = n(), l2h = n(), l2a = n(), eth = rng() < 0.2 ? 1 : 0
  const tie: any = two
    ? { teamA: { clubId: 'a', clubName: 'A' }, teamB: { clubId: 'b', clubName: 'B' }, winner: { clubId: 'a' },
        leg1: {}, leg1Scorers: { home: goals(rng, l1h, 90), away: goals(rng, l1a, 90) },
        leg2Scorers: { home: goals(rng, l2h, 90), away: goals(rng, l2a, 90) },
        leg2ExtraTimeScorers: { home: goals(rng, eth, 120), away: [] }, extraTime: eth > 0,
        aGoals: l1h + l2a, bGoals: l1a + l2h + eth }
    : { teamA: { clubId: 'a', clubName: 'A' }, teamB: { clubId: 'b', clubName: 'B' }, winner: { clubId: 'a' },
        scorers: { home: goals(rng, l1h, 120), away: goals(rng, l1a, 120) }, extraTime: true, aGoals: l1h, bGoals: l1a }
  const s0 = scoreAt(tie, 0)
  check(s0.a === 0 && s0.b === 0, `run ${run}: nothing at the kick-off`)
  let prev = { a: 0, b: 0 }
  for (let p = 0; p <= 1.0001; p += 0.05) {
    const s = scoreAt(tie, p)
    check(s.a >= prev.a && s.b >= prev.b, `run ${run}: never goes backwards at ${p.toFixed(2)}`)
    prev = s
  }
  const end = scoreAt(tie, 1)
  check(end.a === tie.aGoals && end.b === tie.bGoals, `run ${run}: ends on ${tie.aGoals}-${tie.bGoals}, got ${end.a}-${end.b}`)
  if (two) {
    const half = scoreAt(tie, 0.5)
    check(half.a === l1h && half.b === l1a, `run ${run}: halfway is leg 1's result`)
  }
}
console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} failures`)
process.exit(failures === 0 ? 0 : 1)
