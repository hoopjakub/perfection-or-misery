// Headless quick-sim for the in-app tester (About → tap version 8×).
// Auto-drafts a random XI, places it, and simulates a full league season with
// matchday history — NO UI — so you land straight on the result/stats screens.
// Nothing here is persisted to the DB; it's purely a tester.

import type { Formation, DraftedPlayer, LeagueSeason, LeagueSeasonWithTeams } from '@/types/game'
import type { SimTeam, Fixture, SeasonResult, MatchdaySnapshot } from '@/types/simulation'
import { getSlotsForFormation } from './formations'
import { calcTeamOvr } from './rating'
import { generateFixtures } from './fixtures'
import { simulateMatch, setMatchTilt } from './match'
import { updateForm } from './simulation'
import { assignTier } from './tier'
import { filterEligibleLeagues, spinPlacement, buildLeagueSeason } from './placement'
import { loadLeaguePools, lineupCtxOf, attributeFixtureScorers, attributeCLResultScorers, attributeWCResultScorers, attributeQualTieScorers, type LeaguePools } from './run-stats'
import { getClubSeasonsForMode, getAllClubSeasons } from '@/db/queries/seasons'
import { getPlayersForClubSeason, type PlayerRow } from '@/db/queries/players'
import {
  buildCLTeams, generateCLLeagueFixtures, simulateCLKnockoutsOnly,
  type CLTeam, type CLSeasonResult, type CLLeagueMatch,
} from './cl-sim'
import {
  buildWCTeams, assignGroups, generateWCGroupFixtures, simulateWCKnockoutsOnly,
  type WCTeam, type WCGroup, type WCSeasonResult, type WCGroupMatch, type WCKnockoutMatch,
} from './world-cup-sim'
import type { KnockoutResult } from './knockout-match'
import { simulateKnockout } from './knockout-match'
import type { MatchResult } from '@/types/simulation'
import { buildCustomUclSeason } from '@/db/queries/custom-ucl'
import { simulateCustomUclQualifying, type QualifyingResult } from './cl-qualifying'
import type { SimLeagueTable } from './cl-league-sim'

// Mutates both teams' stats + form from a match result (shared by CL/WC quick-sim).
function applyMatchResult(home: { stats: any; form: number }, away: { stats: any; form: number }, r: MatchResult) {
  home.stats.played++; away.stats.played++
  home.stats.goalsFor += r.homeGoals; home.stats.goalsAgainst += r.awayGoals
  away.stats.goalsFor += r.awayGoals; away.stats.goalsAgainst += r.homeGoals
  if (r.outcome === 'home')      { home.stats.won++;   home.stats.points += 3; away.stats.lost++ }
  else if (r.outcome === 'away') { away.stats.won++;   away.stats.points += 3; home.stats.lost++ }
  else                           { home.stats.drawn++; home.stats.points++;    away.stats.drawn++; away.stats.points++ }
  updateForm(home as any, r.outcome === 'home' ? 'win' : r.outcome === 'draw' ? 'draw' : 'loss')
  updateForm(away as any, r.outcome === 'away' ? 'win' : r.outcome === 'draw' ? 'draw' : 'loss')
}

function sortCompTeams<T extends { stats: any }>(teams: T[]): T[] {
  return [...teams].sort((a, b) => {
    if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points
    const gdA = a.stats.goalsFor - a.stats.goalsAgainst, gdB = b.stats.goalsFor - b.stats.goalsAgainst
    if (gdB !== gdA) return gdB - gdA
    return b.stats.goalsFor - a.stats.goalsFor
  })
}

const FORMATIONS: Formation[] = ['4-3-3', '4-4-2', '4-2-3-1', '3-5-2', '5-3-2']

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

function playerFitsSlot(p: PlayerRow, slot: { primary: string; accepts: string[] }): boolean {
  let secondary: string[] = []
  try { secondary = JSON.parse(p.secondary_positions || '[]') } catch { secondary = [] }
  const all = [p.primary_position, ...secondary]
  return all.includes(slot.primary) || slot.accepts.some(a => all.includes(a))
}

function toDrafted(p: PlayerRow, slotIndex: number): DraftedPlayer {
  let secondary: string[] = []
  try { secondary = JSON.parse(p.secondary_positions || '[]') } catch { secondary = [] }
  const yy = String(p.year_start).slice(-2)
  return {
    playerId:         p.id,
    playerSeasonId:   p.club_season_id,
    name:             p.name,
    nationality:      p.nationality,
    primaryPosition:  p.primary_position as any,
    secondaryPositions: secondary as any,
    ovr:              p.ovr,
    attack:           p.attack,
    clubName:         p.club_name,
    season:           `${yy}/${String(p.year_start + 1).slice(-2)}`,
    slotIndex,
    isIcon:           !!p.is_icon,
    birthYear:        p.birth_year,
    yearStart:        p.year_start,
  }
}

// Draft a random, position-legal XI from the domestic pool.
async function autoDraftXI(formation: Formation): Promise<DraftedPlayer[]> {
  const slots = getSlotsForFormation(formation)
  const pool  = await getClubSeasonsForMode('all_time')   // excludes CL/WC
  if (pool.length === 0) throw new Error('No club-seasons available to draft from.')

  const drafted: DraftedPlayer[] = []
  const used = new Set<string>()
  // small cache so we don't re-query the same club-season repeatedly
  const cache = new Map<string, PlayerRow[]>()
  async function playersFor(csId: string): Promise<PlayerRow[]> {
    if (!cache.has(csId)) cache.set(csId, await getPlayersForClubSeason(csId))
    return cache.get(csId)!
  }

  for (const slot of slots) {
    let chosen: PlayerRow | null = null
    for (let attempt = 0; attempt < 60 && !chosen; attempt++) {
      const cs = pick(pool)
      const players = await playersFor(cs.id)
      const fits = players.filter(p => !used.has(p.id) && playerFitsSlot(p, slot))
      if (fits.length) chosen = pick(fits)
    }
    if (!chosen) {
      // extreme fallback: any unused player from a random club-season
      for (let attempt = 0; attempt < 30 && !chosen; attempt++) {
        const players = await playersFor(pick(pool).id)
        const free = players.filter(p => !used.has(p.id))
        if (free.length) chosen = pick(free)
      }
    }
    if (!chosen) throw new Error('Could not fill the XI — not enough seeded players.')
    used.add(chosen.id)
    drafted.push(toDrafted(chosen, (slot as any).slotIndex ?? drafted.length))
  }
  return drafted
}

// Build the domestic eligible-league pool (CL/WC excluded), mirroring placement.
async function eligibleLeagues(teamOvr: number): Promise<LeagueSeasonWithTeams[]> {
  const rows = await getAllClubSeasons()
  const map = new Map<string, LeagueSeasonWithTeams>()
  for (const cs of rows) {
    if (cs.league_id.startsWith('ucl_') || cs.league_id.startsWith('wc_') || cs.league_id.startsWith('cucl_')) continue
    const key = `${cs.league_id}_${cs.year_start}`
    if (!map.has(key)) {
      map.set(key, {
        leagueId: cs.league_id, leagueName: cs.league_name,
        yearStart: cs.year_start, gamesPerSeason: cs.games_per_season, teams: [],
      })
    }
    map.get(key)!.teams.push({ club_id: cs.club_id, club_name: cs.club_name, historical_ovr: cs.historical_ovr })
  }
  const all = Array.from(map.values())
  const eligible = filterEligibleLeagues(teamOvr, all, false)
  // Tester safety: if a strong random XI filters everything out, fall back to the
  // full pool so placement always succeeds.
  return eligible.length > 0 ? eligible : all
}

// Full league season WITH matchday history (same shape the live sim produces, so
// the result screen's matchday browser + position chart work).
function runLeagueWithHistory(league: LeagueSeason, pools?: LeaguePools): SeasonResult {
  const teams: SimTeam[] = league.teams.map(t => ({
    ...t, form: 0,
    stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
  }))
  const fixtures   = generateFixtures(teams)
  const playerTeam = teams.find(t => t.isPlayer)!
  const upsets: SeasonResult['upsets'] = []
  let biggestWinMargin = -1, biggestWin: SeasonResult['biggestWin'] = null
  let worstLossMargin  = -1, worstLoss: SeasonResult['worstLoss']  = null

  const byMatchday = new Map<number, Fixture[]>()
  for (const f of fixtures) {
    if (!byMatchday.has(f.matchday)) byMatchday.set(f.matchday, [])
    byMatchday.get(f.matchday)!.push(f)
  }

  const history: MatchdaySnapshot[] = []
  for (const md of [...byMatchday.keys()].sort((a, b) => a - b)) {
    const dayFixtures = byMatchday.get(md)!
    for (const f of dayFixtures) {
      const r = simulateMatch(f.home, f.away); f.result = r
      if (pools) f.scorers = attributeFixtureScorers(pools.poolByClub, f.home.clubId, f.away.clubId, r.homeGoals, r.awayGoals)
      f.home.stats.played++; f.away.stats.played++
      f.home.stats.goalsFor += r.homeGoals; f.home.stats.goalsAgainst += r.awayGoals
      f.away.stats.goalsFor += r.awayGoals; f.away.stats.goalsAgainst += r.homeGoals
      if (r.outcome === 'home')      { f.home.stats.won++;   f.home.stats.points += 3; f.away.stats.lost++ }
      else if (r.outcome === 'away') { f.away.stats.won++;   f.away.stats.points += 3; f.home.stats.lost++ }
      else                           { f.home.stats.drawn++; f.home.stats.points++;    f.away.stats.drawn++; f.away.stats.points++ }
      updateForm(f.home, r.outcome === 'home' ? 'win' : r.outcome === 'draw' ? 'draw' : 'loss')
      updateForm(f.away, r.outcome === 'away' ? 'win' : r.outcome === 'draw' ? 'draw' : 'loss')

      if (f.home.isPlayer || f.away.isPlayer) {
        const ph = f.home.isPlayer
        const pg = ph ? r.homeGoals : r.awayGoals
        const og = ph ? r.awayGoals : r.homeGoals
        const opp = ph ? f.away.clubName : f.home.clubName
        const margin = pg - og
        if (margin > biggestWinMargin) { biggestWinMargin = margin; biggestWin = { score: `${pg}-${og}`, opponent: opp } }
        if (worstLossMargin === -1 || margin < worstLossMargin) { worstLossMargin = margin; if (margin < 0) worstLoss = { score: `${pg}-${og}`, opponent: opp } }
        if (r.isUpset) {
          const lost = (ph && r.outcome === 'away') || (!ph && r.outcome === 'home')
          if (lost) upsets.push({ score: `${pg}-${og}`, opponent: opp, ovrGap: playerTeam.ovr - (ph ? f.away.ovr : f.home.ovr) })
        }
      }
    }
    history.push({
      matchday: md,
      standings: sortTable(teams).map(t => ({ ...t, stats: { ...t.stats } })),
      fixtures: dayFixtures.map(f => ({
        matchday: md,
        home:    { ...f.home, stats: { ...f.home.stats } },
        away:    { ...f.away, stats: { ...f.away.stats } },
        result:  f.result,
        scorers: f.scorers,
      })),
    })
  }

  const sortedTable   = sortTable(teams)
  const finalPosition = sortedTable.findIndex(t => t.isPlayer) + 1
  const { won, drawn, lost, goalsFor, goalsAgainst } = playerTeam.stats
  const unbeaten      = lost === 0
  const perfectSeason = lost === 0 && drawn === 0

  return {
    table: sortedTable,
    playerTeam,
    finalPosition,
    teamsInLeague: teams.length,
    wins: won, draws: drawn, losses: lost,
    goalsFor, goalsAgainst,
    biggestWin, worstLoss, upsets,
    unbeaten, perfectSeason,
    tier: assignTier(finalPosition, teams.length, unbeaten, perfectSeason),
    matchdayHistory: history,
  }
}

function sortTable(teams: SimTeam[]): SimTeam[] {
  return [...teams].sort((a, b) => {
    if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points
    const gdA = a.stats.goalsFor - a.stats.goalsAgainst
    const gdB = b.stats.goalsFor - b.stats.goalsAgainst
    if (gdB !== gdA) return gdB - gdA
    return b.stats.goalsFor - a.stats.goalsFor
  })
}

export type QuickLeagueRun = {
  formation:      Formation
  draftedPlayers: DraftedPlayer[]
  placedLeague:   LeagueSeason
  teamOvr:        number
  simResult:      SeasonResult
}

// ── Champions League quick-sim ──────────────────────────────────────────────
export type QuickCLRun = { formation: Formation; draftedPlayers: DraftedPlayer[]; clTeams: CLTeam[]; clResult: CLSeasonResult }

export async function quickSimCL(): Promise<QuickCLRun> {
  setMatchTilt(0)   // headless tester: neutral, never inherit a real run's tilt
  const formation = pick(FORMATIONS)
  const draftedPlayers = await autoDraftXI(formation)
  const teamOvr = calcTeamOvr(draftedPlayers, getSlotsForFormation(formation))

  const rows = await getClubSeasonsForMode('champions_league')
  if (rows.length === 0) throw new Error('No UCL data seeded.')
  const latest  = Math.max(...rows.map(r => r.year_start))
  const edition = rows.filter(r => r.year_start === latest).sort((a, b) => a.historical_ovr - b.historical_ovr)
  const replaceIdx = Math.floor(Math.random() * Math.min(3, edition.length))
  const clubs = edition.map((r, i) => ({ clubId: r.club_id, clubName: r.club_name, ovr: i === replaceIdx ? teamOvr : r.historical_ovr, isPlayer: i === replaceIdx }))
  const teams = buildCLTeams(clubs)

  const fixtures = generateCLLeagueFixtures(teams)
  const leagueMatchdays: CLLeagueMatch[] = []
  const maxMd = fixtures.reduce((m, f) => Math.max(m, f.matchday), 0)
  for (let md = 1; md <= maxMd; md++) {
    for (const fx of fixtures.filter(f => f.matchday === md)) {
      const home = teams.find(t => t.clubId === fx.home.clubId)!, away = teams.find(t => t.clubId === fx.away.clubId)!
      const r = simulateMatch(home, away)
      applyMatchResult(home, away, r)
      leagueMatchdays.push({ matchday: md, home: { clubId: home.clubId, clubName: home.clubName, isPlayer: home.isPlayer }, away: { clubId: away.clubId, clubName: away.clubName, isPlayer: away.isPlayer }, homeGoals: r.homeGoals, awayGoals: r.awayGoals })
    }
  }
  const sorted = sortCompTeams(teams)
  const ko = simulateCLKnockoutsOnly(sorted)
  const clResult: CLSeasonResult = { leaguePhaseStandings: sorted, ...ko, leagueMatchdays }
  // Attribute scorers ONCE and store them on the result (deterministic).
  const pools = await loadLeaguePools(teams, draftedPlayers, latest)
  attributeCLResultScorers(clResult, pools.poolByClub, lineupCtxOf(pools))
  return { formation, draftedPlayers, clTeams: teams, clResult }
}

// ── Custom Champions League quick-sim (tester) ──────────────────────────────
// Runs the REAL custom-path chain from scraped domestic tables: access list →
// qualifying ladder → league phase → knockouts, and reuses the CL result screen.
// Logs an access/qualifying summary to the console for verification.
export type QuickCustomUclRun = QuickCLRun & { qual: QualifyingResult; tables: SimLeagueTable[] }

export async function quickSimCustomUcl(): Promise<QuickCustomUclRun> {
  setMatchTilt(0)   // headless tester: neutral, never inherit a real run's tilt
  const formation = pick(FORMATIONS)
  const draftedPlayers = await autoDraftXI(formation)
  const teamOvr = calcTeamOvr(draftedPlayers, getSlotsForFormation(formation))

  const { access, tables } = await buildCustomUclSeason()
  if (access.leaguePhaseDirect.length === 0) throw new Error('No custom UCL data — run build-db after the scrape.')

  const qual = simulateCustomUclQualifying(access)
  const field = qual.leaguePhaseField
  console.log('[custom-ucl] access:', {
    direct: access.leaguePhaseDirect.length,
    qualifyingEntrants: access.qualifying.length,
    missingSlots: access.missing.length,
    qualifiers: qual.qualifiers.length,
    ties: qual.ties.length,
    leaguePhaseSize: field.length,
  })

  if (field.length < 8) throw new Error(`Only ${field.length} clubs in the league phase — add more leagues.`)

  // Take over a random league-phase club with the drafted XI's OVR.
  const replaceIdx = Math.floor(Math.random() * field.length)
  const clubs = field.map((t, i) => ({
    clubId: t.clubId, clubName: t.clubName,
    ovr: i === replaceIdx ? teamOvr : t.ovr, isPlayer: i === replaceIdx,
  }))
  const teams = buildCLTeams(clubs)

  const fixtures = generateCLLeagueFixtures(teams)
  const leagueMatchdays: CLLeagueMatch[] = []
  const maxMd = fixtures.reduce((m, f) => Math.max(m, f.matchday), 0)
  for (let md = 1; md <= maxMd; md++) {
    for (const fx of fixtures.filter(f => f.matchday === md)) {
      const home = teams.find(t => t.clubId === fx.home.clubId)!, away = teams.find(t => t.clubId === fx.away.clubId)!
      const r = simulateMatch(home, away)
      applyMatchResult(home, away, r)
      leagueMatchdays.push({ matchday: md, home: { clubId: home.clubId, clubName: home.clubName, isPlayer: home.isPlayer }, away: { clubId: away.clubId, clubName: away.clubName, isPlayer: away.isPlayer }, homeGoals: r.homeGoals, awayGoals: r.awayGoals })
    }
  }
  const sorted = sortCompTeams(teams)
  const ko = simulateCLKnockoutsOnly(sorted)
  const clResult: CLSeasonResult = { leaguePhaseStandings: sorted, ...ko, leagueMatchdays }
  const pools = await loadLeaguePools(teams, draftedPlayers, 2025)   // cucl season = 2025/26
  attributeCLResultScorers(clResult, pools.poolByClub, lineupCtxOf(pools))
  // Qualifying ties get stored scorers too (they count toward stats/awards).
  try {
    const tieClubs = new Map<string, { clubId: string; clubName: string; isPlayer: boolean }>()
    for (const t of qual.ties) {
      tieClubs.set(t.teamA.clubId, { clubId: t.teamA.clubId, clubName: t.teamA.clubName, isPlayer: false })
      if (t.teamB) tieClubs.set(t.teamB.clubId, { clubId: t.teamB.clubId, clubName: t.teamB.clubName, isPlayer: false })
    }
    if (tieClubs.size > 0) {
      const qp = await loadLeaguePools([...tieClubs.values()], draftedPlayers, 2025)
      attributeQualTieScorers(qual.ties, qp.poolByClub, lineupCtxOf(qp))
    }
  } catch { /* tester-only nicety */ }
  return { formation, draftedPlayers, clTeams: teams, clResult, qual, tables }
}

// ── World Cup quick-sim ─────────────────────────────────────────────────────
export type QuickWCRun = { formation: Formation; draftedPlayers: DraftedPlayer[]; wcTeams: WCTeam[]; wcResult: WCSeasonResult }

export async function quickSimWC(): Promise<QuickWCRun> {
  setMatchTilt(0)   // headless tester: neutral, never inherit a real run's tilt
  const formation = pick(FORMATIONS)
  const draftedPlayers = await autoDraftXI(formation)
  const teamOvr = calcTeamOvr(draftedPlayers, getSlotsForFormation(formation))

  const rows = await getClubSeasonsForMode('world_cup')
  if (rows.length === 0) throw new Error('No World Cup data seeded.')
  const latest  = Math.max(...rows.map(r => r.year_start))
  const edition = rows.filter(r => r.year_start === latest).sort((a, b) => a.historical_ovr - b.historical_ovr)
  const replaceIdx = Math.floor(Math.random() * Math.min(3, edition.length))
  const clubs = edition.map((r, i) => ({ clubId: r.club_id, clubName: i === replaceIdx ? `${r.club_name} XI` : r.club_name, ovr: i === replaceIdx ? teamOvr : r.historical_ovr, isPlayer: i === replaceIdx }))
  const teams = buildWCTeams(clubs)
  const groups = assignGroups(teams)

  const fixtures = generateWCGroupFixtures(groups)
  const groupMatchdays: WCGroupMatch[] = []
  const maxMd = fixtures.reduce((m, f) => Math.max(m, f.matchday), 0)
  for (let md = 1; md <= maxMd; md++) {
    for (const fx of fixtures.filter(f => f.matchday === md)) {
      const home = teams.find(t => t.clubId === fx.home.clubId)!, away = teams.find(t => t.clubId === fx.away.clubId)!
      const r = simulateMatch(home, away)
      applyMatchResult(home, away, r)
      groupMatchdays.push({ groupId: home.groupId, matchday: md, home: { clubId: home.clubId, clubName: home.clubName, isPlayer: home.isPlayer }, away: { clubId: away.clubId, clubName: away.clubName, isPlayer: away.isPlayer }, homeGoals: r.homeGoals, awayGoals: r.awayGoals })
    }
  }
  const clonedGroups: WCGroup[] = groups.map(g => ({ id: g.id, teams: g.teams.map(t => ({ ...t, stats: { ...t.stats } })) }))
  const result = simulateWCKnockoutsOnly(clonedGroups, teams)
  const wcResult: WCSeasonResult = { groups: clonedGroups, ...result, groupMatchdays }
  // Attribute scorers ONCE and store them on the result (deterministic).
  const pools = await loadLeaguePools(teams, draftedPlayers, latest)
  attributeWCResultScorers(wcResult, pools.poolByClub, lineupCtxOf(pools))
  return { formation, draftedPlayers, wcTeams: teams, wcResult }
}

// ── "Test final game" dev tool (Big Fixes §12) ──────────────────────────────
// For building/testing §7/§8/§10 (the Deep Match final + momentum + stats
// screen) without grinding a whole World Cup to reach one. This does NOT skip
// straight to a result — it auto-drafts and then the player goes through the
// REAL placement → group stage → knockout flow exactly like any other run,
// watching every round play out; simulation.tsx's WC group/knockout execution
// just forces the player's own matches to a clean 1-0 win (checking the
// store's `testForceWinUntilFinal` flag) up to but not including the final,
// which is always genuinely simulated. `autoDraftForTestFinal` below only
// covers the auto-draft step; the forcing itself lives in simulation.tsx (the
// live screen) and here (`simulateWCKnockoutsForceToFinal`, used to build the
// live knockout reveal's bracket instead of the real `simulateWCKnockoutsOnly`).
export async function autoDraftForTestFinal(): Promise<{ formation: Formation; draftedPlayers: DraftedPlayer[] }> {
  setMatchTilt(0)
  const formation = pick(FORMATIONS)
  const draftedPlayers = await autoDraftXI(formation)
  return { formation, draftedPlayers }
}

export function forcedKnockoutResult(homeWins: boolean): KnockoutResult {
  return {
    homeGoals: homeWins ? 1 : 0, awayGoals: homeWins ? 0 : 1,
    regulation: { homeGoals: homeWins ? 1 : 0, awayGoals: homeWins ? 0 : 1 },
    extraTimeScore: null, extraTime: false, homePens: null, awayPens: null,
    winner: homeWins ? 'home' : 'away',
  }
}

// Near-copy of simulateWCKnockoutsOnly (world-cup-sim.ts) — kept as its own
// function rather than adding a "force" branch to the real simulation engine.
// Only the player's own ties are forced; every other tie in the bracket
// (including the final) is simulated normally, same as a real run.
export function simulateWCKnockoutsForceToFinal(groups: WCGroup[], allTeams: WCTeam[]): Omit<WCSeasonResult, 'groups'> {
  const byStats = (a: WCTeam, b: WCTeam) => {
    if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points
    const gdA = a.stats.goalsFor - a.stats.goalsAgainst, gdB = b.stats.goalsFor - b.stats.goalsAgainst
    if (gdB !== gdA) return gdB - gdA
    return b.stats.goalsFor - a.stats.goalsFor
  }
  for (const group of groups) group.teams.sort(byStats)

  const topTwo     = groups.flatMap(g => g.teams.slice(0, 2))
  const allThirds  = groups.map(g => g.teams[2]).sort(byStats)
  const bestThirds = allThirds.slice(0, 8)
  const r32Teams   = [...topTwo, ...bestThirds]

  const playerTeam     = allTeams.find(t => t.isPlayer)!
  const playerGroup    = groups.find(g => g.teams.some(t => t.isPlayer))!
  const playerGroupPos = playerGroup.teams.findIndex(t => t.isPlayer) + 1

  const knockoutRounds: { round: string; matches: WCKnockoutMatch[] }[] = []
  const roundNames = ['r32', 'r16', 'qf', 'sf']
  // Seed the player into the bracket first so they always have a spot, then
  // shuffle the rest — the forced results mean the SHAPE of the bracket
  // doesn't matter, only that the player's slot exists.
  let current = [...r32Teams].sort(() => Math.random() - 0.5)
  let sfLosers: WCTeam[] = []

  for (const round of roundNames) {
    const roundMatches: WCKnockoutMatch[] = []
    const winners: WCTeam[] = []
    const losers: WCTeam[] = []

    for (let i = 0; i < current.length; i += 2) {
      const teamA = current[i]
      const teamB = current[i + 1]
      const forcePlayer = teamA.isPlayer || teamB.isPlayer
      const result = forcePlayer
        ? forcedKnockoutResult(teamA.isPlayer)
        : (simulateKnockout(teamA as any, teamB as any) as KnockoutResult)
      const winner = result.winner === 'home' ? teamA : teamB
      const loser  = winner.clubId === teamA.clubId ? teamB : teamA
      winners.push(winner)
      losers.push(loser)
      roundMatches.push({ round, teamA, teamB, result, winner })
    }

    knockoutRounds.push({ round, matches: roundMatches })
    if (round === 'sf') sfLosers = losers
    current = winners
  }

  if (sfLosers.length === 2) {
    const [tpA, tpB] = sfLosers
    const tpResult = simulateKnockout(tpA as any, tpB as any) as KnockoutResult
    const tpWinner = tpResult.winner === 'home' ? tpA : tpB
    knockoutRounds.push({ round: 'third', matches: [{ round: 'third', teamA: tpA, teamB: tpB, result: tpResult, winner: tpWinner }] })
  }

  // The final: genuinely simulated, never forced — this is the match the
  // whole tool exists to reach, and it should be new every time.
  const [f1, f2] = current
  const finalResult = simulateKnockout(f1 as any, f2 as any) as KnockoutResult
  const champion = finalResult.winner === 'home' ? f1 : f2
  const runnerUp = champion.clubId === f1.clubId ? f2 : f1
  knockoutRounds.push({ round: 'final', matches: [{ round: 'final', teamA: f1, teamB: f2, result: finalResult, winner: champion }] })
  const playerFinalRound = champion.isPlayer ? 'winner' : runnerUp.isPlayer ? 'final' : 'groups'

  return {
    r32Teams, knockoutRounds,
    winner: champion, playerTeam, playerFinalRound,
    playerGroup: playerGroup.id, playerGroupPos,
  }
}

export async function quickSimLeague(): Promise<QuickLeagueRun> {
  setMatchTilt(0)   // headless tester: neutral, never inherit a real run's tilt
  const formation = pick(FORMATIONS)
  const draftedPlayers = await autoDraftXI(formation)
  const slots  = getSlotsForFormation(formation)
  const teamOvr = calcTeamOvr(draftedPlayers, slots)

  const eligible = await eligibleLeagues(teamOvr)
  if (eligible.length === 0) throw new Error('No eligible league to place into.')
  const placedLeague = buildLeagueSeason(spinPlacement(eligible), teamOvr)
  const pools        = await loadLeaguePools(placedLeague.teams, draftedPlayers, placedLeague.yearStart)
  const simResult    = runLeagueWithHistory(placedLeague, pools)

  return { formation, draftedPlayers, placedLeague, teamOvr, simResult }
}
