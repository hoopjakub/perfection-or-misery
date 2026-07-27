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
  penaltiesSaved: number   // spot-kicks kept out — a genuine match-turning moment
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
  goals:             number   // §9: excludes own goals (those are logged separately)
  penaltyGoals:      number   // subset of `goals` converted from the spot
  penaltiesMissed:   number   // spot-kicks taken and NOT scored (saved or off target)
  ownGoals:          number   // put into their own net — counts for the OPPOSITION
  penaltiesWon:      number   // fouled for a penalty their side took
  errorsLeadingToGoal: number // mistake that directly led to a goal against
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
  dribblesAttempted: number // §10.5 — with `dribbles`, gives a success rate
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
  // §10.5 phase 4 — went off injured. `subOffMinute` is the minute he limped
  // off; `matchdaysOut` is how long he'll be missing, which is what the
  // availability ledger turns into absences for the matches after this one.
  injured?:       boolean
  matchdaysOut?:  number
  // keeper-only
  gk?: PlayerGkLine
}

// ── Events timeline ─────────────────────────────────────────────────────────
export type MatchEventType = 'goal' | 'yellow' | 'red' | 'sub' | 'penMissed' | 'injury'

// `isHome` is always the side the event COUNTS FOR — for an own goal that's the
// benefiting team, even though `playerId`/`playerName` name an opponent. The
// timeline renders the OG on the scoring side's row with an "Own goal" label,
// which is the only reading that doesn't look like the conceding team scored.
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
  ownGoal?:    boolean     // §9 — playerName is an OPPOSITION player
  penalty?:    boolean     // §9 — converted from the spot
  penWonId?:   string      // §9 — drew the penalty (benefiting side, ≠ taker)
  penWonName?: string
  errorById?:   string     // §9 — conceding-side mistake that led to this goal
  errorByName?: string
  // penMissed extras — `isHome` is the side that TOOK (and missed) the kick,
  // `playerName` the taker. Saved kicks name the keeper who kept it out.
  saved?:        boolean   // true = keeper save, false = off target / woodwork
  keeperId?:     string
  keeperName?:   string
  // sub extras (player going OFF)
  offPlayerId?:   string
  offPlayerName?: string
  /** §10.5 — a change made at the interval rather than in one of the three
   *  in-play windows. Rendered as its own beat, because that's how it reads. */
  halfTime?:      boolean
  /** §10.5 phase 4 — an UNPLANNED change: somebody got injured, so this one
   *  wasn't tactical and it still ate one of the side's substitutions. */
  forced?:        boolean
  /** `injury` events only — matchdays the player is now out for. */
  matchdaysOut?:  number
  /** `injury` events only — false when the side had no bench left and had to
   *  play the rest of the match a man short. */
  replaced?:      boolean
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
  // §8 Match Momentum — one signed value per minute, index 0 = minute 1, so
  // `momentum.length === duration`. Sign picks the team (+ home / − away) and
  // magnitude 0…100 is the intensity, 100 being a side utterly on top. Derived
  // LAST, from the goals and the generated stats, so it can never contradict
  // the rest of the sheet; regenerated from the same seed like everything else.
  momentum:   number[]
  // §10 R4 — stoppage time shown per half, not as one lump. Extra-time halves
  // are only present on a 120' match. Always ≥ the largest `plus` on any event
  // in that half, so a 90+4 goal can never sit outside the added time shown.
  addedTime:  AddedTime
  // Absent for YOUR club (you drafted that XI, it isn't selected) and for
  // legacy matches generated without a seed.
  homeShape?: LineupShape
  awayShape?: LineupShape
  // §10.5 — the OVR each side actually played at: rotation drop (floored),
  // plus the point-per-substitute recovery. What decided the scoreline.
  homeMatchOvr?: number
  awayMatchOvr?: number
}

// §10.5 — the formation a side actually lined up in, so the pitch view can put
// each player in their slot. Only the shape is stored; every number about the
// player is looked up in `players` by id, so there's one source of truth.
export type LineupShape = {
  formation: string
  slots: { label: string; playerId: string }[]   // 11, in formation order
  rotated: number                                // first-choice players rested
}

export type AddedTime = {
  firstHalf:  number   // minutes added at 45'
  secondHalf: number   // minutes added at 90'
  firstET?:   number   // added at 105' (120' matches only)
  secondET?:  number   // added at 120'
}
