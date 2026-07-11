import { create } from 'zustand'
import type { DraftedPlayer, LeagueSeason, Formation, GameMode } from '@/types/game'
import type { SeasonResult } from '@/types/simulation'
import type { CLTeam, CLSeasonResult } from '@/engine/cl-sim'
import type { WCTeam, WCSeasonResult } from '@/engine/world-cup-sim'
import type { QualifyingResult } from '@/engine/cl-qualifying'
import type { SimLeagueTable } from '@/engine/cl-league-sim'

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
  useSubstitutes: boolean          // if off, NOBODY (you or the AI) uses a bench this run
  benchPlayers:   DraftedPlayer[]  // your subs, drafted separately from the starting XI
  rerollsUsed:    number
  spunSeasonIds:  string[]
  placedLeague:   LeagueSeason | null
  simResult:      SeasonResult | null
  accentColor:    string | null
  competitionData: null
  clTeams:        CLTeam[] | null
  clYear:         number | null   // which UCL edition you were placed in
  wcTeams:        WCTeam[] | null
  clResult:       CLSeasonResult | null
  wcResult:       WCSeasonResult | null
  customUclQual:    QualifyingResult | null   // custom UCL: qualifying-ladder result
  customUclLeagues: SimLeagueTable[] | null   // custom UCL: simulated domestic tables (for the league viewer)
  customUclPlayerClubId: string | null        // custom UCL: which real club you took over
  quickSim:       boolean   // headless tester run — must never be saved to the DB

  startRun:       (mode: GameMode, formation: Formation, era?: string) => void
  addPlayer:      (player: DraftedPlayer) => void
  addBenchPlayer: (player: DraftedPlayer) => void
  setUseSubstitutes: (on: boolean) => void
  movePlayer:     (playerId: string, newSlotIndex: number) => void
  // Swap a bench player into a starting-XI slot. If that slot is occupied, the
  // displaced starter goes to the bench in the sub's old spot; if it was empty
  // (shouldn't normally happen once the XI is full, but safe either way) the
  // sub just fills it and the bench shrinks by one.
  swapBenchAndStarter: (benchPlayerId: string, starterSlotIndex: number) => void
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
  setClYear:  (year: number) => void
  setWcTeams: (teams: WCTeam[]) => void
  setClResult: (r: CLSeasonResult) => void
  setWcResult: (r: WCSeasonResult) => void
  setCustomUclQual:    (q: QualifyingResult | null) => void
  setCustomUclLeagues: (t: SimLeagueTable[] | null) => void
  setCustomUclPlayerClubId: (id: string | null) => void
}

const initialState = {
  mode:            null,
  era:             null,
  difficulty:      null,
  selectedLeague:  null,
  formation:       null,
  draftedPlayers:  [],
  useSubstitutes:  true,
  benchPlayers:    [],
  rerollsUsed:     0,
  spunSeasonIds:   [],
  placedLeague:    null,
  simResult:       null,
  accentColor:     null,
  competitionData: null,
  clTeams:         null,
  clYear:          null,
  wcTeams:         null,
  clResult:        null,
  wcResult:        null,
  customUclQual:    null,
  customUclLeagues: null,
  customUclPlayerClubId: null,
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
    useSubstitutes: s.useSubstitutes, // Preserve the substitutes toggle
  })),
  addPlayer:      (player) => set(s => ({ draftedPlayers: [...s.draftedPlayers, player] })),
  addBenchPlayer: (player) => set(s => ({ benchPlayers: [...s.benchPlayers, player] })),
  setUseSubstitutes: (useSubstitutes) => set({ useSubstitutes }),
  movePlayer:     (playerId, newSlotIndex) => set(s => ({
    draftedPlayers: s.draftedPlayers.map(p => p.playerId === playerId ? { ...p, slotIndex: newSlotIndex } : p),
  })),
  swapBenchAndStarter: (benchPlayerId, starterSlotIndex) => set(s => {
    const sub = s.benchPlayers.find(p => p.playerId === benchPlayerId)
    if (!sub) return s
    const starter = s.draftedPlayers.find(p => p.slotIndex === starterSlotIndex)
    const promoted: DraftedPlayer = { ...sub, isBench: false, slotIndex: starterSlotIndex }
    const benchWithoutSub = s.benchPlayers.filter(p => p.playerId !== benchPlayerId)
    return {
      draftedPlayers: [
        ...s.draftedPlayers.filter(p => p.slotIndex !== starterSlotIndex),
        promoted,
      ],
      benchPlayers: starter
        ? [...benchWithoutSub, { ...starter, isBench: true, slotIndex: sub.slotIndex }]
        : benchWithoutSub,
    }
  }),
  markSeasonSpun: (id) => set(s => ({ spunSeasonIds: [...s.spunSeasonIds, id] })),
  useReroll:      () => set(s => ({ rerollsUsed: s.rerollsUsed + 1 })),
  resetRun:       () => set(s => ({
    ...s,
    formation:       null,
    draftedPlayers:  [],
    benchPlayers:    [],
    rerollsUsed:     0,
    spunSeasonIds:   [],
    placedLeague:    null,
    simResult:       null,
    competitionData: null,
    clTeams:         null,
  clYear:          null,
    wcTeams:         null,
    clResult:        null,
    wcResult:        null,
    customUclQual:    null,
    customUclLeagues: null,
    customUclPlayerClubId: null,
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
  setClYear:      (clYear) => set({ clYear }),
  setWcTeams:     (wcTeams) => set({ wcTeams }),
  setClResult:    (clResult) => set({ clResult }),
  setWcResult:    (wcResult) => set({ wcResult }),
  setCustomUclQual:    (customUclQual) => set({ customUclQual }),
  setCustomUclLeagues: (customUclLeagues) => set({ customUclLeagues }),
  setCustomUclPlayerClubId: (customUclPlayerClubId) => set({ customUclPlayerClubId }),
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