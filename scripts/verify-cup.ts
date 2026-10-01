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
import { planCup, playCupAfter, cupReachOf, type DomesticCup } from '../src/engine/domestic-cup'
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
    const cup = planCup(teams, total, 1000 + s * 31 + n, 'premier_league')!
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
    const again = playCupAfter(planCup(teams, total, 1000 + s * 31 + n, 'premier_league')!, done.rounds[0].afterMatchday, teams)
    check(JSON.stringify(again.rounds[0].ties.map(t => [t.home.clubId, t.away.clubId])) === JSON.stringify(done.rounds[0].ties.map(t => [t.home.clubId, t.away.clubId])), `${n} clubs: the same seed drew differently`)
  }
}

console.log(`${runs} cups · the top three rated won ${(favWins / runs * 100).toFixed(1)}% · the lowest-rated club won ${youWon}`)
// A cup is where the small club can win; the big three should still win most.
check(favWins / runs > 0.35 && favWins / runs < 0.95, `the top three won ${(favWins / runs * 100).toFixed(1)}%`)
console.log(`${failures} failed`)
if (failures === 0) console.log('✅ ALL CHECKS PASSED')
process.exit(failures === 0 ? 0 : 1)
