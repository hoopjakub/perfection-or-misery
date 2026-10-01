import { compOfMode, isClassicEurope, EUROPE } from '@/data/europe'
import React, { useState, useEffect, useRef, useMemo } from 'react'
import { openSheet } from '@/lib/sheet'
import { BracketTree } from '@/components/BracketTree'
import { liveBracket, liveProgress } from '@/lib/liveBracket'
import { kickoffFor } from '@/engine/schedule'
import { punditPanel, panelLineFor } from '@/engine/predictions'
import { RoundTeam } from '@/components/season/RoundTeam'
import { usePauseOnBlur } from '@/hooks/usePauseOnBlur'
import { useIsFocused } from '@react-navigation/native'
import { useSizeClass } from '@/hooks/useSizeClass'
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useGameStore } from '@/store/gameStore'
import { calcTeamOvr, effectiveOvr } from '@/engine/rating'
import { getSlotsForFormation } from '@/engine/formations'
import { simulateMatch, setMatchTilt } from '@/engine/match'
import { resolveDifficulty } from '@/engine/difficulty'
import { playFixture } from '@/engine/play-fixture'
import {
  createAvailabilityLedger, type AvailabilityLedger,
} from '@/engine/availability'
import { drawCLLeaguePhase, simulateCLKnockoutsOnly, type CLLeaguePhase } from '@/engine/cl-sim'
import { LeaguePhaseDraw } from '@/components/season/LeaguePhaseDraw'
import { withMoves } from '@/components/season/SeasonParts'
import { ManOfTheMatch } from '@/components/MatchStatsParts'
import { countryForClClub } from '@/data/geo-iso'
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
import { LiveMatch, LIVE_MS_PER_MIN, periodsForTwoLegTie, type LivePeriod, type LiveRedCard } from '@/components/LiveMatch'
import { generateMatchDetail } from '@/engine/match-detail'
import { BracketPreview } from '@/components/BracketPreview'
import { getFlag } from '@/lib/flagMap'
import {
  loadLeaguePools, lineupCtxOf, attributeCLResultScorers, attributeWCResultScorers, summariseScorers,
  attachCLShootoutNames, attachWCShootoutNames,
} from '@/engine/run-stats'
import {
  clKnockoutAvailabilityHook, wcKnockoutAvailabilityHook,
  WC_TOTAL_MATCHDAYS,
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
import { KitScreen, KitText, RunHeader, Plate, Icon, SectionTag, Tag, EmptyState, PaneRow, Pane } from '@/components/kit'
import {
  LeagueTable, ZoneLegend, StandingFigure, SeasonStrip, ScorelineCard, ResultRow, SegmentSwitch,
  FixtureRow, GroupWall, StampLabel, TieCard, TieRow, CL_PHASE_ZONES, WC_GROUP_ZONES, WC_THIRD_ZONES,
  type TableRowVM, type TableZone, type Mark, type MiniGroup, type TieVM,
} from '@/components/season/SeasonParts'
import { ThumbBar, CloseRun, BackToLive, SkipPlate, askAbandon } from '@/components/season/RunChrome'

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
const clCountryOf = (t: CLTeam) => countryForClClub(t.clubName)


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
  if (isClassicEurope(mode)) return <CLSimulation />   // P8-172: all three European competitions
  if (mode === 'world_cup')        return <WCSimulation />
  return <LeagueSeason />
}

// ── Champions League Simulation ──────────────────────────────────────────────

function CLSimulation() {
  const { draftedPlayers, benchPlayers, useSubstitutes, formation, clTeams, clYear, setClResult, mode } = useGameStore()
  // P8-172: which competition this is — its name, its league phase's shape.
  const comp = compOfMode(mode) ?? EUROPE.ucl
  // P8-57: the same panel the pundits screen showed (same seed, same field).
  const predictionSeed = useGameStore(s => s.predictionSeed)
  const clPanel = useMemo(() => clTeams && predictionSeed != null
    ? punditPanel(clTeams.map(t => ({ clubId: t.clubId, clubName: t.clubName, ovr: t.ovr, isPlayer: t.isPlayer })), predictionSeed, undefined, comp.matchdays)
    : [], [clTeams, predictionSeed])
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
  const [lpDraw,                 setLpDraw]                 = useState<CLLeaguePhase | null>(null)   // P8-114
  const [recentResults,          setRecentResults]          = useState<CompMatchResult[]>([])
  const [clViewMD,               setClViewMD]               = useState<number | null>(null)  // MD-results lookback
  // Two-legged ties need the leg-picker modal (Big Fixes feedback: tapping a
  // live tie used to jump straight to Leg 1 stats with no way to reach Leg 2 —
  // Custom UCL's tie modal already gets this right, so reuse it here).
  const [isPlaying,              setIsPlaying]              = useState(false)
  usePauseOnBlur(setIsPlaying)   // P8-32
  // The reveals below advance on their own timers, and they held while you'd
  // scrolled away from the top (P8-63) but not while another screen was on
  // top: out of the knockouts, See the bracket let the rest of the rounds
  // play out underneath (the maintainer, 26 Sept). The playing loops already
  // stop on leaving (P8-32); these wait, and carry on when you come back.
  const focused = useIsFocused()
  const wide = useSizeClass() === 'expanded'   // tabs → side-by-side panes (10-ADAPT §2.2)
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
          totalMatchdays: comp.matchdays + 4 * 2 + 1,   // the league phase, four two-legged rounds, the final
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
  // P8-63: scrolled away from the live round — the next round waits for you.
  const [koAway, setKoAway] = useState(false)
  const [koLiveDone, setKoLiveDone]         = useState<Record<string, boolean>>({})
  const koStoredResultRef = useRef<CLSeasonResult | null>(null)
  const koFinishedRef = useRef(false)

  // Auto-advance knockout rounds — but WAIT for the player's live match to play
  // out fully. If the player has a tie in the current round, we only advance once
  // its LiveMatch calls onLiveDone; other rounds advance on a short timer.
  useEffect(() => {
    if (phase !== 'knockout_phase' || koVisibleCount < 1 || koAway || !focused) return
    const currentRound = koRounds[koVisibleCount - 1]
    if (!currentRound) return
    const playerTie = currentRound.ties.find(t => t.teamA.isPlayer || t.teamB.isPlayer)
    if (playerTie && !koLiveDone[currentRound.round]) return   // hold until the live match finishes
    if (koVisibleCount < koRounds.length) {
      const t = setTimeout(() => setKoVisibleCount(p => p + 1), playerTie ? 1600 : (currentRound.autoDelay ?? 3000))
      return () => clearTimeout(t)
    }
  }, [phase, koVisibleCount, koRounds, koLiveDone, koAway, focused])

  const totalMatchdays = comp.matchdays

  useEffect(() => {
    if (!clTeams) return
    const teams: CLTeam[] = clTeams.map(t => ({
      ...t,
      ovr:  t.isPlayer ? totalTeamOvr : t.ovr,
      form: 0,
      stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
    }))
    setSimTeams(teams)
    // P8-114: drawn for real, the country rule read from the club's name (the
    // classic editions carry no country of their own; geo-iso knows them all).
    const draw = drawCLLeaguePhase(teams, clCountryOf, { pots: comp.pots, perPot: comp.perPot })
    setLpDraw(draw)
    setFixtures(draw.fixtures)
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
      const played = playCLFixture(teams, home, away, currentMD)
      results.push({ home, away, homeGoals: played.result.homeGoals, awayGoals: played.result.awayGoals, outcome: played.result.outcome, scorers: played.scorers, seed: played.seed })
    })

    clSnapshotsRef.current.push((sortByStats(teams) as CLTeam[]).map(t => ({ ...t, stats: { ...t.stats } })))

    setSimTeams(teams)
    setRecentResults([...results].sort((a, b) => Number(b.home.isPlayer || b.away.isPlayer) - Number(a.home.isPlayer || a.away.isPlayer)))

    if (currentMD === totalMatchdays) { setIsPlaying(false); setPhase('completed') }
    else { setCurrentMD(prev => prev + 1) }
  }

  // P8-27: one fixture, played the same way live and skipped (play-fixture.ts):
  // rotation, availability and the lineup-based rating all apply, and the
  // match is recorded on the history the result screen reads.
  function playCLFixture(teams: CLTeam[], home: CLTeam, away: CLTeam, md: number) {
    // In the league phase the stakes are simply whether a club is
    // mathematically into (or out of) the top 24, so a side already through can rest people.
    const played = playFixture(home, away, {
      matchday: md, seed: randomSeed(), poolByClub: poolByClubRef.current, ledger: availabilityRef.current,
      lineupCtx: lineupCtxRef.current,
      stakes: { standings: teams.map(t => ({ clubId: t.clubId, points: t.stats.points })), totalMatchdays, playedMatchdays: md - 1, qualifyCutoff: 24 },
    })
    leagueHistoryRef.current.push({
      matchday: md,
      home: { clubId: home.clubId, clubName: home.clubName, isPlayer: home.isPlayer },
      away: { clubId: away.clubId, clubName: away.clubName, isPlayer: away.isPlayer },
      homeGoals: played.result.homeGoals, awayGoals: played.result.awayGoals, scorers: played.scorers, seed: played.seed,
      homeRotation: played.homeRotation, awayRotation: played.awayRotation,
      absent: played.absent, standIns: played.standIns,
    })
    return played
  }

  function skipAll() {
    setIsPlaying(false)
    const teams = [...simTeams]
    for (let md = currentMD; md <= totalMatchdays; md++) {
      fixtures.filter(f => f.matchday === md).forEach(({ home: h, away: a }) => {
        playCLFixture(teams, teams.find(t => t.clubId === h.clubId)!, teams.find(t => t.clubId === a.clubId)!, md)
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
          totalMatchdays: comp.matchdays + 4 * 2 + 1,   // the league phase, four two-legged rounds, the final
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
        ? { round: 'final', label: comp.finalLabel, autoDelay: 0, ties: [buildTie(result.final)] }
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
    return appendKnockoutRounds(phase, playedRounds(koRounds, koVisibleCount, koLiveDone).map(r => ({
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
      competitionLabel: comp.fullName,
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
  // P8-136: the movement column against the matchday before, not sliding rows.
  const orderAt = (md: number) => (md > 0 ? clSnapshotsRef.current[md - 1]?.map(t => t.clubId) : undefined)
  const clRows: TableRowVM[] = withMoves((clRestMD > 0 ? clSnapshotsRef.current[clRestMD - 1] : sortByStats(simTeams)).map(teamRow), orderAt(clRestMD - 1))
  const clYouPos = clRows.findIndex(r => r.isPlayer) + 1
  const clPrevPos = clRestMD > 1 ? clSnapshotsRef.current[clRestMD - 2].findIndex(t => t.isPlayer) + 1 : clYouPos
  const clHistoryYours = leagueHistoryRef.current.filter(m => m.home.isPlayer || m.away.isPlayer)
  const clMarks = clHistoryYours.map(m => markOf(m.home.isPlayer, m.homeGoals, m.awayGoals))
  const clCardMD = clViewMD ?? clLatestMD
  const clCard = clHistoryYours.find(m => m.matchday === clCardMD)
  const clTableMD = clViewMD ?? clRestMD
  const clTableRows = clViewMD != null && clSnapshotsRef.current[clViewMD - 1]
    ? withMoves(clSnapshotsRef.current[clViewMD - 1].map(teamRow), orderAt(clViewMD - 1)) : clRows
  const clOthers = clShown.filter(m => !(m.home.isPlayer || m.away.isPlayer))
  const clPending = clViewMD == null && clLatestMD > clRestMD
  const clMatchRequest = (m: CLLeagueMatch) => ({
    homeClubId: m.home.clubId, homeName: m.home.clubName,
    awayClubId: m.away.clubId, awayName: m.away.clubName,
    homeGoals: m.homeGoals, awayGoals: m.awayGoals,
    scorers: m.scorers, seed: m.seed, yearStart: clPoolYear,
    homeRotation: m.homeRotation, awayRotation: m.awayRotation,
    absent: m.absent, standIns: m.standIns,
    playerClubId: simTeams.find(t => t.isPlayer)?.clubId,
    playerFormation: formation ?? undefined,
  })
  const openClLeagueMatch = (m: CLLeagueMatch) => openMatchStats({
    ...clMatchRequest(m),
    competitionLabel: `League Phase · Matchday ${m.matchday}`,
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
            competitionLabel={comp.fullName}
            yearStart={clPoolYear}
            colourway={colourwayFor(comp.mode)}
            onAbandon={() => askAbandon(() => {})}
            onFinish={finishKnockoutPhase}
            deepFinal={clPlayerFinal ? { watched: deepFinalWatched, onSeeLineups: openClDeepFinal } : undefined}
            onSkipToRound={(idx) => { setKoLiveDone(d => ({ ...d, ...settledThrough(koRounds, idx) })); setKoVisibleCount(idx + 1) }}
            onLiveDone={(k) => setKoLiveDone(d => ({ ...d, [k]: true }))}
            onAwayChange={setKoAway}
            panelLine={(a, b) => panelLineFor(clPanel, a, b)}
            liveDone={koLiveDone}
            onTiePress={(tie, label) => tie.leg1
              ? openKoTie(knockoutTieToCLMatch(tie, label), { label, playerClubId: simTeams.find(t => t.isPlayer)?.clubId, drafted: fullSquad, yearStart: clPoolYear, playerFormation: formation ?? undefined, accent: theme.accent })
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
      <KitScreen ground="nylon" width={wide ? 'wide' : 'column'} contentStyle={{ paddingBottom: space[4] }}>
        <RunHeader roles={nylon} stage={6} colourway={colourwayFor(comp.mode)} back={false} tournament
          title={clStarted ? undefined : 'The league phase'}
          right={<CloseRun onPress={() => askAbandon(() => setIsPlaying(false))} />} />
        <KitText t="tag" color={nylon.textMuted}>
          {`${comp.fullName} · ${simTeams.length || 36} clubs · MD ${clLatestMD}/${totalMatchdays}`}
        </KitText>

        {!clStarted ? (
          <>
            {lpDraw && (
              <LeaguePhaseDraw roles={nylon} teams={simTeams} draw={lpDraw} countryOf={clCountryOf} after={(
                <>
                  <SectionTag roles={nylon}>Your eight</SectionTag>
                  {yourEight.map(f => (
                    <FixtureRow key={f.matchday} roles={nylon} matchday={f.matchday}
                      home={f.home.isPlayer} opponent={(f.home.isPlayer ? f.away : f.home).clubName} you={(f.home.isPlayer ? f.home : f.away).clubName}
                      pot={(f.home.isPlayer ? f.away : f.home).pot}
                      when={kickoffFor({ label: `League Phase · MD ${f.matchday}`, yearStart: clPoolYear, homeClubId: f.home.clubId, awayClubId: f.away.clubId })?.short} />
                  ))}
                  <ZoneLegend roles={nylon} zones={CL_PHASE_ZONES} />
                </>
              )} />
            )}
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
              <ScorelineCard roles={nylon} label={[`MD ${clCard.matchday}`, kickoffFor({ label: `League Phase · MD ${clCard.matchday}`, yearStart: clPoolYear, homeClubId: clCard.home.clubId, awayClubId: clCard.away.clubId })?.short].filter(Boolean).join(' · ')}
                homeName={clCard.home.clubName} awayName={clCard.away.clubName} homeClubId={clCard.home.clubId} awayClubId={clCard.away.clubId}
                homeGoals={clCard.homeGoals} awayGoals={clCard.awayGoals} youHome={clCard.home.isPlayer}
                homeScorers={summariseScorers(clCard.scorers?.home) || undefined}
                awayScorers={summariseScorers(clCard.scorers?.away) || undefined}
                onPress={() => openClLeagueMatch(clCard)}
                footer={<ManOfTheMatch roles={nylon} req={clMatchRequest(clCard)} />} />
            )}
            {!wide && <SegmentSwitch<'table' | 'results' | 'fixtures'> roles={nylon} value={clTab} onChange={setClTab} options={[
              { id: 'table', label: 'Table' },
              { id: 'results', label: clTableMD > 0 ? `Results MD ${clViewMD ?? clLatestMD}` : 'Results' },
              { id: 'fixtures', label: 'Your eight' },
            ]} />}
            <PaneRow wide={wide}>
            {(wide || clTab === 'results') && <Pane wide={wide} title={clTableMD > 0 ? `Results · MD ${clViewMD ?? clLatestMD}` : 'Results'}>
            {clPending
              ? <KitText t="body" color={nylon.textMuted} style={{ paddingVertical: space[3] }}>Your match first. The rest of the matchday is coming in.</KitText>
              : clOthers.map((m, i) => (
                  <ResultRow key={i} roles={nylon} homeName={m.home.clubName} awayName={m.away.clubName}
                    homeGoals={m.homeGoals} awayGoals={m.awayGoals} youSide={null}
                    homeClubId={m.home.clubId} awayClubId={m.away.clubId}
                    homeScorers={summariseScorers(m.scorers?.home) || undefined} awayScorers={summariseScorers(m.scorers?.away) || undefined}
                    onPress={() => openClLeagueMatch(m)} />
                ))}
            {!clPending && clShown.length > 0 && (
              <RoundTeam roles={nylon} roundKey={`cl-${clShown[0].matchday}`} label={`Team of matchday ${clShown[0].matchday}`}
                poolByClub={poolByClubRef.current} ctx={lineupCtxRef.current}
                fixtures={clShown.map(m => ({
                  homeClubId: m.home.clubId, awayClubId: m.away.clubId, homeClubName: m.home.clubName, awayClubName: m.away.clubName,
                  homeGoals: m.homeGoals, awayGoals: m.awayGoals, scorers: m.scorers, seed: m.seed,
                  homeRotation: m.homeRotation, awayRotation: m.awayRotation, absent: m.absent, standIns: m.standIns,
                }))} />
            )}
            </Pane>}
            {(wide || clTab === 'table') && <Pane wide={wide} title="League phase" flex={1.4}>
              <>
                <LeagueTable roles={nylon} rows={clTableRows} zones={CL_PHASE_ZONES} muted={clRestMD === 0} />
                <ZoneLegend roles={nylon} zones={CL_PHASE_ZONES} />
              </>
            </Pane>}
            {(wide || clTab === 'fixtures') && <Pane wide={wide} title="Your eight">{yourEight.map(f => {
              const played = clHistoryYours.find(m => m.matchday === f.matchday)
              const youHome = f.home.isPlayer
              return (
                <FixtureRow key={f.matchday} roles={nylon} matchday={f.matchday} home={youHome}
                  opponent={(youHome ? f.away : f.home).clubName} pot={(youHome ? f.away : f.home).pot} you={(youHome ? f.home : f.away).clubName}
                  when={kickoffFor({ label: `League Phase · MD ${f.matchday}`, yearStart: clPoolYear, homeClubId: f.home.clubId, awayClubId: f.away.clubId })?.short}
                  result={played ? { mine: youHome ? played.homeGoals : played.awayGoals, theirs: youHome ? played.awayGoals : played.homeGoals } : undefined} />
              )
            })}</Pane>}
            </PaneRow>
          </>
        )}
      </KitScreen>

      <ThumbBar>
        {clStarted && !clDone && (
          <SkipPlate label="Skip to the last matchday" consequence={`Matchdays ${currentMD} to ${totalMatchdays} are played at once.`}
            pause={() => setIsPlaying(false)} run={() => clSkipRef.current()} />
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
  const predictionSeed = useGameStore(s => s.predictionSeed)
  const wcPanel = useMemo(() => wcTeams && predictionSeed != null
    ? punditPanel(wcTeams.map(t => ({ clubId: t.clubId, clubName: t.clubName, ovr: t.ovr, isPlayer: t.isPlayer })), predictionSeed, undefined, WC_GROUP_MATCHDAYS)
    : [], [wcTeams, predictionSeed])
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
  usePauseOnBlur(setIsPlaying)   // P8-32
  // The reveals below advance on their own timers, and they held while you'd
  // scrolled away from the top (P8-63) but not while another screen was on
  // top: out of the knockouts, See the bracket let the rest of the rounds
  // play out underneath (the maintainer, 26 Sept). The playing loops already
  // stop on leaving (P8-32); these wait, and carry on when you come back.
  const focused = useIsFocused()
  const wide = useSizeClass() === 'expanded'   // tabs → side-by-side panes (10-ADAPT §2.2)
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
  const [koAway, setKoAway] = useState(false)   // P8-63: scrolled away — the next round waits
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
    if (phase !== 'knockout_phase' || wcKoVisibleCount < 1 || koAway || !focused) return
    const currentRound = wcKoRounds[wcKoVisibleCount - 1]
    if (!currentRound) return
    const playerTie = currentRound.ties.find(t => t.teamA.isPlayer || t.teamB.isPlayer)
    if (playerTie && !wcKoLiveDone[currentRound.round]) return   // hold until the live match finishes
    if (wcKoVisibleCount < wcKoRounds.length) {
      const t = setTimeout(() => setWcKoVisibleCount(p => p + 1), playerTie ? 1600 : (currentRound.autoDelay ?? 3000))
      return () => clearTimeout(t)
    }
  }, [phase, wcKoVisibleCount, wcKoRounds, wcKoLiveDone, koAway, focused])

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
      const p = playWCFixture(teams, home, away, md)
      results.push({ home, away, homeGoals: p.result.homeGoals, awayGoals: p.result.awayGoals, outcome: p.result.outcome, scorers: p.scorers, seed: p.seed, homeRotation: p.homeRotation, awayRotation: p.awayRotation, absent: p.absent, standIns: p.standIns })
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

  // P8-27: one fixture, played the same way live and skipped (play-fixture.ts).
  // Stakes are decided INSIDE the group: top two go through, so a nation
  // already mathematically qualified (or already out) can rest people, which
  // in a three-game group is realistically the last round.
  function playWCFixture(teams: WCTeam[], home: WCTeam, away: WCTeam, md: number) {
    return playFixture(home, away, {
      matchday: md, seed: randomSeed(), poolByClub: poolByClubRef.current, ledger: availabilityRef.current,
      lineupCtx: lineupCtxRef.current, simulate: (x, y) => simGroupMatch(x as WCTeam, y as WCTeam),
      stakes: {
        standings: teams.filter(t => t.groupId === home.groupId).map(t => ({ clubId: t.clubId, points: t.stats.points })),
        totalMatchdays: WC_GROUP_MATCHDAYS, playedMatchdays: md - 1, qualifyCutoff: 2,
      },
    })
  }

  function skipAll() {
    setIsPlaying(false)
    setLivePlayerMatch(null)
    // A matchday already played but still on the clock is COMMITTED, not
    // replayed: its results are decided and already in the ledger. Replaying
    // it counted its injuries twice and threw away the match being watched.
    const pend = pendingMDRef.current
    pendingMDRef.current = null
    let teams = (pend?.teams ?? simTeams).map(t => ({ ...t, stats: { ...t.stats } }))
    if (pend) pend.results.forEach(r => groupHistoryRef.current.push({
      groupId: (r.home as WCTeam).groupId, matchday: pend.md,
      home: { clubId: r.home.clubId, clubName: r.home.clubName, isPlayer: r.home.isPlayer },
      away: { clubId: r.away.clubId, clubName: r.away.clubName, isPlayer: r.away.isPlayer },
      homeGoals: r.homeGoals, awayGoals: r.awayGoals, scorers: r.scorers, seed: r.seed,
      homeRotation: r.homeRotation, awayRotation: r.awayRotation, absent: r.absent, standIns: r.standIns,
    }))
    // Resume from the next UNPLAYED matchday (the table is the source of truth
    // for what's been applied), so nothing is ever played twice.
    const startMd = (teams.find(t => t.isPlayer)?.stats.played ?? currentMD - 1) + 1
    for (let md = startMd; md <= totalMatchdays; md++) {
      fixtures.filter(f => f.matchday === md).forEach(({ home: h, away: a }) => {
        const home = teams.find(t => t.clubId === h.clubId)!
        const away = teams.find(t => t.clubId === a.clubId)!
        const p = playWCFixture(teams, home, away, md)
        groupHistoryRef.current.push({
          groupId: home.groupId, matchday: md,
          home: { clubId: home.clubId, clubName: home.clubName, isPlayer: home.isPlayer },
          away: { clubId: away.clubId, clubName: away.clubName, isPlayer: away.isPlayer },
          homeGoals: p.result.homeGoals, awayGoals: p.result.awayGoals, scorers: p.scorers, seed: p.seed,
          homeRotation: p.homeRotation, awayRotation: p.awayRotation, absent: p.absent, standIns: p.standIns,
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
    return appendKnockoutRounds(phase, playedRounds(wcKoRounds, wcKoVisibleCount, wcKoLiveDone).map(r => ({
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
            yearStart={2026}
            colourway={colourwayFor('world_cup')}
            onAbandon={() => askAbandon(() => {})}
            onFinish={finishWCKnockoutPhase}
            deepFinal={wcPlayerFinal ? { watched: wcDeepFinalWatched, onSeeLineups: openWcDeepFinal } : undefined}
            onSkipToRound={(idx) => { setWcKoLiveDone(d => ({ ...d, ...settledThrough(wcKoRounds, idx) })); setWcKoVisibleCount(idx + 1) }}
            onLiveDone={(k) => setWcKoLiveDone(d => ({ ...d, [k]: true }))}
            onAwayChange={setKoAway}
            panelLine={(a, b) => panelLineFor(wcPanel, a, b)}
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
      <KitScreen ground="nylon" width={wide ? 'wide' : 'column'} contentStyle={{ paddingBottom: space[4] }}>
        <RunHeader roles={nylon} stage={6} colourway={colourwayFor('world_cup')} back={false} tournament
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
                  return <FixtureRow key={f.matchday} roles={nylon} matchday={f.matchday} home={null} opponent={opp.clubName} flag={getFlag(opp.clubId)}
                    when={kickoffFor({ label: `Group ${playerGroup.id} · MD ${f.matchday}`, yearStart: 2026, homeClubId: f.home.clubId, awayClubId: f.away.clubId })?.short} />
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
                // The page's Pause stopped the matchdays but never the match
                // being played (the maintainer, 27 Sept); and its speed never
                // reached the live clock (P8-137).
                hold={!isPlaying}
                msPerMin={LIVE_MS_PER_MIN[speed]}
              />
            ) : (
              <KitText t="body" color={nylon.textMuted} style={{ paddingVertical: space[3] }}>
                {playedCount === 0 ? 'Your first match is about to kick off.' : 'Your next match is about to kick off.'}
              </KitText>
            )}
            {!wide && <SegmentSwitch<'group' | 'thirds' | 'results' | 'groups'> roles={nylon} value={wcTab} onChange={setWcTab} options={[
              { id: 'group', label: 'Your group' },
              { id: 'thirds', label: '3rd race' },
              { id: 'results', label: 'Results' },
              { id: 'groups', label: 'All groups' },
            ]} />}
            <PaneRow wide={wide}>
            {(wide || wcTab === 'group' || wcTab === 'thirds') && <Pane wide={wide} title="Your group" flex={1.2}>
            {(wide || wcTab === 'group') && (
              <>
                <LeagueTable roles={nylon} rows={playerGroupSorted.map(t => wcFlagRow(t))} zones={WC_GROUP_ZONES} muted={playedCount === 0} />
                <ZoneLegend roles={nylon} zones={WC_GROUP_ZONES} />
              </>
            )}
            {(wide || wcTab === 'thirds') && (
              <>
                {wide && <SectionTag roles={nylon}>The race for third</SectionTag>}
                <KitText t="body" color={nylon.textMuted} style={{ paddingVertical: space[2] }}>Every group's third-placed team, as it stands. The top eight go through.</KitText>
                <LeagueTable roles={nylon} rows={wcThirds.map(t => wcFlagRow(t, t.groupId))} zones={WC_THIRD_ZONES} muted={playedCount === 0} />
              </>
            )}
            </Pane>}
            {(wide || wcTab === 'results') && <Pane wide={wide} title="Results">{wcOthers.length === 0
              ? <KitText t="body" color={nylon.textMuted} style={{ paddingVertical: space[3] }}>No other results yet.</KitText>
              : wcOthers.map((m, i) => (
                  <View key={i}>
                    {(i === 0 || wcOthers[i - 1].groupId !== m.groupId) && <SectionTag roles={nylon}>{`Group ${m.groupId} · MD ${m.matchday}`}</SectionTag>}
                    <ResultRow roles={nylon} homeName={m.home.clubName} awayName={m.away.clubName}
                      homeGoals={m.homeGoals} awayGoals={m.awayGoals} youSide={null}
                      homeClubId={m.home.clubId} awayClubId={m.away.clubId}
                    homeScorers={summariseScorers(m.scorers?.home) || undefined} awayScorers={summariseScorers(m.scorers?.away) || undefined}
                      onPress={() => openWcGroupMatch(m)} />
                  </View>
                ))}</Pane>}
            {(wide || wcTab === 'groups') && <Pane wide={wide} title="All groups"><GroupWall roles={nylon} groups={wcWall} onOpen={openGroupSim} /></Pane>}
            </PaneRow>
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
                <FixtureRow key={m.matchday} roles={nylon} matchday={m.matchday} home={null} opponent={opp.clubName} flag={getFlag(opp.clubId)}
                  result={{ mine: youHome ? m.homeGoals : m.awayGoals, theirs: youHome ? m.awayGoals : m.homeGoals }}
                  when={kickoffFor({ label: `Group ${m.groupId} · MD ${m.matchday}`, yearStart: 2026, homeClubId: m.home.clubId, awayClubId: m.away.clubId })?.short} />
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
          <SkipPlate label="Skip to the end of the groups" consequence="Your remaining group matches and every other group's are played at once."
            pause={() => {}} run={() => wcSkipRef.current()} />
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
  // Two-legged CL tie: the shared builder. This screen kept its own older copy,
  // which only added extra time when someone scored in it — so a goalless extra
  // time vanished and leg 2 went straight to penalties (the maintainer, 24 Sept).
  // The shared one already had that fix; now there's only one.
  if (tie.leg1) return periodsForTwoLegTie(tie)
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
  /** P8-91: the season the knockout belongs to, for the bracket's dates. */
  yearStart: number
  onLiveDone?: (roundKey: string) => void  // fired when the player's live match finishes
  /** P8-63: tells the screen you've scrolled away from the live round, so it holds the next one. */
  onAwayChange?: (away: boolean) => void
  /** P8-57, match by match: the panel's split on a tie, shown above your live one. */
  panelLine?: (a: { clubId: string; clubName: string }, b: { clubId: string; clubName: string }) => string | null
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

// How far down the knockouts page counts as away from the live round.
const AWAY_PX = 320

function KnockoutPhaseView({ rounds, visibleCount, competitionLabel, colourway, onAbandon, onFinish, onSkipToRound, yearStart, onLiveDone, onAwayChange, panelLine, liveDone = {}, onTiePress, deepFinal }: KnockoutPhaseViewProps) {
  const allVisible = visibleCount >= rounds.length
  const nextRound = rounds[visibleCount]

  // The final is the round keyed 'final' — not simply the last one, because the
  // World Cup plays its third-place match after the semis and before it.
  const finalIdx = rounds.findIndex(r => r.round === 'final')
  const atFinal = finalIdx >= 0 && visibleCount - 1 >= finalIdx
  // P8-94: a skip to the end of YOUR run, not to the final. The old "Skip to
  // the final" was only offered when you were going to reach it, which gave
  // the result away. Now it plays every round up to the last one you're in
  // and stops there, settled: where you went out (or your final, still to be
  // watched in the Deep Match). Once you're out, a plain skip reveals the rest.
  const youAreInAt = (i: number) => !!rounds[i]?.ties.some(t => t.teamA.isPlayer || t.teamB.isPlayer)
  const endOfRun = rounds.reduce((k, _r, i) => (youAreInAt(i) ? i : k), -1)
  // The final is reached but not yet watched — nothing else may be offered
  // until it has been, or the payoff is trivially skippable.
  const awaitingDeepFinal = !!deepFinal && atFinal && !deepFinal.watched
  const youAreIn = (r?: KnockoutRound) => !!r?.ties.some(t => t.teamA.isPlayer || t.teamB.isPlayer)

  // P8-63: the newest round sits on top, so the one being played is where you
  // already are — no scrolling down after it. When a round opens, the page
  // goes back up to it; if you've scrolled down through earlier rounds, a tag
  // takes you back, and your live match waits while it's out of sight.
  const scrollRef = useRef<ScrollView>(null)
  const [scrolledAway, setScrolledAway] = useState(false)
  useEffect(() => { onAwayChange?.(scrolledAway) }, [scrolledAway])
  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: true }) }, [visibleCount])

  return (
    <View style={[styles.container, { backgroundColor: nylon.bg }]}>
      <KitScreen ground="nylon" contentStyle={{ paddingBottom: space[4] }} scrollRef={scrollRef} scrollEventThrottle={64}
        onScroll={e => setScrolledAway(e.nativeEvent.contentOffset.y > AWAY_PX)}>
        <RunHeader roles={nylon} stage={6} colourway={colourway} back={false} tournament right={<CloseRun onPress={onAbandon} />} />
        <KitText t="tag" color={nylon.textMuted}>{`${competitionLabel} · Knockouts`}</KitText>
        {/* P8-91: the whole bracket, mid-round: results so far, and every tie of
            this round as it stands at the same moment as yours. */}
        <Plate label="See the bracket" icon="ranks" variant="secondary" roles={nylon} style={styles.bracketPlate} onPress={() => {
          const current = rounds[visibleCount - 1]
          const liveOpen = !!current && !!current.ties.find(t => t.teamA.isPlayer || t.teamB.isPlayer) && !liveDone[current.round]
          const b = liveBracket(rounds, { visible: visibleCount, liveOpen, progress: liveProgress() ?? 0, yearStart })
          const you = rounds.flatMap(r => r.ties).flatMap(t => [t.teamA, t.teamB]).find(x => x.isPlayer)?.clubId
          openSheet({
            title: 'The bracket', sub: liveOpen ? `${competitionLabel} · scores as they stand` : competitionLabel,
            render: () => <BracketTree columns={b.columns} third={b.third} playerClubId={you} />,
          })
        }} />

        {!allVisible && visibleCount > 0 && nextRound && (
          <KitText t="body" color={nylon.textMuted} style={{ paddingVertical: space[3] }}>
            {youAreIn(nextRound) ? `Your ${nextRound.label.toLowerCase()} is next.` : `Next: the ${nextRound.label.toLowerCase()}.`}
          </KitText>
        )}

        {rounds.slice(0, visibleCount).map((round, roundIdx) => ({ round, roundIdx })).reverse().map(({ round, roundIdx }) => {
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

              {playerTie && isCurrent && !isDeepFinal && !liveDone[round.round] && panelLine?.(playerTie.teamA, playerTie.teamB) && (
                <KitText t="body" color={nylon.textMuted}>{panelLine(playerTie.teamA, playerTie.teamB)}</KitText>
              )}
              {playerTie && isCurrent && !isDeepFinal && !liveDone[round.round] && (
                <LiveMatch
                  key={round.round}
                  teamA={playerTie.teamA} teamB={playerTie.teamB}
                  periods={liveePeriodsFromTie(playerTie, round.label)}
                  pens={playerTie.aPens !== undefined ? { a: playerTie.aPens, b: playerTie.bPens ?? 0, kicksA: playerTie.penKicksA, kicksB: playerTie.penKicksB } : null}
                  aggregate={!!playerTie.leg1}
                  onDone={() => onLiveDone?.(round.round)}
                  hold={scrolledAway}
                />
              )}

              {/* The final, reached but not yet watched: the scoreline is what
                  the Deep Match exists to reveal, so it isn't printed here. */}
              {playerTie && isDeepFinal && !deepFinal!.watched && (
                <View style={[styles.koKitFinal, { borderColor: nylon.line, backgroundColor: nylon.surface }]}>
                  <KitText t="superM" color={nylon.text}>THE FINAL</KitText>
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

      </KitScreen>
      {scrolledAway && (
        <View style={styles.toNewest} pointerEvents="box-none">
          <BackToLive md={0} label="Back to the newest round" onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} />
        </View>
      )}

      <ThumbBar>
        {!awaitingDeepFinal && endOfRun > visibleCount - 1 && (
          <Plate label="Skip to the end of your run" icon="skip" variant="secondary" roles={nylon} onPress={() => onSkipToRound(endOfRun)} />
        )}
        {!awaitingDeepFinal && endOfRun <= visibleCount - 1 && !allVisible && (
          <Plate label="Skip to the end" icon="skip" variant="secondary" roles={nylon} onPress={() => onSkipToRound(rounds.length - 1)} />
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

// The rounds that are over: the revealed ones, minus the newest while your
// match in it is still being played. A match sheet opened mid-round used to
// list that round's ties with their final scores — the result before it
// happened. The same goes for tapping a tie of the round being played.
function playedRounds(rounds: KnockoutRound[], visible: number, liveDone: Record<string, boolean>): KnockoutRound[] {
  const shown = rounds.slice(0, visible)
  const last = shown[shown.length - 1]
  const live = !!last && last.ties.some(t => t.teamA.isPlayer || t.teamB.isPlayer) && !liveDone[last.round]
  return live ? shown.slice(0, -1) : shown
}

// P8-94: every round up to `idx` marked as played, so a skip lands on a
// settled round (the live match of the round skipped to isn't replayed).
function settledThrough(rounds: KnockoutRound[], idx: number): Record<string, boolean> {
  return Object.fromEntries(rounds.slice(0, idx + 1).map(r => [r.round, true]))
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
    aClubId: tie.teamA.clubId, bClubId: tie.teamB.clubId,
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
    // A live tie keeps only the named kicks; the raw sequence is read off them.
    shootout: tie.penKicksA && tie.penKicksB ? { home: tie.penKicksA.map(k => k.scored), away: tie.penKicksB.map(k => k.scored), homeKicks: tie.penKicksA, awayKicks: tie.penKicksB } : undefined,
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
  bracketPlate: { marginTop: space[2], marginBottom: space[3] },
  toNewest: { position: 'absolute', left: space[4], right: space[4], bottom: 120, alignItems: 'center' },
  koKitRound: { gap: space[2], marginTop: space[3] },
  koKitFinal: { borderWidth: border.plate, padding: space[3], gap: space[2] },

  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
})
