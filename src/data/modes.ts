// The modes a run can start in, and what setup needs to know about each.
// One list, read by "Where you play" (app/game/mode-select.tsx), "How hard"
// and Home's AGAIN plate — it used to live inside mode-select only.
import { t, dec } from '@/i18n'
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
  { id: 'leagues',   label: t('modes.groupLeagues') },
  { id: 'europe',    label: t('modes.groupEurope') },
  { id: 'world_cup', label: t('modes.groupWorldCup') },
]

export const MODES: ModeInfo[] = [
  { id: 'all_time', icon: 'modeAllTime', group: 'leagues', title: t('modes.allTime'), line: t('modes.allTimeLine'),
    hasDifficulty: true, legacyAccent: '#10B981' },
  { id: 'league', icon: 'modeLeague', group: 'leagues', title: t('modes.league'), line: t('modes.leagueLine'),
    hasDifficulty: true, legacyAccent: '#3B82F6' },
  { id: 'chaos', icon: 'modeChaos', group: 'leagues', title: t('modes.chaos'), line: t('modes.chaosLine'),
    rules: [t('modes.noRerolls'), t('modes.ratingsHidden'), t('modes.randomPositions')], hasDifficulty: false, hazard: true, legacyAccent: '#FF3B30' },
  { id: 'cursed', icon: 'modeCursed', group: 'leagues', title: t('modes.cursed'), line: t('modes.cursedLine'),
    rules: [t('modes.noRerolls'), t('modes.ratingsHidden'), t('modes.namesChange'), t('modes.cursePicks')], hasDifficulty: false, hazard: true, legacyAccent: '#A855F7' },
  { id: 'champions_league_custom', icon: 'modeClPath', group: 'europe', title: MODE_LABELS.champions_league_custom,
    line: t('modes.europePathLine'),
    hasDifficulty: true, competitionId: 'champions_league', legacyAccent: '#00088E' },
  { id: 'champions_league', icon: 'modeClFinals', group: 'europe', title: t('modes.finals', { comp: MODE_LABELS.champions_league }),
    line: t('modes.uclLine'),
    hasDifficulty: true, competitionId: 'champions_league', legacyAccent: '#4FA9FF' },
  // P8-172: the other two, each on its real 2025–26 field and pots.
  { id: 'europa_league', icon: 'modeElFinals', group: 'europe', title: t('modes.season2526', { comp: MODE_LABELS.europa_league }),
    line: t('modes.uelLine'),
    hasDifficulty: true, competitionId: 'europa_league', legacyAccent: '#F26722' },
  { id: 'conference_league', icon: 'modeEclFinals', group: 'europe', title: t('modes.season2526', { comp: MODE_LABELS.conference_league }),
    line: t('modes.ueclLine'),
    hasDifficulty: true, competitionId: 'conference_league', legacyAccent: '#1DB954' },
  { id: 'world_cup', icon: 'modeWorldCup', group: 'world_cup', title: t('modes.finals', { comp: MODE_LABELS.world_cup }),
    line: t('modes.wcLine'),
    hasDifficulty: true, competitionId: 'world_cup', legacyAccent: '#F5C518' },
  { id: 'world_cup_full', icon: 'modeWorldCup', group: 'world_cup', title: t('modes.fullRoute', { comp: MODE_LABELS.world_cup }),
    line: t('modes.wcFullLine'),
    hasDifficulty: false, comingSoon: true, competitionId: 'world_cup', legacyAccent: '#F5C518' },
]

/** A score multiplier as the difficulty labels print it: ×1.37 */
export const multiplierText = (m: number) => `×${dec(m, 2)}`

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
