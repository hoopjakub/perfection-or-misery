// Player & match statistics engine — pure, deterministic-at-call-time logic.
// Scorers are ATTRIBUTED after a scoreline is decided (the match engine has no
// individual-player sim). See docs/"Major Overhaul + Bug fixes.md".

import type {
  RosterPlayer, GoalEvent, MatchScorers, PlayerStatLine, TeamGoalRecord,
  CompetitionStats, AwardCandidate, SeasonAwards,
} from '@/types/stats'

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

function scoreWeight(p: RosterPlayer): number {
  const base = SCORE_WEIGHT[p.primaryPosition] ?? 0.3
  const atk  = p.attack || p.ovr || 60
  return base * (1 + atk / 100)
}
function assistWeight(p: RosterPlayer): number {
  const base = ASSIST_WEIGHT[p.primaryPosition] ?? 0.4
  const atk  = p.attack || p.ovr || 60
  return base * (1 + atk / 100)
}

function weightedPick(
  pool: RosterPlayer[],
  weightOf: (p: RosterPlayer) => number,
  excludeId?: string,
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
    return fallback.length ? fallback[Math.floor(Math.random() * fallback.length)] : null
  }
  let roll = Math.random() * total
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i]
    if (roll <= 0) return pool[i]
  }
  return pool[pool.length - 1]
}

// ── Minutes ─────────────────────────────────────────────────────────────────
// Pick `count` distinct minutes within [lo, hi] (a phase of the match).
function sampleMinutes(count: number, lo: number, hi: number): number[] {
  if (count <= 0) return []
  const slots: number[] = []
  for (let m = lo; m <= hi; m++) slots.push(m)
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[slots[i], slots[j]] = [slots[j], slots[i]]
  }
  return slots.slice(0, Math.min(count, slots.length)).sort((a, b) => a - b)
}

// Turn raw minute numbers into events, with occasional stoppage-time drama.
function toMinuteEvents(minutes: number[], extraTime: boolean): { minute: number; plus?: number }[] {
  return minutes.map(m => {
    if (m >= 89 && m <= 90 && Math.random() < 0.45) return { minute: 90, plus: 1 + Math.floor(Math.random() * 5) }
    if (m >= 119 && m <= 120 && extraTime && Math.random() < 0.35) return { minute: 120, plus: 1 + Math.floor(Math.random() * 4) }
    return { minute: m }
  })
}

// Build each side's goal minutes. For a tie that went to extra time the score
// MUST have been level after 90' — so both sides score the same number of goals
// in regulation (1..90) and only the surplus falls in extra time (91..120).
// This kills the "USA 3-5 Mexico AET with all goals in the first half" nonsense.
function buildSideMinutes(homeGoals: number, awayGoals: number, extraTime: boolean, etOnly = false) {
  // ET-only phase (e.g. the extra-time period of a two-legged tie's second leg):
  // every goal here happened in 91..120 by definition.
  if (etOnly) {
    return {
      home: toMinuteEvents(sampleMinutes(homeGoals, 91, 120), true),
      away: toMinuteEvents(sampleMinutes(awayGoals, 91, 120), true),
    }
  }
  if (!extraTime) {
    return {
      home: toMinuteEvents(sampleMinutes(homeGoals, 1, 90), false),
      away: toMinuteEvents(sampleMinutes(awayGoals, 1, 90), false),
    }
  }
  // Level-at-90 count: the matched goals both teams had at full time. Taking the
  // minimum keeps extra-time goals to just the deciding margin (most realistic).
  const level = Math.min(homeGoals, awayGoals)
  const homeMins = [...sampleMinutes(level, 1, 90), ...sampleMinutes(homeGoals - level, 91, 120)].sort((a, b) => a - b)
  const awayMins = [...sampleMinutes(level, 1, 90), ...sampleMinutes(awayGoals - level, 91, 120)].sort((a, b) => a - b)
  return { home: toMinuteEvents(homeMins, true), away: toMinuteEvents(awayMins, true) }
}

export type AttributeOpts = { extraTime?: boolean; etOnly?: boolean }

// Attribute goal events to a match given each side's scorer pool + the scoreline.
export function attributeMatchScorers(
  homePool: RosterPlayer[],
  awayPool: RosterPlayer[],
  homeGoals: number,
  awayGoals: number,
  opts: AttributeOpts = {},
): MatchScorers {
  const total = homeGoals + awayGoals
  if (total === 0) return { home: [], away: [] }

  const mins = buildSideMinutes(homeGoals, awayGoals, !!opts.extraTime, !!opts.etOnly)

  const buildSide = (pool: RosterPlayer[], minuteEvents: { minute: number; plus?: number }[]): GoalEvent[] => {
    if (pool.length === 0) return []
    const out: GoalEvent[] = []
    for (const mm of minuteEvents) {
      const scorer = weightedPick(pool, scoreWeight)
      if (!scorer) continue
      const ev: GoalEvent = {
        clubId:     scorer.clubId,
        scorerId:   scorer.playerId,
        scorerName: scorer.name,
        minute:     mm.minute,
        plus:       mm.plus,
      }
      if (Math.random() < ASSIST_RATE) {
        const assister = weightedPick(pool, assistWeight, scorer.playerId)
        if (assister) { ev.assistId = assister.playerId; ev.assistName = assister.name }
      }
      out.push(ev)
    }
    return out
  }

  const byMinute = (a: GoalEvent, b: GoalEvent) =>
    (a.minute + (a.plus ?? 0) / 100) - (b.minute + (b.plus ?? 0) / 100)
  return {
    home: buildSide(homePool, mins.home).sort(byMinute),
    away: buildSide(awayPool, mins.away).sort(byMinute),
  }
}

// ── Aggregation ─────────────────────────────────────────────────────────────
export type AccumulatorCtx = {
  rosterIndex: Map<string, RosterPlayer>   // playerId → RosterPlayer (for resolving lines)
  clubGK:      Map<string, RosterPlayer>   // clubId → that club's keeper (clean sheets)
  playerPool?: RosterPlayer[]              // your XI — pre-registered so all appear
  playerClubId?: string
}

export type StatsAccumulator = {
  recordMatch: (m: {
    homeClubId: string; awayClubId: string
    homeClubName: string; awayClubName: string
    homeGoals: number; awayGoals: number
    scorers: MatchScorers
  }) => void
  build: () => CompetitionStats
}

export function createStatsAccumulator(ctx: AccumulatorCtx): StatsAccumulator {
  const players = new Map<string, PlayerStatLine>()
  const teams   = new Map<string, TeamGoalRecord>()
  const clubMatches = new Map<string, number>()

  function blankLine(p: RosterPlayer): PlayerStatLine {
    return {
      playerId: p.playerId, name: p.name, seasonLabel: p.seasonLabel,
      clubId: p.clubId, clubName: p.clubName, position: p.primaryPosition,
      goals: 0, assists: 0, cleanSheets: 0,
      isPlayerClub: ctx.playerClubId ? p.clubId === ctx.playerClubId : false,
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
    recordMatch({ homeClubId, awayClubId, homeClubName, awayClubName, homeGoals, awayGoals, scorers }) {
      const ht = teamFor(homeClubId, homeClubName)
      const at = teamFor(awayClubId, awayClubName)
      ht.goalsFor += homeGoals; ht.goalsAgainst += awayGoals
      at.goalsFor += awayGoals; at.goalsAgainst += homeGoals
      if (awayGoals === 0) ht.cleanSheets++
      if (homeGoals === 0) at.cleanSheets++

      clubMatches.set(homeClubId, (clubMatches.get(homeClubId) ?? 0) + 1)
      clubMatches.set(awayClubId, (clubMatches.get(awayClubId) ?? 0) + 1)

      for (const ev of [...scorers.home, ...scorers.away]) {
        const s = lineFor(ev.scorerId); if (s) s.goals++
        if (ev.assistId) { const a = lineFor(ev.assistId); if (a) a.assists++ }
      }

      // Clean sheets — credit the keeper of the side that conceded zero.
      if (awayGoals === 0) { const gk = ctx.clubGK.get(homeClubId); if (gk) { const l = lineFor(gk.playerId); if (l) l.cleanSheets++ } }
      if (homeGoals === 0) { const gk = ctx.clubGK.get(awayClubId); if (gk) { const l = lineFor(gk.playerId); if (l) l.cleanSheets++ } }
    },

    build(): CompetitionStats {
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
    const contribution = p.goals * 4 + p.assists * 3 + p.cleanSheets * 3
    const posFactor = 1 + ((finalPosition - 1) / denom) * carry
    return {
      playerId: p.playerId, name: p.name, seasonLabel: p.seasonLabel,
      clubId: p.clubId, clubName: p.clubName, position: p.position,
      age, goals: p.goals, assists: p.assists, cleanSheets: p.cleanSheets,
      finalPosition, score: Math.round(contribution * posFactor * 10) / 10,
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
