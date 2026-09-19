// Verifies the qualification bands (src/data/qualification-bands.ts) against
// every domestic league-season actually in the bundled database:
//  - every league-season has bands: 1st is CHAMP, the Champions League band is
//    at least three deep, relegation exists
//  - bands never overlap and run in order (champ → ucl → uel → uecl … playoff → down)
//  - the tier ladder (src/engine/tier.ts) agrees with the zone for every final
//    place: a UCL place is never below "champions_league", a relegation place is
//    always "absolute_misery", a mid-table place is never European or relegated
//  - with no zone, the ladder behaves exactly as it did before the bands existed
// Run: npx tsx scripts/verify-zones.ts

import Database from 'better-sqlite3'
import { zonesFor, zoneAt, legendFor, type ZoneKey } from '../src/data/qualification-bands'
import { assignTier } from '../src/engine/tier'

let failures = 0
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; console.log(`❌ ${msg}`) }
}

const LEAGUES = ['premier_league', 'la_liga', 'serie_a', 'bundesliga', 'ligue_1']
const db = new Database('assets/db/players_v5.db', { readonly: true })
const rows = db.prepare(`
  SELECT c.league_id AS leagueId, cs.year_start AS yearStart, COUNT(*) AS teams
  FROM club_seasons cs JOIN clubs c ON c.id = cs.club_id
  WHERE c.league_id IN (${LEAGUES.map(() => '?').join(',')})
  GROUP BY c.league_id, cs.year_start ORDER BY 1, 2
`).all(...LEAGUES) as { leagueId: string; yearStart: number; teams: number }[]

check(rows.length >= LEAGUES.length * 8, `expected 8 seasons per league, found ${rows.length} league-seasons`)

const ORDER: ZoneKey[] = ['champ', 'ucl', 'uel', 'uecl', 'playoff', 'down']
const TOP_TIERS = new Set(['perfection', 'almost_perfection', 'champions', 'title_contender'])

for (const { leagueId, yearStart, teams } of rows) {
  const id = `${leagueId} ${yearStart} (${teams})`
  const z = zonesFor(leagueId, yearStart, teams)
  check(z.length === teams, `${id}: ${z.length} zones for ${teams} places`)
  check(z[0] === 'champ', `${id}: 1st is ${z[0]}`)
  check(z.filter(k => k === 'champ' || k === 'ucl').length >= 3, `${id}: fewer than three Champions League places`)
  check(z.filter(k => k === 'down').length >= 2, `${id}: fewer than two relegation places`)
  check(yearStart < 2021 || z.includes('uecl'), `${id}: no Conference League place`)
  check(yearStart >= 2021 || !z.includes('uecl'), `${id}: Conference League before it existed`)

  // In order: the rank of each non-null zone never goes backwards, and the
  // mid-table (null) only sits between the European and relegation bands.
  let last = -1
  let seenBottom = false
  z.forEach((k, i) => {
    if (k == null) {
      check(!seenBottom, `${id}: mid-table place ${i + 1} below a relegation place`)
      return
    }
    const r = ORDER.indexOf(k)
    check(r >= last, `${id}: ${k} at ${i + 1} out of order`)
    last = r
    if (k === 'playoff' || k === 'down') seenBottom = true
  })
  check(legendFor(z).length === new Set(z.filter(Boolean)).size, `${id}: legend misses a zone`)

  // The ladder and the zones agree for every place, unbeaten or not.
  for (let pos = 1; pos <= teams; pos++) {
    const zone = zoneAt(leagueId, yearStart, teams, pos)
    for (const [unbeaten, perfect] of [[false, false], [true, false], [true, true]] as const) {
      const tier = assignTier(pos, teams, unbeaten, perfect, zone)
      if (zone === 'ucl') check(tier === 'champions_league' || TOP_TIERS.has(tier), `${id} #${pos}: UCL place graded ${tier}`)
      if (zone === 'uel' || zone === 'uecl') check(tier === 'europa_glory' || TOP_TIERS.has(tier), `${id} #${pos}: ${zone} place graded ${tier}`)
      if (zone === 'down' || zone === 'playoff') check(tier === 'absolute_misery', `${id} #${pos}: ${zone} place graded ${tier}`)
      if (zone === null) check(tier === 'almost_matters' || tier === 'respectful_mediocrity', `${id} #${pos}: mid-table graded ${tier}`)
    }
  }
}

// No zone → the pre-bands ladder, unchanged.
function oldTier(position: number, total: number, unbeaten: boolean, perfect: boolean) {
  if (position === 1 && perfect) return 'perfection'
  if (position === 1 && unbeaten) return 'almost_perfection'
  if (position === 1) return 'champions'
  if (position <= 3) return 'title_contender'
  if (position <= 4) return 'champions_league'
  if (position <= 7) return 'europa_glory'
  if (position <= Math.floor(total / 2)) return 'almost_matters'
  if (position <= total - 3) return 'respectful_mediocrity'
  return 'absolute_misery'
}
for (const total of [8, 18, 20, 36]) {
  for (let pos = 1; pos <= total; pos++) {
    for (const [u, p] of [[false, false], [true, false], [true, true]] as const) {
      check(assignTier(pos, total, u, p) === oldTier(pos, total, u, p), `no-zone ladder changed at ${pos}/${total}`)
    }
  }
}

console.log(`${rows.length} league-seasons checked`)
if (failures === 0) console.log('✅ ALL CHECKS PASSED')
else console.log(`${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
