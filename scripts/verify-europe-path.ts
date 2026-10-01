/**
 * P8-52: the full path through three competitions (src/engine/europe-path.ts),
 * on the real bundled database's 53 associations.
 *
 *   - every league phase comes out at 36 (or says how far off it is and why);
 *   - one club, one competition: nobody is in two league phases, or two ties
 *     of one round;
 *   - the places pass down: no competition takes a club already in another;
 *   - the drops happen: Champions League qualifying losers turn up in the
 *     Europa or Conference League, and nobody who lost goes on in the same one;
 *   - your season adds up for a club from every association: where you came in,
 *     where you went on, and that you're in exactly one league phase or out;
 *   - the Conference League's holders are in the Europa League.
 */
import Database from 'better-sqlite3'
import path from 'path'
import { buildCLAccessList, ensureHolders, type AssociationEntry, type AssociationClub } from '../src/engine/cl-access'
import { simulateLeagueTableDetailed, type LeagueFormat } from '../src/engine/cl-league-sim'
import { playEveryCup, europaAndConferenceEntrants, simulateEurope } from '../src/engine/europe-path'
import { EURO_HOLDERS, type EuroComp } from '../src/data/uefa-coefficients'
import { buildCLTeams, drawCLLeaguePhase } from '../src/engine/cl-sim'
import { fullPathTier } from '../src/engine/europe-path'
import { CUSTOM_CL_ROUND_SCORE, CL_ROUND_SCORE } from '../supabase/functions/_shared/score'
import { TIER_LABEL, verdictOf } from '../src/data/tiers'

let failures = 0
const check = (c: boolean, msg: string) => { if (!c) { failures++; if (failures < 40) console.log(`❌ ${msg}`) } }

const db = new Database(process.env.POM_DB ?? path.join(__dirname, '../assets/db/players_v5.db'), { readonly: true })
const rows = db.prepare(`SELECT c.id AS club_id, c.name AS club_name, cs.historical_ovr, cs.league_position, l.tier AS assoc_rank,
  l.name AS league_name, l.country AS league_country, l.format AS league_format
  FROM club_seasons cs JOIN clubs c ON c.id = cs.club_id JOIN leagues l ON l.id = c.league_id
  WHERE l.id LIKE 'cucl_%' ORDER BY l.tier ASC, cs.league_position ASC`).all() as any[]
const byRank = new Map<number, AssociationEntry>()
for (const r of rows) {
  const e = byRank.get(r.assoc_rank) ?? { rank: r.assoc_rank, name: r.league_name, country: r.league_country, format: (r.league_format ?? 'double_round_robin') as LeagueFormat, clubs: [] }
  e.clubs.push({ clubId: r.club_id, clubName: r.club_name, ovr: r.historical_ovr })
  byRank.set(r.assoc_rank, e)
}
const scraped = [...byRank.values()].sort((a, b) => a.rank - b.rank)
const clubOf = (name: string): AssociationClub | null => {
  for (const a of scraped) { const c = a.clubs.find(x => x.clubName === name); if (c) return c }
  return null
}
const holders = [clubOf(EURO_HOLDERS.ucl), clubOf(EURO_HOLDERS.uel)].filter((x): x is AssociationClub => !!x)
const ueclHolder = clubOf(EURO_HOLDERS.uecl)
console.log(`${scraped.length} associations · holders found: ${[...holders, ueclHolder].filter(Boolean).map(h => h!.clubName).join(', ')}`)
check(holders.length === 2 && !!ueclHolder, 'a holder is missing from the database')

const sizes: Record<EuroComp, number[]> = { ucl: [], uel: [], uecl: [] }
const routes = new Map<string, number>()
let runs = 0
for (const a of scraped) for (let s = 0; s < 6; s++) {
  // A player club from this association (champion to bottom across the seeds).
  const player = a.clubs[Math.min(a.clubs.length - 1, s * 2)]
  const simulated = scraped.map(x => {
    const { standings } = simulateLeagueTableDetailed(x.clubs, x.format)
    return { ...x, clubs: standings.map(t => ({ clubId: t.clubId, clubName: t.clubName, ovr: t.ovr })) }
  })
  const ucl = ensureHolders(buildCLAccessList(simulated), holders)
  const cups = playEveryCup(simulated, player.clubId, 1000 + runs)
  const euro = europaAndConferenceEntrants(ucl, simulated, cups, ueclHolder)
  const hs = [
    ...holders.map((h, i) => ({ comp: (i === 0 ? 'ucl' : 'uel') as EuroComp, clubId: h.clubId, clubName: h.clubName })),
    ...(ueclHolder ? [{ comp: 'uecl' as EuroComp, clubId: ueclHolder.clubId, clubName: ueclHolder.clubName }] : []),
  ]
  const q = simulateEurope(ucl, euro, cups, hs, player.clubId)
  const ex = q.europe!
  runs++
  check(cups.length === scraped.length, `${a.name}: ${cups.length} cups for ${scraped.length} associations`)

  // One club, one competition.
  const uclIds = new Set([...ucl.leaguePhaseDirect, ...ucl.qualifying].map(e => e.clubId))
  check(euro.every(e => !uclIds.has(e.clubId)), 'a Champions League entrant took a Europa or Conference League place too')
  check(new Set(euro.map(e => e.clubId)).size === euro.length, 'a club has two Europa/Conference places')
  const inFields = (['ucl', 'uel', 'uecl'] as EuroComp[]).flatMap(c => ex.fields[c].map(t => t.clubId))
  check(new Set(inFields).size === inFields.length, 'a club is in two league phases')
  for (const c of ['ucl', 'uel', 'uecl'] as EuroComp[]) sizes[c].push(ex.fields[c].length)

  // A round never has a club twice; a loser never plays on in that competition.
  const seen = new Map<string, Set<string>>()
  for (const t of q.ties) {
    const k = `${t.comp}:${t.round}`
    const s2 = seen.get(k) ?? new Set<string>()
    for (const id of [t.teamA.clubId, t.teamB?.clubId].filter(Boolean) as string[]) { check(!s2.has(id), `${k}: ${id} plays twice`); s2.add(id) }
    seen.set(k, s2)
  }
  const out = new Map<string, EuroComp>()
  for (const t of q.ties) {
    for (const id of [t.teamA.clubId, t.teamB?.clubId].filter(Boolean) as string[]) {
      check(out.get(id) !== t.comp, `${id} played on in the ${t.comp} after losing in it`)
    }
    if (t.teamB) out.set(t.winnerId === t.teamA.clubId ? t.teamB.clubId : t.teamA.clubId, t.comp!)
  }
  // The drops: somebody who lost in the Champions League qualifying plays in another competition.
  const uclLosers = q.ties.filter(t => t.comp === 'ucl' && t.teamB).map(t => (t.winnerId === t.teamA.clubId ? t.teamB!.clubId : t.teamA.clubId))
  const lower = new Set([...q.ties.filter(t => t.comp !== 'ucl').flatMap(t => [t.teamA.clubId, t.teamB?.clubId]), ...ex.fields.uel.map(t => t.clubId), ...ex.fields.uecl.map(t => t.clubId)])
  check(uclLosers.every(id => lower.has(id)), 'a Champions League qualifying loser vanished instead of dropping')
  // The Conference League's holders play in the Europa League (or higher, on merit).
  if (ueclHolder) check(ex.holders.find(h => h.comp === 'uecl')?.playsIn !== 'uecl', 'the Conference League holders are defending it')

  // Your season adds up.
  const fieldsWithYou = (['ucl', 'uel', 'uecl'] as EuroComp[]).filter(c => ex.fields[c].some(t => t.clubId === player.clubId))
  check(fieldsWithYou.length <= 1, 'you are in two league phases')
  if (fieldsWithYou.length) check(ex.competition === fieldsWithYou[0] && q.leaguePhaseField.some(t => t.isPlayer), 'your competition is not the league phase you are in')
  if (!ex.entry) check(ex.competition === null && q.playerPath.length === 0, 'no entry, yet a European season')
  else if (!fieldsWithYou.length) check(ex.competition === 'uecl' && q.playerPath[q.playerPath.length - 1]?.eliminated === true, `out, but not in the Conference League's qualifying (${ex.competition})`)
  // Each league phase draws under the full rules in its own shape (six pots of
  // one for the Conference League), with every club's country.
  if (s === 0 && a.rank % 9 === 1) {
    const countryOf = new Map(simulated.flatMap(x => x.clubs.map(c => [c.clubId, x.country] as [string, string | undefined])))
    for (const [c, pots, perPot] of [['ucl', 4, 2], ['uel', 4, 2], ['uecl', 6, 1]] as const) {
      const teams = buildCLTeams(ex.fields[c].map(t => ({ clubId: t.clubId, clubName: t.clubName, ovr: t.ovr, isPlayer: t.isPlayer })), t => countryOf.get(t.clubId), pots)
      const draw = drawCLLeaguePhase(teams, t => countryOf.get(t.clubId), { pots, perPot })
      check(draw.relaxed !== 'fixed', `${c}: the league phase fell back to the fixed pairing`)
      check(Math.max(...draw.fixtures.map(f => f.matchday)) === pots * perPot, `${c}: ${Math.max(...draw.fixtures.map(f => f.matchday))} matchdays`)
    }
  }
  const route = ex.entry ? `${ex.entry.comp}:${ex.entry.round} → ${fieldsWithYou[0] ?? 'out'}` : 'nothing'
  routes.set(route, (routes.get(route) ?? 0) + 1)
}

// Every tier the full path can give has a score, a name and the right end.
for (const c of ['ucl', 'uel', 'uecl'] as EuroComp[]) {
  for (const r of [...Object.keys(CL_ROUND_SCORE), ...(c === 'uecl' ? ['q1_exit', 'q2_exit', 'q3_exit', 'quali_playoff_exit'] : [])]) {
    const t = fullPathTier({ playerFinalRound: r, competition: c })
    check(t in CUSTOM_CL_ROUND_SCORE, `${t} has no score`)
    check(!!TIER_LABEL[t], `${t} has no name`)
    if (r === 'winner') check(verdictOf(t) === 'perfection', `${t} isn't a trophy`)
  }
}
check(fullPathTier({ playerFinalRound: 'not_qualified' }) === 'not_qualified', 'not qualifying got a prefix')
check(CUSTOM_CL_ROUND_SCORE.uecl_quali_playoff_exit < CUSTOM_CL_ROUND_SCORE.uecl_league_exit && CUSTOM_CL_ROUND_SCORE.uecl_q1_exit > CUSTOM_CL_ROUND_SCORE.not_qualified, 'the Conference League qualifying exits are out of order')

const range = (xs: number[]) => `${Math.min(...xs)}–${Math.max(...xs)}`
console.log(`${runs} seasons · league phases: UCL ${range(sizes.ucl)}, UEL ${range(sizes.uel)}, UECL ${range(sizes.uecl)}`)
console.log('your routes:', [...routes.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ×${n}`).join(' · '))
for (const c of ['ucl', 'uel', 'uecl'] as EuroComp[]) check(sizes[c].every(n => n === 36), `the ${c} league phase isn't 36 every time (${range(sizes[c])})`)
console.log(`${failures} failed`)
if (failures === 0) console.log('✅ ALL CHECKS PASSED')
process.exit(failures === 0 ? 0 : 1)
