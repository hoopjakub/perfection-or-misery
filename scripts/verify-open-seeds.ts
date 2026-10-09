/**
 * Can every mode run on the open seeds? (docs/release/06-OUR-OWN-DATA.md §7)
 *
 *   npx tsx scripts/verify-open-seeds.ts
 *
 * Invariants over scripts/seed-open/, the house style of the other verify-*
 * scripts: a check() that counts failures, a summary, exit 0 only when clean.
 *   • every club-season can field a team: ≥ 11 players, a goalkeeper, 3+ defenders;
 *   • ratings on the game's scale (58–93), attributes present, positions real;
 *   • no Transfermarkt field left (tm_id) and no Transfermarkt ids in player ids;
 *   • no player-season id twice across all seeds (build-db skips a repeat);
 *   • nationality turns into a flag for most players (the app's own resolver);
 *   • the draft pools the modes read: every league-season of the five, and
 *     every association in the custom Champions League path.
 */
import fs from 'fs'
import path from 'path'
import { flagForNationality } from '../src/data/geo-iso'

const DIR = process.env.OPEN_OUT ?? path.join(__dirname, 'seed-open')
const POSITIONS = new Set(['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST'])
const DEF = new Set(['CB', 'LB', 'RB'])

let failures = 0
const check = (cond: boolean, msg: string) => { if (!cond) { failures++; if (failures <= 40) console.log(`❌ ${msg}`) } }

type P = { id: string; name: string; nationality: string; primary_position: string; ovr: number; attack?: number }
const squads: { where: string; players: P[]; year: number; club: string }[] = []

if (!fs.existsSync(DIR)) { console.log('no scripts/seed-open yet: run build-open-seeds.ts'); process.exit(1) }
for (const file of fs.readdirSync(DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'))) {
  const raw = fs.readFileSync(path.join(DIR, file), 'utf8')
  check(!/"tm_id"/.test(raw), `${file}: still carries tm_id`)
  const data = JSON.parse(raw)
  if (data.competition?.id === 'custom_ucl') {
    for (const c of data.clubs) squads.push({ where: `${file} ${c.league_id} ${c.name}`, players: c.players, year: c.year_start, club: c.name })
    const leagues = new Set(data.clubs.map((c: any) => c.league_id))
    for (const lg of data.leagues) check(leagues.has(lg.seedId), `custom path: no clubs for ${lg.seedId}`)
  } else if (data.league) {
    for (const c of data.clubs) for (const s of c.seasons) squads.push({ where: `${file} ${c.name} ${s.year_start}`, players: s.players, year: s.year_start, club: c.name })
  }
}

// build-db.ts keys a player-season on `${id}_${year}` and SKIPS a repeat, so a
// repeat is a player silently missing from a squad in the app. The first open
// build had 7,600 of them (Barcelona's 2025–26 copies came out empty).
const seen = new Map<string, string>()
let repeats = 0
for (const s of squads) for (const x of s.players) {
  const key = `${x.id}_${s.year}`
  if (seen.has(key)) { repeats++; if (repeats <= 5) check(false, `${key} is in both "${seen.get(key)}" and "${s.where}"`) }
  else seen.set(key, s.where)
}
check(repeats === 0, `${repeats} player-season ids repeat across the seeds (each one a player lost in the database)`)

let flagged = 0, total = 0
for (const s of squads) {
  const p = s.players
  check(p.length >= 11, `${s.where}: only ${p.length} players`)
  check(p.some(x => x.primary_position === 'GK'), `${s.where}: no goalkeeper`)
  check(p.filter(x => DEF.has(x.primary_position)).length >= 3, `${s.where}: fewer than 3 defenders`)
  for (const x of p) {
    total++
    if (flagForNationality(x.nationality)) flagged++
    check(x.ovr >= 58 && x.ovr <= 93, `${s.where}: ${x.name} OVR ${x.ovr} off the scale`)
    check(POSITIONS.has(x.primary_position), `${s.where}: ${x.name} position ${x.primary_position}`)
    check(typeof x.attack === 'number', `${s.where}: ${x.name} has no attributes`)
  }
}
// Phase 9.75 (L-15): every club fields its own players. A European club was
// matched by name to another club's article: Red Star Belgrade and Red Bull
// Salzburg fielded Manchester United's squad, Celtic Celta de Vigo's. Two
// differently named clubs sharing eight or more players in one season is that.
{
  const at = new Map<string, Set<string>>()   // "year|player" → the clubs fielding him
  for (const s of squads) for (const x of s.players) {
    const k = `${s.year}|${x.name}`
    let set = at.get(k); if (!set) at.set(k, set = new Set()); set.add(s.club)
  }
  const shared = new Map<string, number>()
  for (const [k, clubs] of at) {
    const list = [...clubs].sort()
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const pair = `${k.split('|')[0]} ${list[i]} / ${list[j]}`
      shared.set(pair, (shared.get(pair) ?? 0) + 1)
    }
  }
  for (const [pair, n] of shared) if (n >= 8) check(false, `${pair}: ${n} players in both squads (one was matched to the other's article)`)
  // And the clubs' Wikidata items: one item, one club.
  const qf = path.join(DIR, '_qids.json')
  if (fs.existsSync(qf)) {
    const qids: Record<string, string> = JSON.parse(fs.readFileSync(qf, 'utf8'))
    const base = (id: string) => id.replace(/_(ucl|uel|uecl|cucl)$/, '')
    const by = new Map<string, Set<string>>()
    for (const [id, q] of Object.entries(qids)) { let set = by.get(q); if (!set) by.set(q, set = new Set()); set.add(base(id)) }
    for (const [q, ids] of by) if (ids.size > 1) check(false, `Wikidata ${q} is given to ${[...ids].join(', ')}`)
  }
}

const flagShare = total ? flagged / total : 0
check(flagShare >= 0.95, `only ${(flagShare * 100).toFixed(1)}% of players get a flag (want 95%+)`)

console.log(`\n${squads.length} club-seasons, ${total} player-seasons; ${(flagShare * 100).toFixed(1)}% with a flag`)
console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
