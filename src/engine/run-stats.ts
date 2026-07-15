// Post-process a completed run into player/team stats + awards.
// Works off the stored match results (no need to wire into the live sim loop),
// so the same path serves real runs, the quick-sim tester, and history loads.

import type { RosterPlayer, CompetitionStats, SeasonAwards, MatchScorers, GoalEvent } from '@/types/stats'
import type { DraftedPlayer } from '@/types/game'
import {
  attributeMatchScorers, createStatsAccumulator, computeAwards, buildClubGKMap,
} from './stats'
import { getRostersForClubs, getTopKickers } from '@/db/queries/seasons'
import { mulberry32, deriveSeed, randomSeed, hashSeed } from '@/lib/rng'
import { generateMatchDetail } from './match-detail'
import type { PlayerMatchLine } from '@/types/match-stats'
import type { SeasonResult } from '@/types/simulation'
import type { LeagueSeason } from '@/types/game'
import type { CLSeasonResult, CLKnockoutMatch } from '@/engine/cl-sim'
import type { WCSeasonResult, WCKnockoutMatch } from '@/engine/world-cup-sim'
import type { QualTie } from '@/engine/cl-qualifying'
import { expandPenaltyKicks } from '@/engine/knockout-match'

export type LeaguePools = {
  poolByClub:   Map<string, RosterPlayer[]>
  playerClubId: string
}

// Real scraped squads carry the FULL ~20-30 player roster — apply the SAME
// substitutes rule to them as the player's own squad, for symmetry: with subs
// on, everyone outside the best 11 (1 GK + top 10 by OVR) can still
// score/assist at reduced odds (see stats.ts BENCH_FACTOR); with subs off,
// only that best-11 is even in the pool, matching what the player experiences
// with no bench of their own.
function applySubstituteRule(pool: RosterPlayer[], useSubstitutes: boolean): RosterPlayer[] {
  const gks = pool.filter(p => p.primaryPosition === 'GK').sort((a, b) => b.ovr - a.ovr)
  const outfield = pool.filter(p => p.primaryPosition !== 'GK').sort((a, b) => b.ovr - a.ovr)
  const starters = [...gks.slice(0, 1), ...outfield.slice(0, 10)]
  if (!useSubstitutes) return starters
  const starterIds = new Set(starters.map(p => p.playerId))
  const bench = pool.filter(p => !starterIds.has(p.playerId)).map(p => ({ ...p, isBench: true }))
  return [...starters, ...bench]
}

// Load attribution pools for a league field: DB rosters for opponents + your XI.
export async function loadLeaguePools(
  teams: { clubId: string; clubName: string; isPlayer: boolean }[],
  drafted: DraftedPlayer[],
  yearStart: number,
  useSubstitutes = true,
): Promise<LeaguePools> {
  // The player may not be in this field (custom UCL: eliminated in qualifying /
  // never qualified) — fall back to real scraped rosters for every club.
  const playerClub = teams.find(t => t.isPlayer)
  const rosters    = await getRostersForClubs(teams.map(t => t.clubId), yearStart)
  const poolByClub = new Map(rosters)
  for (const [clubId, pool] of poolByClub) poolByClub.set(clubId, applySubstituteRule(pool, useSubstitutes))
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
// `seed` (deep-stats): attribution becomes reproducible from it — store the same
// seed on the match so the match-detail screen regenerates a consistent sheet.
export function attributeFixtureScorers(
  poolByClub: Map<string, RosterPlayer[]>,
  homeClubId: string, awayClubId: string,
  homeGoals: number, awayGoals: number, extraTime = false, etOnly = false,
  seed?: number,
): MatchScorers {
  return attributeMatchScorers(
    poolByClub.get(homeClubId) ?? [], poolByClub.get(awayClubId) ?? [],
    homeGoals, awayGoals, { extraTime, etOnly, rng: seed !== undefined ? mulberry32(seed) : undefined },
  )
}

// The ET segment of a leg shares the leg's seed but must not replay the same
// RNG stream — derive an independent one.
export const etSeed = (legSeed: number) => deriveSeed(legSeed, 0xE7)

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
  seed?:        number         // deep-stat seed — same detail as the match modal
  label?:       string         // "Matchday 12", "Quarter-final · Leg 1", … (player game log)
}

// One entry of a player's per-run game log — regenerated from seeds during
// computeRunStats, kept IN MEMORY only (never persisted; the saved run JSON
// carries just the per-player aggregates on PlayerStatLine).
export type PlayerMatchLogEntry = {
  label:        string
  opponentName: string
  isHome:       boolean
  goalsFor:     number   // their team's goals
  goalsAgainst: number
  line:         PlayerMatchLine
}
export type PlayerMatchLog = Map<string, PlayerMatchLogEntry[]>

export type ComputeRunStatsParams = {
  matches:             RunMatch[]
  rosters:             Map<string, RosterPlayer[]>  // opponent DB rosters (per club)
  playerPool:          RosterPlayer[]               // your drafted XI as RosterPlayers
  playerClubId:        string
  finalPositionByClub: Map<string, number>
  teamsInComp:         number
}

export function computeRunStats(p: ComputeRunStatsParams): { stats: CompetitionStats; awards: SeasonAwards; matchLog: PlayerMatchLog } {
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
  const matchLog: PlayerMatchLog = new Map()

  p.matches.forEach((m, idx) => {
    const homePool = poolByClub.get(m.homeClubId) ?? []
    const awayPool = poolByClub.get(m.awayClubId) ?? []
    // Reuse scorers attributed during the sim (deterministic); attribute only as a fallback.
    const scorers: MatchScorers = m.scorers ?? attributeMatchScorers(
      homePool, awayPool, m.homeGoals, m.awayGoals, { extraTime: m.extraTime },
    )
    // Full deep-stat sheet for THIS match — same seed the match-detail modal
    // uses, so the ratings aggregated here match what the modal shows.
    const detail = generateMatchDetail({
      seed: m.seed ?? hashSeed(`${m.homeClubId}|${m.awayClubId}|${m.homeGoals}|${m.awayGoals}|${idx}`),
      homePool, awayPool, homeGoals: m.homeGoals, awayGoals: m.awayGoals,
      scorers, extraTime: m.extraTime,
    })
    const played = detail?.players.filter(l => l.minutes > 0) ?? []
    acc.recordMatch({
      homeClubId: m.homeClubId, awayClubId: m.awayClubId,
      homeClubName: m.homeClubName, awayClubName: m.awayClubName,
      homeGoals: m.homeGoals, awayGoals: m.awayGoals, scorers,
      ratings: played.map(l => ({ playerId: l.playerId, rating: l.rating, motm: l.motm })),
    })
    for (const l of played) {
      const arr = matchLog.get(l.playerId) ?? []
      arr.push({
        label: m.label ?? `Match ${idx + 1}`,
        opponentName: l.isHome ? m.awayClubName : m.homeClubName,
        isHome: l.isHome,
        goalsFor: l.isHome ? m.homeGoals : m.awayGoals,
        goalsAgainst: l.isHome ? m.awayGoals : m.homeGoals,
        line: l,
      })
      matchLog.set(l.playerId, arr)
    }
  })

  const stats = acc.build()
  const awards = computeAwards(stats, {
    rosterIndex, finalPositionByClub: p.finalPositionByClub, teamsInComp: p.teamsInComp,
  })
  return { stats, awards, matchLog }
}

// One-call league stats: fetch rosters, reuse stored scorers, aggregate + awards.
// Deterministic (uses the scorers attributed during the sim), so result and stats
// screens both call this and get identical numbers.
export async function computeLeagueRunStats(
  simResult: SeasonResult,
  draftedPlayers: DraftedPlayer[],
  placedLeague: LeagueSeason,
  useSubstitutes = true,
): Promise<{ stats: CompetitionStats; awards: SeasonAwards; matchLog: PlayerMatchLog } | null> {
  const table = simResult.table
  const playerClub = table.find(t => t.isPlayer)
  if (!playerClub) return null
  const yearStart = placedLeague.yearStart
  const rosters    = await getRostersForClubs(table.map(t => t.clubId), yearStart)
  for (const [clubId, pool] of rosters) rosters.set(clubId, applySubstituteRule(pool, useSubstitutes))
  const playerPool = draftedToPool(draftedPlayers, playerClub.clubId, playerClub.clubName, yearStart)
  const matches: RunMatch[] = (simResult.matchdayHistory ?? []).flatMap(s =>
    s.fixtures.filter(f => f.result).map(f => ({
      homeClubId: (f.home as any).clubId, awayClubId: (f.away as any).clubId,
      homeClubName: f.home.clubName, awayClubName: f.away.clubName,
      homeGoals: f.result!.homeGoals, awayGoals: f.result!.awayGoals,
      scorers: f.scorers, seed: f.seed, label: `Matchday ${s.matchday}`,
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
  for (const m of result.leagueMatchdays ?? []) {
    if (m.seed === undefined) m.seed = randomSeed()
    if (!m.scorers) m.scorers = attributeFixtureScorers(poolByClub, m.home.clubId, m.away.clubId, m.homeGoals, m.awayGoals, false, false, m.seed)
  }
  for (const k of [...result.playoffRound, ...result.r16, ...result.qf, ...result.sf]) {
    if (k.leg1Seed === undefined) k.leg1Seed = randomSeed()
    if (k.leg2Seed === undefined) k.leg2Seed = randomSeed()
    if (k.leg1 && !k.leg1Scorers) k.leg1Scorers = attributeFixtureScorers(poolByClub, k.teamA.clubId, k.teamB.clubId, k.leg1.aGoals, k.leg1.bGoals, false, false, k.leg1Seed)
    // Leg 2 REGULATION only — always 1..90 (never pass extraTime here, or a 90'
    // goal gets stamped 112'). Extra-time goals are attributed separately below.
    if (k.leg2 && !k.leg2Scorers) k.leg2Scorers = attributeFixtureScorers(poolByClub, k.teamB.clubId, k.teamA.clubId, k.leg2.bGoals, k.leg2.aGoals, false, false, k.leg2Seed)
    if (k.leg2ExtraTime && !k.leg2ExtraTimeScorers && (k.leg2ExtraTime.aGoals > 0 || k.leg2ExtraTime.bGoals > 0))
      k.leg2ExtraTimeScorers = attributeFixtureScorers(poolByClub, k.teamB.clubId, k.teamA.clubId, k.leg2ExtraTime.bGoals, k.leg2ExtraTime.aGoals, false, true, etSeed(k.leg2Seed))
  }
  if (result.final) {
    if (result.final.leg1Seed === undefined) result.final.leg1Seed = randomSeed()
    if (!result.final.leg1Scorers) result.final.leg1Scorers = attributeFixtureScorers(poolByClub, result.final.teamA.clubId, result.final.teamB.clubId, result.final.aGoals, result.final.bGoals, result.final.extraTime, false, result.final.leg1Seed)
  }
}

// Attribute + STORE scorers on every qualifying tie (custom UCL path) — same
// attribute-once rule, so the tie detail modal, stats and awards all agree.
export function attributeQualTieScorers(ties: QualTie[], poolByClub: Map<string, RosterPlayer[]>) {
  for (const t of ties) {
    if (!t.teamB || !t.legs) continue
    const l = t.legs
    if (t.leg1Seed === undefined) t.leg1Seed = randomSeed()
    if (t.leg2Seed === undefined) t.leg2Seed = randomSeed()
    if (!t.leg1Scorers) t.leg1Scorers = attributeFixtureScorers(poolByClub, t.teamA.clubId, t.teamB.clubId, l.leg1.homeGoals, l.leg1.awayGoals, false, false, t.leg1Seed)
    if (!t.leg2Scorers) t.leg2Scorers = attributeFixtureScorers(poolByClub, t.teamB.clubId, t.teamA.clubId, l.leg2.homeGoals, l.leg2.awayGoals, false, false, t.leg2Seed)
    if (l.leg2ExtraTime && !t.leg2ExtraTimeScorers && (l.leg2ExtraTime.homeGoals > 0 || l.leg2ExtraTime.awayGoals > 0))
      t.leg2ExtraTimeScorers = attributeFixtureScorers(poolByClub, t.teamB.clubId, t.teamA.clubId, l.leg2ExtraTime.homeGoals, l.leg2ExtraTime.awayGoals, false, true, etSeed(t.leg2Seed))
  }
}

export function attributeWCResultScorers(result: WCSeasonResult, poolByClub: Map<string, RosterPlayer[]>) {
  for (const m of result.groupMatchdays ?? []) {
    if (m.seed === undefined) m.seed = randomSeed()
    if (!m.scorers) m.scorers = attributeFixtureScorers(poolByClub, m.home.clubId, m.away.clubId, m.homeGoals, m.awayGoals, false, false, m.seed)
  }
  for (const round of result.knockoutRounds) for (const k of round.matches) {
    if (k.seed === undefined) k.seed = randomSeed()
    if (!k.scorers) k.scorers = attributeFixtureScorers(poolByClub, k.teamA.clubId, k.teamB.clubId, k.result.homeGoals, k.result.awayGoals, k.result.extraTime, false, k.seed)
  }
}

// ── Champions League ────────────────────────────────────────────────────────
// `qualTies` (custom path): the qualifying-round ties count toward stats/awards
// too — the whole competition, not just the league phase + knockouts.
const CL_ROUND_LABEL: Record<string, string> = {
  playoff: 'Playoff', r16: 'Round of 16', qf: 'Quarter-final', sf: 'Semi-final', final: 'Final',
}

export async function computeCLRunStats(
  result: CLSeasonResult, draftedPlayers: DraftedPlayer[], yearStart = 2025, qualTies?: QualTie[], useSubstitutes = true,
): Promise<{ stats: CompetitionStats; awards: SeasonAwards; matchLog: PlayerMatchLog } | null> {
  const standings = result.leaguePhaseStandings
  if (!standings?.length) return null
  const playerClubId = result.playerTeam.clubId
  const clubIds = new Set(standings.map(t => t.clubId))
  for (const t of qualTies ?? []) { clubIds.add(t.teamA.clubId); if (t.teamB) clubIds.add(t.teamB.clubId) }
  const rosters    = await getRostersForClubs([...clubIds], yearStart)
  for (const [clubId, pool] of rosters) rosters.set(clubId, applySubstituteRule(pool, useSubstitutes))
  const playerPool = draftedToPool(draftedPlayers, playerClubId, result.playerTeam.clubName, yearStart)

  const matches: RunMatch[] = []
  // Qualifying ties (both legs + ET, same folding as the knockout legs below).
  for (const t of qualTies ?? []) {
    if (!t.teamB || !t.legs) continue
    const l = t.legs
    matches.push({ homeClubId: t.teamA.clubId, awayClubId: t.teamB.clubId, homeClubName: t.teamA.clubName, awayClubName: t.teamB.clubName, homeGoals: l.leg1.homeGoals, awayGoals: l.leg1.awayGoals, scorers: t.leg1Scorers, seed: t.leg1Seed, label: 'Qualifying · Leg 1' })
    const etH = l.leg2ExtraTime?.homeGoals ?? 0, etA = l.leg2ExtraTime?.awayGoals ?? 0
    matches.push({ homeClubId: t.teamB.clubId, awayClubId: t.teamA.clubId, homeClubName: t.teamB.clubName, awayClubName: t.teamA.clubName, homeGoals: l.leg2.homeGoals + etH, awayGoals: l.leg2.awayGoals + etA, scorers: mergeScorers(t.leg2Scorers, t.leg2ExtraTimeScorers), seed: t.leg2Seed, extraTime: !!l.leg2ExtraTime, label: 'Qualifying · Leg 2' })
  }
  for (const m of result.leagueMatchdays ?? [])
    matches.push({ homeClubId: m.home.clubId, awayClubId: m.away.clubId, homeClubName: m.home.clubName, awayClubName: m.away.clubName, homeGoals: m.homeGoals, awayGoals: m.awayGoals, scorers: m.scorers, seed: m.seed, label: `League Phase · MD ${m.matchday}` })
  // two-legged ties → two matches (shootout pens are excluded — leg scores are 90'/ET only)
  for (const k of [...result.playoffRound, ...result.r16, ...result.qf, ...result.sf]) {
    const roundLabel = CL_ROUND_LABEL[k.round] ?? k.round
    if (k.leg1) matches.push({ homeClubId: k.teamA.clubId, awayClubId: k.teamB.clubId, homeClubName: k.teamA.clubName, awayClubName: k.teamB.clubName, homeGoals: k.leg1.aGoals, awayGoals: k.leg1.bGoals, scorers: k.leg1Scorers, seed: k.leg1Seed, label: `${roundLabel} · Leg 1` })
    // Leg 2 = regulation + extra time folded together (one match, so clean sheets
    // and match counts stay right), with both scorer sets merged for totals.
    if (k.leg2) {
      const etB = k.leg2ExtraTime?.bGoals ?? 0, etA = k.leg2ExtraTime?.aGoals ?? 0
      matches.push({ homeClubId: k.teamB.clubId, awayClubId: k.teamA.clubId, homeClubName: k.teamB.clubName, awayClubName: k.teamA.clubName, homeGoals: k.leg2.bGoals + etB, awayGoals: k.leg2.aGoals + etA, scorers: mergeScorers(k.leg2Scorers, k.leg2ExtraTimeScorers), seed: k.leg2Seed, extraTime: !!k.leg2ExtraTime, label: `${roundLabel} · Leg 2` })
    }
  }
  if (result.final)
    matches.push({ homeClubId: result.final.teamA.clubId, awayClubId: result.final.teamB.clubId, homeClubName: result.final.teamA.clubName, awayClubName: result.final.teamB.clubName, homeGoals: result.final.aGoals, awayGoals: result.final.bGoals, extraTime: result.final.extraTime, scorers: result.final.leg1Scorers, seed: result.final.leg1Seed, label: 'Final' })

  const finalPositionByClub = new Map(standings.map((t, i) => [t.clubId, i + 1]))
  return computeRunStats({ matches, rosters, playerPool, playerClubId, finalPositionByClub, teamsInComp: standings.length })
}

// ── World Cup ───────────────────────────────────────────────────────────────
const WC_ROUND_POS: Record<string, number> = { r32: 17, r16: 9, qf: 5, sf: 3, final: 2 }

const WC_ROUND_LABEL: Record<string, string> = {
  r32: 'Round of 32', r16: 'Round of 16', qf: 'Quarter-final', sf: 'Semi-final',
  third: '3rd-Place Playoff', final: 'Final',
}

export async function computeWCRunStats(
  result: WCSeasonResult, draftedPlayers: DraftedPlayer[], yearStart = 2026, useSubstitutes = true,
): Promise<{ stats: CompetitionStats; awards: SeasonAwards; matchLog: PlayerMatchLog } | null> {
  const allTeams = result.groups.flatMap(g => g.teams)
  if (!allTeams.length) return null
  const playerClubId = result.playerTeam.clubId
  const rosters    = await getRostersForClubs(allTeams.map(t => t.clubId), yearStart)
  for (const [clubId, pool] of rosters) rosters.set(clubId, applySubstituteRule(pool, useSubstitutes))
  const playerPool = draftedToPool(draftedPlayers, playerClubId, result.playerTeam.clubName, yearStart)

  const matches: RunMatch[] = []
  for (const m of result.groupMatchdays ?? [])
    matches.push({ homeClubId: m.home.clubId, awayClubId: m.away.clubId, homeClubName: m.home.clubName, awayClubName: m.away.clubName, homeGoals: m.homeGoals, awayGoals: m.awayGoals, scorers: m.scorers, seed: m.seed, label: `Group ${m.groupId} · MD ${m.matchday}` })
  for (const round of result.knockoutRounds) for (const k of round.matches)
    matches.push({ homeClubId: k.teamA.clubId, awayClubId: k.teamB.clubId, homeClubName: k.teamA.clubName, awayClubName: k.teamB.clubName, homeGoals: k.result.homeGoals, awayGoals: k.result.awayGoals, extraTime: k.result.extraTime, scorers: k.scorers, seed: k.seed, label: WC_ROUND_LABEL[round.round] ?? round.round })

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

// ── Shootout kicker names — ONE shared implementation ───────────────────────
// Every mode used to fetch+expand penalty-kicker names with its own hand-rolled
// copy of this loop (classic CL, custom UCL, World Cup all had one). Now there's
// a single fetch step, and two thin per-shape attach functions that call it —
// so a fix here reaches every mode instead of needing to be applied three times.

// Your club's shootout order comes from YOUR drafted XI, not the real-world
// roster in the DB — the DB roster is whoever the club *actually* fielded
// historically, which isn't who's on the pitch once you've replaced them.
// Ranked by OVR (the closest thing a DraftedPlayer carries to attack/technical),
// keeper last, same "everyone kicks once before anyone repeats" shape as the DB path.
function kickerNamesFromDrafted(drafted: DraftedPlayer[]): string[] {
  const gk = drafted.find(p => p.primaryPosition === 'GK')
  const outfield = drafted.filter(p => p.primaryPosition !== 'GK').sort((a, b) => b.ovr - a.ovr)
  const names = outfield.map(p => p.name)
  if (gk) names.push(gk.name)
  return names
}

// Fetch each involved club's top kickers ONCE (not per-tie), keyed by clubId.
// If `playerClubId`/`draftedPlayers` are given, the player's own club is
// overridden with their actual squad instead of the DB's historical roster.
async function fetchShootoutKickerNames(
  ties: { teamAClubId: string; teamBClubId: string }[],
  playerClubId?: string,
  draftedPlayers?: DraftedPlayer[],
): Promise<Record<string, string[]>> {
  const ids = new Set<string>()
  for (const t of ties) { ids.add(t.teamAClubId); ids.add(t.teamBClubId) }
  const map: Record<string, string[]> = {}
  await Promise.all([...ids].map(async id => {
    map[id] = (id === playerClubId && draftedPlayers?.length) ? kickerNamesFromDrafted(draftedPlayers) : await getTopKickers(id)
  }))
  return map
}

// Classic + custom UCL share CLKnockoutMatch's flat aPens/aPenKicks shape.
export async function attachCLShootoutNames(
  matches: CLKnockoutMatch[], playerClubId?: string, draftedPlayers?: DraftedPlayer[],
): Promise<void> {
  const penTies = matches.filter(m => m.aPens !== undefined && m.bPens !== undefined)
  if (penTies.length === 0) return
  const kickerMap = await fetchShootoutKickerNames(penTies.map(m => ({ teamAClubId: m.teamA.clubId, teamBClubId: m.teamB.clubId })), playerClubId, draftedPlayers)
  for (const m of penTies) {
    const expanded = expandPenaltyKicks(kickerMap[m.teamA.clubId] ?? [], kickerMap[m.teamB.clubId] ?? [], m.aPenKicks ?? [], m.bPenKicks ?? [])
    m.penKicksA = expanded.kicksA
    m.penKicksB = expanded.kicksB
  }
}

// World Cup nests the raw shootout under `result` — same fetch, different read/write shape.
export async function attachWCShootoutNames(
  matches: WCKnockoutMatch[], playerClubId?: string, draftedPlayers?: DraftedPlayer[],
): Promise<void> {
  const penTies = matches.filter(m => m.result.homePens !== null && m.result.awayPens !== null)
  if (penTies.length === 0) return
  const kickerMap = await fetchShootoutKickerNames(penTies.map(m => ({ teamAClubId: m.teamA.clubId, teamBClubId: m.teamB.clubId })), playerClubId, draftedPlayers)
  for (const m of penTies) {
    const expanded = expandPenaltyKicks(kickerMap[m.teamA.clubId] ?? [], kickerMap[m.teamB.clubId] ?? [], m.result.homePenKicks ?? [], m.result.awayPenKicks ?? [])
    m.penKicksA = expanded.kicksA
    m.penKicksB = expanded.kicksB
  }
}

// ── Knockout tie record (leg-by-leg, not aggregate) ─────────────────────────
// A two-legged tie is two separate matches on the pitch — you can win one leg
// and lose the other. The "KO Record" stat should reflect that (1W 1L), not
// just who won the tie overall (which used to collapse to a single W or L).
export function koTieLegRecord(m: CLKnockoutMatch, isPlayerA: boolean): { w: number; d: number; l: number } {
  let w = 0, d = 0, l = 0
  const scoreLeg = (forGoals: number, againstGoals: number) => {
    if (forGoals > againstGoals) w++
    else if (forGoals < againstGoals) l++
    else d++
  }
  if (m.leg1) scoreLeg(isPlayerA ? m.leg1.aGoals : m.leg1.bGoals, isPlayerA ? m.leg1.bGoals : m.leg1.aGoals)
  if (m.leg2) {
    const etA = m.leg2ExtraTime?.aGoals ?? 0, etB = m.leg2ExtraTime?.bGoals ?? 0
    const aGoals = m.leg2.aGoals + etA, bGoals = m.leg2.bGoals + etB
    scoreLeg(isPlayerA ? aGoals : bGoals, isPlayerA ? bGoals : aGoals)
  }
  if (!m.leg1 && !m.leg2) scoreLeg(isPlayerA ? m.aGoals : m.bGoals, isPlayerA ? m.bGoals : m.aGoals)
  return { w, d, l }
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
    // Real attacking attribute, not OVR — a high-OVR CDM (all his rating from
    // passing/defense) must NOT inherit a striker-tier scoring likelihood just
    // because his overall is high. Old drafted-player snapshots (pre-`attack`
    // field) fall back to OVR since that's all they ever had.
    attack:          d.attack ?? d.ovr,
    ovr:             d.ovr,
    isBench:         d.isBench,
    birthYear:       d.birthYear ?? null,
    yearStart:       d.yearStart ?? yearStart,
    seasonLabel:     d.season || label,
    clubId:          playerClubId,
    clubName:        playerClubName,
  }))
}
