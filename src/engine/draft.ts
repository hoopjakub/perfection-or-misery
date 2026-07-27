import { GameMode, PositionSlot } from '@/types/game'
import { positionPenalty } from './rating'

export type ClubSeasonRow = {
  id: string
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