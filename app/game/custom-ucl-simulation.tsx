import React, { useEffect, useRef, useState } from 'react'
import { openSheet } from '@/lib/sheet'
import { BracketTree } from '@/components/BracketTree'
import { liveBracket, liveProgress } from '@/lib/liveBracket'
import { kickoffFor } from '@/engine/schedule'
import { RoundTeam } from '@/components/season/RoundTeam'
import { usePauseOnBlur } from '@/hooks/usePauseOnBlur'
import { useIsFocused } from '@react-navigation/native'
import { View, StyleSheet, Pressable, ScrollView } from 'react-native'
import { router } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { calcTeamOvr } from '@/engine/rating'
import { getSlotsForFormation } from '@/engine/formations'
import { simulateMatch, setMatchTilt } from '@/engine/match'
import { resolveDifficulty } from '@/engine/difficulty'
import {
  buildCLTeams, drawCLLeaguePhase, simulateCLKnockoutsOnly,
  type CLTeam, type CLKnockoutMatch, type CLSeasonResult, type CLLeagueMatch, type CLLeaguePhase,
} from '@/engine/cl-sim'
import { LeaguePhaseDraw } from '@/components/season/LeaguePhaseDraw'
import { withMoves } from '@/components/season/SeasonParts'
import { ManOfTheMatch } from '@/components/MatchStatsParts'
import { useUserStore } from '@/store/userStore'
import { sideName } from '@/engine/placement'
import {
  regularSeasonMatchdays, splitStage, lockedFinalTable, playLiveMatch, sortLeagueTable,
  blankLeagueStats, simulateLeagueTableDetailed, type SimLeagueTable, type LiveMatchday, type LeagueFormat,
  type SimStandingRow,
} from '@/engine/cl-league-sim'
import { buildCLAccessList, ensureHolders, type AssociationEntry, type CLAccessList } from '@/engine/cl-access'
import type { QualTie, QualifyingResult } from '@/engine/cl-qualifying'
import {
  createAvailabilityLedger, type AvailabilityLedger,
} from '@/engine/availability'
import { getCustomUclAssociations, getEuropeHolders } from '@/db/queries/custom-ucl'
import type { EuroComp } from '@/data/uefa-coefficients'
import { playEveryCup, europaAndConferenceEntrants, simulateEurope, runQualTies } from '@/engine/europe-path'
import { cupNameForCountry } from '@/engine/domestic-cup'
import { EUROPE } from '@/data/europe'
import { getRostersForClubs } from '@/db/queries/seasons'
import {
  loadLeaguePools, lineupCtxOf, attributeFixtureScorers, attributeCLResultScorers, attributeQualTieScorers, summariseScorers,
  attachCLShootoutNames,
} from '@/engine/run-stats'
import {
  clKnockoutAvailabilityHook,
} from '@/engine/knockout-availability'
import { randomSeed } from '@/lib/rng'
import { playFixture } from '@/engine/play-fixture'
import { openMatchStats } from '@/lib/matchStats'
import { openDeepMatch } from '@/lib/deepMatch'
import { koLegDetailRequest } from '@/components/MatchStatsParts'
import type { RosterPlayer } from '@/types/stats'
import type { SimTeam } from '@/types/simulation'
import { QualifyingLadder } from '@/components/QualifyingLadder'
import { LiveMatch, periodsForTwoLegTie } from '@/components/LiveMatch'
import { BracketPreview } from '@/components/BracketPreview'
import { InfoBubble } from '@/components/InfoBubble'
import {
  openLeaguesBrowser, openLeagueTable, openKoTie, qualTieToKoMatch, berthZones, LeagueRow,
} from '@/components/CustomUclViewers'
import { useSimBackGuard } from '@/hooks/useSimBackGuard'
import { QUAL_ROUND_ORDER, QUAL_ROUND_LABEL, PATH_LABEL, QUAL_EXIT_ROUND } from '@/data/cl-qual-labels'
import { FORMAT_LABEL, FORMAT_EXPLAINER, isSpecialFormat } from '@/data/league-formats'
import { colors, spacing, typography, radius, shadows, MODE_THEMES, ROLES } from '@/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  RoadTape, LeagueTable, ZoneLegend, StandingFigure, SeasonStrip, ScorelineCard, ResultRow,
  SegmentSwitch, FixtureRow, StampLabel, TieCard, TieRow, CL_PHASE_ZONES,
  type TableRowVM, type Mark, type TieVM,
} from '@/components/season/SeasonParts'
import { ThumbBar, BackToLive, SkipPlate } from '@/components/season/RunChrome'
import { KitScreen, KitText, Plate, SectionTag, Chips, ListRow } from '@/components/kit'
import { space } from '@/theme'
import { getFlag } from '@/lib/flagMap'

const CL = MODE_THEMES.champions_league

// Where each phase sits on the five-stage road (07c C4).
const ROAD_STAGE: Record<string, number> = {
  loading: 0, domestic_review: 0, domestic_sim: 0, domestic_result: 0,
  world_sim: 1, qualifying: 2, quali_result: 2, review: 3, simulating: 3, knockout_phase: 4,
}

const nylon = ROLES.nylon

const simRow = (t: SimTeam): TableRowVM => ({
  clubId: t.clubId, clubName: t.clubName, isPlayer: t.isPlayer,
  played: t.stats.played, gd: t.stats.goalsFor - t.stats.goalsAgainst, points: t.stats.points,
})

function markOf(youHome: boolean, hg: number, ag: number): Mark {
  const mine = youHome ? hg - ag : ag - hg
  return mine > 0 ? 'W' : mine < 0 ? 'L' : 'D'
}

const ordinalOf = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

// Going out has a name per round (07c C5: elimination is a verdict).
const KO_OUT: Record<string, string> = {
  playoff: 'Out in the play-off', r16: 'Out in the round of 16',
  qf: 'Out in the quarter-finals', sf: 'Out in the semi-finals', final: 'Runners-up',
}

// A Champions League tie → the shared tie view model.
function clTieToVM(m: CLKnockoutMatch, onPress?: () => void): TieVM {
  const parts: string[] = []
  if (m.leg1) parts.push(`Leg 1 ${m.leg1.aGoals}–${m.leg1.bGoals}`)
  if (m.leg2) parts.push(`Leg 2 ${m.leg2.aGoals}–${m.leg2.bGoals}`)
  if (m.extraTime) parts.push('AET')
  if (m.aPens !== undefined) parts.push(`Pens ${m.aPens}–${m.bPens}`)
  return {
    aName: m.teamA.clubName, bName: m.teamB.clubName,
    aClubId: m.teamA.clubId, bClubId: m.teamB.clubId,
    aFlag: getFlag(m.teamA.clubId), bFlag: getFlag(m.teamB.clubId),
    score: `${m.aGoals}–${m.bGoals}`,
    detail: parts.join(' · ') || undefined,
    winnerIsA: m.winner.clubId === m.teamA.clubId,
    isPlayerTie: m.teamA.isPlayer || m.teamB.isPlayer,
    scorers: [m.leg1Scorers, m.leg2Scorers, m.leg2ExtraTimeScorers]
      .flatMap(sc => [summariseScorers(sc?.home), summariseScorers(sc?.away)])
      .filter(Boolean).join(' · ') || undefined,
    onPress,
  }
}

function Road({ phase }: { phase: string }) {
  const insets = useSafeAreaInsets()
  return (
    <View style={{ paddingTop: insets.top + spacing.sm }}>
      <RoadTape roles={ROLES.nylon} current={ROAD_STAGE[phase] ?? 0} />
    </View>
  )
}

type Phase =
  | 'loading'
  | 'domestic_review'   // your league + club + stakes → start
  | 'domestic_sim'      // play YOUR domestic season, matchday by matchday
  | 'domestic_result'   // where you finished → what it earned (or nothing)
  | 'world_sim'         // the other 52 leagues resolve (revealed slowly, browsable)
  | 'qualifying'        // the qualifying ladder plays out (ties tappable)
  | 'quali_result'      // qualified / eliminated / entered directly
  | 'review'            // league phase preview
  | 'simulating'        // league phase matchdays
  | 'knockout_phase'    // knockout reveal (ties tappable)

type Speed = 'slow' | 'normal' | 'fast'
const SPEED_MS: Record<Speed, number> = { slow: 2200, normal: 900, fast: 250 }

// One matchday result (with summarised scorers) for the results card.
type MDResult = {
  homeId: string; awayId: string; home: string; away: string
  hg: number; ag: number; playerHome: boolean; playerAway: boolean
  hs?: string; as?: string
  scorers?: import('@/types/stats').MatchScorers   // full events — match-detail modal
  seed?: number                                    // deep-stat seed (match-detail.ts)
  // Who each side rested (playFixture). The sheet must regenerate the eleven
  // that actually played; without these it could show a different one.
  homeRotation?: number; awayRotation?: number
  absent?: string[]; standIns?: import('@/types/stats').RosterPlayer[]
}

function sortStandings(teams: CLTeam[]): CLTeam[] {
  return [...teams].sort((a, b) => {
    if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points
    const gdA = a.stats.goalsFor - a.stats.goalsAgainst, gdB = b.stats.goalsFor - b.stats.goalsAgainst
    if (gdB !== gdA) return gdB - gdA
    return b.stats.goalsFor - a.stats.goalsFor
  })
}


// How far down the knockouts page counts as away from the live round.
const KO_AWAY_PX = 320

export default function CustomUclSimulationScreen() {
  const {
    formation, draftedPlayers, benchPlayers, useSubstitutes, clYear, customUclPlayerClubId,
    setClTeams, setClResult, setCustomUclQual, setCustomUclLeagues, difficulty, customDifficulty,
  } = useGameStore()
  // Difficulty tilts the player's own matches (engine/match.ts) — set before any
  // domestic-season or UCL sim runs. Synchronous on purpose (see simulation.tsx).
  setMatchTilt(resolveDifficulty(difficulty, customDifficulty).tilt)
  const fullSquad = [...draftedPlayers, ...benchPlayers]

  const totalTeamOvr = formation && draftedPlayers.length > 0 ? calcTeamOvr(draftedPlayers, getSlotsForFormation(formation)) : 0
  const playerClubId = customUclPlayerClubId
  // Deep stats — served by both the domestic season and the UCL league phase
  // (MDResult rows carry scorers + seed).
  const mdRequest = (r: MDResult, yearStart: number) => ({
    homeClubId: r.homeId, homeName: r.home,
    awayClubId: r.awayId, awayName: r.away,
    homeGoals: r.hg, awayGoals: r.ag,
    scorers: r.scorers, seed: r.seed, yearStart,
    homeRotation: r.homeRotation, awayRotation: r.awayRotation,
    absent: r.absent, standIns: r.standIns,
    playerClubId: playerClubId ?? undefined,
  })
  const openMdDetail = (r: MDResult, md: number, label: string, yearStart: number) => openMatchStats({
    ...mdRequest(r, yearStart),
    competitionLabel: `${label} · Matchday ${md}`,
  }, CL.accent)

  const [phase, setPhase] = useState<Phase>('loading')
  // §3 — active once the domestic season starts simulating; 'loading' and the
  // pre-kickoff 'domestic_review' squad screen have nothing decided yet.
  useSimBackGuard(phase !== 'loading' && phase !== 'domestic_review')
  const [speed, setSpeed] = useState<Speed>('normal')
  const [isPlaying, setIsPlaying] = useState(false)
  usePauseOnBlur(setIsPlaying)   // P8-32
  // The reveals below advance on their own timers, and they held while you'd
  // scrolled away from the top (P8-63) but not while another screen was on
  // top: out of the knockouts, See the bracket let the rest of the rounds
  // play out underneath (the maintainer, 26 Sept). The playing loops already
  // stop on leaving (P8-32); these wait, and carry on when you come back.
  const focused = useIsFocused()

  // ── Domestic season state ──
  const assocsRef = useRef<AssociationEntry[]>([])
  const playerAssocRef = useRef<AssociationEntry | null>(null)
  const domTeamsRef = useRef<SimTeam[]>([])
  const domMatchdaysRef = useRef<LiveMatchday[]>([])
  const domSplitIdsRef = useRef<Set<string> | null>(null)
  const domStageLabelRef = useRef('Regular Season')
  const domRegularSnapshotRef = useRef<SimStandingRow[] | undefined>(undefined)
  // The player's OWN final domestic table, frozen once the season ends — shown
  // on both hand-off screens (domestic_result, quali_result) per Big Fixes §2,
  // not just threaded into the access-list calc and then dropped.
  const domPlayerTableRef = useRef<SimLeagueTable | null>(null)
  const [domMD, setDomMD] = useState(0)             // 0-based index into current plan
  const [domStage, setDomStage] = useState<'regular' | 'split'>('regular')
  const [showRegularTable, setShowRegularTable] = useState(false)  // split view: peek at pre-split table
  const [domTick, setDomTick] = useState(0)         // re-render trigger (teams are refs)
  const [domesticFinish, setDomesticFinish] = useState<number | null>(null)
  // This matchday's results (league-sim-style card with scorers).
  const [recentResults, setRecentResults] = useState<MDResult[]>([])
  // Full per-matchday history for lookback (domestic season + UCL league phase).
  const [domHistory, setDomHistory] = useState<MDResult[][]>([])
  const [lpHistory, setLpHistory] = useState<MDResult[][]>([])
  // P8-136: the table's order after each matchday, for the movement column.
  const domOrdersRef = useRef<string[][]>([])
  const lpOrdersRef = useRef<string[][]>([])
  // Scorer pools for the player's DOMESTIC league (attribution is display-only
  // there; the UCL phases use poolByClubRef).
  const domPoolRef = useRef<Map<string, RosterPlayer[]>>(new Map())
  const domLineupCtxRef = useRef<{ playerClubId?: string; benchSize?: number }>({})

  // ── World / access / qualifying ──
  const [tables, setTables] = useState<SimLeagueTable[]>([])
  const accessRef = useRef<CLAccessList | null>(null)
  const [qual, setQual] = useState<QualifyingResult | null>(null)
  const [worldRevealed, setWorldRevealed] = useState(0)
  const [qualRoundIdx, setQualRoundIdx] = useState(0)
  const [liveQualDone, setLiveQualDone] = useState<Record<string, boolean>>({})
  const [liveQualMatch, setLiveQualMatch] = useState<CLKnockoutMatch | null>(null)
  const [justDecidedQualTie, setJustDecidedQualTie] = useState<QualTie | null>(null)
  const koOpts = { playerClubId: playerClubId ?? undefined, drafted: draftedPlayers, yearStart: clYear ?? 2025, playerFormation: formation ?? undefined }
  // Which matchday's results are on screen (null = the latest), and which of
  // the two views each league is showing.
  const [mdView, setMdView] = useState<number | null>(null)
  const [domTab, setDomTab] = useState<'table' | 'results'>('table')
  const [lpTab, setLpTab] = useState<'table' | 'results'>('table')
  // The ConfirmScreen calls back after this render may be stale.
  const domSkipRef = useRef<() => void>(() => {})
  const lpSkipRef = useRef<() => void>(() => {})
  const lpFinishingRef = useRef(false)   // "To the knockouts" runs once
  const { profile, isGuest } = useUserStore()
  const yourSide = sideName(isGuest ? null : profile?.username)

  // ── UCL league phase + knockouts ──
  const [clTeamsLocal, setClTeamsLocal] = useState<CLTeam[]>([])
  const [fixtures, setFixtures] = useState<{ matchday: number; home: CLTeam; away: CLTeam }[]>([])
  // P8-114: the league-phase draw, kept whole for the draw's screen.
  const [lpDraw, setLpDraw] = useState<CLLeaguePhase | null>(null)
  const countryByClubRef = useRef<Map<string, string>>(new Map())
  const countryOfClub = (t: CLTeam) => countryByClubRef.current.get(t.clubId)
  const [currentMD, setCurrentMD] = useState(1)
  const leagueHistoryRef = useRef<CLLeagueMatch[]>([])
  const poolByClubRef = useRef<Map<string, RosterPlayer[]>>(new Map())
  // §10.5 — carried alongside the pools so every attribution in this screen
  // selects the same eleven the stat sheet will regenerate later.
  const lineupCtxRef = useRef<{ playerClubId?: string; benchSize?: number }>({})
  // §10.5 phase 4 — sequential availability across the league phase AND the
  // bracket. See engine/availability.ts; same shape as the other three sims.
  const availabilityRef = useRef<AvailabilityLedger | null>(null)
  const [koRounds, setKoRounds] = useState<{ round: string; label: string; ties: CLKnockoutMatch[] }[]>([])
  const [koVisibleCount, setKoVisibleCount] = useState(0)
  // P8-63, as in the classic knockouts: newest round on top, the page returns
  // to it as each round opens, a tag brings you back if you scrolled away, and
  // while you're away your live match and the next round wait for you.
  const koScrollRef = useRef<ScrollView>(null)
  const [koAway, setKoAway] = useState(false)
  useEffect(() => { koScrollRef.current?.scrollTo({ y: 0, animated: true }) }, [koVisibleCount])
  const [liveDone, setLiveDone] = useState<Record<string, boolean>>({})
  const finishedRef = useRef(false)
  const finalResultRef = useRef<CLSeasonResult | null>(null)
  // §7 R6 — the Deep Match final is watched exactly once; after that the tie
  // settles into the normal row and the results CTA appears.
  const [deepFinalWatched, setDeepFinalWatched] = useState(false)
  // P8-52: the competition your season goes on in, once Europe's summer is
  // played (the Champions League until then, and if you never qualified).
  const europe = qual?.europe ?? null
  const comp = EUROPE[europe?.competition ?? 'ucl']
  const totalMatchdays = comp.matchdays
  const format = { pots: comp.pots, perPot: comp.perPot }
  // Every league-phase matchday, then four two-legged rounds and the final.
  const allMatchdays = comp.matchdays + 4 * 2 + 1
  // Which ladder the qualifying screens show; your own by default.
  const [qualComp, setQualComp] = useState<EuroComp | null>(null)

  const playerReachedLeaguePhase = clTeamsLocal.some(t => t.isPlayer)

  // ── Init: load associations, set up the player's live domestic season ──────
  useEffect(() => {
    async function init() {
      if (!formation || draftedPlayers.length === 0 || !playerClubId) return
      const assocs = await getCustomUclAssociations()
      assocsRef.current = assocs
      // Every club's country, for the draw's association rule (P8-114). The
      // holders are in here too: they're in their own association's clubs.
      countryByClubRef.current = new Map(assocs.flatMap(a => a.clubs.map(c => [c.clubId, a.country] as [string, string])))
      const mine = assocs.find(a => a.clubs.some(c => c.clubId === playerClubId)) ?? null
      playerAssocRef.current = mine
      if (!mine) return
      // Your side wears your name, as in a league run (P8-20); the maintainer
      // (26 Sept): the full path still called you by the club you replaced.
      // Everything after this reads its names from this table (Europe's access
      // list, qualifying, the league phase, the result), so it's set once here.
      const teams: SimTeam[] = mine.clubs.map(c => ({
        clubId: c.clubId, clubName: c.clubId === playerClubId ? yourSide : c.clubName,
        ovr: c.clubId === playerClubId ? totalTeamOvr : c.ovr,
        isPlayer: c.clubId === playerClubId,
        form: 0, stats: blankLeagueStats(),
      }))
      domTeamsRef.current = teams
      domMatchdaysRef.current = regularSeasonMatchdays(teams, mine.format ?? 'double_round_robin')
      setPhase('domestic_review')
      // Domestic scorer pools (background — ready before the first matchday).
      loadLeaguePools(teams.map(t => ({ clubId: t.clubId, clubName: t.clubName, isPlayer: t.isPlayer })), fullSquad, 2025, useSubstitutes)
        .then(p => { domPoolRef.current = p.poolByClub; domLineupCtxRef.current = { playerClubId: p.playerClubId, benchSize: p.benchSize } })
        .catch(e => console.warn('[custom-ucl-sim] domestic pool load failed:', e))
    }
    init()
  }, [])

  // ── Domestic matchday loop ──────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'domestic_sim' || !isPlaying) return
    const timer = setTimeout(playDomesticMD, SPEED_MS[speed])
    return () => clearTimeout(timer)
  }, [phase, isPlaying, domMD, domStage, speed, domTick])

  // The domestic table's order as it stands (split-aware, as the table draws it).
  function domOrderNow(): string[] {
    const t = domStage === 'split' ? lockedFinalTable(domTeamsRef.current, domSplitIdsRef.current) : sortLeagueTable(domTeamsRef.current)
    return t.map(x => x.clubId)
  }

  function playDomesticMD() {
    const plan = domMatchdaysRef.current
    if (domMD >= plan.length) { advanceDomesticStage(); return }
    const md = plan[domMD]
    const results: MDResult[] = []
    for (const [home, away] of md) {
      const r = playLiveMatch(home, away)
      const seed = randomSeed()
      const sc = attributeFixtureScorers(domPoolRef.current, home.clubId, away.clubId, r.homeGoals, r.awayGoals, false, false, seed, domLineupCtxRef.current)
      results.push({
        homeId: home.clubId, awayId: away.clubId, home: home.clubName, away: away.clubName,
        hg: r.homeGoals, ag: r.awayGoals, playerHome: home.isPlayer, playerAway: away.isPlayer,
        hs: summariseScorers(sc.home), as: summariseScorers(sc.away),
        scorers: sc, seed,
      })
    }
    // Player's match first, then the rest — same reading order as league mode.
    results.sort((a, b) => Number(b.playerHome || b.playerAway) - Number(a.playerHome || a.playerAway))
    setRecentResults(results)
    domOrdersRef.current.push(domOrderNow())
    setDomHistory(h => [...h, results])
    setDomMD(n => n + 1)
    setDomTick(t => t + 1)
  }

  // Snapshot the table as it stands at the split — BEFORE points get halved —
  // so the league viewer can show "Regular Season" vs "Final" phases.
  function snapshotRegularSeason(): SimStandingRow[] {
    return sortLeagueTable(domTeamsRef.current).map(t => ({
      clubId: t.clubId, clubName: t.clubName, ovr: t.ovr,
      played: t.stats.played, won: t.stats.won, drawn: t.stats.drawn, lost: t.stats.lost,
      goalsFor: t.stats.goalsFor, goalsAgainst: t.stats.goalsAgainst, points: t.stats.points,
    }))
  }

  function advanceDomesticStage() {
    const mine = playerAssocRef.current!
    if (domStage === 'regular') {
      const snapshot = snapshotRegularSeason()
      const split = splitStage(domTeamsRef.current, (mine.format ?? 'double_round_robin') as LeagueFormat)
      if (split && split.matchdays.length > 0) {
        domRegularSnapshotRef.current = snapshot
        domSplitIdsRef.current = split.championshipIds
        domStageLabelRef.current = split.label
        domMatchdaysRef.current = split.matchdays
        setDomStage('split'); setDomMD(0)
        setIsPlaying(false)   // pause at the split so the moment lands
        return
      }
    }
    finishDomesticSeason()
  }

  function skipDomesticSeason() {
    // Fast-forward: play every remaining matchday headlessly (stage-aware).
    setIsPlaying(false)
    const mine = playerAssocRef.current!
    let plan = domMatchdaysRef.current
    let md = domMD
    let stage = domStage
    for (;;) {
      for (; md < plan.length; md++) {
        for (const [h, a] of plan[md]) playLiveMatch(h, a)
        domOrdersRef.current.push(sortLeagueTable(domTeamsRef.current).map(x => x.clubId))
      }
      if (stage === 'regular') {
        const snapshot = snapshotRegularSeason()
        const split = splitStage(domTeamsRef.current, (mine.format ?? 'double_round_robin') as LeagueFormat)
        if (split && split.matchdays.length > 0) {
          domRegularSnapshotRef.current = snapshot
          domSplitIdsRef.current = split.championshipIds
          domStageLabelRef.current = split.label
          plan = split.matchdays; md = 0; stage = 'split'
          continue
        }
      }
      break
    }
    finishDomesticSeason()
  }

  domSkipRef.current = skipDomesticSeason

  function finishDomesticSeason() {
    const ordered = lockedFinalTable(domTeamsRef.current, domSplitIdsRef.current)
    const pos = ordered.findIndex(t => t.isPlayer) + 1
    setDomesticFinish(pos)
    // Freeze the player's league as a SimLeagueTable (feeds access + the viewer).
    const mine = playerAssocRef.current!
    const playerTable: SimLeagueTable = {
      rank: mine.rank, name: mine.name, country: mine.country, format: mine.format,
      standings: ordered.map(t => ({
        clubId: t.clubId, clubName: t.clubName, ovr: t.ovr,
        played: t.stats.played, won: t.stats.won, drawn: t.stats.drawn, lost: t.stats.lost,
        goalsFor: t.stats.goalsFor, goalsAgainst: t.stats.goalsAgainst, points: t.stats.points,
      })),
      regularStandings: domRegularSnapshotRef.current,
    }
    domPlayerTableRef.current = playerTable
    // Now resolve the REST of Europe (headless, format-aware) + access + qualifying.
    resolveWorld(playerTable, pos)
    setPhase('domestic_result')
  }

  async function resolveWorld(playerTable: SimLeagueTable, playerPos: number) {
    const allTables: SimLeagueTable[] = []
    const simulated: AssociationEntry[] = assocsRef.current.map(a => {
      if (a.rank === playerTable.rank) {
        allTables.push(playerTable)
        return { rank: a.rank, name: a.name, country: a.country, format: a.format, clubs: playerTable.standings.map(s => ({ clubId: s.clubId, clubName: s.clubName, ovr: s.ovr })) }
      }
      const { standings, regularStandings } = simulateLeagueTableDetailed(a.clubs, a.format)
      allTables.push({ rank: a.rank, name: a.name, country: a.country, format: a.format, standings, regularStandings })
      return { rank: a.rank, name: a.name, country: a.country, format: a.format, clubs: standings.map(s => ({ clubId: s.clubId, clubName: s.clubName, ovr: s.ovr })) }
    })
    allTables.sort((x, y) => x.rank - y.rank)

    let access = buildCLAccessList(simulated)
    let held: Awaited<ReturnType<typeof getEuropeHolders>> = { ucl: null, uel: null, uecl: null }
    try { held = await getEuropeHolders() } catch { /* keep un-heldered */ }
    access = ensureHolders(access, [held.ucl, held.uel].filter((h): h is NonNullable<typeof h> => !!h))
    accessRef.current = access

    // P8-52: every association's cup, then the Europa and Conference Leagues'
    // places, then the three ladders with their drops (engine/europe-path.ts).
    const cups = playEveryCup(simulated, playerClubId, randomSeed())
    const euro = europaAndConferenceEntrants(access, simulated, cups, held.uecl)
    const holders = (['ucl', 'uel', 'uecl'] as EuroComp[]).flatMap(c => (held[c] ? [{ comp: c, clubId: held[c]!.clubId, clubName: held[c]!.clubName }] : []))
    const q = simulateEurope(access, euro, cups, holders, playerClubId ?? undefined)
    const inComp = EUROPE[q.europe?.competition ?? 'ucl']
    // Attribute qualifying-tie scorers ONCE (stored on the ties) so the tie
    // details, stats totals and awards all agree everywhere.
    try {
      const tieClubs = new Map<string, { clubId: string; clubName: string; isPlayer: boolean }>()
      for (const t of q.ties) {
        tieClubs.set(t.teamA.clubId, { clubId: t.teamA.clubId, clubName: t.teamA.clubName, isPlayer: t.teamA.clubId === playerClubId })
        if (t.teamB) tieClubs.set(t.teamB.clubId, { clubId: t.teamB.clubId, clubName: t.teamB.clubName, isPlayer: t.teamB.clubId === playerClubId })
      }
      if (tieClubs.size > 0) {
        const pools = await loadLeaguePools([...tieClubs.values()], fullSquad, clYear ?? 2025, useSubstitutes)
        attributeQualTieScorers(q.ties, pools.poolByClub, lineupCtxOf(pools))
      }
    } catch (e) { console.warn('[custom-ucl-sim] qual scorer attribution failed:', e) }
    setQual(q)
    setTables(allTables)
    setCustomUclQual(q)
    setCustomUclLeagues(allTables)
    // The holders (ensureHolders marks them with association rank 0) are the top
    // seed of pot 1. Your competition's field, in its own number of pots.
    const potted = buildCLTeams(q.leaguePhaseField.map(t => ({ clubId: t.clubId, clubName: t.clubName, ovr: t.ovr, isPlayer: t.isPlayer, holder: t.associationRank === 0 })), countryOfClub, inComp.pots)
    setClTeamsLocal(potted)
    setClTeams(potted)
  }

  // P8-52: where your season took you, from all three access lists as played
  // (your league place, your cup, a place passed down to you, or the holders').
  const mine = playerAssocRef.current
  const entry = europe?.entry ?? null
  const notQualified = domesticFinish !== null && !!qual && !entry
  const yourCup = mine ? europe?.cups.find(c => c.rank === mine.rank) ?? null : null

  // ── World reveal (slower — one league every 400ms) ──────────────────────────
  useEffect(() => {
    if (phase !== 'world_sim' || !focused) return
    if (worldRevealed >= tables.length) return
    const t = setTimeout(() => setWorldRevealed(n => n + 1), 400)
    return () => clearTimeout(t)
  }, [phase, worldRevealed, tables.length, focused])

  // ── Qualifying reveal (one round every ~4s) ────────────────────────────────
  const qualRoundsWithTies = QUAL_ROUND_ORDER.filter(r => qual?.ties.some(t => t.round === r))
  const currentQualRound = qualRoundsWithTies[qualRoundIdx]
  // Your own tie gets the same live-clock treatment knockout ties already get
  // (Big Fixes feedback: qualifying had none) — hold the round back until it's watched.
  const playerQualTie = (qual?.ties ?? []).find(t => t.round === currentQualRound && t.teamB && t.legs &&
    (t.teamA.clubId === playerClubId || t.teamB.clubId === playerClubId))
  const waitingOnLiveQual = !!playerQualTie && !liveQualDone[currentQualRound]
  useEffect(() => {
    if (phase !== 'qualifying' || !focused) return
    if (qualRoundIdx >= qualRoundsWithTies.length) return
    if (waitingOnLiveQual) return   // hold until the live watch finishes
    const t = setTimeout(() => setQualRoundIdx(n => n + 1), 4200)
    return () => clearTimeout(t)
  }, [phase, qualRoundIdx, qualRoundsWithTies.length, waitingOnLiveQual, focused])

  // Named shootout takers are only pre-built for knockout ties (attachCLShootoutNames
  // runs before reveal); qualifying ties need the same lazy expansion the tie-detail
  // modal already does, so a penalty-decided qualifying tie can play out live too.
  useEffect(() => {
    if (!waitingOnLiveQual || !playerQualTie) { setLiveQualMatch(null); return }
    const m = qualTieToKoMatch(playerQualTie)
    if (!m) { setLiveQualMatch(null); return }
    if (!m.aPenKicks || !m.bPenKicks) { setLiveQualMatch(m); return }
    let active = true
    attachCLShootoutNames([m], playerClubId ?? undefined, draftedPlayers)
      .then(() => { if (active) setLiveQualMatch({ ...m }) })
      .catch(() => { if (active) setLiveQualMatch(m) })
    return () => { active = false }
  }, [waitingOnLiveQual, playerQualTie?.round, playerQualTie?.teamA.clubId])

  useEffect(() => {
    if (phase === 'qualifying' && qualRoundsWithTies.length > 0 && qualRoundIdx >= qualRoundsWithTies.length) {
      setPhase('quali_result')
    }
  }, [phase, qualRoundIdx, qualRoundsWithTies.length])

  // ── UCL league phase setup + loop ───────────────────────────────────────────
  useEffect(() => {
    // Once. This ran again every matchday (each one hands clTeamsLocal a new
    // array), so the fixture list was made anew and the injury and suspension
    // ledger reset after every matchday; with a real draw it would also have
    // redrawn your eight halfway through.
    if (clTeamsLocal.length === 0 || !playerReachedLeaguePhase || lpDraw) return
    const draw = drawCLLeaguePhase(clTeamsLocal, countryOfClub, format)
    setLpDraw(draw)
    setFixtures(draw.fixtures)
    loadLeaguePools(clTeamsLocal, fullSquad, clYear ?? 2025, useSubstitutes)
      .then(p => {
        poolByClubRef.current = p.poolByClub
        lineupCtxRef.current = { playerClubId: p.playerClubId, benchSize: p.benchSize }
        availabilityRef.current = createAvailabilityLedger({
          poolByClub: p.poolByClub, playerClubId: p.playerClubId,
          totalMatchdays: allMatchdays,
        })
      })
      .catch(e => console.warn('[custom-ucl-sim] pool load failed:', e))
  }, [clTeamsLocal, playerReachedLeaguePhase])

  useEffect(() => {
    if (phase !== 'simulating' || !isPlaying) return
    const timer = setTimeout(simulateNextMD, SPEED_MS[speed])
    return () => clearTimeout(timer)
  }, [phase, isPlaying, currentMD, clTeamsLocal, fixtures, speed])

  function simulateNextMD() {
    // P8-115: the league phase stops on its final table. It went straight on
    // to the knockouts, so the table you'd just finished was gone at once.
    if (currentMD > totalMatchdays) { setIsPlaying(false); return }
    const mdFixtures = fixtures.filter(f => f.matchday === currentMD)
    const teams = [...clTeamsLocal]
    const results: MDResult[] = []
    mdFixtures.forEach(({ home: h, away: a }) => {
      const home = teams.find(t => t.clubId === h.clubId)!, away = teams.find(t => t.clubId === a.clubId)!
      results.push(mdResultOf(home, away, playLpFixture(teams, home, away, currentMD)))
    })
    results.sort((a, b) => Number(b.playerHome || b.playerAway) - Number(a.playerHome || a.playerAway))
    setRecentResults(results)
    setLpHistory(h => [...h, results])
    lpOrdersRef.current.push(sortStandings(teams).map(t => t.clubId))
    setClTeamsLocal(teams)
    if (currentMD === totalMatchdays) setIsPlaying(false)
    setCurrentMD(md => md + 1)
  }

  function mdResultOf(home: CLTeam, away: CLTeam, played: ReturnType<typeof playFixture>): MDResult {
    return {
      homeId: home.clubId, awayId: away.clubId, home: home.clubName, away: away.clubName,
      hg: played.result.homeGoals, ag: played.result.awayGoals, playerHome: home.isPlayer, playerAway: away.isPlayer,
      hs: summariseScorers(played.scorers.home), as: summariseScorers(played.scorers.away),
      scorers: played.scorers, seed: played.seed,
      homeRotation: played.homeRotation, awayRotation: played.awayRotation,
      absent: played.absent, standIns: played.standIns,
    }
  }

  // P8-115 / P8-27: one fixture, played the same way live and skipped — the
  // classic league phase's playFixture (rotation, availability, the
  // lineup-based rating and form), recorded on the history the result reads.
  // The full path had two inline copies of its own, without rotation or form.
  function playLpFixture(teams: CLTeam[], home: CLTeam, away: CLTeam, md: number) {
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

  // Skip All (UCL league phase): play every remaining matchday headlessly.
  function skipUclLeaguePhase() {
    setIsPlaying(false)
    const teams = [...clTeamsLocal]
    // Every skipped matchday's results are kept, as watching keeps them, so
    // the strip of your results and the results tab have all eight.
    const days: MDResult[][] = []
    for (let md = currentMD; md <= totalMatchdays; md++) {
      const results: MDResult[] = []
      for (const { home: h, away: a } of fixtures.filter(f => f.matchday === md)) {
        const home = teams.find(t => t.clubId === h.clubId)!, away = teams.find(t => t.clubId === a.clubId)!
        results.push(mdResultOf(home, away, playLpFixture(teams, home, away, md)))
      }
      results.sort((a, b) => Number(b.playerHome || b.playerAway) - Number(a.playerHome || a.playerAway))
      days.push(results)
      lpOrdersRef.current.push(sortStandings(teams).map(t => t.clubId))
    }
    setLpHistory(h => [...h, ...days])
    if (days.length) setRecentResults(days[days.length - 1])
    setClTeamsLocal(teams)
    // P8-115: it lands on the final table, not in the knockouts. You go on
    // when you've read it.
    setCurrentMD(totalMatchdays + 1)
  }
  // P8-115: this was never assigned, so the skip's confirm did nothing.
  lpSkipRef.current = skipUclLeaguePhase

  async function finishLeaguePhase() {
    await finishLeaguePhaseWith(clTeamsLocal)
  }

  async function finishLeaguePhaseWith(finalTeams: CLTeam[]) {
    setIsPlaying(false)
    const sorted = sortStandings(finalTeams)
    // §10.5 phase 4 — the pools have to be in hand BEFORE the bracket: each tie
    // is priced with its absences and attributed the moment it's decided, so a
    // red card in the round of 16 is already a suspension by the quarter-final.
    let pool = poolByClubRef.current
    let ctx = lineupCtxRef.current
    if (pool.size === 0) {
      try {
        const p = await loadLeaguePools(sorted, fullSquad, clYear ?? 2025, useSubstitutes)
        pool = p.poolByClub; ctx = lineupCtxOf(p)
        availabilityRef.current ??= createAvailabilityLedger({
          poolByClub: p.poolByClub, playerClubId: p.playerClubId,
          totalMatchdays: allMatchdays,
        })
      } catch (e) { console.warn('[custom-ucl-sim] pool load failed:', e) }
    }
    const koHook = availabilityRef.current && pool.size > 0
      ? clKnockoutAvailabilityHook({
          ledger: availabilityRef.current, poolByClub: pool, lineupCtx: ctx,
          playerFormation: formation ?? undefined, firstMatchday: totalMatchdays,
        })
      : undefined
    const koResult = simulateCLKnockoutsOnly(sorted, koHook)
    const result: CLSeasonResult = {
      leaguePhaseStandings: sorted, ...koResult, leagueMatchdays: leagueHistoryRef.current,
      competition: comp.id,
      // Read AFTER the bracket, so knockout absences make the medical table.
      absences: availabilityRef.current?.absences() ?? [],
    }
    // Backstop only — the hook already attributed every tie it saw, and this is
    // idempotent, so it fills in only when the hook couldn't run.
    try {
      attributeCLResultScorers(result, pool, ctx)
    } catch (e) { console.warn('[custom-ucl-sim] scorer attribution failed:', e) }
    await revealKnockouts(result)
  }

  async function revealKnockouts(result: CLSeasonResult) {
    const allMatches: CLKnockoutMatch[] = [...result.playoffRound, ...result.r16, ...result.qf, ...result.sf, ...(result.final ? [result.final] : [])]
    // Fetch + attach named shootout kickers — ONE shared implementation used
    // by every mode (see attachCLShootoutNames in run-stats.ts).
    await attachCLShootoutNames(allMatches, playerClubId ?? undefined, fullSquad)
    finalResultRef.current = result
    const rounds = [
      result.playoffRound.length > 0 ? { round: 'playoff', label: 'Knockout Play-off (9th–24th)', ties: result.playoffRound } : null,
      result.r16.length > 0 ? { round: 'r16', label: 'Round of 16', ties: result.r16 } : null,
      result.qf.length > 0 ? { round: 'qf', label: 'Quarter-Finals', ties: result.qf } : null,
      result.sf.length > 0 ? { round: 'sf', label: 'Semi-Finals', ties: result.sf } : null,
      result.final ? { round: 'final', label: 'Final', ties: [result.final] } : null,
    ].filter(Boolean) as { round: string; label: string; ties: CLKnockoutMatch[] }[]
    setKoRounds(rounds)
    setKoVisibleCount(0)   // 0 = show the bracket preview first; play begins on tap
    setPhase('knockout_phase')
  }

  // Split in two so §7's Deep Match can commit the run WITHOUT this screen
  // navigating — it replaces itself with the result screen instead, so the
  // finished bracket never flashes up in between.
  function commitFinalResult() {
    if (finishedRef.current || !finalResultRef.current) return
    finishedRef.current = true
    setClResult(finalResultRef.current)
  }
  function finishAll() {
    if (finishedRef.current || !finalResultRef.current) return
    commitFinalResult()
    router.push('/game/awards?to=cucl')
  }

  // ── Player out before the league phase (qualifying exit / never qualified) ──
  function buildNoPlayerResult(finalRound: CLSeasonResult['playerFinalRound']): CLSeasonResult {
    // The tournament still plays out in full — league phase + knockouts without
    // the player — so the result screen can show all of it.
    const potted = buildCLTeams((qual?.leaguePhaseField ?? []).map(t => ({ clubId: t.clubId, clubName: t.clubName, ovr: t.ovr, isPlayer: false, holder: t.associationRank === 0 })), countryOfClub, comp.pots)
    const fx = drawCLLeaguePhase(potted, countryOfClub, format).fixtures
    const matchdays: CLLeagueMatch[] = []
    for (const f of fx) {
      const home = potted.find(t => t.clubId === f.home.clubId)!, away = potted.find(t => t.clubId === f.away.clubId)!
      const r = simulateMatch(home, away)
      home.stats.played++; away.stats.played++
      home.stats.goalsFor += r.homeGoals; home.stats.goalsAgainst += r.awayGoals
      away.stats.goalsFor += r.awayGoals; away.stats.goalsAgainst += r.homeGoals
      if (r.outcome === 'home') { home.stats.won++; home.stats.points += 3; away.stats.lost++ }
      else if (r.outcome === 'away') { away.stats.won++; away.stats.points += 3; home.stats.lost++ }
      else { home.stats.drawn++; home.stats.points++; away.stats.drawn++; away.stats.points++ }
      // Recorded so the result screen can still show every match (scorers get
      // attributed once in handleOutOfEurope, same as a normal run).
      matchdays.push({
        matchday: f.matchday,
        home: { clubId: home.clubId, clubName: home.clubName, isPlayer: false },
        away: { clubId: away.clubId, clubName: away.clubName, isPlayer: false },
        homeGoals: r.homeGoals, awayGoals: r.awayGoals,
      })
    }
    const sorted = sortStandings(potted)
    const ko = simulateCLKnockoutsOnly(sorted)

    // Synthesise the player's team record for the header card.
    const exitTie = [...(qual?.ties ?? [])].reverse().find(t => t.teamA.clubId === playerClubId || t.teamB?.clubId === playerClubId)
    const stats = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }
    let clubName = mine?.clubs.find(c => c.clubId === playerClubId)?.clubName ?? 'Your Club'
    if (exitTie?.legs) {
      const isA = exitTie.teamA.clubId === playerClubId
      clubName = isA ? exitTie.teamA.clubName : exitTie.teamB!.clubName
      stats.played = 2
      stats.goalsFor = isA ? exitTie.legs.totalA : exitTie.legs.totalB
      stats.goalsAgainst = isA ? exitTie.legs.totalB : exitTie.legs.totalA
      stats.lost = 1
    }
    const playerTeam: CLTeam = { clubId: playerClubId ?? 'player', clubName, ovr: totalTeamOvr, isPlayer: true, form: 0, stats, pot: 4 }
    return { leaguePhaseStandings: sorted, ...ko, leagueMatchdays: matchdays, playerTeam, playerFinalRound: finalRound, playerPot: 4, competition: europe?.competition ?? undefined }
  }

  async function handleOutOfEurope(finalRound: CLSeasonResult['playerFinalRound']) {
    if (finishedRef.current) return
    finishedRef.current = true
    const result = buildNoPlayerResult(finalRound)
    try {
      const rosters = await getRostersForClubs(result.leaguePhaseStandings.map(t => t.clubId), clYear ?? 2025)
      attributeCLResultScorers(result, rosters, lineupCtxRef.current)
    } catch (e) { console.warn('[custom-ucl-sim] scorer attribution failed:', e) }
    setClResult(result)
    router.push('/game/awards?to=cucl')
  }

  // Knockout auto-advance — but WAIT while the player's tie is playing out live.
  useEffect(() => {
    if (phase !== 'knockout_phase' || koVisibleCount < 1 || koVisibleCount > koRounds.length || koAway || !focused) return
    const latest = koRounds[koVisibleCount - 1]
    const playerTie = latest?.ties.find(t => t.teamA.isPlayer || t.teamB.isPlayer)
    if (playerTie && !liveDone[latest.round]) return   // hold until the live watch finishes
    const t = setTimeout(() => setKoVisibleCount(c => c + 1), playerTie ? 2200 : 4200)
    return () => clearTimeout(t)
  }, [phase, koVisibleCount, koRounds.length, liveDone, koAway, focused])

  // ── Guards ──────────────────────────────────────────────────────────────────
  if (!formation || draftedPlayers.length === 0 || !playerClubId) {
    return (
      <View style={[styles.container, { backgroundColor: nylon.bg, padding: space[4], justifyContent: 'center', gap: space[4] }]}>
        <KitText t="superM" color={nylon.text}>NO RUN</KitText>
        <KitText t="bodyL" color={nylon.textMuted}>This run lost its squad, usually after a reload. Start a new one.</KitText>
        <Plate label="Start a new run" roles={nylon} onPress={() => router.replace('/game/mode-select')} />
      </View>
    )
  }

  // ── The road, on nylon (docs/ui-overhaul/07c C4) ──────────────────────────
  // Every phase of the full path is the same screen: the road across the top,
  // one thing to read, and the next step in the thumb zone. The simulation
  // underneath is untouched.
  const domOrdered = domStage === 'split'
    ? lockedFinalTable(domTeamsRef.current, domSplitIdsRef.current)
    : sortLeagueTable(domTeamsRef.current)
  const domZones = mine ? berthZones(mine.rank, domOrdered.length) : []
  const domYouPos = domOrdered.findIndex(t => t.isPlayer) + 1
  const domTotalMDs = domMatchdaysRef.current.length
  const domMarks: Mark[] = domHistory.map(md => {
    const yours = md.find(r => r.playerHome || r.playerAway)
    if (!yours) return null
    return markOf(yours.playerHome, yours.hg, yours.ag)
  }).filter((m): m is Mark => !!m)
  const domSplitSize = domSplitIdsRef.current
    ? domOrdered.findIndex(t => !domSplitIdsRef.current!.has(t.clubId))
    : -1

  // Which matchday's results are being read, in either league (null = latest).
  const historyFor = (h: MDResult[][]) => (mdView == null ? h.length : Math.min(mdView, h.length))
  const resultsOf = (h: MDResult[][]) => h[historyFor(h) - 1] ?? []

  if (phase === 'loading' || !mine) {
    return (
      <View style={[styles.container, { backgroundColor: nylon.bg }]}>
        <Road phase="loading" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3], padding: space[4] }}>
          <KitText t="superM" color={nylon.text}>SETTING UP</KitText>
          <KitText t="bodyL" color={nylon.textMuted}>Your league, your club and the road into Europe.</KitText>
        </View>
      </View>
    )
  }

  const leaguesButton = tables.length > 0 ? (
    <Pressable onPress={() => openLeaguesBrowser(tables, playerClubId)} accessibilityRole="button" accessibilityLabel="Every league's table"
      style={({ pressed }) => [styles.kitLeagues, { borderColor: nylon.line }, pressed && { backgroundColor: nylon.sunken }]}>
      <KitText t="tag" color={nylon.text}>Leagues</KitText>
    </Pressable>
  ) : null

  const modals = (
    <>
    </>
  )

  // ── Phase: domestic review ────────────────────────────────────────────────
  if (phase === 'domestic_review') {
    const preview = [...domTeamsRef.current].sort((a, b) => b.ovr - a.ovr)
    return (
      <View style={[styles.container, { backgroundColor: nylon.bg }]}>
        <Road phase={phase} />
        <KitScreen ground="nylon" underHeader>
          <KitText t="superM" color={nylon.text} accessibilityRole="header">{mine.name.toUpperCase()}</KitText>
          <KitText t="tag" color={nylon.textMuted}>{`${mine.country} · rank ${mine.rank} · ${preview.length} clubs`}</KitText>
          <KitText t="bodyL" color={nylon.text} style={{ marginTop: space[2] }}>
            The field by squad strength. The codes say what each finish earns.
          </KitText>
          {isSpecialFormat(mine.format) && mine.format && (
            <KitText t="body" color={nylon.textMuted} style={{ marginTop: space[2] }}>
              {`${FORMAT_LABEL[mine.format as LeagueFormat]}: ${FORMAT_EXPLAINER[mine.format as LeagueFormat]}`}
            </KitText>
          )}
          <SectionTag roles={nylon}>The field</SectionTag>
          <LeagueTable roles={nylon} strength zones={domZones}
            rows={preview.map(t => ({ ...simRow(t), ovr: t.ovr }))} />
          <ZoneLegend roles={nylon} zones={domZones} />
        </KitScreen>
        <ThumbBar>
          <Plate label="Kick off the season" icon="play" roles={nylon} onPress={() => { setPhase('domestic_sim'); setIsPlaying(true) }} />
        </ThumbBar>
        {modals}
      </View>
    )
  }

  // ── Phase: domestic season ────────────────────────────────────────────────
  if (phase === 'domestic_sim') {
    const playedMDs = Math.min(domMD, domTotalMDs)
    const atSplitPause = !isPlaying && domStage === 'split' && domMD === 0
    const shown = resultsOf(domHistory)
    const yourResult = shown.find(r => r.playerHome || r.playerAway)
    const others = shown.filter(r => !(r.playerHome || r.playerAway))
    const preSplit = domStage === 'split' && showRegularTable && domRegularSnapshotRef.current
    return (
      <View style={[styles.container, { backgroundColor: nylon.bg }]}>
        <Road phase={phase} />
        <KitScreen ground="nylon" underHeader>
          <KitText t="tag" color={nylon.textMuted}>
            {`${mine.name} · 2025/26 · ${domStage === 'split' ? domStageLabelRef.current : 'Regular season'} · MD ${playedMDs}/${domTotalMDs}`}
          </KitText>
          {domYouPos > 0 && (
            <StandingFigure roles={nylon} pos={domYouPos} delta={null}
              zone={domZones[domYouPos - 1] ?? null} points={domOrdered[domYouPos - 1]?.stats.points ?? 0} />
          )}
          {atSplitPause && (
            <KitText t="body" color={nylon.text}>
              {`${domStageLabelRef.current}. ${FORMAT_EXPLAINER[(mine.format ?? 'double_round_robin') as LeagueFormat] ?? ''}`}
            </KitText>
          )}
          <SeasonStrip roles={nylon} marks={domMarks} total={domTotalMDs} viewing={mdView} onPick={md => { setMdView(md); if (md != null) setIsPlaying(false) }} />
          {mdView != null && <BackToLive md={mdView} onPress={() => setMdView(null)} />}
          {yourResult && (
            <ScorelineCard roles={nylon} label={[`MD ${historyFor(domHistory)}`, kickoffFor({ label: `Matchday ${historyFor(domHistory)}`, yearStart: 2025, homeClubId: yourResult.homeId, awayClubId: yourResult.awayId })?.short].filter(Boolean).join(' · ')}
              homeName={yourResult.home} awayName={yourResult.away} homeClubId={yourResult.homeId} awayClubId={yourResult.awayId}
              homeGoals={yourResult.hg} awayGoals={yourResult.ag} youHome={yourResult.playerHome}
              homeScorers={yourResult.hs || undefined} awayScorers={yourResult.as || undefined}
              onPress={() => openMdDetail(yourResult, historyFor(domHistory), 'Domestic Season', 2025)}
              footer={<ManOfTheMatch roles={nylon} req={mdRequest(yourResult, 2025)} />} />
          )}
          <SegmentSwitch<'table' | 'results'> roles={nylon} value={domTab} onChange={setDomTab} options={[
            { id: 'table', label: preSplit ? 'Pre-split table' : 'Table' },
            { id: 'results', label: `Results MD ${historyFor(domHistory)}` },
          ]} />
          {domTab === 'table' ? (
            <>
              {domStage === 'split' && domRegularSnapshotRef.current && (
                <Plate label={showRegularTable ? 'Show the live table' : 'Show the pre-split table'} variant="quiet"
                  roles={nylon} onPress={() => setShowRegularTable(v => !v)} />
              )}
              <LeagueTable roles={nylon} zones={domZones}
                breakAfter={preSplit ? undefined : (domSplitSize > 0 ? domSplitSize : undefined)}
                breakLabel="Relegation / Europe group"
                rows={preSplit
                  ? domRegularSnapshotRef.current!.map(r => ({
                      clubId: r.clubId, clubName: r.clubName, isPlayer: r.clubId === playerClubId,
                      played: r.played, gd: r.goalsFor - r.goalsAgainst, points: r.points,
                    }))
                  : withMoves(domOrdered.map(simRow), domOrdersRef.current[domOrdersRef.current.length - 2])} />
              <ZoneLegend roles={nylon} zones={domZones} />
            </>
          ) : others.length === 0 ? (
            <KitText t="body" color={nylon.textMuted} style={{ paddingVertical: space[3] }}>No other results yet.</KitText>
          ) : (
            <>
            {others.map((r, i) => (
              <ResultRow key={i} roles={nylon} homeName={r.home} awayName={r.away} homeGoals={r.hg} awayGoals={r.ag}
                homeClubId={r.homeId} awayClubId={r.awayId} youSide={null} homeScorers={r.hs || undefined} awayScorers={r.as || undefined}
                onPress={() => openMdDetail(r, historyFor(domHistory), 'Domestic Season', 2025)} />
            ))}
            <RoundTeam roles={nylon} roundKey={`dom-${historyFor(domHistory)}`} label={`Team of matchday ${historyFor(domHistory)}`}
              poolByClub={domPoolRef.current} ctx={domLineupCtxRef.current}
              fixtures={shown.map(r => ({
                  homeClubId: r.homeId, awayClubId: r.awayId, homeClubName: r.home, awayClubName: r.away,
                  homeGoals: r.hg, awayGoals: r.ag, scorers: r.scorers, seed: r.seed,
                }))} />
            </>
          )}
        </KitScreen>
        <ThumbBar>
          <View style={styles.kitControls}>
            <Chips<Speed> roles={nylon} label="Speed" value={speed} onChange={setSpeed}
              options={[{ id: 'slow', label: 'Slow' }, { id: 'normal', label: 'Normal' }, { id: 'fast', label: 'Fast' }]} />
            <View style={{ flex: 1 }} />
            <SkipPlate label="Skip to the last day" consequence={`The rest of your ${mine.name} season is played at once.`}
              pause={() => setIsPlaying(false)} run={() => domSkipRef.current()} />
          </View>
          <Plate label={isPlaying ? 'Pause' : atSplitPause ? 'Play the split' : `Play matchday ${Math.min(domMD + 1, domTotalMDs)}`}
            icon={isPlaying ? 'pause' : 'play'} roles={nylon} onPress={() => setIsPlaying(p => !p)} />
        </ThumbBar>
        {modals}
      </View>
    )
  }

  // ── Phase: domestic result ────────────────────────────────────────────────
  if (phase === 'domestic_result') {
    const pos = domesticFinish ?? 0
    const qualified = !!entry
    const into = entry ? EUROPE[entry.comp].name : ''
    const berthText = !qual ? 'Resolving Europe.'
      : entry
        ? `${entry.viaCup ? 'As cup winners: the ' : 'The '}${into}, ${entry.round === 'league_phase' ? 'straight into the league phase.' : `from the ${QUAL_ROUND_LABEL[entry.round].toLowerCase()} (${PATH_LABEL[entry.path]}).`}`
        : 'No European football this season.'
    const cupLine = yourCup
      ? (yourCup.clubId === playerClubId ? `You won the ${cupNameForCountry(mine.country)}.` : `${yourCup.clubName} won the ${cupNameForCountry(mine.country)}.`)
      : null
    const table = domPlayerTableRef.current
    return (
      <View style={[styles.container, { backgroundColor: nylon.bg }]}>
        <Road phase={phase} />
        <KitScreen ground="nylon" underHeader>
          <StampLabel roles={nylon} good={qualified} sub={berthText}
            text={pos === 1 ? `${mine.name} champions` : `Finished ${ordinalOf(pos)}`} />
          {cupLine && <KitText t="body" color={nylon.textMuted}>{cupLine}</KitText>}
          {table && (
            <>
              <SectionTag roles={nylon}>{`${mine.name} · final table`}</SectionTag>
              <LeagueTable roles={nylon} zones={domZones}
                breakAfter={domSplitSize > 0 ? domSplitSize : undefined} breakLabel="Relegation / Europe group"
                rows={table.standings.map(r => ({
                  clubId: r.clubId, clubName: r.clubName, isPlayer: r.clubId === playerClubId,
                  played: r.played, gd: r.goalsFor - r.goalsAgainst, points: r.points,
                }))} />
              <ZoneLegend roles={nylon} zones={domZones} />
            </>
          )}
        </KitScreen>
        <ThumbBar>
          <Plate label={!qual ? 'Resolving Europe' : qualified ? "See the rest of Europe" : 'See who took your place'}
            icon="forward" roles={nylon} disabled={!qual} missingStep="Resolving Europe"
            onPress={() => setPhase('world_sim')} />
        </ThumbBar>
        {modals}
      </View>
    )
  }

  // ── Phase: Europe's seasons ───────────────────────────────────────────────
  if (phase === 'world_sim') {
    const visible = tables.slice(0, worldRevealed)
    const done = worldRevealed >= tables.length
    return (
      <View style={[styles.container, { backgroundColor: nylon.bg }]}>
        <Road phase={phase} />
        <KitScreen ground="nylon" underHeader>
          <KitText t="superM" color={nylon.text} accessibilityRole="header">EUROPE IS DONE</KitText>
          <KitText t="bodyL" color={nylon.textMuted}>{`Every league played out for real. ${visible.length} of ${tables.length} in.`}</KitText>
          <SectionTag roles={nylon}>The champions</SectionTag>
          {visible.map(t => (
            <LeagueRow key={t.rank} roles={nylon} table={t} yours={t.rank === mine.rank} onPress={() => openLeagueTable(t, playerClubId)} />
          ))}
          {/* P8-52: the rest of the ceremony, once every league is in. */}
          {done && europe && (
            <>
              <SectionTag roles={nylon}>The holders</SectionTag>
              {europe.holders.map(h => (
                <ListRow key={h.comp} roles={nylon} label={h.clubName}
                  value={`${EUROPE[h.comp].short} holders${h.playsIn ? ` · in the ${EUROPE[h.playsIn].short}` : ''}`} />
              ))}
              <KitText t="body" color={nylon.textMuted}>A holder never defends in the same competition: the Europa League's go up into the Champions League, the Conference League's into the Europa League.</KitText>
              <SectionTag roles={nylon}>The cups</SectionTag>
              <KitText t="body" color={nylon.textMuted}>Every cup winner goes to the Europa League or the Conference League. One already in on league position passes the place down the table.</KitText>
              {europe.cups.map(c => (
                <ListRow key={c.rank} roles={nylon} label={c.clubId === playerClubId ? `${c.clubName} (you)` : c.clubName}
                  value={cupNameForCountry(c.country)} />
              ))}
            </>
          )}
        </KitScreen>
        <ThumbBar>
          <Plate label={done ? (notQualified ? 'See your verdict' : 'To the qualifiers') : 'Reveal them all'}
            icon="forward" roles={nylon}
            onPress={() => {
              setWorldRevealed(tables.length)
              if (done) {
                if (notQualified) { handleOutOfEurope('not_qualified'); return }
                setPhase('qualifying')
              }
            }} />
        </ThumbBar>
        {modals}
      </View>
    )
  }

  // ── Phase: qualifying ─────────────────────────────────────────────────────
  if (phase === 'qualifying') {
    // The WHOLE current round stays hidden until your own tie's live watch
    // finishes — not just your row (maintainer feedback: the rest of the round
    // spoiled itself immediately).
    const revealed = (qual?.ties ?? []).filter(t => {
      const idx = qualRoundsWithTies.indexOf(t.round)
      if (idx < qualRoundIdx) return true
      if (idx === qualRoundIdx) return !waitingOnLiveQual
      return false
    })
    // P8-52: three ladders at once is some two hundred ties; one at a time,
    // yours first (the one your latest tie was in).
    const yourLatest = [...revealed].reverse().find(t => t.teamA.clubId === playerClubId || t.teamB?.clubId === playerClubId)
    const ladder = qualComp ?? yourLatest?.comp ?? entry?.comp ?? 'ucl'
    const visibleTies = revealed.filter(t => (t.comp ?? 'ucl') === ladder)
    return (
      <View style={[styles.container, { backgroundColor: nylon.bg }]}>
        <Road phase={phase} />
        <KitScreen ground="nylon" underHeader>
          <KitText t="superM" color={nylon.text} accessibilityRole="header">QUALIFYING</KitText>
          <KitText t="bodyL" color={nylon.textMuted}>Two legs a tie. Losers drop into the competition below. Tap any tie for its legs, extra time and shootout.</KitText>
          <SegmentSwitch<EuroComp> roles={nylon} value={ladder} onChange={setQualComp} options={(['ucl', 'uel', 'uecl'] as EuroComp[]).map(c => ({ id: c, label: EUROPE[c].short }))} />
          {waitingOnLiveQual && liveQualMatch && currentQualRound && (
            <View style={{ gap: space[2], marginTop: space[3] }}>
              <SectionTag roles={nylon}>
                {`${playerQualTie?.comp ? `${EUROPE[playerQualTie.comp].short} · ` : ''}${QUAL_ROUND_LABEL[currentQualRound]}${playerQualTie ? ` · ${PATH_LABEL[playerQualTie.path]}` : ''}`}
              </SectionTag>
              <LiveMatch
                teamA={liveQualMatch.teamA} teamB={liveQualMatch.teamB}
                periods={periodsForTwoLegTie(liveQualMatch)}
                pens={liveQualMatch.aPens !== undefined ? { a: liveQualMatch.aPens, b: liveQualMatch.bPens ?? 0, kicksA: liveQualMatch.penKicksA, kicksB: liveQualMatch.penKicksB } : null}
                aggregate
                onDone={() => {
                  setJustDecidedQualTie(playerQualTie)
                  setLiveQualDone(d => ({ ...d, [currentQualRound]: true }))
                }}
              />
            </View>
          )}
          <QualifyingLadder ties={visibleTies} justDecidedTie={justDecidedQualTie ?? undefined} onTiePress={t => {
            const m = qualTieToKoMatch(t)
            if (m) openKoTie(m, { ...koOpts, label: `${EUROPE[t.comp ?? 'ucl'].short} · ${QUAL_ROUND_LABEL[t.round]} · ${PATH_LABEL[t.path]}` })
          }} />
        </KitScreen>
        <ThumbBar>
          <Plate label="Skip to the end of qualifying" icon="skip" variant="secondary" roles={nylon}
            onPress={() => { setLiveQualDone(Object.fromEntries(qualRoundsWithTies.map(r => [r, true]))); setQualRoundIdx(qualRoundsWithTies.length) }} />
        </ThumbBar>
        {modals}
      </View>
    )
  }

  // ── Phase: qualifying resolved ────────────────────────────────────────────
  if (phase === 'quali_result') {
    const playerHadTies = qual?.ties.some(t => t.teamA.clubId === playerClubId || t.teamB?.clubId === playerClubId)
    const exitTie = [...(qual?.ties ?? [])].reverse().find(t => t.teamA.clubId === playerClubId || t.teamB?.clubId === playerClubId)
    const exitKey = exitTie ? (Object.entries(QUAL_EXIT_ROUND).find(([, r]) => r === exitTie.round)?.[0] as CLSeasonResult['playerFinalRound'] | undefined) : undefined
    const through = playerReachedLeaguePhase
    return (
      <View style={[styles.container, { backgroundColor: nylon.bg }]}>
        <Road phase={phase} />
        <KitScreen ground="nylon" underHeader>
          <StampLabel roles={nylon} good={through}
            text={through ? (playerHadTies ? `Into the ${comp.name}` : 'The field is set') : `Out in ${exitTie ? QUAL_ROUND_LABEL[exitTie.round].toLowerCase() : 'qualifying'}`}
            sub={through
              ? (playerHadTies
                  ? `${entry && entry.comp !== comp.id ? `You dropped from the ${EUROPE[entry.comp].name} and came through. ` : 'You came through qualifying. '}36 clubs, ${comp.matchdays} games${comp.perPot === 1 ? ', one from each of six pots' : ''}; the top eight go straight to the round of 16.`
                  : 'Your league finish put you straight into the league phase. The ladder only decided who joins you.')
              : `Out of the ${comp.name}, and there's nowhere lower to drop. Its league phase goes on without you.`} />
          {qual && (playerHadTies || !through) && (
            // Your own ties wherever they were, and the ladder of the competition you're in.
            <QualifyingLadder ties={runQualTies(qual, playerClubId)} onTiePress={t => {
              const m = qualTieToKoMatch(t)
              if (m) openKoTie(m, { ...koOpts, label: `${EUROPE[t.comp ?? 'ucl'].short} · ${QUAL_ROUND_LABEL[t.round]} · ${PATH_LABEL[t.path]}` })
            }} />
          )}
        </KitScreen>
        <ThumbBar>
          {through
            ? <Plate label="To the league phase" icon="forward" roles={nylon} onPress={() => setPhase('review')} />
            : <Plate label="See how it ends" icon="forward" roles={nylon} onPress={() => handleOutOfEurope(exitKey ?? 'q1_exit')} />}
        </ThumbBar>
        {modals}
      </View>
    )
  }

  // ── Phase: league phase review ────────────────────────────────────────────
  if (phase === 'review') {
    const playerTeam = clTeamsLocal.find(t => t.isPlayer)
    const yourEight = fixtures.filter(f => f.home.isPlayer || f.away.isPlayer).sort((a, b) => a.matchday - b.matchday)
    return (
      <View style={[styles.container, { backgroundColor: nylon.bg }]}>
        <Road phase={phase} />
        <KitScreen ground="nylon" underHeader>
          <KitText t="superM" color={nylon.text} accessibilityRole="header">THE LEAGUE PHASE</KitText>
          <KitText t="tag" color={nylon.textMuted}>{comp.fullName}</KitText>
          <KitText t="tag" color={nylon.textMuted}>
            {`${playerTeam?.clubName ?? ''} · OVR ${playerTeam?.ovr ?? 0} · POT ${playerTeam?.pot ?? '-'} · ${clTeamsLocal.length} clubs`}
          </KitText>
          {lpDraw && (
            // P8-114: the draw first, then your eight by matchday once it's done.
            <LeaguePhaseDraw roles={nylon} teams={clTeamsLocal} draw={lpDraw} countryOf={countryOfClub} after={(
              <>
                <SectionTag roles={nylon}>{comp.matchdays === 6 ? 'Your six' : 'Your eight'}</SectionTag>
                {yourEight.map(f => (
                  <FixtureRow key={f.matchday} roles={nylon} matchday={f.matchday} home={f.home.isPlayer}
                    opponent={(f.home.isPlayer ? f.away : f.home).clubName} pot={(f.home.isPlayer ? f.away : f.home).pot} you={(f.home.isPlayer ? f.home : f.away).clubName}
                    when={kickoffFor({ label: `League Phase · MD ${f.matchday}`, yearStart: clYear ?? 2025, homeClubId: f.home.clubId, awayClubId: f.away.clubId })?.short} />
                ))}
                <ZoneLegend roles={nylon} zones={CL_PHASE_ZONES} />
              </>
            )} />
          )}
        </KitScreen>
        <ThumbBar>
          <Plate label="Start the league phase" icon="play" roles={nylon} onPress={() => { setPhase('simulating'); setIsPlaying(true) }} />
        </ThumbBar>
        {modals}
      </View>
    )
  }

  // ── Phase: league phase ───────────────────────────────────────────────────
  if (phase === 'simulating') {
    const standings = sortStandings(clTeamsLocal)
    const youPos = standings.findIndex(t => t.isPlayer) + 1
    const shown = resultsOf(lpHistory)
    const yourResult = shown.find(r => r.playerHome || r.playerAway)
    const others = shown.filter(r => !(r.playerHome || r.playerAway))
    const lpMarks: Mark[] = lpHistory.map(md => {
      const yours = md.find(r => r.playerHome || r.playerAway)
      return yours ? markOf(yours.playerHome, yours.hg, yours.ag) : null
    }).filter((m): m is Mark => !!m)
    return (
      <View style={[styles.container, { backgroundColor: nylon.bg }]}>
        <Road phase={phase} />
        <KitScreen ground="nylon" underHeader>
          <KitText t="tag" color={nylon.textMuted}>{`${comp.name} · league phase · ${clTeamsLocal.length} clubs · MD ${Math.min(currentMD - 1, totalMatchdays)}/${totalMatchdays}`}</KitText>
          {youPos > 0 && (
            <StandingFigure roles={nylon} pos={youPos} delta={null}
              zone={CL_PHASE_ZONES[youPos - 1] ?? null} points={standings[youPos - 1]?.stats.points ?? 0} />
          )}
          <SeasonStrip roles={nylon} marks={lpMarks} total={totalMatchdays} viewing={mdView} onPick={md => { setMdView(md); if (md != null) setIsPlaying(false) }} />
          {mdView != null && <BackToLive md={mdView} onPress={() => setMdView(null)} />}
          {yourResult && (
            <ScorelineCard roles={nylon} label={[`MD ${historyFor(lpHistory)}`, kickoffFor({ label: `League Phase · MD ${historyFor(lpHistory)}`, yearStart: clYear ?? 2025, homeClubId: yourResult.homeId, awayClubId: yourResult.awayId })?.short].filter(Boolean).join(' · ')}
              homeName={yourResult.home} awayName={yourResult.away} homeClubId={yourResult.homeId} awayClubId={yourResult.awayId}
              homeGoals={yourResult.hg} awayGoals={yourResult.ag} youHome={yourResult.playerHome}
              homeScorers={yourResult.hs || undefined} awayScorers={yourResult.as || undefined}
              onPress={() => openMdDetail(yourResult, historyFor(lpHistory), 'League Phase', clYear ?? 2025)}
              footer={<ManOfTheMatch roles={nylon} req={mdRequest(yourResult, clYear ?? 2025)} />} />
          )}
          <SegmentSwitch<'table' | 'results'> roles={nylon} value={lpTab} onChange={setLpTab} options={[
            { id: 'table', label: 'Table' },
            { id: 'results', label: `Results MD ${historyFor(lpHistory)}` },
          ]} />
          {lpTab === 'table' ? (
            <>
              <LeagueTable roles={nylon} zones={CL_PHASE_ZONES}
                rows={withMoves(standings.map(simRow), lpOrdersRef.current[lpOrdersRef.current.length - 2])} />
              <ZoneLegend roles={nylon} zones={CL_PHASE_ZONES} />
            </>
          ) : others.length === 0 ? (
            <KitText t="body" color={nylon.textMuted} style={{ paddingVertical: space[3] }}>No other results yet.</KitText>
          ) : (
            <>
            {others.map((r, i) => (
              <ResultRow key={i} roles={nylon} homeName={r.home} awayName={r.away} homeGoals={r.hg} awayGoals={r.ag}
                homeClubId={r.homeId} awayClubId={r.awayId} youSide={null} homeScorers={r.hs || undefined} awayScorers={r.as || undefined}
                onPress={() => openMdDetail(r, historyFor(lpHistory), 'League Phase', clYear ?? 2025)} />
            ))}
            <RoundTeam roles={nylon} roundKey={`lp-${historyFor(lpHistory)}`} label={`Team of matchday ${historyFor(lpHistory)}`}
              poolByClub={poolByClubRef.current} ctx={lineupCtxRef.current}
              fixtures={shown.map(r => ({
                  homeClubId: r.homeId, awayClubId: r.awayId, homeClubName: r.home, awayClubName: r.away,
                  homeGoals: r.hg, awayGoals: r.ag, scorers: r.scorers, seed: r.seed,
                }))} />
            </>
          )}
        </KitScreen>
        <ThumbBar>
          {currentMD > totalMatchdays ? (
            // The league phase is over: the final table stays until you go on.
            <Plate label="To the knockouts" icon="forward" roles={nylon}
              onPress={() => { if (lpFinishingRef.current) return; lpFinishingRef.current = true; void finishLeaguePhase() }} />
          ) : (
            <>
              <View style={styles.kitControls}>
                <Chips<Speed> roles={nylon} label="Speed" value={speed} onChange={setSpeed}
                  options={[{ id: 'slow', label: 'Slow' }, { id: 'normal', label: 'Normal' }, { id: 'fast', label: 'Fast' }]} />
                <View style={{ flex: 1 }} />
                <SkipPlate label="Skip to the last matchday" consequence={`Matchdays ${currentMD} to ${totalMatchdays} are played at once.`}
                  pause={() => setIsPlaying(false)} run={() => lpSkipRef.current()} />
              </View>
              <Plate label={isPlaying ? 'Pause' : `Play matchday ${currentMD}`}
                icon={isPlaying ? 'pause' : 'play'} roles={nylon} onPress={() => setIsPlaying(p => !p)} />
            </>
          )}
        </ThumbBar>
        {modals}
      </View>
    )
  }

  // ── Phase: the bracket, before a ball is kicked ───────────────────────────
  if (koVisibleCount === 0 && koRounds.length > 0) {
    const startIdx = Math.max(0, koRounds.findIndex(r => r.ties.some(t => t.teamA.isPlayer || t.teamB.isPlayer)))
    const first = koRounds[startIdx]
    return (
      <View style={[styles.container, { backgroundColor: nylon.bg }]}>
        <Road phase="knockout_phase" />
        <BracketPreview
          firstLabel={first.label}
          firstTies={first.ties.map(t => ({ teamA: t.teamA, teamB: t.teamB }))}
          road={koRounds.slice(startIdx + 1).map(r => ({ label: r.label, count: r.ties.length }))}
          onStart={() => setKoVisibleCount(1)}
        />
        {modals}
      </View>
    )
  }

  // ── Phase: the knockouts ──────────────────────────────────────────────────
  const visibleRounds = koRounds.slice(0, koVisibleCount)
  const allRevealed = koVisibleCount >= koRounds.length
  const nextRound = koRounds[koVisibleCount]

  // §7 — the Deep Match, offered only when YOUR side made the final.
  const koFinalIdx = koRounds.findIndex(r => r.round === 'final')
  const koFinal = koFinalIdx >= 0 ? koRounds[koFinalIdx] : undefined
  const playerFinalTie = koFinal?.ties.find(t => t.teamA.isPlayer || t.teamB.isPlayer) ?? null
  const atFinal = koFinalIdx >= 0 && koVisibleCount - 1 >= koFinalIdx
  // P8-94: the skip plays to the end of YOUR run and stops there, settled —
  // the round you went out in, or your final (still to be watched). The old
  // "Skip to the final" appeared only when you were going to reach it.
  const endOfRun = koRounds.reduce((k, r, i) => (r.ties.some(t => t.teamA.isPlayer || t.teamB.isPlayer) ? i : k), -1)
  const awaitingDeepFinal = !!playerFinalTie && atFinal && !deepFinalWatched

  const revealThrough = (idx: number) => {
    setLiveDone(Object.fromEntries(koRounds.slice(0, idx + 1).map(r => [r.round, true])))
    setKoVisibleCount(idx + 1)
  }

  const openCustomDeepFinal = () => {
    if (!koFinal || !playerFinalTie) return
    // A final is one match, which koLegDetailRequest reads off leg1* — the same
    // request the result screen builds, so both replay the same sheet.
    const detail = koLegDetailRequest(playerFinalTie, 1, {
      label: koFinal.label, yearStart: clYear ?? 2025,
      playerClubId: playerClubId ?? undefined, drafted: draftedPlayers, playerFormation: formation ?? undefined,
    })
    if (!detail) return
    openDeepMatch({
      detail: { ...detail, playerFormation: formation ?? undefined },
      competitionLabel: comp.fullName,
      roundLabel: koFinal.label,
      accent: CL.accent,
      playerWon: playerFinalTie.winner.isPlayer,
      playerClubName: (playerFinalTie.teamA.isPlayer ? playerFinalTie.teamA : playerFinalTie.teamB).clubName,
      onFinished: () => { setDeepFinalWatched(true); commitFinalResult() },
      resultRoute: '/game/awards?to=cucl',
    })
  }

  return (
    <View style={[styles.container, { backgroundColor: nylon.bg }]}>
      <Road phase="knockout_phase" />
      <KitScreen ground="nylon" underHeader scrollRef={koScrollRef} scrollEventThrottle={64}
        onScroll={e => setKoAway(e.nativeEvent.contentOffset.y > KO_AWAY_PX)}>
        <View style={styles.kitHeadRow}>
          <KitText t="tag" color={nylon.textMuted} style={{ flex: 1 }}>{`${comp.fullName} · Knockouts`}</KitText>
          {leaguesButton}
        </View>
        {/* P8-91: the whole bracket, mid-round, as it stands. */}
        <Plate label="See the bracket" icon="ranks" variant="secondary" roles={nylon} style={{ marginTop: space[2], marginBottom: space[3] }} onPress={() => {
          const current = koRounds[koVisibleCount - 1]
          const liveOpen = !!current && current.ties.some(t => t.teamA.isPlayer || t.teamB.isPlayer) && !liveDone[current.round]
          const b = liveBracket(koRounds, { visible: koVisibleCount, liveOpen, progress: liveProgress() ?? 0, yearStart: clYear ?? 2025 })
          openSheet({
            title: 'The bracket', sub: liveOpen ? `${comp.fullName} · scores as they stand` : comp.fullName,
            render: () => <BracketTree columns={b.columns} third={b.third} playerClubId={playerClubId} />,
          })
        }} />
        {!allRevealed && nextRound && (
          <KitText t="body" color={nylon.textMuted} style={{ paddingVertical: space[3] }}>
            {nextRound.ties.some(t => t.teamA.isPlayer || t.teamB.isPlayer)
              ? `Your ${nextRound.label.toLowerCase()} is next.`
              : `Next: the ${nextRound.label.toLowerCase()}.`}
          </KitText>
        )}
        {visibleRounds.map((r, ri) => ({ r, ri })).reverse().map(({ r, ri }) => {
          const isLatest = ri === visibleRounds.length - 1
          const playerTie = r.ties.find(m => m.teamA.isPlayer || m.teamB.isPlayer)
          const watchLive = isLatest && playerTie && !liveDone[r.round]
          const isDeepFinal = r.round === 'final' && !!playerFinalTie
          const others = r.ties.filter(m => !(m.teamA.isPlayer || m.teamB.isPlayer))
          const settled = playerTie && !watchLive && !(isDeepFinal && !deepFinalWatched)
          const fate = settled && playerTie
            ? (playerTie.winner.isPlayer ? null : (KO_OUT[r.round] ?? `Out in the ${r.label.toLowerCase()}`))
            : null
          return (
            <View key={r.round} style={styles.kitRound}>
              <View style={styles.kitHeadRow}>
                <SectionTag roles={nylon}>{r.label}</SectionTag>
                {r.round === 'playoff' && <InfoBubble topic="knockout_playoff" size={15} />}
              </View>

              {isDeepFinal && !deepFinalWatched ? (
                <View style={[styles.kitFinalCard, { borderColor: nylon.line, backgroundColor: nylon.surface }]}>
                  <KitText t="superM" color={nylon.text}>THE FINAL</KitText>
                  <KitText t="title" color={nylon.text}>{`${playerFinalTie!.teamA.clubName} v ${playerFinalTie!.teamB.clubName}`}</KitText>
                  <KitText t="body" color={nylon.textMuted}>One match, played out in full, minute by minute. You only get to watch it once.</KitText>
                </View>
              ) : watchLive && playerTie ? (
                <LiveMatch
                  teamA={playerTie.teamA} teamB={playerTie.teamB}
                  periods={playerTie.leg1 ? periodsForTwoLegTie(playerTie) : [{ label: r.label, homeId: playerTie.teamA.clubId, awayId: playerTie.teamB.clubId, fromMin: 0, toMin: playerTie.extraTime ? 120 : 90, scorers: playerTie.leg1Scorers }]}
                  pens={playerTie.aPens !== undefined ? { a: playerTie.aPens, b: playerTie.bPens ?? 0, kicksA: playerTie.penKicksA, kicksB: playerTie.penKicksB } : null}
                  aggregate={!!playerTie.leg1}
                  onDone={() => setLiveDone(d => ({ ...d, [r.round]: true }))}
                  hold={koAway}
                />
              ) : null}

              {settled && playerTie && (
                <TieCard roles={nylon} label={r.label} tone={playerTie.winner.isPlayer ? 'win' : 'loss'}
                  tie={{ ...clTieToVM(playerTie, () => openKoTie(playerTie, { ...koOpts, label: r.label })), isPlayerTie: false,
                         note: playerTie.winner.isPlayer ? 'THROUGH' : 'OUT' }} />
              )}
              {fate && <StampLabel roles={nylon} text={fate} good={false} />}

              {(!playerTie || settled) && others.map((m, i) => (
                <TieRow key={i} roles={nylon} tie={clTieToVM(m, () => openKoTie(m, { ...koOpts, label: r.label }))} />
              ))}
            </View>
          )
        })}
      </KitScreen>
      {koAway && (
        <View style={styles.toNewest} pointerEvents="box-none">
          <BackToLive md={0} label="Back to the newest round" onPress={() => koScrollRef.current?.scrollTo({ y: 0, animated: true })} />
        </View>
      )}
      <ThumbBar>
        {!awaitingDeepFinal && endOfRun > koVisibleCount - 1 && <Plate label="Skip to the end of your run" icon="skip" variant="secondary" roles={nylon} onPress={() => revealThrough(endOfRun)} />}
        {!awaitingDeepFinal && endOfRun <= koVisibleCount - 1 && !allRevealed && <Plate label="Skip to the end" icon="skip" variant="secondary" roles={nylon} onPress={() => revealThrough(koRounds.length - 1)} />}
        {awaitingDeepFinal
          ? <Plate label="See the line-ups" icon="forward" roles={nylon} onPress={openCustomDeepFinal} />
          : allRevealed
          ? <Plate label="See your verdict" icon="forward" roles={nylon} onPress={finishAll} />
          : null}
      </ThumbBar>
      {modals}
    </View>
  )
}

const styles = StyleSheet.create({
  toNewest: { position: 'absolute', left: space[4], right: space[4], bottom: 120, alignItems: 'center' },
  kitLeagues: { borderWidth: 1, borderColor: '#F3F3F0', minHeight: 40, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  kitControls: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  kitHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kitRound: { gap: 8, marginTop: 12 },
  kitFinalCard: { borderWidth: 2, padding: 12, gap: 8 },

  container: { flex: 1, backgroundColor: colors.bg },
})
