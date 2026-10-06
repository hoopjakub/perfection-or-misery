// P8-92: every match gets a date and a kick-off time, and rounds are spread
// over several days, the way real competitions are.
//
// The schedule is a pure function of what every match already stores: its
// round label ("Matchday 12", "League Phase · MD 3", "Group C · MD 2",
// "Quarter-final · Leg 1", "Final"…), its season (yearStart) and its seed.
// The same inputs give the same kick-off on the live screen, the match sheet,
// the run hub and a run saved months ago, so it agrees everywhere without a
// column of its own — the "attribute once" rule, reached by determinism
// instead of storage. Saved runs from before P8-92 get their dates too.
//
// The calendar follows each competition's real rhythm, not its exact dates:
//  - a league season: weekly from the Saturday on or after 15 August, the
//    international breaks left free, extra midweek rounds at Christmas when
//    there are more matchdays than weekends; a round spread Friday to Monday;
//  - the Champions League: the league phase on Tuesdays and Wednesdays in
//    September to January (the last matchday all on one Wednesday), the
//    knockouts February to May, the final on the last Saturday of May, and
//    the full path's qualifying rounds in July and August;
//  - the 2026 World Cup: the real window, 11 June to 19 July, groups over
//    three windows, then the rounds on their real days.
// Times are local to where the match is played.

import { LANGUAGE } from '@/i18n'

export type Kickoff = {
  /** 'YYYY-MM-DD' */
  date: string
  /** 'HH:MM', local */
  time: string
  /** "Sat 23 Aug 2025" */
  day: string
  /** "SAT 23 AUG · 15:00" — for tags */
  tag: string
  /** "SAT 23 AUG" — where the time would crowd a row */
  short: string
}

// P8.5-28: the day and month in the app's language ("Sat 23 Aug" / "So 23. aug").
const SK = LANGUAGE === 'sk'
const WEEKDAY = SK ? ['Ne', 'Po', 'Ut', 'St', 'Št', 'Pi', 'So'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH = SK
  ? ['jan', 'feb', 'mar', 'apr', 'máj', 'jún', 'júl', 'aug', 'sep', 'okt', 'nov', 'dec']
  : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "Sat 23 Aug" in English, "So 23. aug" in Slovak (a day number takes a dot). */
const dayMonth = (d: Date) => `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()}${SK ? '.' : ''} ${MONTH[d.getUTCMonth()]}`
const DAY = 86400_000

// All dates are calendar days held as UTC midnights, so no time zone moves them.
const utc = (y: number, m: number, d: number) => Date.UTC(y, m, d)
const dow = (t: number) => new Date(t).getUTCDay()
/** The first `weekday` on or after a date. */
const onOrAfter = (t: number, weekday: number) => t + ((weekday - dow(t) + 7) % 7) * DAY
/** The nth `weekday` of a month (n = 1…4), or the last one when n = -1. */
function nthWeekday(y: number, m: number, weekday: number, n: number): number {
  if (n > 0) return onOrAfter(utc(y, m, 1), weekday) + (n - 1) * 7 * DAY
  const last = utc(y, m + 1, 0)
  return last - ((dow(last) - weekday + 7) % 7) * DAY
}

// A stable pick from a seed (the match's own), so a match keeps its slot.
function pick<T>(seed: number, salt: number, items: T[]): T {
  let h = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return items[((h ^ (h >>> 16)) >>> 0) % items.length]   // >>> 0: an XOR can come out negative
}

function kickoff(t: number, time: string): Kickoff {
  const d = new Date(t)
  const day = `${dayMonth(d)} ${d.getUTCFullYear()}`
  return {
    date: d.toISOString().slice(0, 10),
    time,
    day,
    tag: `${dayMonth(d)} · ${time}`.toUpperCase(),
    short: dayMonth(d).toUpperCase(),
  }
}

// ── League seasons ───────────────────────────────────────────────────────────
/** The date each matchday's weekend (or midweek round) starts on. */
export function leagueRoundDates(yearStart: number, matchdays: number): number[] {
  const first = onOrAfter(utc(yearStart, 7, 15), 6)            // Saturday on/after 15 Aug
  const end = utc(yearStart + 1, 4, 24)                          // the season is done by 24 May
  // The international breaks: no league football those weekends.
  const breaks = new Set([
    onOrAfter(utc(yearStart, 8, 5), 6), onOrAfter(utc(yearStart, 9, 10), 6),
    onOrAfter(utc(yearStart, 10, 14), 6), onOrAfter(utc(yearStart + 1, 2, 21), 6),
  ])
  const weekends: number[] = []
  for (let t = first; t <= end; t += 7 * DAY) if (!breaks.has(t)) weekends.push(t)
  const dates = [...weekends]
  // More matchdays than weekends: midweek rounds over Christmas and New Year,
  // the way the English calendar does it.
  const midweek = [utc(yearStart, 11, 26), onOrAfter(utc(yearStart + 1, 0, 1), 2), onOrAfter(utc(yearStart, 11, 2), 2), onOrAfter(utc(yearStart + 1, 1, 3), 2)]
  for (let i = 0; dates.length < matchdays && i < midweek.length; i++) if (!dates.includes(midweek[i])) dates.push(midweek[i])
  dates.sort((a, b) => a - b)
  return dates.slice(0, matchdays)
}

function leagueKickoff(yearStart: number, matchday: number, matchdays: number, seed: number): Kickoff {
  const dates = leagueRoundDates(yearStart, Math.max(matchdays, matchday))
  const start = dates[Math.min(matchday, dates.length) - 1]
  if (dow(start) !== 6) {
    // A midweek round: the evening, across two nights.
    return kickoff(start + pick(seed, 1, [0, 0, 1]) * DAY, pick(seed, 2, ['19:30', '20:00', '20:15', '21:00']))
  }
  // A weekend round: mostly Saturday and Sunday, one on Friday, one on Monday.
  const offset = pick(seed, 1, [-1, 0, 0, 0, 0, 0, 1, 1, 1, 2])
  const times = offset === -1 || offset === 2 ? ['20:00', '20:45']
    : offset === 0 ? ['12:30', '13:30', '15:00', '15:30', '16:00', '17:30', '18:30', '20:00', '21:00']
    : ['13:00', '14:00', '15:00', '16:30', '17:30', '19:00', '20:45']
  return kickoff(start + offset * DAY, pick(seed, 2, times))
}

// ── The Champions League ─────────────────────────────────────────────────────
// yearStart is the season's first year (2024 for 2024/25).
function clLeaguePhase(y: number, md: number, seed: number): Kickoff {
  const TUE = 2, WED = 3
  const starts = [
    nthWeekday(y, 8, TUE, 3), nthWeekday(y, 9, TUE, 1), nthWeekday(y, 9, TUE, 4), nthWeekday(y, 10, TUE, 1),
    nthWeekday(y, 10, TUE, 4), nthWeekday(y, 11, TUE, 2), nthWeekday(y + 1, 0, TUE, 3), nthWeekday(y + 1, 0, WED, -1),
  ]
  const start = starts[Math.min(Math.max(md, 1), 8) - 1]
  if (md >= 8) return kickoff(start, '21:00')                      // the last matchday: all at once
  const days = md === 1 ? [0, 1, 2] : [0, 1]                       // the first is spread over three nights
  return kickoff(start + pick(seed, 1, days) * DAY, pick(seed, 2, ['18:45', '21:00', '21:00', '21:00']))
}

const CL_KO: Record<string, (y: number) => [number, number]> = {
  playoff: y => [nthWeekday(y + 1, 1, 2, 2), nthWeekday(y + 1, 1, 2, 3)],
  r16:     y => [nthWeekday(y + 1, 2, 2, 1), nthWeekday(y + 1, 2, 2, 2)],
  qf:      y => [nthWeekday(y + 1, 3, 2, 2), nthWeekday(y + 1, 3, 2, 3)],
  sf:      y => [nthWeekday(y + 1, 3, 2, -1), nthWeekday(y + 1, 4, 2, 1)],
}
const QUAL: Record<string, (y: number) => [number, number]> = {
  q1:      y => [nthWeekday(y, 6, 2, 2), nthWeekday(y, 6, 2, 3)],
  q2:      y => [nthWeekday(y, 6, 2, 4), nthWeekday(y, 7, 2, 1)],
  q3:      y => [nthWeekday(y, 7, 2, 2), nthWeekday(y, 7, 2, 3)],
  playoff: y => [nthWeekday(y, 7, 2, 4), nthWeekday(y, 7, 2, 4) + 7 * DAY],
}

// ── The 2026 World Cup (11 June to 19 July 2026) ─────────────────────────────
const WC_TIMES = ['12:00', '13:00', '15:00', '16:00', '18:00', '19:00', '20:00', '21:00']
function wcGroup(group: string, md: number, seed: number): Kickoff {
  const g = Math.max(0, group.toUpperCase().charCodeAt(0) - 65)       // A = 0 … L = 11
  const day = md <= 1 ? 11 + Math.floor((g * 7) / 12) : md === 2 ? 18 + Math.floor((g * 6) / 12) : 24 + Math.floor((g * 4) / 12)
  return kickoff(utc(2026, 5, day), pick(seed, 2, WC_TIMES))
}
const WC_KO: Record<string, [number, number, number]> = {       // [month, first day, days]
  r32: [5, 28, 6], r16: [6, 4, 4], qf: [6, 9, 3], sf: [6, 14, 2], third: [6, 18, 1], final: [6, 19, 1],
}

// ── Reading a round label ────────────────────────────────────────────────────
const KO_KEY: [RegExp, string][] = [
  [/3rd|third/i, 'third'], [/round of 32/i, 'r32'], [/round of 16|last 16/i, 'r16'], [/quarter/i, 'qf'],
  [/semi/i, 'sf'], [/^final$|· final$|^the final$/i, 'final'],
]
const QUAL_KEY: [RegExp, string][] = [
  [/first qualifying/i, 'q1'], [/second qualifying/i, 'q2'], [/third qualifying/i, 'q3'], [/play-off round/i, 'playoff'],
]

/** A match's date and kick-off, from its round label, its season and its seed.
 *  null when the label isn't one the calendar knows. */
export function kickoffFor(m: {
  label?: string | null
  yearStart?: number | null
  seed?: number | null
  /** The two sides. When given they decide the day and the time, not the
   *  seed: a fixture listed before it's played has no seed yet, and its kick-off
   *  must not change once it has one. */
  homeClubId?: string
  awayClubId?: string
  /** How many matchdays the league has (defaults to 38). */
  matchdays?: number
}): Kickoff | null {
  const label = (m.label ?? '').trim()
  const y = m.yearStart
  if (!label || !y) return null
  const seed = m.homeClubId && m.awayClubId ? hashIds(`${m.homeClubId}|${m.awayClubId}`) : (m.seed ?? 0)
  const leg = /leg 2/i.test(label) ? 1 : 0
  const md = Number(label.match(/(?:matchday|md)\s*(\d+)/i)?.[1] ?? NaN)

  // The World Cup is the only competition that starts in 2026.
  if (y >= 2026) {
    const group = label.match(/group\s+([A-L])/i)?.[1]
    if (group && md) return wcGroup(group, md, seed)
    const key = KO_KEY.find(([re]) => re.test(label))?.[1]
    if (!key || !WC_KO[key]) return null
    const [month, first, days] = WC_KO[key]
    return kickoff(utc(2026, month, first + pick(seed, 1, Array.from({ length: days }, (_, i) => i))), key === 'final' ? '15:00' : pick(seed, 2, WC_TIMES))
  }
  if (/league phase/i.test(label) && md) return clLeaguePhase(y, md, seed)
  const qual = QUAL_KEY.find(([re]) => re.test(label))?.[1]
  if (qual) return kickoff(QUAL[qual](y)[leg] + pick(seed, 1, [0, 1]) * DAY, pick(seed, 2, ['18:00', '19:00', '20:00', '20:45']))
  if (/^playoff\b/i.test(label)) return kickoff(CL_KO.playoff(y)[leg] + pick(seed, 1, [0, 1]) * DAY, '21:00')
  const ko = KO_KEY.find(([re]) => re.test(label))?.[1]
  if (ko === 'final') return kickoff(nthWeekday(y + 1, 4, 6, -1), '21:00')     // the last Saturday of May
  if (ko && CL_KO[ko]) return kickoff(CL_KO[ko](y)[leg] + pick(seed, 1, [0, 1]) * DAY, '21:00')
  if (md) return leagueKickoff(y, md, m.matchdays ?? 38, seed)
  return null
}

function hashIds(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
