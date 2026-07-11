import { Formation, PositionSlot } from '@/types/game'

type SlotTemplate = {
  label: string
  primary: string
  accepts: string[]
}

const FORMATIONS: Record<Formation, SlotTemplate[]> = {
  '4-3-3': [
    { label: 'GK',  primary: 'GK',  accepts: [] },
    { label: 'RB',  primary: 'RB',  accepts: ['CB'] },
    { label: 'CB',  primary: 'CB',  accepts: ['RB', 'LB'] },
    { label: 'CB',  primary: 'CB',  accepts: ['RB', 'LB'] },
    { label: 'LB',  primary: 'LB',  accepts: ['CB'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'RW',  primary: 'RW',  accepts: ['CAM', 'ST'] },
    { label: 'ST',  primary: 'ST',  accepts: ['CAM', 'LW', 'RW'] },
    { label: 'LW',  primary: 'LW',  accepts: ['CAM', 'ST'] },
  ],
  '4-4-2': [
    { label: 'GK',  primary: 'GK',  accepts: [] },
    { label: 'RB',  primary: 'RB',  accepts: ['CB'] },
    { label: 'CB',  primary: 'CB',  accepts: ['RB', 'LB'] },
    { label: 'CB',  primary: 'CB',  accepts: ['RB', 'LB'] },
    { label: 'LB',  primary: 'LB',  accepts: ['CB'] },
    { label: 'RM',  primary: 'RW',  accepts: ['CM', 'CAM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'LM',  primary: 'LW',  accepts: ['CM', 'CAM'] },
    { label: 'ST',  primary: 'ST',  accepts: ['LW', 'RW'] },
    { label: 'ST',  primary: 'ST',  accepts: ['LW', 'RW'] },
  ],
  '4-2-3-1': [
    { label: 'GK',  primary: 'GK',  accepts: [] },
    { label: 'RB',  primary: 'RB',  accepts: ['CB'] },
    { label: 'CB',  primary: 'CB',  accepts: ['RB', 'LB'] },
    { label: 'CB',  primary: 'CB',  accepts: ['RB', 'LB'] },
    { label: 'LB',  primary: 'LB',  accepts: ['CB'] },
    { label: 'CDM', primary: 'CDM', accepts: ['CM'] },
    { label: 'CDM', primary: 'CDM', accepts: ['CM'] },
    { label: 'CAM', primary: 'CAM', accepts: ['CM', 'RW', 'LW'] },
    { label: 'RW',  primary: 'RW',  accepts: ['CAM', 'CM'] },
    { label: 'LW',  primary: 'LW',  accepts: ['CAM', 'CM'] },
    { label: 'ST',  primary: 'ST',  accepts: ['CAM'] },
  ],
  '3-5-2': [
    { label: 'GK',  primary: 'GK',  accepts: [] },
    { label: 'CB',  primary: 'CB',  accepts: [] },
    { label: 'CB',  primary: 'CB',  accepts: [] },
    { label: 'CB',  primary: 'CB',  accepts: [] },
    { label: 'RB',  primary: 'RB',  accepts: ['CM', 'RW'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CDM', primary: 'CDM', accepts: ['CM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'LB',  primary: 'LB',  accepts: ['CM', 'LW'] },
    { label: 'ST',  primary: 'ST',  accepts: ['LW', 'RW'] },
    { label: 'ST',  primary: 'ST',  accepts: ['LW', 'RW'] },
  ],
  '5-3-2': [
    { label: 'GK',  primary: 'GK',  accepts: [] },
    { label: 'RB',  primary: 'RB',  accepts: ['CB'] },
    { label: 'CB',  primary: 'CB',  accepts: [] },
    { label: 'CB',  primary: 'CB',  accepts: [] },
    { label: 'CB',  primary: 'CB',  accepts: [] },
    { label: 'LB',  primary: 'LB',  accepts: ['CB'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CDM', primary: 'CDM', accepts: ['CM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'ST',  primary: 'ST',  accepts: ['LW', 'RW'] },
    { label: 'ST',  primary: 'ST',  accepts: ['LW', 'RW'] },
  ],
  '3-4-3': [
    { label: 'GK',  primary: 'GK',  accepts: [] },
    { label: 'CB',  primary: 'CB',  accepts: [] },
    { label: 'CB',  primary: 'CB',  accepts: [] },
    { label: 'CB',  primary: 'CB',  accepts: [] },
    { label: 'LWB', primary: 'LB',  accepts: ['CM', 'LW'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'RWB', primary: 'RB',  accepts: ['CM', 'RW'] },
    { label: 'LW',  primary: 'LW',  accepts: ['CAM', 'ST'] },
    { label: 'ST',  primary: 'ST',  accepts: ['CAM', 'LW', 'RW'] },
    { label: 'RW',  primary: 'RW',  accepts: ['CAM', 'ST'] },
  ],
  '4-1-4-1': [
    { label: 'GK',  primary: 'GK',  accepts: [] },
    { label: 'RB',  primary: 'RB',  accepts: ['CB'] },
    { label: 'CB',  primary: 'CB',  accepts: ['RB', 'LB'] },
    { label: 'CB',  primary: 'CB',  accepts: ['RB', 'LB'] },
    { label: 'LB',  primary: 'LB',  accepts: ['CB'] },
    { label: 'CDM', primary: 'CDM', accepts: ['CM'] },
    { label: 'RM',  primary: 'RW',  accepts: ['CM', 'CAM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'LM',  primary: 'LW',  accepts: ['CM', 'CAM'] },
    { label: 'ST',  primary: 'ST',  accepts: ['CAM'] },
  ],
  '4-3-1-2': [
    { label: 'GK',  primary: 'GK',  accepts: [] },
    { label: 'RB',  primary: 'RB',  accepts: ['CB'] },
    { label: 'CB',  primary: 'CB',  accepts: ['RB', 'LB'] },
    { label: 'CB',  primary: 'CB',  accepts: ['RB', 'LB'] },
    { label: 'LB',  primary: 'LB',  accepts: ['CB'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CAM', primary: 'CAM', accepts: ['CM', 'RW', 'LW'] },
    { label: 'ST',  primary: 'ST',  accepts: ['CAM', 'LW', 'RW'] },
    { label: 'ST',  primary: 'ST',  accepts: ['CAM', 'LW', 'RW'] },
  ],
  '4-1-2-1-2': [
    { label: 'GK',  primary: 'GK',  accepts: [] },
    { label: 'RB',  primary: 'RB',  accepts: ['CB'] },
    { label: 'CB',  primary: 'CB',  accepts: ['RB', 'LB'] },
    { label: 'CB',  primary: 'CB',  accepts: ['RB', 'LB'] },
    { label: 'LB',  primary: 'LB',  accepts: ['CB'] },
    { label: 'CDM', primary: 'CDM', accepts: ['CM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CAM', primary: 'CAM', accepts: ['CM', 'RW', 'LW'] },
    { label: 'ST',  primary: 'ST',  accepts: ['CAM', 'LW', 'RW'] },
    { label: 'ST',  primary: 'ST',  accepts: ['CAM', 'LW', 'RW'] },
  ],
  '5-4-1': [
    { label: 'GK',  primary: 'GK',  accepts: [] },
    { label: 'RWB', primary: 'RB',  accepts: ['CM', 'RW'] },
    { label: 'CB',  primary: 'CB',  accepts: [] },
    { label: 'CB',  primary: 'CB',  accepts: [] },
    { label: 'CB',  primary: 'CB',  accepts: [] },
    { label: 'LWB', primary: 'LB',  accepts: ['CM', 'LW'] },
    { label: 'RM',  primary: 'RW',  accepts: ['CM', 'CAM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'LM',  primary: 'LW',  accepts: ['CM', 'CAM'] },
    { label: 'ST',  primary: 'ST',  accepts: ['CAM'] },
  ],
  '3-4-2-1': [
    { label: 'GK',  primary: 'GK',  accepts: [] },
    { label: 'CB',  primary: 'CB',  accepts: [] },
    { label: 'CB',  primary: 'CB',  accepts: [] },
    { label: 'CB',  primary: 'CB',  accepts: [] },
    { label: 'LWB', primary: 'LB',  accepts: ['CM', 'LW'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'CM',  primary: 'CM',  accepts: ['CDM', 'CAM'] },
    { label: 'RWB', primary: 'RB',  accepts: ['CM', 'RW'] },
    { label: 'LAM', primary: 'CAM', accepts: ['CM', 'LW'] },
    { label: 'RAM', primary: 'CAM', accepts: ['CM', 'RW'] },
    { label: 'ST',  primary: 'ST',  accepts: ['CAM', 'LW', 'RW'] },
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
}

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