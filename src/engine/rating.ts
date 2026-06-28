import { Position, DraftedPlayer, PositionSlot } from '@/types/game'

const POSITION_WEIGHTS: Record<Position, number> = {
  GK:  1.20,
  CB:  1.00,
  LB:  0.90,
  RB:  0.90,
  CDM: 1.00,
  CM:  1.05,
  CAM: 1.05,
  LW:  1.00,
  RW:  1.00,
  ST:  1.10,
}

// ── Position fitness ─────────────────────────────────────────────────────────
// Out-of-position penalties are FLAT and small: 0 within a natural family /
// mirror side / adjacent role, and at most -2 OVR for a real stretch. Secondary
// positions are DERIVED from the primary (most scraped players have none stored).

// Normalise data-only positions onto the 10 game positions.
const NORM: Record<string, Position> = {
  LM: 'LW', RM: 'RW', CF: 'ST', LWB: 'LB', RWB: 'RB', SW: 'CB',
}
const norm = (p: string): Position => (NORM[p] ?? p) as Position

// 0-penalty neighbours: same role, mirror side (LB↔RB, LW↔RW), or adjacent
// central role (CDM↔CM↔CAM).
const NATURAL: Record<Position, Position[]> = {
  GK:  ['GK'],
  CB:  ['CB'],
  LB:  ['LB', 'RB'],
  RB:  ['RB', 'LB'],
  CDM: ['CDM', 'CM'],
  CM:  ['CM', 'CDM', 'CAM'],
  CAM: ['CAM', 'CM'],
  LW:  ['LW', 'RW'],
  RW:  ['RW', 'LW'],
  ST:  ['ST'],
}

// -2-penalty stretches: playable but clearly out of position (e.g. CAM→RW).
const STRETCH: Record<Position, Position[]> = {
  GK:  [],
  CB:  ['LB', 'RB', 'CDM'],
  LB:  ['LW', 'CB', 'CM'],
  RB:  ['RW', 'CB', 'CM'],
  CDM: ['CB', 'CAM'],
  CM:  ['ST', 'LW', 'RW', 'LB', 'RB'],
  CAM: ['LW', 'RW', 'ST'],
  LW:  ['CAM', 'ST', 'LB', 'CM'],
  RW:  ['CAM', 'ST', 'RB', 'CM'],
  ST:  ['CAM', 'LW', 'RW'],
}

const OUT_OF_POSITION_PENALTY = 2

// OVR penalty for playing `playerPos` in a `slotPos` slot.
// Returns null when the player simply can't play there (e.g. GK ↔ outfield).
export function positionPenalty(playerPos: string, slotPos: string): number | null {
  const p = norm(playerPos), s = norm(slotPos)
  if (NATURAL[p]?.includes(s)) return 0
  if (STRETCH[p]?.includes(s)) return OUT_OF_POSITION_PENALTY
  return null
}

export function canPlaySlot(playerPos: string, slot: PositionSlot): boolean {
  return positionPenalty(playerPos, slot.primary) !== null
}

// Positions a player can also fill at no penalty — derived from the primary.
export function derivedSecondaryPositions(primaryPos: string): Position[] {
  const p = norm(primaryPos)
  return (NATURAL[p] ?? []).filter(x => x !== p)
}

export function effectiveOvr(player: DraftedPlayer, slot: PositionSlot): number {
  const pen = positionPenalty(player.primaryPosition, slot.primary)
  // Unplayable fits shouldn't occur in a valid lineup; fall back to a hard -6.
  return Math.max(40, player.ovr - (pen ?? 6))
}

export function calcTeamOvr(
  players: DraftedPlayer[],
  slots: PositionSlot[]
): number {
  let weightedSum = 0, totalWeight = 0

  players.forEach((player) => {
    const slot = slots[player.slotIndex]
    const eff  = effectiveOvr(player, slot)
    const w    = POSITION_WEIGHTS[slot.primary] ?? 1.0
    weightedSum += eff * w
    totalWeight += w
  })

  return Math.round(weightedSum / totalWeight)
}

export function calcChemistry(players: DraftedPlayer[]): {
  bonusOvr: number
  bonuses: { label: string; bonus: number }[]
} {
  const bonuses: { label: string; bonus: number }[] = []
  let total = 0

  // club links
  const clubCounts = new Map<string, number>()
  players.forEach(p => {
    const key = `${p.clubName}-${p.season}`
    clubCounts.set(key, (clubCounts.get(key) ?? 0) + 1)
  })
  clubCounts.forEach((count, key) => {
    if (count >= 2) {
      const pairs = Math.min(count - 1, 4)
      const bonus = pairs * 1.5
      bonuses.push({ label: `${key.split('-')[0]} link ×${count}`, bonus })
      total += bonus
    }
  })

  // nationality
  const natCounts = new Map<string, number>()
  players.forEach(p => natCounts.set(p.nationality, (natCounts.get(p.nationality) ?? 0) + 1))
  natCounts.forEach((count, nat) => {
    if (count >= 3) {
      bonuses.push({ label: `${nat} core`, bonus: 2 })
      total += 2
    }
  })

  // era cohesion
  const decades = new Set(players.map(p => {
    const year = parseInt(p.season.split('/')[0])
    return Math.floor(year / 10)
  }))
  if (decades.size === 1) {
    bonuses.push({ label: 'Era cohesion', bonus: 2 })
    total += 2
  }

  return { bonusOvr: Math.round(total), bonuses }
}