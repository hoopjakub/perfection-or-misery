// Post-process a completed run into player/team stats + awards.
// Works off the stored match results (no need to wire into the live sim loop),
// so the same path serves real runs, the quick-sim tester, and history loads.

import type { RosterPlayer, CompetitionStats, SeasonAwards, MatchScorers, GoalEvent } from '@/types/stats'
import type { DraftedPlayer } from '@/types/game'
import {
  attributeMatchScorers, createStatsAccumulator, computeAwards, buildClubGKMap,
} from './stats'
import { getRostersForClubs } from '@/db/queries/seasons'
import type { SeasonResult } from '@/types/simulation'
import type { LeagueSeason } from '@/types/game'
import type { CLSeasonResult } from '@/engine/cl-sim'
import type { WCSeasonResult } from '@/engine/world-cup-sim'
import type { QualTie } from '@/engine/cl-qualifying'

export type LeaguePools = {
  poolByClub:   Map<string, RosterPlayer[]>
  playerClubId: string
}

// Load attribution pools for a league field: DB rosters for opponents + your XI.
export async function loadLeaguePools(
  teams: { clubId: string; clubName: string; isPlayer: boolean }[],
  drafted: DraftedPlayer[],
  yearStart: number,
): Promise<LeaguePools> {
  // The player may not be in this field (custom UCL: eliminated in qualifying /
  // never qualified) — fall back to real scraped rosters for every club.
  const playerClub = teams.find(t => t.isPlayer)
  const rosters    = await getRostersForClubs(teams.map(t => t.clubId), yearStart)
  const poolByClub = new Map(rosters)
  if (playerClub) {
    poolByClub.set(playerClub.clubId, draftedToPool(drafted, playerClub.clubId, playerClub.clubName, yearStart))
  }
  return { poolByClub, playerClubId: playerClub?.clubId ?? '' }
}

// "Haaland 23', 67', Foden 81'" — groups a side's goals by scorer, with minutes.
export function summariseScorers(events?: GoalEvent[]): string {
  if (!events || events.length === 0) return ''
  const byScorer = new Map<string, { name: string; mins: string[] }>()
  for (const e of events) {
    const cur = byScorer.get(e.scorerId) ?? { name: e.scorerName.split(' ').slice(-1)[0], mins: [] }
    cur.mins.push(`${e.minute}${e.plus ? `+${e.plus}` : ''}'`)
    byScorer.set(e.scorerId, cur)
  }
  return [...byScorer.values()].map(s => `${s.name} ${s.mins.join(', ')}`).join(', ')
}

// Attribute one match's scorers from the pools (used live, during the sim).
export function attributeFixtureScorers(
  poolByClub: Map<string, RosterPlayer[]>,
  homeClubId: string, awayClubId: string,
  homeGoals: number, awayGoals: number, extraTime = false, etOnly = false,
): MatchScorers {
  return attributeMatchScorers(
    poolByClub.get(homeClubId) ?? [], poolByClub.get(awayClubId) ?? [],
    homeGoals, awayGoals, { extraTime, etOnly },
  )
}

// Merge two scorer sets that share the same home/away orientation (e.g. a second
// leg's regulation scorers + its extra-time scorers) into one for stats totals.
function mergeScorers(a?: MatchScorers, b?: MatchScorers): MatchScorers | undefined {
  if (!a && !b) return undefined
  return { home: [...(a?.home ?? []), ...(b?.home ?? [])], away: [...(a?.away ?? []), ...(b?.away ?? [])] }
}

export type RunMatch = {
  homeClubId:   string
  awayClubId:   string
  homeClubName: string
  awayClubName: string
  homeGoals:    number
  awayGoals:    number
  extraTime?:   boolean
  scorers?:     MatchScorers   // if already attributed (during sim), reuse — keeps it deterministic
}

export type ComputeRunStatsParams = {
  matches:             RunMatch[]
  rosters:             Map<string, RosterPlayer[]>  // opponent DB rosters (per club)
  playerPool:          RosterPlayer[]               // your drafted XI as RosterPlayers
  playerClubId:        string
  finalPositionByClub: Map<string, number>
  teamsInComp:         number
}

export function computeRunStats(p: ComputeRunStatsParams): { stats: CompetitionStats; awards: SeasonAwards } {
  // The player's club id maps to the original (replaced) club; use the drafted
  // XI as its pool instead of the DB roster.
  const poolByClub = new Map(p.rosters)
  poolByClub.set(p.playerClubId, p.playerPool)

  const rosterIndex = new Map<string, RosterPlayer>()
  for (const pool of poolByClub.values()) for (const rp of pool) rosterIndex.set(rp.playerId, rp)
  const clubGK = buildClubGKMap(poolByClub)

  const acc = createStatsAccumulator({
    rosterIndex, clubGK, playerPool: p.playerPool, playerClubId: p.playerClubId,
  })

  for (const m of p.matches) {
    const homePool = poolByClub.get(m.homeClubId) ?? []
    const awayPool = poolByClub.get(m.awayClubId) ?? []
    // Reuse scorers attributed during the sim (deterministic); attribute only as a fallback.
    const scorers: MatchScorers = m.scorers ?? attributeMatchScorers(
      homePool, awayPool, m.homeGoals, m.awayGoals, { extraTime: m.extraTime },
    )
    acc.recordMatch({
      homeClubId: m.homeClubId, awayClubId: m.awayClubId,
      homeClubName: m.homeClubName, awayClubName: m.awayClubName,
      homeGoals: m.homeGoals, awayGoals: m.awayGoals, scorers,
    })
  }

  const stats = acc.build()
  const awards = computeAwards(stats, {
    rosterIndex, finalPositionByClub: p.finalPositionByClub, teamsInComp: p.teamsInComp,
  })
  return { stats, awards }
}

// One-call league stats: fetch rosters, reuse stored scorers, aggregate + awards.
// Deterministic (uses the scorers attributed during the sim), so result and stats
// screens both call this and get identical numbers.
export async function computeLeagueRunStats(
  simResult: SeasonResult,
  draftedPlayers: DraftedPlayer[],
  placedLeague: LeagueSeason,
): Promise<{ stats: CompetitionStats; awards: SeasonAwards } | null> {
  const table = simResult.table
  const playerClub = table.find(t => t.isPlayer)
  if (!playerClub) return null
  const yearStart = placedLeague.yearStart
  const rosters    = await getRostersForClubs(table.map(t => t.clubId), yearStart)
  const playerPool = draftedToPool(draftedPlayers, playerClub.clubId, playerClub.clubName, yearStart)
  const matches: RunMatch[] = (simResult.matchdayHistory ?? []).flatMap(s =>
    s.fixtures.filter(f => f.result).map(f => ({
      homeClubId: (f.home as any).clubId, awayClubId: (f.away as any).clubId,
      homeClubName: f.home.clubName, awayClubName: f.away.clubName,
      homeGoals: f.result!.homeGoals, awayGoals: f.result!.awayGoals,
      scorers: f.scorers,
    })))
  const finalPositionByClub = new Map(table.map((t, i) => [t.clubId, i + 1]))
  return computeRunStats({
    matches, rosters, playerPool, playerClubId: playerClub.clubId,
    finalPositionByClub, teamsInComp: simResult.teamsInLeague,
  })
}

// Attribute + STORE scorers on every CL match (league phase + both knockout legs
// + final). Called once when the result is created, so all later views are
// deterministic and consistent.
// Idempotent: only attributes matches that don't already carry scorers, so a
// live attribution done during the sim is never overwritten (keeps the live
// reveal and the result screen identical).
export function attributeCLResultScorers(result: CLSeasonResult, poolByClub: Map<string, RosterPlayer[]>) {
  for (const m of result.leagueMatchdays ?? [])
    if (!m.scorers) m.scorers = attributeFixtureScorers(poolByClub, m.home.clubId, m.away.clubId, m.homeGoals, m.awayGoals)
  for (const k of [...result.playoffRound, ...result.r16, ...result.qf, ...result.sf]) {
    if (k.leg1 && !k.leg1Scorers) k.leg1Scorers = attributeFixtureScorers(poolByClub, k.teamA.clubId, k.teamB.clubId, k.leg1.aGoals, k.leg1.bGoals)
    // Leg 2 REGULATION only — always 1..90 (never pass extraTime here, or a 90'
    // goal gets stamped 112'). Extra-time goals are attributed separately below.
    if (k.leg2 && !k.leg2Scorers) k.leg2Scorers = attributeFixtureScorers(poolByClub, k.teamB.clubId, k.teamA.clubId, k.leg2.bGoals, k.leg2.aGoals)
    if (k.leg2ExtraTime && !k.leg2ExtraTimeScorers && (k.leg2ExtraTime.aGoals > 0 || k.leg2ExtraTime.bGoals > 0))
      k.leg2ExtraTimeScorers = attributeFixtureScorers(poolByClub, k.teamB.clubId, k.teamA.clubId, k.leg2ExtraTime.bGoals, k.leg2ExtraTime.aGoals, false, true)
  }
  if (result.final && !result.final.leg1Scorers) result.final.leg1Scorers = attributeFixtureScorers(poolByClub, result.final.teamA.clubId, result.final.teamB.clubId, result.final.aGoals, result.final.bGoals, result.final.extraTime)
}

// Attribute + STORE scorers on every qualifying tie (custom UCL path) — same
// attribute-once rule, so the tie detail modal, stats and awards all agree.
export function attributeQualTieScorers(ties: QualTie[], poolByClub: Map<string, RosterPlayer[]>) {
  for (const t of ties) {
    if (!t.teamB || !t.legs) continue
    const l = t.legs
    if (!t.leg1Scorers) t.leg1Scorers = attributeFixtureScorers(poolByClub, t.teamA.clubId, t.teamB.clubId, l.leg1.homeGoals, l.leg1.awayGoals)
    if (!t.leg2Scorers) t.leg2Scorers = attributeFixtureScorers(poolByClub, t.teamB.clubId, t.teamA.clubId, l.leg2.homeGoals, l.leg2.awayGoals)
    if (l.leg2ExtraTime && !t.leg2ExtraTimeScorers && (l.leg2ExtraTime.homeGoals > 0 || l.leg2ExtraTime.awayGoals > 0))
      t.leg2ExtraTimeScorers = attributeFixtureScorers(poolByClub, t.teamB.clubId, t.teamA.clubId, l.leg2ExtraTime.homeGoals, l.leg2ExtraTime.awayGoals, false, true)
  }
}

export function attributeWCResultScorers(result: WCSeasonResult, poolByClub: Map<string, RosterPlayer[]>) {
  for (const m of result.groupMatchdays ?? [])
    if (!m.scorers) m.scorers = attributeFixtureScorers(poolByClub, m.home.clubId, m.away.clubId, m.homeGoals, m.awayGoals)
  for (const round of result.knockoutRounds) for (const k of round.matches)
    if (!k.scorers) k.scorers = attributeFixtureScorers(poolByClub, k.teamA.clubId, k.teamB.clubId, k.result.homeGoals, k.result.awayGoals, k.result.extraTime)
}

// ── Champions League ────────────────────────────────────────────────────────
// `qualTies` (custom path): the qualifying-round ties count toward stats/awards
// too — the whole competition, not just the league phase + knockouts.
export async function computeCLRunStats(
  result: CLSeasonResult, draftedPlayers: DraftedPlayer[], yearStart = 2025, qualTies?: QualTie[],
): Promise<{ stats: CompetitionStats; awards: SeasonAwards } | null> {
  const standings = result.leaguePhaseStandings
  if (!standings?.length) return null
  const playerClubId = result.playerTeam.clubId
  const clubIds = new Set(standings.map(t => t.clubId))
  for (const t of qualTies ?? []) { clubIds.add(t.teamA.clubId); if (t.teamB) clubIds.add(t.teamB.clubId) }
  const rosters    = await getRostersForClubs([...clubIds], yearStart)
  const playerPool = draftedToPool(draftedPlayers, playerClubId, result.playerTeam.clubName, yearStart)

  const matches: RunMatch[] = []
  // Qualifying ties (both legs + ET, same folding as the knockout legs below).
  for (const t of qualTies ?? []) {
    if (!t.teamB || !t.legs) continue
    const l = t.legs
    matches.push({ homeClubId: t.teamA.clubId, awayClubId: t.teamB.clubId, homeClubName: t.teamA.clubName, awayClubName: t.teamB.clubName, homeGoals: l.leg1.homeGoals, awayGoals: l.leg1.awayGoals, scorers: t.leg1Scorers })
    const etH = l.leg2ExtraTime?.homeGoals ?? 0, etA = l.leg2ExtraTime?.awayGoals ?? 0
    matches.push({ homeClubId: t.teamB.clubId, awayClubId: t.teamA.clubId, homeClubName: t.teamB.clubName, awayClubName: t.teamA.clubName, homeGoals: l.leg2.homeGoals + etH, awayGoals: l.leg2.awayGoals + etA, scorers: mergeScorers(t.leg2Scorers, t.leg2ExtraTimeScorers) })
  }
  for (const m of result.leagueMatchdays ?? [])
    matches.push({ homeClubId: m.home.clubId, awayClubId: m.away.clubId, homeClubName: m.home.clubName, awayClubName: m.away.clubName, homeGoals: m.homeGoals, awayGoals: m.awayGoals, scorers: m.scorers })
  // two-legged ties → two matches (shootout pens are excluded — leg scores are 90'/ET only)
  for (const k of [...result.playoffRound, ...result.r16, ...result.qf, ...result.sf]) {
    if (k.leg1) matches.push({ homeClubId: k.teamA.clubId, awayClubId: k.teamB.clubId, homeClubName: k.teamA.clubName, awayClubName: k.teamB.clubName, homeGoals: k.leg1.aGoals, awayGoals: k.leg1.bGoals, scorers: k.leg1Scorers })
    // Leg 2 = regulation + extra time folded together (one match, so clean sheets
    // and match counts stay right), with both scorer sets merged for totals.
    if (k.leg2) {
      const etB = k.leg2ExtraTime?.bGoals ?? 0, etA = k.leg2ExtraTime?.aGoals ?? 0
      matches.push({ homeClubId: k.teamB.clubId, awayClubId: k.teamA.clubId, homeClubName: k.teamB.clubName, awayClubName: k.teamA.clubName, homeGoals: k.leg2.bGoals + etB, awayGoals: k.leg2.aGoals + etA, scorers: mergeScorers(k.leg2Scorers, k.leg2ExtraTimeScorers) })
    }
  }
  if (result.final)
    matches.push({ homeClubId: result.final.teamA.clubId, awayClubId: result.final.teamB.clubId, homeClubName: result.final.teamA.clubName, awayClubName: result.final.teamB.clubName, homeGoals: result.final.aGoals, awayGoals: result.final.bGoals, extraTime: result.final.extraTime, scorers: result.final.leg1Scorers })

  const finalPositionByClub = new Map(standings.map((t, i) => [t.clubId, i + 1]))
  return computeRunStats({ matches, rosters, playerPool, playerClubId, finalPositionByClub, teamsInComp: standings.length })
}

// ── World Cup ───────────────────────────────────────────────────────────────
const WC_ROUND_POS: Record<string, number> = { r32: 17, r16: 9, qf: 5, sf: 3, final: 2 }

export async function computeWCRunStats(
  result: WCSeasonResult, draftedPlayers: DraftedPlayer[], yearStart = 2026,
): Promise<{ stats: CompetitionStats; awards: SeasonAwards } | null> {
  const allTeams = result.groups.flatMap(g => g.teams)
  if (!allTeams.length) return null
  const playerClubId = result.playerTeam.clubId
  const rosters    = await getRostersForClubs(allTeams.map(t => t.clubId), yearStart)
  const playerPool = draftedToPool(draftedPlayers, playerClubId, result.playerTeam.clubName, yearStart)

  const matches: RunMatch[] = []
  for (const m of result.groupMatchdays ?? [])
    matches.push({ homeClubId: m.home.clubId, awayClubId: m.away.clubId, homeClubName: m.home.clubName, awayClubName: m.away.clubName, homeGoals: m.homeGoals, awayGoals: m.awayGoals, scorers: m.scorers })
  for (const round of result.knockoutRounds) for (const k of round.matches)
    matches.push({ homeClubId: k.teamA.clubId, awayClubId: k.teamB.clubId, homeClubName: k.teamA.clubName, awayClubName: k.teamB.clubName, homeGoals: k.result.homeGoals, awayGoals: k.result.awayGoals, extraTime: k.result.extraTime, scorers: k.scorers })

  // Final-position proxy from how far each team went (drives the award carry modifier).
  const pos = new Map<string, number>()
  for (const round of result.knockoutRounds) for (const k of round.matches) {
    const loser = k.winner.clubId === k.teamA.clubId ? k.teamB : k.teamA
    pos.set(loser.clubId, WC_ROUND_POS[round.round] ?? 33)
  }
  if (result.winner) pos.set(result.winner.clubId, 1)
  for (const t of allTeams) if (!pos.has(t.clubId)) pos.set(t.clubId, 33)

  return computeRunStats({ matches, rosters, playerPool, playerClubId, finalPositionByClub: pos, teamsInComp: allTeams.length })
}

// Turn the drafted XI into RosterPlayers for attribution (their club is yours).
export function draftedToPool(
  drafted: DraftedPlayer[],
  playerClubId: string,
  playerClubName: string,
  yearStart: number,
): RosterPlayer[] {
  const label = `${String(yearStart).slice(-2)}/${String(yearStart + 1).slice(-2)}`
  return drafted.map(d => ({
    playerId:        d.playerId,
    name:            d.name,
    primaryPosition: d.primaryPosition,
    attack:          d.ovr,            // no per-attribute split for drafted players
    ovr:             d.ovr,
    birthYear:       d.birthYear ?? null,
    yearStart:       d.yearStart ?? yearStart,
    seasonLabel:     d.season || label,
    clubId:          playerClubId,
    clubName:        playerClubName,
  }))
}
