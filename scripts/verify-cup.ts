/**
 * P8-173: the league's cup (src/engine/domestic-cup.ts).
 *
 *   - every league size from 8 to 24 makes a bracket that ends in one winner;
 *   - the first round is the clubs rated lowest, and it leaves exactly sixteen
 *     (or eight) for the next round;
 *   - every club plays at most once a round, and nobody plays on after losing;
 *   - the rounds fall in order, the final after the last matchday;
 *   - the same seed draws the same ties;
 *   - how far you got (cupReachOf) agrees with the ties.
 */
import { planCup, playCupAfter, cupReachOf, attributeCupScorers, type DomesticCup } from '../src/engine/domestic-cup'
import type { SimTeam } from '../src/types/simulation'

let failures = 0
const check = (c: boolean, msg: string) => { if (!c) { failures++; if (failures < 30) console.log(`❌ ${msg}`) } }

function league(n: number): SimTeam[] {
  return Array.from({ length: n }, (_, i) => ({
    clubId: `c${i}`, clubName: `Club ${i}`, isPlayer: i === n - 1, ovr: 85 - i,
    form: 0, stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
  }) as SimTeam)
}

function playAll(cup: DomesticCup, teams: SimTeam[], total: number) {
  for (let md = 1; md <= total; md++) cup = playCupAfter(cup, md, teams)
  return cup
}

let runs = 0, favWins = 0, youWon = 0
for (let n = 8; n <= 24; n++) {
  const total = (n - 1) * 2
  for (let s = 0; s < 60; s++) {
    const teams = league(n)
    const cup = planCup(teams, total, 1000 + s * 31 + n, 'FA Cup')!
    check(!!cup, `${n} clubs: no cup`)
    const days = cup.rounds.map(r => r.afterMatchday)
    check(days.every((d, i) => i === 0 || d > days[i - 1]), `${n} clubs: rounds out of order (${days.join(',')})`)
    check(days[days.length - 1] === total, `${n} clubs: the final isn't after the last matchday`)
    const done = playAll(cup, teams, total)
    runs++
    check(done.rounds.every(r => r.played), `${n} clubs: a round never played`)
    check(!!done.winner, `${n} clubs: no winner`)
    const out = new Set<string>()
    done.rounds.forEach((r, i) => {
      const inRound = r.ties.flatMap(t => [t.home.clubId, t.away.clubId])
      check(new Set(inRound).size === inRound.length, `${n} clubs: ${r.key} has a club twice`)
      check(inRound.every(id => !out.has(id)), `${n} clubs: a club played on after going out (${r.key})`)
      if (r.key === 'r1') {
        const lowest = new Set(teams.slice(-inRound.length).map(t => t.clubId))
        check(inRound.every(id => lowest.has(id)), `${n} clubs: the first round isn't the lowest-rated clubs`)
        check(r.ties.length + r.byes.length === (n >= 16 ? 16 : 8), `${n} clubs: the first round leaves ${r.ties.length + r.byes.length}`)
      }
      if (r.key !== 'r1') check(r.ties.length * 2 === { r16: 16, qf: 8, sf: 4, final: 2 }[r.key], `${n} clubs: ${r.key} has ${r.ties.length} ties`)
      for (const t of r.ties) {
        out.add((t.winner === 'home' ? t.away : t.home).clubId)
        const level = t.homeGoals === t.awayGoals
        check(!level || (t.homePens != null && t.homePens !== t.awayPens), `${n} clubs: a level tie with no shootout winner`)
        check(level ? (t.winner === 'home') === (t.homePens! > t.awayPens!) : (t.winner === 'home') === (t.homeGoals > t.awayGoals), `${n} clubs: the wrong side went through`)
      }
    })
    check(!out.has(done.winner!.clubId), `${n} clubs: the winner lost a tie`)
    if (done.winner!.clubId === 'c0' || done.winner!.clubId === 'c1' || done.winner!.clubId === 'c2') favWins++
    // How far each club got matches the ties.
    for (const t of teams) {
      const reach = cupReachOf(done, t.clubId)
      if (t.clubId === done.winner!.clubId) check(reach === 'winner', `${n} clubs: the winner's reach is ${reach}`)
      else check(reach !== null && reach !== 'winner', `${n} clubs: ${t.clubId} has no reach`)
    }
    if (cupReachOf(done, `c${n - 1}`) === 'winner') youWon++
    // Same seed, same draw (the results differ, the first round's pairs don't).
    const again = playCupAfter(planCup(teams, total, 1000 + s * 31 + n, 'FA Cup')!, done.rounds[0].afterMatchday, teams)
    check(JSON.stringify(again.rounds[0].ties.map(t => [t.home.clubId, t.away.clubId])) === JSON.stringify(done.rounds[0].ties.map(t => [t.home.clubId, t.away.clubId])), `${n} clubs: the same seed drew differently`)
  }
}

console.log(`${runs} cups · the top three rated won ${(favWins / runs * 100).toFixed(1)}% · the lowest-rated club won ${youWon}`)
// A cup is where the small club can win; the big three should still win most.
check(favWins / runs > 0.35 && favWins / runs < 0.95, `the top three won ${(favWins / runs * 100).toFixed(1)}%`)
// P8.5-20 step 4: two-legged semi-finals (the Copa del Rey and three others).
// Both legs are kept, the aggregate is the two legs (plus extra time), and the
// aggregate decides the tie unless it went to penalties.
let twoLeg = 0, onPens = 0
for (let s = 0; s < 400; s++) {
  const teams = league(16), total = 30
  const cup = playAll(planCup(teams, total, 5000 + s, 'Copa del Rey', true)!, teams, total)
  const sf = cup.rounds.find(r => r.key === 'sf')!
  for (const t of sf.ties) {
    twoLeg++
    check(!!t.legs, 'a two-legged semi-final has no legs')
    if (!t.legs) continue
    const a = t.legs.leg1.homeGoals + t.legs.leg2.awayGoals, b = t.legs.leg1.awayGoals + t.legs.leg2.homeGoals
    if (!t.extraTime) check(t.homeGoals === a && t.awayGoals === b, `the aggregate ${t.homeGoals}–${t.awayGoals} isn't the legs' ${a}–${b}`)
    else check(a === b && t.homeGoals >= a && t.awayGoals >= b, 'extra time without a level aggregate')
    if (t.homePens != null) { onPens++; check(t.homeGoals === t.awayGoals, 'penalties with the aggregate not level') }
    else check((t.winner === 'home') === (t.homeGoals > t.awayGoals), 'the aggregate loser went through')
  }
  for (const r of cup.rounds) if (r.key !== 'sf') check(r.ties.every(t => !t.legs), `the ${r.label} has legs`)
  check(!!cup.winner, 'a two-legged cup has no winner')
}
// P8.5-37: every tie played carries the seed its match sheet regenerates from
// (one a leg for two legs), and the same cup seed gives the same tie seeds.
{
  const a = playAll(planCup(league(16), 30, 4242, 'Copa del Rey', true)!, league(16), 30)
  const b = playAll(planCup(league(16), 30, 4242, 'Copa del Rey', true)!, league(16), 30)
  for (const r of a.rounds) for (const t of r.ties) {
    if (t.legs) check(!!t.legSeeds && t.legSeeds[0] !== t.legSeeds[1], `a two-legged ${r.label} has no seed per leg`)
    else check(typeof t.seed === 'number', `a ${r.label} tie has no seed`)
  }
  const seeds = (c: typeof a) => c.rounds.flatMap(r => r.ties.map(t => t.seed ?? t.legSeeds?.join('/')))
  // The results differ between the two (the sim isn't seeded), the seeds mustn't.
  check(JSON.stringify(seeds(a)) === JSON.stringify(seeds(b)), 'the same cup seed gave different tie seeds')
  check(attributeCupScorers(a, new Map()) === a, 'attributing with no squads changed the cup')
}
const one = playAll(planCup(league(16), 30, 77, 'FA Cup')!, league(16), 30)
check(one.rounds.every(r => r.ties.every(t => !t.legs)), 'a one-match cup played a two-legged tie')
console.log(`${twoLeg} two-legged semi-finals · ${onPens} on penalties`)

console.log(`${failures} failed`)
if (failures === 0) console.log('✅ ALL CHECKS PASSED')
process.exit(failures === 0 ? 0 : 1)
