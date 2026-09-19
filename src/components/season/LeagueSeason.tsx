import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useSizeClass, MAX_CONTENT, COLUMN } from '@/hooks/useSizeClass'
import { WebKeys } from '@/lib/webKeys'
import { View, Pressable, StyleSheet } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useGameStore } from '@/store/gameStore'
import { calcTeamOvr } from '@/engine/rating'
import { getSlotsForFormation } from '@/engine/formations'
import { generateFixtures } from '@/engine/fixtures'
import { simulateMatch } from '@/engine/match'
import { rotationFor } from '@/engine/rotation'
import { effectiveMatchOvrs } from '@/engine/lineup'
import { createAvailabilityLedger, availabilityFor, recordMatchOutcome, type AvailabilityLedger } from '@/engine/availability'
import { assignTier } from '@/engine/tier'
import { loadLeaguePools, attributeFixtureScorers, summariseScorers } from '@/engine/run-stats'
import { toContextMatches } from '@/engine/match-context'
import { predictTable } from '@/engine/predictions'
import { writePress, type Story } from '@/engine/press'
import { zonesFor } from '@/data/qualification-bands'
import { useModeTheme } from '@/hooks/useModeTheme'
import { useSimBackGuard } from '@/hooks/useSimBackGuard'
import { openMatchStats } from '@/lib/matchStats'
import { openConfirm } from '@/lib/confirm'
import { randomSeed } from '@/lib/rng'
import { haptic } from '@/lib/haptics'
import { ROLES, space, border, colourwayFor } from '@/theme'
import { KitScreen, KitText, RunHeader, Plate, Chips, Icon, SectionTag, EmptyState } from '@/components/kit'
import type { SimTeam, Fixture, SeasonResult, MatchdaySnapshot } from '@/types/simulation'
import type { RosterPlayer } from '@/types/stats'
import {
  LeagueTable, ZoneLegend, leagueTableZones, StandingFigure, SeasonStrip, ScorelineCard,
  ResultRow, SegmentSwitch, Ticker, StoryItem, type TableRowVM, type Mark,
} from './SeasonParts'

// C1 · The league season (docs/ui-overhaul/07c), on nylon. Your table under
// floodlights with the real season's zones; your match lands first and the
// rest of the round a beat later; your season as a strip you can scrub; the
// run's press as a ticker. The simulation itself is unchanged from the old
// screen: seed first, then rotation and availability, then the result, then
// scorers attributed once and stored on the fixture.

const roles = ROLES.nylon

type Speed = 'slow' | 'normal' | 'fast'
const SPEED_MS: Record<Speed, number> = { slow: 2000, normal: 400, fast: 100 }
// How long after your result the rest of the round and the table land.
const BEAT_SHARE = 0.45
type Tab = 'table' | 'results' | 'press'

// §10.5 — a league side rests players once the table says the game can no
// longer change its season, and never while anything is still live. Your own
// club is never rotated: you drafted that XI, so you field it.
// ponytail: fixed cut-offs, not the real zones — switching them moves the
// balance, which needs its own measured pass.
const LEAGUE_EURO_SPOTS = 5
const LEAGUE_RELEGATION_SPOTS = 3

function leagueRotations(teams: SimTeam[], home: SimTeam, away: SimTeam, totalMatchdays: number, playedMatchdays: number) {
  const stakes = {
    standings: teams.map(t => ({ clubId: t.clubId, points: t.stats.points })),
    totalMatchdays, playedMatchdays,
    qualifyCutoff: LEAGUE_EURO_SPOTS, dropCutoff: LEAGUE_RELEGATION_SPOTS, titleMatters: true,
  }
  return {
    home: home.isPlayer ? 0 : rotationFor({ ...stakes, clubId: home.clubId }),
    away: away.isPlayer ? 0 : rotationFor({ ...stakes, clubId: away.clubId }),
  }
}

function sortTeams(teams: SimTeam[]) {
  return [...teams].sort((a, b) => {
    if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points
    const gdA = a.stats.goalsFor - a.stats.goalsAgainst
    const gdB = b.stats.goalsFor - b.stats.goalsAgainst
    if (gdB !== gdA) return gdB - gdA
    return b.stats.goalsFor - a.stats.goalsFor
  })
}

const toRow = (t: SimTeam): TableRowVM => ({
  clubId: t.clubId, clubName: t.clubName, isPlayer: t.isPlayer,
  played: t.stats.played, gd: t.stats.goalsFor - t.stats.goalsAgainst, points: t.stats.points,
})

function markFor(f: Fixture): Mark | null {
  if (!f.result) return null
  const youHome = f.home.isPlayer
  const mine = youHome ? f.result.homeGoals - f.result.awayGoals : f.result.awayGoals - f.result.homeGoals
  return mine > 0 ? 'W' : mine < 0 ? 'L' : 'D'
}

const isYours = (f: Fixture) => f.home.isPlayer || f.away.isPlayer

export default function LeagueSeason() {
  const { draftedPlayers, benchPlayers, useSubstitutes, formation, placedLeague, setSimResult, mode, predictionSeed } = useGameStore()
  const fullSquad = [...draftedPlayers, ...benchPlayers]
  const slots = formation ? getSlotsForFormation(formation) : []
  const totalTeamOvr = formation && draftedPlayers.length > 0 ? calcTeamOvr(draftedPlayers, slots) : 0
  const theme = useModeTheme()
  const insets = useSafeAreaInsets()
  const colourway = colourwayFor(mode)

  const { start } = useLocalSearchParams<{ start?: string }>()
  const [simTeams, setSimTeams] = useState<SimTeam[]>([])
  const [allFixtures, setAllFixtures] = useState<Fixture[]>([])
  const [nextMD, setNextMD] = useState(1)          // the matchday to play next
  const [landedMD, setLandedMD] = useState(0)      // your result is showing for this one
  const [restMD, setRestMD] = useState(0)          // the table and the rest of the round
  const [isPlaying, setIsPlaying] = useState(false)
  const [done, setDone] = useState(false)
  const [speed, setSpeed] = useState<Speed>('normal')
  const [viewMD, setViewMD] = useState<number | null>(null)
  const sizeClass = useSizeClass()
  const [tab, setTab] = useState<Tab>('table')
  const [stories, setStories] = useState<Story[]>([])
  const [flashId, setFlashId] = useState<string | null>(null)
  const [poolsReady, setPoolsReady] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const autoStarted = useRef(false)
  const finishingRef = useRef(false)
  useSimBackGuard(landedMD > 0 || isPlaying)

  const totalMatchdays = allFixtures.length ? Math.max(...allFixtures.map(f => f.matchday)) : (placedLeague?.gamesPerSeason ?? 38)
  const zones = useMemo(
    () => (placedLeague ? zonesFor(placedLeague.leagueId, placedLeague.yearStart, placedLeague.teams.length) : []),
    [placedLeague],
  )
  const tableZones = useMemo(() => leagueTableZones(zones), [zones])

  // Tracked for the verdict, exactly as before.
  const upsetsRef = useRef<SeasonResult['upsets']>([])
  const biggestWinRef = useRef<SeasonResult['biggestWin']>(null)
  const biggestWinMarginRef = useRef(-1)
  const worstLossRef = useRef<SeasonResult['worstLoss']>(null)
  const worstLossMarginRef = useRef(-1)
  const historyRef = useRef<MatchdaySnapshot[]>([])
  const pressRef = useRef<Story[]>([])

  // Goalscorer pools, the lineup context and the availability ledger. See the
  // comments in engine/run-stats.ts and engine/availability.ts.
  const poolByClubRef = useRef<Map<string, RosterPlayer[]>>(new Map())
  const lineupCtxRef = useRef<{ playerClubId?: string; benchSize?: number }>({})
  const availabilityRef = useRef<AvailabilityLedger | null>(null)

  useEffect(() => {
    if (!placedLeague) return
    const teams: SimTeam[] = placedLeague.teams.map(t => ({
      clubId: t.clubId, clubName: t.clubName, isPlayer: t.isPlayer,
      ovr: t.isPlayer ? totalTeamOvr : t.ovr,
      form: 0,
      stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
    }))
    const fixtures = generateFixtures(teams)
    setSimTeams(teams)
    setAllFixtures(fixtures)
    loadLeaguePools(placedLeague.teams, fullSquad, placedLeague.yearStart, useSubstitutes)
      .then(p => {
        poolByClubRef.current = p.poolByClub
        lineupCtxRef.current = { playerClubId: p.playerClubId, benchSize: p.benchSize }
        availabilityRef.current = createAvailabilityLedger({
          poolByClub: p.poolByClub, playerClubId: p.playerClubId,
          totalMatchdays: Math.max(...fixtures.map(f => f.matchday)),
        })
      })
      .catch(e => console.warn('[stats] roster load failed:', e))
      .finally(() => setPoolsReady(true))
  }, [placedLeague, totalTeamOvr])

  // The pundits screen opens this with ?start=1: the season kicks off on its
  // own once the scorer pools are in.
  useEffect(() => {
    if (start !== '1' || autoStarted.current || !poolsReady || allFixtures.length === 0) return
    autoStarted.current = true
    setIsPlaying(true)
  }, [start, poolsReady, allFixtures.length])

  // One matchday: every fixture simulated in the same order as ever. Shared by
  // the live loop and the skip, so they can't drift apart.
  function playMatchday(md: number, teams: SimTeam[]) {
    const played: Fixture[] = []
    for (const fixture of allFixtures) {
      if (fixture.matchday !== md || fixture.result !== null) continue   // never double-count
      const homeTeam = teams.find(t => t.clubId === fixture.home.clubId)!
      const awayTeam = teams.find(t => t.clubId === fixture.away.clubId)!

      // Seed FIRST: the eleven each side picks has to be known before the
      // scoreline is decided, or rotation would be decoration.
      fixture.seed = randomSeed()
      const rot = leagueRotations(teams, homeTeam, awayTeam, totalMatchdays, md - 1)
      fixture.homeRotation = rot.home
      fixture.awayRotation = rot.away
      // §10.5 phase 4 — this matchday's absences, stored so every later
      // regeneration fields the same eleven.
      const av = availabilityFor(availabilityRef.current, md, homeTeam.clubId, awayTeam.clubId)
      fixture.absent = av.absent
      fixture.standIns = av.standIns
      const lineupOpts = {
        ...lineupCtxRef.current, homeRotation: rot.home, awayRotation: rot.away,
        unavailableIds: av.unavailableIds, standIns: av.standIns,
      }
      const eff = effectiveMatchOvrs(
        poolByClubRef.current.get(homeTeam.clubId) ?? [], poolByClubRef.current.get(awayTeam.clubId) ?? [],
        { seed: fixture.seed, ...lineupOpts, homeBaseOvr: homeTeam.ovr + av.homeOvrDelta, awayBaseOvr: awayTeam.ovr + av.awayOvrDelta },
      )
      const result = simulateMatch({ ...homeTeam, ovr: eff.homeOvr }, { ...awayTeam, ovr: eff.awayOvr })
      fixture.result = result
      fixture.scorers = attributeFixtureScorers(poolByClubRef.current, fixture.home.clubId, fixture.away.clubId, result.homeGoals, result.awayGoals, false, false, fixture.seed, lineupOpts)
      // The match's own sheet decides red cards and injuries, so "suspended
      // next week" and what you watched are one fact.
      if (availabilityRef.current) recordMatchOutcome(availabilityRef.current, poolByClubRef.current, {
        matchday: md, homeClubId: fixture.home.clubId, awayClubId: fixture.away.clubId,
        seed: fixture.seed, homeGoals: result.homeGoals, awayGoals: result.awayGoals,
        scorers: fixture.scorers, lineups: lineupOpts,
      })

      const h = homeTeam.stats, a = awayTeam.stats
      h.played++; a.played++
      h.goalsFor += result.homeGoals; h.goalsAgainst += result.awayGoals
      a.goalsFor += result.awayGoals; a.goalsAgainst += result.homeGoals
      if (result.outcome === 'home') { h.won++; h.points += 3; a.lost++ }
      else if (result.outcome === 'away') { a.won++; a.points += 3; h.lost++ }
      else { h.drawn++; a.drawn++; h.points++; a.points++ }
      const updateForm = (team: SimTeam, o: 'win' | 'draw' | 'loss') => {
        const delta = o === 'win' ? 0.15 : o === 'draw' ? 0 : -0.15
        team.form = Math.max(-1.0, Math.min(1.0, team.form * 0.85 + delta))
      }
      updateForm(homeTeam, result.outcome === 'home' ? 'win' : result.outcome === 'draw' ? 'draw' : 'loss')
      updateForm(awayTeam, result.outcome === 'away' ? 'win' : result.outcome === 'draw' ? 'draw' : 'loss')
      played.push(fixture)

      if (homeTeam.isPlayer || awayTeam.isPlayer) {
        const youHome = homeTeam.isPlayer
        const mine = youHome ? result.homeGoals : result.awayGoals
        const theirs = youHome ? result.awayGoals : result.homeGoals
        const opp = youHome ? awayTeam : homeTeam
        const margin = mine - theirs
        if (margin > biggestWinMarginRef.current) {
          biggestWinMarginRef.current = margin
          biggestWinRef.current = { score: `${mine}-${theirs}`, opponent: opp.clubName }
        }
        if (worstLossMarginRef.current === -1 || margin < worstLossMarginRef.current) {
          worstLossMarginRef.current = margin
          if (margin < 0) worstLossRef.current = { score: `${mine}-${theirs}`, opponent: opp.clubName }
        }
        const youLost = (youHome && result.outcome === 'away') || (!youHome && result.outcome === 'home')
        if (result.isUpset && youLost) {
          upsetsRef.current.push({ score: `${mine}-${theirs}`, opponent: opp.clubName, ovrGap: totalTeamOvr - opp.ovr })
        }
      }
    }
    if (played.length === 0) return false

    const standings = sortTeams(teams).map(t => ({ ...t, stats: { ...t.stats } }))
    historyRef.current.push({ matchday: md, standings, fixtures: played })
    // The press reads the table as it now stands; stories are written once.
    const fresh = writePress(historyRef.current, pressRef.current, {
      totalMatchdays, zones,
      next: allFixtures.filter(f => f.matchday === md + 1).map(f => ({ homeId: f.home.clubId, awayId: f.away.clubId })),
    })
    pressRef.current = [...pressRef.current, ...fresh]
    return true
  }

  function tick() {
    if (nextMD > totalMatchdays) return
    const md = nextMD
    const teams = [...simTeams]
    playMatchday(md, teams)
    setSimTeams(teams)
    setStories(pressRef.current)
    setLandedMD(md)
    if (speed === 'fast') setRestMD(md)
    if (md === totalMatchdays) { setIsPlaying(false); setDone(true) }
    setNextMD(md + 1)
  }

  // setTimeout, not setInterval: each step fires exactly once per render.
  useEffect(() => {
    if (!isPlaying || done) return
    const t = setTimeout(tick, SPEED_MS[speed])
    return () => clearTimeout(t)
  }, [isPlaying, done, nextMD, simTeams, allFixtures, speed])

  // The rest of the round lands a beat after your result.
  useEffect(() => {
    if (landedMD === restMD) return
    const t = setTimeout(() => setRestMD(landedMD), Math.round(SPEED_MS[speed] * BEAT_SHARE))
    return () => clearTimeout(t)
  }, [landedMD, restMD, speed])

  function skipToEnd() {
    if (done) return
    setIsPlaying(false)
    const teams = [...simTeams]
    for (let md = nextMD; md <= totalMatchdays; md++) playMatchday(md, teams)
    setSimTeams(teams)
    setStories(pressRef.current)
    setLandedMD(totalMatchdays)
    setRestMD(totalMatchdays)
    setNextMD(totalMatchdays + 1)
    setViewMD(null)
    setDone(true)
  }
  // The confirm screen calls back after this render may be stale.
  const skipRef = useRef(skipToEnd)
  skipRef.current = skipToEnd

  function askSkip() {
    setIsPlaying(false)
    openConfirm({
      question: 'Skip to the last day?',
      consequence: `Matchdays ${nextMD} to ${totalMatchdays} are played at once. You'll see the final table and every result, but not each round landing.`,
      confirmLabel: 'Skip to the last day',
      stayLabel: 'Keep watching',
      onConfirm: () => skipRef.current(),
    })
  }

  function askAbandon() {
    setIsPlaying(false)
    openConfirm({
      question: 'Abandon this run?',
      consequence: "The season so far is lost and the run isn't saved. You can't come back to it.",
      confirmLabel: 'Abandon the run',
      stayLabel: 'Keep playing',
      onConfirm: () => useGameStore.getState().resetRun(),
      thenRoute: '/(tabs)',
    })
  }

  function finish() {
    if (finishingRef.current || !placedLeague) return
    finishingRef.current = true
    setFinishing(true)
    const sorted = sortTeams(simTeams)
    const playerTeam = sorted.find(t => t.isPlayer)!
    const finalPosition = sorted.findIndex(t => t.isPlayer) + 1
    const { won, drawn, lost, goalsFor, goalsAgainst } = playerTeam.stats
    const unbeaten = lost === 0
    const perfectSeason = lost === 0 && drawn === 0
    setSimResult({
      table: sorted, playerTeam, finalPosition, teamsInLeague: sorted.length,
      wins: won, draws: drawn, losses: lost, goalsFor, goalsAgainst,
      biggestWin: biggestWinRef.current, worstLoss: worstLossRef.current, upsets: upsetsRef.current,
      unbeaten, perfectSeason,
      tier: assignTier(finalPosition, sorted.length, unbeaten, perfectSeason, zones[finalPosition - 1] ?? null),
      matchdayHistory: historyRef.current,
      absences: availabilityRef.current?.absences() ?? [],
      press: pressRef.current,
    })
    router.push('/game/awards?to=league')
  }

  // Before a ball is kicked the table is in the pundits' order.
  const preseasonRows = useMemo(() => {
    if (!placedLeague) return []
    const byId = new Map(simTeams.map(t => [t.clubId, t]))
    const order = predictionSeed != null
      ? predictTable(placedLeague.teams, predictionSeed).table.map(r => r.clubId)
      : [...placedLeague.teams].sort((a, b) => b.ovr - a.ovr).map(t => t.clubId)
    return order.map(id => byId.get(id)).filter((t): t is SimTeam => !!t).map(toRow)
  }, [placedLeague, simTeams.length, predictionSeed])

  const history = historyRef.current
  const shownMD = viewMD ?? restMD
  const snapshot = shownMD > 0 ? history[shownMD - 1] : null
  const prevSnapshot = shownMD > 1 ? history[shownMD - 2] : null
  const rows = useMemo(() => (snapshot ? snapshot.standings.map(toRow) : preseasonRows), [snapshot, preseasonRows])

  const youPos = rows.findIndex(r => r.isPlayer) + 1
  const prevPos = prevSnapshot ? prevSnapshot.standings.findIndex(t => t.isPlayer) + 1 : youPos
  const youRow = rows[youPos - 1]

  // Crossing a zone line gets one beat: a tape under your row and a haptic.
  useEffect(() => {
    if (viewMD != null || restMD < 2) return
    const now = history[restMD - 1]?.standings.findIndex(t => t.isPlayer) ?? -1
    const before = history[restMD - 2]?.standings.findIndex(t => t.isPlayer) ?? -1
    if (now < 0 || before < 0 || (zones[now] ?? null) === (zones[before] ?? null)) return
    const you = history[restMD - 1].standings[now].clubId
    setFlashId(you)
    haptic(now < before ? 'success' : 'warning')
    const t = setTimeout(() => setFlashId(null), 700)
    return () => clearTimeout(t)
  }, [restMD])

  const cardMD = viewMD ?? landedMD
  const cardFixture = cardMD > 0 ? history[cardMD - 1]?.fixtures.find(isYours) : undefined
  const roundFixtures = snapshot ? snapshot.fixtures.filter(f => !isYours(f)) : []
  const yourPending = viewMD == null && landedMD > restMD

  const marks = useMemo(
    () => history.slice(0, landedMD).map(h => h.fixtures.find(isYours)).map(f => (f ? markFor(f) : null)).filter((m): m is Mark => !!m),
    [landedMD],
  )

  const openFixture = useCallback((f: Fixture) => {
    if (!f.result || !placedLeague) return
    openMatchStats({
      homeClubId: f.home.clubId, homeName: f.home.clubName,
      awayClubId: f.away.clubId, awayName: f.away.clubName,
      homeGoals: f.result.homeGoals, awayGoals: f.result.awayGoals,
      scorers: f.scorers, seed: f.seed,
      homeRotation: f.homeRotation, awayRotation: f.awayRotation,
      absent: f.absent, standIns: f.standIns,
      yearStart: placedLeague.yearStart,
      competitionLabel: `Matchday ${f.matchday}`,
      playerClubId: simTeams.find(t => t.isPlayer)?.clubId,
      playerFormation: formation ?? undefined,
      matchday: f.matchday,
      // The whole schedule, played or not: mid-season "next match" needs it.
      contextMatches: toContextMatches(allFixtures.map(x => ({
        matchday: x.matchday, home: x.home, away: x.away,
        homeGoals: x.result?.homeGoals, awayGoals: x.result?.awayGoals,
        scorers: x.scorers, seed: x.seed,
        homeRotation: x.homeRotation, awayRotation: x.awayRotation,
        absent: x.absent, standIns: x.standIns,
      }))),
    }, theme.accent)
  }, [placedLeague, allFixtures, simTeams, formation, theme.accent])

  if (!formation || !placedLeague || draftedPlayers.length === 0) {
    return (
      <KitScreen ground="nylon" scroll={false}>
        <EmptyState roles={roles} title="No squad or draw found" body="This run lost its squad, usually after a reload. Start a new one." />
        <Plate label="Start a new run" roles={roles} onPress={() => router.replace('/game/mode-select')} />
      </KitScreen>
    )
  }

  const started = landedMD > 0
  const plateLabel = done ? 'See your verdict'
    : isPlaying ? 'Pause'
    : started ? `Continue from matchday ${nextMD}`
    : `Play matchday ${nextMD}`
  const onPlate = done ? finish : () => setIsPlaying(p => !p)
  const moveMs = speed === 'slow' ? 700 : speed === 'normal' ? 250 : undefined
  const season = `${placedLeague.yearStart}/${String(placedLeague.yearStart + 1).slice(-2)}`

  // Expanded (≥1024, 10-ADAPT §2.2): the three tabs stand side by side as panes:
  // your round's results on the left, the table in the centre, the press on
  // the right. Compact keeps the one-focus-at-a-time switch.
  const wide = sizeClass === 'expanded'
  const tablePane = (
    <>
      <LeagueTable roles={roles} rows={rows} zones={tableZones} moveMs={viewMD == null ? moveMs : undefined}
        muted={!snapshot} flashId={flashId} />
      <ZoneLegend roles={roles} zones={tableZones} />
    </>
  )
  const resultsPane = (
    yourPending ? (
      <KitText t="body" color={roles.textMuted} style={styles.pre}>Your match first. The rest of the round is coming in.</KitText>
    ) : roundFixtures.length === 0 ? (
      <KitText t="body" color={roles.textMuted} style={styles.pre}>No results yet.</KitText>
    ) : (
      roundFixtures.map(f => (
        <ResultRow key={`${f.home.clubId}-${f.away.clubId}`} roles={roles}
          homeName={f.home.clubName} awayName={f.away.clubName}
          homeGoals={f.result!.homeGoals} awayGoals={f.result!.awayGoals}
          youSide={null}
          scorers={[summariseScorers(f.scorers?.home), summariseScorers(f.scorers?.away)].filter(Boolean).join(' · ') || undefined}
          onPress={() => openFixture(f)} />
      ))
    )
  )
  const pressPane = (
    stories.length === 0 ? (
      <KitText t="body" color={roles.textMuted} style={styles.pre}>
        {`The papers wait until the season has a shape. The first stories can come from matchday ${Math.ceil(totalMatchdays / 4)}.`}
      </KitText>
    ) : (
      <>
        <SectionTag roles={roles}>Newest first</SectionTag>
        {[...stories].reverse().map(s => <StoryItem key={s.id} roles={roles} story={s} />)}
      </>
    )
  )
  const switcher = (
    <SegmentSwitch<Tab> roles={roles} value={tab} onChange={setTab} options={[
      { id: 'table', label: 'Table' },
      { id: 'results', label: shownMD > 0 ? `Results MD ${shownMD}` : 'Results' },
      { id: 'press', label: 'Press', count: stories.length },
    ]} />
  )

  return (
    <View style={[styles.fill, { backgroundColor: roles.bg }]}>
      <KitScreen ground="nylon" width={wide ? 'wide' : 'column'} contentStyle={{ paddingBottom: space[4] }}>
        {/* Web keys (10-ADAPT §2.3): Space/Enter play or pause, arrows scrub the strip. */}
        <WebKeys onKey={k => {
          if (k === ' ' || k === 'Enter') onPlate()
          else if ((k === 'ArrowLeft' || k === 'ArrowRight') && restMD > 0) {
            const md = Math.min(restMD, Math.max(1, (viewMD ?? restMD) + (k === 'ArrowLeft' ? -1 : 1)))
            setIsPlaying(false)
            setViewMD(md === restMD ? null : md)
          }
        }} />
        <RunHeader roles={roles} stage={6} colourway={colourway} back={false}
          skipped={mode === 'chaos' || mode === 'cursed' ? [2] : []}
          right={
            <Pressable onPress={askAbandon} hitSlop={8} accessibilityRole="button" accessibilityLabel="Abandon the run"
              style={({ pressed }) => [styles.close, pressed && { backgroundColor: roles.sunken }]}>
              <Icon name="close" size={24} color={roles.text} />
            </Pressable>
          } />
        <KitText t="tag" color={roles.textMuted}>
          {`${placedLeague.leagueName} · ${season} · MD ${Math.min(landedMD, totalMatchdays)}/${totalMatchdays}`}
        </KitText>
        <KitText t="body" color={roles.textMuted}>{`You replaced ${placedLeague.replacedTeamName}.`}</KitText>

        {youRow && (
          <StandingFigure roles={roles} pos={youPos} delta={started ? prevPos - youPos : 0}
            zone={started ? tableZones[youPos - 1] ?? null : null} points={youRow.points} />
        )}

        <SeasonStrip roles={roles} marks={marks} total={totalMatchdays} viewing={viewMD}
          onPick={md => { setViewMD(md); if (md != null) setIsPlaying(false) }} />
        {viewMD != null && (
          <Pressable onPress={() => setViewMD(null)} accessibilityRole="button"
            style={({ pressed }) => [styles.live, { borderColor: roles.line }, pressed && { backgroundColor: roles.sunken }]}>
            <KitText t="tag" color={roles.text}>{`Looking at MD ${viewMD} · Back to live`}</KitText>
          </Pressable>
        )}

        {cardFixture?.result ? (
          <ScorelineCard roles={roles} label={`MD ${cardFixture.matchday} · ${cardFixture.home.isPlayer ? 'HOME' : 'AWAY'}`}
            homeName={cardFixture.home.clubName} awayName={cardFixture.away.clubName}
            homeGoals={cardFixture.result.homeGoals} awayGoals={cardFixture.result.awayGoals}
            youHome={cardFixture.home.isPlayer}
            homeScorers={summariseScorers(cardFixture.scorers?.home) || undefined}
            awayScorers={summariseScorers(cardFixture.scorers?.away) || undefined}
            onPress={() => openFixture(cardFixture)} />
        ) : !started ? (
          <KitText t="bodyL" color={roles.textMuted} style={styles.pre}>
            {poolsReady ? 'The table is in the pundits’ order until a ball is kicked.' : 'Loading the squads…'}
          </KitText>
        ) : null}


        {wide ? (
          <View style={styles.panes}>
            <View style={styles.pane}>
              <SectionTag roles={roles}>{shownMD > 0 ? `Results · MD ${shownMD}` : 'Results'}</SectionTag>
              {resultsPane}
            </View>
            <View style={styles.paneWide}>{tablePane}</View>
            <View style={styles.pane}>
              <SectionTag roles={roles}>{`Press · ${stories.length}`}</SectionTag>
              {pressPane}
            </View>
          </View>
        ) : (
          <>
            {switcher}
            {tab === 'table' && tablePane}
            {tab === 'results' && resultsPane}
            {tab === 'press' && pressPane}
          </>
        )}
      </KitScreen>

      {/* The thumb zone: the ticker, then the controls. */}
      <View style={[styles.bar, { backgroundColor: roles.bg, borderTopColor: roles.rule, paddingBottom: insets.bottom + space[2] }]}>
        <View style={[styles.barInner, { maxWidth: wide ? MAX_CONTENT : COLUMN }]}>
        {tab !== 'press' && <Ticker roles={roles} story={stories[stories.length - 1] ?? null} onPress={() => setTab('press')} />}
        {!done && (
          <View style={styles.controls}>
            <Chips<Speed> roles={roles} label="Speed" value={speed} onChange={setSpeed}
              options={[{ id: 'slow', label: 'Slow' }, { id: 'normal', label: 'Normal' }, { id: 'fast', label: 'Fast' }]} />
            <View style={{ flex: 1 }} />
            <Plate label="Skip to the last day" icon="skip" variant="secondary" roles={roles} onPress={askSkip}
              disabled={!poolsReady} />
          </View>
        )}
        <Plate label={plateLabel} icon={done ? 'forward' : isPlaying ? 'pause' : 'play'} roles={roles}
          onPress={onPlate} disabled={!poolsReady} missingStep="Loading the squads" loading={finishing} />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  live: { alignSelf: 'flex-start', borderWidth: border.thin, paddingHorizontal: space[2], minHeight: 32, justifyContent: 'center' },
  pre: { paddingVertical: space[3] },
  bar: { paddingHorizontal: space[4], paddingTop: space[1], gap: space[2], borderTopWidth: border.hair },
  barInner: { width: '100%', alignSelf: 'center', gap: space[2] },
  panes: { flexDirection: 'row', gap: space[5], alignItems: 'flex-start', marginTop: space[3] },
  pane: { flex: 1, minWidth: 0, gap: space[1] },
  paneWide: { flex: 1.4, minWidth: 0 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
})
