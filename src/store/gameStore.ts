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
  mode: GameMode | null
  formation: Formation | null
  draftedPlayers: DraftedPlayer[]
  rerollsUsed: number
  spunSeasonIds: string[]

  startRun: (mode: GameMode, formation: Formation) => void
  addPlayer: (player: DraftedPlayer) => void
  markSeasonSpun: (id: string) => void
  useReroll: () => void
  resetRun: () => void
}

const initialState = {
  mode: null,
  formation: null,
  draftedPlayers: [],
  rerollsUsed: 0,
  spunSeasonIds: [],
}

export const useGameStore = create<GameStore>((set) => ({
  ...initialState,

  startRun: (mode, formation) => set({ ...initialState, mode, formation }),
  addPlayer: (player) => set(s => ({ draftedPlayers: [...s.draftedPlayers, player] })),
  markSeasonSpun: (id) => set(s => ({ spunSeasonIds: [...s.spunSeasonIds, id] })),
  useReroll: () => set(s => ({ rerollsUsed: s.rerollsUsed + 1 })),
  resetRun: () => set(initialState),
}))