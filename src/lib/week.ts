// The ranking week (P8-85): Monday 00:00 to Sunday 23:59, Slovak time
// (Europe/Bratislava). A run at 23:59 on Sunday counts for the old week, one at
// 00:01 on Monday for the new one. Nothing is reset or deleted: the weekly
// board is the same `runs` table read from this instant on.
//
// The offset is worked out from the EU's summer-time rule rather than through
// Intl's time zones, whose support differs between Hermes builds: Central
// European Time is UTC+1, and summer time (UTC+2) runs from 01:00 UTC on the
// last Sunday of March to 01:00 UTC on the last Sunday of October.
const HOUR = 3600_000

function lastSundayUtc(year: number, month: number): number {
  const last = new Date(Date.UTC(year, month + 1, 0))   // the month's last day
  return Date.UTC(year, month, last.getUTCDate() - last.getUTCDay(), 1)   // 01:00 UTC
}

/** Slovakia's offset from UTC at an instant, in hours (1 or 2). */
export function bratislavaOffset(at: number): number {
  const y = new Date(at).getUTCFullYear()
  return at >= lastSundayUtc(y, 2) && at < lastSundayUtc(y, 9) ? 2 : 1
}

/** The instant this ranking week began: the last Monday 00:00, Slovak time. */
export function weekStart(now: number = Date.now()): Date {
  const local = new Date(now + bratislavaOffset(now) * HOUR)   // Slovak wall clock, read as UTC fields
  const daysSinceMonday = (local.getUTCDay() + 6) % 7
  const mondayWall = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysSinceMonday)
  // Monday midnight is a day after any Sunday switch, so the offset two hours
  // before it (Sunday 22:00 UTC) is the one in force at that midnight.
  return new Date(mondayWall - bratislavaOffset(mondayWall - 2 * HOUR) * HOUR)
}
