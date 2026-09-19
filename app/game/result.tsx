import React, { useState, useMemo, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, Pressable, ScrollView, Dimensions, ActivityIndicator
} from 'react-native'
import { openRunHub, openClub } from '@/lib/runNav'
import Svg, { Line, Polyline, Text as SvgText, G } from 'react-native-svg'
import { router, useLocalSearchParams } from 'expo-router'
import { restartToModeSelect, exitToHome } from '@/lib/nav'
import { useGameStore } from '@/store/gameStore'
import { useUserStore } from '@/store/userStore'
import { saveRun, fetchRunById } from '@/db/queries/runs'
import { mergeCareerFromRun } from '@/db/queries/career'
import { getAllClubsData } from '@/db/queries/seasons'
import { summariseScorers, computeLeagueRunStats } from '@/engine/run-stats'
import { openMatchStats } from '@/lib/matchStats'
import { getSlotsForFormation } from '@/engine/formations'
import { LineupPitch } from '@/components/LineupPitch'
import { SquadSummary } from '@/components/SquadSummary'
import { MedicalTable } from '@/components/MedicalTable'
import type { CompetitionStats, SeasonAwards } from '@/types/stats'
import { colors, spacing, typography, radius, shadows, prim, font } from '@/theme'
import { ROLES as KIT_ROLES } from '@/theme'
const nylon = KIT_ROLES.nylon
import { useModeTheme } from '@/hooks/useModeTheme'
import { useRunSave } from '@/hooks/useRunSave'
import { takeRunStats, clubsForManagerAward, openAwardsView, type RunStats } from '@/lib/awardsNight'
import { buildAwardsNight } from '@/engine/awards'
import { Plate, KitScreen, KitText, SectionTag, Tag, ListRow, EmptyState } from '@/components/kit'
import { SeasonStrip, PositionGraph, ResultRow, LeagueTable, ZoneLegend, leagueTableZones, type Mark, type TableRowVM } from '@/components/season/SeasonParts'
import { zonesFor } from '@/data/qualification-bands'
import { ResultFigures, ResultActions } from '@/components/season/ResultParts'
import { space } from '@/theme'
import { VerdictBlock, PunditsTable } from '@/components/season/VerdictBlock'
import { predictTable } from '@/engine/predictions'
import { calculateScore } from '@/db/queries/leaderboard'
import { resolveDifficulty } from '@/engine/difficulty'
import { SaveStatusLine } from '@/components/ui'
import type { Tier } from '@/types/simulation'
import { TIER_LABEL, formatTier, verdictOf } from '@/data/tiers'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

// Custom SVG position chart — position 1 at top, scrollable horizontally
const T = (tier: Tier) => TIER_LABEL[tier].toUpperCase()
const TIER_META: Record<Tier, { title: string; desc: string; emoji: string }> = {
  perfection: {
    title: T('perfection'),
    desc: 'You won the league and won every match.',
    emoji: '',
  },
  almost_perfection: {
    title: T('almost_perfection'),
    desc: 'You won the league without losing a match.',
    emoji: '',
  },
  champions: {
    title: T('champions'),
    desc: 'You won the league.',
    emoji: '',
  },
  title_contender: {
    title: T('title_contender'),
    desc: 'A podium finish, pushing the champions all the way.',
    emoji: '',
  },
  champions_league: {
    title: T('champions_league'),
    desc: 'A top-four finish and a place in the Champions League.',
    emoji: '',
  },
  europa_glory: {
    title: T('europa_glory'),
    desc: 'A top-seven finish and European football.',
    emoji: '',
  },
  almost_matters: {
    title: T('almost_matters'),
    desc: 'Top half, comfortably mid-table. Safe, respectable, a bit forgettable.',
    emoji: '',
  },
  respectful_mediocrity: {
    title: T('respectful_mediocrity'),
    desc: 'You stayed up, only just, after a season of scraping by. Recruit better next time.',
    emoji: '',
  },
  absolute_misery: {
    title: T('absolute_misery'),
    desc: 'Relegated, bottom three, after a disastrous season.',
    emoji: '',
  },
}

export default function ResultScreen() {
  const store = useGameStore()
  const { simResult, resetRun, mode, formation, placedLeague, draftedPlayers, benchPlayers, quickSim, difficulty, customDifficulty } = store
  const fullSquad = [...draftedPlayers, ...benchPlayers]
  const { user, isGuest } = useUserStore()
  const theme = useModeTheme()
  const params = useLocalSearchParams<{ runId: string }>()
  const [selectedMatchday, setSelectedMatchday] = useState<number | null>(null)

  // Deep-stats entry point: any finished fixture row → the full match-stats
  // screen. It also closes whatever modal you came from, so backing out of the
  // stats screen doesn't drop you into a modal you never asked to reopen.
  const openFixtureDetail = (fixture: any, mdLabel: string, matchday?: number) => {
    if (!fixture?.result) return
    // A run opened from history has no `placedLeague`/squad in the store (the
    // run was reset on exit), so fall back to the saved row — without this,
    // every fixture tap on a saved run silently did nothing.
    const yearStart = placedLeague?.yearStart ?? dbRunData?.year_start
    if (yearStart == null) return
    // §10 R6/R7 — every finished fixture of the season, so the screen can show
    // the table as it stood and both sides' form going into this game.
    const contextMatches = ((resultData?.matchdayHistory ?? []) as any[]).flatMap(snap =>
      (snap.fixtures ?? []).filter((f: any) => f.result).map((f: any) => ({
        matchday: snap.matchday, label: `Matchday ${snap.matchday}`,
        homeClubId: f.home.clubId, homeClubName: f.home.clubName,
        awayClubId: f.away.clubId, awayClubName: f.away.clubName,
        homeGoals: f.result.homeGoals, awayGoals: f.result.awayGoals,
        // Carried so form rows and the next fixture are tappable in their own right.
        scorers: f.scorers, seed: f.seed,
        homeRotation: f.homeRotation, awayRotation: f.awayRotation,
        absent: f.absent, standIns: f.standIns,
      })))
    openMatchStats({
      homeClubId: fixture.home.clubId, homeName: fixture.home.clubName,
      awayClubId: fixture.away.clubId, awayName: fixture.away.clubName,
      homeGoals: fixture.result.homeGoals, awayGoals: fixture.result.awayGoals,
      scorers: fixture.scorers, seed: fixture.seed,
      homeRotation: fixture.homeRotation, awayRotation: fixture.awayRotation,
      absent: fixture.absent, standIns: fixture.standIns,
      yearStart,
      competitionLabel: mdLabel,
      playerClubId: resultData?.table?.find((t: any) => t.isPlayer)?.clubId,
      // Your XI replaced a real club, so the sheet needs the drafted squad to
      // resolve your players — the store is empty on a history load.
      drafted: (isFreshRun ? fullSquad : dbRunData?.squad ?? []) as any,
      playerFormation: (isFreshRun ? formation : dbRunData?.formation) ?? undefined,
      matchday, contextMatches,
    }, prim.cotton)
  }

  // Season Highlights name a match by opponent + scoreline (player-first) rather
  // than holding a fixture reference — resolve it back to the real fixture so
  // those rows open the same deep-stats sheet as every other match row.
  const findHighlightFixture = (opponent: string, score: string) => {
    for (const snap of (resultData?.matchdayHistory ?? []) as any[]) {
      for (const f of (snap.fixtures ?? []) as any[]) {
        if (!f.result) continue
        const isHome = f.home.isPlayer
        if (!isHome && !f.away.isPlayer) continue
        if ((isHome ? f.away.clubName : f.home.clubName) !== opponent) continue
        const gf = isHome ? f.result.homeGoals : f.result.awayGoals
        const ga = isHome ? f.result.awayGoals : f.result.homeGoals
        if (`${gf}-${ga}` === score) return { fixture: f, matchday: snap.matchday }
      }
    }
    return null
  }
  const [runStats, setRunStats] = useState<RunStats | null>(null)
  // Re-entry guard for the save/exit buttons — a quick double-tap (or tapping
  // both buttons) used to fire saveRun twice. Declared up here so it sits above
  // the early returns and never violates the rules of hooks.
  const submittingRef = useRef(false)
  const [submitting, setSubmitting] = useState(false)

  // A "fresh" run has the live squad + scorers in store (vs a history load).
  const isFreshRun = !!(simResult?.matchdayHistory?.length && draftedPlayers.length > 0 && placedLeague)
  // Preload the squad stats up-front so the whole result page lands ready (a
  // slightly longer first load, but nothing pops in afterwards).
  const [preloading, setPreloading] = useState(isFreshRun)
  // Saves on its own once the stats are in — see useRunSave for why.
  const runSave = useRunSave({
    applies: isFreshRun && !quickSim && !params.runId,
    signedIn: !!user && !isGuest,
    ready: !preloading,
  })

  useEffect(() => {
    if (!isFreshRun) return
    // Awards Night already paid for these (src/lib/awardsNight.ts): reading
    // them back saves regenerating every match sheet a second time.
    const ready = takeRunStats()
    if (ready) { setRunStats(ready); setPreloading(false); return }
    computeLeagueRunStats(simResult!, fullSquad, placedLeague!, store.useSubstitutes)
      .then(res => res && setRunStats(res))
      .catch(e => console.warn('[result] stats compute failed:', e))
      .finally(() => setPreloading(false))
  }, [])
  const [loadingRun, setLoadingRun] = useState(false)
  const [dbRunData, setDbRunData] = useState<any>(null)

  // Load run from database if runId is provided
  useEffect(() => {
    async function loadRun() {
      if (params.runId) {
        setLoadingRun(true)
        try {
          const run = await fetchRunById(params.runId)
          setDbRunData(run)
        } catch (error) {
          console.error('[result] Failed to load run:', error)
        } finally {
          setLoadingRun(false)
        }
      }
    }
    loadRun()
  }, [params.runId])

  // Use simResult from store or dbRunData from database
  const resultData = dbRunData ? {
    finalPosition: dbRunData.final_position,
    teamsInLeague: dbRunData.teams_in_league,
    wins: dbRunData.wins,
    draws: dbRunData.draws,
    losses: dbRunData.losses,
    goalsFor: dbRunData.goals_for,
    goalsAgainst: dbRunData.goals_against,
    biggestWin: dbRunData.highlights?.biggestWin ?? null,
    worstLoss: dbRunData.highlights?.worstLoss ?? null,
    upsets: dbRunData.highlights?.upsets ?? [],
    tier: dbRunData.tier,
    playerTeam: { ovr: dbRunData.team_ovr, stats: { played: dbRunData.wins + dbRunData.draws + dbRunData.losses, won: dbRunData.wins, drawn: dbRunData.draws, lost: dbRunData.losses, goalsFor: dbRunData.goals_for, goalsAgainst: dbRunData.goals_against, points: dbRunData.wins * 3 + dbRunData.draws } },
    // Use final matchday standings as table if available
    table: dbRunData.matchday_history && dbRunData.matchday_history.length > 0 
      ? dbRunData.matchday_history[dbRunData.matchday_history.length - 1].standings 
      : [],
    // @ts-ignore - matchday_history column needs to be added to DB
    matchdayHistory: dbRunData.matchday_history || [],
    // §10.5 phase 4 — the medical table. Saved runs from before phase 4 simply
    // have none, and the section drops out.
    absences: dbRunData.highlights?.absences ?? [],
  } : simResult

  if (loadingRun || preloading) {
    return (
      <KitScreen ground="nylon">
        <KitText t="bodyL" color={nylon.textMuted} style={{ marginTop: space[6] }}>{preloading ? 'Tallying the season.' : 'Loading the run.'}</KitText>
      </KitScreen>
    )
  }

  if (!resultData) {
    return (
      <KitScreen ground="nylon">
        <EmptyState roles={nylon} title="No season here" body="This run has ended or the page was reloaded." />
        <Plate label="Back to modes" roles={nylon} variant="secondary" onPress={() => router.replace('/game/mode-select')} />
      </KitScreen>
    )
  }

  const {
    finalPosition,
    teamsInLeague,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    biggestWin,
    worstLoss,
    upsets,
    tier,
    playerTeam,
    table,
    matchdayHistory
  } = resultData

  // Fall back gracefully for non-league tiers (e.g. World Cup / UCL runs loaded
  // from history store a round name like "winner" or "sf" as their tier).
  const meta = TIER_META[tier as Tier] ?? {
    title: formatTier(tier).toUpperCase(),
    desc: '',
    emoji: '',
  }
  const tierColor = (colors.tiers as any)[tier as Tier] ?? prim.cotton
  const gd = goalsFor - goalsAgainst

  // The verdict's own lines: where you played, what the run scored, and how it
  // compares with the pundits' pre-season call (they're seeded on the run, so
  // the same table is rebuilt here rather than stored twice).
  const takeoverLine = (() => {
    const lg = placedLeague?.leagueName ?? dbRunData?.league_name ?? dbRunData?.leagueName
    const ys = placedLeague?.yearStart ?? dbRunData?.year_start ?? dbRunData?.yearStart
    const season = ys ? `${ys}/${String(ys + 1).slice(-2)}` : null
    const rawClub = (playerTeam as any)?.clubName
    const club = placedLeague?.replacedTeamName ?? dbRunData?.replaced_team_name
      ?? (rawClub && rawClub !== 'Your XI' ? rawClub : null)
    if (!lg && !club) return null
    return `${[lg, season].filter(Boolean).join(' ')}${club ? ` · You took over ${club}` : ''}`
  })()
  // Plain consts, NOT hooks: everything from here down sits below the "no
  // result" early return, so a hook here changes the hook order between
  // renders (React: "Rendered more hooks than during the previous render").
  // Both are cheap — arithmetic, and one seeded sort of the league.
  const difficultyMultiplier = resolveDifficulty(difficulty, customDifficulty, mode ?? undefined).scoreMultiplier
  const runScore = calculateScore({
    mode: mode ?? 'league', finalPosition, teamsInLeague, teamOvr: playerTeam.ovr,
    losses, draws, difficultyMultiplier,
  })
  const punditCheck = (() => {
    if (store.predictionSeed == null || !placedLeague) return null
    const you = predictTable(placedLeague.teams, store.predictionSeed).player
    return you ? { predicted: you.predicted, actual: finalPosition, field: teamsInLeague } : null
  })()

  // Default to final matchday if not selected
  const currentMatchday = selectedMatchday ?? matchdayHistory.length
  const currentSnapshot = matchdayHistory[currentMatchday - 1]

  function persistCareer() {
    if (!user || isGuest || quickSim || !runStats) return
    const pots = runStats.awards.playerOfTheSeason[0]
    const u21  = runStats.awards.bestU21[0]
    mergeCareerFromRun(user.id, {
      competition: 'league',
      yourPlayers: runStats.stats.players.filter(p => p.isPlayerClub),
      goalsFor, goalsAgainst,
      potsWinnerId: pots?.isPlayerClub ? pots.playerId : undefined,
      u21WinnerId:  u21?.isPlayerClub ? u21.playerId  : undefined,
    }).catch(e => console.warn('[career] merge failed:', e))
  }

  // Handed to useRunSave, which guarantees it runs once. It throws on failure so
  // the screen can show "couldn't save" instead of pretending it worked.
  async function saveCurrentRun() {
    if (user && !isGuest && !quickSim && mode && formation && placedLeague && simResult) {
      await saveRun({
        userId: user.id,
        mode,
        formation,
        teamOvr: playerTeam.ovr,
        leagueId: placedLeague.leagueId,
        leagueName: placedLeague.leagueName,
        yearStart: placedLeague.yearStart,
        seasonResult: simResult,
        squad: fullSquad,
        matchdayHistory: simResult.matchdayHistory,
        difficulty, custom: customDifficulty,
        stats: runStats?.stats,
        awards: runStats?.awards,
      })
    }
    persistCareer()
  }
  runSave.setTask(saveCurrentRun)

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

  // ── P8-54: the result screen, rebuilt ─────────────────────────────────────
  // The verdict first, then the season told with the SAME pieces the live
  // season used (the strip, result rows, the zoned table), so the result reads
  // as the end of that screen rather than a different app. The deep stuff
  // (every club, every player, the press) lives on the run hub, one plate away.
  const history = (matchdayHistory ?? []) as any[]
  const youId = (table as any[])?.find((t: any) => t.isPlayer)?.clubId as string | undefined
  const marks: Mark[] = history.map(snap => {
    const f = (snap.fixtures ?? []).find((x: any) => x.result && (x.home.isPlayer || x.away.isPlayer))
    if (!f) return 'D'
    const d = f.home.isPlayer ? f.result.homeGoals - f.result.awayGoals : f.result.awayGoals - f.result.homeGoals
    return d > 0 ? 'W' : d < 0 ? 'L' : 'D'
  })
  const viewMD = selectedMatchday ?? history.length
  const snap = history[viewMD - 1]
  const prevSnap = history[viewMD - 2]
  const leagueId = placedLeague?.leagueId ?? dbRunData?.league_id
  const yearStart = placedLeague?.yearStart ?? dbRunData?.year_start
  const standings = ((snap?.standings ?? table) as any[])
  const tableZones = leagueId && yearStart ? leagueTableZones(zonesFor(leagueId, yearStart, standings.length)) : standings.map(() => null)
  const rows: TableRowVM[] = standings.map((t: any) => ({
    clubId: t.clubId, clubName: t.clubName, isPlayer: !!t.isPlayer,
    played: t.stats.played, gd: t.stats.goalsFor - t.stats.goalsAgainst, points: t.stats.points,
  }))
  const positions = youId ? history.map(h => h.standings.findIndex((t: any) => t.clubId === youId) + 1) : []
  const move = snap && prevSnap && youId ? prevSnap.standings.findIndex((t: any) => t.clubId === youId) - snap.standings.findIndex((t: any) => t.clubId === youId) : null
  const hasHub = isFreshRun || !!(params.runId && dbRunData?.stats)
  const highlights = [
    biggestWin && { key: 'win', label: 'Biggest win', opponent: biggestWin.opponent, score: biggestWin.score },
    worstLoss && { key: 'loss', label: 'Worst defeat', opponent: worstLoss.opponent, score: worstLoss.score },
    upsets.length > 0 && { key: 'upset', label: `Shock defeats · ${upsets.length}`, opponent: upsets[0].opponent, score: upsets[0].score },
  ].filter(Boolean) as { key: string; label: string; opponent: string; score: string }[]

  return (
    <KitScreen ground="nylon">
      <VerdictBlock
        tone={verdictOf(tier)}
        title={meta.title}
        line={`${meta.desc} Finished ${finalPosition} of ${teamsInLeague}.`}
        meta={takeoverLine ?? undefined}
        score={runScore ?? undefined}
        multiplier={difficultyMultiplier}
        pundits={punditCheck ?? undefined}
        shareText={`${meta.title} — ${finalPosition} of ${teamsInLeague}${takeoverLine ? `, ${takeoverLine}` : ''}. Perfection or Misery.`}
      />

      <ResultFigures items={[['Pts', playerTeam.stats.points], ['W', wins], ['D', draws], ['L', losses], ['GD', gd > 0 ? `+${gd}` : gd], ['For', goalsFor], ['Ag', goalsAgainst]]} />

      {/* P8-24 — the pundits' whole table beside the real one. */}
      {(() => {
        if (store.predictionSeed == null || !placedLeague || !table?.length) return null
        const predicted = new Map(predictTable(placedLeague.teams, store.predictionSeed).table.map(r => [r.clubId, r.predicted]))
        return (
          <PunditsTable rows={(table as any[]).map((t, i) => ({
            clubId: t.clubId, clubName: t.clubName, finalPosition: i + 1,
            predicted: predicted.get(t.clubId) ?? i + 1, isPlayer: !!t.isPlayer,
          }))} />
        )
      })()}

      <View style={styles.kitPlates}>
        {(() => {
          const src = runStats ?? (dbRunData?.stats && dbRunData?.awards ? { stats: dbRunData.stats, awards: dbRunData.awards } : null)
          if (!src) return null
          const night = buildAwardsNight({
            awards: src.awards, stats: src.stats, rounds: (src as RunStats).rounds,
            clubs: clubsForManagerAward(placedLeague?.teams, simResult?.table, store.predictionSeed), playerClubId: youId,
          })
          return <Plate label="See the awards" icon="trophy" variant="secondary" roles={nylon} onPress={() => openAwardsView(night, params.runId)} />
        })()}
        {hasHub && <Plate label="The whole run" icon="stats" variant="secondary" roles={nylon} onPress={() => openRunHub(undefined, params.runId)} accessibilityHint="Every club, player, match and story" />}
      </View>

      {history.length > 0 && (
        <View style={styles.kitSection}>
          <SectionTag roles={nylon}>Your season</SectionTag>
          <SeasonStrip roles={nylon} marks={marks} total={history.length} viewing={selectedMatchday} onPick={setSelectedMatchday} />
          {positions.length > 1 && <PositionGraph roles={nylon} values={positions.slice(0, viewMD)} clubs={standings.length} />}
        </View>
      )}

      {snap && (
        <View style={styles.kitSection}>
          <SectionTag roles={nylon}>{`Matchday ${viewMD}${viewMD === history.length ? ' · the last day' : ''}`}</SectionTag>
          {(snap.fixtures ?? []).filter((f: any) => f.result).map((f: any, k: number) => (
            <ResultRow key={k} roles={nylon} homeName={f.home.clubName} awayName={f.away.clubName}
              homeGoals={f.result.homeGoals} awayGoals={f.result.awayGoals}
              youSide={f.home.isPlayer ? 'home' : f.away.isPlayer ? 'away' : null}
              scorers={[summariseScorers(f.scorers?.home), summariseScorers(f.scorers?.away)].filter(Boolean).join(' · ') || undefined}
              onPress={() => openFixtureDetail(f, `Matchday ${viewMD}`, viewMD)} />
          ))}
        </View>
      )}

      <View style={styles.kitSection}>
        <View style={styles.kitHeadRow}>
          <SectionTag roles={nylon}>{viewMD === history.length || !snap ? 'Final table' : `Table after matchday ${viewMD}`}</SectionTag>
          {move ? <Tag roles={nylon} variant={move > 0 ? 'win' : 'loss'}>{move > 0 ? `UP ${move}` : `DOWN ${-move}`}</Tag> : null}
        </View>
        <LeagueTable roles={nylon} rows={rows} zones={tableZones} onRowPress={hasHub ? id => openClub(id, params.runId) : undefined} />
        <ZoneLegend roles={nylon} zones={tableZones} />
      </View>

      {highlights.length > 0 && (
        <View style={styles.kitSection}>
          <SectionTag roles={nylon}>Highlights</SectionTag>
          {highlights.map(h => {
            const found = findHighlightFixture(h.opponent, h.score)
            return (
              <ListRow key={h.key} roles={nylon} label={h.label} value={`${h.score} v ${h.opponent}`}
                onPress={found ? () => openFixtureDetail(found.fixture, `Matchday ${found.matchday}`, found.matchday) : undefined} />
            )
          })}
        </View>
      )}

      {/* §10.5 phase 4 (R8) — the medical table: who missed what. Absent for pre-phase-4 saves. */}
      <MedicalTable absences={resultData?.absences} accent={prim.cotton} />

      {/* Lineup + squad — from the live run, or rehydrated from a saved one. Bench
          players included so SquadSummary can resolve every row (Big Fixes §5.1). */}
      {(() => {
        const squad = (isFreshRun ? fullSquad : dbRunData?.squad ?? []) as any[]
        const bench = (isFreshRun ? benchPlayers : (dbRunData?.squad ?? []).filter((p: any) => p.isBench)) as any[]
        const form  = (isFreshRun ? formation : dbRunData?.formation) as any
        const st    = runStats?.stats ?? dbRunData?.stats ?? null
        return (
          <>
            {form && squad.length > 0 && <LineupPitch formation={form} draftedPlayers={squad} benchPlayers={bench} title="Your Lineup" />}
            {st && <SquadSummary stats={st} draftedPlayers={squad} formation={form ?? null} accent={prim.cotton} runId={params.runId} />}
          </>
        )
      })()}

      <ResultActions fromHistory={!!params.runId} submitting={submitting} save={runSave} onAgain={handlePlayAgain} onHome={handleReturnToHome} />
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  kitFigures: { flexDirection: 'row', flexWrap: 'wrap', gap: space[4], marginTop: space[5] },
  kitFigure: { minWidth: 44 },
  kitPlates: { gap: space[3], marginTop: space[5] },
  kitSection: { gap: space[2], marginTop: space[6] },
  kitHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  container: {
    flex: 1,
    backgroundColor: prim.nylon,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: prim.nylon,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    color: prim.cottonMuted,
    fontSize: typography.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: 56,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: prim.ruleNylon,
  },
  headerTitle: {
    fontSize: typography.lg,
    fontFamily: font.bodyBlack,
    color: prim.cotton,
  },
  placeholder: {
    width: 32,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  tierCard: {
    backgroundColor: prim.nylonRaised,
    borderRadius: 0,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 2,
    gap: spacing.sm,
    ...shadows.md,
  },
  tierEmoji: {
    fontSize: 54,
  },
  tierTitle: {
    fontSize: typography.xl,
    fontFamily: font.bodyBlack,
    textAlign: 'center',
    letterSpacing: 1,
  },
  positionText: {
    fontSize: typography.md,
    fontFamily: font.bodyBold,
    color: prim.cotton,
  },
  tierDesc: {
    fontSize: typography.sm,
    color: prim.cottonMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  takeoverText: {
    fontSize: typography.xs,
    color: prim.cottonMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    fontFamily: font.bodyBold,
  },
  sectionTitle: {
    fontSize: typography.md,
    fontFamily: font.bodyBold,
    color: prim.cotton,
    marginBottom: spacing.xs,
  },
  statsCard: {
    backgroundColor: prim.nylonRaised,
    borderRadius: 0,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: prim.ruleNylon,
    gap: spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  statBox: {
    flex: 1,
    backgroundColor: prim.nylonSunken,
    borderRadius: 0,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: prim.ruleNylon,
  },
  statVal: {
    fontSize: typography.lg,
    fontFamily: font.bodyBlack,
    color: prim.cotton,
  },
  statLbl: {
    fontSize: typography.xs,
    color: prim.cottonMuted,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: prim.ruleNylon,
    paddingTop: spacing.md,
  },
  rowStatText: {
    fontSize: 10,
    color: prim.cottonMuted,
    fontFamily: font.bodyMedium,
  },
  highlightsCard: {
    backgroundColor: prim.nylonRaised,
    borderRadius: 0,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: prim.ruleNylon,
    gap: spacing.sm,
  },
  highlightsList: {
    gap: spacing.sm,
  },
  highlightItem: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
    backgroundColor: prim.nylonSunken,
    padding: spacing.md,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: prim.ruleNylon,
  },
  highlightLabel: {
    fontSize: typography.sm,
    fontFamily: font.bodyBold,
    color: prim.cotton,
  },
  highlightValueBlock: {
    fontSize: typography.sm,
    color: prim.cottonMuted,
    flexWrap: 'wrap',
    flexShrink: 1,
  },
  highlightValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  highlightChevron: {
    fontSize: typography.md,
    fontFamily: font.bodyBold,
    color: prim.cottonMuted,
  },
  tableCard: {
    backgroundColor: prim.nylonRaised,
    borderRadius: 0,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: prim.ruleNylon,
    gap: spacing.xs,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: prim.ruleNylon,
    marginBottom: spacing.xs,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: prim.ruleNylon,
    alignItems: 'center',
  },
  tableRowPlayer: {
    backgroundColor: prim.cotton + '11',
    borderColor: prim.cotton,
    borderWidth: 1,
    borderRadius: 0,
  },
  playerRowText: {
    color: prim.cotton,
    fontFamily: font.bodyBold,
  },
  tableCol: {
    fontSize: 10,
    fontFamily: font.bodyBold,
    color: prim.cottonMuted,
  },
  tableColData: {
    fontSize: 11,
    color: prim.cottonMuted,
  },
  colPos: {
    width: 20,
    textAlign: 'center',
  },
  colName: {
    flex: 1,
    paddingLeft: spacing.xs,
  },
  colStat: {
    width: 25,
    textAlign: 'center',
  },
  colPts: {
    width: 32,
    fontFamily: font.bodyBold,
  },
  actionBtn: {
    backgroundColor: prim.cotton,
    borderRadius: 0,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
    ...shadows.md,
    flex: 1,
  },
  actionBtnSecondary: {
    backgroundColor: prim.nylonSunken,
    borderWidth: 1,
    borderColor: prim.ruleNylon,
  },
  actionBtnText: {
    fontSize: typography.md,
    fontFamily: font.bodyBlack,
    color: prim.cotton,
    letterSpacing: 1.5,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  matchdayCard: {
    backgroundColor: prim.nylonRaised,
    borderRadius: 0,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: prim.ruleNylon,
    gap: spacing.md,
  },
  matchdaySelector: {
    gap: spacing.sm,
  },
  matchdaySelectorLabel: {
    fontSize: typography.sm,
    color: prim.cottonMuted,
    fontFamily: font.bodyMedium,
  },
  matchdayScroll: {
    flexDirection: 'row',
  },
  matchdayChip: {
    backgroundColor: prim.nylonSunken,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: prim.ruleNylon,
    marginRight: spacing.sm,
  },
  matchdayChipActive: {
    backgroundColor: prim.cotton,
    borderColor: prim.cotton,
  },
  matchdayChipText: {
    fontSize: typography.sm,
    color: prim.cottonMuted,
    fontFamily: font.bodyBold,
  },
  matchdayChipTextActive: {
    color: prim.cotton,
  },
  matchdayFixtures: {
    gap: spacing.sm,
  },
  matchdaySectionTitle: {
    fontSize: typography.sm,
    fontFamily: font.bodyBold,
    color: prim.cotton,
    marginBottom: spacing.xs,
  },
  squadStatRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: prim.ruleNylon },
  squadPos: { width: 36, fontSize: 10, color: prim.cottonMuted, fontFamily: font.bodyBold },
  squadName: { flex: 1, fontSize: typography.sm, color: prim.cotton },
  squadLine: { fontSize: typography.xs, color: prim.cottonMuted },
  squadNotable: { fontSize: 10, fontFamily: font.bodyBold },
  squadMore: { fontSize: typography.sm, fontFamily: font.bodyBold, textAlign: 'center' },
  fixtureRowWrap: { marginBottom: spacing.sm },
  fixtureScorers: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.xs, marginTop: 3 },
  fixtureScorerHalf: { flex: 1, fontSize: 10, color: prim.cottonMuted },
  fixtureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: prim.nylonSunken,
    padding: spacing.md,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: prim.ruleNylon,
  },
  fixtureRowPlayer: {
    backgroundColor: prim.cotton + '11',
    borderColor: prim.cotton,
  },
  fixtureTeam: {
    flex: 1,
    fontSize: typography.sm,
    color: prim.cottonMuted,
    fontFamily: font.bodyMedium,
  },
  fixtureTeamHome: {
    textAlign: 'right',
  },
  fixtureTeamAway: {
    textAlign: 'left',
  },
  fixtureTeamPlayer: {
    color: prim.cotton,
    fontFamily: font.bodyBold,
  },
  fixtureScore: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  fixtureScoreText: {
    fontSize: typography.md,
    fontFamily: font.bodyBlack,
    color: prim.cotton,
  },
  fixtureScoreWinner: {
    color: prim.volt,
  },
  fixtureScorePlayer: {
    color: prim.cotton,
  },
  fixtureScoreDivider: {
    fontSize: typography.md,
    color: prim.cottonMuted,
    marginHorizontal: spacing.xs,
  },
  matchdayStandings: {
    gap: spacing.sm,
  },
  graphCard: {
    backgroundColor: prim.nylonRaised,
    borderRadius: 0,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: prim.ruleNylon,
    gap: spacing.md,
  },
  graphSubtitle: {
    fontSize: typography.sm,
    color: prim.cottonMuted,
  },
  graphScrollH: {
    marginHorizontal: -spacing.xs,
  },
  graphEmpty: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  graphEmptyText: {
    fontSize: typography.sm,
    color: prim.cottonMuted,
      },
  positionChangeIndicator: {
    fontSize: 10,
    fontFamily: font.bodyBold,
    marginLeft: 4,
  },
  tapHint: { fontSize: 10, color: prim.cottonMuted, textAlign: 'center', paddingTop: spacing.sm },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  modalCard: { width: '100%', maxHeight: '80%', backgroundColor: prim.nylonRaised, borderRadius: 0, borderWidth: 1, borderColor: prim.ruleNylon, padding: spacing.lg, gap: spacing.sm },
  modalTitle: { fontSize: typography.lg, fontFamily: font.bodyBlack, marginBottom: spacing.xs },
  modalClose: { marginTop: spacing.sm, backgroundColor: prim.nylonSunken, borderRadius: 0, paddingVertical: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: prim.ruleNylon },
  modalCloseText: { fontSize: typography.md, fontFamily: font.bodyBold, color: prim.cotton },
  mmRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: prim.ruleNylon },
  mmMd: { width: 38, fontSize: typography.xs, color: prim.cottonMuted, fontFamily: font.bodyBold },
  mmRes: { width: 24, height: 20, borderRadius: 0, alignItems: 'center', justifyContent: 'center' },
  mmResText: { fontSize: typography.xs, fontFamily: font.bodyBlack },
  mmOpp: { flex: 1, fontSize: typography.sm, color: prim.cottonMuted },
  mmScore: { fontSize: typography.sm, fontFamily: font.bodyBlack, color: prim.cotton, minWidth: 34, textAlign: 'right' },
  positionUp: {
    color: prim.volt,
  },
  positionDown: {
    color: '#DC2626',
  },
})
