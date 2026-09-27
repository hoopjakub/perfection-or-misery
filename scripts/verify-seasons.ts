// P8-152: the seasons are a calendar the whole game leans on (the season
// boards, the badges), so their shape is checked, not trusted: a hundred
// contiguous seasons of three months, each starting at midnight Slovak time
// on the 1st of June, September, December or March, every name different,
// and a place turning into the right badge tier.
//   npx tsx scripts/verify-seasons.ts
import { SEASONS, SEASON_COUNT, seasonOf, seasonsSoFar, seasonDates, badgeTier, isFinished } from '../src/data/seasons'
import { bratislavaOffset } from '../src/lib/week'

let failures = 0
const check = (ok: boolean, msg: string) => { if (!ok) { failures++; console.log(`❌ ${msg}`) } }
const HOUR = 3600_000
const MONTH: Record<string, number> = { summer: 5, autumn: 8, winter: 11, spring: 2 }

check(SEASONS.length === SEASON_COUNT + 1, `${SEASONS.length} seasons, expected ${SEASON_COUNT + 1}`)
check(SEASONS[0].start === null, 'Season 0 has no start')
check(new Set(SEASONS.map(s => s.name)).size === SEASONS.length, 'two seasons share a name')

for (const s of SEASONS.slice(1)) {
  const prev = SEASONS[s.n - 1]
  check(prev.end.getTime() === s.start!.getTime(), `season ${s.n} doesn't start where ${prev.n} ends`)
  // The start, on the Slovak wall clock, is 00:00 on the 1st of its quarter's month.
  const wall = new Date(s.start!.getTime() + bratislavaOffset(s.start!.getTime()) * HOUR)
  check(wall.getUTCDate() === 1 && wall.getUTCHours() === 0 && wall.getUTCMinutes() === 0, `season ${s.n} starts at ${wall.toISOString()} wall time`)
  check(wall.getUTCMonth() === MONTH[s.quarter!], `season ${s.n} (${s.quarter}) starts in month ${wall.getUTCMonth() + 1}`)
  const days = (s.end.getTime() - s.start!.getTime()) / (24 * HOUR)
  check(days >= 89 && days <= 93, `season ${s.n} is ${days} days`)
}

// The maintainer's sketch: Season 1 is 1.6.2027 – 31.8.2027, named "A summer of perfection".
check(seasonDates(SEASONS[1]) === '1.6.2027 – 31.8.2027', `season 1 reads ${seasonDates(SEASONS[1])}`)
check(SEASONS[1].name === 'A summer of perfection', `season 1 is ${SEASONS[1].name}`)
check(seasonDates(SEASONS[0]) === 'Until 31.5.2027', `season 0 reads ${seasonDates(SEASONS[0])}`)
check(seasonDates(SEASONS[3]) === '1.12.2027 – 29.2.2028', `season 3 (a leap February) reads ${seasonDates(SEASONS[3])}`)

// Midnight Slovak time is the switch: 31 May 2027 23:59 CEST is Season 0, 00:00 is Season 1.
const s1 = SEASONS[1].start!.getTime()
check(seasonOf(s1 - 60_000).n === 0 && seasonOf(s1).n === 1, 'the switch into Season 1 is not at Slovak midnight')
check(seasonOf(Date.UTC(2026, 8, 27)).n === 0, 'today is not Season 0')
check(seasonsSoFar(Date.UTC(2026, 8, 27)).map(s => s.n).join() === '0', 'before release only Season 0 is picked')
check(seasonsSoFar(Date.UTC(2028, 0, 10)).map(s => s.n).join() === '3,2,1,0', 'January 2028 lists 3, 2, 1, 0')
check(!isFinished(SEASONS[0], Date.UTC(2026, 8, 27)) && isFinished(SEASONS[0], s1), 'Season 0 finishes as Season 1 starts')

// Places to tiers: the smallest tier a place fits under.
const cases: [number, number | null][] = [[1, 1], [2, 2], [3, 3], [4, 5], [5, 5], [6, 10], [11, 15], [16, 30], [42, 50], [51, 100], [101, 250], [251, 500], [999, 1000], [1000, 1000], [1001, null]]
for (const [place, tier] of cases) check(badgeTier(place) === tier, `place ${place} gives ${badgeTier(place)}, expected ${tier}`)

console.log(`Seasons: ${SEASONS.length}, last ${SEASONS[SEASONS.length - 1].name} (${seasonDates(SEASONS[SEASONS.length - 1])})`)
console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} failures`)
process.exit(failures === 0 ? 0 : 1)
