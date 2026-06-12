import { create } from 'zustand'
import type { DraftedPlayer, LeagueSeason, Formation, GameMode } from '@/types/game'
import type { SeasonResult } from '@/types/simulation'

type GameStore = {
  mode:           GameMode | null
  era:            string | null
  formation:      Formation | null
  draftedPlayers: DraftedPlayer[]
  rerollsUsed:    number
  spunSeasonIds:  string[]
  placedLeague:   LeagueSeason | null
  simResult:      SeasonResult | null

  startRun:       (mode: GameMode, formation: Formation, era?: string) => void
  addPlayer:      (player: DraftedPlayer) => void
  markSeasonSpun: (id: string) => void
  useReroll:      () => void
  resetRun:       () => void
  setMode:        (mode: GameMode, era?: string) => void
  setPlacement:   (league: LeagueSeason) => void
  setSimResult:   (result: SeasonResult | null) => void
}

const initialState = {
  mode:           null,
  era:            null,
  formation:      null,
  draftedPlayers: [],
  rerollsUsed:    0,
  spunSeasonIds:  [],
  placedLeague:   null,
  simResult:      null,
}

export const useGameStore = create<GameStore>((set) => ({
  ...initialState,
  startRun:       (mode, formation, era) => set({ ...initialState, mode, formation, era: era ?? null }),
  addPlayer:      (player) => set(s => ({ draftedPlayers: [...s.draftedPlayers, player] })),
  markSeasonSpun: (id) => set(s => ({ spunSeasonIds: [...s.spunSeasonIds, id] })),
  useReroll:      () => set(s => ({ rerollsUsed: s.rerollsUsed + 1 })),
  resetRun:       () => set(s => ({
    ...s,
    formation: null,
    draftedPlayers: [],
    rerollsUsed: 0,
    spunSeasonIds: [],
    placedLeague: null,
    simResult: null,
    // Keep mode and era
  })),
  setMode:        (mode, era) => set({ mode, era: era ?? null }),
  setPlacement:   (league) => set({ placedLeague: league }),
  setSimResult:   (simResult) => set({ simResult }),
}))

// add to src/types/game.ts
export type LeagueSeasonWithTeams = {
  leagueId:       string
  leagueName:     string
  yearStart:      number
  gamesPerSeason: number
  teams: {
    club_id:        string
    club_name:      string
    historical_ovr: number
  }[]
}

export type { GameMode, Formation }