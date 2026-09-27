// P8-152: the game's seasons. Three months each, on the real football
// calendar: Summer 1 June – 31 August, Autumn 1 September – 30 November,
// Winter 1 December – end of February, Spring 1 March – 31 May. Each starts at
// midnight Slovak time, like the ranking week (src/lib/week.ts).
//
// Season 1 is Summer 2027, the likely public release. Everything before it is
// Season 0, the pre-release season, with no start date: every run already
// played belongs to it. A hundred seasons after it are defined ahead of time,
// with a name each, which covers 25 years.
//
// No database table: a season is a date range, and its board is the ranks
// board read between its dates, the way the weekly board reads from Monday.
// A finished season's board can't change (a run is stamped when it's saved),
// so a badge worked out from it now is the badge it will always be.
// ponytail: badges are computed on open (two small queries per season played);
// a season table with rank snapshots (P8-153) when the seasons or the players
// outgrow that.
import { bratislavaOffset } from '@/lib/week'

const HOUR = 3600_000

export type Quarter = 'summer' | 'autumn' | 'winter' | 'spring'

export type Season = {
  /** 0 is the pre-release season; 1 is Summer 2027. */
  n: number
  name: string
  quarter: Quarter | null
  /** First instant (null for Season 0: from the beginning). */
  start: Date | null
  /** First instant of the next season: the end, exclusive. */
  end: Date
}

// A hundred names, twenty-five for each quarter, in the order they're used:
// the first summer gets the first summer name.
const NAMES: Record<Quarter, string[]> = {
  summer: [
    'A summer of perfection', 'The long hot summer', 'Pre-season in the sun', 'A summer of misery', 'Tans and transfers',
    'The friendlies nobody watched', 'Sunburnt on the terraces', 'The window never shuts', 'Heatwave football', 'A summer of rumours',
    'Cones on the training pitch', 'Holiday form', 'Midsummer madness', 'The tour of somewhere far', 'Summer without a trophy',
    'Sprinklers at half-time', 'The medical went fine', 'Here we go', 'Summer of the free transfer', 'New shirts, same hopes',
    'A pitch like a carpet', 'The long wait for August', 'Fresh legs, old problems', 'A summer of second chances', 'One more summer',
  ],
  autumn: [
    'The autumn of misery', 'Leaves on the pitch', 'Early doors', 'Top of the table in October', 'Floodlights at five',
    'The international break', 'A cold wind off the stand', 'The first sacking', 'Autumn in the drop zone', 'Mud season',
    'Wet Tuesday nights', 'False dawn', 'The clocks go back', "The table doesn't lie yet", 'Rain at the away end',
    'Fog over the far post', 'A harvest of points', 'The autumn of the underdog', 'Bonfire of the favourites', 'The season finds its shape',
    'The long autumn', 'Leaves, mud and set pieces', 'The group of death', 'The scarves come out', 'The last autumn',
  ],
  winter: [
    'Frozen pitch', 'The festive fixtures', 'Boxing Day', 'The January sales', 'Snow on the centre circle',
    'The orange ball', 'Undersoil heating', 'A winter of misery', 'Deadline day', 'Gloves and snoods',
    'Two games in three days', 'The cold snap', 'Frost on the crossbar', 'Hot pies, cold feet', "The break that wasn't",
    'Postponed', 'The dark months', 'Christmas number one', 'Ice in the six-yard box', 'New year, new manager',
    'Winter of discontent', 'The long cold run', 'A cold, wet night', 'The frozen table', 'The last winter',
  ],
  spring: [
    'The run-in', 'Squeaky bum time', 'A spring of perfection', 'Cup final weather', 'The title race',
    'Last-day drama', 'The great escape', 'Spring cleaning', 'Blossom and bottle jobs', 'A spring of misery',
    'Mathematically possible', 'Six-pointers', 'The final push', "It's in our hands", 'Lap of honour',
    'Goal difference decides it', 'Open-top bus', 'The last home game', 'The clocks go forward', 'Silverware season',
    'Nerves in April', 'Dead rubbers', 'Added time', 'Spring of the long shots', 'The last spring',
  ],
}

const QUARTERS: Quarter[] = ['summer', 'autumn', 'winter', 'spring']
export const SEASON_COUNT = 100

/** Midnight Slovak time on a calendar day (month 0-based; overflow rolls on). */
function slovakMidnight(y: number, m: number, d: number): Date {
  const wall = Date.UTC(y, m, d)
  // The summer-time switch is at 01:00 UTC on a Sunday, never on the 1st of
  // a season's month, so the offset two hours before midnight is the one in force.
  return new Date(wall - bratislavaOffset(wall - 2 * HOUR) * HOUR)
}

/** Season n (n ≥ 1) starts 3·(n−1) months after 1 June 2027. */
const startOf = (n: number) => slovakMidnight(2027, 5 + 3 * (n - 1), 1)

export const SEASONS: Season[] = [
  { n: 0, name: 'Before the whistle', quarter: null, start: null, end: startOf(1) },
  ...Array.from({ length: SEASON_COUNT }, (_, i): Season => {
    const n = i + 1, quarter = QUARTERS[i % 4]
    return { n, name: NAMES[quarter][Math.floor(i / 4)], quarter, start: startOf(n), end: startOf(n + 1) }
  }),
]

/** The season an instant belongs to (the last one after the hundredth). */
export function seasonOf(at: number = Date.now()): Season {
  return SEASONS.find(s => at < s.end.getTime()) ?? SEASONS[SEASONS.length - 1]
}

/** The live season and every one before it, newest first (the pickers). */
export function seasonsSoFar(now: number = Date.now()): Season[] {
  return SEASONS.slice(0, seasonOf(now).n + 1).reverse()
}

export const isFinished = (s: Season, now: number = Date.now()) => now >= s.end.getTime()

const dmy = (d: Date) => {
  // The calendar date in Slovakia, read from the shifted UTC fields.
  const local = new Date(d.getTime() + bratislavaOffset(d.getTime()) * HOUR)
  return `${local.getUTCDate()}.${local.getUTCMonth() + 1}.${local.getUTCFullYear()}`
}

/** "1.6.2027 – 31.8.2027", as the maintainer's sketch has it; Season 0 is "Until 31.5.2027". */
export function seasonDates(s: Season): string {
  const last = dmy(new Date(s.end.getTime() - 12 * HOUR))   // the last day, not the next season's first
  return s.start ? `${dmy(s.start)} – ${last}` : `Until ${last}`
}

/** The board filter for a season: runs from its start, before its end. */
export function seasonWindow(s: Season): { since?: string; until: string } {
  return { ...(s.start ? { since: s.start.toISOString() } : {}), until: s.end.toISOString() }
}

// The prestige tiers by final place, best last. A place earns the smallest
// tier it fits under: 42nd is TOP 50, 1001st only the badge for taking part.
export const BADGE_TIERS = [1000, 500, 250, 100, 50, 30, 15, 10, 5, 3, 2, 1] as const
export type BadgeTier = typeof BADGE_TIERS[number]

export function badgeTier(place: number): BadgeTier | null {
  let tier: BadgeTier | null = null
  for (const t of BADGE_TIERS) if (place <= t) tier = t
  return tier
}
