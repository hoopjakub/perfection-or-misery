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
}

export type MatchResult = {
  homeGoals: number
  awayGoals: number
  outcome: 'home' | 'draw' | 'away'
  isUpset: boolean
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