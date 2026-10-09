import { compareStandings } from '@/engine/standings'
import { setLogContext } from '@/diag/log'
import { timeToFrame } from '@/diag/perf'
import { log } from '@/diag/log'
import { SPEED_MS } from '@/data/speed'
import { t } from '@/i18n'
import { label } from '@/i18n/labels'
import { ordinal } from '@/lib/format'
import { compOfMode, isClassicEurope, EUROPE } from '@/data/europe'
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { BracketTree } from '@/components/BracketTree'
import { liveBracket } from '@/lib/liveBracket'
import { kickoffFor } from '@/engine/schedule'
import { punditPanel, panelLineFor, punditField } from '@/engine/predictions'
import { RoundTeam } from '@/components/season/RoundTeam'
import { TableStage } from '@/components/season/TableStage'
import { useStagePools } from '@/hooks/useStagePools'
import { useStageLoop, playsLive } from '@/hooks/useStageLoop'
import { KnockoutStage, knockoutTieToCLMatch, clKnockoutRounds, wcKnockoutRounds, type KnockoutRound } from '@/components/season/KnockoutStage'
import { usePauseOnBlur } from '@/hooks/usePauseOnBlur'
import { useSizeClass } from '@/hooks/useSizeClass'
import { View, StyleSheet } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { calcTeamOvr } from '@/engine/rating'
import { getSlotsForFormation } from '@/engine/formations'
import { simulateMatch, setMatchTilt } from '@/engine/match'
import { resolveDifficulty } from '@/engine/difficulty'
import { playFixture } from '@/engine/play-fixture'

import { drawCLLeaguePhase, simulateCLKnockoutsOnly, type CLLeaguePhase } from '@/engine/cl-sim'
import { LeaguePhaseDraw } from '@/components/season/LeaguePhaseDraw'
import { withMoves, PressList } from '@/components/season/SeasonParts'
import { useCupPress } from '@/hooks/useCupPress'
import { cupPress, clPressStages, wcPressStages, knockoutStages } from '@/engine/cup-press'
import { openStory } from '@/lib/runNav'
import { ManOfTheMatch } from '@/components/MatchStatsParts'
import { countryForClClub } from '@/data/geo-iso'
import type { CLTeam, CLKnockoutMatch, CLSeasonResult, CLLeagueMatch } from '@/engine/cl-sim'
import { assignGroups, generateWCGroupFixtures, simulateWCKnockoutsOnly } from '@/engine/world-cup-sim'
import { simulateWCKnockoutsForceToFinal } from '@/engine/quick-sim'
import { openWCGroup } from '@/components/WCGroupSheet'
import type { WCTeam, WCGroup, WCSeasonResult, WCGroupMatch } from '@/engine/world-cup-sim'
import { MODE_THEMES } from '@/theme'
import { useModeTheme } from '@/hooks/useModeTheme'
import type { SimTeam, MatchResult } from '@/types/simulation'
import { LiveMatch, LIVE_MS_PER_MIN, yourMatchPeriod } from '@/components/LiveMatch'
import { getFlag } from '@/lib/flagMap'
import {
  attributeCLResultScorers, attributeWCResultScorers, summariseScorers, attachCLShootoutNames, attachWCShootoutNames,
} from '@/engine/run-stats'
import {
  clKnockoutAvailabilityHook, wcKnockoutAvailabilityHook, WC_TOTAL_MATCHDAYS,
} from '@/engine/knockout-availability'
import type { RosterPlayer, MatchScorers } from '@/types/stats'
import { randomSeed } from '@/lib/rng'
import { matchRequest, leagueMatch, tieRequest, type MatchCtx } from '@/engine/stages'
import { openMatchStats } from '@/lib/matchStats'
import { appendKnockoutRounds, standingsAsOf, type ContextMatch } from '@/engine/match-context'
import { useSimBackGuard } from '@/hooks/useSimBackGuard'
import LeagueSeason from '@/components/season/LeagueSeason'
import { ROLES, space, colourwayFor } from '@/theme'
import { KitScreen, KitText, RunHeader, Plate, SectionTag, EmptyState } from '@/components/kit'
import {
  LeagueTable, ZoneLegend, YourFixtures, ScorelineCard, ResultRow, FixtureRow, GroupWall, StampLabel, CL_PHASE_ZONES, WC_GROUP_ZONES, WC_THIRD_ZONES, type TableRowVM, type Mark, type MiniGroup,
} from '@/components/season/SeasonParts'
import { ThumbBar, CloseRun, askAbandon, StageControls } from '@/components/season/RunChrome'
import { useSettingsStore } from '@/store/settingsStore'
import { EVERYDAY } from '@/lib/appearance'

// The page's ground (1 Oct: result screens follow light and dark too). These
// old styles named the dark ground's colours; they now take its roles.
const GR = ROLES[EVERYDAY]

const WC_GROUP_MATCHDAYS = 3

type SimPhase = 'review' | 'simulating' | 'completed' | 'group_review' | 'knockout_phase'

// The knockouts' tie and round shapes live with their view (KnockoutStage.tsx).

// ── Kit Drop pieces shared by the Champions League and World Cup screens ────
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
    return compareStandings(a, b)
  })
}

// Top-level router — delegates to the right simulation per mode
// P9.75 (the phone, 9 Oct): a cup's draw first, then the pundits. The draw's
// button opens them on top (?from=draw); "Prove them wrong" sets the run's
// predictionSeed and comes back, and the stage starts on that return, since
// that press was the start (D5: every stage waits for a tap, and it had one).
// predictionSeed is cleared when a run begins, so a set one means heard.
function usePunditsFirst(start: () => void) {
  const asked = useRef(false)
  const startRef = useRef(start)
  startRef.current = start
  useFocusEffect(useCallback(() => {
    if (asked.current && useGameStore.getState().predictionSeed != null) { asked.current = false; startRef.current() }
  }, []))
  return () => { asked.current = true; router.push('/game/pundits?from=draw') }
}

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
  const clPanel = useMemo(() => {
    const f = punditField(mode, { clTeams })
    return f && predictionSeed != null ? punditPanel(f.teams, predictionSeed, undefined, f.matchesPerClub) : []
  }, [clTeams, predictionSeed, mode])
  const fullSquad = [...draftedPlayers, ...benchPlayers]
  const clPoolYear = clYear ?? 2025   // UCL edition you were placed in (for scorer rosters)

  const slots       = formation ? getSlotsForFormation(formation) : []
  const baseTeamOvr = formation && draftedPlayers.length > 0 ? calcTeamOvr(draftedPlayers, slots) : 0
  const totalTeamOvr = baseTeamOvr

  const [phase,                  setPhase]                  = useState<SimPhase>('review')
  useSimBackGuard(phase !== 'review')   // §3 — active once the league phase starts simulating
  const openPunditsFromDraw = usePunditsFirst(() => { setPhase('simulating'); setIsPlaying(true) })
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
  const wide = useSizeClass() === 'expanded'   // tabs → side-by-side panes (10-ADAPT §2.2)
  // F-05 / N-03: the app's one speed setting. The league phase (and with it
  // the Europa and Conference League modes) was locked to slow, with no
  // reason written down for a cup being slower to watch than a league.
  const speed = useSettingsStore(s => s.speed)
  // The Europa and Conference League modes run on this screen too (P8-172): their own colours.
  const theme = MODE_THEMES[mode ?? ''] ?? MODE_THEMES.champions_league
  const [isFinishing,  setIsFinishing]  = useState(false)
  const finishingRef = useRef(false)   // bulletproof re-entry guard (state lags a tap)
  // Records every league-phase result so the results screen can show matchdays.
  const leagueHistoryRef = useRef<CLLeagueMatch[]>([])
  // The squads and the injury ledger: the league phase, four two-legged
  // rounds and the final, so an injury on matchday 8 can cost the round of 16.
  const { poolByClubRef, lineupCtxRef, availabilityRef, ensure: ensurePools } = useStagePools({
    teams: clTeams, squad: fullSquad, yearStart: clPoolYear, useSubstitutes, totalMatchdays: comp.matchdays + 4 * 2 + 1, tag: 'cl',
  })
  // The table as each matchday left it, so it can land a beat after your
  // result (07c rule 1: nothing you haven't reached is shown).
  const clSnapshotsRef = useRef<CLTeam[][]>([])
  const [clRestMD, setClRestMD] = useState(0)
  const [clTab, setClTab] = useState<'table' | 'results' | 'fixtures' | 'press'>('table')
  const clSkipRef = useRef<() => void>(() => {})

  // Knockout phase state
  const [koRounds, setKoRounds]             = useState<KnockoutRound[]>([])
  // §7 R6 — the Deep Match is a one-time experience. Once it's been watched the
  // final settles into the normal tie display and the results CTA appears;
  // there is deliberately no way back into it.
  const [deepFinalWatched, setDeepFinalWatched] = useState(false)
  const koStoredResultRef = useRef<CLSeasonResult | null>(null)
  const koFinishedRef = useRef(false)

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

  // F-09 / D2: the matchday loop; your league-phase match plays live and the
  // next matchday and the rest of the round wait for it. The phase ends when
  // its last match does.
  const { liveMD: clLiveMD, liveDone: clLiveDone, clearLive: clClearLive } = useStageLoop({
    running: phase === 'simulating' && isPlaying, speed, step: simulateNextMD, tick: currentMD,
    onLiveDone: md => { if (md === totalMatchdays) { setIsPlaying(false); setPhase('completed') } },
  })
  const clLiveMatch = clLiveMD != null ? leagueHistoryRef.current.find(m => m.matchday === clLiveMD && (m.home.isPlayer || m.away.isPlayer)) : undefined
  const clLivePeriod = useMemo(() => clLiveMatch ? yourMatchPeriod({ ...clLiveMatch, homeClubId: clLiveMatch.home.clubId, awayClubId: clLiveMatch.away.clubId },
    `League Phase · Matchday ${clLiveMatch.matchday}`, poolByClubRef.current, { ...lineupCtxRef.current, playerFormation: formation ?? undefined }) : null, [clLiveMatch])

  useEffect(() => {
    const landed = clSnapshotsRef.current.length
    if (landed === clRestMD || clLiveMD != null) return
    const t = setTimeout(() => setClRestMD(landed), Math.round(SPEED_MS[speed] * 0.45))
    return () => clearTimeout(t)
  }, [simTeams, clRestMD, clLiveMD])

  // P8.5-40: the last matchday played (see simulateNextMD). Above the early return: it's a hook.
  const playedMDRef = useRef(0)

  // F-01: the league phase's press, as far as the table has been applied
  // (your live match holds the round back, so it holds the papers too).
  const clPhase = (upTo: number) => clPressStages({ leaguePhaseStandings: simTeams, leagueMatchdays: leagueHistoryRef.current.filter(m => m.matchday <= upTo), playoffRound: [], r16: [], qf: [], sf: [], final: null },
    { knockouts: [], phaseMatchdays: totalMatchdays })
  const clPress = useCupPress(() => (simTeams.length ? clPhase(clRestMD) : null), () => availabilityRef.current?.absences(), [clRestMD, simTeams.length])

  if (!clTeams || !formation || draftedPlayers.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: GR.bg, padding: space[4], justifyContent: 'center', gap: space[4] }]}>
        <EmptyState roles={GR} title={t('sim.noClData')} body={t('sim.lostSquadDraw')} />
        <Plate label={t('sim.startNew')} roles={GR} onPress={() => router.replace('/game/mode-select')} />
      </View>
    )
  }

  // P8.5-40: the last matchday actually played. A skip runs a frame after its
  // press (the waiting plate, P8.5-01), and the play timer already set for the
  // current matchday can fire in that frame: the skip then played the same
  // matchday again from its own (older) state, nine games in an eight-game
  // league phase. Both paths now play only past this.
  // Returns the matchday when your match in it plays live (useStageLoop).
  // Phase 9: timed to the frame that shows it (docs/diagnostics/03-BUDGETS.md §2.3).
  function simulateNextMD(): number | null { setLogContext(`ucl LP${currentMD}`); return timeToFrame('sim:matchday:ucl', simulateNextMDNow) }
  function simulateNextMDNow(): number | null {
    if (currentMD > totalMatchdays) { handleFinish(); return null }
    if (currentMD <= playedMDRef.current) return null
    playedMDRef.current = currentMD

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

    // Your match plays live first (F-09); the phase ends when it does.
    const live = playsLive(results.some(r => r.home.isPlayer || r.away.isPlayer), speed)
    if (currentMD === totalMatchdays) { if (!live) { setIsPlaying(false); setPhase('completed') } }
    else { setCurrentMD(prev => prev + 1) }
    return live ? currentMD : null
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

  function skipAll() { timeToFrame('sim:skip:ucl', skipAllNow) }
  function skipAllNow() {
    setIsPlaying(false)
    clClearLive()
    const teams = [...simTeams]
    for (let md = Math.max(currentMD, playedMDRef.current + 1); md <= totalMatchdays; md++) {
      playedMDRef.current = md
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
    const { pool, ctx } = await ensurePools(simTeams)
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
    } catch (e) { log.warn('sim', 'cl: scorer attribution failed', e) }

    // Fetch + attach named shootout kickers — ONE shared implementation used
    // by every mode (see attachCLShootoutNames in run-stats.ts).
    const allMatches: CLKnockoutMatch[] = [
      ...result.playoffRound, ...result.r16, ...result.qf, ...result.sf,
      ...(result.final ? [result.final] : []),
    ]
    await attachCLShootoutNames(allMatches, simTeams.find(t => t.isPlayer)?.clubId, fullSquad)

    const rounds = clKnockoutRounds(result,
      { playoff: 'Playoff Round', r16: 'Round of 16', qf: 'Quarter-Finals', sf: 'Semi-Finals', final: comp.finalLabel },
      { playoff: 2500, r16: 3000, qf: 4000, sf: 5000, final: 0 })

    // If the player was eliminated in the league phase, there's no drama to
    // play through — jump straight to the results screen (which still shows the
    // full bracket of the teams that did qualify).
    if (result.playerFinalRound === 'league_exit') {
      setClResult(koStoredResultRef.current)
      koFinishedRef.current = true
      setIsFinishing(false)
      router.push('/game/awards')
      return
    }

    setKoRounds(rounds)
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
    router.push('/game/awards')
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
  // Whose run every sheet opened from this screen belongs to.
  const clCtx: MatchCtx = { yearStart: clPoolYear, playerClubId: simTeams.find(t => t.isPlayer)?.clubId, drafted: fullSquad, playerFormation: formation ?? undefined }
  // `played`: the knockout rounds already settled (KnockoutStage hands them over).
  const clTimeline = (played: KnockoutRound[] = []): ContextMatch[] => {
    const phase: ContextMatch[] = fixtures.map(f => {
      // One club never plays twice on the same matchday, so matchday + home id
      // identifies the fixture uniquely.
      const played = leagueHistoryRef.current.find(m => m.matchday === f.matchday && m.home.clubId === f.home.clubId)
      return leagueMatch(played ?? f, `League Phase · Matchday ${f.matchday}`)
    })
    return appendKnockoutRounds(phase, played.map(r => ({
      label: r.label, ties: r.ties.map(t => knockoutTieToCLMatch(t, r.round)),
    })))
  }

  // C2 (docs/ui-overhaul/07c) — the league phase on the everyday ground, as the league
  // season: your result first, the table with the phase's three zones a beat
  // later, your eight as a strip. Knockouts keep their own view (C5).
  // P8-136: the movement column against the matchday before, not sliding rows.
  const orderAt = (md: number) => (md > 0 ? clSnapshotsRef.current[md - 1]?.map(t => t.clubId) : undefined)
  const clRows: TableRowVM[] = withMoves((clRestMD > 0 ? clSnapshotsRef.current[clRestMD - 1] : sortByStats(simTeams)).map(teamRow), orderAt(clRestMD - 1))
  const clYouPos = clRows.findIndex(r => r.isPlayer) + 1
  const clPrevPos = clRestMD > 1 ? clSnapshotsRef.current[clRestMD - 2].findIndex(t => t.isPlayer) + 1 : clYouPos
  const clHistoryYours = leagueHistoryRef.current.filter(m => m.home.isPlayer || m.away.isPlayer)
  // A match still playing live has no mark yet.
  const clMarks = clHistoryYours.filter(m => m.matchday !== clLiveMD).map(m => markOf(m.home.isPlayer, m.homeGoals, m.awayGoals))
  const clCardMD = clViewMD ?? clLatestMD
  const clCard = clHistoryYours.find(m => m.matchday === clCardMD)
  const clTableMD = clViewMD ?? clRestMD
  const clTableRows = clViewMD != null && clSnapshotsRef.current[clViewMD - 1]
    ? withMoves(clSnapshotsRef.current[clViewMD - 1].map(teamRow), orderAt(clViewMD - 1)) : clRows
  const clOthers = clShown.filter(m => !(m.home.isPlayer || m.away.isPlayer))
  const clPending = clViewMD == null && clLatestMD > clRestMD
  const clLeagueMatch = (m: CLLeagueMatch) => leagueMatch(m, `League Phase · Matchday ${m.matchday}`)
  const openClLeagueMatch = (m: CLLeagueMatch) => openMatchStats(matchRequest(clLeagueMatch(m), { ...clCtx, timeline: clTimeline() }))
  const yourEight = fixtures
    .filter(f => f.home.isPlayer || f.away.isPlayer)
    .sort((a, b) => a.matchday - b.matchday)

  if (phase === 'knockout_phase') {
    return (
      <KnockoutStage
        rounds={koRounds}
        competitionLabel={comp.fullName}
        yearStart={clPoolYear}
        colourway={colourwayFor(comp.mode)}
        // Nothing to pause by hand (L-12, checked 3 Oct): the rounds and
        // the live match both hold while the confirm sits on top.
        onAbandon={() => askAbandon(() => {})}
        onFinish={finishKnockoutPhase}
        // F-01: the run's press, the league phase and the knockouts played so far.
        pressFor={played => cupPress([...clPhase(totalMatchdays).filter(x => x.kind !== 'knockout'), ...knockoutStages(played)], availabilityRef.current?.absences() ?? [])}
        // "Final Results" goes straight where every run ends; watched is set too, so a
        // screen still mounted underneath shows the settled final.
        deepMatch={{ watched: deepFinalWatched, ctx: clCtx, accent: theme.accent, resultRoute: '/game/awards', onFinished: () => { setDeepFinalWatched(true); commitKnockoutResult() } }}
        panelLine={(a, b) => panelLineFor(clPanel, a, b)}
        pools={{ poolByClub: poolByClubRef.current, ctx: lineupCtxRef.current }}
        // §10.5 — the tie on its REAL slot in the timeline: the bracket so
        // far and "what did they play next" both hang off it.
        onTiePress={(tie, label, played) => openMatchStats(tieRequest(knockoutTieToCLMatch(tie, label), label, { ...clCtx, timeline: clTimeline(played) }))}
      />
    )
  }

  const clDone = phase === 'completed'
  const clMeta = t('sim.clMeta', { comp: comp.fullName, count: simTeams.length || 36, md: clLatestMD, total: totalMatchdays })
  const clStarted = phase !== 'review'
  return (
    <View style={[styles.container, { backgroundColor: GR.bg }]}>
      <KitScreen ground={EVERYDAY} width={wide ? 'wide' : 'column'} contentStyle={{ paddingBottom: space[4] }}>
        <RunHeader roles={GR} stage={6} colourway={colourwayFor(comp.mode)} back={false}
          title={clStarted ? undefined : t('sim.leaguePhaseTitle')}
          right={<CloseRun onPress={() => askAbandon(() => setIsPlaying(false))} />} />
        {!clStarted ? (
          <>
            <KitText t="tag" color={GR.textMuted}>{clMeta}</KitText>
            {lpDraw && (
              <LeaguePhaseDraw roles={GR} teams={simTeams} draw={lpDraw} countryOf={clCountryOf} after={(
                <>
                  <SectionTag roles={GR}>{t('sim.yourEight')}</SectionTag>
                  {yourEight.map(f => (
                    <FixtureRow key={f.matchday} roles={GR} matchday={f.matchday}
                      home={f.home.isPlayer} opponent={(f.home.isPlayer ? f.away : f.home).clubName} you={(f.home.isPlayer ? f.home : f.away).clubName}
                      pot={(f.home.isPlayer ? f.away : f.home).pot}
                      when={kickoffFor({ label: `League Phase · MD ${f.matchday}`, yearStart: clPoolYear, homeClubId: f.home.clubId, awayClubId: f.away.clubId })?.short} />
                  ))}
                  <ZoneLegend roles={GR} zones={CL_PHASE_ZONES} />
                </>
              )} />
            )}
          </>
        ) : (
          <TableStage roles={GR} wide={wide} tab={clTab} onTab={id => setClTab(id as typeof clTab)} meta={clMeta}
            standing={clRows[clYouPos - 1] ? { pos: clYouPos, delta: clPrevPos - clYouPos, zone: clRestMD > 0 ? CL_PHASE_ZONES[clYouPos - 1] : null, points: clRows[clYouPos - 1].points } : null}
            strip={{ marks: clMarks, total: totalMatchdays, viewing: clViewMD, latest: clRestMD, onPick: md => { setClViewMD(md); if (md != null) setIsPlaying(false) } }}
            keys={{ playPause: () => { if (!clDone) setIsPlaying(p => !p) } }}
            yourMatch={<>
            {clLiveMatch && clLivePeriod && panelLineFor(clPanel, clLiveMatch.home, clLiveMatch.away) && (
              <KitText t="body" color={GR.textMuted}>{panelLineFor(clPanel, clLiveMatch.home, clLiveMatch.away)}</KitText>
            )}
            {clLiveMatch && clLivePeriod ? (
              <LiveMatch key={`cl-md-${clLiveMatch.matchday}`} teamA={clLiveMatch.home} teamB={clLiveMatch.away}
                periods={[clLivePeriod]} onDone={clLiveDone} hold={!isPlaying} msPerMin={LIVE_MS_PER_MIN[speed]} />
            ) : clCard && (
              <ScorelineCard roles={GR} label={[label(`MD ${clCard.matchday}`), kickoffFor({ label: `League Phase · MD ${clCard.matchday}`, yearStart: clPoolYear, homeClubId: clCard.home.clubId, awayClubId: clCard.away.clubId })?.short].filter(Boolean).join(' · ')}
                homeName={clCard.home.clubName} awayName={clCard.away.clubName} homeClubId={clCard.home.clubId} awayClubId={clCard.away.clubId}
                homeGoals={clCard.homeGoals} awayGoals={clCard.awayGoals} youHome={clCard.home.isPlayer}
                homeScorers={summariseScorers(clCard.scorers?.home) || undefined}
                awayScorers={summariseScorers(clCard.scorers?.away) || undefined}
                onPress={() => openClLeagueMatch(clCard)}
                footer={<ManOfTheMatch roles={GR} req={matchRequest(clLeagueMatch(clCard), clCtx)!} />} />
            )}
            </>}
            panes={[
              { id: 'table', label: t('sim.tabTable'), title: t('sim.leaguePhase'), flex: 1.4, wideOrder: 1, node: <>
                <LeagueTable roles={GR} rows={clTableRows} zones={CL_PHASE_ZONES} muted={clRestMD === 0} />
                <ZoneLegend roles={GR} zones={CL_PHASE_ZONES} />
              </> },
              { id: 'results', label: clTableMD > 0 ? t('sim.tabResultsMd', { md: clViewMD ?? clLatestMD }) : t('sim.tabResults'),
                title: clTableMD > 0 ? t('sim.resultsMd', { md: clViewMD ?? clLatestMD }) : t('sim.tabResults'), wideOrder: 0, node: <>
            {clPending
              ? <KitText t="body" color={GR.textMuted} style={{ paddingVertical: space[3] }}>{t('sim.yourMatchFirst')}</KitText>
              : clOthers.map((m, i) => (
                  <ResultRow key={i} roles={GR} homeName={m.home.clubName} awayName={m.away.clubName}
                    homeGoals={m.homeGoals} awayGoals={m.awayGoals} youSide={null}
                    homeClubId={m.home.clubId} awayClubId={m.away.clubId}
                    homeScorers={summariseScorers(m.scorers?.home) || undefined} awayScorers={summariseScorers(m.scorers?.away) || undefined}
                    onPress={() => openClLeagueMatch(m)} />
                ))}
            {!clPending && clShown.length > 0 && (
              <RoundTeam roles={GR} roundKey={`cl-${clShown[0].matchday}`} label={t('sim.teamOfMd', { md: clShown[0].matchday })}
                poolByClub={poolByClubRef.current} ctx={lineupCtxRef.current}
                fixtures={clShown.map(m => ({
                  homeClubId: m.home.clubId, awayClubId: m.away.clubId, homeClubName: m.home.clubName, awayClubName: m.away.clubName,
                  homeGoals: m.homeGoals, awayGoals: m.awayGoals, scorers: m.scorers, seed: m.seed,
                  homeRotation: m.homeRotation, awayRotation: m.awayRotation, absent: m.absent, standIns: m.standIns,
                }))} />
            )}
              </> },
              { id: 'fixtures', label: t('season.tabFixtures'), title: t('sim.yourEight'), node: <YourFixtures roles={GR} rows={yourEight.map(f => {
                const played = clHistoryYours.find(m => m.matchday === f.matchday)
                const youHome = f.home.isPlayer
                return {
                  matchday: f.matchday, home: youHome, opponent: (youHome ? f.away : f.home).clubName, pot: (youHome ? f.away : f.home).pot, you: (youHome ? f.home : f.away).clubName,
                  when: kickoffFor({ label: `League Phase · MD ${f.matchday}`, yearStart: clPoolYear, homeClubId: f.home.clubId, awayClubId: f.away.clubId })?.short,
                  result: played ? { mine: youHome ? played.homeGoals : played.awayGoals, theirs: youHome ? played.awayGoals : played.homeGoals } : undefined,
                }
              })} /> },
              { id: 'press', label: t('season.tabPress'), count: clPress.length, title: `${t('season.tabPress')} · ${clPress.length}`,
                node: <PressList roles={GR} stories={clPress} empty={t('sim.pressWait')} onOpen={openStory} /> },
            ]} />
        )}
      </KitScreen>

      <ThumbBar>
        {clStarted && !clDone && (
          <StageControls roles={GR} skip={{ label: t('sim.skipLastMd'), consequence: t('sim.mdsAtOnce', { from: currentMD, to: totalMatchdays }),
            pause: () => setIsPlaying(false), run: () => clSkipRef.current() }} />
        )}
        {!clStarted && predictionSeed == null ? (
          <Plate label={t('draw.pundits')} icon="forward" roles={GR} onPress={openPunditsFromDraw} />
        ) : !clStarted ? (
          <Plate label={t('sim.startLeaguePhase')} icon="play" roles={GR}
            onPress={() => { setPhase('simulating'); setIsPlaying(true) }} />
        ) : clDone ? (
          <Plate label={sortByStats(simTeams).findIndex(team => team.isPlayer) >= 24 ? t('sim.howItEnds') : t('sim.koDraw')}
            icon="forward" roles={GR} onPress={handleFinish} loading={isFinishing} />
        ) : (
          <Plate label={isPlaying ? t('sim.pause') : t('sim.playMd', { md: currentMD })} icon={isPlaying ? 'pause' : 'play'} roles={GR}
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
  const wcPanel = useMemo(() => {
    const f = punditField('world_cup', { wcTeams })
    return f && predictionSeed != null ? punditPanel(f.teams, predictionSeed, undefined, f.matchesPerClub) : []
  }, [wcTeams, predictionSeed])
  const fullSquad = [...draftedPlayers, ...benchPlayers]

  const slots        = formation ? getSlotsForFormation(formation) : []
  const baseTeamOvr  = formation && draftedPlayers.length > 0 ? calcTeamOvr(draftedPlayers, slots) : 0
  const totalTeamOvr = baseTeamOvr

  const [phase,         setPhase]         = useState<SimPhase>('review')
  useSimBackGuard(phase !== 'review')   // §3 — active once the group stage starts simulating
  const openPunditsFromDraw = usePunditsFirst(() => { setPhase('simulating'); setIsPlaying(true) })
  const [currentMD,     setCurrentMD]     = useState(1)
  const [simTeams,      setSimTeams]      = useState<WCTeam[]>([])
  const [groups,        setGroups]        = useState<WCGroup[]>([])
  const [fixtures,      setFixtures]      = useState<{ matchday: number; home: WCTeam; away: WCTeam }[]>([])
  const [recentResults, setRecentResults] = useState<CompMatchResult[]>([])
  const [isPlaying,     setIsPlaying]     = useState(false)
  usePauseOnBlur(setIsPlaying)   // P8-32
  const wide = useSizeClass() === 'expanded'   // tabs → side-by-side panes (10-ADAPT §2.2)
  // Your group match plays out on a live clock each matchday before the board
  // updates. playedMD = last matchday simulated; pending holds the computed
  // result until the clock finishes (so the standings don't spoil the score).
  const [livePlayerMatch, setLivePlayerMatch] = useState<{ result: CompMatchResult; md: number } | null>(null)
  const [playedMD,        setPlayedMD]        = useState(0)
  const [wcViewMD,        setWcViewMD]        = useState<number | null>(null)  // other-matches lookback (null = latest)
  const pendingMDRef = useRef<{ teams: WCTeam[]; results: CompMatchResult[]; md: number } | null>(null)
  // F-05: the app's one speed setting; the groups were locked to slow.
  const speed = useSettingsStore(s => s.speed)
  const theme = MODE_THEMES.world_cup
  const [isFinishing,   setIsFinishing]   = useState(false)
  const finishingRef = useRef(false)   // bulletproof re-entry guard (state lags a tap)

  // WC Knockout phase state
  const [wcKoRounds,       setWcKoRounds]       = useState<KnockoutRound[]>([])
  // §7 R6 — see the UCL screen above: watched once, then never again.
  const [wcDeepFinalWatched, setWcDeepFinalWatched] = useState(false)
  const wcKoStoredResultRef = useRef<WCSeasonResult | null>(null)
  const wcKoFinishedRef = useRef(false)
  // Records every group-stage result so the results screen can show matchdays.
  const groupHistoryRef = useRef<WCGroupMatch[]>([])
  // The squads and the injury ledger: the groups and the whole bracket, so a
  // group-stage injury can rule somebody out of the quarter-finals.
  const { poolByClubRef, lineupCtxRef, availabilityRef, ensure: ensurePools } = useStagePools({
    teams: wcTeams, squad: fullSquad, yearStart: 2026, useSubstitutes, totalMatchdays: WC_TOTAL_MATCHDAYS, tag: 'wc',
  })

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

  // D2: at Fast your match goes straight to the card, as on every stage.
  useEffect(() => { if (speed === 'fast' && livePlayerMatch) applyMatchday() }, [speed, livePlayerMatch])

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
  const liveGroupPeriod = React.useMemo(() => {
    if (!livePlayerMatch) return null
    const r = livePlayerMatch.result
    return yourMatchPeriod({ ...r, homeClubId: r.home.clubId, awayClubId: r.away.clubId },
      `Group ${groups.find(g => g.teams.some(x => x.isPlayer))?.id ?? ''} · Matchday ${livePlayerMatch.md}`, poolByClubRef.current,
      { ...lineupCtxRef.current, playerFormation: formation ?? undefined })
  }, [livePlayerMatch])

  const [wcTab, setWcTab] = useState<'group' | 'thirds' | 'results' | 'fixtures' | 'groups' | 'press'>('group')
  const wcSkipRef = useRef<() => void>(() => {})

  // F-01: the groups' press. The history only holds applied matchdays (yours
  // waits for its live match), so the papers wait with it.
  const wcGroupsPress = () => wcPressStages({ groups, groupMatchdays: groupHistoryRef.current, knockoutRounds: [] }, { knockouts: [] })
  const wcPress = useCupPress(() => (groups.length ? wcGroupsPress() : null), () => availabilityRef.current?.absences(), [groupHistoryRef.current.length, groups.length])

  if (!wcTeams || !formation || draftedPlayers.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: GR.bg, padding: space[4], justifyContent: 'center', gap: space[4] }]}>
        <EmptyState roles={GR} title={t('sim.noWcData')} body={t('sim.lostSquadDraw')} />
        <Plate label={t('sim.startNew')} roles={GR} onPress={() => router.replace('/game/mode-select')} />
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
  // Phase 9: timed to the frame that shows it (docs/diagnostics/03-BUDGETS.md §2.3).
  function playMatchday(md: number) { setLogContext(`wc G${md}`); timeToFrame('sim:matchday:wc', () => playMatchdayNow(md)) }
  function playMatchdayNow(md: number) {
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

  function skipAll() { timeToFrame('sim:skip:wc', skipAllNow) }
  function skipAllNow() {
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
    const { pool, ctx } = await ensurePools(simTeams)
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
    } catch (e) { log.warn('sim', 'wc: scorer attribution failed', e) }

    // Fetch + attach named shootout kickers — ONE shared implementation used
    // by every mode (see attachWCShootoutNames in run-stats.ts).
    const allWCMatches = result.knockoutRounds.flatMap(r => r.matches)
    await attachWCShootoutNames(allWCMatches, simTeams.find(t => t.isPlayer)?.clubId, fullSquad)

    const wcRounds = wcKnockoutRounds(result,
      { r32: 'Round of 32', r16: 'Round of 16', qf: 'Quarter-Finals', sf: 'Semi-Finals', third: 'Third-Place Playoff', final: 'FIFA World Cup Final' },
      { r32: 1500, r16: 2500, qf: 4000, sf: 5000, third: 4500, final: 0 })

    // If the player was knocked out in the group stage, there's no drama to
    // play through — jump straight to the results screen (which still shows the
    // full bracket of the teams that did qualify).
    if (result.playerFinalRound === 'groups') {
      setWcResult(wcKoStoredResultRef.current)
      wcKoFinishedRef.current = true
      setIsFinishing(false)
      router.push('/game/awards')
      return
    }

    setWcKoRounds(wcRounds)
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
    router.push('/game/awards')
  }

  // Find player's group for the left standings panel
  const playerGroup = groups.find(g => g.teams.some(t => t.isPlayer))
  const playerGroupSorted = playerGroup
    ? [...playerGroup.teams].sort((a, b) => {
        return compareStandings(a, b)
      })
    : []
  const playedCount = playerGroupSorted.find(t => t.isPlayer)?.stats.played ?? 0
  const wcYouPos = playerGroupSorted.findIndex(t => t.isPlayer) + 1

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
  // Your place in your group a matchday ago, from the same table the match
  // sheet shows "as it stood" (standingsAsOf), so the two can't disagree.
  const wcPrevPos = (() => {
    if (!playerGroup || wcLatestMD < 2) return null
    const before = standingsAsOf(groupHistoryRef.current.filter(m => m.groupId === playerGroup.id)
      .map(m => leagueMatch(m, `Group ${m.groupId} · Matchday ${m.matchday}`)), wcLatestMD - 1)
    const i = before.findIndex(r => playerGroup.teams.some(x => x.isPlayer && x.clubId === r.clubId))
    return i >= 0 ? i + 1 : null
  })()

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
  const wcCtx: MatchCtx = { yearStart: 2026, playerClubId: simTeams.find(t => t.isPlayer)?.clubId, drafted: fullSquad, playerFormation: formation ?? undefined }
  const wcTimeline = (tableGroup: string | null, played: KnockoutRound[] = []): ContextMatch[] => {
    const phase: ContextMatch[] = fixtures.map(f => {
      const played = groupHistoryRef.current.find(m => m.matchday === f.matchday && m.home.clubId === f.home.clubId)
      const groupId = f.home.groupId ?? ''
      return leagueMatch(played ?? f, `Group ${groupId} · Matchday ${f.matchday}`, groupId === tableGroup)
    })
    return appendKnockoutRounds(phase, played.map(r => ({
      label: r.label, ties: r.ties.map(t => knockoutTieToCLMatch(t, r.round)),
    })))
  }

  // C3 (docs/ui-overhaul/07c) — the group stage on the everyday ground. Your group is the
  // table; the race for the eight best third places runs live beside it,
  // because that's the World Cup's real drama; the other eleven groups are a
  // wall you can open. Knockouts keep their own view (C5).
  const wcSortFn = (a: WCTeam, b: WCTeam) => {
    return compareStandings(a, b)
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
  const wcFate = wcYourIdx === 0 ? { text: t('sim.throughWinners'), good: true }
    : wcYourIdx === 1 ? { text: t('sim.throughSecond'), good: true }
    : wcYourIdx === 2 && wcYouThird >= 0 && wcYouThird < 8 ? { text: t('sim.throughThird'), good: true }
    : { text: t('sim.out'), good: false }
  const wcYourMatches = groupHistoryRef.current.filter(m => m.home.isPlayer || m.away.isPlayer)
  const wcMarks = wcYourMatches.map(m => markOf(m.home.isPlayer, m.homeGoals, m.awayGoals))
  const wcOthers = wcShown.filter(m => !(m.home.isPlayer || m.away.isPlayer))
  const wcCard = wcYourMatches.find(m => m.matchday === wcViewing)
  const openWcGroupMatch = (m: WCGroupMatch) => openMatchStats(matchRequest(
    leagueMatch(m, `Group ${m.groupId} · Matchday ${m.matchday}`, true), { ...wcCtx, timeline: wcTimeline(m.groupId) }))
  const openGroupSim = (id: string) => {
    const g = groups.find(x => x.id === id)
    if (g) openWCGroup(g, groupHistoryRef.current.filter(m => m.groupId === id), openWcGroupMatch)
  }

  if (phase === 'knockout_phase') {
    return (
      <KnockoutStage
        rounds={wcKoRounds}
        competitionLabel="FIFA World Cup"
        yearStart={2026}
        colourway={colourwayFor('world_cup')}
        // Nothing to pause by hand (L-12, checked 3 Oct): the rounds and
        // the live match both hold while the confirm sits on top.
        onAbandon={() => askAbandon(() => {})}
        onFinish={finishWCKnockoutPhase}
        pressFor={played => cupPress([...wcGroupsPress(), ...knockoutStages(played)], availabilityRef.current?.absences() ?? [])}
        deepMatch={{ watched: wcDeepFinalWatched, ctx: wcCtx, accent: theme.accent, resultRoute: '/game/awards', onFinished: () => { setWcDeepFinalWatched(true); commitWCKnockoutResult() } }}
        panelLine={(a, b) => panelLineFor(wcPanel, a, b)}
        pools={{ poolByClub: poolByClubRef.current, ctx: lineupCtxRef.current }}
        // The tie on its real slot in the timeline (see the Champions League's).
        onTiePress={(tie, label, played) => openMatchStats(tieRequest(knockoutTieToCLMatch(tie, label), label, { ...wcCtx, timeline: wcTimeline(null, played) }))}
      />
    )
  }

  const wcStage = phase === 'review' ? 'draw' : phase === 'group_review' ? 'done' : 'live'
  const wcMeta = t('sim.wcMeta', { where: playerGroup ? t('sim.groupN', { id: playerGroup.id }) : t('sim.twelveGroups'), stage: wcStage === 'done' ? t('sim.groupsComplete') : t('sim.roundOf', { n: Math.max(playedCount, livePlayerMatch?.md ?? 0), total: totalMatchdays }) })
  const groupTable = <>
    <LeagueTable roles={GR} rows={playerGroupSorted.map(x => wcFlagRow(x))} zones={WC_GROUP_ZONES} muted={playedCount === 0} />
    <ZoneLegend roles={GR} zones={WC_GROUP_ZONES} />
  </>
  const thirdsRace = <>
    <KitText t="body" color={GR.textMuted} style={{ paddingVertical: space[2] }}>{t('sim.thirdsNote')}</KitText>
    <LeagueTable roles={GR} rows={wcThirds.map(x => wcFlagRow(x, x.groupId))} zones={WC_THIRD_ZONES} muted={playedCount === 0} />
  </>
  return (
    <View style={[styles.container, { backgroundColor: GR.bg }]}>
      <KitScreen ground={EVERYDAY} width={wide ? 'wide' : 'column'} contentStyle={{ paddingBottom: space[4] }}>
        <RunHeader roles={GR} stage={6} colourway={colourwayFor('world_cup')} back={false}
          title={wcStage === 'draw' ? t('sim.groupDraw') : undefined}
          right={<CloseRun onPress={() => askAbandon(() => setIsPlaying(false))} />} />
        {wcStage !== 'live' && <KitText t="tag" color={GR.textMuted}>{wcMeta}</KitText>}

        {wcStage === 'draw' && (
          <>
            <KitText t="bodyL" color={GR.text} style={{ marginTop: space[2] }}>{t('sim.topTwo')}</KitText>
            <KitText t="bodyL" color={GR.text}>{t('sim.bestThirds')}</KitText>
            {playerGroup && (
              <>
                <SectionTag roles={GR}>{t('sim.yourGroupId', { id: playerGroup.id })}</SectionTag>
                {fixtures.filter(f => f.home.isPlayer || f.away.isPlayer).sort((a, b) => a.matchday - b.matchday).map(f => {
                  const opp = f.home.isPlayer ? f.away : f.home
                  return <FixtureRow key={f.matchday} roles={GR} matchday={f.matchday} home={null} opponent={opp.clubName} flag={getFlag(opp.clubId)}
                    when={kickoffFor({ label: `Group ${playerGroup.id} · MD ${f.matchday}`, yearStart: 2026, homeClubId: f.home.clubId, awayClubId: f.away.clubId })?.short} />
                })}
              </>
            )}
            <SectionTag roles={GR}>{t('sim.everyGroup')}</SectionTag>
            <GroupWall roles={GR} groups={wcWall} onOpen={openGroupSim} />
          </>
        )}

        {wcStage === 'live' && (
          <TableStage roles={GR} wide={wide} tab={wcTab} onTab={id => setWcTab(id as typeof wcTab)} meta={wcMeta}
            // F-07: where you stand in your group, and the move since the last matchday.
            standing={wcYouPos > 0 && playedCount > 0 ? { pos: wcYouPos, delta: wcPrevPos == null ? null : wcPrevPos - wcYouPos, zone: WC_GROUP_ZONES[wcYouPos - 1] ?? null, points: playerGroupSorted[wcYouPos - 1]?.stats.points ?? 0 } : null}
            // F-06: the lookback (its state was declared and never set).
            strip={{ marks: wcMarks, total: totalMatchdays, viewing: wcViewMD, latest: wcLatestMD, onPick: md => { setWcViewMD(md); if (md != null) setIsPlaying(false) } }}
            keys={{ playPause: () => setIsPlaying(p => !p) }}
            yourMatch={<>
            {livePlayerMatch && panelLineFor(wcPanel, livePlayerMatch.result.home, livePlayerMatch.result.away) && (
              <KitText t="body" color={GR.textMuted}>{panelLineFor(wcPanel, livePlayerMatch.result.home, livePlayerMatch.result.away)}</KitText>
            )}
            {livePlayerMatch ? (
              <LiveMatch
                key={`wc-md-${livePlayerMatch.md}`}
                teamA={livePlayerMatch.result.home}
                teamB={livePlayerMatch.result.away}
                periods={[liveGroupPeriod!]}
                accent={theme.accent}
                onDone={applyMatchday}
                // The page's Pause stopped the matchdays but never the match
                // being played (the maintainer, 27 Sept); and its speed never
                // reached the live clock (P8-137).
                hold={!isPlaying}
                msPerMin={LIVE_MS_PER_MIN[speed]}
              />
            ) : wcCard ? (
              // Your match as a card once it's played, as on every other stage
              // (the groups had none: the live match ended and left nothing).
              <ScorelineCard roles={GR} label={[label(`MD ${wcCard.matchday}`), kickoffFor({ label: `Group ${wcCard.groupId} · MD ${wcCard.matchday}`, yearStart: 2026, homeClubId: wcCard.home.clubId, awayClubId: wcCard.away.clubId })?.short].filter(Boolean).join(' · ')}
                homeName={wcCard.home.clubName} awayName={wcCard.away.clubName} homeClubId={wcCard.home.clubId} awayClubId={wcCard.away.clubId}
                homeGoals={wcCard.homeGoals} awayGoals={wcCard.awayGoals} youHome={wcCard.home.isPlayer}
                homeScorers={summariseScorers(wcCard.scorers?.home) || undefined}
                awayScorers={summariseScorers(wcCard.scorers?.away) || undefined}
                onPress={() => openWcGroupMatch(wcCard)}
                footer={<ManOfTheMatch roles={GR} req={matchRequest(leagueMatch(wcCard, `Group ${wcCard.groupId} · Matchday ${wcCard.matchday}`, true), wcCtx)!} />} />
            ) : (
              <KitText t="body" color={GR.textMuted} style={{ paddingVertical: space[3] }}>
                {playedCount === 0 ? t('sim.firstKickoff') : t('sim.nextKickoff')}
              </KitText>
            )}
            </>}
            panes={[
              // On a wide window the race for third sits under your group.
              { id: 'group', label: t('sim.yourGroup'), flex: 1.2, node: groupTable,
                wideNode: <>{groupTable}<SectionTag roles={GR}>{t('sim.raceForThird')}</SectionTag>{thirdsRace}</> },
              { id: 'thirds', label: t('sim.thirdRace'), node: thirdsRace, wideNode: null },
              { id: 'results', label: t('sim.tabResults'), title: wcViewing > 0 ? t('sim.resultsMd', { md: wcViewing }) : t('sim.tabResults'), node: <>{wcOthers.length === 0
              ? <KitText t="body" color={GR.textMuted} style={{ paddingVertical: space[3] }}>{t('sim.noOtherResults')}</KitText>
              : wcOthers.map((m, i) => (
                  <View key={i}>
                    {(i === 0 || wcOthers[i - 1].groupId !== m.groupId) && <SectionTag roles={GR}>{t('sim.groupMd', { id: m.groupId, md: m.matchday })}</SectionTag>}
                    <ResultRow roles={GR} homeName={m.home.clubName} awayName={m.away.clubName}
                      homeGoals={m.homeGoals} awayGoals={m.awayGoals} youSide={null}
                      homeClubId={m.home.clubId} awayClubId={m.away.clubId}
                    homeScorers={summariseScorers(m.scorers?.home) || undefined} awayScorers={summariseScorers(m.scorers?.away) || undefined}
                      onPress={() => openWcGroupMatch(m)} />
                  </View>
                ))}
            {/* F-03: the team of the matchday, as every other stage has it. */}
            {wcShown.length > 0 && (
              <RoundTeam roles={GR} roundKey={`wc-${wcViewing}`} label={t('sim.teamOfMd', { md: wcViewing })}
                poolByClub={poolByClubRef.current} ctx={lineupCtxRef.current}
                fixtures={wcShown.map(m => ({
                  homeClubId: m.home.clubId, awayClubId: m.away.clubId, homeClubName: m.home.clubName, awayClubName: m.away.clubName,
                  homeGoals: m.homeGoals, awayGoals: m.awayGoals, scorers: m.scorers, seed: m.seed,
                  homeRotation: m.homeRotation, awayRotation: m.awayRotation, absent: m.absent, standIns: m.standIns,
                }))} />
            )}</> },
              // F-08: your three, played and to come.
              { id: 'fixtures', label: t('season.tabFixtures'), node: <>
              <YourFixtures roles={GR} rows={fixtures.filter(f => f.home.isPlayer || f.away.isPlayer).sort((a, b) => a.matchday - b.matchday).map(f => {
                const youHome = f.home.isPlayer
                const opp = youHome ? f.away : f.home
                const played = groupHistoryRef.current.find(m => m.matchday === f.matchday && m.home.clubId === f.home.clubId)
                return {
                  matchday: f.matchday, home: null, you: (youHome ? f.home : f.away).clubName, opponent: opp.clubName, flag: getFlag(opp.clubId),
                  when: kickoffFor({ label: `Group ${playerGroup?.id ?? ''} · MD ${f.matchday}`, yearStart: 2026, homeClubId: f.home.clubId, awayClubId: f.away.clubId })?.short,
                  result: played ? { mine: youHome ? played.homeGoals : played.awayGoals, theirs: youHome ? played.awayGoals : played.homeGoals } : undefined,
                }
              })} />
              </> },
              { id: 'groups', label: t('sim.allGroups'), node: <GroupWall roles={GR} groups={wcWall} onOpen={openGroupSim} /> },
              { id: 'press', label: t('season.tabPress'), count: wcPress.length, title: `${t('season.tabPress')} · ${wcPress.length}`,
                node: <PressList roles={GR} stories={wcPress} empty={t('sim.pressWait')} onOpen={openStory} /> },
            ]} />
        )}

        {wcStage === 'done' && (
          <>
            <StampLabel roles={GR} text={wcFate.text} good={wcFate.good}
              sub={wcYourIdx === 2 ? t('sim.ofTwelveThirds', { place: ordinal(wcYouThird + 1) }) : undefined} />
            <SectionTag roles={GR}>{t('sim.groupN', { id: playerGroup?.id ?? '' })}</SectionTag>
            <LeagueTable roles={GR} rows={wcYourSorted.map(t => wcFlagRow(t))} zones={WC_GROUP_ZONES} />
            {wcYourMatches.map(m => {
              const youHome = m.home.isPlayer
              const opp = youHome ? m.away : m.home
              return (
                <FixtureRow key={m.matchday} roles={GR} matchday={m.matchday} home={null} opponent={opp.clubName} flag={getFlag(opp.clubId)}
                  result={{ mine: youHome ? m.homeGoals : m.awayGoals, theirs: youHome ? m.awayGoals : m.homeGoals }}
                  when={kickoffFor({ label: `Group ${m.groupId} · MD ${m.matchday}`, yearStart: 2026, homeClubId: m.home.clubId, awayClubId: m.away.clubId })?.short} />
              )
            })}
            <SectionTag roles={GR}>{t('sim.bestThirdsTitle')}</SectionTag>
            <LeagueTable roles={GR} rows={wcThirds.map(t => wcFlagRow(t, t.groupId))} zones={WC_THIRD_ZONES} />
            <ZoneLegend roles={GR} zones={WC_THIRD_ZONES} />
            <SectionTag roles={GR}>{t('sim.everyGroup')}</SectionTag>
            <GroupWall roles={GR} groups={wcWall} onOpen={openGroupSim} />
          </>
        )}
      </KitScreen>

      <ThumbBar>
        {wcStage === 'draw' && (predictionSeed == null
          ? <Plate label={t('draw.pundits')} icon="forward" roles={GR} onPress={openPunditsFromDraw} />
          : <Plate label={t('sim.startGroups')} icon="play" roles={GR} onPress={() => { setPhase('simulating'); setIsPlaying(true) }} />
        )}
        {wcStage === 'live' && (
          <StageControls roles={GR} skip={{ label: t('sim.skipGroups'), consequence: t('sim.groupsAtOnce'),
            pause: () => setIsPlaying(false), run: () => wcSkipRef.current() }} />
        )}
        {wcStage === 'done' && (
          <Plate label={wcFate.good ? t('sim.koDraw') : t('sim.howItEnds')} icon="forward" roles={GR}
            onPress={handleFinish} loading={isFinishing} />
        )}
      </ThumbBar>
    </View>
  )
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: GR.bg,
  },
})
