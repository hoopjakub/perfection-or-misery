import { GameMode, PositionSlot } from '@/types/game'
import type { Difficulty } from '@/store/gameStore'

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
  secondaryPositions: string[],
  openSlots: PositionSlot[]
): boolean {
  const allPositions = [primaryPos, ...secondaryPositions]
  return openSlots.some(slot =>
    allPositions.includes(slot.primary) ||
    slot.accepts.some(p => allPositions.includes(p))
  )
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

export function getRerollLimit(difficulty: Difficulty | null, mode: GameMode | null): number {
  // Chaos and Cursed modes always have 0 rerolls regardless of difficulty
  if (mode === 'chaos' || mode === 'cursed') return 0

  // If no difficulty set, use mode-based defaults (legacy behavior)
  if (!difficulty) {
    if (mode === 'all_time' || mode === 'era') return 3
    return 1
  }

  // Difficulty-based rerolls for All Time, League, and Era modes
  switch (difficulty) {
    case 'easy': return 3
    case 'medium': return 1
    case 'hard': return 0
    default: return 1
  }
}

export function isRatingsHidden(difficulty: Difficulty | null, mode: GameMode | null): boolean {
  // Chaos and Cursed modes always hide ratings
  if (mode === 'chaos' || mode === 'cursed') return true

  // Hard difficulty hides ratings
  if (difficulty === 'hard') return true

  return false
}