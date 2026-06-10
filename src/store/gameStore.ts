import type { LeagueSeason } from '@/types/game'
import { create } from 'zustand'



export type GameMode = 'league' | 'all_time' | 'era' | 'chaos' | 'cursed'
export type Formation = '4-3-3' | '4-4-2' | '4-2-3-1' | '3-5-2' | '5-3-2'

export type DraftedPlayer = {
  playerId: string
  playerSeasonId: string
  name: string
  nationality: string
  primaryPosition: string
  secondaryPositions: string[]
  ovr: number
  clubName: string
  season: string
  slotIndex: number
  isIcon: boolean
}

type GameStore = {
  mode:      GameMode | null
  era:       string | null      // add this
  formation: Formation | null
  draftedPlayers: DraftedPlayer[]
  rerollsUsed: number
  spunSeasonIds: string[]

  startRun:      (mode: GameMode, formation: Formation, era?: string) => void
  addPlayer:     (player: DraftedPlayer) => void
  markSeasonSpun:(id: string) => void
  useReroll:     () => void
  resetRun:      () => void
  setMode: (mode: GameMode, era?: string) => void
  setPlacement: (league: LeagueSeason) => void
placedLeague: LeagueSeason | null
}

const initialState = {
  mode:           null,
  era:            null,
  formation:      null,
  draftedPlayers: [],
  rerollsUsed:    0,
  spunSeasonIds:  [],
  placedLeague:   null,
}

export const useGameStore = create<GameStore>((set) => ({
  ...initialState,

  startRun: (mode, formation, era) => set({ ...initialState, mode, formation, era: era ?? null }),
  addPlayer: (player) => set(s => ({ draftedPlayers: [...s.draftedPlayers, player] })),
  markSeasonSpun: (id) => set(s => ({ spunSeasonIds: [...s.spunSeasonIds, id] })),
  useReroll: () => set(s => ({ rerollsUsed: s.rerollsUsed + 1 })),
  resetRun: () => set(initialState),
  setMode: (mode, era) => set({ mode, era: era ?? null }),
  setPlacement: (league) => set({ placedLeague: league }),
}))