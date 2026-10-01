// Verifies the pundits' tournament for the cups (src/engine/cup-calls.ts, P8-165):
//  - their own draw: a World Cup group takes one side from each of their four
//    pots; a Champions League side meets two from each pot, eight in all
//  - their tables hold together (games, points, goal difference, order)
//  - their knockouts are built from their tables the game's way, and their
//    bracket holds together (every winner in the next round, in order; the
//    champion won their final)
//  - the same prediction before the run (the pundits screen) and after it (the
//    result screen), where RIGHT/WRONG and the score match what happened
//  - it leans heavily on the side they rate higher, but not always, and the
//    twelve pundits don't all play out the same tournament
//  - deterministic
// Run: npx tsx scripts/verify-cup-calls.ts

import { worldCupPunditTournament, championsLeaguePunditTournament, wcReached, potPairs, onePerPotPairs, LEAN, type PunditTournament } from '../src/engine/cup-calls'
import { punditRatings, punditPanel } from '../src/engine/predictions'

let failures = 0
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; if (failures <= 30) console.log(`❌ ${msg}`) }
}
let kos = 0, favWon = 0, panels = 0, splitPanels = 0

const team = (i: number) => ({ clubId: `c${String(i).padStart(2, '0')}`, clubName: `Club ${i}`, isPlayer: i === 7 })
// A knockout round between consecutive pairs; `upset` flips some results.
function round(ids: number[], upset: (i: number) => boolean) {
  const matches: any[] = [], winners: number[] = []
  for (let i = 0; i < ids.length; i += 2) {
    const a = ids[i], b = ids[i + 1]
    const w = upset(i) ? b : a
    matches.push({ teamA: team(a), teamB: team(b), winner: team(w) })
    winners.push(w)
  }
  return { matches, winners }
}
// Their pots: the field ranked by their ratings, in four equal slices.
const potOf = (field: { clubId: string; ovr: number }[], rating: Map<string, number>) => {
  const ranked = [...field].sort((a, b) => rating.get(b.clubId)! - rating.get(a.clubId)! || a.clubId.localeCompare(b.clubId))
  const size = Math.ceil(ranked.length / 4)
  return new Map(ranked.map((t, i) => [t.clubId, Math.floor(i / size)]))
}

for (let s = 1; s <= 400; s++) {
  const up = (i: number) => (s + i) % 5 === 0

  // ── World Cup: 48, their twelve groups, 32 through ──
  const wcField = Array.from({ length: 48 }, (_, i) => ({ ...team(i), ovr: 88 - i * 0.4 + ((s * (i + 5)) % 4) }))
  const r32 = round(Array.from({ length: 32 }, (_, i) => i), up)
  const wr16 = round(r32.winners, up), wqf = round(wr16.winners, up), wsf = round(wqf.winners, up), wfin = round(wsf.winners, up)
  const wc = {
    groups: [], r32Teams: [], winner: team(wfin.winners[0]), playerTeam: team(7), playerFinalRound: 'qf', playerGroup: 'A', playerGroupPos: 1,
    knockoutRounds: [
      { round: 'r32', matches: r32.matches }, { round: 'r16', matches: wr16.matches }, { round: 'qf', matches: wqf.matches },
      { round: 'sf', matches: wsf.matches }, { round: 'third', matches: [] }, { round: 'final', matches: wfin.matches },
    ],
  } as any
  const ratings = punditRatings(wcField, s)
  const wcPot = potOf(wcField, ratings)
  const before = worldCupPunditTournament(wcField, ratings, s)
  const wt = worldCupPunditTournament(wcField, ratings, s, wc)
  check(wt.tables.length === 12 && wt.tables.every(g => g.rows.length === 4), `WC ${s}: the groups aren't all there`)
  for (const g of wt.tables) {
    check([...g.rows.map(r => wcPot.get(r.clubId))].sort().join() === '0,1,2,3', `WC ${s}: group ${g.id} isn't one from each pot`)
    check(g.rows.map(r => r.place).join() === '1,2,3,4' && g.rows.every(r => r.played === 3), `WC ${s}: group ${g.id}: places or games broken`)
    const pts = g.rows.reduce((a, r) => a + r.points, 0)
    check(pts >= 12 && pts <= 18 && g.rows.every((r, k) => k === 0 || g.rows[k - 1].points >= r.points), `WC ${s}: group ${g.id}: impossible points or out of order`)
    check(g.rows.reduce((a, r) => a + r.gd, 0) === 0, `WC ${s}: group ${g.id}: goal difference doesn't balance`)
  }
  bracketChecks(wt, 'WC', s, [32, 16, 8, 4, 2])
  const their32 = new Set(wt.rounds[0].ties.flatMap(t => [t.a.clubId, t.b.clubId]))
  check(wt.tables.every(g => their32.has(g.rows[0].clubId) && their32.has(g.rows[1].clubId) && !their32.has(g.rows[3].clubId)), `WC ${s}: their round of 32 isn't built from their groups`)
  check(wt.tables.filter(g => their32.has(g.rows[2].clubId)).length === 8, `WC ${s}: not eight best thirds`)
  // The same prediction before and after; only the marks and the score differ.
  check(JSON.stringify({ ...before, rounds: before.rounds.map(r => ({ ...r, ties: r.ties.map(t => ({ ...t, real: null })) })) }) ===
        JSON.stringify({ ...wt, score: null, rounds: wt.rounds.map(r => ({ ...r, ties: r.ties.map(t => ({ ...t, real: null })) })) }),
        `WC ${s}: the pundits screen and the result screen show different tournaments`)
  check(before.score === null && before.rounds.every(r => r.ties.every(t => t.real === null)), `WC ${s}: a score before the run`)
  // Right or wrong: the side they sent through really got at least that far.
  const WC_STEP: Record<string, number> = { winner: 0, final: 1, sf: 2, qf: 3, r16: 4, r32: 5, groups: 6 }
  const NEXT_WC: Record<string, string> = { r32: 'r16', r16: 'qf', qf: 'sf', sf: 'final', final: 'winner' }
  const reachedWC = wcReached(wc)
  for (const r of wt.rounds) for (const t of r.ties) {
    const w = t.winner === 'a' ? t.a : t.b
    check(t.real === (WC_STEP[reachedWC.get(w.clubId) ?? 'groups'] <= WC_STEP[NEXT_WC[r.key]]), `WC ${s}: ${r.key} tie marked ${t.real ? 'right' : 'wrong'} for ${w.clubName}`)
  }
  const real32 = new Set(r32.matches.flatMap((m: any) => [m.teamA.clubId, m.teamB.clubId]))
  check(wt.score!.qualified === [...their32].filter(id => real32.has(id)).length && wt.score!.qualifiedOf === 32, `WC ${s}: the qualifiers' score is off`)
  check(wt.score!.champion === (wt.champion.clubId === wc.winner.clubId), `WC ${s}: the champion's call is mislabelled`)
  check(JSON.stringify(wt) === JSON.stringify(worldCupPunditTournament([...wcField].reverse(), ratings, s, wc)), `WC ${s}: their tournament depends on the field's order`)
  for (const r of wt.rounds) for (const t of r.ties) { kos++; if ((ratings.get(t.a.clubId)! >= ratings.get(t.b.clubId)!) === (t.winner === 'a')) favWon++ }

  // ── Champions League: 36, their league phase, the game's knockout shape ──
  const field = Array.from({ length: 36 }, (_, i) => ({ ...team(i), ovr: 90 - i * 0.5 + ((s * (i + 3)) % 5) }))
  const po = round(Array.from({ length: 16 }, (_, i) => 8 + i), up)
  const r16 = round([...Array.from({ length: 8 }, (_, i) => i), ...po.winners].sort((a, b) => a - b), up)
  const qf = round(r16.winners, up), sf = round(qf.winners, up), fin = round(sf.winners, up)
  const cl = {
    leaguePhaseStandings: field.map(f => ({ ...f, stats: {} })) as any,
    playoffRound: po.matches, r16: r16.matches, qf: qf.matches, sf: sf.matches, final: fin.matches[0],
    winner: team(fin.winners[0]), playerTeam: team(7), playerFinalRound: 'r16_exit', playerPot: 1,
  } as any
  const clRatings = punditRatings(field, s)
  const ct = championsLeaguePunditTournament(field, clRatings, s, cl)
  const rows = ct.tables[0]?.rows ?? []
  check(ct.tables.length === 1 && rows.length === 36 && rows.every(r => r.played === 8), `CL ${s}: the league phase isn't 36 sides of eight games`)
  check(rows.reduce((a, r) => a + r.gd, 0) === 0, `CL ${s}: goal difference doesn't balance`)
  bracketChecks(ct, 'CL', s, [16, 16, 8, 4, 2])
  const theirPO = new Set(ct.rounds[0].ties.flatMap(t => [t.a.clubId, t.b.clubId]))
  check(rows.slice(8, 24).every(r => theirPO.has(r.clubId)), `CL ${s}: their play-off isn't 9th to 24th of their table`)
  const their16 = new Set(ct.rounds[1].ties.flatMap(t => [t.a.clubId, t.b.clubId]))
  check(rows.slice(0, 8).every(r => their16.has(r.clubId)), `CL ${s}: their top eight aren't in their round of 16`)
  check(ct.score!.places === rows.filter((r, i) => r.clubId === field[i].clubId).length, `CL ${s}: the places' score is off`)
  const clBefore = championsLeaguePunditTournament(field, clRatings, s)
  check(JSON.stringify(clBefore.tables) === JSON.stringify(ct.tables) && clBefore.champion.clubId === ct.champion.clubId, `CL ${s}: before and after differ`)
  check(JSON.stringify(ct) === JSON.stringify(championsLeaguePunditTournament([...field].reverse(), clRatings, s, cl)), `CL ${s}: their tournament depends on the field's order`)

  // Twelve pundits, twelve tournaments: they don't all agree.
  if (s <= 60) {
    const panel = punditPanel(wcField, s)
    const champs = new Set(panel.map(p => worldCupPunditTournament(wcField, p.ratings, p.picksSeed).champion.clubId))
    if (champs.size > 1) splitPanels++
    panels++
  }
}

// Their league-phase draw: every side meets exactly two from each pot, eight
// different opponents, and plays as many at home as away.
{
  const p = [0, 1, 2, 3].map(k => Array.from({ length: 9 }, (_, i) => ({ clubId: `p${k}-${i}` })))
  const pairs = potPairs(p)
  const potOfId = (id: string) => Number(id[1])
  for (const t of p.flat()) {
    const games = pairs.filter(([h, a]) => h === t.clubId || a === t.clubId)
    const opps = games.map(([h, a]) => (h === t.clubId ? a : h))
    check(games.length === 8 && new Set(opps).size === 8, `CL draw: ${t.clubId} has ${games.length} games, ${new Set(opps).size} opponents`)
    check([0, 1, 2, 3].every(k => opps.filter(o => potOfId(o) === k).length === 2), `CL draw: ${t.clubId} doesn't meet two from every pot`)
    const home = games.filter(([h]) => h === t.clubId).length
    check(home >= 3 && home <= 5, `CL draw: ${t.clubId} is at home ${home} times of 8`)
  }
}

// P8-172: the Conference League's draw, six pots of six, one from each (own
// pot included): six different opponents, three or so at home.
{
  const p = [0, 1, 2, 3, 4, 5].map(k => Array.from({ length: 6 }, (_, i) => ({ clubId: `p${k}-${i}` })))
  const pairs = onePerPotPairs(p)
  const potOfId = (id: string) => Number(id[1])
  for (const t of p.flat()) {
    const games = pairs.filter(([h, a]) => h === t.clubId || a === t.clubId)
    const opps = games.map(([h, a]) => (h === t.clubId ? a : h))
    check(games.length === 6 && new Set(opps).size === 6, `UECL draw: ${t.clubId} has ${games.length} games, ${new Set(opps).size} opponents`)
    check([0, 1, 2, 3, 4, 5].every(k => opps.filter(o => potOfId(o) === k).length === 1), `UECL draw: ${t.clubId} doesn't meet one from every pot`)
    const home = games.filter(([h]) => h === t.clubId).length
    check(home >= 2 && home <= 4, `UECL draw: ${t.clubId} is at home ${home} times of 6`)
  }
}

// How their bracket holds together.
function bracketChecks(t: PunditTournament, label: string, s: number, sides: number[]) {
  check(t.rounds.length === sides.length, `${label} ${s}: ${t.rounds.length} rounds`)
  t.rounds.forEach((r, k) => {
    check(r.ties.length * 2 === sides[k], `${label} ${s}: ${r.key} has ${r.ties.length} ties`)
    check(r.ties.every(x => x.goalsA !== x.goalsB && (x.winner === 'a') === (x.goalsA > x.goalsB)), `${label} ${s}: a ${r.key} tie with no clear winner`)
    const next = t.rounds[k + 1]
    if (next && r.key !== 'playoff') {
      const nextIn = next.ties.flatMap(x => [x.a.clubId, x.b.clubId])
      const winners = r.ties.map(x => (x.winner === 'a' ? x.a : x.b).clubId)
      check(winners.join() === nextIn.join(), `${label} ${s}: ${r.key}'s winners aren't ${next.key}'s sides, in order`)
    }
  })
  const fin = t.rounds[t.rounds.length - 1].ties[0]
  check(!!fin && t.champion.clubId === (fin.winner === 'a' ? fin.a : fin.b).clubId, `${label} ${s}: the champion didn't win their final`)
  const ties = t.rounds.flatMap(r => r.ties)
  check(!t.score || (t.score.ties === ties.length && t.score.through === ties.filter(x => x.real).length), `${label} ${s}: the ties' score doesn't add up`)
}

// Heavy on purpose: the side they rate higher goes through most of the time,
// but not every time (a bracket of pure favourites reads as a list, not a
// prediction). LEAN itself: 55% between equals, never past 90%.
console.log(`Their knockouts: the side they rated higher won ${(favWon / kos * 100).toFixed(1)}% of ${kos} ties · panels that disagree on the champion: ${splitPanels}/${panels}`)
check(favWon / kos >= 0.65 && favWon / kos <= 0.9, `the favourites won ${(favWon / kos * 100).toFixed(1)}% of their ties`)
check(Math.abs(LEAN(0) - 0.55) < 1e-9 && LEAN(100) <= 0.9 && LEAN(6) > 0.75, 'LEAN is off its shape')
check(splitPanels >= panels * 0.5, `only ${splitPanels} of ${panels} panels disagree on the champion: twelve copies of one tournament`)

if (failures === 0) console.log('✅ ALL CHECKS PASSED')
else console.log(`${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
