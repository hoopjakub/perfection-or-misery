import { STADIUMS, type Stadium } from './stadiums'

// P8-93: where a match was played.
//  - A club match is at the home club's ground (scripts/scrape-stadiums.ts,
//    each club's CURRENT ground, so an older season can show a club's newer
//    stadium).
//  - A Champions League final is at that edition's final venue.
//  - The 2026 World Cup is at its sixteen stadiums. The knockout venues are
//    the real plan (the final at MetLife, the semi-finals in Dallas and
//    Atlanta, third place in Miami); a group plays around one region, as the
//    real groups do, but which group plays where is the game's own, since the
//    draw in the game isn't the real draw.

export type Venue = { name: string; city: string; country: string; capacity?: number; /** World Cup grounds only */ id?: string }
export type WCVenue = Venue & { id: string; lat: number; lon: number; hosts: string[] }

export const WC_VENUES: WCVenue[] = [
  { id: 'metlife',  name: 'MetLife Stadium',         city: 'New York New Jersey',  country: 'USA',    capacity: 82500, lat: 40.81, lon: -74.07,  hosts: ['Group', 'Round of 32', 'Round of 16', 'Final'] },
  { id: 'azteca',   name: 'Estadio Azteca',          city: 'Mexico City',          country: 'Mexico', capacity: 83264, lat: 19.30, lon: -99.15,  hosts: ['Opening match', 'Group', 'Round of 32', 'Round of 16'] },
  { id: 'att',      name: 'AT&T Stadium',            city: 'Dallas',               country: 'USA',    capacity: 80000, lat: 32.75, lon: -97.09,  hosts: ['Group', 'Round of 32', 'Round of 16', 'Semi-final'] },
  { id: 'arrowhead',name: 'Arrowhead Stadium',       city: 'Kansas City',          country: 'USA',    capacity: 76416, lat: 39.05, lon: -94.48,  hosts: ['Group', 'Round of 32', 'Quarter-final'] },
  { id: 'nrg',      name: 'NRG Stadium',             city: 'Houston',              country: 'USA',    capacity: 72220, lat: 29.68, lon: -95.41,  hosts: ['Group', 'Round of 32', 'Round of 16'] },
  { id: 'mbs',      name: 'Mercedes-Benz Stadium',   city: 'Atlanta',              country: 'USA',    capacity: 71000, lat: 33.76, lon: -84.40,  hosts: ['Group', 'Round of 32', 'Round of 16', 'Semi-final'] },
  { id: 'sofi',     name: 'SoFi Stadium',            city: 'Los Angeles',          country: 'USA',    capacity: 70240, lat: 33.95, lon: -118.34, hosts: ['Group', 'Round of 32', 'Quarter-final'] },
  { id: 'lincoln',  name: 'Lincoln Financial Field', city: 'Philadelphia',         country: 'USA',    capacity: 69796, lat: 39.90, lon: -75.17,  hosts: ['Group', 'Round of 32', 'Round of 16'] },
  { id: 'lumen',    name: 'Lumen Field',             city: 'Seattle',              country: 'USA',    capacity: 68740, lat: 47.60, lon: -122.33, hosts: ['Group', 'Round of 32', 'Round of 16'] },
  { id: 'levis',    name: "Levi's Stadium",          city: 'San Francisco Bay Area', country: 'USA',  capacity: 68500, lat: 37.40, lon: -121.97, hosts: ['Group', 'Round of 32'] },
  { id: 'gillette', name: 'Gillette Stadium',        city: 'Boston',               country: 'USA',    capacity: 65878, lat: 42.09, lon: -71.26,  hosts: ['Group', 'Round of 32', 'Quarter-final'] },
  { id: 'hardrock', name: 'Hard Rock Stadium',       city: 'Miami',                country: 'USA',    capacity: 64767, lat: 25.96, lon: -80.24,  hosts: ['Group', 'Round of 32', 'Quarter-final', 'Third place'] },
  { id: 'bcplace',  name: 'BC Place',                city: 'Vancouver',            country: 'Canada', capacity: 54500, lat: 49.28, lon: -123.11, hosts: ['Group', 'Round of 32', 'Round of 16'] },
  { id: 'bbva',     name: 'Estadio BBVA',            city: 'Monterrey',            country: 'Mexico', capacity: 53500, lat: 25.67, lon: -100.24, hosts: ['Group', 'Round of 32'] },
  { id: 'akron',    name: 'Estadio Akron',           city: 'Guadalajara',          country: 'Mexico', capacity: 48071, lat: 20.68, lon: -103.46, hosts: ['Group'] },
  { id: 'bmo',      name: 'BMO Field',               city: 'Toronto',              country: 'Canada', capacity: 45736, lat: 43.63, lon: -79.42,  hosts: ['Group', 'Round of 32'] },
]
const WC = new Map(WC_VENUES.map(v => [v.id, v]))

// Each group plays around one region: three grounds, one per matchday.
const GROUP_VENUES: Record<string, [string, string, string]> = {
  A: ['azteca', 'akron', 'bbva'],     B: ['bmo', 'bcplace', 'lumen'],    C: ['gillette', 'metlife', 'lincoln'],
  D: ['sofi', 'levis', 'lumen'],      E: ['lincoln', 'metlife', 'bmo'],  F: ['att', 'nrg', 'arrowhead'],
  G: ['mbs', 'hardrock', 'nrg'],      H: ['hardrock', 'mbs', 'att'],     I: ['metlife', 'gillette', 'lincoln'],
  J: ['arrowhead', 'att', 'bbva'],    K: ['sofi', 'levis', 'akron'],     L: ['bcplace', 'lumen', 'levis'],
}
// The knockout grounds, in the real plan's rounds.
const KO_VENUES: Record<string, string[]> = {
  r32:   WC_VENUES.filter(v => v.hosts.includes('Round of 32')).map(v => v.id),
  r16:   WC_VENUES.filter(v => v.hosts.includes('Round of 16')).map(v => v.id),
  qf:    ['gillette', 'sofi', 'hardrock', 'arrowhead'],
  sf:    ['att', 'mbs'],
  third: ['hardrock'],
  final: ['metlife'],
}

// The Champions League final, by the season it ends (the edition's first year).
const CL_FINAL: Record<number, Venue> = {
  2024: { name: 'Allianz Arena', city: 'Munich', country: 'Germany', capacity: 66000 },
  2025: { name: 'Puskás Aréna', city: 'Budapest', country: 'Hungary', capacity: 67215 },
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
const fromStadium = (s: Stadium): Venue => ({ name: s.name, city: s.city ?? '', country: s.country ?? '', capacity: s.capacity })

/** Where a match was played, from what every view has: the round label, the
 *  season and the two sides. null when nothing is known (a club with no
 *  scraped ground, or a label the calendar doesn't know). */
export function venueFor(m: { label?: string | null; yearStart?: number | null; homeName: string; homeClubId?: string; awayClubId?: string }): Venue | null {
  const label = m.label ?? ''
  if ((m.yearStart ?? 0) >= 2026) {
    const group = label.match(/group\s+([A-L])/i)?.[1]?.toUpperCase()
    const md = Number(label.match(/(?:matchday|md)\s*(\d+)/i)?.[1] ?? 1)
    if (group) return WC.get(GROUP_VENUES[group][Math.min(2, Math.max(0, md - 1))]) ?? null
    const key = /3rd|third/i.test(label) ? 'third' : /round of 32/i.test(label) ? 'r32' : /round of 16/i.test(label) ? 'r16'
      : /quarter/i.test(label) ? 'qf' : /semi/i.test(label) ? 'sf' : /final/i.test(label) ? 'final' : null
    if (!key) return null
    const list = KO_VENUES[key]
    return WC.get(list[hash(`${m.homeClubId}|${m.awayClubId}`) % list.length]) ?? null
  }
  // A one-off Champions League final (not a semi or quarter-final).
  if (/^final$|· final$/i.test(label.trim()) && m.yearStart && CL_FINAL[m.yearStart]) return CL_FINAL[m.yearStart]
  const s = STADIUMS[m.homeName]
  return s ? fromStadium(s) : null
}
