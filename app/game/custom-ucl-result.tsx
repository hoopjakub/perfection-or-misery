import React, { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Animated, ActivityIndicator } from 'react-native'
import { openClub, openRunHub } from '@/lib/runNav'
import { router, useLocalSearchParams } from 'expo-router'
import { restartToModeSelect, exitToHome } from '@/lib/nav'
import { useGameStore } from '@/store/gameStore'
import { useUserStore } from '@/store/userStore'
import { formatTier, verdictOf } from '@/data/tiers'
import { useRunSave } from '@/hooks/useRunSave'
import { VerdictBlock, PunditsRoundTable } from '@/components/season/VerdictBlock'
import { championsLeagueCalls } from '@/engine/cup-calls'
import { predictTable, predictChampionsLeagueRound } from '@/engine/predictions'
import { takeRunStats, clubsForManagerAward, openAwardsView, type RunStats } from '@/lib/awardsNight'
import { buildAwardsNight } from '@/engine/awards'
import { Plate, KitScreen, KitText, Tag, ListRow } from '@/components/kit'
import { LeagueTable, ZoneLegend, CL_PHASE_ZONES } from '@/components/season/SeasonParts'
import { ResultFigures, ResultSection, ResultActions, YourMatches } from '@/components/season/ResultParts'
import { KnockoutRoundsView, clKoMatchToRow, wcKoMatchToRow, type KoRoundVM } from '@/components/KnockoutRoundsView'
import { space } from '@/theme'
import { SaveStatusLine } from '@/components/ui'
import { saveCustomUclRun, fetchRunById } from '@/db/queries/runs'
import { computeCLRunStats, summariseScorers, koTieLegRecord } from '@/engine/run-stats'
import { mergeCareerFromRun } from '@/db/queries/career'
import { LineupPitch } from '@/components/LineupPitch'
import { SquadSummary } from '@/components/SquadSummary'
import { QualifyingLadder } from '@/components/QualifyingLadder'
import { TitleWithInfo, InfoBubble, openRules } from '@/components/InfoBubble'
import { openLeagueTable, openLeaguesBrowser, qualTieToKoMatch } from '@/components/CustomUclViewers'
import { koLegDetailRequest } from '@/components/MatchStatsParts'
import { appendKnockoutRounds } from '@/engine/match-context'
import { MedicalTable } from '@/components/MedicalTable'
import { openMatchStats } from '@/lib/matchStats'
import { clCompetitionMatches } from '@/engine/match-context'
import { QUAL_ROUND_LABEL, PATH_LABEL, QUAL_EXIT_ROUND } from '@/data/cl-qual-labels'
import { FORMAT_LABEL, isSpecialFormat } from '@/data/league-formats'
import { flagForCountry } from '@/data/geo-iso'
import { colors, spacing, typography, radius, shadows, MODE_THEMES, prim, font } from '@/theme'
import { ROLES as KIT_ROLES } from '@/theme'
import type { CLSeasonResult, CLKnockoutMatch, CLLeagueMatch } from '@/engine/cl-sim'
import type { SimLeagueTable } from '@/engine/cl-league-sim'
import type { CompetitionStats, SeasonAwards } from '@/types/stats'
import type { DraftedPlayer } from '@/types/game'

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
  const customUclLeagues = (dbRun?.cl_result?._customUclTables ?? dbRun?.custom_ucl_tables) as SimLeagueTable[] | undefined ?? store.customUclLeagues
  const clYear = store.clYear

  useEffect(() => {
    if (fromHistory || !store.clResult || draftedPlayers.length === 0) return
    // Qualifying ties count toward stats/awards too — the WHOLE competition.
    // Awards Night already paid for these (src/lib/awardsNight.ts): reading
    // them back saves regenerating every match sheet a second time.
    const ready = takeRunStats()
    if (ready) { setRunStats(ready); setStatsDone(true); return }
    computeCLRunStats(store.clResult, fullSquad, clYear ?? 2025, store.customUclQual?.ties, store.useSubstitutes)
      .then(res => res && setRunStats(res))
      .catch(e => console.warn('[custom-ucl-result] stats failed:', e))
      .finally(() => setStatsDone(true))
  }, [])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={prim.cotton} size="large" />
        <Text style={[styles.errorText, { marginTop: spacing.md }]}>Loading run…</Text>
      </View>
    )
  }

  if (!clResult) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>No custom UCL result found.</Text>
        <Pressable onPress={() => router.replace('/game/mode-select')} style={{ marginTop: spacing.lg }}>
          <Text style={{ color: prim.cotton, fontFamily: font.bodyBold }}>← Back to Menu</Text>
        </Pressable>
      </View>
    )
  }

  const { leaguePhaseStandings, playoffRound, r16, qf, sf, final, winner, playerTeam, playerFinalRound, playerPot } = clResult
  const resultColor = ROUND_COLORS[playerFinalRound] ?? prim.cotton
  const resultLabel = formatTier(playerFinalRound)
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
    return `They said ${said.label.toLowerCase()}. You finished as ${formatTier(playerFinalRound).toLowerCase()}.`
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
    ? `Finished ${domPos}${ordinal(domPos)} in the ${playerLeague?.name ?? 'league'} — below every UEFA Champions League spot. No Europe this season.`
    : qualExitRound
    ? `Eliminated in the ${QUAL_ROUND_LABEL[qualExitRound]} (${PATH_LABEL[entryPath]})`
    : entryRound === 'league_phase'
    ? 'Entered the League Phase directly'
    : `Reached the League Phase via the ${PATH_LABEL[entryPath]} — entered at the ${QUAL_ROUND_LABEL[entryRound]}`
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

  const qualTies = customUclQual?.ties ?? []
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
        difficulty, custom: customDifficulty, weightedPicksOverride,
        stats: runStats?.stats,
        awards: runStats?.awards,
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
  const nylon = KIT_ROLES.nylon

  return (
    <KitScreen ground="nylon">
      <VerdictBlock
        tone={verdictOf(playerFinalRound)}
        title={resultLabel}
        meta={`UEFA Champions League · the full path · ` + `${playerTeam.clubName} · ${entryText}`}
        punditsText={punditsText}
        shareText={`${resultLabel} — UEFA Champions League · the full path. Perfection or Misery.`}
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
        <PunditsRoundTable rows={championsLeagueCalls(store.clResult as any, store.clTeams.map(t => ({ clubId: t.clubId, clubName: t.clubName, ovr: t.ovr, isPlayer: t.isPlayer })), store.predictionSeed)} />
      )}

      <View style={styles.kitPlates}>
        {(() => {
          const src = runStats ?? (dbRun?.stats && dbRun?.awards ? { stats: dbRun.stats, awards: dbRun.awards } : null)
          if (!src) return null
          const night = buildAwardsNight({
            awards: src.awards, stats: src.stats, rounds: (src as RunStats).rounds,
            clubs: [], playerClubId: playerTeam?.clubId,
          })
          return <Plate label="See the awards" icon="trophy" variant="secondary" roles={nylon} onPress={() => openAwardsView(night, params.runId)} />
        })()}
        {hasHub && <Plate label="The whole run" icon="stats" variant="secondary" roles={nylon} onPress={() => openRunHub(undefined, hubRunId)} />}
      </View>

      {winner && (
        <ResultSection title="Champions of Europe">
          <View style={styles.kitWinner}>
            <KitText t="superM" color={nylon.text}>{winner.clubName.toUpperCase()}</KitText>
            {winner.clubId === playerTeam.clubId && <Tag roles={nylon} variant="you">YOU</Tag>}
          </View>
        </ResultSection>
      )}

      {koRounds.length > 0 && (
        <ResultSection title="Knockouts" right={<InfoBubble topic="knockout_bracket" accent={nylon.text} />}>
          <KnockoutRoundsView title="" rounds={koRounds} maxHeight={100000} />
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
          rows={leaguePhaseStandings.map(t => ({ clubId: t.clubId, clubName: t.clubName, isPlayer: !!t.isPlayer, played: t.stats.played, gd: t.stats.goalsFor - t.stats.goalsAgainst, points: t.stats.points }))}
          onRowPress={hasHub ? id => openClub(id, hubRunId) : undefined} />
        <ZoneLegend roles={nylon} zones={phaseZones} />
      </ResultSection>

      {qualTies.length > 0 && (
        <ResultSection title="Qualifying" right={<InfoBubble topic="qualifying_ladder" accent={nylon.text} />}>
          <KitText t="body" color={nylon.textMuted}>{`How the ${customUclQual!.qualifiers.length} qualifiers reached the league phase`}</KitText>
          <QualifyingLadder ties={qualTies} onTiePress={t => { const m = qualTieToKoMatch(t); if (m) openKoLeg(m, QUAL_ROUND_LABEL[m.round] ?? m.round, true) }} />
        </ResultSection>
      )}

      {associations.length > 0 && (
        <ResultSection title="Domestic leagues">
          <KitText t="body" color={nylon.textMuted}>Every league was played this run; the field came from these tables.</KitText>
          {associations.slice(0, 6).map(a => (
            <ListRow key={a.rank} roles={nylon} label={`#${a.rank} ${flagForCountry(a.country) || ''} ${a.name}`.replace(/\s+/g, ' ')}
              value={`${a.standings[0]?.clubName ?? '—'}${isSpecialFormat(a.format) ? ` · ${FORMAT_LABEL[a.format!]}` : ''}`}
              onPress={() => openLeagueTable(a, playerTeam.clubId)} />
          ))}
          <ListRow roles={nylon} tier="t1" label={`All ${associations.length} leagues`} onPress={() => openLeaguesBrowser(associations, playerTeam.clubId)} />
        </ResultSection>
      )}

      {/* §10.5 phase 4 (R8) — the medical table. */}
      <MedicalTable absences={clResult.absences} accent={prim.cotton} />

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
            {st && <SquadSummary stats={st} draftedPlayers={squad} formation={form ?? null} accent={prim.cotton} runId={params.runId} />}
          </>
        )
      })()}

      <View style={styles.kitPlates}>
        <ListRow roles={nylon} icon="guide" label="How this competition works" onPress={() => openRules()} />
      </View>
      <ResultActions fromHistory={fromHistory} submitting={submitting} save={runSave} onAgain={handlePlayAgain} onHome={handleReturnToHome} />
    </KitScreen>
  )
}

// ── Shared sub-components (from the CL result page) ──────────────────────────
function StatBox({ label, value }: { label: string; value: string }) {
  return <View style={styles.statBox}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>
}

function StandingsRow({ team, pos }: { team: any; pos: number }) {
  const gd = team.stats.goalsFor - team.stats.goalsAgainst
  const zone = pos <= 8 ? prim.volt : pos <= 24 ? colors.warning : '#DC2626'
  return (
    <View style={[styles.tableRow, team.isPlayer && styles.tableRowPlayer]}>
      <View style={[styles.colPos, styles.posCell]}>
        <View style={[styles.zoneDot, { backgroundColor: zone }]} />
        <Text style={[styles.tableColData, team.isPlayer && styles.playerText]}>{pos}</Text>
      </View>
      <Text style={[styles.tableColData, styles.colName, team.isPlayer && styles.playerText]} numberOfLines={1}>{team.clubName}</Text>
      <Text style={[styles.tableColData, styles.colStat, team.isPlayer && styles.playerText]}>{team.stats.played}</Text>
      <Text style={[styles.tableColData, styles.colStat, team.isPlayer && styles.playerText]}>{gd > 0 ? `+${gd}` : gd}</Text>
      <Text style={[styles.tableColData, styles.colStat, styles.colPts, team.isPlayer && styles.playerText]}>{team.stats.points}</Text>
    </View>
  )
}

function TeamMatchdays({ matches, clubId, onOpenMatch }: { matches: CLLeagueMatch[]; clubId: string; onOpenMatch?: (m: CLLeagueMatch) => void }) {
  const own = matches.filter(m => m.home.clubId === clubId || m.away.clubId === clubId).sort((a, b) => a.matchday - b.matchday)
  if (own.length === 0) return <Text style={styles.phaseNote}>No matchday data.</Text>
  return (
    <View style={styles.mdList}>
      {own.map((m, i) => {
        const atHome = m.home.clubId === clubId
        const oppName = atHome ? m.away.clubName : m.home.clubName
        const gf = atHome ? m.homeGoals : m.awayGoals
        const ga = atHome ? m.awayGoals : m.homeGoals
        const rc = gf > ga ? prim.volt : gf < ga ? '#DC2626' : colors.warning
        const myS = summariseScorers(atHome ? m.scorers?.home : m.scorers?.away)
        const oppS = summariseScorers(atHome ? m.scorers?.away : m.scorers?.home)
        return (
          <Pressable key={i} onPress={onOpenMatch ? () => onOpenMatch(m) : undefined} disabled={!onOpenMatch}>
            <View style={styles.mdRow}>
              <Text style={styles.mdNum}>MD{m.matchday}</Text>
              <Text style={styles.mdVenue}>{atHome ? 'vs' : '@'}</Text>
              <Text style={styles.mdOpp} numberOfLines={1}>{oppName}</Text>
              <View style={[styles.mdScoreBadge, { backgroundColor: rc + '22' }]}><Text style={[styles.mdScoreText, { color: rc }]}>{gf}-{ga}</Text></View>
            </View>
            {(myS || oppS) && <Text style={styles.mdScorerLine} numberOfLines={2}>{[myS && `${myS}`, oppS && `· ${oppS}`].filter(Boolean).join('  ')}</Text>}
          </Pressable>
        )
      })}
    </View>
  )
}

type BracketRound = { key: string; label: string; sub: string; matches: CLKnockoutMatch[]; showDirect?: boolean }

const BRACKET_ROW_H = 72



function BracketTeam({ team, won, goals, direct }: { team: any; won: boolean; goals: number; direct: boolean }) {
  return (
    <View style={styles.bracketTeamRow}>
      <Text style={[styles.bracketTeamName, won && styles.bracketTeamWon, team.isPlayer && styles.bracketTeamPlayer]} numberOfLines={1}>
        {direct && <Text style={styles.bracketDirect}>◆ </Text>}{team.clubName}
      </Text>
      <Text style={[styles.bracketTeamGoals, won && styles.bracketTeamWon]}>{goals}</Text>
    </View>
  )
}

const CL_KO_NAMES: Record<string, string> = { playoff: 'Playoff', r16: 'Round of 16', qf: 'Quarter-Final', sf: 'Semi-Final', final: 'Final' }

function ordinal(n: number): string {
  if (n === 1) return 'st'; if (n === 2) return 'nd'; if (n === 3) return 'rd'; return 'th'
}

const styles = StyleSheet.create({
  kitPlates: { gap: space[3], marginTop: space[5] },
  kitNote: { marginTop: space[2] },
  kitWinner: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
  container: { flex: 1, backgroundColor: prim.nylon },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, backgroundColor: prim.nylon, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: typography.md, color: prim.cottonMuted },
  header: { alignItems: 'center', paddingTop: 56, paddingBottom: spacing.xl, gap: spacing.sm },
  competitionLabel: { fontSize: typography.xs, fontFamily: font.bodyBlack, color: prim.cotton, letterSpacing: 3, textTransform: 'uppercase' },
  resultBanner: { fontSize: typography.xxl, fontFamily: font.bodyBlack, textAlign: 'center', letterSpacing: 1 },
  trophy: { fontSize: 56 },
  card: { backgroundColor: prim.nylonRaised, borderRadius: 0, borderWidth: 1, borderColor: prim.ruleNylon, padding: spacing.lg, gap: spacing.md, ...shadows.sm },
  playerTeamRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  playerTeamName: { fontSize: typography.xl, fontFamily: font.bodyBlack, color: prim.cotton },
  playerTeamMeta: { fontSize: typography.sm, color: prim.cottonMuted, marginTop: 2 },
  potPill: { borderRadius: 0, borderWidth: 2, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  potPillText: { fontSize: typography.sm, fontFamily: font.bodyBlack },
  entryBanner: { borderWidth: 1, borderRadius: 0, padding: spacing.sm },
  domesticLine: { fontSize: typography.xs, color: prim.cottonMuted, textAlign: 'center' },
  rulesBtn: { alignSelf: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: 0, borderWidth: 1, borderColor: prim.ruleNylon, backgroundColor: prim.nylonSunken, marginBottom: spacing.md },
  rulesBtnText: { fontSize: typography.xs, color: prim.cottonMuted, fontFamily: font.bodyBold },
  entryText: { fontSize: typography.xs, fontFamily: font.bodyBold, textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: spacing.sm, borderTopWidth: 1, borderTopColor: prim.ruleNylon, paddingTop: spacing.md },
  statBox: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: typography.md, fontFamily: font.bodyBlack, color: prim.cotton },
  statLabel: { fontSize: typography.xs, color: prim.cottonMuted, textAlign: 'center' },
  sectionTitle: { fontSize: typography.md, fontFamily: font.bodyBold, color: prim.cotton },
  phaseNote: { fontSize: typography.xs, color: prim.cottonMuted, textAlign: 'center', marginTop: spacing.xs },

  // domestic leagues
  leagueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: prim.ruleNylon },
  leagueRank: { width: 34, fontSize: 12, fontFamily: font.bodyBlack, color: prim.cotton },
  leagueFlag: { fontSize: 16, width: 24, textAlign: 'center' },
  leaguesScroll: { maxHeight: 340 },
  browseAllBtn: { marginTop: spacing.sm, borderWidth: 1, borderColor: prim.cotton, borderRadius: 0, paddingVertical: spacing.md, alignItems: 'center' },
  browseAllText: { fontSize: typography.sm, fontFamily: font.bodyBlack, color: prim.cotton, letterSpacing: 0.5 },
  leagueName: { fontSize: typography.sm, fontFamily: font.bodyBold, color: prim.cotton },
  leagueChamp: { fontSize: typography.xs, color: prim.cottonMuted, marginTop: 1 },
  leagueCount: { fontSize: 10, color: prim.cottonMuted },
  fmtTag: { backgroundColor: prim.cotton + '22', borderRadius: 0, paddingHorizontal: 6, paddingVertical: 2 },
  fmtTagText: { fontSize: 8, color: prim.cotton, fontFamily: font.bodyBold },
  fmtExplainer: { fontSize: typography.xs, color: prim.cottonMuted, lineHeight: 17, marginTop: spacing.xs, marginBottom: spacing.sm },
  leagueTableHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: prim.ruleNylon },
  leagueTableHeadTxt: { fontSize: 9, color: prim.cottonMuted, fontFamily: font.bodyBold, textTransform: 'uppercase' },
  leagueTableRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: prim.ruleNylon },
  leagueTablePos: { width: 22, fontSize: 12, color: prim.cottonMuted, textAlign: 'center' },
  leagueTableName: { flex: 1, fontSize: typography.sm, color: prim.cotton },
  leagueTableWdl: { width: 56, fontSize: 11, color: prim.cottonMuted, textAlign: 'center' },
  leagueTablePts: { width: 30, fontSize: typography.sm, fontFamily: font.bodyBold, color: prim.cotton, textAlign: 'right' },

  tableHeaderRow: { flexDirection: 'row', paddingBottom: spacing.xs, borderBottomWidth: 1, borderBottomColor: prim.ruleNylon },
  standingsScroll: { maxHeight: 360 },
  tableRow: { flexDirection: 'row', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: prim.ruleNylon, alignItems: 'center' },
  tableRowPlayer: { backgroundColor: prim.cotton + '11', borderColor: prim.cotton, borderWidth: 1, borderRadius: 0 },
  tableCol: { fontSize: 10, fontFamily: font.bodyBold, color: prim.cottonMuted },
  tableColData: { fontSize: 11, color: prim.cottonMuted },
  playerText: { color: prim.cotton, fontFamily: font.bodyBold },
  colPos: { width: 34, textAlign: 'center' as any },
  posCell: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  zoneDot: { width: 6, height: 6, borderRadius: 3 },
  colName: { flex: 1, paddingLeft: spacing.xs },
  colStat: { width: 28, textAlign: 'center' as any },
  colPts: { width: 32, fontFamily: font.bodyBold },

  mdList: { gap: spacing.xs },
  mdRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 3 },
  mdNum: { width: 34, fontSize: 10, fontFamily: font.bodyBold, color: prim.cottonMuted },
  mdVenue: { width: 16, fontSize: 10, color: prim.cottonMuted },
  mdOpp: { flex: 1, fontSize: 12, color: prim.cottonMuted },
  mdScoreBadge: { borderRadius: 0, paddingHorizontal: spacing.sm, paddingVertical: 2, minWidth: 40, alignItems: 'center' },
  mdScoreText: { fontSize: 12, fontFamily: font.bodyBlack },
  mdScorerLine: { fontSize: 9, color: prim.cottonMuted, paddingLeft: 34, paddingBottom: 4 },
  koTieAgg: { fontSize: typography.md, fontFamily: font.bodyBold, color: prim.cotton, textAlign: 'center', marginVertical: spacing.xs },
  koModalNote: { fontSize: typography.xs, color: colors.warning, textAlign: 'center' },
  koModalPens: { fontSize: typography.sm, color: prim.cotton, fontFamily: font.bodyBold, textAlign: 'center', marginBottom: spacing.sm },
  koLegBlock: { borderTopWidth: 1, borderTopColor: prim.ruleNylon, paddingTop: spacing.sm, marginTop: spacing.xs, gap: 2 },
  koLegLabel: { fontSize: typography.xs, color: prim.cottonMuted, fontFamily: font.bodyBold, textTransform: 'uppercase', letterSpacing: 1 },
  koLegScore: { fontSize: typography.sm, color: prim.cotton, fontFamily: font.bodyBold },
  koLegScorer: { fontSize: typography.xs, color: prim.cottonMuted },

  bracketScroll: { marginHorizontal: -spacing.xs, marginTop: spacing.sm },
  bracketRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.xs },
  bracketCol: { width: 158 },
  bracketColLabel: { fontSize: typography.xs, fontFamily: font.bodyBlack, color: prim.cottonMuted, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' },
  bracketColSub: { fontSize: 8, color: prim.cotton, textAlign: 'center', marginBottom: spacing.xs },
  bracketColBody: { justifyContent: 'space-around' },
  bracketCard: { backgroundColor: prim.nylonSunken, borderRadius: 0, borderWidth: 1, borderColor: prim.ruleNylon, paddingVertical: 4, paddingHorizontal: spacing.sm },
  bracketCardPlayer: { borderColor: prim.cotton, backgroundColor: prim.cotton + '11' },
  bracketTeamRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  bracketTeamName: { flex: 1, fontSize: 10, color: prim.cottonMuted },
  bracketTeamWon: { color: prim.cotton, fontFamily: font.bodyBlack },
  bracketTeamPlayer: { color: prim.cotton },
  bracketTeamGoals: { fontSize: 11, fontFamily: font.bodyBold, color: prim.cottonMuted, width: 14, textAlign: 'right' },
  bracketDirect: { color: colors.tiers.perfection },
  bracketDivider: { minHeight: 10, alignItems: 'center', justifyContent: 'center' },
  bracketSuffix: { fontSize: 8, color: colors.warning, fontFamily: font.bodyBold },
  bracketLegs: { fontSize: 8, color: prim.cottonMuted },
  winnerCard: { alignItems: 'center', backgroundColor: colors.tiers.perfection + '11', borderColor: colors.tiers.perfection },
  winnerLabel: { fontSize: typography.xs, color: prim.cottonMuted, fontFamily: font.bodyBold, textTransform: 'uppercase', letterSpacing: 1 },
  winnerName: { fontSize: typography.xxl, fontFamily: font.bodyBlack, color: colors.tiers.perfection },
  winnerOvr: { fontSize: typography.sm, color: prim.cottonMuted },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  modalCard: { width: '100%', maxHeight: '80%', backgroundColor: prim.nylonRaised, borderRadius: 0, borderWidth: 1, borderColor: prim.ruleNylon, padding: spacing.lg, gap: spacing.sm },
  modalTitle: { fontSize: typography.lg, fontFamily: font.bodyBlack, color: prim.cotton },
  modalClose: { marginTop: spacing.md, backgroundColor: prim.nylonSunken, borderRadius: 0, paddingVertical: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: prim.ruleNylon },
  modalCloseText: { fontSize: typography.md, fontFamily: font.bodyBold, color: prim.cotton },
  buttonRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  actionBtn: { flex: 1, backgroundColor: prim.cotton, borderRadius: 0, paddingVertical: spacing.lg, alignItems: 'center', ...shadows.md },
  actionBtnSecondary: { backgroundColor: prim.nylonSunken, borderWidth: 1, borderColor: prim.ruleNylon },
  actionBtnText: { fontSize: typography.md, fontFamily: font.bodyBlack, color: prim.cotton, letterSpacing: 1.5 },
})
