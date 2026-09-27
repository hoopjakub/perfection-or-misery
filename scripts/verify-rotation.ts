// Verifies P8-28: league rotation reads its stakes lines from the real zones
// (`leagueCutoffs`) instead of a fixed "top 5" and "bottom 3".
//  - the two cases the roadmap names: a 7th-placed side still in reach of the
//    last European place doesn't rest, and a side in the relegation places
//    that can still escape doesn't either
//  - measured over whole seasons, played through the real fixture player
//    (`playFixture`) with the same seeds and dice for both versions: how often
//    clubs rest, the champion's and the relegated sides' points, and your win
//    rate. The change is accepted only if those stay within noise, or move for
//    a reason we can name (the "name the reason" rule).
// Run: npx tsx scripts/verify-rotation.ts

import { rotationFor, leagueCutoffs } from '../src/engine/rotation'
import { playFixture } from '../src/engine/play-fixture'
import { zonesFor } from '../src/data/qualification-bands'
import { mulberry32 } from '../src/lib/rng'
import type { RosterPlayer } from '../src/types/stats'
import type { SimTeam } from '../src/types/simulation'

let failures = 0
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; if (failures <= 30) console.log(`❌ ${msg}`) }
}

// ── The named cases ─────────────────────────────────────────────────────────
{
  // 20 clubs, 7 places reach Europe, 5 games left (15 points still winnable).
  // 7th can no longer reach 5th (17 behind) — so the old "top 5" rule called it
  // settled — but 8th is only 7 behind it: it's in a real race for the last
  // European place and must field its best.
  const top = [90, 86, 82, 78, 74, 72]
  const standings = Array.from({ length: 20 }, (_, i) => ({ clubId: `c${i}`, points: i < 6 ? top[i] : i === 6 ? 57 : i === 7 ? 50 : 45 - i }))
  const zones = [...Array(7).fill('ucl'), ...Array(10).fill(null), 'down', 'down', 'down']
  const base = { standings, clubId: 'c6', totalMatchdays: 38, playedMatchdays: 33, titleMatters: true }
  const old = rotationFor({ ...base, qualifyCutoff: 5, dropCutoff: 3 })
  const now = rotationFor({ ...base, ...leagueCutoffs(zones) })
  check(old > 0, 'the old cut-offs should have rested the 7th-placed side (the bug the entry describes)')
  check(now === 0, `a 7th-placed side still in a European race rests (rotation ${now})`)

  // Ligue 1 2022/23 sent four down: 17th, one point from safety, must not rest.
  const l1 = Array.from({ length: 20 }, (_, i) => ({ clubId: `d${i}`, points: 80 - i * 3 }))
  const l1zones = [...Array(16).fill(null), 'down', 'down', 'down', 'down']
  const b2 = { standings: l1, clubId: 'd16', totalMatchdays: 38, playedMatchdays: 36, titleMatters: true }
  check(rotationFor({ ...b2, ...leagueCutoffs(l1zones) }) === 0, '17th in a four-down season rests while it can still escape')
  check(leagueCutoffs(l1zones).dropCutoff === 4 && leagueCutoffs(zones).qualifyCutoff === 7, 'cut-offs not read from the zones')
  check(JSON.stringify(leagueCutoffs([])) === JSON.stringify({ qualifyCutoff: 5, dropCutoff: 3 }), 'no zones should keep the old numbers')
}

// ── Whole seasons, old against new ──────────────────────────────────────────
const XI = ['GK', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST']
const BENCH = ['GK', 'CB', 'CM', 'RW', 'ST']
function pool(club: string, ovr: number, rng: () => number): RosterPlayer[] {
  const mk = (pos: string, i: number, bench: boolean): RosterPlayer => {
    const o = Math.round(ovr + (rng() - 0.5) * 10 - (bench ? 4 : 0))
    return { playerId: `${club}-${i}${bench ? 'b' : ''}`, name: `${club} ${pos}${i}`, primaryPosition: pos,
      attack: Math.max(30, o + (pos === 'ST' ? 8 : pos === 'CB' || pos === 'GK' ? -12 : -3)), ovr: o,
      isBench: bench || undefined, birthYear: 1995, yearStart: 2024, seasonLabel: '24/25', clubId: club, clubName: club }
  }
  return [...XI.map((p, i) => mk(p, i, false)), ...BENCH.map((p, i) => mk(p, 100 + i, true))]
}
// A double round robin by the circle method: 19 rounds, then the same reversed.
function schedule(n: number): [number, number][][] {
  const ids = Array.from({ length: n }, (_, i) => i)
  const first = Array.from({ length: n - 1 }, (_, r) => {
    const rot = [ids[0], ...ids.slice(1).map((_, k) => ids[1 + ((k + r) % (n - 1))])]
    return Array.from({ length: n / 2 }, (_, k) => [rot[k], rot[n - 1 - k]] as [number, number])
  })
  return [...first, ...first.map(day => day.map(([h, a]) => [a, h] as [number, number]))]
}

type Tally = { rested: number; slots: number; champPts: number; downPts: number; downN: number; youW: number; youG: number }
const LEAGUES: [string, number][] = [['premier_league', 2023], ['bundesliga', 2022], ['ligue_1', 2022], ['serie_a', 2021], ['la_liga', 2020]]

function season(seed: number, league: string, year: number, useZones: boolean, t: Tally) {
  const n = 20
  const zones = zonesFor(league, year, n) as (string | null)[]
  const cut = useZones ? leagueCutoffs(zones) : { qualifyCutoff: 5, dropCutoff: 3 }
  const rng = mulberry32(seed)
  const pools = new Map<string, RosterPlayer[]>()
  const teams: SimTeam[] = Array.from({ length: n }, (_, i) => {
    const id = `t${i}`, ovr = 88 - i
    pools.set(id, pool(id, ovr, rng))
    return { clubId: id, clubName: id, ovr, isPlayer: i === seed % n, form: 0, stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 } }
  })
  Math.random = mulberry32(seed * 7919)    // the same dice for both versions
  const seeds = mulberry32(seed * 31)
  const days = schedule(n)
  days.forEach((day, d) => day.forEach(([h, a]) => {
    const home = teams[h], away = teams[a]
    const p = playFixture(home, away, {
      matchday: d + 1, seed: Math.floor(seeds() * 2 ** 31), poolByClub: pools, ledger: null,
      lineupCtx: { playerClubId: teams.find(x => x.isPlayer)!.clubId, benchSize: 5 },
      stakes: { standings: teams.map(x => ({ clubId: x.clubId, points: x.stats.points })), totalMatchdays: days.length, playedMatchdays: d, ...cut, titleMatters: true },
    })
    t.slots += 2
    if (p.homeRotation > 0) t.rested++
    if (p.awayRotation > 0) t.rested++
    for (const [side, won] of [[home, p.result.outcome === 'home'], [away, p.result.outcome === 'away']] as [SimTeam, boolean][])
      if (side.isPlayer) { t.youG++; if (won) t.youW++ }
  }))
  const table = [...teams].sort((a, b) => b.stats.points - a.stats.points)
  t.champPts += table[0].stats.points
  const drop = zones.filter(z => z === 'down' || z === 'playoff').length || 3
  for (const x of table.slice(n - drop)) { t.downPts += x.stats.points; t.downN++ }
}

const blank = (): Tally => ({ rested: 0, slots: 0, champPts: 0, downPts: 0, downN: 0, youW: 0, youG: 0 })
const before = blank(), after = blank()
const SEASONS = 300
for (let s = 1; s <= SEASONS; s++) {
  const [league, year] = LEAGUES[s % LEAGUES.length]
  season(s, league, year, false, before)
  season(s, league, year, true, after)
}
const report = (t: Tally) => ({
  rest: (100 * t.rested) / t.slots, champ: t.champPts / SEASONS, down: t.downPts / t.downN, you: (100 * t.youW) / t.youG,
})
const b = report(before), a = report(after)
const f = (x: number) => x.toFixed(2)
console.log(`${SEASONS} seasons across ${LEAGUES.map(l => l[0]).join(', ')}`)
console.log(`  rested club-matches  ${f(b.rest)}% → ${f(a.rest)}%`)
console.log(`  champion's points    ${f(b.champ)} → ${f(a.champ)}`)
console.log(`  relegated sides'     ${f(b.down)} → ${f(a.down)}`)
console.log(`  your win rate        ${f(b.you)}% → ${f(a.you)}%`)

// The named reason for a move: more places are live, so clubs rest LESS, never more.
check(a.rest <= b.rest + 0.05, `clubs rest more with the real zones (${f(b.rest)}% → ${f(a.rest)}%): that has no reason behind it`)
// Everything else within noise: rotation only touches settled matches.
check(Math.abs(a.champ - b.champ) < 1.5, `the champion's points moved by ${f(a.champ - b.champ)}`)
check(Math.abs(a.down - b.down) < 1.5, `the relegated sides' points moved by ${f(a.down - b.down)}`)
check(Math.abs(a.you - b.you) < 2, `your win rate moved by ${f(a.you - b.you)} points`)

if (failures === 0) console.log('✅ ALL CHECKS PASSED')
else console.log(`${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
