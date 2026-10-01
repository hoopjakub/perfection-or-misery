// P8-172: the three European competitions, as the game plays them. One place
// says what makes each one itself — its name, where its field lives in the
// bundled database, the shape of its league phase, and how its scores weigh
// against the Champions League's — so the screens that play the Champions
// League play all three by asking here (docs/europe/02).
//
// Imports nothing but a type: the verify scripts and the shared score use it.
import type { GameMode } from '@/types/game'

export type EuropeComp = 'ucl' | 'uel' | 'uecl'

export type EuropeCompetition = {
  id: EuropeComp
  /** The classic mode that plays it on its own (its league phase and knockouts). */
  mode: GameMode
  name: string          // "Europa League"
  fullName: string      // "UEFA Europa League"
  short: string         // "UEL"
  finalLabel: string    // "Europa League Final"
  /** Its editions in the bundled database: leagues `uel_2025` and so on. */
  leaguePrefix: string
  /** The league phase: four pots, two from each (the Champions and Europa
   *  Leagues), or six pots, one from each (the Conference League). */
  pots: number
  perPot: 1 | 2
  matchdays: number
  /** Whether its field keeps the real pots (a real draw's), or is potted by rating. */
  realPots: boolean
}

export const EUROPE: Record<EuropeComp, EuropeCompetition> = {
  ucl:  { id: 'ucl',  mode: 'champions_league',  name: 'Champions League',  fullName: 'UEFA Champions League',  short: 'UCL',  finalLabel: 'UCL Final',
          leaguePrefix: 'ucl_',  pots: 4, perPot: 2, matchdays: 8, realPots: false },
  uel:  { id: 'uel',  mode: 'europa_league',     name: 'Europa League',     fullName: 'UEFA Europa League',     short: 'UEL',  finalLabel: 'Europa League Final',
          leaguePrefix: 'uel_',  pots: 4, perPot: 2, matchdays: 8, realPots: true },
  uecl: { id: 'uecl', mode: 'conference_league', name: 'Conference League', fullName: 'UEFA Conference League', short: 'UECL', finalLabel: 'Conference League Final',
          leaguePrefix: 'uecl_', pots: 6, perPot: 1, matchdays: 6, realPots: true },
}

/** The competition a classic European mode plays, or null for any other mode. */
export function compOfMode(mode: string | null | undefined): EuropeCompetition | null {
  if (mode === 'champions_league') return EUROPE.ucl
  if (mode === 'europa_league') return EUROPE.uel
  if (mode === 'conference_league') return EUROPE.uecl
  return null
}

/** The Champions League, the Europa League or the Conference League, on its own. */
export const isClassicEurope = (mode: string | null | undefined): boolean => compOfMode(mode) !== null

/** Any mode played on the Champions League's screens and result shape: the
 *  three classic competitions and the full path. */
export const isEuropeMode = (mode: string | null | undefined): boolean =>
  isClassicEurope(mode) || mode === 'champions_league_custom'
