/**
 * The open-data OVR: PoM's own rating from FACTS, replacing the Transfermarkt
 * market-value model (docs/release/06-OUR-OWN-DATA.md §4.4–§4.5).
 *
 *   OVR = club level (league band + table position)
 *       + role (share of the league games he could have played)
 *       + production (goals per game against what his position usually scores)
 *       + age (the young and the old, corrected)
 *
 * WHY this shape: the maintainer's rule is that league strength must count, and
 * The Dugout's lesson is that the league sets the band and the rest places you
 * in it. A player's club and his minutes in it are the two facts every source
 * has; goals separate forwards who look alike on minutes; age is a correction,
 * not a driver. Nothing here is anybody's valuation.
 *
 * The SCALE is the game's balance currency (58–93, a Premier League side
 * averaging ~81): every mode's thresholds sit on it, so the band anchors below
 * were set by hand to land on the same scale. A handful of numbers, not a fit
 * to anyone's ratings.
 */

export type LeagueBand = { top: number; bottom: number } // club level of 1st and last

// The league's average PLAYER rating by UEFA association rank, as anchor points
// read off the game's current scale (30 Sept 2026): England ~81, the next four
// 77–78, a plateau around 69 for ranks ~10–30, San Marino ~62. Interpolated
// linearly between anchors. Hand-set, six points.
const MEAN_BY_RANK: [number, number][] = [[1, 81], [5, 77], [9, 72.5], [20, 69.5], [35, 66], [55, 62]]
// Club-level spread (1st minus last): wide in the big leagues, where the gap
// between the champion and the relegated is widest, narrower at the bottom.
const SPREAD_TOP = 8.5, SPREAD_BOTTOM = 5

function interp(points: [number, number][], x: number) {
  if (x <= points[0][0]) return points[0][1]
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x0, y0] = points[i - 1]
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
  }
  return points[points.length - 1][1]
}

// The club curve: level = bottom + spread · strength^CLUB_CURVE. Above 1, so the
// top of a table pulls away (Barcelona and Real Madrid clear of 5th-placed
// Villarreal). v1 used 0.8, which in La Liga 2024–25 left 3rd–5th within 1.5
// of the champion. 0.8, 1.3 and 1.6 all gave England 2018–19 the same 0.85
// correlation, so the shape is a design choice, not a fit.
const CLUB_CURVE = 1.3

/**
 * A league's band from its association rank. The player mean sits ~2 below the
 * average club level (most squad players aren't ever-presents, and the role
 * term is negative for them). The average club sits 1/(1 + CLUB_CURVE) of the
 * way up the band (the mean of strength^k over an evenly spaced table), which
 * places the bottom so the league's player mean lands on the anchor.
 */
export function bandForRank(rank: number): LeagueBand {
  const mean = interp(MEAN_BY_RANK, rank)
  const spread = SPREAD_TOP + ((SPREAD_BOTTOM - SPREAD_TOP) * (Math.min(55, Math.max(1, rank)) - 1)) / 54
  const bottom = mean + 2 - spread / (1 + CLUB_CURVE)
  return { top: bottom + spread, bottom }
}

export type DataLevel = 'full' | 'partial' | 'bare'

export type RatingInput = {
  clubPosition: number       // final (or current) league position, 1 = top
  clubs: number              // clubs in the league
  games: number              // league games he could have played (see open-squads: a January signing gets half)
  apps: number | null        // null = unknown
  goals: number | null
  position: string | null    // game code: GK, CB, LB, RB, CDM, CM, CAM, LM, RM, LW, RW, ST
  age: number | null         // age during the season (season start year − birth year)
  level: DataLevel
  seedName: string           // for the bare players' deterministic spread
}

export type RatingParts = { club: number; role: number; production: number; age: number; ovr: number }

// League goals per appearance a typical regular scores in each position. The
// production term compares against these, so a centre-back's 4 goals count for
// more than a striker's 4. Round numbers from general football knowledge.
const EXPECTED_GOALS_PER_APP: Record<string, number> = {
  GK: 0, CB: 0.05, LB: 0.04, RB: 0.04, CDM: 0.05, CM: 0.1, LM: 0.15, RM: 0.15,
  CAM: 0.2, LW: 0.25, RW: 0.25, ST: 0.4,
}

// How much the production term counts, by position (1 = a striker, judged
// fully on goals, as in v1; a centre-back barely).
const GOAL_WEIGHT: Record<string, number> = {
  GK: 0, CB: 0.25, LB: 0.3, RB: 0.3, CDM: 0.35, CM: 0.55, LM: 0.7, RM: 0.7, CAM: 0.8, LW: 0.85, RW: 0.85, ST: 1,
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

// A stable number in [-1, 1] from a name (FNV-1a), so the same bare player gets
// the same rating on every build, and the same squad doesn't come out flat.
function spread(name: string) {
  let h = 2166136261
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619) }
  return ((h >>> 0) / 0xffffffff) * 2 - 1
}

export function openOvrParts(input: RatingInput, band: LeagueBand): RatingParts {
  // Club level: first at the top of the band, last at the bottom, on the club
  // curve (see CLUB_CURVE).
  const strength = input.clubs > 1 ? 1 - (input.clubPosition - 1) / (input.clubs - 1) : 0.5
  const club = band.bottom + (band.top - band.bottom) * Math.pow(strength, CLUB_CURVE)

  // BARE players (a name, a position, a nationality; most of San Marino): the
  // maintainer's rule, 30 Sept: "they aren't probably the best players in their
  // squad, so we can assign numbers ourselves". The best players of a small club
  // are the ones someone wrote an article about. So a bare player sits below his
  // club's level, as a squad player would, with a small fixed spread so a
  // squad of them isn't identical.
  if (input.level === 'bare' || input.apps === null) {
    const role = -3 + 1.5 * spread(input.seedName)
    const ovr = Math.round(clamp(club + role, 58, 93))
    return { club, role, production: 0, age: 0, ovr }
  }

  // Role: a regular (~55% of the games he could play) sits at his club's level;
  // an ever-present ~+3.6 above it. Steeper below a regular: the first
  // calibration (v0) had one-game squad players at a top club at 78–81 (Luke
  // Amos, Will Norris) because a gentle slope let the club level carry them.
  const share = clamp(input.apps / Math.max(1, input.games), 0, 1)
  const role = share < 0.55 ? (share - 0.55) * 14 : (share - 0.55) * 8

  // Production: only with enough games for goals to mean something, never for
  // keepers, and capped so one hot season can't outrank a whole club level.
  // Weighted by how much goals say about the position: v1 weighted everyone
  // alike, and La Liga 2024–25 had centre-backs with three goals at 88–89
  // (Lenglet, Vivian) and a scoring right-back at 88 (Mingueza), because a
  // defender's small expected rate makes any goal a big ratio.
  let production = 0
  const pos = input.position ?? 'CM'
  const expected = EXPECTED_GOALS_PER_APP[pos] ?? 0.1
  if (input.goals !== null && input.apps >= 8 && expected > 0) {
    const w = GOAL_WEIGHT[pos] ?? 0.8
    production = clamp((input.goals / input.apps / expected - 1) * 1.5 * w, -1.5 * w, 2.5 * w)
  }

  // Age: young players are rarely a club's best yet; the mid-30s cost pace.
  // Nothing in 23–32, and nothing when the age is unknown. The youth penalty
  // shrinks with playing time: a 17-year-old ever-present is there on merit
  // (v1 put Lamine Yamal, 17, outside Barcelona's best because −5.4 applied
  // whatever he played).
  let age = 0
  if (input.age !== null) {
    if (input.age <= 22) age = -(23 - input.age) * 0.9 * (1 - 0.8 * share)
    else if (input.age >= 33) age = -(input.age - 32) * 0.8
  }

  const ovr = Math.round(clamp(club + role + production + age, 58, 93))
  return { club, role, production, age, ovr }
}

export const openOvr = (input: RatingInput, band: LeagueBand) => openOvrParts(input, band).ovr

// ── The rest of a player record, from the OVR (moved here from the deleted
// Transfermarkt library on 30 Sept 2026: PoM's own code, no outside data) ──

const clampAttr = (n: number, lo = 40, hi = 99) => Math.round(Math.min(hi, Math.max(lo, n)))

// Attribute spread per position, offsets from OVR.
type Attr = { attack: number; defense: number; physical: number; pace: number; technical: number }
export function attributes(pos: string, o: number): Attr {
  const A: Record<string, Attr> = {
    GK:  { attack: -45, defense:  0,  physical: -8,  pace: -28, technical: -14 },
    CB:  { attack: -28, defense:  4,  physical:  3,  pace: -10, technical: -12 },
    LB:  { attack: -8,  defense:  0,  physical: -6,  pace:  5,  technical: -6 },
    RB:  { attack: -8,  defense:  0,  physical: -6,  pace:  5,  technical: -6 },
    CDM: { attack: -12, defense:  3,  physical:  1,  pace: -9,  technical: -3 },
    CM:  { attack: -4,  defense: -5,  physical: -5,  pace: -5,  technical:  3 },
    CAM: { attack:  3,  defense: -20, physical: -11, pace: -1,  technical:  5 },
    LM:  { attack: -2,  defense: -15, physical: -9,  pace:  5,  technical:  1 },
    RM:  { attack: -2,  defense: -15, physical: -9,  pace:  5,  technical:  1 },
    LW:  { attack:  0,  defense: -46, physical: -14, pace:  8,  technical: -4 },
    RW:  { attack:  0,  defense: -46, physical: -14, pace:  8,  technical: -4 },
    ST:  { attack:  4,  defense: -40, physical: -2,  pace:  1,  technical: -6 },
  }
  const d = A[pos] ?? A.CM
  const paceFloor = pos === 'GK' ? 28 : 40
  return {
    attack:    clampAttr(o + d.attack),
    defense:   clampAttr(o + d.defense),
    physical:  clampAttr(o + d.physical),
    pace:      clampAttr(o + d.pace, paceFloor),
    technical: clampAttr(o + d.technical),
  }
}

/** A club-season's strength from its best 14, stretched around 81 (the game's historical_ovr). */
export function teamStrength(players: { ovr: number }[]): number {
  if (players.length === 0) return 70
  const top = [...players].sort((a, b) => b.ovr - a.ovr).slice(0, 14)
  const avg = top.reduce((s, p) => s + p.ovr, 0) / top.length
  const CENTER = 81, SPREAD = 1.55
  return Math.round(Math.max(60, Math.min(94, CENTER + (avg - CENTER) * SPREAD)))
}

// The same range as the old library's, so every id comes out as before.
export const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
   .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
