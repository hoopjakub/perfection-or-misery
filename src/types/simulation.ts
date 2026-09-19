import { LeagueTeam } from './game'

export type SimTeam = LeagueTeam & {
  form: number
  stats: TeamStats
}

export type TeamStats = {
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  points: number
}

export type Fixture = {
  matchday: number
  home: SimTeam
  away: SimTeam
  result: MatchResult | null
  scorers?: import('./stats').MatchScorers   // attributed once during sim, stored here
  seed?: number   // deep-stat seed — full match detail regenerates from this (match-detail.ts)
  // §10.5 — how heavily each side rested players. Stored because the XI it
  // produced decided the scoreline: regenerating the sheet without it would
  // pick a different eleven and a stored scorer could end up off the pitch.
  homeRotation?: number
  awayRotation?: number
  // §10.5 phase 4 — who was injured or suspended for this match, and the
  // stand-ins that covered for your side. Stored for the same reason rotation
  // is: the eleven they produced decided the scoreline, and regenerating
  // without them would field somebody who wasn't available.
  absent?:   string[]
  standIns?: import('./stats').RosterPlayer[]
}

export type MatchResult = {
  homeGoals: number
  awayGoals: number
  outcome: 'home' | 'draw' | 'away'
  isUpset: boolean
}

export type MatchdaySnapshot = {
  matchday: number
  standings: SimTeam[]
  fixtures: Fixture[]
}

export type SeasonResult = {
  table: SimTeam[]
  playerTeam: SimTeam
  finalPosition: number
  teamsInLeague: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  biggestWin: { score: string; opponent: string } | null
  worstLoss: { score: string; opponent: string } | null
  upsets: { score: string; opponent: string; ovrGap: number }[]
  tier: Tier
  unbeaten: boolean
  perfectSeason: boolean
  matchdayHistory: MatchdaySnapshot[] // Stored locally, not in database
  // §10.5 phase 4 (R8) — the medical table: everyone who missed a match through
  // injury or suspension, and for how long. Built in matchday order by the
  // availability ledger during the sim; it cannot be recomputed afterwards
  // because availability is sequential, so it travels with the result.
  absences?: import('@/engine/availability').Absence[]
  // The run's press (engine/press.ts), written once as each matchday landed.
  press?: import('@/engine/press').Story[]
}

export type Tier =
  | 'absolute_misery'
  | 'respectful_mediocrity'
  | 'almost_matters'
  | 'europa_glory'
  | 'champions_league'
  | 'title_contender'
  | 'champions'
  | 'almost_perfection'
  | 'perfection'