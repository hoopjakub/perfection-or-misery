import { EUROPE } from '@/data/europe'
import { fullPathTier, runQualTies, huntMet } from '@/engine/europe-path'
import React, { useEffect, useRef, useState } from 'react'
import { Loader } from '@/components/kit'
import { COLUMN } from '@/hooks/useSizeClass'
import { View, StyleSheet, Pressable, Animated } from 'react-native'
// P8-123: text on the kit's families and scale until this screen is rebuilt on KitText.
import { ScaleText as Text } from '@/components/kit'
import { openClub, openRunHub } from '@/lib/runNav'
import { router, useLocalSearchParams } from 'expo-router'
import { restartToModeSelect, exitToHome } from '@/lib/nav'
import { useGameStore } from '@/store/gameStore'
import { adoptRunCrest } from '@/store/crestStore'
import { useUserStore } from '@/store/userStore'
import { formatTier, verdictOf } from '@/data/tiers'
import { useRunSave } from '@/hooks/useRunSave'
import { VerdictBlock, PunditsPlayedOut } from '@/components/season/VerdictBlock'
import { punditsOnYouFor } from '@/engine/predictions'
import { championsLeaguePunditTournament } from '@/engine/cup-calls'
import { predictTable, predictChampionsLeagueRound } from '@/engine/predictions'
import { takeRunStats, clubsForManagerAward, openAwardsView, type RunStats } from '@/lib/awardsNight'
import { buildAwardsNight } from '@/engine/awards'
import { Plate, KitScreen, KitText, ListRow, Columns } from '@/components/kit'
import { LeagueTable, ZoneLegend, CL_PHASE_ZONES, SegmentSwitch } from '@/components/season/SeasonParts'
import { ResultFigures, ResultSection, ResultActions, YourMatches } from '@/components/season/ResultParts'
import { clKoMatchToRow, wcKoMatchToRow, type KoRoundVM } from '@/components/KnockoutRoundsView'
import { BracketTree, koRoundsToColumns } from '@/components/BracketTree'
import { space } from '@/theme'
import { SaveStatusLine } from '@/components/ui'
import { saveCustomUclRun, fetchRunById } from '@/db/queries/runs'
import { computeCLRunStats, koTieLegRecord } from '@/engine/run-stats'
import { mergeCareerFromRun } from '@/db/queries/career'
import { LineupPitch } from '@/components/LineupPitch'
import { SquadSummary } from '@/components/SquadSummary'
import { QualifyingLadder } from '@/components/QualifyingLadder'
import { TitleWithInfo, InfoBubble, openRules } from '@/components/InfoBubble'
import { openLeagueTable, openLeaguesBrowser, qualTieToKoMatch, LeagueRow } from '@/components/CustomUclViewers'
import { koLegDetailRequest } from '@/components/MatchStatsParts'
import { appendKnockoutRounds } from '@/engine/match-context'
import { MedicalTable } from '@/components/MedicalTable'
import { openMatchStats } from '@/lib/matchStats'
import { clCompetitionMatches } from '@/engine/match-context'
import { QUAL_ROUND_LABEL, PATH_LABEL, QUAL_EXIT_ROUND } from '@/data/cl-qual-labels'
import { spacing, typography, MODE_THEMES, prim, font } from '@/theme'
import { ROLES as KIT_ROLES } from '@/theme'
import type { CLSeasonResult, CLKnockoutMatch, CLLeagueMatch, OtherCompetition } from '@/engine/cl-sim'
import type { EuroComp } from '@/data/uefa-coefficients'
import type { SimLeagueTable } from '@/engine/cl-league-sim'
import type { CompetitionStats, SeasonAwards } from '@/types/stats'
import type { DraftedPlayer } from '@/types/game'
import { EVERYDAY } from '@/lib/appearance'

// The page's ground (1 Oct: result screens follow light and dark too). These
// old styles named the dark ground's colours; they now take its roles.
const GR = KIT_ROLES[EVERYDAY]

const CL = MODE_THEMES.champions_league

// Verdict names come from the shared registry (src/data/tiers.ts) so this
// banner, Home and Runs always agree. The competition is named above it.
const ROUND_COLORS: Record<string, string> = {
  not_qualified: '#DC2626',
  q1_exit: '#6B7280', q2_exit: '#6B7280', q3_exit: '#9CA3AF', quali_playoff_exit: '#DC2626',
  league_exit: '#DC2626', playoff_exit: '#EA580C', r16_exit: '#F59E0B',
  qf_exit: '#F59E0B', sf_exit: '#A78BFA', finalist: '#34D399', winner: '#F59E0B',
}
export default function CustomUclResultScreen() {
  const store = useGameStore()
  const { resetRun, formation, draftedPlayers, benchPlayers, quickSim, difficulty, customDifficulty, weightedPicksOverride } = store
  const fullSquad = [...draftedPlayers, ...benchPlayers]
  const { user, isGuest } = useUserStore()
  const params = useLocalSearchParams<{ runId?: string }>()
  const fromHistory = !!params.runId

  const [dbRun, setDbRun] = useState<any>(null)
  const [loading, setLoading] = useState(fromHistory)
  const [runStats, setRunStats] = useState<RunStats | null>(null)
  const submittingRef = useRef(false)
  // The run saves itself once its stats are computed (useRunSave). A run with
  // nothing to compute — history, or an empty squad — is ready straight away.
  const freshRun = !fromHistory && !!store.clResult && draftedPlayers.length > 0
  const [statsDone, setStatsDone] = useState(!freshRun)
  const runSave = useRunSave({
    applies: !fromHistory && !quickSim && !!store.clResult,
    signedIn: !!user && !isGuest,
    ready: statsDone,
  })
  const [submitting, setSubmitting] = useState(false)

  const heroAnim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (loading) return
    heroAnim.setValue(0)
    Animated.timing(heroAnim, { toValue: 1, duration: 650, useNativeDriver: true }).start()
  }, [loading])

  useEffect(() => {
    if (!params.runId) return
    let active = true
    fetchRunById(params.runId)
      .then(run => { adoptRunCrest((run as any)?.highlights); return run })   // P8-132
      .then(run => { if (active) setDbRun(run) })
      .catch(err => console.error('[custom-ucl-result] failed to load run:', err))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [params.runId])

  const clResult: CLSeasonResult | null =
    (dbRun?.cl_result as CLSeasonResult | undefined) ?? store.clResult ?? null
  // The qualifying ladder + 53 simulated tables are nested inside cl_result when
  // saved (see saveCustomUclRun) — with a legacy fallback to the old top-level
  // columns for any earlier runs.
  const customUclQual = (dbRun?.cl_result?._customUclQual ?? dbRun?.custom_ucl_qual) as import('@/engine/cl-qualifying').QualifyingResult | undefined ?? store.customUclQual
  // P8.5-39: did this run's hunt (if any) reach its target?
  const huntReached = store.europeanTarget !== 'any' && huntMet(store.europeanTarget, customUclQual)
  const customUclLeagues = (dbRun?.cl_result?._customUclTables ?? dbRun?.custom_ucl_tables) as SimLeagueTable[] | undefined ?? store.customUclLeagues
  const clYear = store.clYear

  useEffect(() => {
    if (fromHistory || !store.clResult || draftedPlayers.length === 0) return
    // Qualifying ties count toward stats/awards too — the WHOLE competition.
    // Awards Night already paid for these (src/lib/awardsNight.ts): reading
    // them back saves regenerating every match sheet a second time.
    const ready = takeRunStats()
    if (ready) { setRunStats(ready); setStatsDone(true); return }
    computeCLRunStats(store.clResult, fullSquad, clYear ?? 2025, runQualTies(store.customUclQual, store.clResult.playerTeam.clubId), store.useSubstitutes)
      .then(res => res && setRunStats(res))
      .catch(e => console.warn('[custom-ucl-result] stats failed:', e))
      .finally(() => setStatsDone(true))
  }, [])

  if (loading) {
    return (
      <View style={styles.center}>
        <Loader color={GR.text} wide />
        <Text style={[styles.errorText, { marginTop: spacing.md }]}>Loading run…</Text>
      </View>
    )
  }

  if (!clResult) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>No custom UCL result found.</Text>
        <Pressable onPress={() => router.replace('/game/mode-select')} style={{ marginTop: spacing.lg }}>
          <Text style={{ color: GR.text, fontFamily: font.bodyBold }}>← Back to Menu</Text>
        </Pressable>
      </View>
    )
  }

  const { leaguePhaseStandings, playoffRound, r16, qf, sf, final, winner, playerTeam, playerFinalRound, playerPot } = clResult
  const resultColor = ROUND_COLORS[playerFinalRound] ?? GR.text
  // P8-52: the competition the season went on in, and the tier it earned there.
  const comp = EUROPE[clResult.competition ?? 'ucl']
  const tier = fullPathTier(clResult)
  const resultLabel = formatTier(tier)
  const isChampion = playerFinalRound === 'winner'

  // D1 — the verdict, in the shared treatment. The pundits' pre-season call is
  // rebuilt from the seed stored on the run, so the two can be compared.
  const punditsText = (() => {
    const seed = store.predictionSeed
    const field = store.clTeams
    if (seed == null || !field) return undefined
    const pred = predictTable(field.map(t => ({ clubId: t.clubId, clubName: t.clubName, ovr: t.ovr, isPlayer: t.isPlayer })), seed)
    if (!pred.player) return undefined
    const said = predictChampionsLeagueRound(pred.player.predicted)
    return `They said ${said.label.toLowerCase()}. You finished as ${formatTier(tier).toLowerCase()}.`
  })()
  const playerPos = leaguePhaseStandings.findIndex(t => t.isPlayer) + 1
  const leagueMatchdays: CLLeagueMatch[] = clResult.leagueMatchdays ?? []
  // 1st-8th place enter the Round of 16 directly, skipping the Playoff — the
  // ◆ marker on the R16 rows (Big Fixes §1).
  const directIds = new Set(leaguePhaseStandings.slice(0, 8).map(t => t.clubId))

  // Deep-stats entry point — league-phase matchday rows (KO legs open from
  // the shared KoTieDetailModal's per-leg buttons).
  const ovrByClub = new Map(leaguePhaseStandings.map(t => [t.clubId, t.ovr]))
  // Also TeamModal's onOpenMatch — opened from a tap *inside* that already-open
  // modal, so close it here too (not just set matchDetail). AppModal has no
  // shared z-index stack, so leaving the parent "open" stacked two full-screen
  // fixed overlays at once and could leave the page unclickable after closing
  // the top one (Big Fixes §5.6 — PC/mouse only, touch's hit-testing masked it).
  // §10.5 — one continuous timeline (league phase → every knockout leg) so the
  // stats screen can show the table, five games of form and what came next.
  const clContextMatches = clCompetitionMatches(leagueMatchdays, [
    { label: 'KO Play-off',   ties: playoffRound },
    { label: 'Round of 16',   ties: r16 },
    { label: 'Quarter-final', ties: qf },
    { label: 'Semi-final',    ties: sf },
    { label: 'Final',         ties: final ? [final] : [] },
  ])

  // A knockout or qualifying tie opens straight on its first leg: the match
  // sheet shows the tie with both legs tappable, so the tie modal that sat in
  // between is gone (Phase 5). A qualifying tie isn't on the competition's
  // timeline, so it brings a one-tie bracket of its own.
  const openKoLeg = (m: CLKnockoutMatch, label: string, qualifying = false) => {
    const req = koLegDetailRequest(m, 1, {
      label, yearStart: store.clYear ?? 2025, playerClubId: playerTeam.clubId,
      drafted: (fromHistory ? dbRun?.squad ?? [] : fullSquad) as DraftedPlayer[],
      playerFormation: (fromHistory ? dbRun?.formation : store.formation) ?? undefined,
    })
    if (!req) return
    const context = qualifying ? appendKnockoutRounds([], [{ label, ties: [m] }]) : clContextMatches
    const md = context.find(c => c.inTable === false && c.homeClubId === m.teamA.clubId && c.awayClubId === m.teamB.clubId && !c.label?.includes('Leg 2'))?.matchday
    openMatchStats({ ...req, matchday: md, contextMatches: context }, MODE_THEMES.champions_league.accent)
  }

  const openLeagueMatchDetail = (m: CLLeagueMatch) => {
    openMatchStats({
      homeClubId: m.home.clubId, homeName: m.home.clubName,
      awayClubId: m.away.clubId, awayName: m.away.clubName,
      homeGoals: m.homeGoals, awayGoals: m.awayGoals,
      scorers: m.scorers, seed: m.seed, yearStart: store.clYear ?? 2025,
      homeRotation: m.homeRotation, awayRotation: m.awayRotation,
      absent: m.absent, standIns: m.standIns,
      competitionLabel: `League Phase · Matchday ${m.matchday}`,
      playerClubId: playerTeam.clubId,
      drafted: (fromHistory ? dbRun?.squad ?? [] : fullSquad) as DraftedPlayer[],
      playerFormation: (fromHistory ? dbRun?.formation : store.formation) ?? undefined,
      matchday: m.matchday, contextMatches: clContextMatches,
    }, MODE_THEMES.champions_league.accent)
  }

  // How the player's club reached (or fell short of) the league phase — plus
  // their DOMESTIC season, which is where the whole journey started.
  const playerLeague = customUclLeagues?.find(l => l.standings.some(s => s.clubId === playerTeam.clubId)) ?? null
  const domRow = playerLeague?.standings.find(s => s.clubId === playerTeam.clubId) ?? null
  const domPos = playerLeague ? playerLeague.standings.findIndex(s => s.clubId === playerTeam.clubId) + 1 : 0

  const qualExitRound = QUAL_EXIT_ROUND[playerFinalRound]
  const notQualified = playerFinalRound === 'not_qualified'
  const playerQualPath = customUclQual?.playerPath ?? []
  const playerEntry = customUclQual?.leaguePhaseField.find(t => t.clubId === playerTeam.clubId)
  const entryRound = playerEntry?.entryRound ?? playerQualPath[0]?.round ?? 'league_phase'
  const entryPath = playerEntry?.entryPath ?? playerQualPath[0]?.path ?? 'none'
  const entryText = notQualified
    ? `Finished ${domPos}${ordinal(domPos)} in the ${playerLeague?.name ?? 'league'}, below every European place. No Europe this season.`
    : qualExitRound
    ? `Eliminated in the ${comp.name}'s ${QUAL_ROUND_LABEL[qualExitRound]} (${PATH_LABEL[playerQualPath[playerQualPath.length - 1]?.path ?? entryPath]})`
    : entryRound === 'league_phase'
    ? `Entered the ${comp.name}'s league phase directly`
    : `Reached the ${comp.name}'s league phase via the ${PATH_LABEL[entryPath]}, entered at the ${QUAL_ROUND_LABEL[entryRound]}`
  const reachedLeaguePhase = !qualExitRound && !notQualified
  const domesticLine = playerLeague && domRow
    ? `Domestic season: ${domPos}${ordinal(domPos)} in the ${playerLeague.name} · ${domRow.won}W ${domRow.drawn}D ${domRow.lost}L`
    : null

  // Record is LEG-by-leg (you can win one leg and lose the other), not just
  // who won the tie overall — same rule as classic UCL's result screen.
  const playerKoTies = [...playoffRound, ...r16, ...qf, ...sf, ...(final ? [final] : [])]
    .filter(m => m.teamA.isPlayer || m.teamB.isPlayer)
  let koW = 0, koD = 0, koL = 0, koGF = 0, koGA = 0
  playerKoTies.forEach(m => {
    const isA = m.teamA.isPlayer
    koGF += isA ? m.aGoals : m.bGoals; koGA += isA ? m.bGoals : m.aGoals
    const { w, d, l } = koTieLegRecord(m, isA)
    koW += w; koD += d; koL += l
  })

  // Your ties wherever they were, and the ladder of the competition you ended in.
  const qualTies = runQualTies(customUclQual, playerTeam.clubId)
  const associations = [...(customUclLeagues ?? [])].sort((a, b) => a.rank - b.rank)

  // Awaited (not fire-and-forget) so the run is in the DB before we navigate.
  async function persistRun() {
    if (fromHistory || quickSim) return
    if (user && !isGuest && formation) {
      await saveCustomUclRun({
        userId: user.id,
        formation,
        teamOvr: playerTeam.ovr,
        result: clResult!,
        squad: fullSquad,
        // P8.5-39: a hunt is saved as one only if it reached its target; a miss is a normal run.
        difficulty, custom: customDifficulty, weightedPicksOverride, target: huntReached ? store.europeanTarget : null,
        // For "The Double, Europe" (P8.5-21): your league and its cup, both won.
        domestic: playerLeague ? {
          champion: domPos === 1,
          cupWon: !!customUclQual?.europe?.cups.some(c => c.rank === playerLeague.rank && c.clubId === playerTeam.clubId),
        } : null,
        stats: runStats?.stats,
        awards: runStats?.awards,
        // P8-150: the panel's place for you, for the career's line against the pundits.
        punditsOnYou: punditsOnYouFor(store.clTeams, store.predictionSeed),
        qual: customUclQual,
        leagueTables: customUclLeagues,
      })
    }
    if (user && !isGuest && runStats) {
      const pots = runStats.awards.playerOfTheSeason[0], u21 = runStats.awards.bestU21[0]
      await mergeCareerFromRun(user.id, {
        competition: 'champions_league_custom',
        yourPlayers: runStats.stats.players.filter(p => p.isPlayerClub),
        goalsFor: playerTeam.stats.goalsFor, goalsAgainst: playerTeam.stats.goalsAgainst,
        potsWinnerId: pots?.isPlayerClub ? pots.playerId : undefined,
        u21WinnerId:  u21?.isPlayerClub ? u21.playerId  : undefined,
      }).catch(e => console.warn('[career] merge failed:', e))
    }
  }

  runSave.setTask(persistRun)

  async function handlePlayAgain() {
    if (submittingRef.current) return
    submittingRef.current = true; setSubmitting(true)
    await runSave.flush()
    resetRun()
    restartToModeSelect()
  }

  async function handleReturnToHome() {
    if (submittingRef.current) return
    submittingRef.current = true; setSubmitting(true)
    await runSave.flush()
    resetRun()
    exitToHome()
  }

  // P8-54 — the full path's result as the end of the live competition: its
  // qualifying ladder, the zoned league phase, and the shared knockout list.
  // The league phase as it finished: its table, and the pundits' comparison (P8-165).
  const actualLeagueTable = leaguePhaseStandings.map(t => ({ clubId: t.clubId, clubName: t.clubName, isPlayer: !!t.isPlayer, played: t.stats.played, gd: t.stats.goalsFor - t.stats.goalsAgainst, points: t.stats.points }))
  const koRounds: KoRoundVM[] = [
    { key: 'playoff', label: 'Knockout play-off', ties: playoffRound, info: 'knockout_playoff' },
    { key: 'r16', label: 'Round of 16', ties: r16, direct: true },
    { key: 'qf', label: 'Quarter-finals', ties: qf },
    { key: 'sf', label: 'Semi-finals', ties: sf },
    { key: 'final', label: 'Final', ties: final ? [final] : [] },
  ].filter(r => r.ties.length > 0).map(r => ({
    key: r.key, label: r.label, infoTopic: r.info,
    ties: r.ties.map(m => clKoMatchToRow(m, r.direct ? directIds : undefined, () => openKoLeg(m, CL_KO_NAMES[m.round] ?? m.round))),
  }))
  // A full-path league phase can field more than 36; everything past 36th is out.
  const phaseZones = leaguePhaseStandings.map((_, i) => CL_PHASE_ZONES[Math.min(i, CL_PHASE_ZONES.length - 1)])
  const hubRunId = fromHistory ? params.runId : undefined
  const hasHub = fromHistory ? !!dbRun?.stats : draftedPlayers.length > 0
  const nylon = KIT_ROLES[EVERYDAY]
  // A saved run carries its target only if the hunt reached it (P8.5-39).
  const target = fromHistory ? (dbRun?.difficulty_meta as { target?: string } | null)?.target : (huntReached ? store.europeanTarget : null)
  const huntedComp = target && target !== 'any' ? EUROPE[target as 'ucl' | 'uel' | 'uecl']?.name ?? null : null
  const huntMissed = !fromHistory && store.europeanTarget !== 'any' && !huntReached ? EUROPE[store.europeanTarget as 'ucl' | 'uel' | 'uecl'].name : null

  return (
    <KitScreen ground={EVERYDAY} width="wide">
      <VerdictBlock
        tone={verdictOf(tier)}
        title={resultLabel}
        // P8.5-21: a hunting run says so (its target is on the saved run too).
        meta={`${comp.fullName} · the full path · ` + (huntedComp ? `hunted the ${huntedComp} · ` : huntMissed ? `missed the ${huntMissed} hunt: a normal run · ` : '') + `${playerTeam.clubName} · ${entryText}`}
        punditsText={punditsText}
        shareText={`${resultLabel} — ${comp.fullName} · the full path. Perfection or Misery.`}
        runId={params.runId}
        ownerId={params.runId ? dbRun?.user_id ?? null : undefined}
        scoreRow={params.runId ? dbRun ?? null : undefined}
      />
      <ResultFigures items={reachedLeaguePhase ? [
        ['League phase', `${playerPos}${ordinal(playerPos)}`], ['Pts', playerTeam.stats.points],
        ['W', playerTeam.stats.won], ['D', playerTeam.stats.drawn], ['L', playerTeam.stats.lost],
        ['Goals', `${playerTeam.stats.goalsFor}–${playerTeam.stats.goalsAgainst}`],
        ...(playerKoTies.length > 0 ? [['KO', koD > 0 ? `${koW}-${koD}-${koL}` : `${koW}-${koL}`] as [string, string]] : []),
        ['Pot', playerPot],
      ] : [
        // Never reached the league phase: the record that matters is the domestic season.
        ...(domRow ? [['Domestic', `${domPos}${ordinal(domPos)}`], ['W', domRow.won], ['D', domRow.drawn], ['L', domRow.lost], ['Goals', `${domRow.goalsFor}–${domRow.goalsAgainst}`]] as [string, string | number][] : []),
        ...(!notQualified ? [['Qualifying goals', `${playerTeam.stats.goalsFor}–${playerTeam.stats.goalsAgainst}`]] as [string, string][] : []),
      ]} />
      {domesticLine && !notQualified && <KitText t="tag" color={nylon.textMuted} style={styles.kitNote}>{domesticLine}</KitText>}

      {/* P8-24 for the cups — every side's call, checked against how far it got. */}
      {store.predictionSeed != null && store.clTeams && store.clResult && (
        <>
          <PunditsPlayedOut field={store.clTeams.map(t => ({ clubId: t.clubId, clubName: t.clubName, ovr: t.ovr, isPlayer: t.isPlayer }))} seed={store.predictionSeed}
            build={(rating, seed) => championsLeaguePunditTournament(store.clTeams!.map(t => ({ clubId: t.clubId, clubName: t.clubName, ovr: t.ovr, isPlayer: t.isPlayer })), rating, seed, store.clResult as any)} playerClubId={playerTeam?.clubId}
            actual={{ table: actualLeagueTable, bracket: koRoundsToColumns(koRounds) }} />
        </>
      )}

      <View style={styles.kitPlates}>
        {(() => {
          const src = runStats ?? (dbRun?.stats && dbRun?.awards ? { stats: dbRun.stats, awards: dbRun.awards } : null)
          if (!src) return null
          const night = buildAwardsNight({
            awards: src.awards, stats: src.stats, rounds: (src as RunStats).rounds,
            clubs: [], playerClubId: playerTeam?.clubId, mode: 'champions_league_custom',
          })
          return <Plate label="See the awards" icon="trophy" variant="secondary" roles={nylon} onPress={() => openAwardsView(night, params.runId)} />
        })()}
        {hasHub && <Plate label="The whole run" icon="stats" variant="secondary" roles={nylon} onPress={() => openRunHub(undefined, hubRunId)} />}
        {/* P8-108: every round's team of the matchday, in the run hub. */}
        {hasHub && <Plate label="Teams of the matchday" icon="achievements" variant="secondary" roles={nylon} onPress={() => openRunHub('teams', hubRunId)} />}
      </View>
      {/* Expanded (10-ADAPT §2.2): the sections as two newspaper columns. */}
      <Columns>

      {winner && (
        <ResultSection title="Champions of Europe">
          <View style={styles.kitWinner}>
            <KitText t="superM" color={nylon.text}>{winner.clubName.toUpperCase()}</KitText>
          </View>
        </ResultSection>
      )}

      {koRounds.length > 0 && (
        <ResultSection title="Knockouts" right={<InfoBubble topic="knockout_bracket" accent={nylon.text} />}>
          {/* P8-79: the full bracket, the same tree as the preview and the run hub. */}
          <BracketTree {...koRoundsToColumns(koRounds)} playerClubId={playerTeam?.clubId} />
          <KitText t="tag" color={nylon.textMuted}>SEED · entered the Round of 16 directly (1st–8th)</KitText>
        </ResultSection>
      )}

      {reachedLeaguePhase && leagueMatchdays.length > 0 && (
        <ResultSection title="Your league phase">
          <YourMatches matches={leagueMatchdays} onOpen={openLeagueMatchDetail} />
        </ResultSection>
      )}

      <ResultSection title={`League phase · ${leaguePhaseStandings.length} clubs`} right={<InfoBubble topic="league_phase_zones" accent={nylon.text} />}>
        <LeagueTable roles={nylon} zones={phaseZones}
          rows={actualLeagueTable}
          onRowPress={hasHub ? id => openClub(id, hubRunId) : undefined} />
        <ZoneLegend roles={nylon} zones={phaseZones} />
      </ResultSection>

      {/* P8.5-16: the other two competitions, and how they finished. */}
      {clResult.others && clResult.others.length > 0 && (
        <RestOfEurope others={clResult.others} playerClubId={playerTeam?.clubId} />
      )}

      {qualTies.length > 0 && (
        <ResultSection title="Qualifying" right={<InfoBubble topic="qualifying_ladder" accent={nylon.text} />}>
          <KitText t="body" color={nylon.textMuted}>{`How the ${customUclQual!.qualifiers.length} qualifiers reached the league phase`}</KitText>
          <QualifyingLadder ties={qualTies} onTiePress={t => { const m = qualTieToKoMatch(t); if (m) openKoLeg(m, `${EUROPE[t.comp ?? 'ucl'].short} · ${QUAL_ROUND_LABEL[m.round] ?? m.round}`, true) }} />
        </ResultSection>
      )}

      {associations.length > 0 && (
        <ResultSection title="Domestic leagues">
          <KitText t="body" color={nylon.textMuted}>Every league was played this run; the field came from these tables.</KitText>
          {associations.slice(0, 6).map(a => (
            // One row shape for a league everywhere: its flag, its champion's crest.
            <LeagueRow key={a.rank} roles={nylon} table={a} yours={a.standings.some(s => s.clubId === playerTeam.clubId)}
              onPress={() => openLeagueTable(a, playerTeam.clubId)} />
          ))}
          <ListRow roles={nylon} tier="t1" label={`All ${associations.length} leagues`} onPress={() => openLeaguesBrowser(associations, playerTeam.clubId)} />
        </ResultSection>
      )}

      {/* §10.5 phase 4 (R8) — the medical table. */}
      <MedicalTable absences={clResult.absences} accent={GR.text} />

      {/* Lineup + squad — live run or rehydrated from a saved one. Bench players
          included so SquadSummary resolves every row (Big Fixes §5.1). */}
      {(() => {
        const squad = (fromHistory ? dbRun?.squad ?? [] : fullSquad) as any[]
        const bench = (fromHistory ? (dbRun?.squad ?? []).filter((p: any) => p.isBench) : benchPlayers) as any[]
        const form  = (fromHistory ? dbRun?.formation : formation) as any
        const st    = runStats?.stats ?? dbRun?.stats ?? null
        return (
          <>
            {form && squad.length > 0 && <LineupPitch formation={form} draftedPlayers={squad} benchPlayers={bench} title="Your Lineup" />}
            {st && <SquadSummary stats={st} draftedPlayers={squad} formation={form ?? null} accent={GR.text} runId={params.runId} />}
          </>
        )
      })()}

      </Columns>
      <View style={styles.kitPlates}>
        <ListRow roles={nylon} icon="guide" label="How this competition works" onPress={() => openRules()} />
      </View>
      <ResultActions fromHistory={fromHistory} submitting={submitting} save={runSave} onAgain={handlePlayAgain} onHome={handleReturnToHome} />
    </KitScreen>
  )
}

// The full path's other two competitions (P8.5-16), played out headless at
// the end of the run: one at a time, its winner, its bracket and its league
// phase. Their matches have no sheets (nobody attributed their scorers), so
// the ties don't open.
function RestOfEurope({ others, playerClubId }: { others: OtherCompetition[]; playerClubId?: string | null }) {
  const roles = KIT_ROLES[EVERYDAY]
  const [shown, setShown] = useState<EuroComp>(others[0].comp)
  const o = others.find(x => x.comp === shown) ?? others[0]
  const direct = new Set(o.leaguePhaseStandings.slice(0, 8).map(t => t.clubId))
  const rounds: KoRoundVM[] = [
    { key: 'playoff', label: 'Knockout play-off', ties: o.playoffRound },
    { key: 'r16', label: 'Round of 16', ties: o.r16, direct: true },
    { key: 'qf', label: 'Quarter-finals', ties: o.qf },
    { key: 'sf', label: 'Semi-finals', ties: o.sf },
    { key: 'final', label: 'Final', ties: o.final ? [o.final] : [] },
  ].filter(r => r.ties.length > 0).map(r => ({ key: r.key, label: r.label, ties: r.ties.map(m => clKoMatchToRow(m, r.direct ? direct : undefined)) }))
  const zones = o.leaguePhaseStandings.map((_, i) => CL_PHASE_ZONES[Math.min(i, CL_PHASE_ZONES.length - 1)])
  return (
    <ResultSection title="The rest of Europe">
      <SegmentSwitch<EuroComp> roles={roles} value={shown} onChange={setShown}
        options={others.map(x => ({ id: x.comp, label: EUROPE[x.comp].short }))} />
      <KitText t="body" color={roles.textMuted}>{`${EUROPE[o.comp].name}: won by ${o.winner.clubName}.`}</KitText>
      {rounds.length > 0 && <BracketTree {...koRoundsToColumns(rounds)} playerClubId={playerClubId} />}
      <LeagueTable roles={roles} zones={zones}
        rows={o.leaguePhaseStandings.map(t => ({ clubId: t.clubId, clubName: t.clubName, isPlayer: t.clubId === playerClubId, played: t.stats.played, gd: t.stats.goalsFor - t.stats.goalsAgainst, points: t.stats.points }))} />
      <ZoneLegend roles={roles} zones={zones} />
    </ResultSection>
  )
}

const CL_KO_NAMES: Record<string, string> = { playoff: 'Playoff', r16: 'Round of 16', qf: 'Quarter-Final', sf: 'Semi-Final', final: 'Final' }

function ordinal(n: number): string {
  if (n === 1) return 'st'; if (n === 2) return 'nd'; if (n === 3) return 'rd'; return 'th'
}

const styles = StyleSheet.create({
  kitPlates: { gap: space[3], marginTop: space[5], width: '100%', maxWidth: COLUMN, alignSelf: 'center' },
  kitNote: { marginTop: space[2] },
  kitWinner: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
  center: { flex: 1, backgroundColor: GR.bg, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: typography.md, color: GR.textMuted },
})
