/**
 * P8.5-21 step 1: the European Full Path, measured (docs/europe/07 §1).
 *
 * An instrument, not a check: it prints and never fails. It's what the target
 * multipliers (score.ts: TARGET_MULTIPLIER) get tuned against, and a change to
 * src/engine/europe-path.ts that moves a number by more than a few points
 * shows up here. Kept from the 29 Sept scratch script that wrote §1.
 *
 * Your club is drawn uniformly from every club in the 53 associations, as the
 * draw does; every league and cup is played, then the three ladders, then
 * your league phase and knockouts at a fixed team OVR. Provisional as §1 says:
 * no rotation, injuries or suspensions (the live screens have them).
 *
 *   npx tsx scripts/measure-europe.ts               all three parts
 *   PART=end|win|hunt RUNS=300 npx tsx scripts/measure-europe.ts
 */
import Database from 'better-sqlite3'
import path from 'path'
import { buildCLAccessList, ensureHolders, type AssociationEntry, type AssociationClub } from '../src/engine/cl-access'
import { simulateLeagueTableDetailed, type LeagueFormat } from '../src/engine/cl-league-sim'
import { playEveryCup, europaAndConferenceEntrants, simulateEurope, type EuropeAim } from '../src/engine/europe-path'
import { EURO_HOLDERS, type EuroComp } from '../src/data/uefa-coefficients'
import { buildCLTeams, drawCLLeaguePhase, simulateCLKnockoutsOnly, type CLTeam } from '../src/engine/cl-sim'
import { simulateMatch, setMatchTilt } from '../src/engine/match'
import { resolveDifficulty } from '../src/engine/difficulty'
import { EUROPE } from '../src/data/europe'
import { TARGET_MULTIPLIER } from '../supabase/functions/_shared/score'

const COMPS: EuroComp[] = ['ucl', 'uel', 'uecl']
const db = new Database(process.env.POM_DB ?? path.join(__dirname, '../assets/db/players_v5.db'), { readonly: true })
const rows = db.prepare(`SELECT c.id AS club_id, c.name AS club_name, cs.historical_ovr, l.tier AS assoc_rank, l.name AS league_name, l.country AS league_country, l.format AS league_format
  FROM club_seasons cs JOIN clubs c ON c.id = cs.club_id JOIN leagues l ON l.id = c.league_id
  WHERE l.id LIKE 'cucl_%' ORDER BY l.tier ASC, cs.league_position ASC`).all() as any[]
const byRank = new Map<number, AssociationEntry>()
for (const r of rows) {
  const e = byRank.get(r.assoc_rank) ?? { rank: r.assoc_rank, name: r.league_name, country: r.league_country, format: (r.league_format ?? 'double_round_robin') as LeagueFormat, clubs: [] }
  e.clubs.push({ clubId: r.club_id, clubName: r.club_name, ovr: r.historical_ovr })
  byRank.set(r.assoc_rank, e)
}
const assocs = [...byRank.values()].sort((a, b) => a.rank - b.rank)
const named = (n: string): AssociationClub | null => { for (const a of assocs) { const c = a.clubs.find(x => x.clubName === n); if (c) return c } return null }
const held = { ucl: named(EURO_HOLDERS.ucl), uel: named(EURO_HOLDERS.uel), uecl: named(EURO_HOLDERS.uecl) }
const allClubs = assocs.flatMap(a => a.clubs.map(c => ({ a, c })))
const pct = (n: number, of: number) => `${(n / of * 100).toFixed(1)}%`
console.log(`${assocs.length} associations, ${allClubs.length} clubs; median club OVR ${allClubs.map(x => x.c.ovr).sort((a, b) => a - b)[Math.floor(allClubs.length / 2)]}`)

/** A league phase and its knockouts, plainly; true if `player` lifts it. */
function playPhase(field: { clubId: string; clubName: string; ovr: number }[], comp: EuroComp, player: string, teamOvr: number): boolean {
  const c = EUROPE[comp]
  const teams: CLTeam[] = buildCLTeams(field.map(t => ({ clubId: t.clubId, clubName: t.clubName, ovr: t.clubId === player ? teamOvr : t.ovr, isPlayer: t.clubId === player })), undefined, c.pots)
  for (const f of drawCLLeaguePhase(teams, () => undefined, { pots: c.pots, perPot: c.perPot }).fixtures) {
    const h = teams.find(t => t.clubId === f.home.clubId)!, a = teams.find(t => t.clubId === f.away.clubId)!
    const r = simulateMatch(h, a)
    h.stats.goalsFor += r.homeGoals; h.stats.goalsAgainst += r.awayGoals; a.stats.goalsFor += r.awayGoals; a.stats.goalsAgainst += r.homeGoals
    if (r.outcome === 'home') h.stats.points += 3; else if (r.outcome === 'away') a.stats.points += 3; else { h.stats.points++; a.stats.points++ }
  }
  const sorted = [...teams].sort((x, y) => y.stats.points - x.stats.points || (y.stats.goalsFor - y.stats.goalsAgainst) - (x.stats.goalsFor - x.stats.goalsAgainst))
  return simulateCLKnockoutsOnly(sorted).winner.clubId === player
}

/** One whole season for a club drawn from `band`; where it ended, and whether it won. */
function season(teamOvr: number, band: (rank: number) => boolean, seed: number, target: EuroComp | null) {
  const pool = allClubs.filter(x => band(x.a.rank))
  const pick = pool[Math.floor(Math.random() * pool.length)]
  const player = pick.c.clubId
  const simulated = assocs.map(x => {
    const clubs = x.clubs.map(c => ({ ...c, ovr: c.clubId === player ? teamOvr : c.ovr }))
    const { standings } = simulateLeagueTableDetailed(clubs, x.format)
    return { ...x, clubs: standings.map(t => ({ clubId: t.clubId, clubName: t.clubName, ovr: t.ovr })) }
  })
  const ucl = ensureHolders(buildCLAccessList(simulated), [held.ucl, held.uel].filter((h): h is AssociationClub => !!h))
  const cups = playEveryCup(simulated, player, seed)
  const euro = europaAndConferenceEntrants(ucl, simulated, cups, held.uecl)
  const mine = simulated.find(x => x.rank === pick.a.rank)!
  const pos = mine.clubs.findIndex(c => c.clubId === player) + 1
  const aim: EuropeAim | null = target ? {
    target, champion: pos === 1,
    club: { clubId: player, clubName: pick.c.clubName, ovr: teamOvr, associationRank: pick.a.rank, associationName: pick.a.name, associationCountry: pick.a.country, position: pos, entryRound: 'q1', entryPath: 'league' },
  } : null
  const q = simulateEurope(ucl, euro, cups, [], player, aim)
  const comp = q.europe!.competition
  if (!comp) return { end: 'none' as const, won: false }
  if (!q.europe!.fields[comp].some(t => t.clubId === player)) return { end: `out in ${comp} qualifying`, won: false }
  return { end: comp, won: playPhase(q.europe!.fields[comp], comp, player, teamOvr) }
}

const RUNS = Number(process.env.RUNS ?? 150)
const PART = process.env.PART ?? 'all'
const OVRS = [74, 80, 86, 92]

if (PART === 'all' || PART === 'end') {
  // §1.2: where a season ends (uniform draw), and how often it ends in a trophy.
  for (const diff of ['medium', 'hard'] as const) for (const ovr of OVRS) {
    setMatchTilt(resolveDifficulty(diff, null).tilt)
    const end = new Map<string, number>(); const won: Record<string, number> = { ucl: 0, uel: 0, uecl: 0 }
    for (let i = 0; i < RUNS; i++) { const s = season(ovr, () => true, i + 1, null); end.set(s.end, (end.get(s.end) ?? 0) + 1); if (s.won) won[s.end]++ }
    console.log(`END · OVR ${ovr} · ${diff} · ${RUNS}: ${[...end.entries()].map(([k, v]) => `${k} ${pct(v, RUNS)}`).join(' · ')} | trophies ${COMPS.map(c => `${c} ${pct(won[c], RUNS)}`).join(' · ')}`)
  }
}

if (PART === 'all' || PART === 'win') {
  // §1.3: once in a league phase, from a random slot of a real field.
  setMatchTilt(0)
  const fields: Record<EuroComp, { clubId: string; clubName: string; ovr: number }[][]> = { ucl: [], uel: [], uecl: [] }
  for (let i = 0; i < 12; i++) {
    const simulated = assocs.map(x => { const { standings } = simulateLeagueTableDetailed(x.clubs, x.format); return { ...x, clubs: standings.map(t => ({ clubId: t.clubId, clubName: t.clubName, ovr: t.ovr })) } })
    const ucl = ensureHolders(buildCLAccessList(simulated), [held.ucl, held.uel].filter((h): h is AssociationClub => !!h))
    const cups = playEveryCup(simulated, null, i + 7)
    const q = simulateEurope(ucl, europaAndConferenceEntrants(ucl, simulated, cups, held.uecl), cups, [])
    for (const c of COMPS) fields[c].push(q.europe!.fields[c].map(t => ({ clubId: t.clubId, clubName: t.clubName, ovr: t.ovr })))
  }
  for (const c of COMPS) {
    const ovrs = fields[c].flat().map(t => t.ovr).sort((a, b) => a - b)
    console.log(`FIELD ${c}: median OVR ${ovrs[Math.floor(ovrs.length / 2)]}, top ${ovrs[ovrs.length - 1]}, bottom ${ovrs[0]}`)
  }
  for (const diff of ['medium', 'hard'] as const) for (const ovr of OVRS) {
    setMatchTilt(resolveDifficulty(diff, null).tilt)
    const line = COMPS.map(c => {
      let won = 0
      for (let i = 0; i < RUNS; i++) {
        const f = fields[c][i % fields[c].length]
        if (playPhase(f, c, f[Math.floor(Math.random() * f.length)].clubId, ovr)) won++
      }
      return `${c} ${pct(won, RUNS)}`
    })
    console.log(`WIN in the league phase · OVR ${ovr} · ${diff} · ${RUNS} each: ${line.join(' · ')}`)
  }
}

if (PART === 'all' || PART === 'hunt') {
  // P8.5-21: hunting. Per run, the chance of lifting the target, beside the
  // chance of lifting it without aiming; the multiplier should sit near the
  // ratio's inverse once the difference is large (docs/europe/07 §3, E5).
  for (const ovr of [80, 86]) {
    setMatchTilt(resolveDifficulty('hard', null).tilt)
    const free: Record<string, number> = { ucl: 0, uel: 0, uecl: 0 }
    for (let i = 0; i < RUNS; i++) { const s = season(ovr, () => true, 5000 + i, null); if (s.won) free[s.end]++ }
    for (const t of COMPS) {
      let won = 0, inPhase = 0
      for (let i = 0; i < RUNS; i++) { const s = season(ovr, () => true, 9000 + i, t); if (s.end === t) inPhase++; if (s.won) won++ }
      console.log(`HUNT ${t} · OVR ${ovr} · hard · ${RUNS}: in its league phase ${pct(inPhase, RUNS)}, won ${pct(won, RUNS)} (unaimed ${pct(free[t], RUNS)}) · multiplier ${TARGET_MULTIPLIER[t]}`)
    }
  }
}
