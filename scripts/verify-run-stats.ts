// Verifies the per-90 figures and position ranks (src/engine/run-aggregates.ts):
//  - per 90 is exactly total / minutes x 90, and null under the minutes floor
//  - averages, awards and clean sheets are never per 90
//  - ranks are within each line only, level players share a rank, rank 1 is
//    the best figure, and percentiles fall in (0, 1]
//  - the TOP x% tag appears only in the top tenth of a line of ten or more
//  - input order never changes a rank
// Run: npx tsx scripts/verify-run-stats.ts

import { per90, positionRanks, percentileTag, canPer90, value, PER90_MIN_MINUTES, type StatKey } from '../src/engine/run-aggregates'
import { lineOf } from '../src/engine/awards'
import type { PlayerStatLine } from '../src/types/stats'

let failures = 0
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; if (failures <= 30) console.log(`❌ ${msg}`) }
}

const POS = ['GK', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST']
const KEYS: StatKey[] = ['goals', 'assists', 'tacklesWon', 'saves', 'avgRating', 'cleanSheets', 'chancesCreated']

for (let s = 1; s <= 300; s++) {
  const players: PlayerStatLine[] = Array.from({ length: 220 }, (_, i) => ({
    playerId: `p${String(i).padStart(3, '0')}`, name: `P${i}`, seasonLabel: '24/25',
    clubId: `c${i % 20}`, clubName: `Club ${i % 20}`, position: POS[i % POS.length],
    goals: (i * s) % 13, assists: (i * 7 + s) % 9, cleanSheets: (i + s) % 11,
    tacklesWon: (i * 3 + s) % 41, saves: POS[i % POS.length] === 'GK' ? (i * 5 + s) % 90 : 0,
    chancesCreated: (i * 11 + s) % 37,
    minutes: (i * 97 + s * 31) % 3200, avgRating: 6 + ((i * 13 + s) % 20) / 10, matchesRated: (i + s) % 38,
  }))
  for (const p of players.slice(0, 40)) {
    for (const k of KEYS) {
      const v = per90(p, k)
      if (!canPer90(k)) check(v === null, `per 90 given for ${k}`)
      else if ((p.minutes ?? 0) < PER90_MIN_MINUTES) check(v === null, `per 90 under the minutes floor`)
      else check(v !== null && Math.abs(v - (value(p, k) / p.minutes!) * 90) < 0.006, `per 90 wrong for ${k}`)
    }
  }
  for (const k of KEYS) {
    for (const mode of ['total', 'per90'] as const) {
      const ranks = positionRanks(players, k, mode)
      const again = positionRanks([...players].reverse(), k, mode)
      check([...ranks.entries()].every(([id, r]) => JSON.stringify(again.get(id)) === JSON.stringify(r)), `${k}/${mode}: input order changed a rank`)
      const byLine = new Map<string, [string, number][]>()
      for (const [id, r] of ranks) {
        const p = players.find(x => x.playerId === id)!
        check(r.percentile > 0 && r.percentile <= 1 && r.rank >= 1 && r.rank <= r.of, `${k}/${mode}: bad rank`)
        const score = mode === 'per90' ? per90(p, k)! : value(p, k)
        byLine.set(lineOf(p.position), [...(byLine.get(lineOf(p.position)) ?? []), [id, score]])
        const tag = percentileTag(p, r)
        check(!tag || (r.of >= 10 && r.rank / r.of <= 0.1), `${k}/${mode}: tag outside the top tenth`)
      }
      for (const list of byLine.values()) {
        const best = Math.max(...list.map(x => x[1]))
        for (const [id, sc] of list) {
          const r = ranks.get(id)!
          if (sc === best) check(r.rank === 1, `${k}/${mode}: the best in a line isn't ranked 1`)
          check(r.rank === 1 + list.filter(x => x[1] > sc).length, `${k}/${mode}: rank isn't the count ahead plus one`)
        }
      }
    }
  }
}

if (failures === 0) console.log('✅ ALL CHECKS PASSED')
else console.log(`${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
