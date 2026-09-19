import React, { useState, useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useGameStore } from '@/store/gameStore'
import { calcTeamOvr, effectiveOvr } from '@/engine/rating'
import { getSlotsForFormation } from '@/engine/formations'
import { simulateMatch, setMatchTilt } from '@/engine/match'
import { resolveDifficulty } from '@/engine/difficulty'
import { rotationFor } from '@/engine/rotation'
import { effectiveMatchOvrs } from '@/engine/lineup'
import {
  createAvailabilityLedger, availabilityFor, recordMatchOutcome, type AvailabilityLedger,
} from '@/engine/availability'
import { generateCLLeagueFixtures, simulateCLKnockoutsOnly } from '@/engine/cl-sim'
import type { CLTeam, CLKnockoutMatch, CLSeasonResult, CLLeagueMatch } from '@/engine/cl-sim'
import { assignGroups, generateWCGroupFixtures, simulateWCKnockoutsOnly } from '@/engine/world-cup-sim'
import { simulateWCKnockoutsForceToFinal } from '@/engine/quick-sim'
import { openWCGroup } from '@/components/WCGroupModal'
import type { WCTeam, WCGroup, WCKnockoutMatch, WCSeasonResult, WCGroupMatch } from '@/engine/world-cup-sim'
import type { PenKick } from '@/engine/knockout-match'
import { colors, spacing, typography, radius, shadows, MODE_THEMES } from '@/theme'
import { useModeTheme } from '@/hooks/useModeTheme'
import type { SimTeam, Fixture, SeasonResult, MatchResult } from '@/types/simulation'
import type { DraftedPlayer } from '@/types/game'
import { LiveMatch, type LivePeriod, type LiveRedCard } from '@/components/LiveMatch'
import { generateMatchDetail } from '@/engine/match-detail'
import { BracketPreview } from '@/components/BracketPreview'
import { getFlag } from '@/lib/flagMap'
import {
  loadLeaguePools, lineupCtxOf, attributeFixtureScorers, attributeCLResultScorers, attributeWCResultScorers, summariseScorers,
  attachCLShootoutNames, attachWCShootoutNames,
} from '@/engine/run-stats'
import {
  clKnockoutAvailabilityHook, wcKnockoutAvailabilityHook,
  CL_TOTAL_MATCHDAYS, WC_TOTAL_MATCHDAYS,
} from '@/engine/knockout-availability'
import type { RosterPlayer, MatchScorers } from '@/types/stats'
import { randomSeed } from '@/lib/rng'
import { koLegDetailRequest, type MatchDetailRequest } from '@/components/MatchStatsParts'
import { openMatchStats } from '@/lib/matchStats'
import { openDeepMatch } from '@/lib/deepMatch'
import { appendKnockoutRounds, koLegMatchday, toContextMatches, type ContextMatch } from '@/engine/match-context'
import { openKoTie } from '@/components/CustomUclViewers'
import { useSimBackGuard } from '@/hooks/useSimBackGuard'
import LeagueSeason from '@/components/season/LeagueSeason'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ROLES, space, border, colourwayFor } from '@/theme'
import { KitScreen, KitText, RunHeader, Plate, Icon, SectionTag, Tag, EmptyState } from '@/components/kit'
import {
  LeagueTable, ZoneLegend, StandingFigure, SeasonStrip, ScorelineCard, ResultRow, SegmentSwitch,
  FixtureRow, GroupWall, StampLabel, TieCard, TieRow, CL_PHASE_ZONES, WC_GROUP_ZONES, WC_THIRD_ZONES,
  type TableRowVM, type TableZone, type Mark, type MiniGroup, type TieVM,
} from '@/components/season/SeasonParts'
import { ThumbBar, CloseRun, BackToLive, askSkip, askAbandon } from '@/components/season/RunChrome'

const WC_GROUP_MATCHDAYS = 3

type SimPhase = 'review' | 'simulating' | 'completed' | 'group_review' | 'knockout_phase'
type Speed = 'slow' | 'normal' | 'fast'

// Knockout display types (local to this file)
type KnockoutTie = {
  teamA: { clubId: string; clubName: string; isPlayer: boolean }
  teamB: { clubId: string; clubName: string; isPlayer: boolean }
  winner: { clubId: string; clubName: string; isPlayer: boolean }
  aGoals: number
  bGoals: number
  leg1?: { aGoals: number; bGoals: number }
  leg2?: { aGoals: number; bGoals: number }
  leg2ExtraTime?: { aGoals: number; bGoals: number }
  extraTime: boolean
  aPens?: number
  bPens?: number
  penKicksA?: PenKick[]
  penKicksB?: PenKick[]
  leg1Scorers?: MatchScorers   // CL two-leg
  leg2Scorers?: MatchScorers
  leg2ExtraTimeScorers?: MatchScorers
  scorers?: MatchScorers       // WC single match
  // Deep-stat seeds — needed so a tapped live tie can open the same match-stats
  // screen the result screens use (maintainer feedback: live ties need to stay
  // clickable, not just once the run finishes).
  leg1Seed?: number
  leg2Seed?: number
  seed?: number                // WC single match
  // §10.5 phase 4 — availability, so a tie tapped DURING the reveal regenerates
  // the same eleven the result screen will show.
  leg1Absent?: string[]
  leg2Absent?: string[]
  leg1StandIns?: RosterPlayer[]
  leg2StandIns?: RosterPlayer[]
  absent?: string[]            // WC single match
  standIns?: RosterPlayer[]
}
type KnockoutRound = {
  round: string
  label: string
  ties: KnockoutTie[]
  autoDelay: number  // ms before auto-advancing to next round
}

const SPEED_MS: Record<Speed, number> = {
  slow: 2000,
  normal: 400,
  fast: 100,
}

// ── Kit Drop pieces shared by the Champions League and World Cup screens ────
const nylon = ROLES.nylon


const teamRow = (t: SimTeam): TableRowVM => ({
  clubId: t.clubId, clubName: t.clubName, isPlayer: t.isPlayer,
  played: t.stats.played, gd: t.stats.goalsFor - t.stats.goalsAgainst, points: t.stats.points,
})

function markOf(youHome: boolean, homeGoals: number, awayGoals: number): Mark {
  const mine = youHome ? homeGoals - awayGoals : awayGoals - homeGoals
  return mine > 0 ? 'W' : mine < 0 ? 'L' : 'D'
}

type CompMatchResult = {
  home: SimTeam
  away: SimTeam
  homeGoals: number
  awayGoals: number
  outcome: 'home' | 'away' | 'draw'
  scorers?: MatchScorers
  seed?: number   // deep-stat seed, carried into the stored matchday history
  // §10.5 — how heavily each side rested players. Stored because that eleven
  // decided the scoreline; regenerating without it would pick a different one.
  homeRotation?: number
  awayRotation?: number
  // §10.5 phase 4 — and who wasn't available to be picked at all.
  absent?:   string[]
  standIns?: RosterPlayer[]
}

function sortByStats(teams: SimTeam[]): SimTeam[] {
  return [...teams].sort((a, b) => {
    if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points
    const gdA = a.stats.goalsFor - a.stats.goalsAgainst
    const gdB = b.stats.goalsFor - b.stats.goalsAgainst
    if (gdB !== gdA) return gdB - gdA
    return b.stats.goalsFor - a.stats.goalsFor
  })
}

// Top-level router — delegates to the right simulation per mode
export default function SimulationScreen() {
  const mode = useGameStore(s => s.mode)
  const difficulty = useGameStore(s => s.difficulty)
  const customDifficulty = useGameStore(s => s.customDifficulty)
  // Difficulty now tilts the PLAYER's own matches (see engine/match.ts). Set it
  // synchronously here — before any child simulation component mounts and starts
  // simulating — so every mode (league / CL / WC) picks up the right tilt. Doing
  // it in an effect would race the children's own mount-time sim effects (React
  // fires child effects before parent effects).
  setMatchTilt(resolveDifficulty(difficulty, customDifficulty, mode).tilt)
  if (mode === 'champions_league') return <CLSimulation />
  if (mode === 'world_cup')        return <WCSimulation />
  return <LeagueSeason />
}

// ── Champions League Simulation ──────────────────────────────────────────────

function CLSimulation() {
  const { draftedPlayers, benchPlayers, useSubstitutes, formation, clTeams, clYear, setClResult } = useGameStore()
  const fullSquad = [...draftedPlayers, ...benchPlayers]
  const clPoolYear = clYear ?? 2025   // UCL edition you were placed in (for scorer rosters)

  const slots       = formation ? getSlotsForFormation(formation) : []
  const baseTeamOvr = formation && draftedPlayers.length > 0 ? calcTeamOvr(draftedPlayers, slots) : 0
  const totalTeamOvr = baseTeamOvr

  const [phase,                  setPhase]                  = useState<SimPhase>('review')
  useSimBackGuard(phase !== 'review')   // §3 — active once the league phase starts simulating
  const [currentMD,              setCurrentMD]              = useState(1)
  const [simTeams,               setSimTeams]               = useState<CLTeam[]>([])
  const [fixtures,               setFixtures]               = useState<{ matchday: number; home: CLTeam; away: CLTeam }[]>([])
  const [recentResults,          setRecentResults]          = useState<CompMatchResult[]>([])
  const [clViewMD,               setClViewMD]               = useState<number | null>(null)  // MD-results lookback
  // Two-legged ties need the leg-picker modal (Big Fixes feedback: tapping a
  // live tie used to jump straight to Leg 1 stats with no way to reach Leg 2 —
  // Custom UCL's tie modal already gets this right, so reuse it here).
  const [isPlaying,              setIsPlaying]              = useState(false)
  // League phase always runs at "slow" — the pace is locked (matches WC).
  const speed: Speed = 'slow'
  const theme = MODE_THEMES.champions_league
  const [isFinishing,  setIsFinishing]  = useState(false)
  const finishingRef = useRef(false)   // bulletproof re-entry guard (state lags a tap)
  // Records every league-phase result so the results screen can show matchdays.
  const leagueHistoryRef = useRef<CLLeagueMatch[]>([])
  // Scorer pools, loaded once so we can attribute goalscorers live, matchday by
  // matchday (same as the league sim does).
  const poolByClubRef = useRef<Map<string, RosterPlayer[]>>(new Map())
  // §10.5 — carried alongside the pools so every attribution in this screen
  // selects the same eleven the stat sheet will regenerate later.
  const lineupCtxRef = useRef<{ playerClubId?: string; benchSize?: number }>({})
  // §10.5 phase 4 — sequential availability; see the league sim above.
  const availabilityRef = useRef<AvailabilityLedger | null>(null)
  useEffect(() => {
    if (!clTeams || clTeams.length === 0 || draftedPlayers.length === 0) return
    loadLeaguePools(clTeams, fullSquad, clPoolYear, useSubstitutes)
      .then(p => {
        poolByClubRef.current = p.poolByClub
        lineupCtxRef.current = { playerClubId: p.playerClubId, benchSize: p.benchSize }
        availabilityRef.current = createAvailabilityLedger({
          // The bracket keeps counting matchdays after the league phase, so an
          // injury on matchday 8 can still cost somebody the round of 16.
          poolByClub: p.poolByClub, playerClubId: p.playerClubId,
          totalMatchdays: CL_TOTAL_MATCHDAYS,
        })
      })
      .catch(e => console.warn('[cl] pool load failed:', e))
  }, [clTeams])
  // The table as each matchday left it, so it can land a beat after your
  // result (07c rule 1: nothing you haven't reached is shown).
  const clSnapshotsRef = useRef<CLTeam[][]>([])
  const [clRestMD, setClRestMD] = useState(0)
  const [clTab, setClTab] = useState<'table' | 'results' | 'fixtures'>('table')
  const clSkipRef = useRef<() => void>(() => {})

  // Knockout phase state
  const [koRounds, setKoRounds]             = useState<KnockoutRound[]>([])
  // §7 R6 — the Deep Match is a one-time experience. Once it's been watched the
  // final settles into the normal tie display and the results CTA appears;
  // there is deliberately no way back into it.
  const [deepFinalWatched, setDeepFinalWatched] = useState(false)
  const [koVisibleCount, setKoVisibleCount] = useState(0)
  const [koLiveDone, setKoLiveDone]         = useState<Record<string, boolean>>({})
  const koStoredResultRef = useRef<CLSeasonResult | null>(null)
  const koFinishedRef = useRef(false)

  // Auto-advance knockout rounds — but WAIT for the player's live match to play
  // out fully. If the player has a tie in the current round, we only advance once
  // its LiveMatch calls onLiveDone; other rounds advance on a short timer.
  useEffect(() => {
    if (phase !== 'knockout_phase' || koVisibleCount < 1) return
    const currentRound = koRounds[koVisibleCount - 1]
    if (!currentRound) return
    const playerTie = currentRound.ties.find(t => t.teamA.isPlayer || t.teamB.isPlayer)
    if (playerTie && !koLiveDone[currentRound.round]) return   // hold until the live match finishes
    if (koVisibleCount < koRounds.length) {
      const t = setTimeout(() => setKoVisibleCount(p => p + 1), playerTie ? 1600 : (currentRound.autoDelay ?? 3000))
      return () => clearTimeout(t)
    }
  }, [phase, koVisibleCount, koRounds, koLiveDone])

  const totalMatchdays = 8

  useEffect(() => {
    if (!clTeams) return
    const teams: CLTeam[] = clTeams.map(t => ({
      ...t,
      ovr:  t.isPlayer ? totalTeamOvr : t.ovr,
      form: 0,
      stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
    }))
    setSimTeams(teams)
    setFixtures(generateCLLeagueFixtures(teams))
  }, [clTeams, totalTeamOvr])

  useEffect(() => {
    const landed = clSnapshotsRef.current.length
    if (landed === clRestMD) return
    const t = setTimeout(() => setClRestMD(landed), Math.round(SPEED_MS[speed] * 0.45))
    return () => clearTimeout(t)
  }, [simTeams, clRestMD])

  useEffect(() => {
    if (phase !== 'simulating' || !isPlaying) return
    const timer = setTimeout(simulateNextMD, SPEED_MS[speed])
    return () => clearTimeout(timer)
  }, [phase, isPlaying, currentMD, simTeams, fixtures, speed])

  if (!clTeams || !formation || draftedPlayers.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: nylon.bg, padding: space[4], justifyContent: 'center', gap: space[4] }]}>
        <EmptyState roles={nylon} title="No CL data found" body="This run lost its squad or draw, usually after a reload. Start a new one." />
        <Plate label="Start a new run" roles={nylon} onPress={() => router.replace('/game/mode-select')} />
      </View>
    )
  }

  function simulateNextMD() {
    if (currentMD > totalMatchdays) { handleFinish(); return }

    const mdFixtures = fixtures.filter(f => f.matchday === currentMD)
    const teams      = [...simTeams]
    const results: CompMatchResult[] = []

    mdFixtures.forEach(({ home: h, away: a }) => {
      const home = teams.find(t => t.clubId === h.clubId)!
      const away = teams.find(t => t.clubId === a.clubId)!
      // §10.5 — seed and rotation BEFORE the result: in the league phase the
      // stakes are simply whether a club is mathematically into (or out of) the
      // top 24, so a side already through can rest people.
      const seed = randomSeed()
      const clStakes = {
        standings: teams.map(t => ({ clubId: t.clubId, points: t.stats.points })),
        totalMatchdays, playedMatchdays: currentMD - 1, qualifyCutoff: 24,
      }
      const rot = {
        home: home.isPlayer ? 0 : rotationFor({ ...clStakes, clubId: home.clubId }),
        away: away.isPlayer ? 0 : rotationFor({ ...clStakes, clubId: away.clubId }),
      }
      // §10.5 phase 4 — see the league sim: absences for this matchday, stored
      // on the match, priced into the OVR that decides the scoreline.
      const av = availabilityFor(availabilityRef.current, currentMD, home.clubId, away.clubId)
      const lineupOpts = {
        ...lineupCtxRef.current, homeRotation: rot.home, awayRotation: rot.away,
        unavailableIds: av.unavailableIds, standIns: av.standIns,
      }
      const eff = effectiveMatchOvrs(
        poolByClubRef.current.get(home.clubId) ?? [], poolByClubRef.current.get(away.clubId) ?? [],
        {
          seed, ...lineupOpts,
          homeBaseOvr: home.ovr + av.homeOvrDelta, awayBaseOvr: away.ovr + av.awayOvrDelta,
        },
      )
      const r    = simulateMatch({ ...home, ovr: eff.homeOvr }, { ...away, ovr: eff.awayOvr })

      home.stats.played++; away.stats.played++
      home.stats.goalsFor += r.homeGoals; home.stats.goalsAgainst += r.awayGoals
      away.stats.goalsFor += r.awayGoals; away.stats.goalsAgainst += r.homeGoals

      if (r.outcome === 'home') { home.stats.won++; home.stats.points += 3; away.stats.lost++ }
      else if (r.outcome === 'away') { away.stats.won++; away.stats.points += 3; home.stats.lost++ }
      else { home.stats.drawn++; home.stats.points++; away.stats.drawn++; away.stats.points++ }

      const upd = (t: CLTeam, out: 'win' | 'draw' | 'loss') => {
        t.form = Math.max(-1, Math.min(1, t.form * 0.85 + (out === 'win' ? 0.15 : out === 'draw' ? 0 : -0.15)))
      }
      upd(home, r.outcome === 'home' ? 'win' : r.outcome === 'draw' ? 'draw' : 'loss')
      upd(away, r.outcome === 'away' ? 'win' : r.outcome === 'draw' ? 'draw' : 'loss')

      const scorers = attributeFixtureScorers(poolByClubRef.current, home.clubId, away.clubId, r.homeGoals, r.awayGoals, false, false, seed, lineupOpts)
      results.push({ home, away, homeGoals: r.homeGoals, awayGoals: r.awayGoals, outcome: r.outcome, scorers, seed })
      leagueHistoryRef.current.push({
        matchday: currentMD,
        home: { clubId: home.clubId, clubName: home.clubName, isPlayer: home.isPlayer },
        away: { clubId: away.clubId, clubName: away.clubName, isPlayer: away.isPlayer },
        homeGoals: r.homeGoals, awayGoals: r.awayGoals, scorers, seed,
        homeRotation: rot.home, awayRotation: rot.away,
        absent: av.absent, standIns: av.standIns,
      })
      if (availabilityRef.current) recordMatchOutcome(availabilityRef.current, poolByClubRef.current, {
        matchday: currentMD, homeClubId: home.clubId, awayClubId: away.clubId,
        seed, homeGoals: r.homeGoals, awayGoals: r.awayGoals, scorers, lineups: lineupOpts,
      })
    })

    clSnapshotsRef.current.push((sortByStats(teams) as CLTeam[]).map(t => ({ ...t, stats: { ...t.stats } })))

    setSimTeams(teams)
    setRecentResults([...results].sort((a, b) => Number(b.home.isPlayer || b.away.isPlayer) - Number(a.home.isPlayer || a.away.isPlayer)))

    if (currentMD === totalMatchdays) { setIsPlaying(false); setPhase('completed') }
    else { setCurrentMD(prev => prev + 1) }
  }

  function skipAll() {
    setIsPlaying(false)
    let teams = [...simTeams]
    for (let md = currentMD; md <= totalMatchdays; md++) {
      fixtures.filter(f => f.matchday === md).forEach(({ home: h, away: a }) => {
        const home = teams.find(t => t.clubId === h.clubId)!
        const away = teams.find(t => t.clubId === a.clubId)!
        const r = simulateMatch(home, away)
        home.stats.played++; away.stats.played++
        home.stats.goalsFor += r.homeGoals; home.stats.goalsAgainst += r.awayGoals
        away.stats.goalsFor += r.awayGoals; away.stats.goalsAgainst += r.homeGoals
        if (r.outcome === 'home') { home.stats.won++; home.stats.points += 3; away.stats.lost++ }
        else if (r.outcome === 'away') { away.stats.won++; away.stats.points += 3; home.stats.lost++ }
        else { home.stats.drawn++; home.stats.points++; away.stats.drawn++; away.stats.points++ }
        const seed = randomSeed()
        // §10.5 phase 4 — a skipped matchday still respects who's out, and still
        // feeds the ledger, or a skip mid-season would quietly heal everybody.
        const av = availabilityFor(availabilityRef.current, md, home.clubId, away.clubId)
        const lineupOpts = { ...lineupCtxRef.current, unavailableIds: av.unavailableIds, standIns: av.standIns }
        const scorers = attributeFixtureScorers(poolByClubRef.current, home.clubId, away.clubId, r.homeGoals, r.awayGoals, false, false, seed, lineupOpts)
        if (availabilityRef.current) recordMatchOutcome(availabilityRef.current, poolByClubRef.current, {
          matchday: md, homeClubId: home.clubId, awayClubId: away.clubId,
          seed, homeGoals: r.homeGoals, awayGoals: r.awayGoals, scorers, lineups: lineupOpts,
        })
        leagueHistoryRef.current.push({
          matchday: md,
          home: { clubId: home.clubId, clubName: home.clubName, isPlayer: home.isPlayer },
          away: { clubId: away.clubId, clubName: away.clubName, isPlayer: away.isPlayer },
          homeGoals: r.homeGoals, awayGoals: r.awayGoals, scorers, seed,
          absent: av.absent, standIns: av.standIns,
        })
      })
      clSnapshotsRef.current.push((sortByStats(teams) as CLTeam[]).map(t => ({ ...t, stats: { ...t.stats } })))
    }
    setSimTeams(teams)
    setClRestMD(clSnapshotsRef.current.length)
    setClViewMD(null)
    setCurrentMD(totalMatchdays)
    setRecentResults([])
    setPhase('completed')
  }
  // The confirm screen calls back after this render may be stale.
  clSkipRef.current = skipAll

  async function handleFinish() {
    if (finishingRef.current) return
    finishingRef.current = true
    setIsFinishing(true)
    koFinishedRef.current = false
    const sorted = sortByStats(simTeams) as CLTeam[]

    // §10.5 phase 4 — the pools have to exist BEFORE the bracket is simulated
    // now: each tie is priced with its absences and attributed the moment it's
    // decided, so an injury or a red card in one round is already in the ledger
    // when the next round kicks off. (They're normally loaded during the review
    // screen; this is the fallback for a run that got here first.)
    let pool = poolByClubRef.current
    let ctx = lineupCtxRef.current
    if (pool.size === 0) {
      try {
        const p = await loadLeaguePools(simTeams, fullSquad, clPoolYear, useSubstitutes)
        pool = p.poolByClub; ctx = lineupCtxOf(p)
        availabilityRef.current ??= createAvailabilityLedger({
          poolByClub: p.poolByClub, playerClubId: p.playerClubId,
          totalMatchdays: CL_TOTAL_MATCHDAYS,
        })
      } catch (e) { console.warn('[cl] pool load failed:', e) }
    }
    const koHook = availabilityRef.current && pool.size > 0
      ? clKnockoutAvailabilityHook({
          ledger: availabilityRef.current, poolByClub: pool, lineupCtx: ctx,
          playerFormation: formation ?? undefined, firstMatchday: totalMatchdays,
        })
      : undefined
    const result = simulateCLKnockoutsOnly(sorted, koHook)

    koStoredResultRef.current = {
      leaguePhaseStandings: sorted,
      ...result,
      leagueMatchdays: leagueHistoryRef.current,
      // Read AFTER the bracket, so knockout injuries and suspensions are on it.
      absences: availabilityRef.current?.absences() ?? [],
    }

    // Backstop: the hook already attributed every tie it saw, and this is
    // idempotent (it only fills matches with no scorers), so it just covers the
    // no-pools case where the hook couldn't run at all.
    try {
      attributeCLResultScorers(koStoredResultRef.current, pool, ctx)
    } catch (e) { console.warn('[cl] scorer attribution failed:', e) }

    // Fetch + attach named shootout kickers — ONE shared implementation used
    // by every mode (see attachCLShootoutNames in run-stats.ts).
    const allMatches: CLKnockoutMatch[] = [
      ...result.playoffRound, ...result.r16, ...result.qf, ...result.sf,
      ...(result.final ? [result.final] : []),
    ]
    await attachCLShootoutNames(allMatches, simTeams.find(t => t.isPlayer)?.clubId, fullSquad)

    function buildTie(m: CLKnockoutMatch): KnockoutTie {
      return {
        teamA: m.teamA, teamB: m.teamB, winner: m.winner,
        aGoals: m.aGoals, bGoals: m.bGoals,
        leg1: m.leg1, leg2: m.leg2, leg2ExtraTime: m.leg2ExtraTime,
        extraTime: m.extraTime,
        aPens: m.aPens, bPens: m.bPens,
        penKicksA: m.penKicksA, penKicksB: m.penKicksB,
        leg1Scorers: m.leg1Scorers, leg2Scorers: m.leg2Scorers, leg2ExtraTimeScorers: m.leg2ExtraTimeScorers,
        leg1Seed: m.leg1Seed, leg2Seed: m.leg2Seed,
        leg1Absent: m.leg1Absent, leg2Absent: m.leg2Absent,
        leg1StandIns: m.leg1StandIns, leg2StandIns: m.leg2StandIns,
      }
    }

    const rounds: KnockoutRound[] = [
      result.playoffRound.length > 0
        ? { round: 'playoff', label: 'Playoff Round', autoDelay: 2500, ties: result.playoffRound.map(buildTie) }
        : null,
      result.r16.length > 0
        ? { round: 'r16', label: 'Round of 16', autoDelay: 3000, ties: result.r16.map(buildTie) }
        : null,
      result.qf.length > 0
        ? { round: 'qf', label: 'Quarter-Finals', autoDelay: 4000, ties: result.qf.map(buildTie) }
        : null,
      result.sf.length > 0
        ? { round: 'sf', label: 'Semi-Finals', autoDelay: 5000, ties: result.sf.map(buildTie) }
        : null,
      result.final
        ? { round: 'final', label: 'UCL Final', autoDelay: 0, ties: [buildTie(result.final)] }
        : null,
    ].filter(Boolean) as KnockoutRound[]

    // If the player was eliminated in the league phase, there's no drama to
    // play through — jump straight to the results screen (which still shows the
    // full bracket of the teams that did qualify).
    if (result.playerFinalRound === 'league_exit') {
      setClResult(koStoredResultRef.current)
      koFinishedRef.current = true
      setIsFinishing(false)
      router.push('/game/awards?to=cl')
      return
    }

    setKoRounds(rounds)
    setKoVisibleCount(0)   // 0 = bracket preview first
    setIsFinishing(false)
    setPhase('knockout_phase')
  }

  // Split in two so §7's Deep Match can commit the run WITHOUT this screen
  // navigating: the Deep Match replaces itself with the result screen instead,
  // which is what stops the finished bracket flashing up in between.
  function commitKnockoutResult() {
    if (koFinishedRef.current) return
    koFinishedRef.current = true
    if (koStoredResultRef.current) setClResult(koStoredResultRef.current)
  }
  function finishKnockoutPhase() {
    if (koFinishedRef.current) return
    commitKnockoutResult()
    router.push('/game/awards?to=cl')
  }

  const sorted = sortByStats(simTeams)
  const playedCount = sorted.find(t => t.isPlayer)?.stats.played ?? 0

  // Matchday-results lookback across the league phase (all 18 games / matchday).
  const clAppliedMDs = [...new Set(leagueHistoryRef.current.map(m => m.matchday))].sort((a, b) => a - b)
  const clLatestMD   = clAppliedMDs[clAppliedMDs.length - 1] ?? 0
  const clViewing    = clViewMD == null ? clLatestMD : clViewMD
  const clViewIdx    = clAppliedMDs.indexOf(clViewing)
  const clAtLive     = clViewMD == null || clViewing >= clLatestMD
  const clShown      = leagueHistoryRef.current
    .filter(m => m.matchday === clViewing)
    .sort((a, b) => Number(b.home.isPlayer || b.away.isPlayer) - Number(a.home.isPlayer || a.away.isPlayer))

  // §10.5 — the competition timeline as it stands RIGHT NOW: the full league
  // phase (played fixtures filled in, the rest still to come) plus every
  // knockout round revealed so far. Rebuilt per tap rather than memoised
  // because the history and the revealed-round count are refs/state that move
  // constantly during a sim, and it's a few hundred rows at most.
  //
  // Both halves matter: without the unplayed fixtures, "next match" said every
  // side's campaign had ended in the middle of the league phase; without the
  // knockout rounds, a tie tapped live had no bracket and no next round.
  const clTimeline = (): ContextMatch[] => {
    const phase: ContextMatch[] = fixtures.map(f => {
      // One club never plays twice on the same matchday, so matchday + home id
      // identifies the fixture uniquely.
      const played = leagueHistoryRef.current.find(m => m.matchday === f.matchday && m.home.clubId === f.home.clubId)
      return {
        matchday: f.matchday, label: `League Phase · Matchday ${f.matchday}`,
        homeClubId: f.home.clubId, homeClubName: f.home.clubName,
        awayClubId: f.away.clubId, awayClubName: f.away.clubName,
        homeGoals: played?.homeGoals, awayGoals: played?.awayGoals,
        scorers: played?.scorers, seed: played?.seed,
        homeRotation: played?.homeRotation, awayRotation: played?.awayRotation,
        absent: played?.absent, standIns: played?.standIns,
      }
    })
    return appendKnockoutRounds(phase, koRounds.slice(0, koVisibleCount).map(r => ({
      label: r.label, ties: r.ties.map(t => knockoutTieToCLMatch(t, r.round)),
    })))
  }

  // §7 — the Deep Match, offered only when YOUR side is in the final. If you
  // were knocked out earlier the final plays out in the normal round list; the
  // finale is the player's payoff, not a cutscene for someone else's match.
  const clFinalRound = koRounds.find(r => r.round === 'final')
  const clPlayerFinal = clFinalRound?.ties.find(t => t.teamA.isPlayer || t.teamB.isPlayer) ?? null
  const openClDeepFinal = () => {
    if (!clFinalRound || !clPlayerFinal) return
    const detail = koTieToMatchDetailRequest(
      clPlayerFinal, clFinalRound.label, simTeams.find(t => t.isPlayer)?.clubId, fullSquad, clPoolYear,
      { playerFormation: formation ?? undefined },
    )
    openDeepMatch({
      detail,
      competitionLabel: 'UEFA Champions League',
      roundLabel: clFinalRound.label,
      accent: theme.accent,
      playerWon: clPlayerFinal.winner.isPlayer,
      playerClubName: (clPlayerFinal.teamA.isPlayer ? clPlayerFinal.teamA : clPlayerFinal.teamB).clubName,
      // "Final Results →" goes straight where every other run ends up. The
      // watched flag is set too, so a screen still mounted underneath shows the
      // settled final rather than the invitation to play it.
      onFinished: () => { setDeepFinalWatched(true); commitKnockoutResult() },
      resultRoute: '/game/awards?to=cl',
    })
  }

  // C2 (docs/ui-overhaul/07c) — the league phase on nylon, as the league
  // season: your result first, the table with the phase's three zones a beat
  // later, your eight as a strip. Knockouts keep their own view (C5).
  const clRows: TableRowVM[] = (clRestMD > 0 ? clSnapshotsRef.current[clRestMD - 1] : sortByStats(simTeams)).map(teamRow)
  const clYouPos = clRows.findIndex(r => r.isPlayer) + 1
  const clPrevPos = clRestMD > 1 ? clSnapshotsRef.current[clRestMD - 2].findIndex(t => t.isPlayer) + 1 : clYouPos
  const clHistoryYours = leagueHistoryRef.current.filter(m => m.home.isPlayer || m.away.isPlayer)
  const clMarks = clHistoryYours.map(m => markOf(m.home.isPlayer, m.homeGoals, m.awayGoals))
  const clCardMD = clViewMD ?? clLatestMD
  const clCard = clHistoryYours.find(m => m.matchday === clCardMD)
  const clTableMD = clViewMD ?? clRestMD
  const clTableRows = clViewMD != null && clSnapshotsRef.current[clViewMD - 1]
    ? clSnapshotsRef.current[clViewMD - 1].map(teamRow) : clRows
  const clOthers = clShown.filter(m => !(m.home.isPlayer || m.away.isPlayer))
  const clPending = clViewMD == null && clLatestMD > clRestMD
  const openClLeagueMatch = (m: CLLeagueMatch) => openMatchStats({
    homeClubId: m.home.clubId, homeName: m.home.clubName,
    awayClubId: m.away.clubId, awayName: m.away.clubName,
    homeGoals: m.homeGoals, awayGoals: m.awayGoals,
    scorers: m.scorers, seed: m.seed, yearStart: clPoolYear,
    homeRotation: m.homeRotation, awayRotation: m.awayRotation,
    absent: m.absent, standIns: m.standIns,
    competitionLabel: `League Phase · Matchday ${m.matchday}`,
    playerClubId: simTeams.find(t => t.isPlayer)?.clubId,
    playerFormation: formation ?? undefined,
    matchday: m.matchday, contextMatches: clTimeline(),
  }, theme.accent)
  const yourEight = fixtures
    .filter(f => f.home.isPlayer || f.away.isPlayer)
    .sort((a, b) => a.matchday - b.matchday)

  if (phase === 'knockout_phase') {
    return (
      <View style={[styles.container, { backgroundColor: nylon.bg }]}>
        {koVisibleCount === 0 && koRounds.length > 0 ? (
          <BracketPreview {...bracketPreviewProps(koRounds)} onStart={() => setKoVisibleCount(1)} />
        ) : (
          <KnockoutPhaseView
            rounds={koRounds}
            visibleCount={koVisibleCount}
            competitionLabel="UEFA Champions League"
            colourway={colourwayFor('champions_league')}
            onAbandon={() => askAbandon(() => {})}
            onFinish={finishKnockoutPhase}
            deepFinal={clPlayerFinal ? { watched: deepFinalWatched, onSeeLineups: openClDeepFinal } : undefined}
            onSkipToRound={(idx) => { setKoVisibleCount(idx + 1) }}
            onLiveDone={(k) => setKoLiveDone(d => ({ ...d, [k]: true }))}
            liveDone={koLiveDone}
            onTiePress={(tie, label) => tie.leg1
              ? openKoTie(knockoutTieToCLMatch(tie, label), { label, playerClubId: simTeams.find(t => t.isPlayer)?.clubId, drafted: fullSquad, yearStart: clPoolYear, accent: theme.accent })
              : openMatchStats((() => {
                  // §10.5 — the tie's REAL slot in the timeline: the bracket-so-far
                  // and "what did they play next" both hang off it.
                  const timeline = clTimeline()
                  return koTieToMatchDetailRequest(tie, label, simTeams.find(t => t.isPlayer)?.clubId, fullSquad, clPoolYear, {
                    playerFormation: formation ?? undefined,
                    matchday: koLegMatchday(timeline, tie.teamA.clubId, tie.teamB.clubId, label),
                    contextMatches: timeline,
                  })
                })(), theme.accent)}
          />
        )}
      </View>
    )
  }

  const clDone = phase === 'completed'
  const clStarted = phase !== 'review'
  return (
    <View style={[styles.container, { backgroundColor: nylon.bg }]}>
      <KitScreen ground="nylon" contentStyle={{ paddingBottom: space[4] }}>
        <RunHeader roles={nylon} stage={6} colourway={colourwayFor('champions_league')} back={false}
          title={clStarted ? undefined : 'The league phase'}
          right={<CloseRun onPress={() => askAbandon(() => setIsPlaying(false))} />} />
        <KitText t="tag" color={nylon.textMuted}>
          {`UEFA Champions League · 36 clubs · MD ${clLatestMD}/${totalMatchdays}`}
        </KitText>

        {!clStarted ? (
          <>
            <KitText t="bodyL" color={nylon.text} style={{ marginTop: space[2] }}>
              Top eight go straight to the round of 16. Ninth to 24th play a knockout play-off. The bottom twelve are out.
            </KitText>
            <SectionTag roles={nylon}>Your eight</SectionTag>
            {yourEight.map(f => (
              <FixtureRow key={f.matchday} roles={nylon} matchday={f.matchday}
                home={f.home.isPlayer} opponent={(f.home.isPlayer ? f.away : f.home).clubName}
                pot={(f.home.isPlayer ? f.away : f.home).pot} />
            ))}
            <ZoneLegend roles={nylon} zones={CL_PHASE_ZONES} />
          </>
        ) : (
          <>
            {clRows[clYouPos - 1] && (
              <StandingFigure roles={nylon} pos={clYouPos} delta={clPrevPos - clYouPos}
                zone={clRestMD > 0 ? CL_PHASE_ZONES[clYouPos - 1] : null} points={clRows[clYouPos - 1].points} />
            )}
            <SeasonStrip roles={nylon} marks={clMarks} total={totalMatchdays} viewing={clViewMD}
              onPick={md => { setClViewMD(md); if (md != null) setIsPlaying(false) }} />
            {clViewMD != null && <BackToLive md={clViewMD} onPress={() => setClViewMD(null)} />}
            {clCard && (
              <ScorelineCard roles={nylon} label={`MD ${clCard.matchday} · ${clCard.home.isPlayer ? 'HOME' : 'AWAY'}`}
                homeName={clCard.home.clubName} awayName={clCard.away.clubName}
                homeGoals={clCard.homeGoals} awayGoals={clCard.awayGoals} youHome={clCard.home.isPlayer}
                homeScorers={summariseScorers(clCard.scorers?.home) || undefined}
                awayScorers={summariseScorers(clCard.scorers?.away) || undefined}
                onPress={() => openClLeagueMatch(clCard)} />
            )}
            <SegmentSwitch<'table' | 'results' | 'fixtures'> roles={nylon} value={clTab} onChange={setClTab} options={[
              { id: 'table', label: 'Table' },
              { id: 'results', label: clTableMD > 0 ? `Results MD ${clViewMD ?? clLatestMD}` : 'Results' },
              { id: 'fixtures', label: 'Your eight' },
            ]} />
            {clTab === 'table' && (
              <>
                <LeagueTable roles={nylon} rows={clTableRows} zones={CL_PHASE_ZONES} moveMs={clViewMD == null ? 700 : undefined} muted={clRestMD === 0} />
                <ZoneLegend roles={nylon} zones={CL_PHASE_ZONES} />
              </>
            )}
            {clTab === 'results' && (clPending
              ? <KitText t="body" color={nylon.textMuted} style={{ paddingVertical: space[3] }}>Your match first. The rest of the matchday is coming in.</KitText>
              : clOthers.map((m, i) => (
                  <ResultRow key={i} roles={nylon} homeName={m.home.clubName} awayName={m.away.clubName}
                    homeGoals={m.homeGoals} awayGoals={m.awayGoals} youSide={null}
                    scorers={[summariseScorers(m.scorers?.home), summariseScorers(m.scorers?.away)].filter(Boolean).join(' · ') || undefined}
                    onPress={() => openClLeagueMatch(m)} />
                )))}
            {clTab === 'fixtures' && yourEight.map(f => {
              const played = clHistoryYours.find(m => m.matchday === f.matchday)
              const youHome = f.home.isPlayer
              return (
                <FixtureRow key={f.matchday} roles={nylon} matchday={f.matchday} home={youHome}
                  opponent={(youHome ? f.away : f.home).clubName} pot={(youHome ? f.away : f.home).pot}
                  result={played ? { mine: youHome ? played.homeGoals : played.awayGoals, theirs: youHome ? played.awayGoals : played.homeGoals } : undefined} />
              )
            })}
          </>
        )}
      </KitScreen>

      <ThumbBar>
        {clStarted && !clDone && (
          <Plate label="Skip to the last matchday" icon="skip" variant="secondary" roles={nylon}
            onPress={() => askSkip(`Matchdays ${currentMD} to ${totalMatchdays} are played at once.`, () => setIsPlaying(false), () => clSkipRef.current())} />
        )}
        {!clStarted ? (
          <Plate label="Start the league phase" icon="play" roles={nylon}
            onPress={() => { setPhase('simulating'); setIsPlaying(true) }} />
        ) : clDone ? (
          <Plate label={sortByStats(simTeams).findIndex(t => t.isPlayer) >= 24 ? 'See how it ends' : 'Open the knockout draw'}
            icon="forward" roles={nylon} onPress={handleFinish} loading={isFinishing} />
        ) : (
          <Plate label={isPlaying ? 'Pause' : `Play matchday ${currentMD}`} icon={isPlaying ? 'pause' : 'play'} roles={nylon}
            onPress={() => setIsPlaying(p => !p)} />
        )}
      </ThumbBar>
    </View>
  )
}

// ── World Cup Simulation ─────────────────────────────────────────────────────

function WCSimulation() {
  const { draftedPlayers, benchPlayers, useSubstitutes, formation, wcTeams, setWcResult, testForceWinUntilFinal } = useGameStore()
  const fullSquad = [...draftedPlayers, ...benchPlayers]

  const slots        = formation ? getSlotsForFormation(formation) : []
  const baseTeamOvr  = formation && draftedPlayers.length > 0 ? calcTeamOvr(draftedPlayers, slots) : 0
  const totalTeamOvr = baseTeamOvr

  const [phase,         setPhase]         = useState<SimPhase>('review')
  useSimBackGuard(phase !== 'review')   // §3 — active once the group stage starts simulating
  const [currentMD,     setCurrentMD]     = useState(1)
  const [simTeams,      setSimTeams]      = useState<WCTeam[]>([])
  const [groups,        setGroups]        = useState<WCGroup[]>([])
  const [fixtures,      setFixtures]      = useState<{ matchday: number; home: WCTeam; away: WCTeam }[]>([])
  const [recentResults, setRecentResults] = useState<CompMatchResult[]>([])
  const [isPlaying,     setIsPlaying]     = useState(false)
  // Your group match plays out on a live clock each matchday before the board
  // updates. playedMD = last matchday simulated; pending holds the computed
  // result until the clock finishes (so the standings don't spoil the score).
  const [livePlayerMatch, setLivePlayerMatch] = useState<{ result: CompMatchResult; md: number } | null>(null)
  const [playedMD,        setPlayedMD]        = useState(0)
  const [wcViewMD,        setWcViewMD]        = useState<number | null>(null)  // other-matches lookback (null = latest)
  const pendingMDRef = useRef<{ teams: WCTeam[]; results: CompMatchResult[]; md: number } | null>(null)
  // World Cup group stage always runs at "slow" — the pace is locked.
  const speed: Speed = 'slow'
  const theme = MODE_THEMES.world_cup
  const [isFinishing,   setIsFinishing]   = useState(false)
  const finishingRef = useRef(false)   // bulletproof re-entry guard (state lags a tap)

  // WC Knockout phase state
  const [wcKoRounds,       setWcKoRounds]       = useState<KnockoutRound[]>([])
  // §7 R6 — see the UCL screen above: watched once, then never again.
  const [wcDeepFinalWatched, setWcDeepFinalWatched] = useState(false)
  const [wcKoVisibleCount, setWcKoVisibleCount] = useState(0)
  const [wcKoLiveDone,     setWcKoLiveDone]     = useState<Record<string, boolean>>({})
  const wcKoStoredResultRef = useRef<WCSeasonResult | null>(null)
  const wcKoFinishedRef = useRef(false)
  // Records every group-stage result so the results screen can show matchdays.
  const groupHistoryRef = useRef<WCGroupMatch[]>([])
  // Scorer pools, loaded once so group-stage goalscorers show live.
  const poolByClubRef = useRef<Map<string, RosterPlayer[]>>(new Map())
  // §10.5 — carried alongside the pools so every attribution in this screen
  // selects the same eleven the stat sheet will regenerate later.
  const lineupCtxRef = useRef<{ playerClubId?: string; benchSize?: number }>({})
  // §10.5 phase 4 — sequential availability; see the league sim above.
  const availabilityRef = useRef<AvailabilityLedger | null>(null)
  useEffect(() => {
    if (!wcTeams || wcTeams.length === 0 || draftedPlayers.length === 0) return
    loadLeaguePools(wcTeams, fullSquad, 2026, useSubstitutes)
      .then(p => {
        poolByClubRef.current = p.poolByClub
        lineupCtxRef.current = { playerClubId: p.playerClubId, benchSize: p.benchSize }
        availabilityRef.current = createAvailabilityLedger({
          // Groups plus the whole bracket — a group-stage injury can rule
          // somebody out of the quarter-finals.
          poolByClub: p.poolByClub, playerClubId: p.playerClubId,
          totalMatchdays: WC_TOTAL_MATCHDAYS,
        })
      })
      .catch(e => console.warn('[wc] pool load failed:', e))
  }, [wcTeams])

  useEffect(() => {
    if (phase !== 'knockout_phase' || wcKoVisibleCount < 1) return
    const currentRound = wcKoRounds[wcKoVisibleCount - 1]
    if (!currentRound) return
    const playerTie = currentRound.ties.find(t => t.teamA.isPlayer || t.teamB.isPlayer)
    if (playerTie && !wcKoLiveDone[currentRound.round]) return   // hold until the live match finishes
    if (wcKoVisibleCount < wcKoRounds.length) {
      const t = setTimeout(() => setWcKoVisibleCount(p => p + 1), playerTie ? 1600 : (currentRound.autoDelay ?? 3000))
      return () => clearTimeout(t)
    }
  }, [phase, wcKoVisibleCount, wcKoRounds, wcKoLiveDone])

  const totalMatchdays = 3

  useEffect(() => {
    if (!wcTeams) return
    const teams: WCTeam[] = wcTeams.map(t => ({
      ...t,
      ovr:  t.isPlayer ? totalTeamOvr : t.ovr,
      form: 0,
      stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
    }))
    const assignedGroups = assignGroups(teams)
    setGroups(assignedGroups)
    setSimTeams(teams)
    setFixtures(generateWCGroupFixtures(assignedGroups))
  }, [wcTeams, totalTeamOvr])

  // Play the current matchday (once), then hold for the live clock.
  useEffect(() => {
    if (phase !== 'simulating' || !isPlaying) return
    if (playedMD >= currentMD || currentMD > totalMatchdays) return
    const timer = setTimeout(() => playMatchday(currentMD), SPEED_MS[speed])
    return () => clearTimeout(timer)
  }, [phase, isPlaying, currentMD, playedMD, simTeams, fixtures, speed])

  // Advance to the next matchday once this one's live clock has finished.
  useEffect(() => {
    if (phase !== 'simulating' || !isPlaying) return
    if (playedMD !== currentMD || livePlayerMatch || pendingMDRef.current) return
    const timer = setTimeout(() => {
      if (currentMD >= totalMatchdays) { setIsPlaying(false); setPhase('group_review') }
      else setCurrentMD(m => m + 1)
    }, 900)
    return () => clearTimeout(timer)
  }, [phase, isPlaying, currentMD, playedMD, livePlayerMatch])

  // Sending-offs for the live group match, from the same seed the modal uses.
  // Must run before the early return below — every hook in a component has to
  // fire on every render, or React loses track of hook order between renders
  // (this one used to sit after the guard and only ran once wcTeams was ready,
  // which crashed with "Rendered fewer hooks than expected" on the loading pass).
  const liveGroupReds = React.useMemo<LiveRedCard[]>(
    () => livePlayerMatch ? liveRedsFor(livePlayerMatch.result, poolByClubRef.current) : [],
    [livePlayerMatch],
  )

  const [wcTab, setWcTab] = useState<'group' | 'thirds' | 'results' | 'groups'>('group')
  const wcSkipRef = useRef<() => void>(() => {})

  if (!wcTeams || !formation || draftedPlayers.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: nylon.bg, padding: space[4], justifyContent: 'center', gap: space[4] }]}>
        <EmptyState roles={nylon} title="No FIFA World Cup data found" body="This run lost its squad or draw, usually after a reload. Start a new one." />
        <Plate label="Start a new run" roles={nylon} onPress={() => router.replace('/game/mode-select')} />
      </View>
    )
  }

  // Big Fixes §12 "Test final game" dev tool: while active, force any group
  // match the player's team plays to a clean 1-0 win instead of the real
  // simulation — the live clock/reveal still plays out normally, only the
  // result is fixed. Every other fixture (not involving the player) is
  // untouched. Knockout ties are forced the same way in buildWcKoRounds below.
  function simGroupMatch(home: WCTeam, away: WCTeam): MatchResult {
    if (testForceWinUntilFinal && (home.isPlayer || away.isPlayer)) {
      return { homeGoals: home.isPlayer ? 1 : 0, awayGoals: away.isPlayer ? 1 : 0, outcome: home.isPlayer ? 'home' : 'away', isUpset: false }
    }
    return simulateMatch(home, away)
  }

  // Simulate a matchday into a PENDING buffer — nothing is shown yet. If the
  // player has a match, we surface it as a live clock and apply once it ends;
  // otherwise we apply immediately.
  function playMatchday(md: number) {
    const mdFixtures = fixtures.filter(f => f.matchday === md)
    // Clone stats so the visible standings stay on the pre-matchday state until apply.
    const teams = simTeams.map(t => ({ ...t, stats: { ...t.stats } }))
    const results: CompMatchResult[] = []

    mdFixtures.forEach(({ home: h, away: a }) => {
      const home = teams.find(t => t.clubId === h.clubId)!
      const away = teams.find(t => t.clubId === a.clubId)!
      // §10.5 — stakes are decided INSIDE the group: top two go through, so a
      // nation already mathematically qualified (or already out) can rest
      // people, which in a three-game group is realistically the last round.
      const seed = randomSeed()
      const wcStakes = {
        standings: teams.filter(t => t.groupId === home.groupId).map(t => ({ clubId: t.clubId, points: t.stats.points })),
        totalMatchdays: WC_GROUP_MATCHDAYS, playedMatchdays: md - 1, qualifyCutoff: 2,
      }
      const rot = {
        home: home.isPlayer ? 0 : rotationFor({ ...wcStakes, clubId: home.clubId }),
        away: away.isPlayer ? 0 : rotationFor({ ...wcStakes, clubId: away.clubId }),
      }
      // §10.5 phase 4 — see the league sim.
      const av = availabilityFor(availabilityRef.current, md, home.clubId, away.clubId)
      const lineupOpts = {
        ...lineupCtxRef.current, homeRotation: rot.home, awayRotation: rot.away,
        unavailableIds: av.unavailableIds, standIns: av.standIns,
      }
      const eff = effectiveMatchOvrs(
        poolByClubRef.current.get(home.clubId) ?? [], poolByClubRef.current.get(away.clubId) ?? [],
        {
          seed, ...lineupOpts,
          homeBaseOvr: home.ovr + av.homeOvrDelta, awayBaseOvr: away.ovr + av.awayOvrDelta,
        },
      )
      const r    = simGroupMatch({ ...home, ovr: eff.homeOvr }, { ...away, ovr: eff.awayOvr })

      home.stats.played++; away.stats.played++
      home.stats.goalsFor += r.homeGoals; home.stats.goalsAgainst += r.awayGoals
      away.stats.goalsFor += r.awayGoals; away.stats.goalsAgainst += r.homeGoals

      if (r.outcome === 'home') { home.stats.won++; home.stats.points += 3; away.stats.lost++ }
      else if (r.outcome === 'away') { away.stats.won++; away.stats.points += 3; home.stats.lost++ }
      else { home.stats.drawn++; home.stats.points++; away.stats.drawn++; away.stats.points++ }

      const upd = (t: WCTeam, out: 'win' | 'draw' | 'loss') => {
        t.form = Math.max(-1, Math.min(1, t.form * 0.85 + (out === 'win' ? 0.15 : out === 'draw' ? 0 : -0.15)))
      }
      upd(home, r.outcome === 'home' ? 'win' : r.outcome === 'draw' ? 'draw' : 'loss')
      upd(away, r.outcome === 'away' ? 'win' : r.outcome === 'draw' ? 'draw' : 'loss')

      const scorers = attributeFixtureScorers(poolByClubRef.current, home.clubId, away.clubId, r.homeGoals, r.awayGoals, false, false, seed, lineupOpts)
      results.push({ home, away, homeGoals: r.homeGoals, awayGoals: r.awayGoals, outcome: r.outcome, scorers, seed, homeRotation: rot.home, awayRotation: rot.away, absent: av.absent, standIns: av.standIns })
      if (availabilityRef.current) recordMatchOutcome(availabilityRef.current, poolByClubRef.current, {
        matchday: md, homeClubId: home.clubId, awayClubId: away.clubId,
        seed, homeGoals: r.homeGoals, awayGoals: r.awayGoals, scorers, lineups: lineupOpts,
      })
    })

    const sorted = [...results].sort((a, b) => Number(b.home.isPlayer || b.away.isPlayer) - Number(a.home.isPlayer || a.away.isPlayer))
    pendingMDRef.current = { teams, results: sorted, md }
    setPlayedMD(md)

    const playerResult = results.find(r => r.home.isPlayer || r.away.isPlayer)
    if (playerResult) setLivePlayerMatch({ result: playerResult, md })
    else applyMatchday()   // no player match this round — reveal immediately
  }

  // Keep the `groups` state (which the standings, group review, and knockout
  // seeding all read) pointing at the SAME team objects as simTeams — otherwise
  // stat updates on the new team array never reach the grouped views.
  function syncGroupsTo(teams: WCTeam[]) {
    const byId = new Map(teams.map(t => [t.clubId, t]))
    setGroups(prev => prev.map(g => ({ id: g.id, teams: g.teams.map(t => byId.get(t.clubId) ?? t) })))
  }

  // Commit the pending matchday: record history, update standings + board.
  function applyMatchday() {
    const pend = pendingMDRef.current
    if (!pend) return
    pend.results.forEach(r => {
      groupHistoryRef.current.push({
        groupId: (r.home as WCTeam).groupId, matchday: pend.md,
        home: { clubId: r.home.clubId, clubName: r.home.clubName, isPlayer: r.home.isPlayer },
        away: { clubId: r.away.clubId, clubName: r.away.clubName, isPlayer: r.away.isPlayer },
        homeGoals: r.homeGoals, awayGoals: r.awayGoals, scorers: r.scorers, seed: r.seed,
        homeRotation: r.homeRotation, awayRotation: r.awayRotation,
        absent: r.absent, standIns: r.standIns,
      })
    })
    setSimTeams(pend.teams)
    syncGroupsTo(pend.teams)
    setRecentResults(pend.results)
    setLivePlayerMatch(null)
    pendingMDRef.current = null
  }

  function skipAll() {
    setIsPlaying(false)
    setLivePlayerMatch(null)
    pendingMDRef.current = null
    // Resume from the next UNPLAYED matchday (simTeams is the source of truth for
    // what's been applied), so a mid-clock skip never double-counts.
    const startMd = (simTeams.find(t => t.isPlayer)?.stats.played ?? currentMD - 1) + 1
    let teams = simTeams.map(t => ({ ...t, stats: { ...t.stats } }))
    for (let md = startMd; md <= totalMatchdays; md++) {
      fixtures.filter(f => f.matchday === md).forEach(({ home: h, away: a }) => {
        const home = teams.find(t => t.clubId === h.clubId)!
        const away = teams.find(t => t.clubId === a.clubId)!
        const r = simGroupMatch(home, away)
        home.stats.played++; away.stats.played++
        home.stats.goalsFor += r.homeGoals; home.stats.goalsAgainst += r.awayGoals
        away.stats.goalsFor += r.awayGoals; away.stats.goalsAgainst += r.homeGoals
        if (r.outcome === 'home') { home.stats.won++; home.stats.points += 3; away.stats.lost++ }
        else if (r.outcome === 'away') { away.stats.won++; away.stats.points += 3; home.stats.lost++ }
        else { home.stats.drawn++; home.stats.points++; away.stats.drawn++; away.stats.points++ }
        const seed = randomSeed()
        // §10.5 phase 4 — see the CL skip: a skip still respects availability.
        const av = availabilityFor(availabilityRef.current, md, home.clubId, away.clubId)
        const lineupOpts = { ...lineupCtxRef.current, unavailableIds: av.unavailableIds, standIns: av.standIns }
        const scorers = attributeFixtureScorers(poolByClubRef.current, home.clubId, away.clubId, r.homeGoals, r.awayGoals, false, false, seed, lineupOpts)
        if (availabilityRef.current) recordMatchOutcome(availabilityRef.current, poolByClubRef.current, {
          matchday: md, homeClubId: home.clubId, awayClubId: away.clubId,
          seed, homeGoals: r.homeGoals, awayGoals: r.awayGoals, scorers, lineups: lineupOpts,
        })
        groupHistoryRef.current.push({
          groupId: home.groupId, matchday: md,
          home: { clubId: home.clubId, clubName: home.clubName, isPlayer: home.isPlayer },
          away: { clubId: away.clubId, clubName: away.clubName, isPlayer: away.isPlayer },
          homeGoals: r.homeGoals, awayGoals: r.awayGoals, scorers, seed,
          absent: av.absent, standIns: av.standIns,
        })
      })
    }
    setSimTeams(teams)
    syncGroupsTo(teams)
    setPlayedMD(totalMatchdays)
    setCurrentMD(totalMatchdays)
    setRecentResults([])
    setPhase('group_review')
  }
  // The confirm screen calls back after this render may be stale.
  wcSkipRef.current = skipAll

  async function handleFinish() {
    if (finishingRef.current) return
    finishingRef.current = true
    setIsFinishing(true)
    wcKoFinishedRef.current = false

    const clonedGroups: WCGroup[] = groups.map(g => ({
      id: g.id,
      teams: g.teams.map(t => ({ ...t, stats: { ...t.stats } })),
    }))
    // §10.5 phase 4 — pools first: every tie is priced with its absences and
    // attributed as soon as it's decided, so a suspension picked up in the round
    // of 32 is already in the ledger by the round of 16. (Normally loaded during
    // the review screen; this covers a run that reached here first.)
    let pool = poolByClubRef.current
    let ctx = lineupCtxRef.current
    if (pool.size === 0) {
      try {
        const p = await loadLeaguePools(simTeams, fullSquad, 2026, useSubstitutes)
        pool = p.poolByClub; ctx = lineupCtxOf(p)
        availabilityRef.current ??= createAvailabilityLedger({
          poolByClub: p.poolByClub, playerClubId: p.playerClubId,
          totalMatchdays: WC_TOTAL_MATCHDAYS,
        })
      } catch (e) { console.warn('[wc] pool load failed:', e) }
    }
    const koHook = availabilityRef.current && pool.size > 0
      ? wcKnockoutAvailabilityHook({
          ledger: availabilityRef.current, poolByClub: pool, lineupCtx: ctx,
          playerFormation: formation ?? undefined, firstMatchday: WC_GROUP_MATCHDAYS,
        })
      : undefined

    // Big Fixes §12: force the player's own tie in every round up to (not
    // including) the final — see simulateWCKnockoutsForceToFinal for details.
    // The dev-only forcing path takes no hook; it isn't a real run.
    const result = testForceWinUntilFinal
      ? simulateWCKnockoutsForceToFinal(clonedGroups, simTeams)
      : simulateWCKnockoutsOnly(clonedGroups, simTeams, koHook)

    wcKoStoredResultRef.current = {
      groups: clonedGroups, ...result, groupMatchdays: groupHistoryRef.current,
      // Read AFTER the bracket, so knockout absences are on the medical table.
      absences: availabilityRef.current?.absences() ?? [],
    }

    // Backstop: the hook already attributed every tie it saw, and this is
    // idempotent, so it only fills in when the hook couldn't run at all.
    try {
      attributeWCResultScorers(wcKoStoredResultRef.current, pool, ctx)
    } catch (e) { console.warn('[wc] scorer attribution failed:', e) }

    // Fetch + attach named shootout kickers — ONE shared implementation used
    // by every mode (see attachWCShootoutNames in run-stats.ts).
    const allWCMatches = result.knockoutRounds.flatMap(r => r.matches)
    await attachWCShootoutNames(allWCMatches, simTeams.find(t => t.isPlayer)?.clubId, fullSquad)

    function buildWCTie(m: WCKnockoutMatch): KnockoutTie {
      const { result: r } = m
      return {
        teamA: m.teamA, teamB: m.teamB, winner: m.winner,
        aGoals: r.homeGoals, bGoals: r.awayGoals,
        extraTime: r.extraTime,
        aPens: r.homePens ?? undefined,
        bPens: r.awayPens ?? undefined,
        penKicksA: m.penKicksA, penKicksB: m.penKicksB,
        scorers: m.scorers, seed: m.seed,
        absent: m.absent, standIns: m.standIns,
      }
    }

    const ROUND_DELAYS: Record<string, number> = {
      r32: 1500, r16: 2500, qf: 4000, sf: 5000, third: 4500, final: 0,
    }
    const ROUND_LABELS: Record<string, string> = {
      r32: 'Round of 32', r16: 'Round of 16', qf: 'Quarter-Finals', sf: 'Semi-Finals', third: 'Third-Place Playoff', final: 'FIFA World Cup Final',
    }

    const wcRounds: KnockoutRound[] = result.knockoutRounds.map(r => ({
      round: r.round,
      label: ROUND_LABELS[r.round] ?? r.round,
      autoDelay: ROUND_DELAYS[r.round] ?? 3000,
      ties: r.matches.map(buildWCTie),
    }))

    // If the player was knocked out in the group stage, there's no drama to
    // play through — jump straight to the results screen (which still shows the
    // full bracket of the teams that did qualify).
    if (result.playerFinalRound === 'groups') {
      setWcResult(wcKoStoredResultRef.current)
      wcKoFinishedRef.current = true
      setIsFinishing(false)
      router.push('/game/awards?to=wc')
      return
    }

    setWcKoRounds(wcRounds)
    setWcKoVisibleCount(0)   // 0 = bracket preview first
    setIsFinishing(false)
    setPhase('knockout_phase')
  }

  // See the UCL screen: the commit is separate so §7 can finish the run itself.
  function commitWCKnockoutResult() {
    if (wcKoFinishedRef.current) return
    wcKoFinishedRef.current = true
    if (wcKoStoredResultRef.current) setWcResult(wcKoStoredResultRef.current)
  }
  function finishWCKnockoutPhase() {
    if (wcKoFinishedRef.current) return
    commitWCKnockoutResult()
    router.push('/game/awards?to=wc')
  }

  // Find player's group for the left standings panel
  const playerGroup = groups.find(g => g.teams.some(t => t.isPlayer))
  const playerGroupSorted = playerGroup
    ? [...playerGroup.teams].sort((a, b) => {
        if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points
        const gd = (b.stats.goalsFor - b.stats.goalsAgainst) - (a.stats.goalsFor - a.stats.goalsAgainst)
        return gd !== 0 ? gd : b.stats.goalsFor - a.stats.goalsFor
      })
    : []
  const playedCount = playerGroupSorted.find(t => t.isPlayer)?.stats.played ?? 0

  // Other-matches lookback: every matchday already applied (all groups), newest
  // last. Drives the "Other Matches" card so you can scrub back through rounds.
  const wcAppliedMDs = [...new Set(groupHistoryRef.current.map(m => m.matchday))].sort((a, b) => a - b)
  const wcLatestMD   = wcAppliedMDs[wcAppliedMDs.length - 1] ?? 0
  const wcViewing    = wcViewMD == null ? wcLatestMD : wcViewMD
  const wcViewIdx    = wcAppliedMDs.indexOf(wcViewing)
  const wcAtLive     = wcViewMD == null || wcViewing >= wcLatestMD
  const wcShown      = groupHistoryRef.current
    .filter(m => m.matchday === wcViewing)
    .sort((a, b) => Number(b.home.isPlayer || b.away.isPlayer) - Number(a.home.isPlayer || a.away.isPlayer))

  // §10.5 — the World Cup timeline as it stands right now: all three group
  // matchdays for EVERY group (played ones filled in, the rest still to come)
  // followed by each knockout round revealed so far.
  //
  // `tableGroup` is the only group whose games feed a standings table — a World
  // Cup group is its own mini-league, and lumping all twelve into one table was
  // producing a nonsense 48-nation "league phase" above every knockout tie.
  // Pass null for a knockout tie: the two sides may come from different groups,
  // so there IS no shared table and the screen shows the bracket instead. Every
  // group game still has to be present either way, or the other side's form
  // would come up empty.
  const wcTimeline = (tableGroup: string | null): ContextMatch[] => {
    const phase: ContextMatch[] = fixtures.map(f => {
      const played = groupHistoryRef.current.find(m => m.matchday === f.matchday && m.home.clubId === f.home.clubId)
      const groupId = f.home.groupId ?? ''
      return {
        matchday: f.matchday, label: `Group ${groupId} · Matchday ${f.matchday}`,
        inTable: groupId === tableGroup,
        homeClubId: f.home.clubId, homeClubName: f.home.clubName,
        awayClubId: f.away.clubId, awayClubName: f.away.clubName,
        homeGoals: played?.homeGoals, awayGoals: played?.awayGoals,
        scorers: played?.scorers, seed: played?.seed,
        homeRotation: played?.homeRotation, awayRotation: played?.awayRotation,
        absent: played?.absent, standIns: played?.standIns,
      }
    })
    return appendKnockoutRounds(phase, wcKoRounds.slice(0, wcKoVisibleCount).map(r => ({
      label: r.label, ties: r.ties.map(t => knockoutTieToCLMatch(t, r.round)),
    })))
  }

  // §7 — the World Cup final, same contract as the UCL screen above. The World
  // Cup keys its ceremony off the competition label, which is how it gets the
  // globe trophy instead of the cup.
  const wcFinalRound = wcKoRounds.find(r => r.round === 'final')
  const wcPlayerFinal = wcFinalRound?.ties.find(t => t.teamA.isPlayer || t.teamB.isPlayer) ?? null
  const openWcDeepFinal = () => {
    if (!wcFinalRound || !wcPlayerFinal) return
    const detail = koTieToMatchDetailRequest(
      wcPlayerFinal, wcFinalRound.label, simTeams.find(t => t.isPlayer)?.clubId, fullSquad, 2026,
      { playerFormation: formation ?? undefined },
    )
    openDeepMatch({
      detail,
      competitionLabel: 'FIFA World Cup',
      roundLabel: wcFinalRound.label,
      accent: theme.accent,
      playerWon: wcPlayerFinal.winner.isPlayer,
      playerClubName: (wcPlayerFinal.teamA.isPlayer ? wcPlayerFinal.teamA : wcPlayerFinal.teamB).clubName,
      onFinished: () => { setWcDeepFinalWatched(true); commitWCKnockoutResult() },
      resultRoute: '/game/awards?to=wc',
    })
  }

  // C3 (docs/ui-overhaul/07c) — the group stage on nylon. Your group is the
  // table; the race for the eight best third places runs live beside it,
  // because that's the World Cup's real drama; the other eleven groups are a
  // wall you can open. Knockouts keep their own view (C5).
  const wcSortFn = (a: WCTeam, b: WCTeam) => {
    if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points
    const gdDiff = (b.stats.goalsFor - b.stats.goalsAgainst) - (a.stats.goalsFor - a.stats.goalsAgainst)
    return gdDiff !== 0 ? gdDiff : b.stats.goalsFor - a.stats.goalsFor
  }
  const wcSortedGroups = groups.map(g => ({ ...g, teams: [...g.teams].sort(wcSortFn) }))
  const wcThirds = wcSortedGroups.map(g => g.teams[2]).filter(Boolean).sort(wcSortFn)
  const wcFlagRow = (t: WCTeam, note?: string): TableRowVM => ({ ...teamRow(t), flag: getFlag(t.clubId), note })
  const wcWall: MiniGroup[] = wcSortedGroups.map(g => ({
    id: g.id, you: g.teams.some(t => t.isPlayer),
    rows: g.teams.map(t => ({ clubId: t.clubId, clubName: t.clubName, flag: getFlag(t.clubId), points: t.stats.points, isPlayer: t.isPlayer })),
  }))
  const wcYourSorted = wcSortedGroups.find(g => g.teams.some(t => t.isPlayer))?.teams ?? []
  const wcYourIdx = wcYourSorted.findIndex(t => t.isPlayer)
  const wcYouThird = wcThirds.findIndex(t => t.isPlayer)
  const wcFate = wcYourIdx === 0 ? { text: 'Through as winners', good: true }
    : wcYourIdx === 1 ? { text: 'Through in second', good: true }
    : wcYourIdx === 2 && wcYouThird >= 0 && wcYouThird < 8 ? { text: 'Through in third', good: true }
    : { text: 'Out', good: false }
  const wcYourMatches = groupHistoryRef.current.filter(m => m.home.isPlayer || m.away.isPlayer)
  const wcMarks = wcYourMatches.map(m => markOf(m.home.isPlayer, m.homeGoals, m.awayGoals))
  const wcOthers = wcShown.filter(m => !(m.home.isPlayer || m.away.isPlayer))
  const openWcGroupMatch = (m: WCGroupMatch) => openMatchStats({
    homeClubId: m.home.clubId, homeName: m.home.clubName,
    awayClubId: m.away.clubId, awayName: m.away.clubName,
    homeGoals: m.homeGoals, awayGoals: m.awayGoals,
    scorers: m.scorers, seed: m.seed, yearStart: 2026,
    homeRotation: m.homeRotation, awayRotation: m.awayRotation,
    absent: m.absent, standIns: m.standIns,
    competitionLabel: `Group ${m.groupId} · Matchday ${m.matchday}`,
    playerClubId: simTeams.find(t => t.isPlayer)?.clubId,
    playerFormation: formation ?? undefined,
    matchday: m.matchday, contextMatches: wcTimeline(m.groupId),
  }, theme.accent)
  const openGroupSim = (id: string) => {
    const g = groups.find(x => x.id === id)
    if (g) openWCGroup(g, groupHistoryRef.current.filter(m => m.groupId === id), openWcGroupMatch)
  }

  if (phase === 'knockout_phase') {
    return (
      <View style={[styles.container, { backgroundColor: nylon.bg }]}>
        {wcKoVisibleCount === 0 && wcKoRounds.length > 0 ? (
          <BracketPreview {...bracketPreviewProps(wcKoRounds)} onStart={() => setWcKoVisibleCount(1)} />
        ) : (
          <KnockoutPhaseView
            rounds={wcKoRounds}
            visibleCount={wcKoVisibleCount}
            competitionLabel="FIFA World Cup"
            colourway={colourwayFor('world_cup')}
            onAbandon={() => askAbandon(() => {})}
            onFinish={finishWCKnockoutPhase}
            deepFinal={wcPlayerFinal ? { watched: wcDeepFinalWatched, onSeeLineups: openWcDeepFinal } : undefined}
            onSkipToRound={(idx) => { setWcKoVisibleCount(idx + 1) }}
            onLiveDone={(k) => setWcKoLiveDone(d => ({ ...d, [k]: true }))}
            liveDone={wcKoLiveDone}
            onTiePress={(tie, label) => openMatchStats((() => {
              // The tie's real slot in the timeline (see clTimeline).
              const timeline = wcTimeline(null)
              return koTieToMatchDetailRequest(tie, label, simTeams.find(t => t.isPlayer)?.clubId, fullSquad, 2026, {
                playerFormation: formation ?? undefined,
                matchday: koLegMatchday(timeline, tie.teamA.clubId, tie.teamB.clubId, label),
                contextMatches: timeline,
              })
            })(), theme.accent)}
          />
        )}
      </View>
    )
  }

  const wcStage = phase === 'review' ? 'draw' : phase === 'group_review' ? 'done' : 'live'
  return (
    <View style={[styles.container, { backgroundColor: nylon.bg }]}>
      <KitScreen ground="nylon" contentStyle={{ paddingBottom: space[4] }}>
        <RunHeader roles={nylon} stage={6} colourway={colourwayFor('world_cup')} back={false}
          title={wcStage === 'draw' ? 'The group draw' : undefined}
          right={<CloseRun onPress={() => askAbandon(() => {})} />} />
        <KitText t="tag" color={nylon.textMuted}>
          {`FIFA World Cup 2026 · ${playerGroup ? `Group ${playerGroup.id}` : '12 groups'} · ${wcStage === 'done' ? 'Groups complete' : `Round ${Math.max(playedCount, livePlayerMatch?.md ?? 0)}/${totalMatchdays}`}`}
        </KitText>

        {wcStage === 'draw' && (
          <>
            <KitText t="bodyL" color={nylon.text} style={{ marginTop: space[2] }}>Top two in each group go through.</KitText>
            <KitText t="bodyL" color={nylon.text}>The eight best third-placed teams also go through.</KitText>
            {playerGroup && (
              <>
                <SectionTag roles={nylon}>{`Your group · ${playerGroup.id}`}</SectionTag>
                {fixtures.filter(f => f.home.isPlayer || f.away.isPlayer).sort((a, b) => a.matchday - b.matchday).map(f => {
                  const opp = f.home.isPlayer ? f.away : f.home
                  return <FixtureRow key={f.matchday} roles={nylon} matchday={f.matchday} home={f.home.isPlayer} opponent={opp.clubName} flag={getFlag(opp.clubId)} />
                })}
              </>
            )}
            <SectionTag roles={nylon}>Every group</SectionTag>
            <GroupWall roles={nylon} groups={wcWall} onOpen={openGroupSim} />
          </>
        )}

        {wcStage === 'live' && (
          <>
            <SeasonStrip roles={nylon} marks={wcMarks} total={totalMatchdays} viewing={null} onPick={() => {}} />
            {livePlayerMatch ? (
              <LiveMatch
                key={`wc-md-${livePlayerMatch.md}`}
                teamA={livePlayerMatch.result.home}
                teamB={livePlayerMatch.result.away}
                periods={[{
                  label: `Group ${playerGroup?.id ?? ''} · Matchday ${livePlayerMatch.md}`,
                  homeId: livePlayerMatch.result.home.clubId,
                  awayId: livePlayerMatch.result.away.clubId,
                  fromMin: 0, toMin: 90, scorers: livePlayerMatch.result.scorers,
                  redCards: liveGroupReds,
                }]}
                accent={theme.accent}
                onDone={applyMatchday}
              />
            ) : (
              <KitText t="body" color={nylon.textMuted} style={{ paddingVertical: space[3] }}>
                {playedCount === 0 ? 'Your first match is about to kick off.' : 'Your next match is about to kick off.'}
              </KitText>
            )}
            <SegmentSwitch<'group' | 'thirds' | 'results' | 'groups'> roles={nylon} value={wcTab} onChange={setWcTab} options={[
              { id: 'group', label: 'Your group' },
              { id: 'thirds', label: '3rd race' },
              { id: 'results', label: 'Results' },
              { id: 'groups', label: 'All groups' },
            ]} />
            {wcTab === 'group' && (
              <>
                <LeagueTable roles={nylon} rows={playerGroupSorted.map(t => wcFlagRow(t))} zones={WC_GROUP_ZONES} muted={playedCount === 0} />
                <ZoneLegend roles={nylon} zones={WC_GROUP_ZONES} />
              </>
            )}
            {wcTab === 'thirds' && (
              <>
                <KitText t="body" color={nylon.textMuted} style={{ paddingVertical: space[2] }}>Every group's third-placed team, as it stands. The top eight go through.</KitText>
                <LeagueTable roles={nylon} rows={wcThirds.map(t => wcFlagRow(t, t.groupId))} zones={WC_THIRD_ZONES} muted={playedCount === 0} />
              </>
            )}
            {wcTab === 'results' && (wcOthers.length === 0
              ? <KitText t="body" color={nylon.textMuted} style={{ paddingVertical: space[3] }}>No other results yet.</KitText>
              : wcOthers.map((m, i) => (
                  <View key={i}>
                    {(i === 0 || wcOthers[i - 1].groupId !== m.groupId) && <SectionTag roles={nylon}>{`Group ${m.groupId} · MD ${m.matchday}`}</SectionTag>}
                    <ResultRow roles={nylon} homeName={m.home.clubName} awayName={m.away.clubName}
                      homeGoals={m.homeGoals} awayGoals={m.awayGoals} youSide={null}
                      scorers={[summariseScorers(m.scorers?.home), summariseScorers(m.scorers?.away)].filter(Boolean).join(' · ') || undefined}
                      onPress={() => openWcGroupMatch(m)} />
                  </View>
                )))}
            {wcTab === 'groups' && <GroupWall roles={nylon} groups={wcWall} onOpen={openGroupSim} />}
          </>
        )}

        {wcStage === 'done' && (
          <>
            <StampLabel roles={nylon} text={wcFate.text} good={wcFate.good}
              sub={wcYourIdx === 2 ? `${wcYouThird + 1}${wcYouThird === 0 ? 'st' : wcYouThird === 1 ? 'nd' : wcYouThird === 2 ? 'rd' : 'th'} of the twelve third-placed teams.` : undefined} />
            <SectionTag roles={nylon}>{`Group ${playerGroup?.id ?? ''}`}</SectionTag>
            <LeagueTable roles={nylon} rows={wcYourSorted.map(t => wcFlagRow(t))} zones={WC_GROUP_ZONES} />
            {wcYourMatches.map(m => {
              const youHome = m.home.isPlayer
              const opp = youHome ? m.away : m.home
              return (
                <FixtureRow key={m.matchday} roles={nylon} matchday={m.matchday} home={youHome} opponent={opp.clubName} flag={getFlag(opp.clubId)}
                  result={{ mine: youHome ? m.homeGoals : m.awayGoals, theirs: youHome ? m.awayGoals : m.homeGoals }} />
              )
            })}
            <SectionTag roles={nylon}>The best third-placed teams</SectionTag>
            <LeagueTable roles={nylon} rows={wcThirds.map(t => wcFlagRow(t, t.groupId))} zones={WC_THIRD_ZONES} />
            <ZoneLegend roles={nylon} zones={WC_THIRD_ZONES} />
            <SectionTag roles={nylon}>Every group</SectionTag>
            <GroupWall roles={nylon} groups={wcWall} onOpen={openGroupSim} />
          </>
        )}
      </KitScreen>

      <ThumbBar>
        {wcStage === 'draw' && (
          <Plate label="Start the group stage" icon="play" roles={nylon} onPress={() => { setPhase('simulating'); setIsPlaying(true) }} />
        )}
        {wcStage === 'live' && (
          <Plate label="Skip to the end of the groups" icon="skip" variant="secondary" roles={nylon}
            onPress={() => askSkip("Your remaining group matches and every other group's are played at once.", () => {}, () => wcSkipRef.current())} />
        )}
        {wcStage === 'done' && (
          <Plate label={wcFate.good ? 'Open the knockout draw' : 'See how it ends'} icon="forward" roles={nylon}
            onPress={handleFinish} loading={isFinishing} />
        )}
      </ThumbBar>
    </View>
  )
}

// Deterministic live red-card events for one match, regenerated from the same
// seed + pools the match-detail modal uses — so the live ticker and the later
// modal agree on exactly who was sent off and when. Returns [] when the seed or
// pools aren't available (older data / not-yet-loaded), so it's always safe.
function liveRedsFor(
  result: { home: { clubId: string }; away: { clubId: string }; homeGoals: number; awayGoals: number; scorers?: MatchScorers; seed?: number },
  pools: Map<string, RosterPlayer[]>,
  extraTime = false,
): LiveRedCard[] {
  if (result.seed === undefined) return []
  const detail = generateMatchDetail({
    seed: result.seed,
    homePool: pools.get(result.home.clubId) ?? [],
    awayPool: pools.get(result.away.clubId) ?? [],
    homeGoals: result.homeGoals, awayGoals: result.awayGoals,
    scorers: result.scorers, extraTime,
  })
  return (detail?.events ?? [])
    .filter(e => e.type === 'red')
    .map(e => ({ minute: e.minute, plus: e.plus, isHome: e.isHome, player: e.playerName }))
}

// Convert a KnockoutTie (WC single match OR CL two-legged) into LiveMatch periods.
function liveePeriodsFromTie(tie: KnockoutTie, label: string): LivePeriod[] {
  if (tie.leg1) {
    // Two-legged CL tie.
    const periods: LivePeriod[] = [
      { label: 'Leg 1', homeId: tie.teamA.clubId, awayId: tie.teamB.clubId, fromMin: 0, toMin: 90, scorers: tie.leg1Scorers },
    ]
    if (tie.leg2) periods.push({ label: 'Leg 2', homeId: tie.teamB.clubId, awayId: tie.teamA.clubId, fromMin: 0, toMin: 90, scorers: tie.leg2Scorers })
    if (tie.leg2ExtraTime && (tie.leg2ExtraTime.aGoals > 0 || tie.leg2ExtraTime.bGoals > 0))
      periods.push({ label: 'Extra Time', homeId: tie.teamB.clubId, awayId: tie.teamA.clubId, fromMin: 90, toMin: 120, scorers: tie.leg2ExtraTimeScorers })
    return periods
  }
  // Single match (WC / final).
  return [{ label, homeId: tie.teamA.clubId, awayId: tie.teamB.clubId, fromMin: 0, toMin: tie.extraTime ? 120 : 90, scorers: tie.leg1Scorers ?? tie.scorers }]
}

// Build the pre-knockout bracket-preview props from a rounds array (the player's
// first knockout round + the road ahead).
function bracketPreviewProps(rounds: KnockoutRound[]) {
  const startIdx = Math.max(0, rounds.findIndex(r => r.ties.some(t => t.teamA.isPlayer || t.teamB.isPlayer)))
  const first = rounds[startIdx]
  return {
    firstLabel: first?.label ?? 'Round',
    firstTies: (first?.ties ?? []).map(t => ({ teamA: t.teamA, teamB: t.teamB })),
    // Real tie counts per upcoming round (already simulated, just not shown yet)
    // — NOT halved from the previous round, since e.g. a playoff round feeds a
    // SAME-size Round of 16 once direct qualifiers join the playoff winners.
    road: rounds.slice(startIdx + 1).map(r => ({ label: r.label, count: r.ties.length })),
  }
}

// ── Knockout Phase View ────────────────────────────────────────────────────────
// C5 (docs/ui-overhaul/07c) on nylon: your tie first, live on the clock; the
// rest of the round after it; going out is a stamped verdict, not a line; the
// primary button always names what's next.

type KnockoutPhaseViewProps = {
  rounds: KnockoutRound[]
  visibleCount: number
  competitionLabel: string
  colourway: string[]
  onAbandon: () => void
  onFinish: () => void
  onSkipToRound: (idx: number) => void
  onLiveDone?: (roundKey: string) => void  // fired when the player's live match finishes
  liveDone?: Record<string, boolean>       // which rounds' live matches have finished
  // Tap a settled tie (yours or anyone else's) to open its deep-stats sheet —
  // ties stay clickable during simulation, the same as once the run is done.
  onTiePress?: (tie: KnockoutTie, roundLabel: string) => void
  // §7 — supplied ONLY when the player's own side reached the final. The
  // player's final never plays out inline: it's the Deep Match's reason to exist.
  deepFinal?: {
    watched: boolean
    onSeeLineups: () => void
  }
}

const OUT_IN: Record<string, string> = {
  playoff: 'Out in the play-off', r32: 'Out in the round of 32', r16: 'Out in the round of 16',
  qf: 'Out in the quarter-finals', sf: 'Out in the semi-finals', final: 'Runners-up',
}

function KnockoutPhaseView({ rounds, visibleCount, competitionLabel, colourway, onAbandon, onFinish, onSkipToRound, onLiveDone, liveDone = {}, onTiePress, deepFinal }: KnockoutPhaseViewProps) {
  const allVisible = visibleCount >= rounds.length
  const nextRound = rounds[visibleCount]

  // The final is the round keyed 'final' — not simply the last one, because the
  // World Cup plays its third-place match after the semis and before it.
  const finalIdx = rounds.findIndex(r => r.round === 'final')
  const atFinal = finalIdx >= 0 && visibleCount - 1 >= finalIdx
  // Offered from the first revealed round: your final is the thing you're
  // waiting for from the moment the bracket opens. Skipping still reveals
  // every round on the way.
  const canSkipToFinal = !!deepFinal && finalIdx > 0 && !atFinal
  // The final is reached but not yet watched — nothing else may be offered
  // until it has been, or the payoff is trivially skippable.
  const awaitingDeepFinal = !!deepFinal && atFinal && !deepFinal.watched
  const youAreIn = (r?: KnockoutRound) => !!r?.ties.some(t => t.teamA.isPlayer || t.teamB.isPlayer)

  return (
    <View style={[styles.container, { backgroundColor: nylon.bg }]}>
      <KitScreen ground="nylon" contentStyle={{ paddingBottom: space[4] }}>
        <RunHeader roles={nylon} stage={6} colourway={colourway} back={false} right={<CloseRun onPress={onAbandon} />} />
        <KitText t="tag" color={nylon.textMuted}>{`${competitionLabel} · Knockouts`}</KitText>

        {rounds.slice(0, visibleCount).map((round, roundIdx) => {
          const isCurrent = roundIdx === visibleCount - 1
          const playerTie = round.ties.find(t => t.teamA.isPlayer || t.teamB.isPlayer)
          // On the live round, hold back the other ties until YOUR match is done.
          const settled = !isCurrent || !playerTie || !!liveDone[round.round]
          const otherTies = round.ties.filter(t => !t.teamA.isPlayer && !t.teamB.isPlayer)
          const isDeepFinal = !!deepFinal && round.round === 'final'
          const lost = playerTie && settled && !playerTie.winner.isPlayer && !(isDeepFinal && !deepFinal!.watched)
          const fate = playerTie && round.round === 'third'
            ? (playerTie.winner.isPlayer ? 'Third place' : 'Fourth place')
            : lost ? (OUT_IN[round.round] ?? `Out in the ${round.label.toLowerCase()}`) : null

          return (
            <View key={round.round} style={styles.koKitRound}>
              <SectionTag roles={nylon}>{round.label}</SectionTag>

              {playerTie && isCurrent && !isDeepFinal && !liveDone[round.round] && (
                <LiveMatch
                  key={round.round}
                  teamA={playerTie.teamA} teamB={playerTie.teamB}
                  periods={liveePeriodsFromTie(playerTie, round.label)}
                  pens={playerTie.aPens !== undefined ? { a: playerTie.aPens, b: playerTie.bPens ?? 0, kicksA: playerTie.penKicksA, kicksB: playerTie.penKicksB } : null}
                  aggregate={!!playerTie.leg1}
                  onDone={() => onLiveDone?.(round.round)}
                />
              )}

              {/* The final, reached but not yet watched: the scoreline is what
                  the Deep Match exists to reveal, so it isn't printed here. */}
              {playerTie && isDeepFinal && !deepFinal!.watched && (
                <View style={[styles.koKitFinal, { borderColor: nylon.line, backgroundColor: nylon.surface }]}>
                  <KitText t="superM" color={nylon.text}>"THE FINAL"</KitText>
                  <KitText t="title" color={nylon.text}>{`${playerTie.teamA.clubName} v ${playerTie.teamB.clubName}`}</KitText>
                  <KitText t="body" color={nylon.textMuted}>One match, played out in full, minute by minute. You only get to watch it once.</KitText>
                </View>
              )}

              {playerTie && settled && !(isDeepFinal && !deepFinal!.watched) && (
                <TieCard roles={nylon} label={round.label} tone={playerTie.winner.isPlayer ? 'win' : 'loss'}
                  tie={{ ...tieToVM(playerTie, onTiePress ? () => onTiePress(playerTie, round.label) : undefined),
                         isPlayerTie: false, note: playerTie.winner.isPlayer ? 'THROUGH' : 'OUT' }} />
              )}
              {fate && <StampLabel roles={nylon} text={fate} good={fate === 'Third place'} />}

              {settled && otherTies.map((tie, i) => (
                <TieRow key={i} roles={nylon} tie={tieToVM(tie, onTiePress ? () => onTiePress(tie, round.label) : undefined)} />
              ))}
            </View>
          )
        })}

        {!allVisible && visibleCount > 0 && nextRound && (
          <KitText t="body" color={nylon.textMuted} style={{ paddingVertical: space[3] }}>
            {youAreIn(nextRound) ? `Your ${nextRound.label.toLowerCase()} is next.` : `Next: the ${nextRound.label.toLowerCase()}.`}
          </KitText>
        )}
      </KitScreen>

      <ThumbBar>
        {canSkipToFinal && (
          <Plate label="Skip to the final" icon="skip" variant="secondary" roles={nylon} onPress={() => onSkipToRound(finalIdx)} />
        )}
        {awaitingDeepFinal && deepFinal ? (
          <Plate label="See the line-ups" icon="forward" roles={nylon} onPress={deepFinal.onSeeLineups} />
        ) : allVisible ? (
          <Plate label="See your verdict" icon="forward" roles={nylon} onPress={onFinish} />
        ) : null}
      </ThumbBar>
    </View>
  )
}

// This file's live-tie shape → the shared tie view model.
function tieToVM(tie: KnockoutTie, onPress?: () => void): TieVM {
  const parts: string[] = []
  if (tie.leg1) parts.push(`Leg 1 ${tie.leg1.aGoals}–${tie.leg1.bGoals}`)
  if (tie.leg2) parts.push(`Leg 2 ${tie.leg2.aGoals}–${tie.leg2.bGoals}`)
  if (tie.extraTime) parts.push('AET')
  if (tie.aPens !== undefined) parts.push(`Pens ${tie.aPens}–${tie.bPens}`)
  return {
    aName: tie.teamA.clubName, bName: tie.teamB.clubName,
    aFlag: getFlag(tie.teamA.clubId), bFlag: getFlag(tie.teamB.clubId),
    score: `${tie.aGoals}–${tie.bGoals}`,
    detail: parts.join(' · ') || undefined,
    winnerIsA: tie.winner.clubId === tie.teamA.clubId,
    isPlayerTie: tie.teamA.isPlayer || tie.teamB.isPlayer,
    scorers: [tie.leg1Scorers, tie.leg2Scorers, tie.leg2ExtraTimeScorers, tie.scorers]
      .flatMap(sc => [summariseScorers(sc?.home), summariseScorers(sc?.away)])
      .filter(Boolean).join(' · ') || undefined,
    onPress,
  }
}

// Two-legged (CL classic) live ties go through the same `openKoTie` Custom UCL
// uses: leg 1's match sheet, whose bracket block lists BOTH legs, so leg 2 is
// one tap away (maintainer feedback: leg 2 once had no way in). Since Phase 5
// that replaces the tie modal. `openKoTie` only ever reads
// clubId/clubName/goals/scorers/seed off teamA/teamB, so the extra CLTeam
// fields it doesn't use (ovr/form/stats/pot) are harmless placeholders here.
function knockoutTieToCLMatch(tie: KnockoutTie, round: string): CLKnockoutMatch {
  const blankStats = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }
  const fill = (t: KnockoutTie['teamA']): CLTeam => ({ ...t, ovr: 0, form: 0, stats: blankStats, pot: 4 })
  return {
    round,
    teamA: fill(tie.teamA), teamB: fill(tie.teamB), winner: fill(tie.winner),
    aGoals: tie.aGoals, bGoals: tie.bGoals,
    leg1: tie.leg1, leg2: tie.leg2, leg2ExtraTime: tie.leg2ExtraTime,
    extraTime: tie.extraTime, aPens: tie.aPens, bPens: tie.bPens,
    // A World Cup tie is ONE match, so it stores its sheet on the tie itself
    // rather than under a leg. Falling back to those fields lets a WC bracket
    // through this adapter with its scorers and seed intact — without it the
    // knockout half of the WC timeline had no stats to open. Two-legged ties
    // never set them, so the fallback can't shadow real leg data.
    leg1Scorers: tie.leg1Scorers ?? tie.scorers, leg2Scorers: tie.leg2Scorers, leg2ExtraTimeScorers: tie.leg2ExtraTimeScorers,
    leg1Seed: tie.leg1Seed ?? tie.seed, leg2Seed: tie.leg2Seed,
    leg1Absent: tie.leg1Absent ?? tie.absent, leg2Absent: tie.leg2Absent,
    leg1StandIns: tie.leg1StandIns ?? tie.standIns, leg2StandIns: tie.leg2StandIns,
    penKicksA: tie.penKicksA, penKicksB: tie.penKicksB,
  }
}

// A tapped live tie opens the same deep-stats sheet the result screens use.
// Single-match ties (WC, and the CL final) have no "which leg" to pick, so
// they still go straight to the stats sheet.
function koTieToMatchDetailRequest(
  tie: KnockoutTie, label: string, playerClubId: string | undefined, drafted: DraftedPlayer[], yearStart: number,
  extra?: Partial<MatchDetailRequest>,
): MatchDetailRequest {
  if (tie.leg1) {
    return {
      homeClubId: tie.teamA.clubId, homeName: tie.teamA.clubName,
      awayClubId: tie.teamB.clubId, awayName: tie.teamB.clubName,
      homeGoals: tie.leg1.aGoals, awayGoals: tie.leg1.bGoals,
      scorers: tie.leg1Scorers, seed: tie.leg1Seed,
      absent: tie.leg1Absent, standIns: tie.leg1StandIns,
      yearStart, competitionLabel: `${label} · Leg 1`,
      playerClubId, drafted,
      ...extra,
    }
  }
  const pensNote = tie.aPens !== undefined ? `Penalties ${tie.aPens} – ${tie.bPens} · ${tie.winner.clubName} advance` : undefined
  return {
    homeClubId: tie.teamA.clubId, homeName: tie.teamA.clubName,
    awayClubId: tie.teamB.clubId, awayName: tie.teamB.clubName,
    homeGoals: tie.aGoals, awayGoals: tie.bGoals,
    extraTime: tie.extraTime, pensNote,
    // A World Cup tie stores its sheet on the tie; a Champions League FINAL is
    // also a single match but comes through the two-legged shape, so it stores
    // the same data under `leg1*`. Without the fallback a live CL final opened
    // with no scorers and a hashed seed — a different match to the one the
    // result screen shows, and the Deep Match would replay the wrong sheet.
    scorers: tie.scorers ?? tie.leg1Scorers, seed: tie.seed ?? tie.leg1Seed,
    absent: tie.absent ?? tie.leg1Absent, standIns: tie.standIns ?? tie.leg1StandIns,
    yearStart, competitionLabel: label,
    playerClubId, drafted,
    ...extra,
  }
}

const styles = StyleSheet.create({
  koKitRound: { gap: space[2], marginTop: space[3] },
  koKitFinal: { borderWidth: border.plate, padding: space[3], gap: space[2] },

  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
})
