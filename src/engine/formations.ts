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