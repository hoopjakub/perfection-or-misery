import { GameMode, PositionSlot } from '@/types/game'
import { positionPenalty } from './rating'

export type ClubSeasonRow = {
  id: string
  /** The club behind this season (the same club across every season it played).
   *  Optional here because the draft only needs it to show a crest (P8-12). */
  club_id?: string
  club_name: string
  short_name: string
  year_start: number
  year_end: number
  historical_ovr: number
  league_id: string
  games_per_season: number
  primary_color: string
  // UEFA association coefficient rank (cucl_% leagues only) — see
  // db/queries/seasons.ts. Drives the weighted-picks top-leagues filter.
  assoc_rank?: number | null
}

/**
 * One of each footballer per run (P8-30: "two Oyarzabals up top"). Different
 * seasons of a club are different spins, and the same footballer is also stored
 * more than once in the players table (the full-path pool keeps its own
 * `…_cucl` copies, and some names have up to four rows), so neither the
 * season row nor the player id identifies a person. Name plus birth year does;
 * nationality stands in when the year is unknown.
 */
export function footballerKey(name: string, birthYear?: number | null, nationality?: string | null): string {
  const n = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  return `${n}|${birthYear ?? (nationality ?? '').toLowerCase()}`
}

export function isPlayerAvailable(
  primaryPos: string,
  _secondaryPositions: string[],   // unused: fit is now derived from the primary
  openSlots: PositionSlot[]
): boolean {
  return openSlots.some(slot => positionPenalty(primaryPos, slot.primary) !== null)
}

// Weighted picks (Big Fixes §4): in CL (full) only, restrict the spin pool to
// clubs from the top UEFA-coefficient leagues (`assoc_rank` ≤ 6 — tuned down
// from the original top-10, stamped via `leagues.tier`, see
// db/queries/seasons.ts). The caller resolves whether weighted picks is
// effectively on (difficulty default, overridden by the custom-path toggle)
// — this just applies the pool restriction.
export function spinClubSeason(
  pool: ClubSeasonRow[],
  alreadySpun: string[],
  mode: GameMode,
  weightedPicks = false,
): ClubSeasonRow {
  let eligible = pool.filter(cs => !alreadySpun.includes(cs.id))

  if (mode === 'champions_league_custom' && weightedPicks) {
    eligible = eligible.filter(cs => (cs.assoc_rank ?? Infinity) <= 6)
  }

  if (eligible.length === 0) throw new Error('POOL_EXHAUSTED')

  const totalWeight = eligible.reduce((s, cs) => s + cs.historical_ovr, 0)
  let pick = Math.random() * totalWeight
  for (const cs of eligible) {
    pick -= cs.historical_ovr
    if (pick <= 0) return cs
  }
  return eligible[eligible.length - 1]
}

// Reroll allowance and hidden ratings moved to engine/difficulty.ts
// (`rerollLimitFor` / `ratingsHiddenFor`) so every difficulty knob — including
// the new custom rerolls/ratings — lives in one place.