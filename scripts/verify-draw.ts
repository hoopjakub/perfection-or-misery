// P8-114: the league-phase draw. Every club two opponents from each pot, one
// home and one away; never its own country, at most two from any other; eight
// matchdays with every club once a matchday. And it has to be FAST: The
// Dugout's first draw was bounded and still took 160 seconds on a field it
// could never draw, so this times every draw and fails on a slow one.
// npx tsx scripts/verify-draw.ts
import { buildCLTeams, drawCLLeaguePhase, type CLTeam } from '../src/engine/cl-sim'
import { minimumCap, FOUR_POTS, SIX_POTS } from '../src/engine/cl-draw'
import fs from 'fs'
import path from 'path'
import { countryForClClub } from '../src/data/geo-iso'

let failures = 0
function check(cond: boolean, msg: string) { if (!cond) { failures++; if (failures <= 25) console.log('❌', msg) } }

let seed = 7
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }

// Fields shaped like the real ones: the 2025–26 league phase had 16
// associations, England six. The harsh shape crowds the top leagues further
// (a full path where the big five take more of the places).
const SHAPES: Record<string, number[]> = {
  real: [6, 5, 4, 4, 3, 3, 2, 2, 1, 1, 1, 1, 1, 1, 1],
  harsh: [7, 6, 5, 5, 4, 3, 2, 1, 1, 1, 1],
  even: Array(18).fill(2),
  // Impossible at a cap of two: 9 of 36 from one country need 72 opponents,
  // the other 27 can give 54. The count must see it and raise the cap, not search.
  crowded: [9, 7, 6, 5, 4, 3, 2],
}

function field(shape: number[]): { teams: CLTeam[]; country: Map<string, string> } {
  const clubs: { clubId: string; clubName: string; ovr: number; isPlayer: boolean }[] = []
  const country = new Map<string, string>()
  shape.forEach((k, c) => {
    for (let i = 0; i < k; i++) {
      const id = `c${c}-${i}`
      // Bigger leagues' clubs lean stronger, so pot 1 leans their way, as it does
      // (the real 2025–26 pot 1 was three English, two Spanish, two German).
      clubs.push({ clubId: id, clubName: id, ovr: Math.round(70 + (shape.length - c) * 0.5 + rnd() * 14), isPlayer: clubs.length === 0 })
      country.set(id, `N${c}`)
    }
  })
  // Potted as the game pots them: by rating, then made drawable (balancePots).
  const teams = buildCLTeams(clubs, t => country.get(t.clubId))
  for (const p of [1, 2, 3, 4]) check(teams.filter(t => t.pot === p).length === 9, `pot ${p} isn't nine after balancing`)
  return { teams, country }
}

const RUNS = Number(process.env.RUNS ?? 150)
const times: number[] = []
const relaxedSeen = new Map<string, number>()
for (const [name, shape] of Object.entries(SHAPES)) {
  for (let run = 0; run < RUNS; run++) {
    const { teams, country } = field(shape)
    const t0 = performance.now()
    const { fixtures, relaxed } = drawCLLeaguePhase(teams, t => country.get(t.clubId))
    const ms = performance.now() - t0
    times.push(ms)
    relaxedSeen.set(`${name}:${relaxed}`, (relaxedSeen.get(`${name}:${relaxed}`) ?? 0) + 1)
    check(ms < 1500, `${name}: a draw took ${Math.round(ms)} ms`)
    check(relaxed !== 'fixed', `${name}: the draw fell back to the fixed pairing`)
    const potsOf = [1, 2, 3, 4].map(p => teams.map((t, i) => (t.pot === p ? i : -1)).filter(i => i >= 0))
    const cap = relaxed === 'none' ? 2 : relaxed === 'cap' ? minimumCap(potsOf, teams.map(t => country.get(t.clubId))) : Infinity

    for (const t of teams) {
      const mine = fixtures.filter(f => f.home.clubId === t.clubId || f.away.clubId === t.clubId)
      const opp = mine.map(f => (f.home.clubId === t.clubId ? f.away : f.home))
      check(mine.length === 8, `${name}: ${t.clubId} plays ${mine.length}, not 8`)
      check(mine.filter(f => f.home.clubId === t.clubId).length === 4, `${name}: ${t.clubId} isn't four home, four away`)
      check(new Set(opp.map(o => o.clubId)).size === opp.length, `${name}: ${t.clubId} meets someone twice`)
      for (const p of [1, 2, 3, 4]) {
        const fromPot = mine.filter(f => (f.home.clubId === t.clubId ? f.away : f.home).pot === p)
        check(fromPot.length === 2 && fromPot.filter(f => f.home.clubId === t.clubId).length === 1,
          `${name}: ${t.clubId} hasn't one home and one away from pot ${p}`)
      }
      if (relaxed !== 'country') {
        const mineC = country.get(t.clubId)
        check(!opp.some(o => country.get(o.clubId) === mineC), `${name}: ${t.clubId} meets a club from its own country`)
        const per = new Map<string, number>()
        for (const o of opp) per.set(country.get(o.clubId)!, (per.get(country.get(o.clubId)!) ?? 0) + 1)
        check(Math.max(...per.values()) <= cap, `${name}: ${t.clubId} meets ${Math.max(...per.values())} from one country (cap ${cap})`)
      }
      for (let md = 1; md <= 8; md++) {
        check(mine.filter(f => f.matchday === md).length === 1, `${name}: ${t.clubId} doesn't play exactly once on matchday ${md}`)
      }
    }
  }
}

// The real 2025–26 field, its real pots and countries (UEFA's own papers, in
// The Dugout's docs/reference/uefa): it must draw under the full rules, every time.
{
  const REAL: [number, string][] = [
    'FRA ESP ENG GER ENG ITA ENG GER ESP', 'ENG GER ESP POR ITA ESP ITA GER BEL',
    'ENG NED NED ITA POR GRE CZE NOR FRA', 'DEN FRA TUR BEL AZE ESP ENG CYP KAZ',
  ].flatMap((row, p) => row.split(' ').map(c => [p + 1, c] as [number, string]))
  const teams: CLTeam[] = REAL.map(([pot, c], i) => ({
    clubId: `r${i}`, clubName: `${c}${i}`, ovr: 80, isPlayer: i === 0, form: 0, pot: pot as 1 | 2 | 3 | 4,
    stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
  }))
  const countryR = (t: CLTeam) => t.clubName.slice(0, 3)
  let strict = 0, worst = 0
  for (let run = 0; run < 60; run++) {
    const t0 = performance.now()
    const d = drawCLLeaguePhase(teams, countryR)
    worst = Math.max(worst, performance.now() - t0)
    if (d.relaxed === 'none') strict++
    for (const t of teams) {
      const opp = d.fixtures.filter(f => f.home === t || f.away === t).map(f => (f.home === t ? f.away : f.home))
      check(opp.length === 8 && !opp.some(o => countryR(o) === countryR(t)), `the real field: ${t.clubName} has ${opp.length} opponents or meets its own country`)
    }
  }
  check(strict === 60, `the real 2025–26 field drew under the full rules only ${strict} times in 60`)
  console.log(`the real 2025–26 field: ${strict}/60 under the full rules, slowest ${worst.toFixed(0)} ms`)
}

// PoM's own classic editions, from the bundled database, potted the way the
// game pots them (by rating, not coefficient), countries from geo-iso: what a
// player actually gets. Every club must have a country, and every edition must
// draw under the full rules.
{
  const Database = require('better-sqlite3')
  const db = new Database(process.env.POM_DB ?? 'assets/db/players_v5.db', { readonly: true })
  const rows: { year_start: number; club_id: string; club_name: string; historical_ovr: number }[] = db.prepare(
    `SELECT cs.year_start, c.id AS club_id, c.name AS club_name, cs.historical_ovr
     FROM club_seasons cs JOIN clubs c ON c.id = cs.club_id JOIN leagues l ON l.id = c.league_id
     WHERE l.id LIKE 'ucl_%'`).all()
  for (const year of [...new Set(rows.map(r => r.year_start))].sort()) {
    const edition = rows.filter(r => r.year_start === year)
    const teams = buildCLTeams(edition.map((r, i) => ({ clubId: r.club_id, clubName: r.club_name, ovr: r.historical_ovr, isPlayer: i === 0 })), t => countryForClClub(t.clubName))
    const missing = teams.filter(t => !countryForClClub(t.clubName)).map(t => t.clubName)
    check(missing.length === 0, `edition ${year}: no country for ${missing.join(', ')}`)
    let strict = 0, worst = 0
    for (let run = 0; run < 40; run++) {
      const t0 = performance.now()
      if (drawCLLeaguePhase(teams, t => countryForClClub(t.clubName)).relaxed === 'none') strict++
      worst = Math.max(worst, performance.now() - t0)
    }
    check(strict === 40, `edition ${year}: drew under the full rules only ${strict} of 40`)
    console.log(`edition ${year} (${teams.length} clubs): ${strict}/40 under the full rules, slowest ${worst.toFixed(0)} ms`)
  }
}

// The same field twice draws differently: it's a draw, not a fixed table.
{
  const { teams, country } = field(SHAPES.real)
  const key = (fx: { home: CLTeam; away: CLTeam }[]) => fx.map(f => `${f.home.clubId}>${f.away.clubId}`).sort().join(',')
  const a = drawCLLeaguePhase(teams, t => country.get(t.clubId)).fixtures
  const b = drawCLLeaguePhase(teams, t => country.get(t.clubId)).fixtures
  check(key(a) !== key(b), 'two draws of the same field came out identical')
}

// The holders are the top seed of pot 1 whatever their rating.
{
  const clubs = Array.from({ length: 36 }, (_, i) => ({ clubId: `h${i}`, clubName: `H${i}`, ovr: 90 - i, isPlayer: false, holder: i === 35 }))
  check(buildCLTeams(clubs).find(t => t.clubId === 'h35')!.pot === 1, 'the holders, the weakest side, were not put in pot 1')
  // Balancing never moves them: nine from one country, the holders the weakest of them.
  const crowdedPot1 = buildCLTeams(clubs.map((c, i) => ({ ...c, holder: i === 8 })), t => (Number(t.clubId.slice(1)) < 9 ? 'X' : `Y${Number(t.clubId.slice(1)) % 9}`))
  check(crowdedPot1.find(t => t.clubId === 'h8')!.pot === 1, 'balancing the pots moved the holders out of pot 1')
}

// The count: nine from one country, spread 3/2/2/2 over the pots, need a cap
// of three (18 opponents per pot from the 6 or 7 others); six English with
// four in pot 1 can't be drawn at two (4 + 6 > 9), with three they can.
{
  const idx = (n: number, from: number) => Array.from({ length: n }, (_, i) => from + i)
  const pots = [idx(9, 0), idx(9, 9), idx(9, 18), idx(9, 27)]
  const nine = pots.flatMap((p, k) => p.map((_, j) => (j < (k === 0 ? 3 : 2) ? 'A' : `B${(k * 9 + j) % 7}`)))
  check(minimumCap(pots, nine) === 3, `nine from one country: cap ${minimumCap(pots, nine)}, expected 3`)
  const english = (inPot1: number) => pots.flatMap((p, k) => p.map((_, j) => (k === 0 && j < inPot1) || (k === 1 && j < 6 - inPot1) ? 'ENG' : `X${k}${j}`))
  check(minimumCap(pots, english(4)) > 2 && minimumCap(pots, english(3)) === 2, 'the count got six English clubs wrong (four in pot 1 is too many, three is the limit)')
}

// P8-172: the real Europa League and Conference League 2025–26 fields, in their
// real pots (scripts/seed-open), drawn as they are in the game: four pots of two in
// the Europa League, six pots of one in the Conference League.
for (const [file, format] of [['europa_league.json', FOUR_POTS], ['conference_league.json', SIX_POTS]] as const) {
  const seedData = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-open', file), 'utf-8'))
  const clubs = seedData.clubs.map((c: any, i: number) => ({ clubId: c.id, clubName: c.name, ovr: c.seasons[0].historical_ovr, isPlayer: i === 0, pot: c.seasons[0].league_position }))
  const perClub = format.pots * format.perPot
  for (let run = 0; run < RUNS; run++) {
    const teams = buildCLTeams(clubs, t => countryForClClub(t.clubName))
    const t0 = performance.now()
    const { fixtures, relaxed } = drawCLLeaguePhase(teams, t => countryForClClub(t.clubName), format)
    const ms = performance.now() - t0
    times.push(ms)
    relaxedSeen.set(`${file}:${relaxed}`, (relaxedSeen.get(`${file}:${relaxed}`) ?? 0) + 1)
    check(ms < 1500, `${file}: a draw took ${Math.round(ms)} ms`)
    check(relaxed !== 'fixed', `${file}: the draw fell back to the fixed pairing`)
    for (const t of teams) {
      const mine = fixtures.filter(f => f.home.clubId === t.clubId || f.away.clubId === t.clubId)
      const opp = mine.map(f => (f.home.clubId === t.clubId ? f.away : f.home))
      const home = mine.filter(f => f.home.clubId === t.clubId).length
      check(mine.length === perClub && new Set(opp.map(o => o.clubId)).size === perClub, `${file}: ${t.clubName} has ${mine.length} matches`)
      for (let p = 1; p <= format.pots; p++) check(opp.filter(o => o.pot === p).length === format.perPot, `${file}: ${t.clubName} doesn't meet ${format.perPot} from pot ${p}`)
      check(home === perClub / 2, `${file}: ${t.clubName} is at home ${home} of ${perClub}`)
      const c = countryForClClub(t.clubName)
      if (relaxed === 'none' && c) {
        check(!opp.some(o => countryForClClub(o.clubName) === c), `${file}: ${t.clubName} meets a club from its own country`)
        const per = new Map<string, number>()
        for (const o of opp) { const oc = countryForClClub(o.clubName); if (oc) per.set(oc, (per.get(oc) ?? 0) + 1) }
        check([...per.values()].every(n => n <= 2), `${file}: ${t.clubName} meets three from one country`)
      }
    }
    for (let md = 1; md <= perClub; md++) {
      const day = fixtures.filter(f => f.matchday === md)
      const seen = new Set(day.flatMap(f => [f.home.clubId, f.away.clubId]))
      check(seen.size === teams.length && day.length === teams.length / 2, `${file}: matchday ${md} doesn't have every club once`)
    }
  }
}

times.sort((a, b) => a - b)
const avg = times.reduce((a, b) => a + b, 0) / times.length
console.log(`${times.length} draws · ${avg.toFixed(1)} ms average · median ${times[Math.floor(times.length / 2)].toFixed(1)} ms · slowest ${times[times.length - 1].toFixed(1)} ms`)
console.log(`rules that gave: ${[...relaxedSeen.entries()].map(([k, v]) => `${k} ${v}`).join(', ')}`)
console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} failures`)
process.exit(failures === 0 ? 0 : 1)
