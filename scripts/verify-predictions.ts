// Verifies the pundits' predictions (src/engine/predictions.ts):
//  - determinism: same teams + seed → identical preview; input order never matters
//  - shape: a full table of distinct places, the player's row found, surprise and
//    disappoint lists at most two each, never the player, and each entry really
//    tipped above (or below) its strength rank
//  - sanity against thousands of simulated seasons: the predicted champion wins
//    the league more often than any other club, predictions track the real
//    finish better than a coin toss, and the pundits are wrong often enough to
//    matter (they must not simply reproduce the strength order)
// Run: npx tsx scripts/verify-predictions.ts

import { predictTable, predictWorldCupRound, predictChampionsLeagueRound, predictPlayers, type PredictionTeam, type PickablePlayer } from '../src/engine/predictions'
import { simulateMatch, setMatchTilt } from '../src/engine/match'
import { generateFixtures } from '../src/engine/fixtures'
import type { SimTeam } from '../src/types/simulation'

let failures = 0
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; console.log(`❌ ${msg}`) }
}

// A realistic 20-club league: a spread from 72 to 90.
function league(seed: number): PredictionTeam[] {
  return Array.from({ length: 20 }, (_, i) => ({
    clubId: `c${String(i).padStart(2, '0')}`,
    clubName: `Club ${i}`,
    ovr: Math.round(90 - i * 0.95 + ((seed * (i + 7)) % 5) - 2),
    isPlayer: i === (seed % 20),
  }))
}

// ── Determinism and shape ────────────────────────────────────────────────────
for (let s = 1; s <= 500; s++) {
  const teams = league(s)
  const a = predictTable(teams, s)
  const b = predictTable([...teams].reverse(), s)
  check(JSON.stringify(a) === JSON.stringify(b), `seed ${s}: input order changed the preview`)
  check(JSON.stringify(a) === JSON.stringify(predictTable(teams, s)), `seed ${s}: not deterministic`)
  check(a.table.length === teams.length, `seed ${s}: table has ${a.table.length} rows`)
  check(new Set(a.table.map(r => r.predicted)).size === teams.length, `seed ${s}: duplicate predicted places`)
  check(a.table.every((r, i) => r.predicted === i + 1), `seed ${s}: table not in predicted order`)
  check(!!a.player && a.player.isPlayer, `seed ${s}: player row missing`)
  check(a.surprise.length <= 2 && a.disappoint.length <= 2, `seed ${s}: more than two callouts`)
  check([...a.surprise, ...a.disappoint].every(r => !r.isPlayer), `seed ${s}: the player is a callout`)
  check(a.surprise.every(r => r.predicted < r.strengthRank), `seed ${s}: a "surprise" isn't tipped above strength`)
  check(a.disappoint.every(r => r.predicted > r.strengthRank), `seed ${s}: a "disappoint" isn't tipped below strength`)
}

// ── Against simulated seasons ────────────────────────────────────────────────
setMatchTilt(0)
const SEASONS = 1500
let predictedChampWins = 0
const titlesByPredictedPlace = new Map<number, number>()
let misplaced = 0, totalClubs = 0, absError = 0

for (let s = 1; s <= SEASONS; s++) {
  const teams = league(s).map(t => ({ ...t, isPlayer: false }))
  const pred = predictTable(teams, s * 7919)
  const sims: SimTeam[] = teams.map(t => ({
    ...t, form: 0,
    stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
  }))
  const fx = generateFixtures(sims)
  for (const f of fx) {
    const r = simulateMatch(f.home, f.away)
    const h = f.home.stats, a = f.away.stats
    h.played++; a.played++
    h.goalsFor += r.homeGoals; h.goalsAgainst += r.awayGoals
    a.goalsFor += r.awayGoals; a.goalsAgainst += r.homeGoals
    if (r.homeGoals > r.awayGoals) { h.won++; h.points += 3; a.lost++ }
    else if (r.homeGoals < r.awayGoals) { a.won++; a.points += 3; h.lost++ }
    else { h.drawn++; a.drawn++; h.points++; a.points++ }
  }
  const final = [...sims].sort((x, y) =>
    y.stats.points - x.stats.points
    || (y.stats.goalsFor - y.stats.goalsAgainst) - (x.stats.goalsFor - x.stats.goalsAgainst)
    || y.stats.goalsFor - x.stats.goalsFor)
  const champ = final[0].clubId
  const champPredicted = pred.table.find(r => r.clubId === champ)!.predicted
  titlesByPredictedPlace.set(champPredicted, (titlesByPredictedPlace.get(champPredicted) ?? 0) + 1)
  if (champPredicted === 1) predictedChampWins++

  for (const row of pred.table) {
    totalClubs++
    if (row.predicted !== row.strengthRank) misplaced++
    const actual = final.findIndex(t => t.clubId === row.clubId) + 1
    absError += Math.abs(actual - row.predicted)
  }
}

const bestOther = Math.max(0, ...[...titlesByPredictedPlace.entries()].filter(([p]) => p !== 1).map(([, n]) => n))
const misplacedRate = misplaced / totalClubs
const meanError = absError / totalClubs
check(predictedChampWins > bestOther, `predicted champion won ${predictedChampWins} titles, another predicted place won ${bestOther}`)
check(meanError < 5, `mean |actual - predicted| is ${meanError.toFixed(2)} places (a random guess is ~6.65)`)
check(misplacedRate > 0.15, `only ${(misplacedRate * 100).toFixed(1)}% of clubs misplaced vs strength: the pundits just copy the table`)
check(misplacedRate < 0.9, `${(misplacedRate * 100).toFixed(1)}% misplaced: the preview is noise`)

// ── Knockout calls ───────────────────────────────────────────────────────────
check(predictWorldCupRound(1).key === 'winner' && predictWorldCupRound(40).key === 'groups', 'World Cup round calls wrong at the ends')
check(predictChampionsLeagueRound(3).key === 'sf_exit' && predictChampionsLeagueRound(30).key === 'league_exit', 'Champions League round calls wrong')

// ── The three names ──────────────────────────────────────────────────────────
// Deterministic whatever the order; eligible for what they're picked for; and
// reputation-led — the best-rated player is the pick often, but not always.
const POS = ['GK', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST']
let topPicked = 0
for (let s = 1; s <= 800; s++) {
  const squad: PickablePlayer[] = Array.from({ length: 220 }, (_, i) => ({
    playerId: `p${String(i).padStart(3, '0')}`, name: `Player ${i}`, clubName: `Club ${i % 20}`,
    primaryPosition: POS[i % POS.length],
    ovr: 60 + ((i * 37 + s * 11) % 31), attack: 55 + ((i * 53 + s * 7) % 36),
    birthYear: 1990 + ((i * 13 + s) % 16), yearStart: 2024,
  }))
  const a = predictPlayers(squad, s)
  const b = predictPlayers([...squad].reverse(), s)
  check(JSON.stringify(a) === JSON.stringify(b), `picks ${s}: input order changed the picks`)
  const byId = new Map(squad.map(p => [p.playerId, p]))
  const scorer = a.topScorer && byId.get(a.topScorer.playerId)
  check(!scorer || ['ST', 'CF', 'LW', 'RW'].includes(scorer.primaryPosition), `picks ${s}: top-scorer pick isn't a forward`)
  const u21 = a.bestU21 && byId.get(a.bestU21.playerId)
  check(!u21 || (u21.birthYear != null && u21.yearStart - u21.birthYear <= 21), `picks ${s}: under-21 pick is too old`)
  const bestOvr = Math.max(...squad.map(p => p.ovr))
  if (a.pots && byId.get(a.pots.playerId)!.ovr === bestOvr) topPicked++
  check(!a.pots || byId.get(a.pots.playerId)!.ovr >= bestOvr - 8, `picks ${s}: Player of the Season pick is nobody (ovr ${a.pots && byId.get(a.pots.playerId)!.ovr} v best ${bestOvr})`)
}
check(topPicked > 800 * 0.2, `the best-rated player was the pick only ${topPicked}/800 times: the pundits ignore reputation`)
check(topPicked < 800 * 0.98, `the best-rated player was always the pick: the pundits never get it wrong`)
console.log(`player picks: the best-rated player was the pundits' Player of the Season ${topPicked}/800 times`)

console.log(`${SEASONS} seasons · predicted champion won ${predictedChampWins} (${(predictedChampWins / SEASONS * 100).toFixed(1)}%), next best predicted place ${bestOther}`)
console.log(`misplaced vs strength ${(misplacedRate * 100).toFixed(1)}% · mean error vs actual finish ${meanError.toFixed(2)} places`)
if (failures === 0) console.log('✅ ALL CHECKS PASSED')
else console.log(`${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
