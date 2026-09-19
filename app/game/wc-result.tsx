import React, { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Animated } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { restartToModeSelect, exitToHome } from '@/lib/nav'
import { useGameStore } from '@/store/gameStore'
import { useUserStore } from '@/store/userStore'
import { formatTier, verdictOf } from '@/data/tiers'
import { useRunSave } from '@/hooks/useRunSave'
import { VerdictBlock, PunditsRoundTable } from '@/components/season/VerdictBlock'
import { worldCupCalls } from '@/engine/cup-calls'
import { predictTable, predictWorldCupRound } from '@/engine/predictions'
import { takeRunStats, clubsForManagerAward, openAwardsView, type RunStats } from '@/lib/awardsNight'
import { buildAwardsNight } from '@/engine/awards'
import { Plate, KitScreen, KitText, Tag, ListRow, RoundFlag } from '@/components/kit'
import { openClub, openRunHub } from '@/lib/runNav'
import { getFlag } from '@/lib/flagMap'
import { LeagueTable, ZoneLegend, GroupWall, WC_GROUP_ZONES, WC_THIRD_ZONES, type TableRowVM, type MiniGroup } from '@/components/season/SeasonParts'
import { ResultFigures, ResultSection, ResultActions, YourMatches } from '@/components/season/ResultParts'
import { KnockoutRoundsView, clKoMatchToRow, wcKoMatchToRow, type KoRoundVM } from '@/components/KnockoutRoundsView'
import { space } from '@/theme'
import { SaveStatusLine } from '@/components/ui'
import { saveWCRun, fetchRunById } from '@/db/queries/runs'
import { computeWCRunStats, summariseScorers, attachWCShootoutNames } from '@/engine/run-stats'
import { mergeCareerFromRun } from '@/db/queries/career'
import { LineupPitch } from '@/components/LineupPitch'
import { SquadSummary } from '@/components/SquadSummary'
import { PenShootout } from '@/components/PenShootout'
import type { CompetitionStats, SeasonAwards } from '@/types/stats'
import type { DraftedPlayer } from '@/types/game'
import { TeamLabel } from '@/components/TeamLabel'
import { colors, spacing, typography, radius, shadows, MODE_THEMES, prim, font } from '@/theme'
import { ROLES as KIT_ROLES } from '@/theme'
import type { WCKnockoutMatch, WCTeam, WCGroup, WCGroupMatch, WCSeasonResult } from '@/engine/world-cup-sim'

import { openWCGroup, WCGroupMatchdays } from '@/components/WCGroupModal'
import { MedicalTable } from '@/components/MedicalTable'
import { openMatchStats } from '@/lib/matchStats'
import type { ContextMatch } from '@/engine/match-context'

const WC = MODE_THEMES.world_cup

// Verdict names come from the shared registry (src/data/tiers.ts) so this
// banner, Home and Runs always agree. The competition is named above it.

const ROUND_COLORS: Record<string, string> = {
  groups:  '#DC2626',
  r32:     '#EA580C',
  r16:     '#F59E0B',
  qf:      '#F59E0B',
  sf:      '#A78BFA',
  fourth:  '#9CA3AF',   // grey — so close, no medal
  third:   '#CD7F32',   // bronze
  final:   '#34D399',
  winner:  '#F59E0B',
}

const KO_ROUND_NAMES: Record<string, string> = {
  r32:   'Round of 32',
  r16:   'Round of 16',
  qf:    'Quarter-Finals',
  sf:    'Semi-Finals',
  third: '3rd-Place Playoff',
  final: 'Final',
}

// bracket sizing
const CARD_W = 150
const ROW_H  = 62

function sortGroupTeams(a: WCTeam, b: WCTeam): number {
  if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points
  const gd = (b.stats.goalsFor - b.stats.goalsAgainst) - (a.stats.goalsFor - a.stats.goalsAgainst)
  return gd !== 0 ? gd : b.stats.goalsFor - a.stats.goalsFor
}

export default function WCResultScreen() {
  const store = useGameStore()
  const { resetRun, formation, draftedPlayers, benchPlayers, quickSim, difficulty, customDifficulty } = store
  const fullSquad = [...draftedPlayers, ...benchPlayers]
  const { user, isGuest } = useUserStore()
  const params = useLocalSearchParams<{ runId?: string }>()
  const fromHistory = !!params.runId

  const [dbRun, setDbRun] = useState<any>(null)
  const [loading, setLoading] = useState(fromHistory)
  const [runStats, setRunStats] = useState<RunStats | null>(null)
  // Re-entry guards for save/exit — kept above the early returns (rules of hooks).
  const submittingRef = useRef(false)
  // The run saves itself once its stats are computed (useRunSave). A run with
  // nothing to compute — history, or an empty squad — is ready straight away.
  const freshRun = !fromHistory && !!store.wcResult && draftedPlayers.length > 0
  const [statsDone, setStatsDone] = useState(!freshRun)
  const runSave = useRunSave({
    applies: !fromHistory && !quickSim && !!store.wcResult,
    signedIn: !!user && !isGuest,
    ready: statsDone,
  })
  const [submitting, setSubmitting] = useState(false)

  // Hero entrance — fade + rise the banner in once the result is on screen.
  const heroAnim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (loading) return
    heroAnim.setValue(0)
    Animated.timing(heroAnim, { toValue: 1, duration: 650, useNativeDriver: true }).start()
  }, [loading])

  // When opened from run history, rehydrate the full tournament from the DB.
  useEffect(() => {
    if (!params.runId) return
    let active = true
    fetchRunById(params.runId)
      .then(run => { if (active) setDbRun(run) })
      .catch(err => console.error('[wc-result] failed to load run:', err))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [params.runId])

  // Full tournament: live from the store, or rehydrated from a saved run.
  const wcResult: WCSeasonResult | null =
    (dbRun?.wc_result as WCSeasonResult | undefined) ?? store.wcResult ?? null

  // Squad stats (fresh runs only — needs the live drafted XI).
  useEffect(() => {
    if (fromHistory || !store.wcResult || draftedPlayers.length === 0) return
    // Awards Night already paid for these (src/lib/awardsNight.ts): reading
    // them back saves regenerating every match sheet a second time.
    const ready = takeRunStats()
    if (ready) { setRunStats(ready); setStatsDone(true); return }
    computeWCRunStats(store.wcResult, fullSquad, undefined, store.useSubstitutes)
      .then(res => res && setRunStats(res))
      .catch(e => console.warn('[wc-result] stats failed:', e))
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

  // Older saved runs predate full-result storage — show the summary we have.
  if (!wcResult && dbRun) {
    return <WCHistorySummary run={dbRun} />
  }

  if (!wcResult) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>No FIFA World Cup result found.</Text>
        <Pressable onPress={() => router.replace('/game/mode-select')} style={{ marginTop: spacing.lg }}>
          <Text style={{ color: prim.cotton, fontFamily: font.bodyBold }}>← Back to Menu</Text>
        </Pressable>
      </View>
    )
  }

  const {
    groups, knockoutRounds, winner,
    playerTeam, playerFinalRound, playerGroup, playerGroupPos,
  } = wcResult

  const resultColor = ROUND_COLORS[playerFinalRound] ?? prim.cotton
  const resultLabel = formatTier(playerFinalRound)
  const isChampion  = playerFinalRound === 'winner'

  // D1 — the verdict, in the shared treatment. The pundits' pre-season call is
  // rebuilt from the seed stored on the run, so the two can be compared.
  const punditsText = (() => {
    const seed = store.predictionSeed
    const field = store.wcTeams
    if (seed == null || !field) return undefined
    const pred = predictTable(field.map(t => ({ clubId: t.clubId, clubName: t.clubName, ovr: t.ovr, isPlayer: t.isPlayer })), seed)
    if (!pred.player) return undefined
    const said = predictWorldCupRound(pred.player.predicted)
    return `They said ${said.label.toLowerCase()}. You finished as ${formatTier(playerFinalRound).toLowerCase()}.`
  })()

  // Pre-sort every group once
  const sortedGroups: WCGroup[] = groups.map(g => ({ id: g.id, teams: [...g.teams].sort(sortGroupTeams) }))
  const myGroup = sortedGroups.find(g => g.id === playerGroup)
  const myGroupSorted = myGroup ? myGroup.teams : []

  // Deep-stats entry points — group matches + knockout ties.
  const ovrByClub = new Map(groups.flatMap(g => g.teams).map(t => [t.clubId, t.ovr]))
  // Both double as WCGroupModal/KOMatchModal's onOpenMatch/onStats — opened from
  // a tap *inside* an already-open modal, so close that parent modal here too
  // (not just set matchDetail). AppModal has no shared z-index stack, so leaving
  // the parent "open" stacked two full-screen fixed overlays at once and could
  // leave the page unclickable after closing the top one (Big Fixes §5.6 —
  // PC/mouse only, touch's hit-testing masked it).
  // §10.5 — a World Cup timeline: the three group matchdays, then each knockout
  // round continuing the sequence. Only group games feed a table (each group is
  // its own mini-league), but the knockouts still count as games played, so
  // form and "next match" carry straight through into the bracket.
  // `tableGroup` is the only group whose games feed a standings table. For a
  // group match that's the group itself; for a knockout tie it's nobody — the
  // two sides can come from different groups, so there IS no shared table, but
  // EVERY group game still has to be present or the away side's form would show
  // only knockouts.
  const wcContext = (tableGroup: string | null): ContextMatch[] => {
    const groupRows: ContextMatch[] = groupMatchdays.map(m => ({
      matchday: m.matchday, label: `Group ${m.groupId} · Matchday ${m.matchday}`,
      inTable: m.groupId === tableGroup,
      homeClubId: m.home.clubId, homeClubName: m.home.clubName,
      awayClubId: m.away.clubId, awayClubName: m.away.clubName,
      homeGoals: m.homeGoals, awayGoals: m.awayGoals,
      scorers: m.scorers, seed: m.seed,
      // Rotation MUST travel with the match: regenerating without it selects a
      // different eleven than the stored scorers were attributed against.
      homeRotation: m.homeRotation, awayRotation: m.awayRotation,
      absent: m.absent, standIns: m.standIns,
    }))
    const base = groupRows.reduce((mx, m) => Math.max(mx, m.matchday), 0)
    const koRows: ContextMatch[] = knockoutRounds.flatMap((round, ri) =>
      round.matches.map(m => ({
        matchday: base + ri + 1, label: KO_ROUND_NAMES[m.round] ?? m.round, inTable: false,
        homeClubId: m.teamA.clubId, homeClubName: m.teamA.clubName,
        awayClubId: m.teamB.clubId, awayClubName: m.teamB.clubName,
        homeGoals: m.result.homeGoals, awayGoals: m.result.awayGoals,
        extraTime: m.result.extraTime, scorers: m.scorers, seed: m.seed,
        absent: m.absent, standIns: m.standIns,
        // So the stats screen's bracket can say who went through — a shootout
        // leaves no trace in the goals.
        tieWinnerClubId: m.winner.clubId,
      })))
    return [...groupRows, ...koRows]
  }
  const wcKoMatchday = (m: WCKnockoutMatch) => {
    const base = groupMatchdays.reduce((mx, g) => Math.max(mx, g.matchday), 0)
    const ri = knockoutRounds.findIndex(r => r.matches.some(x => x === m))
    return ri === -1 ? undefined : base + ri + 1
  }

  const openGroupMatchDetail = (m: WCGroupMatch) => {
    openMatchStats({
      homeClubId: m.home.clubId, homeName: m.home.clubName,
      awayClubId: m.away.clubId, awayName: m.away.clubName,
      homeGoals: m.homeGoals, awayGoals: m.awayGoals,
      scorers: m.scorers, seed: m.seed, yearStart: 2026,
      homeRotation: m.homeRotation, awayRotation: m.awayRotation,
      absent: m.absent, standIns: m.standIns,
      competitionLabel: `Group ${m.groupId} · Matchday ${m.matchday}`,
      playerClubId: playerTeam.clubId,
      drafted: (fromHistory ? dbRun?.squad ?? [] : fullSquad) as DraftedPlayer[],
      playerFormation: (fromHistory ? dbRun?.formation : store.formation) ?? undefined,
      matchday: m.matchday, contextMatches: wcContext(m.groupId),
    }, prim.cotton)
  }
  const openKoDetail = (m: WCKnockoutMatch) => {
    openMatchStats({
      homeClubId: m.teamA.clubId, homeName: m.teamA.clubName,
      awayClubId: m.teamB.clubId, awayName: m.teamB.clubName,
      homeGoals: m.result.homeGoals, awayGoals: m.result.awayGoals,
      extraTime: m.result.extraTime,
      pensNote: m.result.homePens !== null ? `Penalties ${m.result.homePens} – ${m.result.awayPens} · ${m.winner.clubName} advance` : undefined,
      scorers: m.scorers, seed: m.seed, yearStart: 2026,
      absent: m.absent, standIns: m.standIns,
      competitionLabel: KO_ROUND_NAMES[m.round] ?? m.round,
      playerClubId: playerTeam.clubId,
      drafted: (fromHistory ? dbRun?.squad ?? [] : fullSquad) as DraftedPlayer[],
      playerFormation: (fromHistory ? dbRun?.formation : store.formation) ?? undefined,
      matchday: wcKoMatchday(m), contextMatches: wcContext(null),
    }, prim.cotton)
  }

  // Best third-place ranking across all groups
  const thirdPlaceTeams = sortedGroups.map(g => g.teams[2]).filter(Boolean).sort(sortGroupTeams)
  const q3Count = Math.min(8, thirdPlaceTeams.length)

  // All recorded group fixtures (present for freshly-played runs)
  const groupMatchdays: WCGroupMatch[] = wcResult.groupMatchdays ?? []

  // Player's knockout run summary
  const playerKoMatches = knockoutRounds.flatMap(r => r.matches).filter(m => m.teamA.isPlayer || m.teamB.isPlayer)
  let koW = 0, koL = 0, koGF = 0, koGA = 0
  playerKoMatches.forEach(m => {
    const playerIsA = m.teamA.isPlayer
    koGF += playerIsA ? m.result.homeGoals : m.result.awayGoals
    koGA += playerIsA ? m.result.awayGoals : m.result.homeGoals
    if (m.winner.isPlayer) koW++; else koL++
  })

  // Awaited (not fire-and-forget) so the run is in the DB before we navigate —
  // otherwise Home re-fetches recent runs before the save lands.
  async function persistRun() {
    if (fromHistory || quickSim) return
    if (user && !isGuest && formation) {
      await saveWCRun({
        userId: user.id,
        formation,
        teamOvr: playerTeam.ovr,
        result: wcResult!,
        squad: fullSquad,
        difficulty, custom: customDifficulty,
        stats: runStats?.stats,
        awards: runStats?.awards,
      })
    }
    if (user && !isGuest && runStats) {
      const pots = runStats.awards.playerOfTheSeason[0], u21 = runStats.awards.bestU21[0]
      await mergeCareerFromRun(user.id, {
        competition: 'world_cup',
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

  // P8-54 — the World Cup's result as the end of the live tournament: the same
  // flagged, zoned group tables, the group wall and the shared knockout list.
  const nylon = KIT_ROLES.nylon
  const flagRow = (t: WCTeam, note?: string): TableRowVM => ({
    clubId: t.clubId, clubName: t.clubName, isPlayer: !!t.isPlayer, flag: getFlag(t.clubId), note,
    played: t.stats.played, gd: t.stats.goalsFor - t.stats.goalsAgainst, points: t.stats.points,
  })
  const wall: MiniGroup[] = sortedGroups.map(g => ({
    id: g.id, you: g.teams.some(t => t.isPlayer),
    rows: g.teams.map(t => ({ clubId: t.clubId, clubName: t.clubName, flag: getFlag(t.clubId), points: t.stats.points, isPlayer: !!t.isPlayer })),
  }))
  const koRounds: KoRoundVM[] = knockoutRounds.map(r => ({
    key: r.round, label: KO_ROUND_NAMES[r.round] ?? r.round,
    ties: r.matches.map(m => wcKoMatchToRow(m, { onPress: () => openKoDetail(m) })),
  }))
  const hubRunId = fromHistory ? params.runId : undefined
  const hasHub = fromHistory ? !!dbRun?.stats : draftedPlayers.length > 0

  return (
    <KitScreen ground="nylon">
      <VerdictBlock
        tone={verdictOf(playerFinalRound)}
        title={resultLabel}
        meta={`FIFA World Cup 2026 · ` + `${playerTeam.clubName} · Group ${playerGroup}, ${playerGroupPos}${ordinal(playerGroupPos)}`}
        punditsText={punditsText}
        shareText={`${resultLabel} — FIFA World Cup 2026. Perfection or Misery.`}
      />
      <ResultFigures items={[
        ['Group', `${playerGroupPos}${ordinal(playerGroupPos)}`], ['Games', playerTeam.stats.played],
        ['W', playerTeam.stats.won], ['D', playerTeam.stats.drawn], ['L', playerTeam.stats.lost],
        ['Goals', `${playerTeam.stats.goalsFor}–${playerTeam.stats.goalsAgainst}`],
        ...(playerKoMatches.length > 0 ? [['KO', `${koW}-${koL}`] as [string, string]] : []),
      ]} />
      {/* P8-24 for the cups — every side's call, checked against how far it got. */}
      {store.predictionSeed != null && store.wcTeams && store.wcResult && (
        <PunditsRoundTable rows={worldCupCalls(store.wcResult as any, store.wcTeams.map(t => ({ clubId: t.clubId, clubName: t.clubName, ovr: t.ovr, isPlayer: t.isPlayer })), store.predictionSeed)} />
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
        <ResultSection title="World champions">
          <View style={styles.kitWinner}>
            <RoundFlag emoji={getFlag(winner.clubId)} code={winner.clubName.slice(0, 3)} size={24} roles={nylon} />
            <KitText t="superM" color={nylon.text}>{winner.clubName.toUpperCase()}</KitText>
            {winner.clubId === playerTeam.clubId && <Tag roles={nylon} variant="you">YOU</Tag>}
          </View>
        </ResultSection>
      )}

      {koRounds.length > 0 && (
        <ResultSection title="Knockouts">
          <KnockoutRoundsView title="" rounds={koRounds} maxHeight={100000} />
        </ResultSection>
      )}

      {myGroupSorted.length > 0 && (
        <ResultSection title={`Group ${playerGroup}`}>
          <LeagueTable roles={nylon} rows={myGroupSorted.map(t => flagRow(t))} zones={WC_GROUP_ZONES}
            onRowPress={hasHub ? id => openClub(id, hubRunId) : undefined} />
          <ZoneLegend roles={nylon} zones={WC_GROUP_ZONES} />
          {groupMatchdays.length > 0 && (
            <YourMatches matches={groupMatchdays.filter(m => m.groupId === playerGroup)} onOpen={openGroupMatchDetail} />
          )}
        </ResultSection>
      )}

      {thirdPlaceTeams.length > 0 && (
        <ResultSection title="The best thirds">
          <LeagueTable roles={nylon} rows={thirdPlaceTeams.map(t => flagRow(t, (t as any).groupId))} zones={WC_THIRD_ZONES}
            onRowPress={hasHub ? id => openClub(id, hubRunId) : undefined} />
          <ZoneLegend roles={nylon} zones={WC_THIRD_ZONES} />
        </ResultSection>
      )}

      <ResultSection title="Every group">
        <GroupWall roles={nylon} groups={wall} onOpen={id => {
          const g = sortedGroups.find(x => x.id === id)
          if (g) openWCGroup(g, groupMatchdays.filter(m => m.groupId === id), openGroupMatchDetail)
        }} />
      </ResultSection>

      {/* §10.5 phase 4 (R8) — the medical table. */}
      <MedicalTable absences={wcResult.absences} accent={prim.cotton} />

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

      <ResultActions fromHistory={fromHistory} submitting={submitting} save={runSave} onAgain={handlePlayAgain} onHome={handleReturnToHome} />
    </KitScreen>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

// Degraded view for older WC runs saved before the full tournament was stored.
function WCHistorySummary({ run }: { run: any }) {
  const round = String(run.tier ?? '')
  const color = ROUND_COLORS[round] ?? prim.cotton
  const label = formatTier(round)
  const games = (run.wins ?? 0) + (run.draws ?? 0) + (run.losses ?? 0)

  return (
    <ScrollView style={[styles.container, { backgroundColor: prim.nylon }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.competitionLabel}>FIFA WORLD CUP</Text>
        <Text style={[styles.resultBanner, { color }]}>{label.toUpperCase()}</Text>
        {round === 'winner' && <Text style={styles.trophy}>CHAMPIONS</Text>}
      </View>

      <View style={[styles.card, { borderColor: color }]}>
        <Text style={styles.playerTeamName}>Your Nation</Text>
        <Text style={styles.playerTeamMeta}>
          OVR {run.team_ovr} · Finished #{run.final_position} of {run.teams_in_league}
        </Text>
        <View style={styles.statsRow}>
          <StatBox label="Games" value={String(games)} />
          <StatBox label="Record" value={`${run.wins}W ${run.draws}D ${run.losses}L`} />
          <StatBox label="Goals" value={`${run.goals_for}-${run.goals_against}`} />
        </View>
      </View>

      <Text style={styles.phaseNote}>
        Full tournament details aren’t saved for this older run. Play a new World
        Cup to see the complete groups and bracket here.
      </Text>

      <View style={styles.buttonRow}>
        <Pressable style={({ pressed }) => [styles.actionBtn, styles.actionBtnSecondary, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]} onPress={() => router.back()}>
          <Text style={styles.actionBtnText}>Back</Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

// Tap-through detail for a WC knockout tie.



function BracketTeam({ team, won, goals }: { team: WCTeam; won: boolean; goals: number }) {
  return (
    <View style={styles.bracketTeamRow}>
      <TeamLabel
        clubId={team.clubId}
        name={team.clubName}
        size={12}
        gap={3}
        containerStyle={styles.bracketTeamLabel}
        textStyle={[styles.bracketTeamName, won && styles.bracketTeamWon, team.isPlayer && styles.bracketTeamPlayer]}
      />
      <Text style={[styles.bracketTeamGoals, won && styles.bracketTeamWon]}>{goals}</Text>
    </View>
  )
}

function ordinal(n: number): string {
  if (n === 1) return 'st'
  if (n === 2) return 'nd'
  if (n === 3) return 'rd'
  return 'th'
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  kitPlates: { gap: space[3], marginTop: space[5] },
  kitWinner: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
  container: { flex: 1, backgroundColor: prim.nylon },
  content:   { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  center:    { flex: 1, backgroundColor: prim.nylon, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: typography.md, color: prim.cottonMuted },

  header: {
    alignItems:    'center',
    paddingTop:    56,
    paddingBottom: spacing.xl,
    gap:           spacing.sm,
  },
  competitionLabel: {
    fontSize:      typography.xs,
    fontWeight:    typography.black,
    color:         prim.cotton,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  resultBanner: {
    fontSize:      typography.xxl,
    fontWeight:    typography.black,
    textAlign:     'center',
    letterSpacing: 1,
  },
  trophy: { fontSize: 56 },

  card: {
    backgroundColor: prim.nylonRaised,
    borderRadius:    radius.lg,
    borderWidth:     1,
    borderColor:     prim.ruleNylon,
    padding:         spacing.lg,
    gap:             spacing.md,
    ...shadows.sm,
  },

  playerTeamName: { fontSize: typography.xl, fontFamily: font.bodyBlack, color: prim.cotton },
  playerTeamMeta: { fontSize: typography.sm, color: prim.cottonMuted },

  statsRow: {
    flexDirection:  'row',
    gap:            spacing.sm,
    borderTopWidth: 1,
    borderTopColor: prim.ruleNylon,
    paddingTop:     spacing.md,
  },
  statBox:   { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: typography.md, fontFamily: font.bodyBlack, color: prim.cotton },
  statLabel: { fontSize: typography.xs, color: prim.cottonMuted, textAlign: 'center' },

  sectionTitle: { fontSize: typography.md, fontFamily: font.bodyBold, color: prim.cotton },

  tableHeaderRow: {
    flexDirection:     'row',
    paddingBottom:     spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: prim.ruleNylon,
  },
  tableRow: {
    flexDirection:     'row',
    paddingVertical:   spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: prim.ruleNylon,
    alignItems:        'center',
  },
  tableRowPlayer: {
    backgroundColor: prim.cotton + '11',
    borderColor:     prim.cotton,
    borderWidth:     1,
    borderRadius:    radius.sm,
  },
  tableRowQ: { borderLeftWidth: 3, borderLeftColor: prim.volt },
  tableCol:     { fontSize: 10, fontFamily: font.bodyBold, color: prim.cottonMuted },
  tableColData: { fontSize: 11, color: prim.cottonMuted },
  playerText:   { color: prim.cotton, fontFamily: font.bodyBold },
  colPos:  { width: 24, textAlign: 'center' as any },
  colName: { flex: 1,  paddingLeft: spacing.xs },
  colStat: { width: 28, textAlign: 'center' as any },
  colPts:  { width: 32, fontFamily: font.bodyBold },

  phaseNote: {
    fontSize:  typography.xs,
    color:     prim.cottonMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },

  // all-groups grid
  groupsGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           spacing.sm,
  },
  groupCard: {
    width:           '48%',
    backgroundColor: prim.nylonSunken,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     prim.ruleNylon,
    padding:         spacing.sm,
    gap:             2,
  },
  groupCardPlayer: {
    borderColor: prim.cotton,
  },
  groupCardTitle: {
    fontSize:      typography.xs,
    fontWeight:    typography.black,
    color:         prim.cotton,
    marginBottom:  2,
  },
  groupTeamRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
    paddingVertical: 2,
  },
  groupTeamRowQ: {
    borderLeftWidth: 2,
    borderLeftColor: prim.volt,
    paddingLeft:     4,
  },
  groupTeamRowSelf: {
    backgroundColor: prim.cotton + '15',
    borderRadius:    radius.sm,
  },
  groupTeamRank: { fontSize: 9, color: prim.cottonMuted, width: 12 },
  groupTeamName: { flex: 1 },
  groupTeamNameText: { fontSize: 10, color: prim.cottonMuted },
  groupTeamNameSelf: { color: prim.cotton, fontFamily: font.bodyBold },
  groupTeamPts: { fontSize: 10, fontFamily: font.bodyBold, color: prim.cotton, width: 18, textAlign: 'right' },

  // bracket
  bracketScroll: { marginHorizontal: -spacing.xs },
  bracketRow:    { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.xs },
  bracketCol:    { width: CARD_W, gap: spacing.sm },
  bracketColLabel: {
    fontSize:      typography.xs,
    fontWeight:    typography.black,
    color:         prim.cottonMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign:     'center',
  },
  bracketColBody: {
    justifyContent: 'space-around',
  },
  bracketCard: {
    backgroundColor: prim.nylonSunken,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     prim.ruleNylon,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  bracketCardPlayer: {
    borderColor:     prim.cotton,
    backgroundColor: prim.cotton + '11',
  },
  bracketTeamRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            4,
  },
  bracketTeamLabel:  { flex: 1 },
  bracketTeamName:   { fontSize: 10, color: prim.cottonMuted },
  bracketTeamWon:    { color: prim.cotton, fontFamily: font.bodyBlack },
  bracketTeamPlayer: { color: prim.cotton },
  bracketTeamGoals:  { fontSize: 11, fontFamily: font.bodyBold, color: prim.cottonMuted, width: 14, textAlign: 'right' },
  bracketDivider: {
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bracketSuffix: { fontSize: 8, color: colors.warning, fontFamily: font.bodyBold },

  winnerCard: {
    alignItems:      'center',
    backgroundColor: colors.tiers.perfection + '11',
    borderColor:     colors.tiers.perfection,
  },
  winnerLabel: { fontSize: typography.xs, color: prim.cottonMuted, fontFamily: font.bodyBold, textTransform: 'uppercase', letterSpacing: 1 },
  winnerName:  { fontSize: typography.xxl, fontFamily: font.bodyBlack, color: colors.tiers.perfection },
  winnerOvr:   { fontSize: typography.sm, color: prim.cottonMuted },

  // matchday list
  mdSection: {
    gap:           spacing.sm,
    marginTop:     spacing.sm,
    borderTopWidth: 1,
    borderTopColor: prim.ruleNylon,
    paddingTop:    spacing.sm,
  },
  mdBlock: { gap: 4 },
  mdLabel: {
    fontSize:      typography.xs,
    fontWeight:    typography.bold,
    color:         prim.cottonMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  mdRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
    paddingVertical: 2,
  },
  mdTeam:       { flex: 1 },
  mdTeamRight:  { justifyContent: 'flex-end' },
  mdTeamText:   { fontSize: 11, color: prim.cottonMuted },
  mdTeamPlayer: { color: prim.cotton, fontFamily: font.bodyBold },
  mdScorers:    { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.xs, marginBottom: 4 },
  mdScorerHalf: { flex: 1, fontSize: 9, color: prim.cottonMuted },
  koModalScore: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.sm },
  koModalTeam:  { fontSize: typography.sm, color: prim.cotton, fontFamily: font.bodyBold },
  koModalGoals: { fontSize: typography.xl, fontFamily: font.bodyBlack, color: prim.cotton },
  koModalNote:  { fontSize: typography.xs, color: colors.warning, textAlign: 'center' },
  koModalPens:  { fontSize: typography.sm, color: prim.cotton, fontFamily: font.bodyBold, textAlign: 'center', marginTop: 2 },
  koStatsBtn: { marginTop: spacing.sm, borderWidth: 1, borderColor: prim.cotton, borderRadius: 0, paddingVertical: spacing.sm, alignItems: 'center', backgroundColor: prim.cotton + '15' },
  koStatsBtnText: { fontSize: typography.sm, fontFamily: font.bodyBold, color: prim.cotton },
  koModalScorers: { marginTop: spacing.sm, gap: 4, borderTopWidth: 1, borderTopColor: prim.ruleNylon, paddingTop: spacing.sm },
  koModalScorerLine: { fontSize: typography.xs, color: prim.cottonMuted },
  mdScore: {
    fontSize:   12,
    fontFamily: font.bodyBlack,
    color:      prim.cotton,
    minWidth:   42,
    textAlign:  'center',
  },

  // modal
  modalOverlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent:  'center',
    alignItems:      'center',
    padding:         spacing.lg,
  },
  modalCard: {
    width:           '100%',
    maxHeight:       '80%',
    backgroundColor: prim.nylonRaised,
    borderRadius:    radius.lg,
    borderWidth:     1,
    borderColor:     prim.ruleNylon,
    padding:         spacing.lg,
    gap:             spacing.sm,
  },
  modalTitle: {
    fontSize:     typography.lg,
    fontWeight:   typography.black,
    color:        prim.cotton,
    marginBottom: spacing.sm,
  },
  modalClose: {
    marginTop:       spacing.md,
    backgroundColor: prim.nylonSunken,
    borderRadius:    radius.md,
    paddingVertical: spacing.md,
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     prim.ruleNylon,
  },
  modalCloseText: {
    fontSize:   typography.md,
    fontFamily: font.bodyBold,
    color:      prim.cotton,
  },

  buttonRow: {
    flexDirection: 'row',
    gap:           spacing.md,
    marginTop:     spacing.md,
  },
  actionBtn: {
    flex:            1,
    backgroundColor: prim.cotton,
    borderRadius:    radius.md,
    paddingVertical: spacing.lg,
    alignItems:      'center',
    ...shadows.md,
  },
  actionBtnSecondary: {
    backgroundColor: prim.nylonSunken,
    borderWidth:     1,
    borderColor:     prim.ruleNylon,
  },
  actionBtnText: {
    fontSize:      typography.md,
    fontWeight:    typography.black,
    color:         prim.cotton,
    letterSpacing: 1.5,
  },
})
