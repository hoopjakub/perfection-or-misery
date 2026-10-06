import { compareStandings, recordResult } from '@/engine/standings'
import { setLogContext } from '@/diag/log'
import { timeToFrame } from '@/diag/perf'
import { log } from '@/diag/log'
import { SPEED_MS } from '@/data/speed'
import { LiveMatch, LIVE_MS_PER_MIN, yourMatchPeriod } from '@/components/LiveMatch'
import { t } from '@/i18n'
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { kickoffFor } from '@/engine/schedule'
import { RoundTeam } from '@/components/season/RoundTeam'
import { TableStage } from './TableStage'
import { useStageLoop, playsLive } from '@/hooks/useStageLoop'
import { setLivePress } from '@/lib/livePress'
import { openStory } from '@/lib/runNav'
import { usePauseOnBlur } from '@/hooks/usePauseOnBlur'
import { ManOfTheMatch } from '@/components/MatchStatsParts'
import { useSizeClass, MAX_CONTENT, COLUMN } from '@/hooks/useSizeClass'
import { View, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useGameStore } from '@/store/gameStore'
import { calcTeamOvr } from '@/engine/rating'
import { getSlotsForFormation } from '@/engine/formations'
import { generateFixtures } from '@/engine/fixtures'
import { simulateMatch } from '@/engine/match'
import { rotationFor, leagueCutoffs } from '@/engine/rotation'
import { effectiveMatchOvrs } from '@/engine/lineup'
import { createAvailabilityLedger, availabilityFor, recordMatchOutcome, type AvailabilityLedger } from '@/engine/availability'
import { assignTier } from '@/engine/tier'
import { loadLeaguePools, attributeFixtureScorers, summariseScorers, roundLines } from '@/engine/run-stats'
import { matchRequest, fixtureMatch, cupTieRequest } from '@/engine/stages'
import { predictTable, punditField, punditPanel, panelLineFor } from '@/engine/predictions'
import { writePress, type Story } from '@/engine/press'
import { zonesFor } from '@/data/qualification-bands'
import { useModeTheme } from '@/hooks/useModeTheme'
import { ModeLookProvider, lookFor } from '@/components/kit'
import { ModeBanner } from '@/components/season/ModeBanner'
import { useSimBackGuard } from '@/hooks/useSimBackGuard'
import { openMatchStats } from '@/lib/matchStats'
import { StageControls, CloseRun, askAbandon } from '@/components/season/RunChrome'
import { useSettingsStore } from '@/store/settingsStore'
import { randomSeed } from '@/lib/rng'
import { planCup, playCupAfter, attributeCupScorers, type DomesticCup, type CupTie } from '@/engine/domestic-cup'
import { ROLES, space, border, colourwayFor } from '@/theme'
import { KitScreen, KitText, RunHeader, Plate, SectionTag, EmptyState } from '@/components/kit'
import type { SimTeam, Fixture, SeasonResult, MatchdaySnapshot } from '@/types/simulation'
import type { RosterPlayer } from '@/types/stats'
import {
  LeagueTable, ZoneLegend, leagueTableZones, ScorelineCard, ResultRow, Ticker, PressList, YourFixtures, type TableRowVM, type Mark,
} from './SeasonParts'
import { EVERYDAY } from '@/lib/appearance'
import { nationalCupForLeague, semisTwoLeggedForLeague } from '@/data/national-cups'
import { CupPane, CupNow } from './CupParts'

// C1 · The league season (docs/ui-overhaul/07c), on nylon. Your table under
// floodlights with the real season's zones; your match lands first and the
// rest of the round a beat later; your season as a strip you can scrub; the
// run's press as a ticker. The simulation itself is unchanged from the old
// screen: seed first, then rotation and availability, then the result, then
// scorers attributed once and stored on the fixture.

const roles = ROLES[EVERYDAY]

// How long after your result the rest of the round and the table land.
const BEAT_SHARE = 0.45
type Tab = 'table' | 'results' | 'fixtures' | 'cup' | 'press'

// §10.5 — a league side rests players once the table says the game can no
// longer change its season, and never while anything is still live. Your own
// club is never rotated: you drafted that XI, so you field it.
// P8-28: the stakes lines come from the league's real zones for that season
// (`leagueCutoffs`), not a fixed top 5 and bottom 3; verify-rotation measured
// the change before it went in.
function leagueRotations(teams: SimTeam[], home: SimTeam, away: SimTeam, totalMatchdays: number, playedMatchdays: number, zones: (string | null)[]) {
  const stakes = {
    standings: teams.map(t => ({ clubId: t.clubId, points: t.stats.points })),
    totalMatchdays, playedMatchdays,
    ...leagueCutoffs(zones), titleMatters: true,
  }
  return {
    home: home.isPlayer ? 0 : rotationFor({ ...stakes, clubId: home.clubId }),
    away: away.isPlayer ? 0 : rotationFor({ ...stakes, clubId: away.clubId }),
  }
}

function sortTeams(teams: SimTeam[]) {
  return [...teams].sort((a, b) => {
    return compareStandings(a, b)
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
  const colourway = colourwayFor(mode, null, placedLeague?.leagueId)   // P8-55: the league's own colours

  const [simTeams, setSimTeams] = useState<SimTeam[]>([])
  const [allFixtures, setAllFixtures] = useState<Fixture[]>([])
  const [nextMD, setNextMD] = useState(1)          // the matchday to play next
  const [landedMD, setLandedMD] = useState(0)      // your result is showing for this one
  const [restMD, setRestMD] = useState(0)          // the table and the rest of the round
  const [isPlaying, setIsPlaying] = useState(false)
  usePauseOnBlur(setIsPlaying)   // P8-32
  useEffect(() => { setLivePress([]) }, [])   // a new season starts with an empty press
  const [done, setDone] = useState(false)
  const speed = useSettingsStore(s => s.speed)   // F-05: one setting, every stage
  // F-09 / D2: the matchday loop; your match plays live and the next
  // matchday, the rest of the round and the press wait for it. The season
  // ends when the last match does.
  const { liveMD, liveDone, clearLive } = useStageLoop({
    running: isPlaying && !done, speed, step: tick, tick: nextMD,
    onLiveDone: md => {
      if (md === totalMatchdays) { setIsPlaying(false); setDone(true) }
      setStories(pressRef.current)
    },
  })
  const [viewMD, setViewMD] = useState<number | null>(null)
  const sizeClass = useSizeClass()
  const [tab, setTab] = useState<Tab>('table')
  const [stories, setStories] = useState<Story[]>([])
  const [poolsReady, setPoolsReady] = useState(false)
  const [finishing, setFinishing] = useState(false)
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
  // P8-173: the league's cup. The ref is the truth during a skip (every round
  // played in one go); the state is what's drawn.
  const cupRef = useRef<DomesticCup | null>(null)
  const [cup, setCup] = useState<DomesticCup | null>(null)

  // Goalscorer pools, the lineup context and the availability ledger. See the
  // comments in engine/run-stats.ts and engine/availability.ts.
  const poolByClubRef = useRef<Map<string, RosterPlayer[]>>(new Map())
  const roundPlayersRef = useRef<Map<number, { playerId: string; name: string; clubId: string; rating: number }[]>>(new Map())   // P8-138
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
    // Drawn from the run's seed where there is one, so the same run draws the same cup.
    cupRef.current = planCup(teams, Math.max(...fixtures.map(f => f.matchday)), predictionSeed ?? randomSeed(), nationalCupForLeague(placedLeague.leagueId), semisTwoLeggedForLeague(placedLeague.leagueId))
    setCup(cupRef.current)
    loadLeaguePools(placedLeague.teams, fullSquad, placedLeague.yearStart, useSubstitutes)
      .then(p => {
        poolByClubRef.current = p.poolByClub
        lineupCtxRef.current = { playerClubId: p.playerClubId, benchSize: p.benchSize }
        availabilityRef.current = createAvailabilityLedger({
          poolByClub: p.poolByClub, playerClubId: p.playerClubId,
          totalMatchdays: Math.max(...fixtures.map(f => f.matchday)),
        })
      })
      .catch(e => log.warn('db', 'stats: roster load failed', e))
      .finally(() => setPoolsReady(true))
  }, [placedLeague, totalTeamOvr])

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
      const rot = leagueRotations(teams, homeTeam, awayTeam, totalMatchdays, md - 1, zones)
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

      recordResult(homeTeam, awayTeam, result)
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
    // P8-138: the round's players and ratings, for the press's player stories.
    // The same sheets (and key) the team of the matchday reads, so it's paid once.
    let players: { playerId: string; name: string; clubId: string; rating: number }[] | undefined
    try {
      players = roundLines(`md-${md}`, played.map(f => ({
        homeClubId: f.home.clubId, awayClubId: f.away.clubId, homeClubName: f.home.clubName, awayClubName: f.away.clubName,
        homeGoals: f.result!.homeGoals, awayGoals: f.result!.awayGoals, scorers: f.scorers, seed: f.seed,
        homeRotation: f.homeRotation, awayRotation: f.awayRotation, absent: f.absent, standIns: f.standIns,
      })), poolByClubRef.current, lineupCtxRef.current).map(l => ({ playerId: l.playerId, name: l.name, clubId: l.clubId, rating: l.rating }))
    } catch (e) { log.warn('sim', 'press: round ratings failed', e) }
    historyRef.current.push({ matchday: md, standings, fixtures: played })
    // Kept beside the history, not in it: the history is saved with the run,
    // and every player's rating every round would swell it for nothing.
    if (players) roundPlayersRef.current.set(md, players)
    // The press reads the table as it now stands; stories are written once.
    const fresh = writePress(historyRef.current.map(h => ({ ...h, players: roundPlayersRef.current.get(h.matchday) })), pressRef.current, {
      totalMatchdays, zones,
      next: allFixtures.filter(f => f.matchday === md + 1).map(f => ({ homeId: f.home.clubId, awayId: f.away.clubId })),
      // P8-25: your players' injuries and bans make the press the round they happen.
      absences: availabilityRef.current?.absences() ?? [],
    })
    pressRef.current = [...pressRef.current, ...fresh]
    setLivePress(pressRef.current)   // so a story opened mid-season can be read
    // P8-173: any cup round due after this matchday, with the clubs' form as it now stands.
    if (cupRef.current) cupRef.current = attributeCupScorers(playCupAfter(cupRef.current, md, teams), poolByClubRef.current, lineupCtxRef.current)
    return true
  }

  // One matchday; returns it when your match in it plays live (useStageLoop).
  // Phase 9: timed to the frame that shows it (docs/diagnostics/03-BUDGETS.md §2.3).
  function tick(): number | null { setLogContext(`league MD${nextMD}`); return timeToFrame('sim:matchday:league', tickNow) }
  function tickNow(): number | null {
    if (nextMD > totalMatchdays) return null
    const md = nextMD
    const teams = [...simTeams]
    playMatchday(md, teams)
    setSimTeams(teams)
    setCup(cupRef.current)
    setLandedMD(md)
    const live = playsLive(!!historyRef.current[md - 1]?.fixtures.some(isYours), speed)
    if (!live) setStories(pressRef.current)
    if (speed === 'fast') setRestMD(md)
    // The season ends when the last match does: with it still playing live,
    // "See the verdict" would give the score away.
    if (md === totalMatchdays && !live) { setIsPlaying(false); setDone(true) }
    setNextMD(md + 1)
    return live ? md : null
  }

  // The rest of the round lands a beat after your result.
  useEffect(() => {
    if (landedMD === restMD || liveMD != null) return
    const t = setTimeout(() => setRestMD(landedMD), Math.round(SPEED_MS[speed] * BEAT_SHARE))
    return () => clearTimeout(t)
  }, [landedMD, restMD, speed, liveMD])

  function skipToEnd() { timeToFrame('sim:skip:league', skipToEndNow) }
  function skipToEndNow() {
    if (done && liveMD == null) return
    setIsPlaying(false)
    clearLive()
    const teams = [...simTeams]
    for (let md = nextMD; md <= totalMatchdays; md++) playMatchday(md, teams)
    setSimTeams(teams)
    setCup(cupRef.current)
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
      cup: cupRef.current,
    })
    router.push('/game/awards')
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
  // P8-22: each row carries the places it moved since the matchday before, from
  // the stored snapshots, so looking back at matchday 12 shows matchday 12's moves.
  const rows = useMemo(() => {
    if (!snapshot) return preseasonRows
    const before = prevSnapshot ? new Map(prevSnapshot.standings.map((t, i) => [t.clubId, i + 1])) : null
    return snapshot.standings.map((t, i) => ({ ...toRow(t), move: before ? (before.get(t.clubId) ?? i + 1) - (i + 1) : 0 }))
  }, [snapshot, prevSnapshot, preseasonRows])

  const youPos = rows.findIndex(r => r.isPlayer) + 1
  const prevPos = prevSnapshot ? prevSnapshot.standings.findIndex(t => t.isPlayer) + 1 : youPos
  const youRow = rows[youPos - 1]

  const cardMD = viewMD ?? landedMD
  const cardFixture = cardMD > 0 ? history[cardMD - 1]?.fixtures.find(isYours) : undefined
  const roundFixtures = snapshot ? snapshot.fixtures.filter(f => !isYours(f)) : []
  const yourPending = viewMD == null && landedMD > restMD

  // A match still playing live has no mark yet.
  const markedMD = liveMD != null ? liveMD - 1 : landedMD
  const marks = useMemo(
    () => history.slice(0, markedMD).map(h => h.fixtures.find(isYours)).map(f => (f ? markFor(f) : null)).filter((m): m is Mark => !!m),
    [markedMD],
  )
  // Your live match stays on screen while you look back at an earlier
  // matchday: unmounting it would start it again from the first minute.
  const liveFixture = liveMD != null ? history[liveMD - 1]?.fixtures.find(isYours) : undefined
  // F-12: the pundits' panel, rebuilt from the run's seed (the same panel the
  // pundits screen showed), for its split on your match.
  const panel = useMemo(() => {
    const f = punditField(mode, { placedLeague })
    return f && predictionSeed != null ? punditPanel(f.teams, predictionSeed, undefined, f.matchesPerClub) : []
  }, [placedLeague, predictionSeed, mode])
  const livePeriod = useMemo(() => liveFixture?.result ? yourMatchPeriod({
    ...liveFixture, homeClubId: liveFixture.home.clubId, awayClubId: liveFixture.away.clubId,
    homeGoals: liveFixture.result.homeGoals, awayGoals: liveFixture.result.awayGoals,
  }, `Matchday ${liveFixture.matchday}`, poolByClubRef.current, { ...lineupCtxRef.current, playerFormation: formation ?? undefined }) : null, [liveFixture])

  // The sheet's request for one fixture: the sheet opens with it, and your
  // card's man of the match reads it (P8-129).
  const fixtureCtx = placedLeague ? {
    yearStart: placedLeague.yearStart,
    playerClubId: simTeams.find(t => t.isPlayer)?.clubId,
    playerFormation: formation ?? undefined,
  } : null
  const fixtureRequest = (f: Fixture) => fixtureCtx && matchRequest(fixtureMatch(f, `Matchday ${f.matchday}`), fixtureCtx)
  const openFixture = useCallback((f: Fixture) => {
    if (!fixtureCtx) return
    // The whole schedule, played or not: mid-season "next match" needs it.
    const timeline = allFixtures.map(x => fixtureMatch(x, `Matchday ${x.matchday}`))
    openMatchStats(matchRequest(fixtureMatch(f, `Matchday ${f.matchday}`), { ...fixtureCtx, timeline }))
  }, [placedLeague, allFixtures, simTeams, formation])

  if (!formation || !placedLeague || draftedPlayers.length === 0) {
    return (
      <KitScreen ground={EVERYDAY} scroll={false}>
        <EmptyState roles={roles} title={t('season.noSquadDraw')} body={t('season.lostSquad')} />
        <Plate label={t('season.startNew')} roles={roles} onPress={() => router.replace('/game/mode-select')} />
      </KitScreen>
    )
  }

  const started = landedMD > 0
  const plateLabel = done ? t('season.seeVerdict')
    : isPlaying ? t('season.pause')
    : started ? t('season.continueFrom', { md: nextMD })
    : t('season.playMd', { md: nextMD })
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
        muted={!snapshot} />
      <ZoneLegend roles={roles} zones={tableZones} />
    </>
  )

  // F-08: your fixtures, played and to come, as every stage now has them.
  const fixturesPane = (
    <YourFixtures roles={roles} rows={allFixtures.filter(f => f.home.isPlayer || f.away.isPlayer).map(f => {
      const youHome = f.home.isPlayer
      return {
        matchday: f.matchday, home: youHome, you: (youHome ? f.home : f.away).clubName, opponent: (youHome ? f.away : f.home).clubName,
        when: kickoffFor({ label: `Matchday ${f.matchday}`, yearStart: placedLeague?.yearStart, matchdays: totalMatchdays, homeClubId: f.home.clubId, awayClubId: f.away.clubId })?.short,
        result: f.result ? { mine: youHome ? f.result.homeGoals : f.result.awayGoals, theirs: youHome ? f.result.awayGoals : f.result.homeGoals } : undefined,
      }
    })} />
  )
  const resultsPane = (
    yourPending ? (
      <KitText t="body" color={roles.textMuted} style={styles.pre}>{t('season.yourMatchFirst')}</KitText>
    ) : roundFixtures.length === 0 ? (
      <KitText t="body" color={roles.textMuted} style={styles.pre}>{t('season.noResults')}</KitText>
    ) : (
      roundFixtures.map(f => (
        <ResultRow key={`${f.home.clubId}-${f.away.clubId}`} roles={roles}
          homeName={f.home.clubName} awayName={f.away.clubName}
          homeGoals={f.result!.homeGoals} awayGoals={f.result!.awayGoals}
          youSide={null}
          homeClubId={(f.home as any).clubId} awayClubId={(f.away as any).clubId}
          homeScorers={summariseScorers(f.scorers?.home) || undefined} awayScorers={summariseScorers(f.scorers?.away) || undefined}
          onPress={() => openFixture(f)} />
      )).concat(snapshot && poolsReady ? [
        <RoundTeam key="totm" roles={roles} roundKey={`md-${snapshot.matchday}`} label={t('season.teamOfMd', { md: snapshot.matchday })}
          poolByClub={poolByClubRef.current} ctx={lineupCtxRef.current}
          fixtures={snapshot.fixtures.filter(f => f.result).map(f => ({
            homeClubId: f.home.clubId, awayClubId: f.away.clubId, homeClubName: f.home.clubName, awayClubName: f.away.clubName,
            homeGoals: f.result!.homeGoals, awayGoals: f.result!.awayGoals, scorers: f.scorers, seed: f.seed,
            homeRotation: f.homeRotation, awayRotation: f.awayRotation, absent: f.absent, standIns: f.standIns,
          }))} />,
      ] : [])
    )
  )
  // P8-173: the cup (src/components/season/CupParts.tsx, shared with the full path).
  // P8.5-37: a cup tie opens its match sheet, like a league fixture.
  const openCupTie = (t: CupTie, label: string) => cup && fixtureCtx && openMatchStats(cupTieRequest(t, `${cup.name} · ${label}`, fixtureCtx))
  const cupPane = cup ? <CupPane roles={roles} cup={cup} playerClubId={simTeams.find(t => t.isPlayer)?.clubId} onTie={openCupTie} /> : null

  const pressPane = <PressList roles={roles} stories={stories} empty={t('season.papersWait', { md: Math.ceil(totalMatchdays / 4) })} onOpen={id => openStory(id)} />

  return (
    <ModeLookProvider look={lookFor(mode)}>
    <View style={[styles.fill, { backgroundColor: roles.bg }]}>
      <KitScreen ground={EVERYDAY} width={wide ? 'wide' : 'column'} contentStyle={{ paddingBottom: space[4] }}>
        <RunHeader roles={roles} stage={6} colourway={colourway} back={false}
          right={<CloseRun onPress={() => askAbandon(() => setIsPlaying(false))} />} />
        {/* P8-169: Chaos and Cursed announce themselves. */}
        <ModeBanner roles={roles} mode={mode} />
        <TableStage roles={roles} wide={wide} tab={tab} onTab={id => setTab(id as Tab)}
          meta={`${placedLeague.leagueName} · ${season} · MD ${Math.min(landedMD, totalMatchdays)}/${totalMatchdays}`}
          note={<KitText t="body" color={roles.textMuted}>{t('season.replaced', { name: placedLeague.replacedTeamName })}</KitText>}
          standing={youRow ? { pos: youPos, delta: started ? prevPos - youPos : 0, zone: started ? tableZones[youPos - 1] ?? null : null, points: youRow.points } : null}
          strip={{ marks, total: totalMatchdays, viewing: viewMD, latest: restMD, onPick: md => { setViewMD(md); if (md != null) setIsPlaying(false) } }}
          keys={{ playPause: onPlate }}
          yourMatch={<>
            {liveFixture && livePeriod && panelLineFor(panel, liveFixture.home, liveFixture.away) && (
              <KitText t="body" color={roles.textMuted}>{panelLineFor(panel, liveFixture.home, liveFixture.away)}</KitText>
            )}
            {liveFixture && livePeriod ? (
              <LiveMatch key={`md-${liveFixture.matchday}`} teamA={liveFixture.home} teamB={liveFixture.away}
                periods={[livePeriod]} onDone={liveDone} hold={!isPlaying} msPerMin={LIVE_MS_PER_MIN[speed]} />
            ) : cardFixture?.result ? (
              <ScorelineCard roles={roles} label={[`MD ${cardFixture.matchday}`,
                  kickoffFor({ label: `Matchday ${cardFixture.matchday}`, yearStart: placedLeague?.yearStart, matchdays: totalMatchdays, homeClubId: cardFixture.home.clubId, awayClubId: cardFixture.away.clubId })?.short].filter(Boolean).join(' · ')}
                homeName={cardFixture.home.clubName} awayName={cardFixture.away.clubName} homeClubId={cardFixture.home.clubId} awayClubId={cardFixture.away.clubId}
                homeGoals={cardFixture.result.homeGoals} awayGoals={cardFixture.result.awayGoals}
                youHome={cardFixture.home.isPlayer}
                homeScorers={summariseScorers(cardFixture.scorers?.home) || undefined}
                awayScorers={summariseScorers(cardFixture.scorers?.away) || undefined}
                onPress={() => openFixture(cardFixture)}
                footer={fixtureRequest(cardFixture) ? <ManOfTheMatch roles={roles} req={fixtureRequest(cardFixture)!} /> : null} />
            ) : !started ? (
              <KitText t="bodyL" color={roles.textMuted} style={styles.pre}>
                {poolsReady ? t('season.punditsOrder') : t('season.loadingSquads')}
              </KitText>
            ) : null}
          </>}
          afterMatch={<CupNow roles={roles} cup={cup} md={cardMD} onTie={openCupTie} />}
          panes={[
            { id: 'table', label: t('season.tabTable'), flex: 1.4, wideOrder: 1, node: tablePane },
            { id: 'results', label: shownMD > 0 ? t('season.tabResultsMd', { md: shownMD }) : t('season.tabResults'),
              title: shownMD > 0 ? t('season.resultsMd', { md: shownMD }) : t('season.tabResults'), wideOrder: 0, node: resultsPane,
              // On a wide window the round, the cup and your fixtures share the left pane.
              wideNode: <>{resultsPane}{cupPane ? <><SectionTag roles={roles}>{cup!.name}</SectionTag>{cupPane}</> : null}<SectionTag roles={roles}>{t('season.tabFixtures')}</SectionTag>{fixturesPane}</> },
            { id: 'fixtures', label: t('season.tabFixtures'), node: fixturesPane, wideNode: null },
            ...(cup ? [{ id: 'cup', label: t('season.tabCup'), node: cupPane, wideNode: null }] : []),
            { id: 'press', label: t('season.tabPress'), count: stories.length, title: `${t('season.tabPress')} · ${stories.length}`, wideOrder: 2, node: pressPane },
          ]} />
      </KitScreen>

      {/* The thumb zone: the ticker, then the controls. */}
      <View style={[styles.bar, { backgroundColor: roles.bg, borderTopColor: roles.rule, paddingBottom: insets.bottom + space[2] }]}>
        <View style={[styles.barInner, { maxWidth: wide ? MAX_CONTENT : COLUMN }]}>
        {tab !== 'press' && <Ticker roles={roles} story={stories[stories.length - 1] ?? null} onPress={() => setTab('press')} />}
        {!done && (
          <StageControls roles={roles} skip={{ label: t('season.skipToLast'), consequence: t('season.mdsAtOnce', { from: nextMD, to: totalMatchdays }),
            pause: () => setIsPlaying(false), run: () => skipRef.current(), disabled: !poolsReady }} />
        )}
        <Plate label={plateLabel} icon={done ? 'forward' : isPlaying ? 'pause' : 'play'} roles={roles}
          onPress={onPlate} disabled={!poolsReady} missingStep={t('season.loadingSquadsStep')} loading={finishing} />
        </View>
      </View>
    </View>
    </ModeLookProvider>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  totm: { marginTop: space[5], gap: space[2] },
  pre: { paddingVertical: space[3] },
  bar: { paddingHorizontal: space[4], paddingTop: space[1], gap: space[2], borderTopWidth: border.hair },
  barInner: { width: '100%', alignSelf: 'center', gap: space[2] },
})
