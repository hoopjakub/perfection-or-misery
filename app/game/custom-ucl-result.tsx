import React, { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Animated, ActivityIndicator } from 'react-native'
import { AppModal } from '@/components/AppModal'
import { router, useLocalSearchParams } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { useUserStore } from '@/store/userStore'
import { saveCustomUclRun, fetchRunById } from '@/db/queries/runs'
import { computeCLRunStats, summariseScorers, koTieLegRecord } from '@/engine/run-stats'
import { mergeCareerFromRun } from '@/db/queries/career'
import { LineupPitch } from '@/components/LineupPitch'
import { SquadSummary } from '@/components/SquadSummary'
import { QualifyingLadder } from '@/components/QualifyingLadder'
import { TitleWithInfo, RulesModal } from '@/components/InfoBubble'
import { LeagueTableModal, LeaguesBrowserModal, KoTieDetailModal, qualTieToKoMatch } from '@/components/CustomUclViewers'
import { MatchDetailModal, type MatchDetailRequest } from '@/components/MatchDetailModal'
import { QUAL_ROUND_LABEL, PATH_LABEL, QUAL_EXIT_ROUND } from '@/data/cl-qual-labels'
import { FORMAT_LABEL, isSpecialFormat } from '@/data/league-formats'
import { flagForCountry } from '@/data/geo-iso'
import { colors, spacing, typography, radius, shadows, MODE_THEMES } from '@/theme'
import type { CLSeasonResult, CLKnockoutMatch, CLLeagueMatch } from '@/engine/cl-sim'
import type { SimLeagueTable } from '@/engine/cl-league-sim'
import type { CompetitionStats, SeasonAwards } from '@/types/stats'
import type { DraftedPlayer } from '@/types/game'

const CL = MODE_THEMES.champions_league

const ROUND_LABELS: Record<string, string> = {
  not_qualified: 'FAILED TO QUALIFY',
  q1_exit: 'Eliminated in the 1st Qualifying Round', q2_exit: 'Eliminated in the 2nd Qualifying Round',
  q3_exit: 'Eliminated in the 3rd Qualifying Round', quali_playoff_exit: 'Eliminated in the Qualifying Play-off',
  league_exit: 'Eliminated in League Phase', playoff_exit: 'Eliminated in Playoff Round',
  r16_exit: 'Round of 16 Exit', qf_exit: 'Quarter-Final Exit', sf_exit: 'Semi-Final Exit',
  finalist: 'UCL Finalist', winner: 'UCL CHAMPION',
}
const ROUND_COLORS: Record<string, string> = {
  not_qualified: '#DC2626',
  q1_exit: '#6B7280', q2_exit: '#6B7280', q3_exit: '#9CA3AF', quali_playoff_exit: '#DC2626',
  league_exit: '#DC2626', playoff_exit: '#EA580C', r16_exit: '#F59E0B',
  qf_exit: '#F59E0B', sf_exit: '#A78BFA', finalist: '#34D399', winner: '#F59E0B',
}
export default function CustomUclResultScreen() {
  const store = useGameStore()
  const { resetRun, formation, draftedPlayers, benchPlayers, quickSim } = store
  const fullSquad = [...draftedPlayers, ...benchPlayers]
  const { user, isGuest } = useUserStore()
  const params = useLocalSearchParams<{ runId?: string }>()
  const fromHistory = !!params.runId

  const [dbRun, setDbRun] = useState<any>(null)
  const [loading, setLoading] = useState(fromHistory)
  const [openTeam, setOpenTeam] = useState<{ clubId: string; clubName: string } | null>(null)
  const [openKO, setOpenKO] = useState<CLKnockoutMatch | null>(null)
  const [matchDetail, setMatchDetail] = useState<MatchDetailRequest | null>(null)
  const [openLeague, setOpenLeague] = useState<SimLeagueTable | null>(null)
  const [browserOpen, setBrowserOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [runStats, setRunStats] = useState<{ stats: CompetitionStats; awards: SeasonAwards } | null>(null)
  const savedRef = useRef(false)
  const submittingRef = useRef(false)
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
    computeCLRunStats(store.clResult, fullSquad, clYear ?? 2025, store.customUclQual?.ties, store.useSubstitutes)
      .then(res => res && setRunStats(res))
      .catch(e => console.warn('[custom-ucl-result] stats failed:', e))
  }, [])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={CL.accent} size="large" />
        <Text style={[styles.errorText, { marginTop: spacing.md }]}>Loading run…</Text>
      </View>
    )
  }

  if (!clResult) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>No custom UCL result found.</Text>
        <Pressable onPress={() => router.replace('/game/mode-select')} style={{ marginTop: spacing.lg }}>
          <Text style={{ color: CL.accent, fontWeight: '700' }}>← Back to Menu</Text>
        </Pressable>
      </View>
    )
  }

  const { leaguePhaseStandings, playoffRound, r16, qf, sf, final, winner, playerTeam, playerFinalRound, playerPot } = clResult
  const resultColor = ROUND_COLORS[playerFinalRound] ?? CL.accent
  const resultLabel = ROUND_LABELS[playerFinalRound] ?? playerFinalRound
  const isChampion = playerFinalRound === 'winner'
  const playerPos = leaguePhaseStandings.findIndex(t => t.isPlayer) + 1
  const leagueMatchdays: CLLeagueMatch[] = clResult.leagueMatchdays ?? []

  // Deep-stats entry point — league-phase matchday rows (KO legs open from
  // the shared KoTieDetailModal's per-leg buttons).
  const ovrByClub = new Map(leaguePhaseStandings.map(t => [t.clubId, t.ovr]))
  const openLeagueMatchDetail = (m: CLLeagueMatch) => setMatchDetail({
    homeClubId: m.home.clubId, homeName: m.home.clubName,
    awayClubId: m.away.clubId, awayName: m.away.clubName,
    homeGoals: m.homeGoals, awayGoals: m.awayGoals,
    scorers: m.scorers, seed: m.seed, yearStart: store.clYear ?? 2025,
    competitionLabel: `League Phase · Matchday ${m.matchday}`,
    playerClubId: playerTeam.clubId,
    drafted: (fromHistory ? dbRun?.squad ?? [] : fullSquad) as DraftedPlayer[],
  })

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
    ? `Finished ${domPos}${ordinal(domPos)} in the ${playerLeague?.name ?? 'league'} — below every Champions League spot. No Europe this season.`
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
    if (savedRef.current) return
    savedRef.current = true
    if (user && !isGuest && formation) {
      try {
        await saveCustomUclRun({
          userId: user.id,
          formation,
          teamOvr: playerTeam.ovr,
          result: clResult!,
          squad: fullSquad,
          stats: runStats?.stats,
          awards: runStats?.awards,
          qual: customUclQual,
          leagueTables: customUclLeagues,
        })
      } catch (error) { console.error('Failed to save custom UCL run:', error) }
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

  async function handlePlayAgain() {
    if (submittingRef.current) return
    submittingRef.current = true; setSubmitting(true)
    await persistRun()
    resetRun()
    router.replace('/game/mode-select')
  }

  async function handleReturnToHome() {
    if (submittingRef.current) return
    submittingRef.current = true; setSubmitting(true)
    await persistRun()
    resetRun()
    router.replace('/(tabs)')
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: CL.bgTint }]} contentContainerStyle={styles.content}>
      <Animated.View style={[styles.header, { opacity: heroAnim, transform: [{ translateY: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>
        <Text style={styles.competitionLabel}>Champions League · Custom Path</Text>
        <Text style={[styles.resultBanner, { color: resultColor }]}>{resultLabel.toUpperCase()}</Text>
        {isChampion && <Text style={styles.trophy}>🏆</Text>}
      </Animated.View>

      {/* Player team summary + entry route */}
      <View style={[styles.card, { borderColor: resultColor }]}>
        <View style={styles.playerTeamRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.playerTeamName}>{playerTeam.clubName}</Text>
            <Text style={styles.playerTeamMeta}>OVR {playerTeam.ovr}{reachedLeaguePhase ? ` · Pot ${playerPot}` : playerLeague ? ` · ${playerLeague.name}` : ''}</Text>
          </View>
          {reachedLeaguePhase && (
            <View style={[styles.potPill, { backgroundColor: colors.pots[playerPot] + '22', borderColor: colors.pots[playerPot] }]}>
              <Text style={[styles.potPillText, { color: colors.pots[playerPot] }]}>POT {playerPot}</Text>
            </View>
          )}
        </View>
        <View style={[styles.entryBanner, { borderColor: !reachedLeaguePhase ? colors.danger : entryRound === 'league_phase' ? colors.success : CL.accent }]}>
          <Text style={[styles.entryText, { color: !reachedLeaguePhase ? colors.danger : entryRound === 'league_phase' ? colors.success : CL.accent }]}>{entryText}</Text>
        </View>
        {domesticLine && !notQualified && <Text style={styles.domesticLine}>{domesticLine}</Text>}
        {reachedLeaguePhase ? (
          <View style={styles.statsRow}>
            <StatBox label="League Pos" value={`${playerPos}${ordinal(playerPos)}`} />
            <StatBox label="Points" value={String(playerTeam.stats.points)} />
            <StatBox label="Record" value={`${playerTeam.stats.won}W ${playerTeam.stats.drawn}D ${playerTeam.stats.lost}L`} />
            <StatBox label="Goals" value={`${playerTeam.stats.goalsFor}-${playerTeam.stats.goalsAgainst}`} />
          </View>
        ) : (
          // Never reached the league phase — the meaningful record is the
          // domestic season (plus qualifying legs, when there were any).
          <View style={styles.statsRow}>
            {domRow && <StatBox label="Domestic Pos" value={`${domPos}${ordinal(domPos)}`} />}
            {domRow && <StatBox label="Domestic Record" value={`${domRow.won}W ${domRow.drawn}D ${domRow.lost}L`} />}
            {domRow && <StatBox label="Domestic Goals" value={`${domRow.goalsFor}-${domRow.goalsAgainst}`} />}
            {!notQualified && <StatBox label="UCL Qual." value={`${playerTeam.stats.goalsFor}-${playerTeam.stats.goalsAgainst}`} />}
          </View>
        )}
      </View>

      {/* Lineup + squad — live run or rehydrated from a saved one */}
      {(() => {
        const squad = (fromHistory ? dbRun?.squad ?? [] : draftedPlayers) as any[]
        const bench = (fromHistory ? (dbRun?.squad ?? []).filter((p: any) => p.isBench) : benchPlayers) as any[]
        const form  = (fromHistory ? dbRun?.formation : formation) as any
        const st    = runStats?.stats ?? dbRun?.stats ?? null
        return (
          <>
            {form && squad.length > 0 && <LineupPitch formation={form} draftedPlayers={squad} benchPlayers={bench} title="Your Lineup" />}
            {st && <SquadSummary stats={st} draftedPlayers={squad} formation={form ?? null} accent={CL.accent} runId={params.runId} />}
          </>
        )
      })()}

      {/* NEW — Qualifying rounds (everything before the league phase) */}
      {qualTies.length > 0 && (
        <View style={styles.card}>
          <TitleWithInfo title="Qualifying Rounds" topic="qualifying_ladder" style={styles.sectionTitle} />
          <Text style={styles.phaseNote}>How the {customUclQual!.qualifiers.length} qualifiers reached the league phase · your ties highlighted · tap a tie for detail</Text>
          <QualifyingLadder ties={qualTies} onTiePress={t => { const m = qualTieToKoMatch(t); if (m) setOpenKO(m) }} />
        </View>
      )}

      {/* League phase standings */}
      <View style={styles.card}>
        <TitleWithInfo title="League Phase Standings" topic="league_phase_zones" style={styles.sectionTitle} />
        <Text style={styles.phaseNote}>{leaguePhaseStandings.length} clubs · tap any club to see its matchday results</Text>
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.tableCol, styles.colPos]}>#</Text>
          <Text style={[styles.tableCol, styles.colName]}>Club</Text>
          <Text style={[styles.tableCol, styles.colStat]}>P</Text>
          <Text style={[styles.tableCol, styles.colStat]}>GD</Text>
          <Text style={[styles.tableCol, styles.colStat, styles.colPts]}>Pts</Text>
        </View>
        <ScrollView style={styles.standingsScroll} nestedScrollEnabled showsVerticalScrollIndicator>
          {leaguePhaseStandings.map((team, idx) => (
            <Pressable key={team.clubId} onPress={() => setOpenTeam({ clubId: team.clubId, clubName: team.clubName })}>
              <StandingsRow team={team} pos={idx + 1} />
            </Pressable>
          ))}
        </ScrollView>
        <Text style={styles.phaseNote}>
          <Text style={{ color: colors.success }}>■</Text> 1-8 → R16 direct   ·   <Text style={{ color: colors.warning }}>■</Text> 9-24 → Playoff   ·   <Text style={{ color: '#DC2626' }}>■</Text> 25+ out
        </Text>
      </View>

      {reachedLeaguePhase && leagueMatchdays.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Your League Phase</Text>
          <TeamMatchdays matches={leagueMatchdays} clubId={playerTeam.clubId} onOpenMatch={openLeagueMatchDetail} />
        </View>
      )}

      {(playoffRound.length > 0 || r16.length > 0) && (
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <TitleWithInfo title="Knockout Rounds" topic="knockout_bracket" style={styles.sectionTitle} />
            {playoffRound.length > 0 && <TitleWithInfo title="· KO Play-off" topic="knockout_playoff" style={styles.phaseNote} />}
          </View>
          {playerKoTies.length > 0 && (
            <View style={styles.statsRow}>
              <StatBox label="KO Ties" value={String(playerKoTies.length)} />
              <StatBox label="Record" value={koD > 0 ? `${koW}W ${koD}D ${koL}L` : `${koW}W ${koL}L`} />
              <StatBox label="Goals" value={`${koGF}-${koGA}`} />
            </View>
          )}
          <Text style={styles.phaseNote}>Scroll sideways · your ties are highlighted</Text>
          <BracketView
            rounds={[
              { key: 'playoff', label: 'KO Play-off', sub: '9th–24th · 16 → 8', matches: playoffRound },
              { key: 'r16', label: 'Round of 16', sub: '8 + 8', matches: r16, showDirect: true },
              { key: 'qf', label: 'Quarter-Finals', sub: '', matches: qf },
              { key: 'sf', label: 'Semi-Finals', sub: '', matches: sf },
              { key: 'final', label: 'Final', sub: '', matches: final ? [final] : [] },
            ].filter(r => r.matches.length > 0)}
            directIds={new Set(leaguePhaseStandings.slice(0, 8).map(t => t.clubId))}
            onMatchPress={setOpenKO}
          />
        </View>
      )}

      {/* NEW — Domestic leagues viewer (browse every table the field came from) */}
      {associations.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Domestic Leagues</Text>
          <Text style={styles.phaseNote}>Each league was simulated this run — the qualifiers came from these tables · tap to view</Text>
          {/* A short preview inline (no nested scroll), then a modal browser for
              the full list — the inline nested ScrollView didn't scroll here. */}
          {associations.slice(0, 6).map(a => (
            <Pressable key={a.rank} style={styles.leagueRow} onPress={() => setOpenLeague(a)}>
              <Text style={styles.leagueRank}>#{a.rank}</Text>
              <Text style={styles.leagueFlag}>{flagForCountry(a.country) || '🏳️'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.leagueName} numberOfLines={1}>{a.name}</Text>
                <Text style={styles.leagueChamp} numberOfLines={1}>🏆 {a.standings[0]?.clubName ?? '—'}</Text>
              </View>
              {isSpecialFormat(a.format) && (
                <View style={styles.fmtTag}><Text style={styles.fmtTagText}>{FORMAT_LABEL[a.format!]}</Text></View>
              )}
              <Text style={styles.leagueCount}>{a.standings.length} ›</Text>
            </Pressable>
          ))}
          <Pressable style={styles.browseAllBtn} onPress={() => setBrowserOpen(true)}>
            <Text style={styles.browseAllText}>Browse all {associations.length} leagues →</Text>
          </Pressable>
        </View>
      )}

      {winner && (
        <View style={[styles.card, styles.winnerCard]}>
          <Text style={styles.winnerLabel}>UCL Champion</Text>
          <Text style={styles.winnerName}>{winner.clubName}</Text>
          <Text style={styles.winnerOvr}>OVR {winner.ovr}</Text>
        </View>
      )}

      {fromHistory ? (
        <>
          {dbRun?.stats && (
            <Pressable style={({ pressed }) => [styles.actionBtn, { backgroundColor: CL.accent, marginBottom: spacing.md }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]} onPress={() => router.push({ pathname: '/game/stats', params: { runId: params.runId! } })}>
              <Text style={styles.actionBtnText}>📊 View Stats</Text>
            </Pressable>
          )}
          <Pressable style={styles.rulesBtn} onPress={() => setRulesOpen(true)}>
            <Text style={styles.rulesBtnText}>📖 How this competition works — all rules</Text>
          </Pressable>
          <View style={styles.buttonRow}>
            <Pressable style={({ pressed }) => [styles.actionBtn, styles.actionBtnSecondary, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]} onPress={() => router.back()}>
              <Text style={styles.actionBtnText}>Back</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          {draftedPlayers.length > 0 && (
            <Pressable style={({ pressed }) => [styles.actionBtn, { backgroundColor: CL.accent, marginBottom: spacing.md }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]} onPress={() => router.push('/game/stats')}>
              <Text style={styles.actionBtnText}>📊 View Stats</Text>
            </Pressable>
          )}
          <Pressable style={styles.rulesBtn} onPress={() => setRulesOpen(true)}>
            <Text style={styles.rulesBtnText}>📖 How this competition works — all rules</Text>
          </Pressable>
          <View style={styles.buttonRow}>
            <Pressable disabled={submitting} style={({ pressed }) => [styles.actionBtn, styles.actionBtnSecondary, submitting && { opacity: 0.5 }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]} onPress={handleReturnToHome}>
              <Text style={styles.actionBtnText}>{submitting ? 'Saving…' : 'Return to Home'}</Text>
            </Pressable>
            <Pressable disabled={submitting} style={({ pressed }) => [styles.actionBtn, submitting && { opacity: 0.5 }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]} onPress={handlePlayAgain}>
              <Text style={styles.actionBtnText}>{submitting ? 'Saving…' : 'Play Again'}</Text>
            </Pressable>
          </View>
        </>
      )}

      <TeamModal team={openTeam} matches={openTeam ? leagueMatchdays : []} onClose={() => setOpenTeam(null)} onOpenMatch={openLeagueMatchDetail} />
      <KoTieDetailModal
        match={openKO} roundLabel={openKO ? (CL_KO_NAMES[openKO.round] ?? QUAL_ROUND_LABEL[openKO.round]) : undefined} onClose={() => setOpenKO(null)}
        playerClubId={playerTeam.clubId}
        draftedPlayers={(fromHistory ? dbRun?.squad ?? [] : fullSquad) as DraftedPlayer[]}
        yearStart={store.clYear ?? 2025}
      />
      <MatchDetailModal request={matchDetail} onClose={() => setMatchDetail(null)} accent={MODE_THEMES.champions_league.accent} />
      <LeagueTableModal table={openLeague} playerClubId={playerTeam.clubId} onClose={() => setOpenLeague(null)} />
      <LeaguesBrowserModal visible={browserOpen} tables={associations} playerClubId={playerTeam.clubId} onClose={() => setBrowserOpen(false)} />
      <RulesModal visible={rulesOpen} onClose={() => setRulesOpen(false)} />
    </ScrollView>
  )
}

// ── Shared sub-components (from the CL result page) ──────────────────────────
function StatBox({ label, value }: { label: string; value: string }) {
  return <View style={styles.statBox}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>
}

function StandingsRow({ team, pos }: { team: any; pos: number }) {
  const gd = team.stats.goalsFor - team.stats.goalsAgainst
  const zone = pos <= 8 ? colors.success : pos <= 24 ? colors.warning : '#DC2626'
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
        const rc = gf > ga ? colors.success : gf < ga ? '#DC2626' : colors.warning
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
            {(myS || oppS) && <Text style={styles.mdScorerLine} numberOfLines={2}>{[myS && `⚽ ${myS}`, oppS && `· ${oppS}`].filter(Boolean).join('  ')}</Text>}
          </Pressable>
        )
      })}
    </View>
  )
}

function TeamModal({ team, matches, onClose, onOpenMatch }: { team: { clubId: string; clubName: string } | null; matches: CLLeagueMatch[]; onClose: () => void; onOpenMatch?: (m: CLLeagueMatch) => void }) {
  return (
    <AppModal visible={team !== null} onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          {team && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>{team.clubName}</Text>
              <Text style={styles.phaseNote}>League phase results</Text>
              <TeamMatchdays matches={matches} clubId={team.clubId} onOpenMatch={onOpenMatch} />
            </ScrollView>
          )}
          <Pressable style={styles.modalClose} onPress={onClose}><Text style={styles.modalCloseText}>Close</Text></Pressable>
        </Pressable>
      </Pressable>
    </AppModal>
  )
}

type BracketRound = { key: string; label: string; sub: string; matches: CLKnockoutMatch[]; showDirect?: boolean }
const BRACKET_ROW_H = 72

function BracketView({ rounds, directIds, onMatchPress }: { rounds: BracketRound[]; directIds: Set<string>; onMatchPress: (m: CLKnockoutMatch) => void }) {
  const maxMatches = Math.max(...rounds.map(r => r.matches.length), 1)
  const colHeight = maxMatches * BRACKET_ROW_H
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator style={styles.bracketScroll}>
      <View style={styles.bracketRow}>
        {rounds.map(r => (
          <View key={r.key} style={styles.bracketCol}>
            <Text style={styles.bracketColLabel}>{r.label}</Text>
            <Text style={styles.bracketColSub}>{r.sub || ' '}</Text>
            <View style={[styles.bracketColBody, { height: colHeight }]}>
              {r.matches.map((m, i) => <BracketMatch key={i} match={m} directIds={directIds} showDirect={!!r.showDirect} onPress={() => onMatchPress(m)} />)}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

function BracketMatch({ match: m, directIds, showDirect, onPress }: { match: CLKnockoutMatch; directIds: Set<string>; showDirect: boolean; onPress: () => void }) {
  const isPM = m.teamA.isPlayer || m.teamB.isPlayer
  const aWon = m.winner.clubId === m.teamA.clubId
  const suffix = m.aPens !== undefined ? `pens ${m.aPens}-${m.bPens}` : m.extraTime ? 'AET' : null
  return (
    <Pressable style={[styles.bracketCard, isPM && styles.bracketCardPlayer]} onPress={onPress}>
      <BracketTeam team={m.teamA} won={aWon} goals={m.aGoals} direct={showDirect && directIds.has(m.teamA.clubId)} />
      <View style={styles.bracketDivider}>
        {suffix && <Text style={styles.bracketSuffix}>{suffix}</Text>}
        {m.leg1 && m.leg2 && <Text style={styles.bracketLegs}>{m.leg1.aGoals}-{m.leg1.bGoals} · {m.leg2.aGoals}-{m.leg2.bGoals}</Text>}
      </View>
      <BracketTeam team={m.teamB} won={!aWon} goals={m.bGoals} direct={showDirect && directIds.has(m.teamB.clubId)} />
    </Pressable>
  )
}

const CL_KO_NAMES: Record<string, string> = { playoff: 'Playoff', r16: 'Round of 16', qf: 'Quarter-Final', sf: 'Semi-Final', final: 'Final' }

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

function ordinal(n: number): string {
  if (n === 1) return 'st'; if (n === 2) return 'nd'; if (n === 3) return 'rd'; return 'th'
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: typography.md, color: colors.textSecondary },
  header: { alignItems: 'center', paddingTop: 56, paddingBottom: spacing.xl, gap: spacing.sm },
  competitionLabel: { fontSize: typography.xs, fontWeight: typography.black, color: CL.accent, letterSpacing: 3, textTransform: 'uppercase' },
  resultBanner: { fontSize: typography.xxl, fontWeight: typography.black, textAlign: 'center', letterSpacing: 1 },
  trophy: { fontSize: 56 },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md, ...shadows.sm },
  playerTeamRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  playerTeamName: { fontSize: typography.xl, fontWeight: typography.black, color: colors.textPrimary },
  playerTeamMeta: { fontSize: typography.sm, color: colors.textSecondary, marginTop: 2 },
  potPill: { borderRadius: radius.full, borderWidth: 2, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  potPillText: { fontSize: typography.sm, fontWeight: typography.black },
  entryBanner: { borderWidth: 1, borderRadius: radius.md, padding: spacing.sm },
  domesticLine: { fontSize: typography.xs, color: colors.textSecondary, textAlign: 'center' },
  rulesBtn: { alignSelf: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated, marginBottom: spacing.md },
  rulesBtnText: { fontSize: typography.xs, color: colors.textSecondary, fontWeight: typography.bold },
  entryText: { fontSize: typography.xs, fontWeight: typography.bold, textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  statBox: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: typography.md, fontWeight: typography.black, color: colors.textPrimary },
  statLabel: { fontSize: typography.xs, color: colors.textMuted, textAlign: 'center' },
  sectionTitle: { fontSize: typography.md, fontWeight: typography.bold, color: colors.textPrimary },
  phaseNote: { fontSize: typography.xs, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs },

  // domestic leagues
  leagueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  leagueRank: { width: 34, fontSize: 12, fontWeight: typography.black, color: CL.accent },
  leagueFlag: { fontSize: 16, width: 24, textAlign: 'center' },
  leaguesScroll: { maxHeight: 340 },
  browseAllBtn: { marginTop: spacing.sm, borderWidth: 1, borderColor: CL.accent, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  browseAllText: { fontSize: typography.sm, fontWeight: typography.black, color: CL.accent, letterSpacing: 0.5 },
  leagueName: { fontSize: typography.sm, fontWeight: typography.bold, color: colors.textPrimary },
  leagueChamp: { fontSize: typography.xs, color: colors.textSecondary, marginTop: 1 },
  leagueCount: { fontSize: 10, color: colors.textMuted },
  fmtTag: { backgroundColor: CL.accent + '22', borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  fmtTagText: { fontSize: 8, color: CL.accent, fontWeight: typography.bold },
  fmtExplainer: { fontSize: typography.xs, color: colors.textSecondary, lineHeight: 17, marginTop: spacing.xs, marginBottom: spacing.sm },
  leagueTableHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  leagueTableHeadTxt: { fontSize: 9, color: colors.textMuted, fontWeight: typography.bold, textTransform: 'uppercase' },
  leagueTableRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border },
  leagueTablePos: { width: 22, fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  leagueTableName: { flex: 1, fontSize: typography.sm, color: colors.textPrimary },
  leagueTableWdl: { width: 56, fontSize: 11, color: colors.textSecondary, textAlign: 'center' },
  leagueTablePts: { width: 30, fontSize: typography.sm, fontWeight: typography.bold, color: CL.accent, textAlign: 'right' },

  tableHeaderRow: { flexDirection: 'row', paddingBottom: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  standingsScroll: { maxHeight: 360 },
  tableRow: { flexDirection: 'row', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' },
  tableRowPlayer: { backgroundColor: CL.accent + '11', borderColor: CL.accent, borderWidth: 1, borderRadius: radius.sm },
  tableCol: { fontSize: 10, fontWeight: typography.bold, color: colors.textMuted },
  tableColData: { fontSize: 11, color: colors.textSecondary },
  playerText: { color: CL.accent, fontWeight: typography.bold },
  colPos: { width: 34, textAlign: 'center' as any },
  posCell: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  zoneDot: { width: 6, height: 6, borderRadius: 3 },
  colName: { flex: 1, paddingLeft: spacing.xs },
  colStat: { width: 28, textAlign: 'center' as any },
  colPts: { width: 32, fontWeight: typography.bold },

  mdList: { gap: spacing.xs },
  mdRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 3 },
  mdNum: { width: 34, fontSize: 10, fontWeight: typography.bold, color: colors.textMuted },
  mdVenue: { width: 16, fontSize: 10, color: colors.textMuted },
  mdOpp: { flex: 1, fontSize: 12, color: colors.textSecondary },
  mdScoreBadge: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, minWidth: 40, alignItems: 'center' },
  mdScoreText: { fontSize: 12, fontWeight: typography.black },
  mdScorerLine: { fontSize: 9, color: colors.textMuted, paddingLeft: 34, paddingBottom: 4 },
  koTieAgg: { fontSize: typography.md, fontWeight: typography.bold, color: colors.textPrimary, textAlign: 'center', marginVertical: spacing.xs },
  koModalNote: { fontSize: typography.xs, color: colors.warning, textAlign: 'center' },
  koModalPens: { fontSize: typography.sm, color: CL.accent, fontWeight: typography.bold, textAlign: 'center', marginBottom: spacing.sm },
  koLegBlock: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.xs, gap: 2 },
  koLegLabel: { fontSize: typography.xs, color: colors.textMuted, fontWeight: typography.bold, textTransform: 'uppercase', letterSpacing: 1 },
  koLegScore: { fontSize: typography.sm, color: colors.textPrimary, fontWeight: typography.bold },
  koLegScorer: { fontSize: typography.xs, color: colors.textSecondary },

  bracketScroll: { marginHorizontal: -spacing.xs, marginTop: spacing.sm },
  bracketRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.xs },
  bracketCol: { width: 158 },
  bracketColLabel: { fontSize: typography.xs, fontWeight: typography.black, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' },
  bracketColSub: { fontSize: 8, color: CL.accent, textAlign: 'center', marginBottom: spacing.xs },
  bracketColBody: { justifyContent: 'space-around' },
  bracketCard: { backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: 4, paddingHorizontal: spacing.sm },
  bracketCardPlayer: { borderColor: CL.accent, backgroundColor: CL.accent + '11' },
  bracketTeamRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  bracketTeamName: { flex: 1, fontSize: 10, color: colors.textMuted },
  bracketTeamWon: { color: colors.textPrimary, fontWeight: typography.black },
  bracketTeamPlayer: { color: CL.accent },
  bracketTeamGoals: { fontSize: 11, fontWeight: typography.bold, color: colors.textSecondary, width: 14, textAlign: 'right' },
  bracketDirect: { color: colors.tiers.perfection },
  bracketDivider: { minHeight: 10, alignItems: 'center', justifyContent: 'center' },
  bracketSuffix: { fontSize: 8, color: colors.warning, fontWeight: typography.bold },
  bracketLegs: { fontSize: 8, color: colors.textMuted },
  winnerCard: { alignItems: 'center', backgroundColor: colors.tiers.perfection + '11', borderColor: colors.tiers.perfection },
  winnerLabel: { fontSize: typography.xs, color: colors.textMuted, fontWeight: typography.bold, textTransform: 'uppercase', letterSpacing: 1 },
  winnerName: { fontSize: typography.xxl, fontWeight: typography.black, color: colors.tiers.perfection },
  winnerOvr: { fontSize: typography.sm, color: colors.textSecondary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  modalCard: { width: '100%', maxHeight: '80%', backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  modalTitle: { fontSize: typography.lg, fontWeight: typography.black, color: colors.textPrimary },
  modalClose: { marginTop: spacing.md, backgroundColor: colors.bgElevated, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  modalCloseText: { fontSize: typography.md, fontWeight: typography.bold, color: colors.textPrimary },
  buttonRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  actionBtn: { flex: 1, backgroundColor: CL.accent, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: 'center', ...shadows.md },
  actionBtnSecondary: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  actionBtnText: { fontSize: typography.md, fontWeight: typography.black, color: colors.textPrimary, letterSpacing: 1.5 },
})
