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

import { predictTable, predictWorldCupRound, predictChampionsLeagueRound, predictPlayers, punditPanel, punditField, PANEL_SIZE, type PredictionTeam, type PickablePlayer } from '../src/engine/predictions'
import { simulateMatch, setMatchTilt } from '../src/engine/match'
import { generateFixtures } from '../src/engine/fixtures'
import type { SimTeam } from '../src/types/simulation'
import { punditsSummary, callOf } from '../src/lib/punditsSummary'

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
let misplaced = 0, totalClubs = 0, absError = 0, pointsAbsError = 0, pointsBias = 0

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
    // P8-13: the points they called, against the points actually finished on.
    const got = final.find(t => t.clubId === row.clubId)!.stats.points
    pointsAbsError += Math.abs(got - row.points)
    pointsBias += row.points - got
  }
  // A lower place can never be called to finish on more points.
  check(pred.table.every((r, i) => i === 0 || pred.table[i - 1].points >= r.points), `season ${s}: predicted points not in order`)
}

const bestOther = Math.max(0, ...[...titlesByPredictedPlace.entries()].filter(([p]) => p !== 1).map(([, n]) => n))
const misplacedRate = misplaced / totalClubs
const meanError = absError / totalClubs
check(predictedChampWins > bestOther, `predicted champion won ${predictedChampWins} titles, another predicted place won ${bestOther}`)
check(meanError < 5, `mean |actual - predicted| is ${meanError.toFixed(2)} places (a random guess is ~6.65)`)
check(misplacedRate > 0.15, `only ${(misplacedRate * 100).toFixed(1)}% of clubs misplaced vs strength: the pundits just copy the table`)
const meanPointsError = pointsAbsError / totalClubs
const meanBias = pointsBias / totalClubs
console.log(`predicted points: mean error ${meanPointsError.toFixed(2)} pts, bias ${meanBias >= 0 ? '+' : ''}${meanBias.toFixed(2)} pts a club over a 38-game season`)
check(meanPointsError < 8, `predicted points are ${meanPointsError.toFixed(2)} points out on average`)
check(Math.abs(meanBias) < 2, `predicted points run ${meanBias.toFixed(2)} points off in one direction: the model is biased`)
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
// ── P8-57: the panel ──
let spread = 0, split = 0, panels = 0
for (let s = 1; s <= 500; s++) {
  const teams = league(s)
  const panel = punditPanel(teams, s)
  const consensus = predictTable(teams, s).player!.predicted
  check(panel.length === PANEL_SIZE && new Set(panel.map(p => p.name)).size === PANEL_SIZE, `panel ${s}: not ${PANEL_SIZE} different pundits`)
  check(panel.every(p => p.youAt >= 1 && p.youAt <= teams.length), `panel ${s}: a pundit put you off the table`)
  check(JSON.stringify(panel) === JSON.stringify(punditPanel([...teams].reverse(), s)), `panel ${s}: not deterministic`)
  spread += panel.reduce((a, p) => a + Math.abs(p.youAt - consensus), 0) / panel.length
  if (new Set(panel.map(p => p.youAt)).size > 1) split++
  panels++
}
// They argue about places, not about who's good: a pundit is on average within
// three places of the consensus, and most panels don't all say the same thing.
console.log(`panel: a pundit is ${(spread / panels).toFixed(2)} places from the consensus on average; ${Math.round(split / panels * 100)}% of panels disagree about you`)
check(spread / panels < 3, 'the panel strays too far from the consensus')
check(split / panels > 0.5, "the panel mostly agrees to the place — it isn't a panel")

// P8-122: the verdict's summary of the pundits' calls, in words.
{
  const rows = [
    { clubId: 'a', clubName: 'Alpha', finalPosition: 1, predicted: 1, isPlayer: false, points: 80, predictedPoints: 78 },
    { clubId: 'b', clubName: 'Bravo', finalPosition: 2, predicted: 5, isPlayer: true, points: 70, predictedPoints: 55 },
    { clubId: 'c', clubName: 'Charlie', finalPosition: 3, predicted: 3, isPlayer: false, points: 60, predictedPoints: 61 },
    { clubId: 'd', clubName: 'Delta', finalPosition: 5, predicted: 2, isPlayer: false, points: 40, predictedPoints: 72 },
    { clubId: 'e', clubName: 'Echo', finalPosition: 4, predicted: 4, isPlayer: false },
  ]
  const lines = punditsSummary(rows)
  check(lines[0] === 'They got 3 of 5 places exactly right and 0 points totals.', `summary count: ${lines[0]}`)
  check(lines[1].startsWith('Their best call: Charlie,'), `the best call is the exact one nearest on points (Charlie, 1 point out): ${lines[1]}`)
  check(lines[2].startsWith('Their worst: '), `a worst call is named: ${lines[2]}`)
  check(lines[3] === 'On you: tipped 5th on 55 points. You finished 2nd on 70 points, 3 places better than they said.', `the line on you: ${lines[3]}`)
  // The calls: both right is mega; one right says which; neither says how far.
  const base = { clubId: 'x', clubName: 'X', isPlayer: false }
  check(callOf({ ...base, finalPosition: 3, predicted: 3, points: 60, predictedPoints: 60 }).label === 'MEGA SPOT ON', 'place and points right: MEGA SPOT ON')
  check(callOf({ ...base, finalPosition: 3, predicted: 3, points: 61, predictedPoints: 60 }).label === 'PLACE SPOT ON', 'only the place: PLACE SPOT ON')
  check(callOf({ ...base, finalPosition: 5, predicted: 3, points: 60, predictedPoints: 60 }).label === 'POINTS SPOT ON', 'only the points: POINTS SPOT ON')
  check(callOf({ ...base, finalPosition: 5, predicted: 3, points: 50, predictedPoints: 60 }).label === 'DOWN 2', 'neither: DOWN 2')
  check(callOf({ ...base, finalPosition: 3, predicted: 3 }).label === 'SPOT ON', 'no points kept: plain SPOT ON')
  check(punditsSummary([{ ...base, finalPosition: 1, predicted: 1, points: 9, predictedPoints: 9 }])[0] === 'They got 1 of 1 places exactly right and 1 points total; 1 mega spot on, both.', 'the summary counts the mega ones')
  const noPoints = punditsSummary(rows.map(r => ({ ...r, points: undefined, predictedPoints: undefined })))
  check(!noPoints.some(l => l.includes('points')), 'a saved run without points still reads (no "on undefined points")')
}

// ── L-13 · One field for the panel ──────────────────────────────────────────
// The pundits screen and the live screens' panel line build the field with
// punditField; each mode's match count has to be the one its table plays.
{
  const rich = Array.from({ length: 36 }, (_, i) => ({ clubId: `f${i}`, clubName: `F${i}`, ovr: 70 + i % 20, isPlayer: i === 0, form: 1, pot: 2 }))
  const want: [string, number | undefined][] = [['champions_league', 8], ['europa_league', 8], ['conference_league', 6], ['world_cup', 3], ['league', undefined], ['chaos', undefined]]
  for (const [mode, md] of want) {
    const f = punditField(mode, { clTeams: rich, wcTeams: rich, placedLeague: { teams: rich } })
    check(!!f && f.matchesPerClub === md, `L-13: ${mode} gives ${f?.matchesPerClub} matches per club, want ${md}`)
    check(!!f && f.teams.length === 36 && f.teams.every(t => Object.keys(t).length <= 4 || mode === 'league' || mode === 'chaos'), `L-13: ${mode}'s field carries more than the pundits read`)
  }
  check(punditField('world_cup', { clTeams: rich }) === null, 'L-13: a World Cup with no nations gave a field')
}

if (failures === 0) console.log('✅ ALL CHECKS PASSED')
else console.log(`${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
