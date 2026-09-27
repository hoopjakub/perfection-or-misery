// P8-92: the calendar is real-shaped, ordered and deterministic.
// npx tsx scripts/verify-schedule.ts
import { kickoffFor, leagueRoundDates } from '../src/engine/schedule'
import { venueFor, WC_VENUES } from '../src/data/venues'

let failures = 0
function check(cond: boolean, msg: string) { if (!cond) { failures++; if (failures < 25) console.log('❌', msg) } }
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)

// ── League seasons ──
for (const y of [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]) {
  for (const n of [30, 34, 38]) {
    const d = leagueRoundDates(y, n)
    check(d.length === n, `${y}/${n}: ${d.length} round dates`)
    for (let i = 1; i < d.length; i++) check(d[i] > d[i - 1], `${y}/${n}: round ${i + 1} after round ${i}`)
    check(iso(d[0]) >= `${y}-08-15` && iso(d[d.length - 1]) <= `${y + 1}-05-24`, `${y}/${n}: inside 15 Aug – 24 May`)
  }
  // Every kick-off of a round sits within that round's weekend (Fri–Mon) or midweek pair.
  const d = leagueRoundDates(y, 38)
  for (let md = 1; md <= 38; md++) for (let seed = 1; seed < 60; seed++) {
    const k = kickoffFor({ label: `Matchday ${md}`, yearStart: y, seed })!
    const t = Date.parse(k.date), start = d[md - 1]
    check(t >= start - 86400_000 && t <= start + 2 * 86400_000, `${y} MD${md}: ${k.date} near ${iso(start)}`)
    check(/^\d\d:\d\d$/.test(k.time), `${y} MD${md}: time ${k.time}`)
  }
}

// ── The Champions League ──
const lp = (y: number, md: number, seed = 7) => kickoffFor({ label: `League Phase · MD ${md}`, yearStart: y, seed })!.date
check(lp(2024, 1, 1) >= '2024-09-17' && lp(2024, 1, 1) <= '2024-09-19', `2024 MD1 ${lp(2024, 1, 1)}`)
check(lp(2024, 8) === '2025-01-29', `2024 MD8 on the last Wednesday of January: ${lp(2024, 8)}`)
for (const y of [2024, 2025]) for (let md = 2; md <= 8; md++) check(lp(y, md) > lp(y, md - 1), `${y} MD${md} after MD${md - 1}`)
const ko = (y: number, label: string, seed = 3) => kickoffFor({ label, yearStart: y, seed })!.date
for (const y of [2024, 2025]) {
  const order = ['Playoff · Leg 1', 'Playoff · Leg 2', 'Round of 16 · Leg 1', 'Round of 16 · Leg 2', 'Quarter-final · Leg 1', 'Quarter-final · Leg 2', 'Semi-final · Leg 1', 'Semi-final · Leg 2', 'Final']
  for (let i = 1; i < order.length; i++) check(ko(y, order[i]) > ko(y, order[i - 1]), `${y}: ${order[i]} after ${order[i - 1]}`)
  check(ko(y, order[0]) > lp(y, 8), `${y}: the knockouts after the league phase`)
}
check(ko(2024, 'Final') === '2025-05-31', `2024/25 final ${ko(2024, 'Final')}`)
check(ko(2025, 'Final') === '2026-05-30', `2025/26 final ${ko(2025, 'Final')}`)
const q = ['First Qualifying Round · Leg 1', 'Second Qualifying Round · Leg 1', 'Third Qualifying Round · Leg 1', 'Play-off Round · Leg 1', 'Play-off Round · Leg 2']
for (let i = 1; i < q.length; i++) check(ko(2025, q[i]) > ko(2025, q[i - 1]), `qualifying: ${q[i]} after ${q[i - 1]}`)
check(ko(2025, q[q.length - 1]) < lp(2025, 1), 'qualifying ends before the league phase')

// ── The World Cup ──
for (const g of 'ABCDEFGHIJKL') for (let md = 1; md <= 3; md++) {
  const k = kickoffFor({ label: `Group ${g} · MD ${md}`, yearStart: 2026, seed: 5 })!
  const [lo, hi] = md === 1 ? ['2026-06-11', '2026-06-17'] : md === 2 ? ['2026-06-18', '2026-06-23'] : ['2026-06-24', '2026-06-27']
  check(k.date >= lo && k.date <= hi, `Group ${g} MD${md}: ${k.date}`)
}
check(kickoffFor({ label: 'Final', yearStart: 2026, seed: 1 })!.date === '2026-07-19', 'World Cup final on 19 July')
check(kickoffFor({ label: '3rd-Place Playoff', yearStart: 2026, seed: 1 })!.date === '2026-07-18', 'third place on 18 July')
const wcOrder = ['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', '3rd-Place Playoff', 'Final']
for (let i = 1; i < wcOrder.length; i++) {
  for (let s = 0; s < 30; s++) check(kickoffFor({ label: wcOrder[i], yearStart: 2026, seed: s })!.date > kickoffFor({ label: wcOrder[i - 1], yearStart: 2026, seed: s + 99 })!.date, `WC ${wcOrder[i]} after ${wcOrder[i - 1]}`)
}

// ── Determinism, and the fallback for a fixture not played yet ──
for (let s = 0; s < 200; s++) {
  const a = kickoffFor({ label: `Matchday ${1 + (s % 38)}`, yearStart: 2023, seed: s })
  const b = kickoffFor({ label: `Matchday ${1 + (s % 38)}`, yearStart: 2023, seed: s })
  check(JSON.stringify(a) === JSON.stringify(b), `same seed, same kick-off (${s})`)
}
const f1 = kickoffFor({ label: 'Matchday 3', yearStart: 2024, homeClubId: 'a', awayClubId: 'b' })
check(!!f1 && JSON.stringify(f1) === JSON.stringify(kickoffFor({ label: 'Matchday 3', yearStart: 2024, seed: 999, homeClubId: 'a', awayClubId: 'b' })), 'the two sides decide it: a seed arriving later changes nothing')
check(kickoffFor({ label: 'Something else', yearStart: 2024, seed: 1 }) === null, 'an unknown label has no date')

// ── P8-93: where ──
const at = (label: string, yearStart: number, a = 'x', b = 'y', homeName = 'Nobody FC') => venueFor({ label, yearStart, homeName, homeClubId: a, awayClubId: b })
check(at('Final', 2026)?.name === 'MetLife Stadium', 'the World Cup final at MetLife')
check(at('3rd-Place Playoff', 2026)?.name === 'Hard Rock Stadium', 'third place in Miami')
for (let i = 0; i < 40; i++) check(['AT&T Stadium', 'Mercedes-Benz Stadium'].includes(at('Semi-final', 2026, `a${i}`, `b${i}`)?.name ?? ''), 'semi-finals in Dallas or Atlanta')
for (const g of 'ABCDEFGHIJKL') for (let md = 1; md <= 3; md++) check(!!at(`Group ${g} · MD ${md}`, 2026), `Group ${g} MD${md} has a ground`)
check(at('Group A · MD 1', 2026)?.country === 'Mexico', 'Group A plays in Mexico')
check(WC_VENUES.length === 16, 'sixteen World Cup grounds')
check(at('Final', 2024)?.name === 'Allianz Arena' && at('Final', 2025)?.name === 'Puskás Aréna', 'Champions League finals: Munich 2025, Budapest 2026')
check(at('Quarter-final · Leg 1', 2024) === null, 'a club with no ground on record: no venue, not a guess')

console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} failures`)
process.exit(failures === 0 ? 0 : 1)
