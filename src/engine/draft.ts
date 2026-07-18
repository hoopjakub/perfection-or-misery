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
}

export function isPlayerAvailable(
  primaryPos: string,
  _secondaryPositions: string[],   // unused: fit is now derived from the primary
  openSlots: PositionSlot[]
): boolean {
  return openSlots.some(slot => positionPenalty(primaryPos, slot.primary) !== null)
}

export function spinClubSeason(
  pool: ClubSeasonRow[],
  alreadySpun: string[],
  mode: GameMode,
  eraFilter?: number
): ClubSeasonRow {
  let eligible = pool.filter(cs => !alreadySpun.includes(cs.id))

  if (mode === 'era' && eraFilter !== undefined) {
    eligible = eligible.filter(cs =>
      Math.floor(cs.year_start / 10) === Math.floor(eraFilter / 10)
    )
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