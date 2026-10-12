/**
 * The public (legal) build, as shipped: no real club or player name anywhere
 * in its JavaScript, and only the public database (with altered names) in its
 * assets. The honest test of Wave D's altered names: the tables in the app
 * keyed by real names (stadiums, club codes, club countries, club facts) and
 * hand-written copy are where one slips back in.
 *
 *   EXPO_PUBLIC_BRAND_MODE=original npx expo export -p web --clear --output-dir <dir>
 *   npx tsx scripts/verify-legal-bundle.ts <dir>
 *
 * A place that happens to share a club's name (a district, a town) shows as a
 * hit with its context, to judge by eye; ALLOWED lists the ones already judged.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import path from 'path'
import Database from 'better-sqlite3'

const dir = process.argv[2]
// --update: an over-the-air update's export (expo export -p android). It ships
// no database (the phone keeps the APK's), so instead its code must point at
// the public one and never the personal one.
const update = process.argv.includes('--update')
if (!dir || !existsSync(dir)) { console.error('usage: npx tsx scripts/verify-legal-bundle.ts <export dir> [--update]'); process.exit(1) }
let failures = 0
const check = (c: boolean, msg: string) => { if (!c) { failures++; console.log(`❌ ${msg}`) } }

// Places, not clubs: judged 1 Oct 2026 (Derry's stadium sits in the district
// "Derry City and Strabane"; Montana is a Bulgarian town).
const ALLOWED = new Set(['Derry City', 'Montana'])

let js = '', hbc = false
const dbs: string[] = []
;(function walk(d: string) {
  for (const f of readdirSync(d)) {
    const p = path.join(d, f)
    if (statSync(p).isDirectory()) walk(p)
    // .hbc: an Android export is Hermes bytecode, whose strings are stored as
    // text. This read only .js until 11 Oct 2026, so a phone update's export
    // was checked against nothing and passed (found the day after its first use).
    else if (p.endsWith('.js') || p.endsWith('.hbc')) { js += readFileSync(p, 'utf8'); hbc ||= p.endsWith('.hbc') }
    else if (p.endsWith('.db')) dbs.push(p)
  }
})(dir)
const rows = (file: string) => readFileSync(path.join(__dirname, 'legal-names', file), 'utf8').split(/\r?\n/).slice(1).filter(Boolean).map(l => l.split(','))

const clubHits: string[] = [], seen = new Set<string>()
for (const [, real, alt] of rows('clubs.csv')) {
  if (!real || seen.has(real) || real === alt || real.length <= 5) continue
  seen.add(real)
  if (js.includes(real) && !ALLOWED.has(real)) clubHits.push(real)
}
check(clubHits.length === 0, `${clubHits.length} real club names in the bundle: ${clubHits.slice(0, 10).join(' | ')}`)
const playerHits: string[] = [], seenP = new Set<string>()
for (const r of rows('players.csv')) {
  const real = r[1]
  if (!real || !real.includes(' ') || seenP.has(real)) continue
  seenP.add(real)
  if (js.includes(real)) playerHits.push(real)
}
check(playerHits.length === 0, `${playerHits.length} real player names in the bundle: ${playerHits.slice(0, 10).join(' | ')}`)
// The abbreviations (11 Oct 2026): renamed by the same table, so none may be left.
// The rename table itself ships (renameText runs on stored runs too), so its
// own entries and quick test are left out. Hermes bytecode keeps each string
// once, the table's entries as bare 'UCL', 'UEL', 'UECL', so there one copy
// of each is the table's and a second would be a screen's.
const table = js.replace(/\[['"](UECL|UCL|UEL)['"],/g, '').replace(/Ligue 1\|UCL\|UEL\|UECL/g, '')
const allowed = hbc ? 1 : 0
const abbr = ['UCL', 'UEL', 'UECL'].filter(a => (table.match(new RegExp(`\\b${a}\\b`, 'g'))?.length ?? 0) > allowed)
check(abbr.length === 0, `real competition abbreviations in the bundle: ${abbr.join(', ')}`)
check(js.length > 1_000_000, `only ${js.length} characters of code were read: the check would pass on nothing`)
if (update) {
  check(dbs.length === 0, `an update ships ${dbs.length} database(s); the phone keeps the APK's`)
  check(js.includes('players_legal') && !js.includes('players_v5'), 'the update’s code points at the personal database, or at none')
} else check(dbs.length === 1 && /players_legal/.test(dbs[0]), `the export ships ${dbs.map(d => path.basename(d)).join(', ') || 'no database'}, not only players_legal`)
for (const d of dbs) {
  const db = new Database(d, { readonly: true })
  const n = (db.prepare("SELECT count(*) n FROM clubs WHERE name IN ('Real Madrid','Manchester United','Juventus FC','Bayern Munich')").get() as { n: number }).n
  check(n === 0, `${path.basename(d)} still names real clubs`)
  db.close()
}
console.log(`${seen.size} club names and ${seenP.size} player names checked`)
console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} failed`)
process.exit(failures === 0 ? 0 : 1)
