import type { UclRound } from './uefa-coefficients'

// Shared display labels for the custom Champions League path's qualifying
// ladder — used by the placement reveal, the live qualifying/simulation
// screen, and the result page, so the wording stays consistent everywhere.

export const QUAL_ROUND_ORDER: UclRound[] = ['q1', 'q2', 'q3', 'playoff']

export const QUAL_ROUND_LABEL: Record<string, string> = {
  q1: 'First Qualifying Round',
  q2: 'Second Qualifying Round',
  q3: 'Third Qualifying Round',
  playoff: 'Play-off Round',
  league_phase: 'League Phase',
}

export const PATH_LABEL: Record<string, string> = {
  champions: 'Champions Path',
  league: 'League Path',
  none: 'Direct',
}

// playerFinalRound (qualifying-exit values) → the round they were knocked out at.
export const QUAL_EXIT_ROUND: Record<string, UclRound> = {
  q1_exit: 'q1', q2_exit: 'q2', q3_exit: 'q3', quali_playoff_exit: 'playoff',
}
