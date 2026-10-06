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
// ── One strength scale (Wave G audit G-L3, phase two step 2) ────────────────
// A club's strength used to come from scripts/lib/open-rating.ts: the average
// of its best 14 players, stretched ×1.55 around 81 and clamped to 60–94. Your
// XI is rated by calcTeamOvr above, a position-weighted average of eleven. The
// two numbers met in the same match formula, so a drafted XI and the club it
// was drafted from could differ by −6 to +4 for the same players (measured 3
// October 2026, docs/audit-2026-10/02 §8), about ten points of win chance.
// Now a club is rated exactly like your XI: its best eleven in a 4-3-3, through
// calcTeamOvr. Decision D-1: no stretch. build-db.ts writes this into
// club_seasons.historical_ovr, so every club in every mode reads it.
const STRENGTH_FORMATION: Position[] = ['LW', 'ST', 'RW', 'CM', 'CM', 'CM', 'LB', 'CB', 'CB', 'RB', 'GK']
// Fill the keeper first and the wide and central roles before the forwards:
// a greedy pick takes the best player for each slot in turn, so the scarce
// slots choose first.
const FILL_ORDER = [10, 7, 8, 9, 6, 3, 4, 5, 0, 2, 1]

export function clubStrength(players: { ovr: number; primaryPosition: string }[]): number {
  if (players.length === 0) return 70
  const pool = [...players].sort((a, b) => b.ovr - a.ovr)
  const fit = (i: number, s: number) => {
    const pen = positionPenalty(pool[i].primaryPosition, STRENGTH_FORMATION[s])
    // A player who can't play the slot only fills it when nobody else can.
    return pen === null ? pool[i].ovr - 106 : pool[i].ovr - pen
  }
  const w = (s: number) => POSITION_WEIGHTS[STRENGTH_FORMATION[s]]
  // at[s] = the pool index playing slot s (−1 while empty).
  const at: number[] = STRENGTH_FORMATION.map(() => -1)
  const used = new Set<number>()
  for (const s of FILL_ORDER) {
    let best = -1
    for (let i = 0; i < pool.length; i++) if (!used.has(i) && (best < 0 || fit(i, s) > fit(best, s))) best = i
    if (best < 0) break
    at[s] = best; used.add(best)
  }
  // The greedy pick alone underrated 22 of 1,678 club-seasons by 2 (an early
  // slot took the player a later one needed). Then improve by swaps: two
  // slots trade players, or a slot takes someone from the bench, whenever the
  // weighted total rises. ponytail: a local optimum, not a proven one;
  // verify-strength.ts compares it with 60 random greedy orders per club.
  for (let improved = true; improved;) {
    improved = false
    for (let a = 0; a < at.length; a++) {
      if (at[a] < 0) continue
      for (let b = a + 1; b < at.length; b++) {
        if (at[b] < 0) continue
        const gain = (fit(at[b], a) - fit(at[a], a)) * w(a) + (fit(at[a], b) - fit(at[b], b)) * w(b)
        if (gain > 0) { [at[a], at[b]] = [at[b], at[a]]; improved = true }
      }
      for (let i = 0; i < pool.length; i++) {
        if (used.has(i) || fit(i, a) <= fit(at[a], a)) continue
        used.delete(at[a]); at[a] = i; used.add(i); improved = true
      }
    }
  }
  const slots = STRENGTH_FORMATION.map((p, i) => ({ slotIndex: i, primary: p }) as PositionSlot)
  const xi = at.flatMap((i, s) => i < 0 ? [] : [{ ...pool[i], slotIndex: s } as unknown as DraftedPlayer])
  return calcTeamOvr(xi, slots)
}
