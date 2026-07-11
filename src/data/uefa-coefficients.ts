/**
 * UEFA association coefficients + Champions League access-list rules, as data.
 *
 * Single source of truth for the custom UCL path (docs "More Competitions &
 * Modes" §12 / §16). The ranking drives how many berths each association gets
 * and where each qualified club enters; `cl-access.ts` consumes this to turn our
 * real domestic final-tables into the tagged 81-team field.
 *
 * Ranking snapshot: 2026-06 men's association coefficient (the order that sets
 * the 2026/27 access list, decided by 2025/26 domestic finishes — i.e. our
 * `year_start = 2025` club-seasons). Re-verify when rebuilding a later edition.
 */

export type UefaAssociation = {
  rank: number
  name: string
  /** false = 0 UCL berths: Russia (suspended) & Liechtenstein (no domestic league). */
  active: boolean
}

// Rank → association. Bold-in-DB today: England, Italy, Spain, Germany, France.
export const UEFA_ASSOCIATIONS: UefaAssociation[] = [
  { rank: 1,  name: 'England',            active: true },
  { rank: 2,  name: 'Italy',              active: true },
  { rank: 3,  name: 'Spain',              active: true },
  { rank: 4,  name: 'Germany',            active: true },
  { rank: 5,  name: 'France',             active: true },
  { rank: 6,  name: 'Portugal',           active: true },
  { rank: 7,  name: 'Belgium',            active: true },
  { rank: 8,  name: 'Netherlands',        active: true },
  { rank: 9,  name: 'Turkey',             active: true },
  { rank: 10, name: 'Czechia',            active: true },
  { rank: 11, name: 'Poland',             active: true },
  { rank: 12, name: 'Greece',             active: true },
  { rank: 13, name: 'Denmark',            active: true },
  { rank: 14, name: 'Norway',             active: true },
  { rank: 15, name: 'Cyprus',             active: true },
  { rank: 16, name: 'Switzerland',        active: true },
  { rank: 17, name: 'Sweden',             active: true },
  { rank: 18, name: 'Hungary',            active: true },
  { rank: 19, name: 'Scotland',           active: true },
  { rank: 20, name: 'Austria',            active: true },
  { rank: 21, name: 'Ukraine',            active: true },
  { rank: 22, name: 'Romania',            active: true },
  { rank: 23, name: 'Croatia',            active: true },
  { rank: 24, name: 'Slovenia',           active: true },
  { rank: 25, name: 'Israel',             active: true },
  { rank: 26, name: 'Azerbaijan',         active: true },
  { rank: 27, name: 'Slovakia',           active: true },
  { rank: 28, name: 'Bulgaria',           active: true },
  { rank: 29, name: 'Russia',             active: false },  // suspended
  { rank: 30, name: 'Serbia',             active: true },
  { rank: 31, name: 'Iceland',            active: true },
  { rank: 32, name: 'Republic of Ireland',active: true },
  { rank: 33, name: 'Armenia',            active: true },
  { rank: 34, name: 'Bosnia and Herzegovina', active: true },
  { rank: 35, name: 'Kosovo',             active: true },
  { rank: 36, name: 'Kazakhstan',         active: true },
  { rank: 37, name: 'Finland',            active: true },
  { rank: 38, name: 'Latvia',             active: true },
  { rank: 39, name: 'Moldova',            active: true },
  { rank: 40, name: 'Liechtenstein',      active: false },  // no domestic league
  { rank: 41, name: 'Faroe Islands',      active: true },
  { rank: 42, name: 'North Macedonia',    active: true },
  { rank: 43, name: 'Malta',              active: true },
  { rank: 44, name: 'Albania',            active: true },
  { rank: 45, name: 'Belarus',            active: true },
  { rank: 46, name: 'Lithuania',          active: true },
  { rank: 47, name: 'Gibraltar',          active: true },
  { rank: 48, name: 'Montenegro',         active: true },
  { rank: 49, name: 'Northern Ireland',   active: true },
  { rank: 50, name: 'Luxembourg',         active: true },
  { rank: 51, name: 'Andorra',            active: true },
  { rank: 52, name: 'Georgia',            active: true },
  { rank: 53, name: 'Estonia',            active: true },
  { rank: 54, name: 'Wales',              active: true },
  { rank: 55, name: 'San Marino',         active: true },
]

/** Number of UCL berths an association gets, by coefficient rank (§12.2). */
export function berthsForRank(rank: number): number {
  const a = UEFA_ASSOCIATIONS[rank - 1]
  if (!a || !a.active) return 0
  if (rank <= 5)  return 4
  if (rank === 6) return 3
  if (rank <= 15) return 2
  return 1
}

// ── Access list rules (default 2026/27, pre-redistribution) ──────────────────
// Each rule pulls NEW entrant clubs by (association rank, finishing position)
// into an entry point. Winners *advancing between* rounds are handled by the
// qualifying sim (cl-qualifying.ts), not here. `position`: 1=champion, 2=RU,
// 3=third, 4=fourth, 5=fifth (EPS). See §12.3.

export type UclRound = 'league_phase' | 'playoff' | 'q3' | 'q2' | 'q1'
/** 'none' = enters the league phase directly (not via a path); else the ladder path. */
export type UclPath = 'none' | 'champions' | 'league'

export type AccessRule = {
  round: UclRound
  path: UclPath
  /** Association ranks this rule draws from (each contributes one club). */
  ranks: number[]
  /** Finishing position taken from each association's final table. */
  position: number
  note?: string
}

// 29 direct league-phase entrants (+7 from the play-off round = 36).
export const DIRECT_LEAGUE_PHASE: AccessRule[] = [
  { round: 'league_phase', path: 'none', ranks: r(1, 10), position: 1, note: 'champions, assoc 1–10' },
  { round: 'league_phase', path: 'none', ranks: r(1, 6),  position: 2, note: 'runners-up, assoc 1–6' },
  { round: 'league_phase', path: 'none', ranks: r(1, 5),  position: 3, note: 'third, assoc 1–5' },
  { round: 'league_phase', path: 'none', ranks: r(1, 4),  position: 4, note: 'fourth, assoc 1–4' },
  { round: 'league_phase', path: 'none', ranks: [23],     position: 1, note: 'assoc-23 champion (overflow)' },
  { round: 'league_phase', path: 'none', ranks: [7],      position: 2, note: 'assoc-7 runner-up (overflow)' },
  // European Performance Spots: 5th-placed of the two best 2025/26 performers.
  { round: 'league_phase', path: 'none', ranks: [1, 3],   position: 5, note: 'EPS (England & Spain, 2026/27)' },
]

// Qualifying entrants (new clubs entering each round; advancers wired by the sim).
export const QUALIFYING_ENTRANTS: AccessRule[] = [
  // Play-off round
  { round: 'playoff', path: 'champions', ranks: r(11, 14), position: 1, note: 'champions, assoc 11–14' },
  // Third qualifying round — League Path
  { round: 'q3', path: 'league', ranks: r(8, 9),   position: 2, note: 'runners-up, assoc 8–9' },
  { round: 'q3', path: 'league', ranks: [6],        position: 3, note: 'third, assoc 6' },
  { round: 'q3', path: 'league', ranks: [5],        position: 4, note: 'fourth, assoc 5' },
  { round: 'q3', path: 'league', ranks: r(11, 12), position: 2, note: 'best-2 runners-up, assoc 11–12' },
  // Second qualifying round
  { round: 'q2', path: 'champions', ranks: r(15, 22), position: 1, note: 'champions, assoc 15–22' },
  { round: 'q2', path: 'champions', ranks: r(27, 28), position: 1, note: 'best-2 champions, assoc 27–28' },
  { round: 'q2', path: 'league',    ranks: [10, 13, 14, 15], position: 2, note: 'runners-up, assoc 10 & 13–15' },
  // First qualifying round — Champions Path (assoc 24–25 and 29–55; inactive skipped)
  { round: 'q1', path: 'champions', ranks: [24, 25, ...r(29, 55)], position: 1, note: 'champions, assoc 24–25 & 29–55' },
]

/** Inclusive integer range [a..b]. */
function r(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i)
}

/**
 * What a finishing position in a given association's league earns (§12.3).
 * Returns null when that position gets nothing — i.e. NOT qualified for the UCL.
 * Drives the "position stakes" UI: placement reveal, league-table berth badges,
 * and the player's entry after their domestic season.
 */
export function berthForPosition(rank: number, position: number): { round: UclRound; path: UclPath } | null {
  const assoc = UEFA_ASSOCIATIONS[rank - 1]
  if (!assoc || !assoc.active) return null
  for (const rule of [...DIRECT_LEAGUE_PHASE, ...QUALIFYING_ENTRANTS]) {
    if (rule.position === position && rule.ranks.includes(rank)) {
      return { round: rule.round, path: rule.path }
    }
  }
  return null
}

/** All UCL-relevant positions for an association, best first (for stakes lists). */
export function berthMapForRank(rank: number): { position: number; round: UclRound; path: UclPath }[] {
  const out: { position: number; round: UclRound; path: UclPath }[] = []
  for (let pos = 1; pos <= 6; pos++) {
    const b = berthForPosition(rank, pos)
    if (b) out.push({ position: pos, ...b })
  }
  return out
}

/** How many winners advance FROM each round (the ladder shape, §12.3). */
export const ROUND_ADVANCERS = {
  q1_champions_to_q2: 14,
  q2_champions_to_q3: 12,
  q2_league_to_q3:    2,
  q3_champions_to_po: 6,
  q3_league_to_po:    4,
  po_champions_to_lp: 5,
  po_league_to_lp:    2,
} as const
