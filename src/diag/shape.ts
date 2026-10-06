// Phase 9, Diagnostics step 3 (docs/diagnostics/04-CHECKS.md §5): what this
// run, this session and this device's storage are made of. PoM's version of
// The Dugout's "what the world is made of". Worked out once when the screen
// opens, never kept live.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useGameStore } from '@/store/gameStore'
import { useUserStore } from '@/store/userStore'
import { leagueRunMatches, clRunMatches, wcRunMatches, type RunMatch } from '@/engine/run-matches'
import { settingsStorage } from '@/lib/mmkv'

export type RunShape = {
  mode: string | null
  difficulty: string | null
  formation: string | null
  squad: string                 // "11 + 5 · subs on"
  rerollsUsed: number
  matches: number
  seeded: number
  fallbackSeeds: number         // WARN above zero: two identical fixtures with one score share a sheet
  scorersNamed: string          // "41/43 goals"
  extraTime: number
  shootouts: number
  resultKB: number              // the result object in memory, as JSON
  testerWarning: boolean        // forced wins on outside the tester: should never happen
}

export function runShape(): RunShape | null {
  const s = useGameStore.getState()
  if (!s.mode) return null
  let matches: RunMatch[] = []
  try {
    matches = s.wcResult ? wcRunMatches(s.wcResult) : s.clResult ? clRunMatches(s.clResult) : s.simResult ? leagueRunMatches(s.simResult) : []
  } catch { /* a result mid-build; counted as none */ }
  const goals = matches.reduce((n, m) => n + m.homeGoals + m.awayGoals, 0)
  const named = matches.reduce((n, m) => n + (m.scorers ? m.scorers.home.length + m.scorers.away.length : 0), 0)
  const result = s.wcResult ?? s.clResult ?? s.simResult
  let bytes = 0
  try { bytes = result ? JSON.stringify(result).length : 0 } catch { /* circular: leave at 0 */ }
  return {
    mode: s.mode, difficulty: s.difficulty, formation: s.formation,
    squad: `${s.draftedPlayers.length} + ${s.benchPlayers.length} · subs ${s.useSubstitutes ? 'on' : 'off'}`,
    rerollsUsed: s.rerollsUsed,
    matches: matches.length,
    seeded: matches.filter(m => m.seed != null).length,
    fallbackSeeds: matches.filter(m => m.seed == null).length,
    scorersNamed: `${named}/${goals} goals`,
    extraTime: matches.filter(m => m.extraTime).length,
    shootouts: matches.filter(m => m.shootout || m.pensNote).length,
    resultKB: Math.round(bytes / 1024),
    testerWarning: s.testForceWinUntilFinal && !s.quickSim,
  }
}

/** Nothing else about the account: no id, no name, no email (02 §8). */
export function sessionKind(): 'none' | 'guest' | 'account' {
  const u = useUserStore.getState()
  return !u.user ? 'none' : u.isGuest ? 'guest' : 'account'
}

// What a reload keeps (04 §5.2) is said on the screen (diag.reload): the run
// keeper (P8-149) holds the draft to kick-off; a season in play isn't kept.

export type StorageShape = { keys: number; kb: number; names: string[]; settings: 'mmkv' | 'async-storage' }
/** Key names and sizes only; values are measured, never shown. A project reference in a key is masked. */
export async function storageShape(): Promise<StorageShape> {
  const keys = await AsyncStorage.getAllKeys()
  let bytes = 0
  for (const [, v] of await AsyncStorage.multiGet(keys)) bytes += (v ?? '').length
  return {
    keys: keys.length, kb: Math.round(bytes / 1024),
    names: keys.map(k => k.replace(/^sb-[^-]+-/, 'sb-…-')),
    settings: settingsStorage.kind(),
  }
}
