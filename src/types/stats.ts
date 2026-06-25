// Player & match statistics — types.
// See docs/"Major Overhaul + Bug fixes.md". Scorers are *attributed* after each
// score is rolled (the engine has no individual-player sim), from real rosters.

// A candidate scorer/assister, used as the attribution pool for a club.
export type RosterPlayer = {
  playerId:        string
  name:            string
  primaryPosition: string        // 'GK','CB','ST',…
  attack:          number        // weighting input; falls back to ovr when 0/undefined
  ovr:             number
  birthYear:       number | null // for U21 awards
  yearStart:       number        // edition start year (e.g. 2022 for 22/23) → age + identity
  seasonLabel:     string        // e.g. "22/23" (display + career identity)
  clubId:          string
  clubName:        string
}

// One goal within a match. Penalty SHOOTOUT kicks never produce these.
export type GoalEvent = {
  clubId:      string
  scorerId:    string
  scorerName:  string
  assistId?:   string
  assistName?: string
  minute:      number            // 1..90 (regulation) or 91..120 (extra time)
  plus?:       number            // stoppage-time add-on: minute 90 + plus 3 → "90+3'"
}

export type MatchScorers = { home: GoalEvent[]; away: GoalEvent[] }

// Aggregated across one competition (one run). matchesPlayed is only populated
// for the player's own XI ("Your Players" section); leaderboards omit it.
export type PlayerStatLine = {
  playerId:      string
  name:          string
  seasonLabel:   string
  clubId:        string
  clubName:      string
  position:      string
  goals:         number
  assists:       number
  cleanSheets:   number
  matchesPlayed?: number
  isPlayerClub?: boolean         // true if this is one of YOUR drafted players
}

export type TeamGoalRecord = {
  clubId:       string
  clubName:     string
  goalsFor:     number
  goalsAgainst: number
  cleanSheets:  number       // matches this club conceded 0
}

export type CompetitionStats = {
  players: PlayerStatLine[]      // sorted by goals desc; full list
  teams:   TeamGoalRecord[]      // sorted by goalsFor desc
}

// End-of-run awards (per competition). Any position eligible; anyone can win.
export type AwardCandidate = {
  playerId:      string
  name:          string
  seasonLabel:   string
  clubId:        string
  clubName:      string
  position:      string
  age:           number | null
  goals:         number
  assists:       number
  cleanSheets:   number
  finalPosition: number          // their club's final standing (drives carry modifier)
  score:         number
  isPlayerClub?: boolean         // one of YOUR drafted players
}
export type SeasonAwards = {
  playerOfTheSeason: AwardCandidate[]   // top 5, [0] = winner
  bestU21:           AwardCandidate[]   // top 5 aged <= 21, [0] = winner
}

// ── Career (lifetime) — YOUR drafted players only, across all runs ──
// Identity key = playerId | seasonLabel | competition.
export type Competition = 'league' | 'champions_league' | 'world_cup' | string

export type CareerPlayerLine = {
  playerId:      string
  name:          string
  seasonLabel:   string
  competition:   Competition
  goals:         number
  assists:       number
  cleanSheets:   number
  matchesPlayed: number
  runs:          number
  potsWins:      number          // awards cabinet
  u21Wins:       number
}
export type CareerStats = {
  players:      CareerPlayerLine[]
  goalsFor:     number
  goalsAgainst: number
}
