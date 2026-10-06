// verify-highlights.ts — what the one result screen says (Wave F,
// docs/audit-2026-10/08-RESULT-PAGES.md §6 F1; src/lib/resultStory.ts).
//
// Over thousands of synthetic seasons (leagues, and cup runs that go out at
// every round or win it):
//  - every run yields one to three highlights, and each points at something
//    real that opens: a match of the run, a player of the run, a club in it,
//    a story of its press. No placeholder rows;
//  - the decider is the right match: a cup run's last knockout match; a
//    league's first matchday you held your final place from (not a match
//    before it, not one after);
//  - the one that got away appears only for a player who played in the run
//    and wasn't yours; a rival is a club that beat you twice, or the one just
//    above you;
//  - the doors: a table door when you're in the table, a bracket door exactly
//    when there were knockouts, a season door with your W/D/L adding up.
//
// Run: npx tsx scripts/verify-highlights.ts

import { runHighlights, resultDoors, type Highlight } from '../src/lib/resultStory'
import { mulberry32 } from '../src/lib/rng'
import { compareRows } from '../src/engine/standings'
import type { RunData, TableRow } from '../src/lib/runData'
import type { RunMatch } from '../src/engine/run-stats'

let failures = 0, checks = 0
function check(cond: boolean, msg: string) { checks++; if (!cond) { failures++; if (failures <= 25) console.log(`❌ ${msg}`) } }

const rng = mulberry32(31004)
const int = (n: number) => Math.floor(rng() * n)
const YOU = 'c0'

function league(n: number): RunData {
  const clubs = Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: `Club ${i}` }))
  const matches: RunMatch[] = []
  const rows = new Map(clubs.map(c => [c.id, { clubId: c.id, clubName: c.name, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }]))
  const positions = new Map<string, number[]>(clubs.map(c => [c.id, []]))
  const mds = 2 * (n - 1)
  for (let md = 1; md <= mds; md++) {
    // A rotating pairing: everyone plays once per matchday.
    const order = clubs.map(c => c.id)
    const fixed = order[0], rest = order.slice(1)
    const rot = [fixed, ...rest.slice(md % rest.length), ...rest.slice(0, md % rest.length)]
    for (let i = 0; i < n / 2; i++) {
      const h = rot[i], a = rot[n - 1 - i]
      const hg = int(4), ag = int(4)
      matches.push({ homeClubId: h, awayClubId: a, homeClubName: rows.get(h)!.clubName, awayClubName: rows.get(a)!.clubName, homeGoals: hg, awayGoals: ag, label: `Matchday ${md}`, seed: int(1e9) })
      const H = rows.get(h)!, A = rows.get(a)!
      H.played++; A.played++; H.goalsFor += hg; H.goalsAgainst += ag; A.goalsFor += ag; A.goalsAgainst += hg
      if (hg > ag) { H.won++; H.points += 3; A.lost++ } else if (hg < ag) { A.won++; A.points += 3; H.lost++ } else { H.drawn++; A.drawn++; H.points++; A.points++ }
    }
    const order2 = [...rows.values()].sort(compareRows)
    order2.forEach((r, i) => positions.get(r.clubId)!.push(i + 1))
  }
  const table: TableRow[] = [...rows.values()].sort(compareRows).map((r, i) => ({
    clubId: r.clubId, clubName: r.clubName, position: i + 1, played: r.played, won: r.won, drawn: r.drawn, lost: r.lost,
    gf: r.goalsFor, ga: r.goalsAgainst, points: r.points, isPlayer: r.clubId === YOU,
  }))
  return runData(matches, table, positions, n)
}

function cup(exitRound: number): RunData {
  // A league phase of 8 matchdays, then up to five knockout rounds; you go
  // out in `exitRound` (5 = you reach the final).
  const matches: RunMatch[] = []
  for (let md = 1; md <= 8; md++) matches.push({ homeClubId: YOU, awayClubId: `c${md}`, homeClubName: 'Club 0', awayClubName: `Club ${md}`, homeGoals: int(4), awayGoals: int(4), label: `League Phase · MD ${md}`, seed: int(1e9) })
  const rounds = ['Playoff', 'Round of 16', 'Quarter-final', 'Semi-final', 'Final']
  for (let r = 0; r < exitRound; r++) {
    const opp = `k${r}`
    const last = r === exitRound - 1
    if (rounds[r] === 'Final') {
      const g = int(3)
      matches.push({ homeClubId: YOU, awayClubId: opp, homeClubName: 'Club 0', awayClubName: `Opp ${r}`, homeGoals: g + (rng() < 0.5 ? 1 : 0), awayGoals: g, label: 'Final', seed: int(1e9) })
    } else {
      matches.push({ homeClubId: YOU, awayClubId: opp, homeClubName: 'Club 0', awayClubName: `Opp ${r}`, homeGoals: last ? 0 : 2, awayGoals: last ? 1 : 0, label: `${rounds[r]} · Leg 1`, seed: int(1e9) })
      matches.push({ homeClubId: opp, awayClubId: YOU, homeClubName: `Opp ${r}`, awayClubName: 'Club 0', homeGoals: last ? 2 : 0, awayGoals: last ? 0 : 1, label: `${rounds[r]} · Leg 2`, seed: int(1e9) })
    }
    // Other ties of the round, so the knockout isn't only yours.
    matches.push({ homeClubId: `x${r}`, awayClubId: `y${r}`, homeClubName: 'X', awayClubName: 'Y', homeGoals: 1, awayGoals: 0, label: `${rounds[r]} · Leg 1`, seed: int(1e9) })
  }
  const table: TableRow[] = Array.from({ length: 36 }, (_, i) => ({ clubId: i === 0 ? YOU : `t${i}`, clubName: `T${i}`, position: i + 1, played: 8, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 30 - i, isPlayer: i === 0 }))
  return runData(matches, table, null, 36)
}

function runData(matches: RunMatch[], table: TableRow[], positions: Map<string, number[]> | null, n: number): RunData {
  const players = Array.from({ length: 14 }, (_, i) => ({
    playerId: `p${i}`, name: `Player ${i}`, seasonLabel: '24/25', clubId: i < 11 ? YOU : `c${1 + (i % Math.max(1, n - 1))}`, clubName: 'C', position: 'ST',
    goals: int(20), assists: int(10), cleanSheets: 0, avgRating: 6 + rng() * 2, matchesRated: int(30), isPlayerClub: i < 11,
  }))
  return {
    key: 'live', mode: 'league', stats: { players, teams: [] } as any,
    awards: { playerOfTheSeason: [{ playerId: 'p0', name: 'Player 0' }] } as any,
    matchLog: null, rounds: null, matches, yearStart: 2024, leagueId: null, playerClubId: YOU, drafted: [], formation: null,
    table, positions, press: [], replacedClubName: null, missing: [],
    more: { pundits: null, punditPlaces: null, punditPoints: null, absences: [], cup: null, cl: null, wc: null, qual: null, domesticTables: null, gotAway: [] },
  }
}

function resolves(h: Highlight, d: RunData): boolean {
  const s = h.subject
  if (s.type === 'match') return (d.matches ?? []).includes(s.match)
  if (s.type === 'player') return d.stats.players.some(p => p.playerId === s.playerId)
  if (s.type === 'club') return d.table.some(r => r.clubId === s.clubId) || (d.matches ?? []).some(m => m.homeClubId === s.clubId || m.awayClubId === s.clubId)
  return d.press.some(x => x.id === s.storyId)
}

let leagues = 0, settled = 0, gotAways = 0, rivals = 0
for (let i = 0; i < 3000; i++) {
  const d = league(i % 2 ? 20 : 18)
  leagues++
  const away = rng() < 0.5 ? [{ playerId: `p${11 + int(3)}`, name: 'Away' }] : rng() < 0.5 ? [{ playerId: 'p3', name: 'Mine' }] : [{ playerId: 'nobody', name: 'Ghost' }]
  const hs = runHighlights(d, { gotAway: away })
  check(hs.length >= 1 && hs.length <= 3, `league ${i}: ${hs.length} highlights`)
  for (const h of hs) check(resolves(h, d), `league ${i}: the ${h.kind} row points at nothing (${JSON.stringify(h.subject).slice(0, 80)})`)
  const dec = hs.find(h => ['settled', 'bestWin'].includes(h.kind))
  if (dec?.kind === 'settled' && dec.subject.type === 'match') {
    settled++
    const series = d.positions!.get(YOU)!, final = series[series.length - 1]
    const md = Number(/Matchday (\d+)/.exec(dec.subject.match.label ?? '')?.[1])
    check(series[md - 1] === final && series.slice(md - 1).every(p => p === final) && series[md - 2] !== final, `league ${i}: "settled" on matchday ${md}, but your place there and after isn't held from then`)
    check(dec.subject.match.homeClubId === YOU || dec.subject.match.awayClubId === YOU, `league ${i}: the decider isn't your match`)
  }
  const ga = hs.find(h => h.kind === 'gotAway')
  if (ga) {
    gotAways++
    const p = d.stats.players.find(x => ga.subject.type === 'player' && x.playerId === ga.subject.playerId)
    check(!!p && !p.isPlayerClub && (p.matchesRated ?? 0) > 0, `league ${i}: the one that got away is yours, or never played`)
  }
  if (away[0].playerId === 'p3' || away[0].playerId === 'nobody') check(!ga, `league ${i}: a got-away row for your own player, or a player not in the run`)
  if (hs.some(h => h.kind === 'rival')) rivals++
  const doors = resultDoors(d, { awards: true })
  check(doors.some(x => x.id === 'table') && !doors.some(x => x.id === 'bracket'), `league ${i}: a table door and no bracket door`)
  const season = doors.find(x => x.id === 'season')?.value ?? ''
  const [w, dd, l] = (season.match(/(\d+)W (\d+)D (\d+)L/) ?? []).slice(1).map(Number)
  check(w + dd + l === (d.matches ?? []).filter(m => m.homeClubId === YOU || m.awayClubId === YOU).length, `league ${i}: the season door's ${season} doesn't add up to your matches`)
}

let cups = 0
for (let i = 0; i < 2000; i++) {
  const exit = 1 + (i % 5)
  const d = cup(exit)
  cups++
  const hs = runHighlights(d)
  check(hs.length >= 1 && hs.length <= 3, `cup ${i}: ${hs.length} highlights`)
  for (const h of hs) check(resolves(h, d), `cup ${i}: the ${h.kind} row points at nothing`)
  const dec = hs[0]
  const mine = (d.matches ?? []).filter(m => (m.homeClubId === YOU || m.awayClubId === YOU) && !/^League Phase/.test(m.label ?? ''))
  check(dec.subject.type === 'match' && dec.subject.match === mine[mine.length - 1], `cup ${i}: the decider isn't your last knockout match`)
  check(dec.kind === (exit === 5 ? 'final' : 'exit'), `cup ${i}: out in round ${exit}, the decider says ${dec.kind}`)
  const doors = resultDoors(d, { awards: false })
  check(doors.some(x => x.id === 'bracket'), `cup ${i}: no bracket door after knockouts`)
  check(!doors.some(x => x.id === 'awards'), `cup ${i}: an awards door with no awards page`)
}

console.log(`${leagues} leagues (${settled} decided on a "settled" matchday, ${gotAways} with the one that got away, ${rivals} with a rival), ${cups} cup runs`)
check(settled > 0 && gotAways > 0 && rivals > 0, 'a kind of highlight never came up: its checks never ran')
console.log(`${checks} checks`)
console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
