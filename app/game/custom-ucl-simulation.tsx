import { compareStandings } from '@/engine/standings'
import { setLogContext } from '@/diag/log'
import { timeToFrame, timeAsync } from '@/diag/perf'
import { log } from '@/diag/log'

import { countryName } from '@/data/countries-sk'
import { t } from '@/i18n'
import { label } from '@/i18n/labels'
import { ordinal } from '@/lib/format'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { kickoffFor } from '@/engine/schedule'
import { RoundTeam } from '@/components/season/RoundTeam'
import { KnockoutStage, knockoutTieToCLMatch, clKnockoutRounds, type KnockoutRound } from '@/components/season/KnockoutStage'
import { usePauseOnBlur } from '@/hooks/usePauseOnBlur'
import { useIsFocused } from '@react-navigation/native'
import { TableStage } from '@/components/season/TableStage'
import { useStageLoop, playsLive } from '@/hooks/useStageLoop'
import { View, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { calcTeamOvr } from '@/engine/rating'
import { getSlotsForFormation } from '@/engine/formations'
import { setMatchTilt } from '@/engine/match'
import { resolveDifficulty } from '@/engine/difficulty'
import {
  buildCLTeams, drawCLLeaguePhase, simulateCLKnockoutsOnly, type CLTeam, type CLKnockoutMatch, type CLSeasonResult, type OtherCompetition, type CLLeagueMatch, type CLLeaguePhase,
} from '@/engine/cl-sim'
import { LeaguePhaseDraw } from '@/components/season/LeaguePhaseDraw'
import { withMoves, PressList } from '@/components/season/SeasonParts'
import { useCupPress } from '@/hooks/useCupPress'
import { cupPress, clPressStages, knockoutStages } from '@/engine/cup-press'
import { openStory } from '@/lib/runNav'
import { ManOfTheMatch } from '@/components/MatchStatsParts'
import { useUserStore } from '@/store/userStore'
import { sideName } from '@/engine/placement'
import {
  regularSeasonMatchdays, splitStage, FORMAT_SPECS, lockedFinalTable, playLiveMatch, sortLeagueTable, blankLeagueStats, simulateLeagueTableDetailed, type SimLeagueTable, type LiveMatchday, type LeagueFormat, type SimStandingRow,
} from '@/engine/cl-league-sim'
import { buildCLAccessList, ensureHolders, type AssociationEntry, type CLAccessList } from '@/engine/cl-access'
import type { QualTie, QualifyingResult } from '@/engine/cl-qualifying'
import {
  createAvailabilityLedger, type AvailabilityLedger,
} from '@/engine/availability'
import { getCustomUclAssociations, getEuropeHolders } from '@/db/queries/custom-ucl'
import type { EuroComp } from '@/data/uefa-coefficients'
import { runQualTies, otherCompetitions, resultWithoutYou, playEuropeanSeason } from '@/engine/europe-path'
import { nationalCupName, semisTwoLegged } from '@/data/national-cups'
import { planCup, playCupAfter, attributeCupScorers, type DomesticCup, type CupTie } from '@/engine/domestic-cup'
import { CupPane, CupNow } from '@/components/season/CupParts'
import { EUROPE } from '@/data/europe'
import { getRostersForClubs } from '@/db/queries/seasons'
import {
  loadLeaguePools, lineupCtxOf, attributeFixtureScorers, attributeCLResultScorers, attributeQualTieScorers, summariseScorers, attachCLShootoutNames,
} from '@/engine/run-stats'
import {
  clKnockoutAvailabilityHook,
} from '@/engine/knockout-availability'
import { randomSeed } from '@/lib/rng'
import { playFixture } from '@/engine/play-fixture'
import { openMatchStats } from '@/lib/matchStats'
import { matchRequest, leagueMatch, tieRequest, cupTieRequest, type MatchCtx } from '@/engine/stages'
import type { RosterPlayer } from '@/types/stats'
import type { SimTeam } from '@/types/simulation'
import { QualifyingLadder } from '@/components/QualifyingLadder'
import { LiveMatch, periodsForTwoLegTie, yourMatchPeriod, LIVE_MS_PER_MIN } from '@/components/LiveMatch'
import {
  openLeagueTable, openCupBracket, MarkRow, qualTieToKoMatch, berthZones, LeagueRow,
} from '@/components/CustomUclViewers'
import { useSimBackGuard } from '@/hooks/useSimBackGuard'
import { QUAL_ROUND_ORDER, QUAL_ROUND_LABEL, PATH_LABEL, QUAL_EXIT_ROUND } from '@/data/cl-qual-labels'
import { FORMAT_LABEL, FORMAT_EXPLAINER, isSpecialFormat } from '@/data/league-formats'
import { themeForComp, ROLES, colourwayFor } from '@/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  UCL_ROAD, YourFixtures, type YourFixture, LeagueTable, ZoneLegend, ScorelineCard, ResultRow, SegmentSwitch, FixtureRow, StampLabel, CL_PHASE_ZONES, type TableRowVM, type Mark,
} from '@/components/season/SeasonParts'
import { ThumbBar, CloseRun, askAbandon, StageControls } from '@/components/season/RunChrome'
import { useSettingsStore } from '@/store/settingsStore'
import { KitScreen, KitText, Plate, SectionTag, ClubName, RunHeader } from '@/components/kit'
import { useSizeClass } from '@/hooks/useSizeClass'
import { space } from '@/theme'
import { EVERYDAY } from '@/lib/appearance'
import { openPundits } from '@/lib/punditsHandoff'
import { predictTable, punditPanel, panelLineFor } from '@/engine/predictions'

// The page's ground (1 Oct: result screens follow light and dark too). These
// old styles named the dark ground's colours; they now take its roles.
const GR = ROLES[EVERYDAY]

// Where each phase sits on the five-stage road (07c C4).
const ROAD_STAGE: Record<string, number> = {
  loading: 0, domestic_review: 0, domestic_sim: 0, domestic_result: 0,
  world_sim: 1, qualifying: 2, quali_result: 2, review: 3, simulating: 3, knockout_phase: 4,
}


const simRow = (t: SimTeam): TableRowVM => ({
  clubId: t.clubId, clubName: t.clubName, isPlayer: t.isPlayer,
  played: t.stats.played, gd: t.stats.goalsFor - t.stats.goalsAgainst, points: t.stats.points,
})

function markOf(youHome: boolean, hg: number, ag: number): Mark {
  const mine = youHome ? hg - ag : ag - hg
  return mine > 0 ? 'W' : mine < 0 ? 'L' : 'D'
}

const ordinalOf = ordinal

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
    return compareStandings(a, b)
  })
}

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
  // Whose run every sheet opened from this screen belongs to. The knockouts
  // and the final used to pass your eleven without the bench, so with
  // substitutes on their sheets couldn't field your subs (step 3).
  const fpCtx = (yearStart: number): MatchCtx => ({
    yearStart, playerClubId: playerClubId ?? undefined, drafted: fullSquad, playerFormation: formation ?? undefined,
  })
  const mdMatch = (r: MDResult, md: number, label: string) => leagueMatch({
    matchday: md, home: { clubId: r.homeId, clubName: r.home }, away: { clubId: r.awayId, clubName: r.away },
    homeGoals: r.hg, awayGoals: r.ag, scorers: r.scorers, seed: r.seed,
    homeRotation: r.homeRotation, awayRotation: r.awayRotation, absent: r.absent, standIns: r.standIns,
  }, `${label} · Matchday ${md}`)
  const mdRequest = (r: MDResult, md: number, label: string, yearStart: number) => matchRequest(mdMatch(r, md, label), fpCtx(yearStart))
  // L-05: the domestic season's and the league phase's sheets carry their
  // timeline like every other mode's, so they show the table as it stood,
  // both sides' form and the next match. They used to carry none of it.
  const openMdDetail = (r: MDResult, md: number, label: string, yearStart: number) => {
    const history = label === 'League Phase' ? lpHistory : domHistory
    const timeline = history.flatMap((day, i) => day.map(x => mdMatch(x, i + 1, label)))
    openMatchStats(matchRequest(mdMatch(r, md, label), { ...fpCtx(yearStart), timeline }))
  }

  const [phase, setPhase] = useState<Phase>('loading')
  // §3 — active once the domestic season starts simulating; 'loading' and the
  // pre-kickoff 'domestic_review' squad screen have nothing decided yet.
  useSimBackGuard(phase !== 'loading' && phase !== 'domestic_review')
  const speed = useSettingsStore(s => s.speed)   // F-05: one setting, every stage
  const [isPlaying, setIsPlaying] = useState(false)
  const insets = useSafeAreaInsets()
  const wide = useSizeClass() === 'expanded'   // F-11: panes side by side (10-ADAPT §2.2)
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
  const domRegularRef = useRef(0)   // the regular season's matchdays (F-01's press stops at a split)
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
  const koCtx = fpCtx(clYear ?? 2025)
  // Which matchday's results are on screen (null = the latest), and which of
  // the two views each league is showing.
  const [mdView, setMdView] = useState<number | null>(null)
  const [domTab, setDomTab] = useState<'table' | 'results' | 'fixtures' | 'cup' | 'press'>('table')
  // P8.5-20: your association's cup, played through your season (rounds
  // between matchdays, as a league run's), where it used to be played headless
  // after it. The ref is the truth during a skip; the state is what draws.
  const domCupRef = useRef<DomesticCup | null>(null)
  const [domCup, setDomCup] = useState<DomesticCup | null>(null)
  const [lpTab, setLpTab] = useState<'table' | 'results' | 'fixtures' | 'press'>('table')
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
  // The knockouts: KnockoutStage reveals them (newest on top, held for your
  // live match, while you've scrolled away or another screen is on top).
  const [koRounds, setKoRounds] = useState<KnockoutRound[]>([])
  // P8.5-37: your cup's ties open their match sheets (the full path's season is 2025/26).
  const openCupTie = (t: CupTie, label: string) => domCupRef.current && openMatchStats(cupTieRequest(t, `${domCupRef.current.name} · ${label}`, fpCtx(2025)))
  // P8.5-15: the seed the pundits called your league from (null: not heard yet).
  const [domPunditSeed, setDomPunditSeed] = useState<number | null>(null)
  const finishedRef = useRef(false)
  const finalResultRef = useRef<CLSeasonResult | null>(null)
  // §7 R6 — the Deep Match final is watched exactly once; after that the tie
  // settles into the normal row and the results CTA appears.
  const [deepFinalWatched, setDeepFinalWatched] = useState(false)
  // P8-52: the competition your season goes on in, once Europe's summer is
  // played (the Champions League until then, and if you never qualified).
  const europe = qual?.europe ?? null
  // F-09 / D2: your match playing out live in the domestic season or the
  // league phase. The full path's tables move the moment a matchday is
  // played, so while it plays the table, the results and your form wait behind
  // "your match first", and the next matchday waits for it. Fast skips it.
  // One matchday loop per stage (useStageLoop): the domestic season's re-arms
  // on its matchday, its stage (a split league starts its second phase at 0)
  // and its tick; the league phase's ends when its last match does.
  const domLoop = useStageLoop({ running: phase === 'domestic_sim' && isPlaying, speed, step: playDomesticMD, tick: `${domStage}:${domMD}:${domTick}` })
  const lpLoop = useStageLoop({
    running: phase === 'simulating' && isPlaying, speed, step: simulateNextMD, tick: currentMD,
    onLiveDone: () => { if (currentMD > totalMatchdays) setIsPlaying(false) },
  })
  const fpLive: 'dom' | 'lp' | null = domLoop.liveMD != null ? 'dom' : lpLoop.liveMD != null ? 'lp' : null
  const fpLiveHistory = fpLive === 'dom' ? domHistory : fpLive === 'lp' ? lpHistory : null
  const fpLiveMd = fpLiveHistory?.length ?? 0
  const fpLiveResult = fpLiveHistory?.[fpLiveMd - 1]?.find(r => r.playerHome || r.playerAway)
  const fpLivePeriod = useMemo(() => fpLiveResult ? yourMatchPeriod({
    homeClubId: fpLiveResult.homeId, awayClubId: fpLiveResult.awayId, homeGoals: fpLiveResult.hg, awayGoals: fpLiveResult.ag,
    scorers: fpLiveResult.scorers, seed: fpLiveResult.seed, homeRotation: fpLiveResult.homeRotation, awayRotation: fpLiveResult.awayRotation,
    absent: fpLiveResult.absent, standIns: fpLiveResult.standIns,
  }, `${fpLive === 'dom' ? 'Domestic Season' : 'League Phase'} · Matchday ${fpLiveMd}`,
    (fpLive === 'dom' ? domPoolRef : poolByClubRef).current,
    { ...(fpLive === 'dom' ? domLineupCtxRef : lineupCtxRef).current, playerFormation: formation ?? undefined }) : null, [fpLiveResult])
  // F-12: the panel that called your league (P8.5-15), for its split on your
  // domestic match. The European stages have no panel: the pundits only call
  // the full path's league.
  const domPanel = useMemo(() => domPunditSeed != null
    ? punditPanel(domTeamsRef.current.map(x => ({ clubId: x.clubId, clubName: x.clubName, ovr: x.ovr, isPlayer: x.isPlayer })), domPunditSeed)
    : [], [domPunditSeed])
  const fpLiveDone = () => (fpLive === 'dom' ? domLoop : lpLoop).liveDone()
  const fpLiveMatch = (stage: 'dom' | 'lp') => fpLive === stage && fpLiveResult && fpLivePeriod ? (
    <>
    {stage === 'dom' && panelLineFor(domPanel, { clubId: fpLiveResult.homeId, clubName: fpLiveResult.home }, { clubId: fpLiveResult.awayId, clubName: fpLiveResult.away }) && (
      <KitText t="body" color={GR.textMuted}>{panelLineFor(domPanel, { clubId: fpLiveResult.homeId, clubName: fpLiveResult.home }, { clubId: fpLiveResult.awayId, clubName: fpLiveResult.away })}</KitText>
    )}
    <LiveMatch key={`${stage}-${fpLiveMd}`} periods={[fpLivePeriod]} onDone={fpLiveDone} hold={!isPlaying} msPerMin={LIVE_MS_PER_MIN[speed]}
      teamA={{ clubId: fpLiveResult.homeId, clubName: fpLiveResult.home }}
      teamB={{ clubId: fpLiveResult.awayId, clubName: fpLiveResult.away }} />
    </>
  ) : null
  // C-10 / F-10: the run's own header, as every other stage wears it, with
  // the road under it and the abandon control. The full path had a header of
  // its own (`Road`) and no way out short of finishing or closing the app. Its
  // colours follow the competition you play in (the road was always blue).
  const road = (p: string) => (
    <View style={{ paddingTop: insets.top + space[3], paddingHorizontal: space[4] }}>
      <RunHeader roles={GR} stage={6} back={false}
        colourway={colourwayFor(europe?.competition === 'uel' ? 'europa_league' : europe?.competition === 'uecl' ? 'conference_league' : 'champions_league_custom')}
        road={{ names: UCL_ROAD, current: ROAD_STAGE[p] ?? 0 }}
        right={p === 'loading' ? undefined : <CloseRun onPress={() => askAbandon(() => setIsPlaying(false))} />} />
    </View>
  )
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
      domRegularRef.current = domMatchdaysRef.current.length
      // The cup spreads over the regular season; a split league's second
      // stage starts once it's done, as the real cups finish before the splits.
      domCupRef.current = planCup(teams, domMatchdaysRef.current.length, randomSeed(), nationalCupName(mine.rank), semisTwoLegged(mine.rank))
      setDomCup(domCupRef.current)
      setPhase('domestic_review')
      // Domestic scorer pools (background — ready before the first matchday).
      loadLeaguePools(teams.map(t => ({ clubId: t.clubId, clubName: t.clubName, isPlayer: t.isPlayer })), fullSquad, 2025, useSubstitutes)
        .then(p => { domPoolRef.current = p.poolByClub; domLineupCtxRef.current = { playerClubId: p.playerClubId, benchSize: p.benchSize } })
        .catch(e => log.warn('sim', 'custom-ucl-sim: domestic pool load failed', e))
    }
    init()
  }, [])

  // ── Domestic matchday loop ──────────────────────────────────────────────────

  // The domestic table's order as it stands (split-aware, as the table draws it).
  function domOrderNow(): string[] {
    const t = domStage === 'split' ? lockedFinalTable(domTeamsRef.current, domSplitIdsRef.current) : sortLeagueTable(domTeamsRef.current)
    return t.map(x => x.clubId)
  }

  // P8.5-40, the domestic season's own: the last matchday played, by stage
  // (`${stage}:${index}`), so neither the timer nor the skip plays one twice.
  const domPlayedRef = useRef<Set<string>>(new Set())
  // Returns a number when your match in it plays live (useStageLoop).
  // Phase 9: timed to the frame that shows it (docs/diagnostics/03-BUDGETS.md §2.3).
  function playDomesticMD(): number | null { setLogContext(`league MD${domMD + 1}`); return timeToFrame('sim:matchday:league', playDomesticMDNow) }
  function playDomesticMDNow(): number | null {
    const plan = domMatchdaysRef.current
    if (domMD >= plan.length) { advanceDomesticStage(); return null }
    if (domPlayedRef.current.has(`${domStage}:${domMD}`)) return null
    domPlayedRef.current.add(`${domStage}:${domMD}`)
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
    if (domStage === 'regular' && domCupRef.current) {
      domCupRef.current = attributeCupScorers(playCupAfter(domCupRef.current, domMD + 1, domTeamsRef.current), domPoolRef.current, domLineupCtxRef.current)
      setDomCup(domCupRef.current)
    }
    domOrdersRef.current.push(domOrderNow())
    setDomHistory(h => [...h, results])
    setDomMD(n => n + 1)
    setDomTick(t => t + 1)
    return playsLive(results.some(r => r.playerHome || r.playerAway), speed) ? domHistory.length + 1 : null
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

  function skipDomesticSeason() { timeToFrame('sim:skip:league', skipDomesticSeasonNow) }
  function skipDomesticSeasonNow() {
    domLoop.clearLive()
    // Fast-forward: play every remaining matchday headlessly (stage-aware).
    setIsPlaying(false)
    const mine = playerAssocRef.current!
    let plan = domMatchdaysRef.current
    let md = domMD
    let stage = domStage
    for (;;) {
      for (; md < plan.length; md++) {
        if (domPlayedRef.current.has(`${stage}:${md}`)) continue
        domPlayedRef.current.add(`${stage}:${md}`)
        for (const [h, a] of plan[md]) playLiveMatch(h, a)
        if (stage === 'regular' && domCupRef.current) domCupRef.current = attributeCupScorers(playCupAfter(domCupRef.current, md + 1, domTeamsRef.current), domPoolRef.current, domLineupCtxRef.current)
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
    // Any cup round still due. The rounds fall on regular-season matchdays, so
    // they're normally all played by now; this is the safety net, round by
    // round (playCupAfter plays only the rounds due on the matchday it's given).
    if (domCupRef.current) {
      for (const r of domCupRef.current.rounds) {
        if (!r.played) domCupRef.current = attributeCupScorers(playCupAfter(domCupRef.current, r.afterMatchday, domTeamsRef.current), domPoolRef.current, domLineupCtxRef.current)
      }
      setDomCup(domCupRef.current)
    }
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
    // Phase 9: every other association's season, the cups and the ladders, in one go.
    timeAsync('sim:europe', () => resolveWorld(playerTable, pos))
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
    // A hunt (P8.5-39) plays like any season: it steered the draw, nothing here.
    const q = playEuropeanSeason(access, simulated, held, {
      seed: randomSeed(), playerClubId, yourCup: domCupRef.current ? { rank: playerTable.rank, cup: domCupRef.current } : null,
    })
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
    } catch (e) { log.warn('sim', 'custom-ucl-sim: qual scorer attribution failed', e) }
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
      .catch(e => log.warn('sim', 'custom-ucl-sim: pool load failed', e))
  }, [clTeamsLocal, playerReachedLeaguePhase])

  // P8.5-40: the last matchday actually played. A skip runs a frame after its
  // press (the waiting plate, P8.5-01), and the play timer already set for the
  // current matchday can fire in that frame: the skip then played the same
  // matchday again from its own (older) state, nine games in an eight-game
  // league phase. Both paths now play only past this.
  const lpPlayedRef = useRef(0)
  // Returns the matchday when your match in it plays live (useStageLoop).
  function simulateNextMD(): number | null { setLogContext(`ucl LP${currentMD}`); return timeToFrame('sim:matchday:ucl', simulateNextMDNow) }
  function simulateNextMDNow(): number | null {
    // P8-115: the league phase stops on its final table. It went straight on
    // to the knockouts, so the table you'd just finished was gone at once.
    if (currentMD > totalMatchdays) { setIsPlaying(false); return null }
    if (currentMD <= lpPlayedRef.current) return null
    lpPlayedRef.current = currentMD
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
    const live = playsLive(results.some(r => r.playerHome || r.playerAway), speed)
    if (currentMD === totalMatchdays && !live) setIsPlaying(false)
    setCurrentMD(md => md + 1)
    return live ? currentMD : null
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
  function skipUclLeaguePhase() { timeToFrame('sim:skip:ucl', skipUclLeaguePhaseNow) }
  function skipUclLeaguePhaseNow() {
    lpLoop.clearLive()
    setIsPlaying(false)
    const teams = [...clTeamsLocal]
    // Every skipped matchday's results are kept, as watching keeps them, so
    // the strip of your results and the results tab have all eight.
    const days: MDResult[][] = []
    for (let md = Math.max(currentMD, lpPlayedRef.current + 1); md <= totalMatchdays; md++) {
      lpPlayedRef.current = md
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
      } catch (e) { log.warn('sim', 'custom-ucl-sim: pool load failed', e) }
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
    } catch (e) { log.warn('sim', 'custom-ucl-sim: scorer attribution failed', e) }
    await revealKnockouts(result)
  }

  async function revealKnockouts(result: CLSeasonResult) {
    const allMatches: CLKnockoutMatch[] = [...result.playoffRound, ...result.r16, ...result.qf, ...result.sf, ...(result.final ? [result.final] : [])]
    // Fetch + attach named shootout kickers — ONE shared implementation used
    // by every mode (see attachCLShootoutNames in run-stats.ts).
    await attachCLShootoutNames(allMatches, playerClubId ?? undefined, fullSquad)
    finalResultRef.current = result
    const rounds = clKnockoutRounds(result,
      { playoff: 'Knockout Play-off (9th–24th)', r16: 'Round of 16', qf: 'Quarter-Finals', sf: 'Semi-Finals', final: 'Final' })
    setKoRounds(rounds)
    setPhase('knockout_phase')
  }

  // F-20: your league's season, every match, kept on the result so the run's
  // stats count it like every other stage. The screen used to keep only the
  // tables, so the season you opened the run with counted for nothing.
  const domesticMatchdays = (): CLLeagueMatch[] => domHistory.flatMap((day, i) => day.map(r => ({
    matchday: i + 1,
    home: { clubId: r.homeId, clubName: r.home, isPlayer: r.playerHome },
    away: { clubId: r.awayId, clubName: r.away, isPlayer: r.playerAway },
    homeGoals: r.hg, awayGoals: r.ag, scorers: r.scorers, seed: r.seed,
    homeRotation: r.homeRotation, awayRotation: r.awayRotation, absent: r.absent, standIns: r.standIns,
  })))

  // A split league's regular season length travels with the result (the press
  // stops there: cup-press.ts). Left out when the league didn't split.
  const domSplits = () => { const f = playerAssocRef.current?.format; return !!f && !!FORMAT_SPECS[f as LeagueFormat]?.split }
  const domesticRegular = () => (domSplits() && domRegularRef.current ? { domesticRegular: domRegularRef.current } : {})

  // F-01: the run's press so far: the domestic season, qualifying, the league
  // phase. Your live match holds its round back, as it holds the table.
  const pathStages = () => clPressStages({
    leaguePhaseStandings: clTeamsLocal,
    leagueMatchdays: leagueHistoryRef.current.filter(m => lpLoop.liveMD == null || m.matchday < lpLoop.liveMD),
    domesticMatchdays: domesticMatchdays().filter(m => domLoop.liveMD == null || m.matchday < domLoop.liveMD),
    ...domesticRegular(), playoffRound: [], r16: [], qf: [], sf: [], final: null,
  }, { knockouts: [], phaseMatchdays: totalMatchdays, qual, domesticTotal: domRegularRef.current || undefined })
  const pathPress = useCupPress(pathStages, () => availabilityRef.current?.absences(),
    [domHistory.length, domLoop.liveMD, leagueHistoryRef.current.length, lpLoop.liveMD, qual, clTeamsLocal.length])
  const pressPane = { id: 'press', label: t('season.tabPress'), count: pathPress.length, title: `${t('season.tabPress')} · ${pathPress.length}`,
    node: <PressList roles={GR} stories={pathPress} empty={t('sim.pressWait')} onOpen={openStory} /> }

  // Split in two so §7's Deep Match can commit the run WITHOUT this screen
  // navigating — it replaces itself with the result screen instead, so the
  // finished bracket never flashes up in between.
  function commitFinalResult() {
    if (finishedRef.current || !finalResultRef.current) return
    finishedRef.current = true
    setClResult({ ...finalResultRef.current, others: otherComps(), domesticMatchdays: domesticMatchdays(), ...domesticRegular() })
  }
  function finishAll() {
    if (finishedRef.current || !finalResultRef.current) return
    commitFinalResult()
    router.push('/game/awards')
  }

  // The two competitions you weren't in, and the one you missed, played out
  // headless (src/engine/europe-path.ts).
  const otherComps = (): OtherCompetition[] => qual?.europe ? otherCompetitions(qual.europe.fields, comp.id, countryOfClub) : []
  const buildNoPlayerResult = (finalRound: CLSeasonResult['playerFinalRound']): CLSeasonResult => resultWithoutYou({
    field: qual?.leaguePhaseField ?? [], comp: comp.id, countryOf: countryOfClub, ties: qual?.ties ?? [],
    playerClubId: playerClubId ?? null, clubName: mine?.clubs.find(c => c.clubId === playerClubId)?.clubName ?? t('path.yourClub'),
    ovr: totalTeamOvr, finalRound, competition: europe?.competition ?? undefined,
  })

  async function handleOutOfEurope(finalRound: CLSeasonResult['playerFinalRound']) {
    if (finishedRef.current) return
    finishedRef.current = true
    const result = { ...buildNoPlayerResult(finalRound), others: otherComps(), domesticMatchdays: domesticMatchdays(), ...domesticRegular() }
    try {
      const rosters = await getRostersForClubs(result.leaguePhaseStandings.map(t => t.clubId), clYear ?? 2025)
      attributeCLResultScorers(result, rosters, lineupCtxRef.current)
    } catch (e) { log.warn('sim', 'custom-ucl-sim: scorer attribution failed', e) }
    setClResult(result)
    router.push('/game/awards')
  }

  // ── Guards ──────────────────────────────────────────────────────────────────
  if (!formation || draftedPlayers.length === 0 || !playerClubId) {
    return (
      <View style={[styles.container, { backgroundColor: GR.bg, padding: space[4], justifyContent: 'center', gap: space[4] }]}>
        <KitText t="superM" color={GR.text}>{t('path.noRun')}</KitText>
        <KitText t="bodyL" color={GR.textMuted}>{t('path.lostSquad')}</KitText>
        <Plate label={t('sim.startNew')} roles={GR} onPress={() => router.replace('/game/mode-select')} />
      </View>
    )
  }

  // ── The road, on the everyday ground (docs/ui-overhaul/07c C4) ──────────────────────────
  // Every phase of the full path is the same screen: the road across the top,
  // one thing to read, and the next step in the thumb zone. The simulation
  // underneath is untouched.
  const domOrdered = domStage === 'split'
    ? lockedFinalTable(domTeamsRef.current, domSplitIdsRef.current)
    : sortLeagueTable(domTeamsRef.current)
  const domZones = mine ? berthZones(mine.rank, domOrdered.length) : []
  const domYouPos = domOrdered.findIndex(t => t.isPlayer) + 1
  // F-07: where you stood a matchday ago, from the order the table already
  // keeps for its own movement column; the figure passed null and showed none.
  const prevPos = (orders: string[][]) => {
    const i = orders.length >= 2 ? orders[orders.length - 2].indexOf(playerClubId ?? '') : -1
    return i >= 0 ? i + 1 : null
  }
  const moveFrom = (prev: number | null, pos: number) => (prev == null ? null : prev - pos)
  // F-08: your fixtures, played and to come. The domestic plan is the current
  // stage's (a split league plans its second phase when it gets there), and
  // its first matchday sits where the history stood when the stage began.
  const fixtureOf = (youHome: boolean, h: { clubName: string }, a: { clubName: string }, md: number, r?: MDResult) => ({
    matchday: md, home: youHome, you: (youHome ? h : a).clubName, opponent: (youHome ? a : h).clubName,
    result: r ? { mine: youHome ? r.hg : r.ag, theirs: youHome ? r.ag : r.hg } : undefined,
  })
  const domFixtureRows = (): YourFixture[] => {
    const offset = Math.max(0, domHistory.length - domMD)
    return domMatchdaysRef.current.flatMap((md, i) => md.filter(([h, a]) => h.isPlayer || a.isPlayer).map(([h, a]) =>
      fixtureOf(h.isPlayer, h, a, offset + i + 1, domHistory[offset + i]?.find(x => x.homeId === h.clubId && x.awayId === a.clubId))))
  }
  const lpFixtureRows = (): YourFixture[] => fixtures.filter(f => f.home.isPlayer || f.away.isPlayer)
    .sort((a, b) => a.matchday - b.matchday)
    .map(f => fixtureOf(f.home.isPlayer, f.home, f.away, f.matchday, lpHistory[f.matchday - 1]?.find(x => x.homeId === f.home.clubId && x.awayId === f.away.clubId)))
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
      <View style={[styles.container, { backgroundColor: GR.bg }]}>
        {road('loading')}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3], padding: space[4] }}>
          <KitText t="superM" color={GR.text}>{t('path.settingUp')}</KitText>
          <KitText t="bodyL" color={GR.textMuted}>{t('path.settingUpLead')}</KitText>
        </View>
      </View>
    )
  }

  const modals = (
    <>
    </>
  )

  // ── Phase: domestic review ────────────────────────────────────────────────
  if (phase === 'domestic_review') {
    const preview = [...domTeamsRef.current].sort((a, b) => b.ovr - a.ovr)
    return (
      <View style={[styles.container, { backgroundColor: GR.bg }]}>
        {road(phase)}
        <KitScreen ground={EVERYDAY} underHeader>
          <KitText t="superM" color={GR.text} accessibilityRole="header">{mine.name.toUpperCase()}</KitText>
          <KitText t="tag" color={GR.textMuted}>{t('path.domMeta', { country: countryName(mine.country), rank: mine.rank, count: preview.length })}</KitText>
          <KitText t="bodyL" color={GR.text} style={{ marginTop: space[2] }}>
            {t('path.fieldLead')}
          </KitText>
          {isSpecialFormat(mine.format) && mine.format && (
            <KitText t="body" color={GR.textMuted} style={{ marginTop: space[2] }}>
              {`${FORMAT_LABEL[mine.format as LeagueFormat]}: ${FORMAT_EXPLAINER[mine.format as LeagueFormat]}`}
            </KitText>
          )}
          <SectionTag roles={GR}>{t('path.theField')}</SectionTag>
          <LeagueTable roles={GR} strength zones={domZones}
            rows={preview.map(t => ({ ...simRow(t), ovr: t.ovr }))} />
          <ZoneLegend roles={GR} zones={domZones} />
        </KitScreen>
        <ThumbBar>
          {/* P8.5-15: the full path had no pundits. They call your league
              here, and the season starts from their screen ("Prove them wrong"). */}
          <Plate label={t('path.hearPundits')} icon="forward" roles={GR} onPress={() => openPundits({
            teams: domTeamsRef.current.map(t => ({ clubId: t.clubId, clubName: t.clubName, ovr: t.ovr, isPlayer: t.isPlayer })),
            yearStart: 2025,
            // L-16 / D5: the season waits for your first tap, as every stage does.
            onStart: seed => { setDomPunditSeed(seed); setPhase('domestic_sim') },
          })} />
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
      <View style={[styles.container, { backgroundColor: GR.bg }]}>
        {road(phase)}
        <KitScreen ground={EVERYDAY} underHeader width={wide ? 'wide' : 'column'}>
          <TableStage roles={GR} wide={wide} tab={domTab} onTab={id => setDomTab(id as typeof domTab)}
            meta={t('path.domRunMeta', { league: mine.name, stage: domStage === 'split' ? label(domStageLabelRef.current) : t('path.regularSeason'), md: playedMDs, total: domTotalMDs })}
            standing={domYouPos > 0 && fpLive !== 'dom' ? { pos: domYouPos, delta: moveFrom(prevPos(domOrdersRef.current), domYouPos), zone: domZones[domYouPos - 1] ?? null, points: domOrdered[domYouPos - 1]?.stats.points ?? 0 } : null}
            beforeStrip={atSplitPause ? (
              <KitText t="body" color={GR.text}>
                {`${label(domStageLabelRef.current)}. ${FORMAT_EXPLAINER[(mine.format ?? 'double_round_robin') as LeagueFormat] ?? ''}`}
              </KitText>
            ) : null}
            strip={{ marks: fpLive === 'dom' ? domMarks.slice(0, -1) : domMarks, total: domTotalMDs, viewing: mdView, latest: domHistory.length, onPick: md => { setMdView(md); if (md != null) setIsPlaying(false) } }}
            keys={{ playPause: () => setIsPlaying(p => !p) }}
            yourMatch={<>
          {fpLiveMatch('dom') ?? (yourResult && (
            <ScorelineCard roles={GR} label={[label(`MD ${historyFor(domHistory)}`), kickoffFor({ label: `Matchday ${historyFor(domHistory)}`, yearStart: 2025, homeClubId: yourResult.homeId, awayClubId: yourResult.awayId })?.short].filter(Boolean).join(' · ')}
              homeName={yourResult.home} awayName={yourResult.away} homeClubId={yourResult.homeId} awayClubId={yourResult.awayId}
              homeGoals={yourResult.hg} awayGoals={yourResult.ag} youHome={yourResult.playerHome}
              homeScorers={yourResult.hs || undefined} awayScorers={yourResult.as || undefined}
              onPress={() => openMdDetail(yourResult, historyFor(domHistory), 'Domestic Season', 2025)}
              footer={<ManOfTheMatch roles={GR} req={mdRequest(yourResult, historyFor(domHistory), 'Domestic Season', 2025)!} />} />
          ))}
            </>}
            afterMatch={<CupNow roles={GR} cup={domCup} md={historyFor(domHistory)} onTie={openCupTie} />}
            // The full path's table moves the moment a matchday is played, so while
            // your match plays the table and the round wait behind it.
            waiting={fpLive === 'dom'}
            panes={[
              { id: 'table', label: preSplit ? t('path.preSplitTable') : t('sim.tabTable'), flex: 1.4, node: <>
            <>
              {domStage === 'split' && domRegularSnapshotRef.current && (
                <Plate label={showRegularTable ? t('path.showLive') : t('path.showPreSplit')} variant="quiet"
                  roles={GR} onPress={() => setShowRegularTable(v => !v)} />
              )}
              <LeagueTable roles={GR} zones={domZones}
                breakAfter={preSplit ? undefined : (domSplitSize > 0 ? domSplitSize : undefined)}
                breakLabel={t('path.splitBreak')}
                rows={preSplit
                  ? domRegularSnapshotRef.current!.map(r => ({
                      clubId: r.clubId, clubName: r.clubName, isPlayer: r.clubId === playerClubId,
                      played: r.played, gd: r.goalsFor - r.goalsAgainst, points: r.points,
                    }))
                  : withMoves(domOrdered.map(simRow), domOrdersRef.current[domOrdersRef.current.length - 2])} />
              <ZoneLegend roles={GR} zones={domZones} />
            </>
              </> },
              { id: 'results', label: t('sim.tabResultsMd', { md: historyFor(domHistory) }), node: <>{others.length === 0 ? (
            <KitText t="body" color={GR.textMuted} style={{ paddingVertical: space[3] }}>{t('sim.noOtherResults')}</KitText>
            ) : (
            <>
            {others.map((r, i) => (
              <ResultRow key={i} roles={GR} homeName={r.home} awayName={r.away} homeGoals={r.hg} awayGoals={r.ag}
                homeClubId={r.homeId} awayClubId={r.awayId} youSide={null} homeScorers={r.hs || undefined} awayScorers={r.as || undefined}
                onPress={() => openMdDetail(r, historyFor(domHistory), 'Domestic Season', 2025)} />
            ))}
            <RoundTeam roles={GR} roundKey={`dom-${historyFor(domHistory)}`} label={t('sim.teamOfMd', { md: historyFor(domHistory) })}
              poolByClub={domPoolRef.current} ctx={domLineupCtxRef.current}
              fixtures={shown.map(r => ({
                  homeClubId: r.homeId, awayClubId: r.awayId, homeClubName: r.home, awayClubName: r.away,
                  homeGoals: r.hg, awayGoals: r.ag, scorers: r.scorers, seed: r.seed,
                }))} />
            </>
            )}</> },
              { id: 'fixtures', label: t('season.tabFixtures'), node: <YourFixtures roles={GR} rows={domFixtureRows()} /> },
              ...(domCup ? [{ id: 'cup', label: t('season.tabCup'), node: <CupPane roles={GR} cup={domCup} country={mine.country} playerClubId={playerClubId} onTie={openCupTie} /> }] : []),
              pressPane,
            ]} />
        </KitScreen>
        <ThumbBar>
          <StageControls roles={GR} skip={{ label: t('season.skipToLast'), consequence: t('path.skipSeason', { league: mine.name }),
            pause: () => setIsPlaying(false), run: () => domSkipRef.current() }} />
          <Plate label={isPlaying ? t('sim.pause') : atSplitPause ? t('path.playSplit') : t('sim.playMd', { md: Math.min(domMD + 1, domTotalMDs) })}
            icon={isPlaying ? 'pause' : 'play'} roles={GR} onPress={() => setIsPlaying(p => !p)} />
        </ThumbBar>
        {modals}
      </View>
    )
  }

  // ── Phase: domestic result ────────────────────────────────────────────────
  if (phase === 'domestic_result') {
    const pos = domesticFinish ?? 0
    const domPunditCall = domPunditSeed != null
      ? predictTable(domTeamsRef.current.map(t => ({ clubId: t.clubId, clubName: t.clubName, ovr: t.ovr, isPlayer: t.isPlayer })), domPunditSeed).player?.predicted ?? null
      : null
    const qualified = !!entry
    const into = entry ? EUROPE[entry.comp].name : ''
    const berthText = !qual ? t('path.resolving')
      : entry
        ? t(entry.viaCup ? 'path.berthCup' : 'path.berth', { comp: into })
          + (entry.round === 'league_phase' ? t('path.straightIn') : t('path.fromRound', { round: label(QUAL_ROUND_LABEL[entry.round]).toLowerCase(), path: label(PATH_LABEL[entry.path]) }))
        : t('path.noEurope')
    const cupLine = yourCup
      ? (yourCup.clubId === playerClubId ? t('path.youWonCup', { cup: nationalCupName(mine.rank) }) : t('path.clubWonCup', { club: yourCup.clubName, cup: nationalCupName(mine.rank) }))
      : null
    const table = domPlayerTableRef.current
    return (
      <View style={[styles.container, { backgroundColor: GR.bg }]}>
        {road(phase)}
        <KitScreen ground={EVERYDAY} underHeader>
          <StampLabel roles={GR} good={qualified} sub={berthText}
            text={pos === 1 ? t('path.champions', { league: mine.name }) : t('path.finished', { place: ordinalOf(pos) })} />
          {cupLine && <KitText t="body" color={GR.textMuted}>{cupLine}</KitText>}
          {yourCup?.cup && (
            <Plate label={t('path.seeCup', { cup: nationalCupName(mine.rank) })} icon="ranks" variant="secondary" roles={GR}
              onPress={() => openCupBracket(yourCup.cup!, mine.country, playerClubId, openCupTie)} />
          )}
          {/* The pundits' call, checked: the same seed, the same field. */}
          {domPunditCall != null && (
            <KitText t="body" color={GR.textMuted}>
              {domPunditCall === pos ? t('path.punditsSpotOn', { place: ordinalOf(domPunditCall) })
                : t('path.punditsHad', { tipped: ordinalOf(domPunditCall), place: ordinalOf(pos) }) + (domPunditCall > pos ? t('path.provedWrong') : '.')}
            </KitText>
          )}
          {table && (
            <>
              <SectionTag roles={GR}>{t('path.finalTable', { league: mine.name })}</SectionTag>
              <LeagueTable roles={GR} zones={domZones}
                breakAfter={domSplitSize > 0 ? domSplitSize : undefined} breakLabel={t('path.splitBreak')}
                rows={table.standings.map(r => ({
                  clubId: r.clubId, clubName: r.clubName, isPlayer: r.clubId === playerClubId,
                  played: r.played, gd: r.goalsFor - r.goalsAgainst, points: r.points,
                }))} />
              <ZoneLegend roles={GR} zones={domZones} />
            </>
          )}
        </KitScreen>
        <ThumbBar>
          <Plate label={!qual ? t('path.resolvingStep') : qualified ? t('path.restOfEurope') : t('path.whoTook')}
            icon="forward" roles={GR} disabled={!qual} missingStep={t('path.resolvingStep')}
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
      <View style={[styles.container, { backgroundColor: GR.bg }]}>
        {road(phase)}
        <KitScreen ground={EVERYDAY} underHeader>
          <KitText t="superM" color={GR.text} accessibilityRole="header">{t('path.europeDone')}</KitText>
          <KitText t="bodyL" color={GR.textMuted}>{t('path.everyLeague', { n: visible.length, total: tables.length })}</KitText>
          <SectionTag roles={GR}>{t('path.theChampions')}</SectionTag>
          {visible.map(t => (
            <LeagueRow key={t.rank} roles={GR} table={t} yours={t.rank === mine.rank} onPress={() => openLeagueTable(t, playerClubId)} />
          ))}
          {/* P8-52: the rest of the ceremony, once every league is in. */}
          {done && europe && (
            <>
              <SectionTag roles={GR}>{t('path.theHolders')}</SectionTag>
              {europe.holders.map(h => (
                <MarkRow key={h.comp} roles={GR} clubId={h.clubId} clubName={h.clubName} yours={h.clubId === playerClubId}
                  label={t('path.holders', { comp: EUROPE[h.comp].name }) + (h.playsIn ? t('path.holdersIn', { comp: EUROPE[h.playsIn].name }) : '')} />
              ))}
              <KitText t="body" color={GR.textMuted}>{t('path.holdersNote')}</KitText>
              <SectionTag roles={GR}>{t('path.theCups')}</SectionTag>
              <KitText t="body" color={GR.textMuted}>{t('path.cupsNote')}</KitText>
              {/* P8.5-13: each cup opens as its bracket (older saves kept only the winner). */}
              {europe.cups.map(c => (
                <MarkRow key={c.rank} roles={GR} clubId={c.clubId} clubName={c.clubName} yours={c.clubId === playerClubId}
                  label={`${nationalCupName(c.rank)} · ${c.country ? countryName(c.country) : c.name}`}
                  onPress={c.cup ? () => openCupBracket(c.cup!, c.country, playerClubId, (t, label) => openMatchStats(cupTieRequest(t, `${c.cup!.name} · ${label}`, { yearStart: 2025 }))) : undefined} />
              ))}
            </>
          )}
        </KitScreen>
        <ThumbBar>
          <Plate label={done ? (notQualified ? t('path.seeVerdict') : t('path.toQualifiers')) : t('path.revealAll')}
            icon="forward" roles={GR}
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
      <View style={[styles.container, { backgroundColor: GR.bg }]}>
        {road(phase)}
        <KitScreen ground={EVERYDAY} underHeader>
          <KitText t="superM" color={GR.text} accessibilityRole="header">{t('path.qualifying')}</KitText>
          <KitText t="bodyL" color={GR.textMuted}>{t('path.qualLead')}</KitText>
          <SegmentSwitch<EuroComp> roles={GR} value={ladder} onChange={setQualComp} options={(['ucl', 'uel', 'uecl'] as EuroComp[]).map(c => ({ id: c, label: EUROPE[c].short }))} />
          {waitingOnLiveQual && liveQualMatch && currentQualRound && (
            <View style={{ gap: space[2], marginTop: space[3] }}>
              <SectionTag roles={GR}>
                {`${playerQualTie?.comp ? `${EUROPE[playerQualTie.comp].short} · ` : ''}${label(QUAL_ROUND_LABEL[currentQualRound])}${playerQualTie ? ` · ${label(PATH_LABEL[playerQualTie.path])}` : ''}`}
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
            if (m) openMatchStats(tieRequest(m, `${EUROPE[t.comp ?? 'ucl'].short} · ${QUAL_ROUND_LABEL[t.round]} · ${PATH_LABEL[t.path]}`, koCtx))
          }} />
        </KitScreen>
        <ThumbBar>
          <Plate label={t('path.skipQual')} icon="skip" variant="secondary" roles={GR}
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
      <View style={[styles.container, { backgroundColor: GR.bg }]}>
        {road(phase)}
        <KitScreen ground={EVERYDAY} underHeader>
          <StampLabel roles={GR} good={through}
            text={through ? (playerHadTies ? t('path.into', { comp: comp.name }) : t('path.fieldSet')) : t('path.outIn', { round: exitTie ? label(QUAL_ROUND_LABEL[exitTie.round]).toLowerCase() : t('path.qualifyingLower') })}
            sub={through
              ? (playerHadTies
                  ? (entry && entry.comp !== comp.id ? t('path.dropped', { comp: EUROPE[entry.comp].name }) : t('path.cameThrough'))
                    + t('path.phaseShape', { n: comp.matchdays, pots: comp.perPot === 1 ? t('path.sixPots') : '' })
                  : t('path.straightPhase'))
              : t('path.nowhereLower', { comp: comp.name })} />
          {qual && (playerHadTies || !through) && (
            // Your own ties wherever they were, and the ladder of the competition you're in.
            <QualifyingLadder ties={runQualTies(qual, playerClubId)} onTiePress={t => {
              const m = qualTieToKoMatch(t)
              if (m) openMatchStats(tieRequest(m, `${EUROPE[t.comp ?? 'ucl'].short} · ${QUAL_ROUND_LABEL[t.round]} · ${PATH_LABEL[t.path]}`, koCtx))
            }} />
          )}
          {/* P8.5-14: the rest of Europe. Once qualifying was over you couldn't
              look at the other competitions' qualifying, and it was hard to see
              who else got into the league phases. One competition at a time:
              its league phase (who came in directly, who came through), then
              its whole ladder. */}
          {qual?.europe && (() => {
            const shown = qualComp ?? comp.id
            const field = [...qual.europe.fields[shown]].sort((x, y) => y.ovr - x.ovr)
            const came = field.filter(t => t.entryRound !== 'league_phase').length
            return (
              <>
                <SectionTag roles={GR}>{t('path.restOfEuropeTitle')}</SectionTag>
                <SegmentSwitch<EuroComp> roles={GR} value={shown} onChange={setQualComp}
                  options={(['ucl', 'uel', 'uecl'] as EuroComp[]).map(c => ({ id: c, label: EUROPE[c].short }))} />
                <KitText t="body" color={GR.textMuted}>
                  {t('path.phaseField', { comp: EUROPE[shown].name, count: field.length, direct: field.length - came, came })}
                </KitText>
                {field.map(team => (
                  <View key={team.clubId} style={[styles.fieldRow, { borderBottomColor: GR.rule }, team.isPlayer && { backgroundColor: GR.yours }]}>
                    <ClubName roles={GR} clubId={team.clubId} name={team.clubName} size={16} style={{ flex: 1 }} />
                    <KitText t="tag" color={GR.textMuted}>
                      {team.entryRound === 'league_phase' ? t('path.direct') : t('path.via', { round: label(QUAL_ROUND_LABEL[team.entryRound]).toUpperCase() })}
                    </KitText>
                  </View>
                ))}
                <SectionTag roles={GR}>{t('path.compQualifying', { comp: EUROPE[shown].name })}</SectionTag>
                <QualifyingLadder ties={qual.ties.filter(t => (t.comp ?? 'ucl') === shown)} onTiePress={t => {
                  const m = qualTieToKoMatch(t)
                  if (m) openMatchStats(tieRequest(m, `${EUROPE[t.comp ?? 'ucl'].short} · ${QUAL_ROUND_LABEL[t.round]} · ${PATH_LABEL[t.path]}`, koCtx))
                }} />
              </>
            )
          })()}
        </KitScreen>
        <ThumbBar>
          {through
            ? <Plate label={t('path.toLeaguePhase')} icon="forward" roles={GR} onPress={() => setPhase('review')} />
            : <Plate label={t('path.howItEnds')} icon="forward" roles={GR} onPress={() => handleOutOfEurope(exitKey ?? 'q1_exit')} />}
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
      <View style={[styles.container, { backgroundColor: GR.bg }]}>
        {road(phase)}
        <KitScreen ground={EVERYDAY} underHeader>
          <KitText t="superM" color={GR.text} accessibilityRole="header">{t('path.theLeaguePhase')}</KitText>
          <KitText t="tag" color={GR.textMuted}>{comp.fullName}</KitText>
          <KitText t="tag" color={GR.textMuted}>
            {t('path.lpMeta', { club: playerTeam?.clubName ?? '', ovr: playerTeam?.ovr ?? 0, pot: playerTeam?.pot ?? '-', count: clTeamsLocal.length })}
          </KitText>
          {lpDraw && (
            // P8-114: the draw first, then your eight by matchday once it's done.
            <LeaguePhaseDraw roles={GR} teams={clTeamsLocal} draw={lpDraw} countryOf={countryOfClub} after={(
              <>
                <SectionTag roles={GR}>{comp.matchdays === 6 ? t('path.yourSix') : t('sim.yourEight')}</SectionTag>
                {yourEight.map(f => (
                  <FixtureRow key={f.matchday} roles={GR} matchday={f.matchday} home={f.home.isPlayer}
                    opponent={(f.home.isPlayer ? f.away : f.home).clubName} pot={(f.home.isPlayer ? f.away : f.home).pot} you={(f.home.isPlayer ? f.home : f.away).clubName}
                    when={kickoffFor({ label: `League Phase · MD ${f.matchday}`, yearStart: clYear ?? 2025, homeClubId: f.home.clubId, awayClubId: f.away.clubId })?.short} />
                ))}
                <ZoneLegend roles={GR} zones={CL_PHASE_ZONES} />
              </>
            )} />
          )}
        </KitScreen>
        <ThumbBar>
          <Plate label={t('sim.startLeaguePhase')} icon="play" roles={GR} onPress={() => { setPhase('simulating'); setIsPlaying(true) }} />
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
      <View style={[styles.container, { backgroundColor: GR.bg }]}>
        {road(phase)}
        <KitScreen ground={EVERYDAY} underHeader width={wide ? 'wide' : 'column'}>
          <TableStage roles={GR} wide={wide} tab={lpTab} onTab={id => setLpTab(id as typeof lpTab)}
            meta={t('path.lpRunMeta', { comp: comp.name, count: clTeamsLocal.length, md: Math.min(currentMD - 1, totalMatchdays), total: totalMatchdays })}
            standing={youPos > 0 && fpLive !== 'lp' ? { pos: youPos, delta: moveFrom(prevPos(lpOrdersRef.current), youPos), zone: CL_PHASE_ZONES[youPos - 1] ?? null, points: standings[youPos - 1]?.stats.points ?? 0 } : null}
            strip={{ marks: fpLive === 'lp' ? lpMarks.slice(0, -1) : lpMarks, total: totalMatchdays, viewing: mdView, latest: lpHistory.length, onPick: md => { setMdView(md); if (md != null) setIsPlaying(false) } }}
            keys={{ playPause: () => { if (currentMD <= totalMatchdays) setIsPlaying(p => !p) } }}
            yourMatch={<>
          {fpLiveMatch('lp') ?? (yourResult && (
            <ScorelineCard roles={GR} label={[label(`MD ${historyFor(lpHistory)}`), kickoffFor({ label: `League Phase · MD ${historyFor(lpHistory)}`, yearStart: clYear ?? 2025, homeClubId: yourResult.homeId, awayClubId: yourResult.awayId })?.short].filter(Boolean).join(' · ')}
              homeName={yourResult.home} awayName={yourResult.away} homeClubId={yourResult.homeId} awayClubId={yourResult.awayId}
              homeGoals={yourResult.hg} awayGoals={yourResult.ag} youHome={yourResult.playerHome}
              homeScorers={yourResult.hs || undefined} awayScorers={yourResult.as || undefined}
              onPress={() => openMdDetail(yourResult, historyFor(lpHistory), 'League Phase', clYear ?? 2025)}
              footer={<ManOfTheMatch roles={GR} req={mdRequest(yourResult, historyFor(lpHistory), 'League Phase', clYear ?? 2025)!} />} />
          ))}
            </>}
            waiting={fpLive === 'lp'}
            panes={[
              { id: 'table', label: t('sim.tabTable'), flex: 1.4, node: <>
                <LeagueTable roles={GR} zones={CL_PHASE_ZONES}
                  rows={withMoves(standings.map(simRow), lpOrdersRef.current[lpOrdersRef.current.length - 2])} />
                <ZoneLegend roles={GR} zones={CL_PHASE_ZONES} />
              </> },
              { id: 'results', label: t('sim.tabResultsMd', { md: historyFor(lpHistory) }), node: <>{others.length === 0 ? (
            <KitText t="body" color={GR.textMuted} style={{ paddingVertical: space[3] }}>{t('sim.noOtherResults')}</KitText>
            ) : (
            <>
            {others.map((r, i) => (
              <ResultRow key={i} roles={GR} homeName={r.home} awayName={r.away} homeGoals={r.hg} awayGoals={r.ag}
                homeClubId={r.homeId} awayClubId={r.awayId} youSide={null} homeScorers={r.hs || undefined} awayScorers={r.as || undefined}
                onPress={() => openMdDetail(r, historyFor(lpHistory), 'League Phase', clYear ?? 2025)} />
            ))}
            <RoundTeam roles={GR} roundKey={`lp-${historyFor(lpHistory)}`} label={t('sim.teamOfMd', { md: historyFor(lpHistory) })}
              poolByClub={poolByClubRef.current} ctx={lineupCtxRef.current}
              fixtures={shown.map(r => ({
                  homeClubId: r.homeId, awayClubId: r.awayId, homeClubName: r.home, awayClubName: r.away,
                  homeGoals: r.hg, awayGoals: r.ag, scorers: r.scorers, seed: r.seed,
                  homeRotation: r.homeRotation, awayRotation: r.awayRotation, absent: r.absent, standIns: r.standIns,
                }))} />
            </>
            )}</> },
              { id: 'fixtures', label: t('season.tabFixtures'), node: <YourFixtures roles={GR} rows={lpFixtureRows()} /> },
              pressPane,
            ]} />
        </KitScreen>
        <ThumbBar>
          {currentMD > totalMatchdays && !fpLive ? (
            // The league phase is over: the final table stays until you go on.
            <Plate label={t('path.toKnockouts')} icon="forward" roles={GR}
              onPress={() => { if (lpFinishingRef.current) return; lpFinishingRef.current = true; void finishLeaguePhase() }} />
          ) : (
            <>
              <StageControls roles={GR} skip={{ label: t('sim.skipLastMd'), consequence: t('sim.mdsAtOnce', { from: currentMD, to: totalMatchdays }),
                pause: () => setIsPlaying(false), run: () => lpSkipRef.current() }} />
              <Plate label={isPlaying ? t('sim.pause') : t('sim.playMd', { md: currentMD })}
                icon={isPlaying ? 'pause' : 'play'} roles={GR} onPress={() => setIsPlaying(p => !p)} />
            </>
          )}
        </ThumbBar>
        {modals}
      </View>
    )
  }

  // ── Phase: the knockouts ──────────────────────────────────────────────────

  // C-06 / C-07: the full path's knockouts are the shared knockout view, the
  // one the classic Champions League and the World Cup use. This screen had
  // its own copy, with its own "newest first" and scroll hold.
  return (
    <>
      <KnockoutStage
        rounds={koRounds}
        previewHeader={road('knockout_phase')}
        competitionLabel={comp.fullName}
        yearStart={clYear ?? 2025}
        colourway={colourwayFor(europe?.competition === 'uel' ? 'europa_league' : europe?.competition === 'uecl' ? 'conference_league' : 'champions_league_custom')}
        road={{ names: UCL_ROAD, current: ROAD_STAGE.knockout_phase }}
        // Nothing to pause by hand: the rounds and the live match hold while the confirm is on top.
        onAbandon={() => askAbandon(() => {})}
        onFinish={finishAll}
        pressFor={played => cupPress([...pathStages(), ...knockoutStages(played)], availabilityRef.current?.absences() ?? [])}
        pools={{ poolByClub: poolByClubRef.current, ctx: lineupCtxRef.current }}
        onTiePress={(tie, label) => openMatchStats(tieRequest(knockoutTieToCLMatch(tie, label), label, koCtx))}
        deepMatch={{ watched: deepFinalWatched, ctx: koCtx, accent: themeForComp(europe?.competition).accent, resultRoute: '/game/awards', onFinished: () => { setDeepFinalWatched(true); commitFinalResult() } }}
      />
      {modals}
    </>
  )
}

const styles = StyleSheet.create({

  container: { flex: 1, backgroundColor: GR.bg },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 36, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: space[1] },
})
