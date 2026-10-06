// P8-163: every nationality in the bundled database has a flag on its draft card.
import Database from 'better-sqlite3'
import path from 'path'
import { flagForNationality, nationalityCountry } from '../src/data/geo-iso'
import { flagCodeOf } from '../src/lib/flagMap'
const db = new Database(process.env.POM_DB ?? path.join(__dirname, '../assets/db/players_v5.db'), { readonly: true })
const rows = db.prepare('SELECT nationality, COUNT(*) AS n FROM players GROUP BY nationality').all() as { nationality: string; n: number }[]
const missing = rows.filter(r => r.nationality !== 'Unknown' && !flagCodeOf(flagForNationality(r.nationality)))
for (const r of missing) console.log(`❌ ${r.nationality} (${r.n} players) has no flag`)
console.log(`${rows.length} nationalities, ${missing.length} without a flag`)

// 3 Oct 2026: one nation, one label. The data stores both forms ("Spain" and
// "Spanish"); every form behind the same flag must print the same country.
const byFlag = new Map<string, Set<string>>()
for (const r of rows) {
  const flag = flagForNationality(r.nationality)
  if (!flag) continue
  byFlag.set(flag, (byFlag.get(flag) ?? new Set()).add(nationalityCountry(r.nationality)))
}
// The one real case of two countries under one flag: Northern Ireland has no
// flag of its own in football's emoji set and flies the Union flag, which a
// "British" player carries too. Both labels are right (6 Oct 2026).
const SHARED = new Set(['Northern Ireland|United Kingdom'])
const split = [...byFlag.values()].filter(s => s.size > 1 && !SHARED.has([...s].sort().join('|')))
for (const s of split) console.log(`❌ one flag, ${s.size} labels: ${[...s].join(' / ')}`)
console.log(`${byFlag.size} flags, ${split.length} printed two ways`)

const failures = missing.length + split.length
if (failures === 0) console.log('✅ ALL CHECKS PASSED')
process.exit(failures === 0 ? 0 : 1)
