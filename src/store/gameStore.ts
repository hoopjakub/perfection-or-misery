import { create } from 'zustand'
import type { DraftedPlayer, LeagueSeason, Formation, GameMode } from '@/types/game'
import type { SeasonResult } from '@/types/simulation'
import type { CLTeam, CLSeasonResult } from '@/engine/cl-sim'
import type { WCTeam, WCSeasonResult } from '@/engine/world-cup-sim'
import type { QualifyingResult } from '@/engine/cl-qualifying'
import type { SimLeagueTable } from '@/engine/cl-league-sim'
import { type Difficulty, type CustomDifficulty, DEFAULT_CUSTOM } from '@/engine/difficulty'

// Canonical difficulty types live in engine/difficulty.ts; re-exported here so
// existing importers (`@/store/gameStore`) keep working unchanged.
export type { Difficulty, CustomDifficulty }

// Re-export so consumers can import from the store path if needed
export type { CLTeam, CLSeasonResult, WCTeam, WCSeasonResult }

type GameStore = {
  mode:           GameMode | null
  difficulty:     Difficulty | null
  customDifficulty: CustomDifficulty   // knobs for the 'custom' difficulty (rerolls / ratings / screw-level)
  // CL (full) weighted-picks manual override — null = follow the difficulty
  // default (resolveDifficulty().weightedPicksDefault); true/false = the
  // custom-path toggle wins, in either direction (Big Fixes §4).
  weightedPicksOverride: boolean | null
  selectedLeague: string | null
  formation:      Formation | null
  lastFormation:  Formation | null   // survives resetRun, so "Your shape" can offer it again
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
  // The pundits' preview (src/engine/predictions.ts) is pure and seeded, so the
  // seed alone brings it back; the verdict (Phase 4) checks the run against it.
  predictionSeed: number | null
  // The pundits' three names (Player of the Season, top scorer, best under-21),
  // read back on Awards Night. Live runs only; not saved with the run.
  punditPicks:    import('@/engine/predictions').PunditPicks | null
  // Phase 5 — the run's stats, computed once (on Awards Night or the first
  // page that needs them) and read by every run page after. Cleared with the run.
  runData:        import('@/lib/runData').RunData | null
  // Big Fixes §12 "Test final game" dev tool — while true, every WC match the
  // player's team plays (group stage or knockout) is forced to a clean 1-0
  // win EXCEPT the final, which always simulates for real. Read by
  // simulation.tsx's WC group/knockout execution; never true outside that tool.
  testForceWinUntilFinal: boolean

  setTestForceWinUntilFinal: (v: boolean) => void
  startRun:       (mode: GameMode, formation: Formation) => void
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
  setMode:        (mode: GameMode) => void
  setDifficulty:  (difficulty: Difficulty) => void
  setCustomDifficulty: (custom: CustomDifficulty) => void
  setWeightedPicksOverride: (v: boolean | null) => void
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
  difficulty:      null,
  customDifficulty: DEFAULT_CUSTOM,
  weightedPicksOverride: null,
  selectedLeague:  null,
  formation:       null,
  lastFormation:   null,
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
  predictionSeed:  null,
  punditPicks:     null,
  runData:         null,
  testForceWinUntilFinal: false,
}

export const useGameStore = create<GameStore>((set) => ({
  ...initialState,
  startRun:       (mode, formation) => set(s => ({
    ...initialState,
    mode,
    formation,
    lastFormation: formation,
    difficulty: s.difficulty, // Preserve difficulty when starting a new run
    customDifficulty: s.customDifficulty, // Preserve the custom-difficulty knobs too
    weightedPicksOverride: s.weightedPicksOverride, // Preserve the weighted-picks override too
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
    predictionSeed:  null,
  punditPicks:     null,
  runData:         null,
    testForceWinUntilFinal: false,
    // Keep mode, difficulty, selectedLeague, and accentColor
  })),
  setMode:        (mode) => set({ mode }),
  setDifficulty:  (difficulty) => set({ difficulty }),
  setCustomDifficulty: (customDifficulty) => set({ customDifficulty }),
  setWeightedPicksOverride: (weightedPicksOverride) => set({ weightedPicksOverride }),
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
  setTestForceWinUntilFinal: (testForceWinUntilFinal) => set({ testForceWinUntilFinal }),
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