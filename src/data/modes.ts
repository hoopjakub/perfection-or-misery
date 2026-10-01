// The modes a run can start in, and what setup needs to know about each.
// One list, read by "Where you play" (app/game/mode-select.tsx), "How hard"
// and Home's AGAIN plate — it used to live inside mode-select only.
import type { GameMode } from '@/types/game'
import { MODE_LABELS } from '@/theme'

import type { IconName } from '@/components/kit'
export type ModeGroup = 'leagues' | 'europe' | 'world_cup'

// A mode can be advertised before it's playable, so its id is deliberately
// NOT confined to GameMode — an unplayable mode must never reach the store,
// the simulation screens or a saved run.
export type ModeId = GameMode | 'world_cup_full'

export type ModeInfo = {
  id: ModeId
  group: ModeGroup
  title: string
  line: string            // one plain line saying what the run is
  rules?: string[]        // printed on the label for modes with fixed rules
  hasDifficulty: boolean  // false = Chaos/Cursed, whose difficulty is their identity
  hazard?: boolean        // wears the hazard edge
  comingSoon?: boolean
  /** The competition whose own mark this mode wears (P8-12). A league mode has
   *  none: which league it is isn't known until it's picked. */
  competitionId?: string
  /** P8-86: the mode's own icon, on its card. */
  icon: IconName
  // The legacy accent the old (not yet rebuilt) screens tint themselves with
  // via useModeTheme. League modes have no MODE_THEMES entry, so this is it.
  legacyAccent: string
}

export const MODE_GROUPS: { id: ModeGroup; label: string }[] = [
  { id: 'leagues',   label: 'Leagues' },
  { id: 'europe',    label: 'Europe' },
  { id: 'world_cup', label: 'World Cup' },
]

export const MODES: ModeInfo[] = [
  { id: 'all_time', icon: 'modeAllTime', group: 'leagues', title: 'All Time', line: 'Any club, any season, any league.',
    hasDifficulty: true, legacyAccent: '#10B981' },
  { id: 'league', icon: 'modeLeague', group: 'leagues', title: 'League', line: 'Pick a league. Every spin and your placement come from it, across every season we have.',
    hasDifficulty: true, legacyAccent: '#3B82F6' },
  { id: 'chaos', icon: 'modeChaos', group: 'leagues', title: 'Chaos', line: 'You could be placed anywhere, and so could your players: you pick them, chaos picks where they play.',
    rules: ['NO REROLLS', 'RATINGS HIDDEN', 'RANDOM POSITIONS'], hasDifficulty: false, hazard: true, legacyAccent: '#FF3B30' },
  { id: 'cursed', icon: 'modeCursed', group: 'leagues', title: 'Cursed', line: "The names won't stay still, and now and then the curse makes the pick for you.",
    rules: ['NO REROLLS', 'RATINGS HIDDEN', 'NAMES CHANGE', 'THE CURSE PICKS'], hasDifficulty: false, hazard: true, legacyAccent: '#A855F7' },
  { id: 'champions_league_custom', icon: 'modeClPath', group: 'europe', title: `${MODE_LABELS.champions_league_custom} · Full path`,
    line: 'Every UEFA league and cup is played out. Your finish sends you into the Champions, Europa or Conference League; lose in qualifying and you drop a competition.',
    hasDifficulty: true, competitionId: 'champions_league', legacyAccent: '#00088E' },
  { id: 'champions_league', icon: 'modeClFinals', group: 'europe', title: `${MODE_LABELS.champions_league} · Finals`,
    line: 'The 36-club league phase and the knockouts. No qualifying.',
    hasDifficulty: true, competitionId: 'champions_league', legacyAccent: '#4FA9FF' },
  // P8-172: the other two, each on its real 2025–26 field and pots.
  { id: 'europa_league', icon: 'modeElFinals', group: 'europe', title: `${MODE_LABELS.europa_league} · 25/26`,
    line: 'The real 2025–26 field and pots: 36 clubs, eight league-phase games, then the knockouts.',
    hasDifficulty: true, competitionId: 'europa_league', legacyAccent: '#F26722' },
  { id: 'conference_league', icon: 'modeEclFinals', group: 'europe', title: `${MODE_LABELS.conference_league} · 25/26`,
    line: 'The real 2025–26 field: six pots, one opponent from each, then the knockouts.',
    hasDifficulty: true, competitionId: 'conference_league', legacyAccent: '#1DB954' },
  { id: 'world_cup', icon: 'modeWorldCup', group: 'world_cup', title: `${MODE_LABELS.world_cup} · Finals`,
    line: '48 national teams. Draft a squad and take over a country.',
    hasDifficulty: true, competitionId: 'world_cup', legacyAccent: '#F5C518' },
  { id: 'world_cup_full', icon: 'modeWorldCup', group: 'world_cup', title: `${MODE_LABELS.world_cup} · Full route`,
    line: 'Your confederation\'s qualifiers, the play-offs, then the tournament.',
    hasDifficulty: false, comingSoon: true, competitionId: 'world_cup', legacyAccent: '#F5C518' },
]

/** A score multiplier as the difficulty labels print it: ×1.37 */
export const multiplierText = (m: number) => `×${m.toFixed(2)}`

export function modeInfo(id: string | null | undefined): ModeInfo | undefined {
  return MODES.find(m => m.id === id)
}

/** Put a mode in the store the way setup does, ready for the next step. */
export function applyMode(
  store: { setMode: (m: GameMode) => void; setSelectedLeague: (l: string | null) => void; setAccentColor: (c: string | null) => void },
  mode: GameMode,
  league: string | null = null,
) {
  store.setMode(mode)
  store.setSelectedLeague(league)
  store.setAccentColor(modeInfo(mode)?.legacyAccent ?? null)
}


// Season or tournament (P8-78) lives in ./competition (no theme import, so the
// engine and the headless verifiers can use it too).
export { isTournament, seasonWord, forCompetition } from './competition'
