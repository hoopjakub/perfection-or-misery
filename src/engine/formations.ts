import { Formation, PositionSlot } from '@/types/game'

type SlotTemplate = {
  label: string
  primary: string
  accepts: string[]
}

const FORMATIONS: Record<Formation, SlotTemplate[]> = {
  '4-3-3': [
    { label: 'GK',  primary: 'GK',  accepts: ['Who else would it even be?'] },
    { label: 'RB',  primary: 'RB',  accepts: ['CB'] },
    { label: 'CB',  primary: 'CB',  accepts: ['RB', 'LB', 'CDM'] },
    { label: 'CB',  primary: 'CB',  accepts: ['RB', 'LB', 'CDM'] },
    { label: 'LB',  primary: 'LB',  accepts: ['CB'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'RW',  primary: 'RW',  accepts: ['CAM', 'ST'] },
    { label: 'ST',  primary: 'ST',  accepts: ['CAM', 'LW', 'RW'] },
    { label: 'LW',  primary: 'LW',  accepts: ['CAM', 'ST'] },
  ],
  '4-4-2': [
    { label: 'GK',  primary: 'GK',  accepts: ['Who else would it even be?'] },
    { label: 'RB',  primary: 'RB',  accepts: ['CB'] },
    { label: 'CB',  primary: 'CB',  accepts: ['RB', 'LB', 'CDM'] },
    { label: 'CB',  primary: 'CB',  accepts: ['RB', 'LB', 'CDM'] },
    { label: 'LB',  primary: 'LB',  accepts: ['CB'] },
    { label: 'RM',  primary: 'RW',  accepts: ['CM', 'CAM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'LM',  primary: 'LW',  accepts: ['CM', 'CAM'] },
    { label: 'ST',  primary: 'ST',  accepts: ['LW', 'RW'] },
    { label: 'ST',  primary: 'ST',  accepts: ['LW', 'RW'] },
  ],
  '4-2-3-1': [
    { label: 'GK',  primary: 'GK',  accepts: ['Who else would it even be?'] },
    { label: 'RB',  primary: 'RB',  accepts: ['CB'] },
    { label: 'CB',  primary: 'CB',  accepts: ['RB', 'LB', 'CDM'] },
    { label: 'CB',  primary: 'CB',  accepts: ['RB', 'LB', 'CDM'] },
    { label: 'LB',  primary: 'LB',  accepts: ['CB'] },
    { label: 'CDM', primary: 'CDM', accepts: ['CM'] },
    { label: 'CDM', primary: 'CDM', accepts: ['CM'] },
    { label: 'CAM', primary: 'CAM', accepts: ['CM', 'RW', 'LW'] },
    { label: 'RW',  primary: 'RW',  accepts: ['CAM', 'CM'] },
    { label: 'LW',  primary: 'LW',  accepts: ['CAM', 'CM'] },
    { label: 'ST',  primary: 'ST',  accepts: ['CAM'] },
  ],
  '3-5-2': [
    { label: 'GK',  primary: 'GK',  accepts: ['Who else would it even be?'] },
    { label: 'CB',  primary: 'CB',  accepts: ['CDM'] },
    { label: 'CB',  primary: 'CB',  accepts: ['CDM'] },
    { label: 'CB',  primary: 'CB',  accepts: ['CDM'] },
    { label: 'RB',  primary: 'RB',  accepts: ['CM', 'RW'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CDM', primary: 'CDM', accepts: ['CM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'LB',  primary: 'LB',  accepts: ['CM', 'LW'] },
    { label: 'ST',  primary: 'ST',  accepts: ['LW', 'RW'] },
    { label: 'ST',  primary: 'ST',  accepts: ['LW', 'RW'] },
  ],
  '5-3-2': [
    { label: 'GK',  primary: 'GK',  accepts: ['Who else would it even be?'] },
    { label: 'RB',  primary: 'RB',  accepts: ['CB'] },
    { label: 'CB',  primary: 'CB',  accepts: ['CDM'] },
    { label: 'CB',  primary: 'CB',  accepts: ['CDM'] },
    { label: 'CB',  primary: 'CB',  accepts: ['CDM'] },
    { label: 'LB',  primary: 'LB',  accepts: ['CB'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CDM', primary: 'CDM', accepts: ['CM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'ST',  primary: 'ST',  accepts: ['LW', 'RW'] },
    { label: 'ST',  primary: 'ST',  accepts: ['LW', 'RW'] },
  ],
  '3-4-3': [
    { label: 'GK',  primary: 'GK',  accepts: ['Who else would it even be?'] },
    { label: 'CB',  primary: 'CB',  accepts: ['CDM'] },
    { label: 'CB',  primary: 'CB',  accepts: ['CDM'] },
    { label: 'CB',  primary: 'CB',  accepts: ['CDM'] },
    { label: 'LWB', primary: 'LB',  accepts: ['CM', 'LW'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'RWB', primary: 'RB',  accepts: ['CM', 'RW'] },
    { label: 'LW',  primary: 'LW',  accepts: ['CAM', 'ST'] },
    { label: 'ST',  primary: 'ST',  accepts: ['CAM', 'LW', 'RW'] },
    { label: 'RW',  primary: 'RW',  accepts: ['CAM', 'ST'] },
  ],
  '4-1-4-1': [
    { label: 'GK',  primary: 'GK',  accepts: ['Who else would it even be?'] },
    { label: 'RB',  primary: 'RB',  accepts: ['CB'] },
    { label: 'CB',  primary: 'CB',  accepts: ['RB', 'LB', 'CDM'] },
    { label: 'CB',  primary: 'CB',  accepts: ['RB', 'LB', 'CDM'] },
    { label: 'LB',  primary: 'LB',  accepts: ['CB'] },
    { label: 'CDM', primary: 'CDM', accepts: ['CM'] },
    { label: 'RM',  primary: 'RW',  accepts: ['CM', 'CAM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'LM',  primary: 'LW',  accepts: ['CM', 'CAM'] },
    { label: 'ST',  primary: 'ST',  accepts: ['CAM'] },
  ],
  '4-3-1-2': [
    { label: 'GK',  primary: 'GK',  accepts: ['Who else would it even be?'] },
    { label: 'RB',  primary: 'RB',  accepts: ['CB'] },
    { label: 'CB',  primary: 'CB',  accepts: ['RB', 'LB', 'CDM'] },
    { label: 'CB',  primary: 'CB',  accepts: ['RB', 'LB', 'CDM'] },
    { label: 'LB',  primary: 'LB',  accepts: ['CB'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CAM', primary: 'CAM', accepts: ['CM', 'RW', 'LW'] },
    { label: 'ST',  primary: 'ST',  accepts: ['CAM', 'LW', 'RW'] },
    { label: 'ST',  primary: 'ST',  accepts: ['CAM', 'LW', 'RW'] },
  ],
  '4-1-2-1-2': [
    { label: 'GK',  primary: 'GK',  accepts: ['Who else would it even be?'] },
    { label: 'RB',  primary: 'RB',  accepts: ['CB'] },
    { label: 'CB',  primary: 'CB',  accepts: ['RB', 'LB', 'CDM'] },
    { label: 'CB',  primary: 'CB',  accepts: ['RB', 'LB', 'CDM'] },
    { label: 'LB',  primary: 'LB',  accepts: ['CB'] },
    { label: 'CDM', primary: 'CDM', accepts: ['CM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CAM', primary: 'CAM', accepts: ['CM', 'RW', 'LW'] },
    { label: 'ST',  primary: 'ST',  accepts: ['CAM', 'LW', 'RW'] },
    { label: 'ST',  primary: 'ST',  accepts: ['CAM', 'LW', 'RW'] },
  ],
  '5-4-1': [
    { label: 'GK',  primary: 'GK',  accepts: ['Who else would it even be?'] },
    { label: 'RWB', primary: 'RB',  accepts: ['CM', 'RW'] },
    { label: 'CB',  primary: 'CB',  accepts: ['CDM'] },
    { label: 'CB',  primary: 'CB',  accepts: ['CDM'] },
    { label: 'CB',  primary: 'CB',  accepts: ['CDM'] },
    { label: 'LWB', primary: 'LB',  accepts: ['CM', 'LW'] },
    { label: 'RM',  primary: 'RW',  accepts: ['CM', 'CAM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'LM',  primary: 'LW',  accepts: ['CM', 'CAM'] },
    { label: 'ST',  primary: 'ST',  accepts: ['CAM'] },
  ],
  '3-4-2-1': [
    { label: 'GK',  primary: 'GK',  accepts: ['Who else would it even be?'] },
    { label: 'LWB', primary: 'LB',  accepts: ['CM', 'LW'] },
    { label: 'CB',  primary: 'CB',  accepts: ['CDM'] },
    { label: 'CB',  primary: 'CB',  accepts: ['CDM'] },
    { label: 'CB',  primary: 'CB',  accepts: ['CDM'] },
    { label: 'RWB', primary: 'RB',  accepts: ['CM', 'RW'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'LAM', primary: 'CAM', accepts: ['CM', 'LW'] },
    { label: 'RAM', primary: 'CAM', accepts: ['CM', 'RW'] },
    { label: 'ST',  primary: 'ST',  accepts: ['CAM', 'LW', 'RW'] },
  ],
  '3-4-1-2': [
    { label: 'GK',  primary: 'GK',  accepts: ['Who else would it even be?'] },
    { label: 'CB',  primary: 'CB',  accepts: ['CDM'] },
    { label: 'CB',  primary: 'CB',  accepts: ['CDM'] },
    { label: 'CB',  primary: 'CB',  accepts: ['CDM'] },
    { label: 'LM',  primary: 'LB',  accepts: ['LW', 'LB'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'RM',  primary: 'RB',  accepts: ['RW', 'RB'] },
    { label: 'CAM', primary: 'CAM', accepts: ['CM', 'RW', 'LW', 'ST'] },
    { label: 'ST',  primary: 'ST',  accepts: ['LW', 'RW'] },
    { label: 'ST',  primary: 'ST',  accepts: ['LW', 'RW'] },
  ],
}

// Visual row layout for the pitch diagram (attack → defense, top to bottom).
// Every label used in FORMATIONS[formation] must appear here exactly once —
// this is what makes each formation actually LOOK different, instead of every
// squad collapsing into the same generic attack/mid/defense/GK bucketing.
const FORMATION_ROWS: Record<Formation, string[][]> = {
  '4-3-3':     [['LW', 'ST', 'RW'], ['CM', 'CM', 'CM'], ['LB', 'CB', 'CB', 'RB'], ['GK']],
  '4-4-2':     [['ST', 'ST'], ['LM', 'CM', 'CM', 'RM'], ['LB', 'CB', 'CB', 'RB'], ['GK']],
  '4-2-3-1':   [['ST'], ['LW', 'CAM', 'RW'], ['CDM', 'CDM'], ['LB', 'CB', 'CB', 'RB'], ['GK']],
  '3-5-2':     [['ST', 'ST'], ['LB', 'CM', 'CDM', 'CM', 'RB'], ['CB', 'CB', 'CB'], ['GK']],
  '5-3-2':     [['ST', 'ST'], ['CM', 'CDM', 'CM'], ['LB', 'CB', 'CB', 'CB', 'RB'], ['GK']],
  '3-4-3':     [['LW', 'ST', 'RW'], ['LWB', 'CM', 'CM', 'RWB'], ['CB', 'CB', 'CB'], ['GK']],
  '4-1-4-1':   [['ST'], ['LM', 'CM', 'CM', 'RM'], ['CDM'], ['LB', 'CB', 'CB', 'RB'], ['GK']],
  '4-3-1-2':   [['ST', 'ST'], ['CAM'], ['CM', 'CM', 'CM'], ['LB', 'CB', 'CB', 'RB'], ['GK']],
  '4-1-2-1-2': [['ST', 'ST'], ['CAM'], ['CM', 'CM'], ['CDM'], ['LB', 'CB', 'CB', 'RB'], ['GK']],
  '5-4-1':     [['ST'], ['LM', 'CM', 'CM', 'RM'], ['LWB', 'CB', 'CB', 'CB', 'RWB'], ['GK']],
  '3-4-2-1':   [['ST'], ['LAM', 'RAM'], ['LWB', 'CM', 'CM', 'RWB'], ['CB', 'CB', 'CB'], ['GK']],
  '3-4-1-2':   [['ST', 'ST'], ['CAM'], ['LM', 'CM', 'CM', 'RM'], ['CB', 'CB', 'CB'], ['GK']],
}

/** Every formation the game knows — the same list the player picks from, so
 *  AI sides can never line up in a shape that doesn't exist in the app. */
export const ALL_FORMATIONS = Object.keys(FORMATIONS) as Formation[]

export function getSlotsForFormation(formation: Formation): PositionSlot[] {
  return FORMATIONS[formation].map((slot, index) => ({
    slotIndex: index,
    label:     slot.label,
    primary:   slot.primary as PositionSlot['primary'],
    accepts:   slot.accepts as PositionSlot['primary'][],
    filledBy:  null,
  }))
}

// The pitch diagram's row layout for a formation — attack (top) to GK (bottom).
export function getFormationRows(formation: Formation): string[][] {
  return FORMATION_ROWS[formation] ?? [['ST'], ['CM'], ['CB'], ['GK']]
}
// ── Shirt numbers (P8-124) ───────────────────────────────────────────────────
// Football reads a number as a position: the keeper 1, the full-backs 2 and 3,
// the centre-backs 4 and 5 (6 in a back three), the holding midfielder 6, the
// wide right 7, the central midfielder 8, the striker 9, the number ten 10,
// the wide left 11. The shape used to number shirts by slot order, so a CAM
// could be a 7 and a striker a 3.
//
// Each position takes the first free number from its list, and the positions
// choose in this order, so the iconic numbers go where they belong before a
// second of a kind takes what's left: a lone striker is 9 and a number ten 10;
// two strikers with no ten are 9 and 10; a 4-3-3's three midfielders are 8, 6
// and 10; a second holding midfielder is 8.
const SHIRTS: [string[], number[]][] = [
  [['GK'], [1]],
  [['RB', 'RWB'], [2, 12]],
  [['LB', 'LWB'], [3, 13]],
  [['RW', 'RM'], [7, 17]],
  [['LW', 'LM'], [11, 21]],
  [['CAM', 'LAM', 'RAM'], [10, 8, 14, 20]],
  [['ST'], [9, 10, 11, 19, 18]],
  [['CB'], [5, 4, 6, 15]],
  [['CDM'], [6, 8, 4, 16]],
  [['CM'], [8, 6, 10, 4, 7, 11, 14, 16]],
]

/** Each slot's shirt number, by slot index. Every number is different. */
export function shirtNumbers(slots: PositionSlot[]): Map<number, number> {
  const out = new Map<number, number>()
  const taken = new Set<number>()
  const take = (slotIndex: number, wanted: number[]) => {
    let n = wanted.find(w => !taken.has(w))
    // Past the list: the next free squad number, so a strange shape still has one each.
    for (let k = 12; n === undefined; k++) if (!taken.has(k)) n = k
    taken.add(n); out.set(slotIndex, n)
  }
  for (const [labels, wanted] of SHIRTS) {
    for (const slot of slots) if (labels.includes(slot.label)) take(slot.slotIndex, wanted)
  }
  // A label not in the table (none today) still gets a number.
  for (const slot of slots) if (!out.has(slot.slotIndex)) take(slot.slotIndex, [])
  return out
}
