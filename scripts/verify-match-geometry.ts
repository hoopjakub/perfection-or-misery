// Verifies the match geometry (src/engine/match-geometry.ts) over thousands of
// generated match sheets:
//  - it's a texture layer: generating it leaves the sheet byte-identical
//  - deterministic: the same seed draws the same map
//  - the shot map agrees with the sheet: each player's shots, on-target and
//    goals; the team's inside-box count; goals from inside the box
//  - the shots' xG adds up to the team's xG (within rounding)
//  - every average position and every shot is on the pitch
//  - a heat map is normalised to 0–1 with its peak at 1
// Run: npx tsx scripts/verify-match-geometry.ts

import { generateMatchDetail } from '../src/engine/match-detail'
import { buildShotMap, averagePositions, heatMap } from '../src/engine/match-geometry'
import type { RosterPlayer } from '../src/types/stats'

let failures = 0
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; if (failures <= 30) console.log(`❌ ${msg}`) }
}

const POS = ['GK', 'RB', 'CB', 'CB', 'LB', 'CDM', 'CM', 'CAM', 'RW', 'LW', 'ST', 'GK', 'CB', 'CM', 'ST', 'LW', 'RB']
function pool(club: string, base: number): RosterPlayer[] {
  return POS.map((pos, i) => ({
    playerId: `${club}-${i}`, name: `Player ${club}${i}`, primaryPosition: pos,
    attack: base + (i % 7), ovr: base + (i % 5), isBench: i >= 11,
    birthYear: 1995, yearStart: 2024, seasonLabel: '24/25', clubId: club, clubName: `Club ${club}`,
  }))
}

let matches = 0, xgDrift = 0
for (let s = 1; s <= 3000; s++) {
  const hg = s % 5, ag = (s * 3) % 4
  const detail = generateMatchDetail({ seed: s * 7919, homePool: pool('h', 78), awayPool: pool('a', 76), homeGoals: hg, awayGoals: ag, benchSize: 6 })
  if (!detail) continue
  matches++
  const before = JSON.stringify(detail)
  const shots = buildShotMap(detail, s * 7919)
  const spots = averagePositions(detail, s * 7919)
  check(JSON.stringify(detail) === before, `match ${s}: drawing the map changed the sheet`)
  check(JSON.stringify(shots) === JSON.stringify(buildShotMap(detail, s * 7919)), `match ${s}: shot map not deterministic`)

  for (const p of detail.players) {
    const mine = shots.filter(x => x.playerId === p.playerId)
    check(mine.length === p.shots, `match ${s}: ${p.name} has ${mine.length} shots on the map, ${p.shots} on the sheet`)
    check(mine.filter(x => x.outcome === 'goal').length === p.goals, `match ${s}: ${p.name}'s goals don't match`)
    check(mine.filter(x => x.outcome === 'goal' || x.outcome === 'saved').length === p.shotsOnTarget, `match ${s}: ${p.name}'s on-target shots don't match`)
  }
  for (const isHome of [true, false]) {
    const team = isHome ? detail.home : detail.away
    const side = shots.filter(x => x.isHome === isHome)
    if (side.length === 0) continue
    const sum = side.reduce((a, x) => a + x.xg, 0)
    xgDrift = Math.max(xgDrift, Math.abs(sum - team.xg))
    check(Math.abs(sum - team.xg) <= 0.05 + side.length * 0.006, `match ${s}: shots add to ${sum.toFixed(2)} xG, the sheet says ${team.xg}`)
    check(side.filter(x => x.outcome === 'goal' && !x.penalty).every(x => x.insideBox || side.filter(y => y.insideBox).length >= (team.shotsInsideBox ?? 0)),
      `match ${s}: a goal from outside the box while inside-box shots went spare`)
  }
  for (const x of shots) check(x.x >= 0 && x.x <= 1 && x.y >= 0 && x.y <= 1 && x.xg >= 0 && x.xg <= 0.95, `match ${s}: shot off the pitch or bad xG`)
  for (const p of spots) check(p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1, `match ${s}: ${p.name} stood off the pitch`)
  const someone = detail.players.find(p => p.minutes > 0)!
  const grid = heatMap(someone, spots.find(x => x.playerId === someone.playerId), s)
  const flat = grid.flat()
  check(flat.every(v => v >= 0 && v <= 1), `match ${s}: heat outside 0–1`)
  check(!spots.find(x => x.playerId === someone.playerId) || Math.max(...flat) === 1, `match ${s}: heat map not normalised`)
}

console.log(`${matches} matches · worst team xG drift ${xgDrift.toFixed(3)}`)
if (failures === 0) console.log('✅ ALL CHECKS PASSED')
else console.log(`${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
