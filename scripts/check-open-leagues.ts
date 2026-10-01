/**
 * Checks scripts/lib/open-leagues.ts: every league-season the game uses maps to
 * a Wikipedia article whose table parses to the right number of clubs.
 *
 *   npx tsx scripts/check-open-leagues.ts
 *
 * The club counts to expect come from the game's own seeds (how many clubs each
 * league has); a miss prints the article asked for and, for a missing page,
 * Wikipedia's search suggestions, so the fix is one OVERRIDE line.
 */
import fs from 'fs'
import path from 'path'
import { leagueArticle } from './lib/open-leagues'
import { leagueTableFor } from './lib/wikipedia'

const SEED = path.join(__dirname, 'seed-identity')
const custom = JSON.parse(fs.readFileSync(path.join(SEED, 'CustomUcl.json'), 'utf8'))
const expected = new Map<string, number>()
for (const c of custom.clubs) expected.set(c.league_id, (expected.get(c.league_id) ?? 0) + 1)

const jobs: { seedId: string; year: number; clubs: number }[] = []
for (const [seedId, clubs] of expected) jobs.push({ seedId, year: 2025, clubs })
// The five leagues the game has across seasons (2018–19 onward).
for (const seedId of ['premier_league', 'serie_a', 'la_liga', 'bundesliga', 'ligue_1']) {
  const seed = JSON.parse(fs.readFileSync(path.join(SEED, `${seedId}.json`), 'utf8'))
  const byYear = new Map<number, number>()
  for (const c of seed.clubs) for (const s of c.seasons) byYear.set(s.year_start, (byYear.get(s.year_start) ?? 0) + 1)
  for (const [year, clubs] of byYear) if (year !== 2025) jobs.push({ seedId, year, clubs })
}

async function main() {
  let bad = 0
  for (const j of jobs) {
    const t = leagueArticle(j.seedId, j.year)
    const n = (await leagueTableFor(t)).length
    if (n !== j.clubs) {
      bad++
      console.log(`✗ ${j.seedId} ${j.year}: "${t}" → ${n} clubs (game has ${j.clubs})`)
    }
  }
  console.log(bad ? `\n${bad} of ${jobs.length} need a look` : `✅ all ${jobs.length} league-seasons map to a parsed table`)
}
main().catch(e => { console.error(e); process.exit(1) })
