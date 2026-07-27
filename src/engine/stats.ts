// Player & match statistics engine — pure, deterministic-at-call-time logic.
// Scorers are ATTRIBUTED after a scoreline is decided (the match engine has no
// individual-player sim). See docs/"Major Overhaul + Bug fixes.md".

import type {
  RosterPlayer, GoalEvent, MatchScorers, PlayerStatLine, TeamGoalRecord,
  CompetitionStats, AwardCandidate, SeasonAwards,
} from '@/types/stats'
import { deriveSeed, type Rng } from '@/lib/rng'
import type { PlayerMatchLine } from '@/types/match-stats'
import { lineupsForMatch, type MatchLineupOpts } from './lineup'

// The extra-time segment of a knockout leg shares the leg's seed but must not
// replay the same RNG stream, or ET would re-draw regulation's scorers — so it
// gets an independently derived one. Lives here (not in run-stats) so the
// headless verifier and engine/knockout-availability can both reach it.
export const etSeed = (legSeed: number) => deriveSeed(legSeed, 0xE7)

// ── Tunable weights ─────────────────────────────────────────────────────────
// Scoring likelihood by position (GK never scores). Multiplied by (1+attack/100).
export const SCORE_WEIGHT: Record<string, number> = {
  ST: 1.0, CF: 1.0, LW: 0.8, RW: 0.8, LM: 0.5, RM: 0.5,
  CAM: 0.7, CM: 0.4, CDM: 0.3, LWB: 0.25, RWB: 0.25, LB: 0.2, RB: 0.2,
  CB: 0.15, GK: 0,
}
// Assist likelihood — creative players favoured.
export const ASSIST_WEIGHT: Record<string, number> = {
  CAM: 1.0, LW: 0.9, RW: 0.9, LM: 0.8, RM: 0.8, CM: 0.8,
  ST: 0.6, CF: 0.6, CDM: 0.4, LWB: 0.55, RWB: 0.55, LB: 0.5, RB: 0.5,
  CB: 0.15, GK: 0.02,
}
export const ASSIST_RATE = 0.8     // 80% of goals get an assist
export const CARRY_WEIGHT = 0.5    // award carry modifier (lower finish → bigger boost)

// ── §9: own goals, penalties & mistakes ─────────────────────────────────────
// Rates are per GOAL and roughly track real top-flight football, which is the
// point: these are meant to be rare, memorable beats, not a constant drip.
export const OWN_GOAL_RATE  = 0.022   // ~2% of goals — a genuine gut-punch when it lands
export const PENALTY_RATE   = 0.085   // ~8.5% of goals come from the spot
export const ERROR_RATE     = 0.07    // ~7% of goals are traced to a defensive mistake
// Spec R1: when an own goal happens the scorer is a defender 90% of the time,
// and any other position (goalkeeper included) the other 10%.
export const OWN_GOAL_DEFENDER_SHARE = 0.9

const DEFENDER_POS = new Set(['CB', 'LB', 'RB', 'LWB', 'RWB'])

// Who draws a penalty: players who carry the ball into the box.
const PEN_WON_WEIGHT: Record<string, number> = {
  ST: 1.0, CF: 1.0, LW: 0.95, RW: 0.95, CAM: 0.8, LM: 0.55, RM: 0.55,
  CM: 0.35, CDM: 0.15, LWB: 0.2, RWB: 0.2, LB: 0.15, RB: 0.15, CB: 0.12, GK: 0.01,
}
// Who makes the error that leads to a goal: the players actually handling the
// ball in dangerous areas — centre-backs and the keeper above all.
const ERROR_WEIGHT: Record<string, number> = {
  GK: 1.0, CB: 1.0, LB: 0.7, RB: 0.7, LWB: 0.6, RWB: 0.6, CDM: 0.6, CM: 0.45,
  CAM: 0.2, LM: 0.2, RM: 0.2, LW: 0.15, RW: 0.15, ST: 0.12, CF: 0.12,
}

// Attack multiplier — a power curve centred on "replacement level" (60), not
// a flat +1%/point. The old linear (1 + attack/100) only spanned ~1.4x across
// the entire realistic range (40-95), which let a high-OVR defensive mid
// (attack borrowed from OVR) sit shoulder to shoulder with an elite striker.
// This spans roughly 0.3x (poor attacking attribute) to 3x+ (Mbappé/Messi
// tier), so a real attacking-attribute gap actually shows up in who scores.
const ATTACK_BASELINE = 60
const ATTACK_CURVE = 2.5
function attackMultiplier(atk: number): number {
  return Math.pow(Math.max(1, atk) / ATTACK_BASELINE, ATTACK_CURVE)
}

// A substitute only sees a fraction of the match — roughly the back third,
// on average across a season — so their per-goal odds are cut accordingly
// rather than competing on equal footing with a player who started every game.
const BENCH_FACTOR = 0.35
// Subs come on in the SECOND HALF (45'+) — a goal (or assist) attributed to
// one before this minute would mean they scored before they were even on the
// pitch. Applies to every club's bench, not just yours, and the match-detail
// generator uses the same constant for its substitution windows.
export const SUB_MIN_MINUTE = 46

function scoreWeight(p: RosterPlayer, minute: number): number {
  if (p.isBench && minute < SUB_MIN_MINUTE) return 0
  const base = SCORE_WEIGHT[p.primaryPosition] ?? 0.3
  const atk  = p.attack || p.ovr || 60
  const w    = base * attackMultiplier(atk)
  return p.isBench ? w * BENCH_FACTOR : w
}
function assistWeight(p: RosterPlayer, minute: number): number {
  if (p.isBench && minute < SUB_MIN_MINUTE) return 0
  const base = ASSIST_WEIGHT[p.primaryPosition] ?? 0.4
  const atk  = p.attack || p.ovr || 60
  const w    = base * attackMultiplier(atk)
  return p.isBench ? w * BENCH_FACTOR : w
}
// Winning a penalty and gifting a goal away are about position and presence,
// not finishing ability — so neither is scaled by the attack curve.
function penWonWeight(p: RosterPlayer, minute: number): number {
  if (p.isBench && minute < SUB_MIN_MINUTE) return 0
  const w = PEN_WON_WEIGHT[p.primaryPosition] ?? 0.3
  return p.isBench ? w * BENCH_FACTOR : w
}
function errorWeight(p: RosterPlayer, minute: number): number {
  if (p.isBench && minute < SUB_MIN_MINUTE) return 0
  const w = ERROR_WEIGHT[p.primaryPosition] ?? 0.4
  return p.isBench ? w * BENCH_FACTOR : w
}

// The 90/10 own-goal draw (spec R1). Deliberately NOT weighted by quality — an
// own goal is bad luck, and a world-class centre-back is every bit as likely to
// turn a cross into his own net as a poor one.
function pickOwnGoalScorer(pool: RosterPlayer[], minute: number, rng: Rng): RosterPlayer | null {
  const eligible = pool.filter(p => !(p.isBench && minute < SUB_MIN_MINUTE))
  if (eligible.length === 0) return null
  const defenders = eligible.filter(p => DEFENDER_POS.has(p.primaryPosition))
  const others    = eligible.filter(p => !DEFENDER_POS.has(p.primaryPosition))
  const group = defenders.length === 0 ? others
    : others.length === 0 ? defenders
    : rng() < OWN_GOAL_DEFENDER_SHARE ? defenders : others
  return group.length ? group[Math.floor(rng() * group.length)] : null
}

function weightedPick(
  pool: RosterPlayer[],
  weightOf: (p: RosterPlayer) => number,
  excludeId: string | undefined,
  rng: Rng,
): RosterPlayer | null {
  let total = 0
  const weights: number[] = []
  for (const p of pool) {
    const w = p.playerId === excludeId ? 0 : Math.max(0, weightOf(p))
    weights.push(w); total += w
  }
  if (total <= 0) {
    // everyone weighted 0 (e.g. a pool of only GKs) — fall back to any non-excluded
    const fallback = pool.filter(p => p.playerId !== excludeId)
    return fallback.length ? fallback[Math.floor(rng() * fallback.length)] : null
  }
  let roll = rng() * total
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i]
    if (roll <= 0) return pool[i]
  }
  return pool[pool.length - 1]
}

// ── Minutes ─────────────────────────────────────────────────────────────────
// Pick `count` distinct minutes within [lo, hi] (a phase of the match).
function sampleMinutes(count: number, lo: number, hi: number, rng: Rng): number[] {
  if (count <= 0) return []
  const slots: number[] = []
  for (let m = lo; m <= hi; m++) slots.push(m)
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[slots[i], slots[j]] = [slots[j], slots[i]]
  }
  return slots.slice(0, Math.min(count, slots.length)).sort((a, b) => a - b)
}

// Turn raw minute numbers into events, with occasional stoppage-time drama.
function toMinuteEvents(minutes: number[], extraTime: boolean, rng: Rng): { minute: number; plus?: number }[] {
  return minutes.map(m => {
    if (m >= 89 && m <= 90 && rng() < 0.45) return { minute: 90, plus: 1 + Math.floor(rng() * 5) }
    if (m >= 119 && m <= 120 && extraTime && rng() < 0.35) return { minute: 120, plus: 1 + Math.floor(rng() * 4) }
    return { minute: m }
  })
}

// Build each side's goal minutes. For a tie that went to extra time the score
// MUST have been level after 90' — so both sides score the same number of goals
// in regulation (1..90) and only the surplus falls in extra time (91..120).
// This kills the "USA 3-5 Mexico AET with all goals in the first half" nonsense.
function buildSideMinutes(homeGoals: number, awayGoals: number, extraTime: boolean, etOnly: boolean, rng: Rng) {
  // ET-only phase (e.g. the extra-time period of a two-legged tie's second leg):
  // every goal here happened in 91..120 by definition.
  if (etOnly) {
    return {
      home: toMinuteEvents(sampleMinutes(homeGoals, 91, 120, rng), true, rng),
      away: toMinuteEvents(sampleMinutes(awayGoals, 91, 120, rng), true, rng),
    }
  }
  if (!extraTime) {
    return {
      home: toMinuteEvents(sampleMinutes(homeGoals, 1, 90, rng), false, rng),
      away: toMinuteEvents(sampleMinutes(awayGoals, 1, 90, rng), false, rng),
    }
  }
  // Level-at-90 count: the matched goals both teams had at full time. Taking the
  // minimum keeps extra-time goals to just the deciding margin (most realistic).
  const level = Math.min(homeGoals, awayGoals)
  const homeMins = [...sampleMinutes(level, 1, 90, rng), ...sampleMinutes(homeGoals - level, 91, 120, rng)].sort((a, b) => a - b)
  const awayMins = [...sampleMinutes(level, 1, 90, rng), ...sampleMinutes(awayGoals - level, 91, 120, rng)].sort((a, b) => a - b)
  return { home: toMinuteEvents(homeMins, true, rng), away: toMinuteEvents(awayMins, true, rng) }
}

// `rng`: pass a seeded generator (src/lib/rng.ts) to make attribution
// reproducible — the deep match-stats pipeline stores a per-match seed and
// re-derives identical scorers from it. Defaults to Math.random.
export type AttributeOpts = {
  extraTime?: boolean; etOnly?: boolean; rng?: Rng
  // §10.5 — when present, AI sides are cut down to the formation XI that
  // actually lines up, so only players on the pitch can score. Passed straight
  // through to `lineupsForMatch`, which the stat-sheet generator also calls
  // with the same seed — the two can never pick different elevens.
  lineups?: MatchLineupOpts
}

// Attribute goal events to a match given each side's scorer pool + the scoreline.
export function attributeMatchScorers(
  homePoolIn: RosterPlayer[],
  awayPoolIn: RosterPlayer[],
  homeGoals: number,
  awayGoals: number,
  opts: AttributeOpts = {},
): MatchScorers {
  const total = homeGoals + awayGoals
  if (total === 0) return { home: [], away: [] }

  const { homePool, awayPool } = opts.lineups
    ? lineupsForMatch(homePoolIn, awayPoolIn, opts.lineups)
    : { homePool: homePoolIn, awayPool: awayPoolIn }

  const rng: Rng = opts.rng ?? Math.random
  const mins = buildSideMinutes(homeGoals, awayGoals, !!opts.extraTime, !!opts.etOnly, rng)

  // `pool` is the side the goal counts for; `oppPool` is who conceded it — an
  // own-goal scorer and an error-maker are drawn from THAT squad.
  const buildSide = (
    pool: RosterPlayer[], oppPool: RosterPlayer[], minuteEvents: { minute: number; plus?: number }[],
  ): GoalEvent[] => {
    if (pool.length === 0) return []
    const out: GoalEvent[] = []
    for (const mm of minuteEvents) {
      // Flavour is rolled BEFORE the scorer draw because it decides which squad
      // the scorer even comes from. A failed own-goal draw (e.g. an empty
      // opposition pool) falls through to a normal goal — the scoreline was
      // already decided upstream, so a goal can never be dropped here.
      const ogScorer = rng() < OWN_GOAL_RATE ? pickOwnGoalScorer(oppPool, mm.minute, rng) : null
      if (ogScorer) {
        out.push({
          clubId: ogScorer.clubId, scorerId: ogScorer.playerId, scorerName: ogScorer.name,
          scorerIsBench: ogScorer.isBench, minute: mm.minute, plus: mm.plus, ownGoal: true,
        })
        continue
      }

      const isPenalty = rng() < PENALTY_RATE
      // A spot-kick is struck by a designated taker, not by whoever happened to
      // be in the box — squaring the usual weight concentrates the draw on the
      // side's genuine forwards, which is what a penalty should look like.
      const scorer = weightedPick(
        pool,
        isPenalty ? p => Math.pow(scoreWeight(p, mm.minute), 2) : p => scoreWeight(p, mm.minute),
        undefined, rng,
      )
      if (!scorer) continue
      const ev: GoalEvent = {
        clubId:     scorer.clubId,
        scorerId:   scorer.playerId,
        scorerName: scorer.name,
        scorerIsBench: scorer.isBench,
        minute:     mm.minute,
        plus:       mm.plus,
      }
      if (isPenalty) {
        ev.penalty = true
        // Excluding the taker keeps "penalty won" a genuinely separate credit
        // rather than a duplicate of the goal (spec R2).
        const won = weightedPick(pool, p => penWonWeight(p, mm.minute), scorer.playerId, rng)
        if (won) { ev.penWonId = won.playerId; ev.penWonName = won.name }
      } else if (rng() < ASSIST_RATE) {
        const assister = weightedPick(pool, p => assistWeight(p, mm.minute), scorer.playerId, rng)
        if (assister) { ev.assistId = assister.playerId; ev.assistName = assister.name; ev.assistIsBench = assister.isBench }
      }
      // A mistake is charged to the conceding side. Penalties are skipped: the
      // foul IS the error, and it's already recorded via the "penalty won" side.
      if (!isPenalty && oppPool.length > 0 && rng() < ERROR_RATE) {
        const culprit = weightedPick(oppPool, p => errorWeight(p, mm.minute), undefined, rng)
        if (culprit) { ev.errorById = culprit.playerId; ev.errorByName = culprit.name }
      }
      out.push(ev)
    }
    return out
  }

  const byMinute = (a: GoalEvent, b: GoalEvent) =>
    (a.minute + (a.plus ?? 0) / 100) - (b.minute + (b.plus ?? 0) / 100)
  return {
    home: buildSide(homePool, awayPool, mins.home).sort(byMinute),
    away: buildSide(awayPool, homePool, mins.away).sort(byMinute),
  }
}

// ── Aggregation ─────────────────────────────────────────────────────────────
export type AccumulatorCtx = {
  rosterIndex: Map<string, RosterPlayer>   // playerId → RosterPlayer (for resolving lines)
  clubGK:      Map<string, RosterPlayer>   // clubId → that club's keeper (clean sheets)
  playerPool?: RosterPlayer[]              // your XI — pre-registered so all appear
  playerClubId?: string
}

export type MatchPlayerRating = { playerId: string; rating: number; motm?: boolean }

// The PlayerStatLine keys that are plain per-season sums.
type SeasonCounter =
  | 'chancesCreated' | 'shots' | 'shotsOnTarget' | 'passes' | 'accuratePasses'
  | 'dribbles' | 'dribblesAttempted' | 'tacklesWon' | 'fouls'
  | 'yellowCards' | 'redCards'

export type StatsAccumulator = {
  recordMatch: (m: {
    homeClubId: string; awayClubId: string
    homeClubName: string; awayClubName: string
    homeGoals: number; awayGoals: number
    scorers: MatchScorers
    // §10.5 — the regenerated per-player lines for this match. Ratings, MOTM
    // AND the season counters behind the statistics screen all come off these,
    // so there's exactly one source for "what did this player do".
    lines?: PlayerMatchLine[]
  }) => void
  build: () => CompetitionStats
}

export function createStatsAccumulator(ctx: AccumulatorCtx): StatsAccumulator {
  const players = new Map<string, PlayerStatLine>()
  const teams   = new Map<string, TeamGoalRecord>()
  const clubMatches = new Map<string, number>()
  const ratingAgg = new Map<string, { sum: number; n: number; potm: number }>()

  function blankLine(p: RosterPlayer): PlayerStatLine {
    return {
      playerId: p.playerId, name: p.name, seasonLabel: p.seasonLabel,
      clubId: p.clubId, clubName: p.clubName, position: p.primaryPosition,
      goals: 0, assists: 0, cleanSheets: 0,
      isPlayerClub: ctx.playerClubId ? p.clubId === ctx.playerClubId : false,
      isBench: p.isBench,
    }
  }
  function lineFor(playerId: string): PlayerStatLine | null {
    let line = players.get(playerId)
    if (line) return line
    const p = ctx.rosterIndex.get(playerId)
    if (!p) return null
    line = blankLine(p); players.set(playerId, line); return line
  }
  function teamFor(clubId: string, clubName: string): TeamGoalRecord {
    let t = teams.get(clubId)
    if (!t) { t = { clubId, clubName, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0 }; teams.set(clubId, t) }
    return t
  }

  // Pre-register EVERY player in the competition (not just contributors), so the
  // full field is present — searchable, with 0s — and the player count is stable
  // run-to-run. (Previously only scorers/assisters/keepers + your XI appeared,
  // which made non-contributors look like they didn't exist.)
  for (const p of ctx.rosterIndex.values()) players.set(p.playerId, blankLine(p))

  return {
    recordMatch({ homeClubId, awayClubId, homeClubName, awayClubName, homeGoals, awayGoals, scorers, lines }) {
      const ht = teamFor(homeClubId, homeClubName)
      const at = teamFor(awayClubId, awayClubName)
      ht.goalsFor += homeGoals; ht.goalsAgainst += awayGoals
      at.goalsFor += awayGoals; at.goalsAgainst += homeGoals
      if (awayGoals === 0) ht.cleanSheets++
      if (homeGoals === 0) at.cleanSheets++

      clubMatches.set(homeClubId, (clubMatches.get(homeClubId) ?? 0) + 1)
      clubMatches.set(awayClubId, (clubMatches.get(awayClubId) ?? 0) + 1)

      for (const ev of [...scorers.home, ...scorers.away]) {
        const s = lineFor(ev.scorerId)
        if (s) {
          // §9 — an own goal counts for the opposition's scoreline (handled by
          // which array the event lives in) but must NEVER land on the scorer's
          // goal tally; it's recorded against them instead.
          if (ev.ownGoal) s.ownGoals = (s.ownGoals ?? 0) + 1
          else {
            s.goals++
            if (ev.penalty) s.penaltyGoals = (s.penaltyGoals ?? 0) + 1
          }
        }
        if (ev.assistId) { const a = lineFor(ev.assistId); if (a) a.assists++ }
        if (ev.penWonId) { const w = lineFor(ev.penWonId); if (w) w.penaltiesWon = (w.penaltiesWon ?? 0) + 1 }
        if (ev.errorById) { const c = lineFor(ev.errorById); if (c) c.errorsLeadingToGoal = (c.errorsLeadingToGoal ?? 0) + 1 }
      }

      // Clean sheets — credit the keeper of the side that conceded zero.
      if (awayGoals === 0) { const gk = ctx.clubGK.get(homeClubId); if (gk) { const l = lineFor(gk.playerId); if (l) l.cleanSheets++ } }
      if (homeGoals === 0) { const gk = ctx.clubGK.get(awayClubId); if (gk) { const l = lineFor(gk.playerId); if (l) l.cleanSheets++ } }

      // Deep-stats ratings — averaged in build(); MOTM counted per match.
      // Season counters are summed straight off the same lines.
      if (lines) for (const r of lines) {
        const cur = ratingAgg.get(r.playerId) ?? { sum: 0, n: 0, potm: 0 }
        cur.sum += r.rating; cur.n++
        if (r.motm) cur.potm++
        ratingAgg.set(r.playerId, cur)

        const line = lineFor(r.playerId)
        if (!line) continue
        const add = (k: SeasonCounter, v: number) => { if (v) line[k] = (line[k] ?? 0) + v }
        add('chancesCreated', r.keyPasses)
        add('shots', r.shots)
        add('shotsOnTarget', r.shotsOnTarget)
        add('passes', r.passes)
        add('accuratePasses', r.accuratePasses)
        add('dribbles', r.dribbles)
        add('dribblesAttempted', r.dribblesAttempted)
        add('tacklesWon', r.tacklesWon)
        add('fouls', r.foulsCommitted)
        add('yellowCards', r.yellowCard ? 1 : 0)
        add('redCards', r.redCard ? 1 : 0)
      }
    },

    build(): CompetitionStats {
      for (const [pid, agg] of ratingAgg) {
        const line = players.get(pid)
        if (!line || agg.n === 0) continue
        line.avgRating = Math.round((agg.sum / agg.n) * 100) / 100
        line.matchesRated = agg.n
        line.potm = agg.potm
      }
      // matches played: only meaningful for your XI (fielded every game)
      if (ctx.playerClubId) {
        const mp = clubMatches.get(ctx.playerClubId) ?? 0
        for (const line of players.values()) if (line.isPlayerClub) line.matchesPlayed = mp
      }
      const playerList = [...players.values()].sort(
        (a, b) => b.goals - a.goals || b.assists - a.assists || b.cleanSheets - a.cleanSheets,
      )
      const teamList = [...teams.values()].sort((a, b) => b.goalsFor - a.goalsFor)
      return { players: playerList, teams: teamList }
    },
  }
}

// ── Awards ──────────────────────────────────────────────────────────────────
export type AwardsCtx = {
  rosterIndex:        Map<string, RosterPlayer>
  finalPositionByClub: Map<string, number>
  teamsInComp:        number
  carryWeight?:       number
}

export function computeAwards(stats: CompetitionStats, ctx: AwardsCtx): SeasonAwards {
  const carry = ctx.carryWeight ?? CARRY_WEIGHT
  const denom = Math.max(1, ctx.teamsInComp - 1)

  const candidates: AwardCandidate[] = stats.players.map(p => {
    const rp = ctx.rosterIndex.get(p.playerId)
    const finalPosition = ctx.finalPositionByClub.get(p.clubId) ?? ctx.teamsInComp
    const age = rp?.birthYear ? rp.yearStart - rp.birthYear : null
    // Deep-stats weight: MOTMs count like big goal-contributions, and a high
    // average rating sustained over many matches earns real points on its own
    // (a 7.0-avg player over a full season ≈ a 12-goal striker) — so complete
    // performers, not just scoresheet regulars, can win POTS/U21.
    // §9 events count too: winning penalties is real end-product, while own
    // goals and errors-leading-to-goals are exactly the kind of thing that
    // should cost a player a Player-of-the-Season vote.
    const contribution = p.goals * 4 + p.assists * 3 + p.cleanSheets * 3 + (p.potm ?? 0) * 4
      + (p.penaltiesWon ?? 0) * 1.5 - (p.ownGoals ?? 0) * 3 - (p.errorsLeadingToGoal ?? 0) * 2
    const ratingPts = p.avgRating && p.matchesRated
      ? Math.max(0, p.avgRating - 6.3) * p.matchesRated * 2
      : 0
    const posFactor = 1 + ((finalPosition - 1) / denom) * carry
    return {
      playerId: p.playerId, name: p.name, seasonLabel: p.seasonLabel,
      clubId: p.clubId, clubName: p.clubName, position: p.position,
      age, goals: p.goals, assists: p.assists, cleanSheets: p.cleanSheets,
      avgRating: p.avgRating, potm: p.potm, matchesRated: p.matchesRated,
      finalPosition, score: Math.round((contribution + ratingPts) * posFactor * 10) / 10,
      isPlayerClub: p.isPlayerClub,
    }
  }).filter(c => c.score > 0)

  // Full rankings (UI shows the top few, expandable to the whole list).
  const byScore = (a: AwardCandidate, b: AwardCandidate) => b.score - a.score
  const playerOfTheSeason = [...candidates].sort(byScore)
  const bestU21 = candidates
    .filter(c => c.age != null && c.age <= 21)
    .sort(byScore)

  return { playerOfTheSeason, bestU21 }
}

// Convenience: build the keeper-per-club map (highest-OVR GK) from rosters.
export function buildClubGKMap(rosters: Map<string, RosterPlayer[]>): Map<string, RosterPlayer> {
  const map = new Map<string, RosterPlayer>()
  for (const [clubId, pool] of rosters) {
    const gks = pool.filter(p => p.primaryPosition === 'GK').sort((a, b) => b.ovr - a.ovr)
    if (gks.length) map.set(clubId, gks[0])
  }
  return map
}
