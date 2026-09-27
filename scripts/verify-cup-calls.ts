// Verifies the cup pundits' check (src/engine/cup-calls.ts) on generated
// Champions League and World Cup results:
//  - every side in the field gets exactly one row
//  - the reached round matches the bracket: the winner is champion, the final's
//    loser runner-up, each knockout loser out in that round, the rest earlier
//  - `diff` is exactly the number of rounds between the call and the finish
//  - rows are ordered by how far each side got, and are deterministic
// Run: npx tsx scripts/verify-cup-calls.ts

import { championsLeagueCalls, worldCupCalls, worldCupTournament, championsLeagueTournament } from '../src/engine/cup-calls'
import { punditRatings, predictTable } from '../src/engine/predictions'

let failures = 0
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; if (failures <= 30) console.log(`❌ ${msg}`) }
}

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

for (let s = 1; s <= 400; s++) {
  // ── Champions League: 36 in the league phase ──
  const field = Array.from({ length: 36 }, (_, i) => ({ ...team(i), ovr: 90 - i * 0.5 + ((s * (i + 3)) % 5) }))
  const up = (i: number) => (s + i) % 5 === 0
  const po = round(Array.from({ length: 16 }, (_, i) => 8 + i), up)
  const r16 = round([...Array.from({ length: 8 }, (_, i) => i), ...po.winners].sort((a, b) => a - b), up)
  const qf = round(r16.winners, up)
  const sf = round(qf.winners, up)
  const fin = round(sf.winners, up)
  const winner = fin.winners[0]
  const cl = {
    leaguePhaseStandings: field.map(f => ({ ...f, stats: {} })) as any,
    playoffRound: po.matches, r16: r16.matches, qf: qf.matches, sf: sf.matches, final: fin.matches[0],
    winner: team(winner), playerTeam: team(7), playerFinalRound: 'r16_exit', playerPot: 1,
  } as any
  const rows = championsLeagueCalls(cl, field, s)
  check(rows.length === 36 && new Set(rows.map(r => r.clubId)).size === 36, `CL ${s}: ${rows.length} rows`)
  const by = new Map(rows.map(r => [r.clubId, r]))
  check(by.get(team(winner).clubId)!.reached.key === 'winner', `CL ${s}: the winner isn't champion`)
  const finalLoser = fin.matches[0].teamA.clubId === team(winner).clubId ? fin.matches[0].teamB.clubId : fin.matches[0].teamA.clubId
  check(by.get(finalLoser)!.reached.key === 'finalist', `CL ${s}: the final's loser isn't runner-up`)
  for (let i = 24; i < 36; i++) check(by.get(team(i).clubId)!.reached.key === 'league_exit', `CL ${s}: ${i + 1}th didn't go out in the league phase`)
  for (const r of rows) check(r.diff === r.tipped.step - r.reached.step, `CL ${s}: bad diff for ${r.clubName}`)
  check(rows.every((r, i) => i === 0 || rows[i - 1].reached.step <= r.reached.step), `CL ${s}: rows not ordered by finish`)
  check(JSON.stringify(rows) === JSON.stringify(championsLeagueCalls(cl, [...field].reverse(), s)), `CL ${s}: not deterministic`)

  // ── World Cup: 48, 32 through ──
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
  const wrows = worldCupCalls(wc, wcField, s)
  check(wrows.length === 48, `WC ${s}: ${wrows.length} rows`)
  const wby = new Map(wrows.map(r => [r.clubId, r]))
  check(wby.get(team(wfin.winners[0]).clubId)!.reached.key === 'winner', `WC ${s}: the winner isn't champion`)
  for (let i = 32; i < 48; i++) check(wby.get(team(i).clubId)!.reached.key === 'groups', `WC ${s}: a side outside the 32 wasn't out in the groups`)
  for (const r of wrows) check(r.diff === r.tipped.step - r.reached.step, `WC ${s}: bad diff`)

  // ── P8-56: the whole tournament, as the pundits saw it ──
  // Twelve real groups of four (in their finishing order), the real bracket.
  const wcGroups = Array.from({ length: 12 }, (_, g) => ({ id: String.fromCharCode(65 + g), teams: wcField.slice(g * 4, g * 4 + 4) }))
  const wt = worldCupTournament({ ...wc, groups: wcGroups }, wcField, s)
  const ratings = punditRatings(wcField, s)
  check(wt.groups.length === 12 && wt.groups.every(g => g.rows.length === 4), `WC ${s}: the groups aren't all there`)
  for (const g of wt.groups) {
    check(g.rows.map(r => r.predicted).join() === '1,2,3,4' && [...g.rows.map(r => r.actual)].sort().join() === '1,2,3,4', `WC ${s}: group ${g.id} places broken`)
    check(g.rows.every((r, i) => i === 0 || ratings.get(g.rows[i - 1].clubId)! >= ratings.get(r.clubId)!), `WC ${s}: group ${g.id} not in the pundits' order`)
    check(g.rows.every(r => r.points >= 0 && r.points <= 9), `WC ${s}: group ${g.id} impossible points`)
  }
  check(wt.ties.length === 31, `WC ${s}: ${wt.ties.length} ties (want 31 without the third-place match)`)
  for (const t of wt.ties) {
    check(t.pick === t.a.clubId || t.pick === t.b.clubId, `WC ${s}: a pick that isn't in the tie`)
    check(ratings.get(t.pick)! >= ratings.get(t.pick === t.a.clubId ? t.b.clubId : t.a.clubId)!, `WC ${s}: they backed the side they rated lower`)
    check(t.right === (t.pick === t.winner), `WC ${s}: right/wrong mislabelled`)
  }
  check(wt.right === wt.ties.filter(t => t.right).length, `WC ${s}: the count of right calls is off`)
  const topRated = [...wcField].sort((a, b) => ratings.get(b.clubId)! - ratings.get(a.clubId)!)[0]
  check(wt.champion?.clubId === topRated.clubId, `WC ${s}: the champion pick isn't their top-rated side`)
  // The pre-season table and the tournament are the same belief.
  check(predictTable(wcField, s).table[0].clubId === wt.champion?.clubId, `WC ${s}: the table's favourite isn't the tournament's champion pick`)
  const ct = championsLeagueTournament(cl, field, s)
  check(ct.ties.length === 8 + 8 + 4 + 2 + 1, `CL ${s}: ${ct.ties.length} ties`)
  check(JSON.stringify(ct) === JSON.stringify(championsLeagueTournament(cl, [...field].reverse(), s)), `CL ${s}: tournament calls not deterministic`)
}

if (failures === 0) console.log('✅ ALL CHECKS PASSED')
else console.log(`${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
