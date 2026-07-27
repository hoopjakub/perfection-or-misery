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
  isBench?:        boolean       // substitute — limited minutes, reduced scoring/assist odds
  birthYear:       number | null // for U21 awards
  yearStart:       number        // edition start year (e.g. 2022 for 22/23) → age + identity
  seasonLabel:     string        // e.g. "22/23" (display + career identity)
  clubId:          string
  clubName:        string
}

// One goal within a match. Penalty SHOOTOUT kicks never produce these.
//
// A GoalEvent always lives in the array of the side the goal COUNTS FOR
// (`MatchScorers.home` = goals on home's scoreline). For an own goal that means
// the event sits with the *benefiting* team while `clubId`/`scorerId` point at
// the *conceding* team's player — which is exactly how an OG is displayed
// everywhere: on the beneficiary's line, credited against the man who put it in.
export type GoalEvent = {
  clubId:      string            // the SCORER's club (≠ the benefiting club for an OG)
  scorerId:    string
  scorerName:  string
  scorerIsBench?: boolean        // came off the bench — drives the orange SUB tag
  assistId?:   string
  assistName?: string
  assistIsBench?: boolean
  minute:      number            // 1..90 (regulation) or 91..120 (extra time)
  plus?:       number            // stoppage-time add-on: minute 90 + plus 3 → "90+3'"
  // ── §9 event flavour (own goals / penalties / mistakes) ──
  // Decided once, at attribution time, and stored on the match — so the live
  // reveal, the deep-stats sheet, the stats screen and history can never
  // disagree about how a goal was scored. Mutually exclusive: an own goal is
  // never a penalty, and neither carries an assist or an error.
  ownGoal?:     boolean          // scorer put it into their OWN net
  penalty?:     boolean          // converted from the spot (open play, not a shootout)
  penWonId?:    string           // who drew the penalty — benefiting side, ≠ the taker
  penWonName?:  string
  errorById?:   string           // conceding-side player whose mistake led to this goal
  errorByName?: string
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
  // §9 — left undefined (not 0) when it never happened, so the saved-run JSON
  // doesn't grow three zero fields for every player in the competition.
  ownGoals?:      number
  penaltyGoals?:  number         // subset of `goals` that were spot-kicks
  penaltiesWon?:  number         // fouled for a penalty someone else converted
  errorsLeadingToGoal?: number
  // §10.5 phase 3 — season totals behind the statistics screen's columns,
  // summed from each match's regenerated sheet. Optional for the same reason:
  // a player who never registered one costs the saved run nothing.
  chancesCreated?:   number      // key passes
  shots?:            number
  shotsOnTarget?:    number
  passes?:           number      // with accuratePasses → pass success rate
  accuratePasses?:   number
  dribbles?:         number      // successful
  dribblesAttempted?: number     // with dribbles → dribble success rate
  tacklesWon?:       number
  fouls?:            number      // committed, card or not
  yellowCards?:      number
  redCards?:         number
  // Deep-stats aggregates (match-detail generator, run over every match):
  avgRating?:    number          // mean 0–10 match rating, 2 decimals
  matchesRated?: number          // matches actually played (minutes > 0)
  potm?:         number          // Player-of-the-Match awards this run
  isPlayerClub?: boolean         // true if this is one of YOUR drafted players
  isBench?:      boolean         // a substitute, not part of the starting XI
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
  avgRating?:    number          // deep-stats: average match rating (heavy award weight)
  potm?:         number          // deep-stats: Player-of-the-Match count
  matchesRated?: number
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
