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
if (!dir || !existsSync(dir)) { console.error('usage: npx tsx scripts/verify-legal-bundle.ts <export dir>'); process.exit(1) }
let failures = 0
const check = (c: boolean, msg: string) => { if (!c) { failures++; console.log(`❌ ${msg}`) } }

// Places, not clubs: judged 1 Oct 2026 (Derry's stadium sits in the district
// "Derry City and Strabane"; Montana is a Bulgarian town).
const ALLOWED = new Set(['Derry City', 'Montana'])

let js = ''
const dbs: string[] = []
;(function walk(d: string) {
  for (const f of readdirSync(d)) {
    const p = path.join(d, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (p.endsWith('.js')) js += readFileSync(p, 'utf8')
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
check(dbs.length === 1 && /players_legal/.test(dbs[0]), `the export ships ${dbs.map(d => path.basename(d)).join(', ') || 'no database'}, not only players_legal`)
for (const d of dbs) {
  const db = new Database(d, { readonly: true })
  const n = (db.prepare("SELECT count(*) n FROM clubs WHERE name IN ('Real Madrid','Manchester United','Juventus FC','Bayern Munich')").get() as { n: number }).n
  check(n === 0, `${path.basename(d)} still names real clubs`)
  db.close()
}
console.log(`${seen.size} club names and ${seenP.size} player names checked`)
console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} failed`)
process.exit(failures === 0 ? 0 : 1)
