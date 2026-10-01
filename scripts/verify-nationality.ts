// P8-163: every nationality in the bundled database has a flag on its draft card.
import Database from 'better-sqlite3'
import path from 'path'
import { flagForNationality } from '../src/data/geo-iso'
import { flagCodeOf } from '../src/lib/flagMap'
const db = new Database(process.env.POM_DB ?? path.join(__dirname, '../assets/db/players_v5.db'), { readonly: true })
const rows = db.prepare('SELECT nationality, COUNT(*) AS n FROM players GROUP BY nationality').all() as { nationality: string; n: number }[]
const missing = rows.filter(r => r.nationality !== 'Unknown' && !flagCodeOf(flagForNationality(r.nationality)))
for (const r of missing) console.log(`❌ ${r.nationality} (${r.n} players) has no flag`)
console.log(`${rows.length} nationalities, ${missing.length} without a flag`)
if (missing.length === 0) console.log('✅ ALL CHECKS PASSED')
process.exit(missing.length === 0 ? 0 : 1)
