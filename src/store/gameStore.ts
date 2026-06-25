import { create } from 'zustand'
import type { DraftedPlayer, LeagueSeason, Formation, GameMode } from '@/types/game'
import type { SeasonResult } from '@/types/simulation'
import type { CLTeam, CLSeasonResult } from '@/engine/cl-sim'
import type { WCTeam, WCSeasonResult } from '@/engine/world-cup-sim'

export type Difficulty = 'easy' | 'medium' | 'hard'

// Re-export so consumers can import from the store path if needed
export type { CLTeam, CLSeasonResult, WCTeam, WCSeasonResult }

type GameStore = {
  mode:           GameMode | null
  era:            string | null
  difficulty:     Difficulty | null
  selectedLeague: string | null
  formation:      Formation | null
  draftedPlayers: DraftedPlayer[]
  rerollsUsed:    number
  spunSeasonIds:  string[]
  placedLeague:   LeagueSeason | null
  simResult:      SeasonResult | null
  accentColor:    string | null
  competitionData: null
  clTeams:        CLTeam[] | null
  wcTeams:        WCTeam[] | null
  clResult:       CLSeasonResult | null
  wcResult:       WCSeasonResult | null
  quickSim:       boolean   // headless tester run — must never be saved to the DB

  startRun:       (mode: GameMode, formation: Formation, era?: string) => void
  addPlayer:      (player: DraftedPlayer) => void
  markSeasonSpun: (id: string) => void
  useReroll:      () => void
  resetRun:       () => void
  setMode:        (mode: GameMode, era?: string) => void
  setDifficulty:  (difficulty: Difficulty) => void
  setSelectedLeague: (league: string | null) => void
  setPlacement:   (league: LeagueSeason) => void
  setSimResult:   (result: SeasonResult | null) => void
  setAccentColor: (color: string | null) => void
  setCompetitionData: (data: null) => void
  setClTeams: (teams: CLTeam[]) => void 
  setWcTeams: (teams: WCTeam[]) => void
  setClResult: (r: CLSeasonResult) => void
  setWcResult: (r: WCSeasonResult) => void
}

const initialState = {
  mode:            null,
  era:             null,
  difficulty:      null,
  selectedLeague:  null,
  formation:       null,
  draftedPlayers:  [],
  rerollsUsed:     0,
  spunSeasonIds:   [],
  placedLeague:    null,
  simResult:       null,
  accentColor:     null,
  competitionData: null,
  clTeams:         null,
  wcTeams:         null,
  clResult:        null,
  wcResult:        null,
  quickSim:        false,
}

export const useGameStore = create<GameStore>((set) => ({
  ...initialState,
  startRun:       (mode, formation, era) => set(s => ({ 
    ...initialState, 
    mode, 
    formation, 
    era: era ?? null,
    difficulty: s.difficulty, // Preserve difficulty when starting a new run
    selectedLeague: s.selectedLeague, // Preserve selected league
    accentColor: s.accentColor, // Preserve accent color
  })),
  addPlayer:      (player) => set(s => ({ draftedPlayers: [...s.draftedPlayers, player] })),
  markSeasonSpun: (id) => set(s => ({ spunSeasonIds: [...s.spunSeasonIds, id] })),
  useReroll:      () => set(s => ({ rerollsUsed: s.rerollsUsed + 1 })),
  resetRun:       () => set(s => ({
    ...s,
    formation:       null,
    draftedPlayers:  [],
    rerollsUsed:     0,
    spunSeasonIds:   [],
    placedLeague:    null,
    simResult:       null,
    competitionData: null,
    clTeams:         null,
    wcTeams:         null,
    clResult:        null,
    wcResult:        null,
    quickSim:        false,
    // Keep mode, era, difficulty, selectedLeague, and accentColor
  })),
  setMode:        (mode, era) => set({ mode, era: era ?? null }),
  setDifficulty:  (difficulty) => set({ difficulty }),
  setSelectedLeague: (league) => set({ selectedLeague: league }),
  setPlacement:   (league) => set({ placedLeague: league }),
  setSimResult:   (simResult) => set({ simResult }),
  setAccentColor: (accentColor) => set({ accentColor }),
  setCompetitionData: (competitionData) => set({ competitionData }),
  setClTeams:     (clTeams) => set({ clTeams }),
  setWcTeams:     (wcTeams) => set({ wcTeams }),
  setClResult:    (clResult) => set({ clResult }),
  setWcResult:    (wcResult) => set({ wcResult }),
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