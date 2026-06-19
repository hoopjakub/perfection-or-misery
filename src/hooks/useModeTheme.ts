import { useGameStore } from '@/store/gameStore'
import { getModeTheme, type ModeTheme } from '@/theme'

// Returns the active mode's palette (World Cup gold, UCL navy, Chaos red,
// Cursed violet…), falling back to the league accent for the standard modes.
export function useModeTheme(): ModeTheme {
  const mode        = useGameStore(s => s.mode)
  const accentColor = useGameStore(s => s.accentColor)
  return getModeTheme(mode, accentColor)
}

export type { ModeTheme }
