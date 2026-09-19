// Verifies the three-letter club codes (src/data/club-codes.ts):
//  - every club in the bundled DB gets a code of exactly three A–Z/0–9 characters
//  - no two clubs share a code inside the same competition (league_id), which is
//    the set that can appear on one screen together
//  - every override names a club that actually exists (a renamed club would
//    otherwise leave a dead override and its old clash back in play)
//  - the contrast helper the Tape uses agrees with the published figures
// Run: npx tsx scripts/verify-club-codes.ts

import Database from 'better-sqlite3'
import path from 'node:path'
import { clubCode, CLUB_CODE_OVERRIDES } from '../src/data/club-codes'
import { ratio } from '../src/lib/contrast'

let failures = 0
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; console.log(`❌ ${msg}`) }
}

const db = new Database(path.join(__dirname, '..', 'assets', 'db', 'players_v5.db'), { readonly: true })
const clubs = db.prepare('SELECT id, league_id, name, short_name FROM clubs').all() as
  { id: string; league_id: string; name: string; short_name: string | null }[]

const seen = new Map<string, string>()   // `${league}|${code}` → club name
for (const c of clubs) {
  const code = clubCode(c.name, c.short_name)
  check(/^[A-Z0-9]{3}$/.test(code), `${c.id}: bad code "${code}"`)
  const key = `${c.league_id}|${code}`
  const other = seen.get(key)
  check(!other || other === c.name, `${c.league_id}: ${code} is both "${other}" and "${c.name}"`)
  seen.set(key, c.name)
}

const names = new Set(clubs.map(c => c.name))
for (const name of Object.keys(CLUB_CODE_OVERRIDES)) {
  check(names.has(name), `override for "${name}" matches no club in the DB`)
}

// Contrast helper — same numbers as docs/ui-overhaul/05-STYLE-GUIDE.md §2.2.
const near = (a: number, b: number) => Math.abs(a - b) < 0.01
check(near(ratio('#FFFFFF', '#F5C518'), 1.63), 'contrast: white on WC gold should be 1.63')
check(near(ratio('#0C0C0D', '#F3F3F0'), 17.59), 'contrast: ink on cotton should be 17.59')
check(near(ratio('#FF5A00', '#F3F3F0'), 2.81), 'contrast: orange on cotton should be 2.81')

console.log(`${clubs.length} clubs, ${new Set(clubs.map(c => c.league_id)).size} competitions, ${Object.keys(CLUB_CODE_OVERRIDES).length} overrides`)
if (failures === 0) console.log('✅ ALL CHECKS PASSED')
else console.log(`${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
