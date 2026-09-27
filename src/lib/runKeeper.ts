// P8-149: a run that survives a reload (or the app being closed).
//
// Everything in a run lived only in the game store's memory, so a reload lost
// it whole. This keeps the part that can honestly be picked up again: the run
// up to the kick-off — the mode and difficulty, the shape, every draft pick
// and the bench, the rerolls used — written on every change, and offered back
// on Home as "Continue your run", straight to the draft.
//
// Not a season half-played. Its matchdays live in the season screen, not the
// store, and a season restarted from its first matchday is a re-roll of every
// result: the exploit the back guard (§3) exists to stop. So a run that was
// drawn into its competition is kept only as a note that it was interrupted,
// which Home says once, plainly, and lets go.
import { useGameStore } from '@/store/gameStore'
import { settingsStorage } from '@/lib/mmkv'
import type { GameMode, Formation, DraftedPlayer } from '@/types/game'
import type { Difficulty, CustomDifficulty } from '@/engine/difficulty'

const KEY = 'pom.run.v1'

export type KeptRun = {
  v: 1
  savedAt: number
  /** 'draft': can be continued. 'season': it had been drawn; only its loss is said. */
  stage: 'draft' | 'season'
  mode: GameMode
  difficulty: Difficulty | null
  customDifficulty: CustomDifficulty
  weightedPicksOverride: boolean | null
  selectedLeague: string | null
  formation: Formation
  draftedPlayers: DraftedPlayer[]
  benchPlayers: DraftedPlayer[]
  useSubstitutes: boolean
  rerollsUsed: number
  spunSeasonIds: string[]
  runStartedAt: number | null
}

let last = ''
function write(k: KeptRun | null) {
  // Compared without the time it was saved, or every change to the store
  // (mid-season there are many) would write again for nothing.
  const same = k ? JSON.stringify({ ...k, savedAt: 0 }) : ''
  if (same === last) return
  last = same
  settingsStorage.setItem(KEY, k ? JSON.stringify(k) : '').catch(e => console.warn('[run keeper] save failed:', e))
}

/** Starts keeping the run: once, from the root layout. */
export function startRunKeeper(): () => void {
  return useGameStore.subscribe(s => {
    // A tester's run is never kept (it's never saved either).
    if (s.quickSim || !s.mode || !s.formation) { write(null); return }
    // Drawn into its competition: from here, a reload can only be told about.
    const drawn = !!(s.placedLeague || s.clTeams || s.wcTeams || s.customUclPlayerClubId || s.simResult || s.clResult || s.wcResult)
    // A finished run is saved on its result screen; nothing to keep.
    if (s.savedRunId || s.runData) { write(null); return }
    write({
      v: 1, savedAt: Date.now(), stage: drawn ? 'season' : 'draft',
      mode: s.mode, difficulty: s.difficulty, customDifficulty: s.customDifficulty,
      weightedPicksOverride: s.weightedPicksOverride, selectedLeague: s.selectedLeague,
      formation: s.formation, draftedPlayers: s.draftedPlayers, benchPlayers: s.benchPlayers,
      useSubstitutes: s.useSubstitutes, rerollsUsed: s.rerollsUsed, spunSeasonIds: s.spunSeasonIds,
      runStartedAt: s.runStartedAt,
    })
  })
}

/** The run a previous launch left, if any (read on Home). */
export async function keptRun(): Promise<KeptRun | null> {
  try {
    const raw = await settingsStorage.getItem(KEY)
    if (!raw) return null
    const k = JSON.parse(raw) as KeptRun
    return k?.v === 1 && k.mode && k.formation && Array.isArray(k.draftedPlayers) ? k : null
  } catch { return null }
}

/** Put a kept draft back in the store; the caller goes to the draft. */
export function resumeKeptRun(k: KeptRun): void {
  const st = useGameStore.getState()
  st.startRun(k.mode, k.formation)
  useGameStore.setState({
    difficulty: k.difficulty, customDifficulty: k.customDifficulty, weightedPicksOverride: k.weightedPicksOverride,
    selectedLeague: k.selectedLeague, draftedPlayers: k.draftedPlayers, benchPlayers: k.benchPlayers,
    useSubstitutes: k.useSubstitutes, rerollsUsed: k.rerollsUsed, spunSeasonIds: k.spunSeasonIds,
    runStartedAt: k.runStartedAt ?? Date.now(),
  })
}

/** Forget it (declined, or the interrupted season has been said). */
export function dropKeptRun(): void {
  write(null)
}
