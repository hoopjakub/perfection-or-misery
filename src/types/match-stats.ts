// Deep match stats — types for the FotMob-style match-detail screen.
// See docs/"Next Up - Deep Match Stats & Ratings.md". A match persists only a
// compact `seed` (+ the already-attributed scorers); the full MatchStats sheet
// is regenerated deterministically from that seed whenever the match is opened
// (src/engine/match-detail.ts).

// ── Team stat grid (one side) ───────────────────────────────────────────────
export type TeamStatLine = {
  // Top
  possession:       number   // 0..100, both sides sum to 100
  xg:               number   // 1 decimal
  xgOpenPlay:       number
  xgSetPiece:       number
  shots:            number
  shotsOnTarget:    number
  bigChances:       number
  bigChancesMissed: number
  accuratePasses:   number
  passAccuracy:     number   // 0..100 (%)
  corners:          number
  fouls:            number
  // Shots
  shotsOffTarget:   number
  shotsBlocked:     number
  shotsInsideBox:   number
  shotsOutsideBox:  number
  shotsWoodwork:    number
  // Passes
  passes:           number
  ownHalfPasses:    number
  oppHalfPasses:    number
  accurateLongBalls: number
  accurateCrosses:  number
  throwIns:         number
  // Defence
  tacklesWon:       number
  interceptions:    number
  blocks:           number
  clearances:       number
  keeperSaves:      number
  // Duels
  groundDuelsWon:   number
  aerialDuelsWon:   number
  dribbles:         number   // successful dribbles
  possessionLost:   number
  // Discipline
  yellowCards:      number
  redCards:         number
  offsides:         number
  // Attack territory
  touchesInOppBox:  number
  finalThirdEntries: number
}

// ── Per-player line ─────────────────────────────────────────────────────────
export type PlayerGkLine = {
  saves:          number
  goalsConceded:  number
  savePct:        number   // 0..100; 100 when nothing faced
  punches:        number
  highClaims:     number
  sweeperActions: number
}

export type PlayerMatchLine = {
  playerId:  string
  name:      string
  position:  string        // 'GK','CB','ST',…
  isHome:    boolean
  isBench:   boolean       // drafted/named as a substitute
  // headline
  rating:    number        // 0–10, one decimal; only meaningful when minutes > 0
  minutes:   number        // 0 = unused sub (no rating shown)
  subOnMinute?:  number    // green ▲ — came on at this minute
  subOffMinute?: number    // red ▼ — went off at this minute
  motm?:     boolean       // highest-rated player of the match
  // attacking
  goals:             number
  assists:           number
  shots:             number
  shotsOnTarget:     number
  keyPasses:         number
  bigChancesCreated: number
  bigChancesMissed:  number
  touches:           number
  touchesInOppBox:   number
  offsides:          number
  // passing
  passes:         number
  accuratePasses: number
  passAccuracy:   number   // 0..100
  crosses:        number   // accurate crosses
  longBalls:      number   // accurate long balls
  // possession/duels
  dribbles:        number  // successful
  groundDuelsWon:  number
  aerialDuelsWon:  number
  possessionLost:  number
  // defending
  tacklesWon:    number
  interceptions: number
  clearances:    number
  blocks:        number
  // discipline
  foulsCommitted: number
  foulsWon:       number
  yellowCard:     boolean
  redCard:        boolean
  // keeper-only
  gk?: PlayerGkLine
}

// ── Events timeline ─────────────────────────────────────────────────────────
export type MatchEventType = 'goal' | 'yellow' | 'red' | 'sub'

export type MatchEvent = {
  type:    MatchEventType
  minute:  number
  plus?:   number          // stoppage add-on (90+3)
  isHome:  boolean
  playerId:   string       // goal: scorer · card: booked player · sub: player coming ON
  playerName: string
  // goal extras
  assistId?:   string
  assistName?: string
  // sub extras (player going OFF)
  offPlayerId?:   string
  offPlayerName?: string
}

// ── The full sheet ──────────────────────────────────────────────────────────
export type MatchStats = {
  home:  TeamStatLine
  away:  TeamStatLine
  players: PlayerMatchLine[]   // both sides; XIs first, then subs who featured, then unused
  events:  MatchEvent[]        // sorted by minute
  homeRating: number           // minutes-weighted team average, 1 decimal
  awayRating: number
  duration:   number           // 90 or 120 (extra time)
}
