// P8-85: the ranking week starts Monday 00:00 Slovak time, summer time included.
// npx tsx scripts/verify-week.ts
import { weekStart, bratislavaOffset } from '../src/lib/week'
import { placeOn } from '../src/lib/ladder'

let failures = 0
function check(cond: boolean, msg: string) { if (!cond) { failures++; console.log('❌', msg) } }
const iso = (d: Date) => d.toISOString()

// Summer time 2026: 29 March 01:00 UTC to 25 October 01:00 UTC.
check(bratislavaOffset(Date.UTC(2026, 2, 29, 0, 59)) === 1, 'before the March switch is UTC+1')
check(bratislavaOffset(Date.UTC(2026, 2, 29, 1, 0)) === 2, 'at the March switch is UTC+2')
check(bratislavaOffset(Date.UTC(2026, 9, 25, 0, 59)) === 2, 'before the October switch is UTC+2')
check(bratislavaOffset(Date.UTC(2026, 9, 25, 1, 0)) === 1, 'at the October switch is UTC+1')

// Thursday 24 September 2026, summer time: the week began Monday 21 Sept 00:00 CEST = 20 Sept 22:00 UTC.
check(iso(weekStart(Date.UTC(2026, 8, 24, 12))) === '2026-09-20T22:00:00.000Z', 'a summer Thursday')
// Sunday 23:59 local belongs to the old week; Monday 00:01 local to the new one.
check(iso(weekStart(Date.UTC(2026, 8, 27, 21, 59))) === '2026-09-20T22:00:00.000Z', 'Sunday 23:59 counts for the old week')
check(iso(weekStart(Date.UTC(2026, 8, 27, 22, 1))) === '2026-09-27T22:00:00.000Z', 'Monday 00:01 starts the new week')
// Winter: Wednesday 2 December 2026, the week began Monday 30 Nov 00:00 CET = 29 Nov 23:00 UTC.
check(iso(weekStart(Date.UTC(2026, 11, 2, 9))) === '2026-11-29T23:00:00.000Z', 'a winter Wednesday')
// The week after the October switch: Monday 26 Oct 00:00 CET = 25 Oct 23:00 UTC.
check(iso(weekStart(Date.UTC(2026, 9, 27, 12))) === '2026-10-25T23:00:00.000Z', 'the week after summer time ends')
// The week the switch happens in (on its Sunday) started in summer time.
check(iso(weekStart(Date.UTC(2026, 9, 25, 12))) === '2026-10-18T22:00:00.000Z', 'the switch Sunday is still the summer week')
// Every instant over two years falls inside [start, start + 7 days) and start is a Monday 00:00 local.
for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2028, 0, 1); t += 3600_000 * 7) {
  const s = weekStart(t).getTime()
  check(s <= t && t - s < 7 * 86400_000 + 3600_000, `instant ${new Date(t).toISOString()} inside its week`)
  const local = new Date(s + bratislavaOffset(s) * 3600_000)
  check(local.getUTCDay() === 1 && local.getUTCHours() === 0 && local.getUTCMinutes() === 0, `week start ${new Date(s).toISOString()} is Monday 00:00 local`)
}

// P8-99: a run's place on a ladder of scores, best first: 1 + how many scored more.
const ladder = [900, 800, 800, 700, 500]
check(placeOn(ladder, 950) === 1, 'above everyone: 1st')
check(placeOn(ladder, 800) === 2, 'level with two: shares 2nd')
check(placeOn(ladder, 750) === 4, 'between: 4th')
check(placeOn(ladder, 100) === 6, 'below a short ladder: last + 1')
const full = Array.from({ length: 1000 }, (_, i) => 5000 - i)
check(placeOn(full, 1) === null, 'below a full ladder: outside it')
check(placeOn(full, 5000) === 1 && placeOn(full, 4001) === 1000, 'inside a full ladder: exact')

console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} failures`)
process.exit(failures === 0 ? 0 : 1)
