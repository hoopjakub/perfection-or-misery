// Verifies the cup pundits' check (src/engine/cup-calls.ts) on generated
// Champions League and World Cup results:
//  - every side in the field gets exactly one row
//  - the reached round matches the bracket: the winner is champion, the final's
//    loser runner-up, each knockout loser out in that round, the rest earlier
//  - `diff` is exactly the number of rounds between the call and the finish
//  - rows are ordered by how far each side got, and are deterministic
// Run: npx tsx scripts/verify-cup-calls.ts

import { championsLeagueCalls, worldCupCalls } from '../src/engine/cup-calls'

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
}

if (failures === 0) console.log('✅ ALL CHECKS PASSED')
else console.log(`${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
