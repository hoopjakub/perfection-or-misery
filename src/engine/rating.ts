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

export function positionFitMultiplier(
  player: DraftedPlayer,
  slot: PositionSlot
): number {
  if (player.primaryPosition === slot.primary) return 1.0
  if (slot.accepts.includes(player.primaryPosition)) return 0.95
  if (player.secondaryPositions.some(p => p === slot.primary)) return 0.93
  return 0.82
}

export function effectiveOvr(player: DraftedPlayer, slot: PositionSlot): number {
  return Math.round(player.ovr * positionFitMultiplier(player, slot))
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