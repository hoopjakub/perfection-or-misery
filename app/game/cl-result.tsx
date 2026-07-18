import React, { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Animated } from 'react-native'
import { AppModal } from '@/components/AppModal'
import { router, useLocalSearchParams } from 'expo-router'
import { restartToModeSelect, exitToHome } from '@/lib/nav'
import { useGameStore } from '@/store/gameStore'
import { useUserStore } from '@/store/userStore'
import { saveCLRun, fetchRunById } from '@/db/queries/runs'
import { computeCLRunStats, summariseScorers, attachCLShootoutNames, koTieLegRecord } from '@/engine/run-stats'
import { MatchDetailModal, koLegDetailRequest, type MatchDetailRequest } from '@/components/MatchDetailModal'
import { mergeCareerFromRun } from '@/db/queries/career'
import { LineupPitch } from '@/components/LineupPitch'
import { SquadSummary } from '@/components/SquadSummary'
import { PenShootout } from '@/components/PenShootout'
import { InfoBubble, TitleWithInfo, RulesModal } from '@/components/InfoBubble'
import { colors, spacing, typography, radius, shadows, MODE_THEMES } from '@/theme'
import type { CLSeasonResult, CLKnockoutMatch, CLLeagueMatch } from '@/engine/cl-sim'
import type { CompetitionStats, SeasonAwards } from '@/types/stats'
import type { DraftedPlayer } from '@/types/game'

const CL = MODE_THEMES.champions_league

const ROUND_LABELS: Record<string, string> = {
  league_exit:   'Eliminated in League Phase',
  playoff_exit:  'Eliminated in Playoff Round',
  r16_exit:      'Round of 16 Exit',
  qf_exit:       'Quarter-Final Exit',
  sf_exit:       'Semi-Final Exit',
  finalist:      'UCL Finalist',
  winner:        'UCL CHAMPION',
}

const ROUND_COLORS: Record<string, string> = {
  league_exit:   '#DC2626',
  playoff_exit:  '#EA580C',
  r16_exit:      '#F59E0B',
  qf_exit:       '#F59E0B',
  sf_exit:       '#A78BFA',
  finalist:      '#34D399',
  winner:        '#F59E0B',
}

export default function CLResultScreen() {
  const store = useGameStore()
  const { resetRun, formation, draftedPlayers, benchPlayers, quickSim, difficulty, customDifficulty } = store
  const fullSquad = [...draftedPlayers, ...benchPlayers]
  const { user, isGuest } = useUserStore()
  const params = useLocalSearchParams<{ runId?: string }>()
  const fromHistory = !!params.runId

  const [dbRun, setDbRun] = useState<any>(null)
  const [loading, setLoading] = useState(fromHistory)
  const [openTeam, setOpenTeam] = useState<{ clubId: string; clubName: string } | null>(null)
  const [openKO, setOpenKO] = useState<CLKnockoutMatch | null>(null)
  const [matchDetail, setMatchDetail] = useState<MatchDetailRequest | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [runStats, setRunStats] = useState<{ stats: CompetitionStats; awards: SeasonAwards } | null>(null)
  // Re-entry guards for save/exit — kept above the early returns (rules of hooks).
  const savedRef = useRef(false)
  const submittingRef = useRef(false)
  const [submitting, setSubmitting] = useState(false)

  // Hero entrance — fade + rise the banner in once the result is on screen.
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
      .catch(err => console.error('[cl-result] failed to load run:', err))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [params.runId])

  const clResult: CLSeasonResult | null =
    (dbRun?.cl_result as CLSeasonResult | undefined) ?? store.clResult ?? null

  // Squad stats (fresh runs only — needs the live drafted XI).
  useEffect(() => {
    if (fromHistory || !store.clResult || draftedPlayers.length === 0) return
    computeCLRunStats(store.clResult, fullSquad, store.clYear ?? 2025, undefined, store.useSubstitutes)
      .then(res => res && setRunStats(res))
      .catch(e => console.warn('[cl-result] stats failed:', e))
  }, [])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={CL.accent} size="large" />
        <Text style={[styles.errorText, { marginTop: spacing.md }]}>Loading run…</Text>
      </View>
    )
  }

  if (!clResult && dbRun) {
    return <CLHistorySummary run={dbRun} />
  }

  if (!clResult) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>No CL result found.</Text>
        <Pressable onPress={() => router.replace('/game/mode-select')} style={{ marginTop: spacing.lg }}>
          <Text style={{ color: CL.accent, fontWeight: '700' }}>← Back to Menu</Text>
        </Pressable>
      </View>
    )
  }

  const { leaguePhaseStandings, playoffRound, r16, qf, sf, final, winner, playerTeam, playerFinalRound, playerPot } = clResult
  const resultColor = ROUND_COLORS[playerFinalRound] ?? CL.accent
  const resultLabel = ROUND_LABELS[playerFinalRound] ?? playerFinalRound
  const isChampion  = playerFinalRound === 'winner'
  const playerPos   = leaguePhaseStandings.findIndex(t => t.isPlayer) + 1
  const leagueMatchdays: CLLeagueMatch[] = clResult.leagueMatchdays ?? []

  // Deep-stats entry points — league-phase matches + knockout-tie legs.
  const clYearStart = store.clYear ?? 2025
  const ovrByClub = new Map(leaguePhaseStandings.map(t => [t.clubId, t.ovr]))
  const openLeagueMatchDetail = (m: CLLeagueMatch) => setMatchDetail({
    homeClubId: m.home.clubId, homeName: m.home.clubName,
    awayClubId: m.away.clubId, awayName: m.away.clubName,
    homeGoals: m.homeGoals, awayGoals: m.awayGoals,
    scorers: m.scorers, seed: m.seed, yearStart: clYearStart,
    competitionLabel: `League Phase · Matchday ${m.matchday}`,
    playerClubId: playerTeam.clubId,
    drafted: (fromHistory ? dbRun?.squad ?? [] : fullSquad) as DraftedPlayer[],
  })
  const openKoLegDetail = (m: CLKnockoutMatch, leg: 1 | 2) => {
    const req = koLegDetailRequest(m, leg, {
      label: CL_KO_NAMES[m.round] ?? m.round, yearStart: clYearStart, playerClubId: playerTeam.clubId,
      drafted: (fromHistory ? dbRun?.squad ?? [] : fullSquad) as DraftedPlayer[],
    })
    if (req) setMatchDetail(req)
  }

  // Player's knockout run summary — record is LEG-by-leg (you can win one leg
  // and lose the other), not just who won the tie overall.
  const playerKoTies = [...playoffRound, ...r16, ...qf, ...sf, ...(final ? [final] : [])]
    .filter(m => m.teamA.isPlayer || m.teamB.isPlayer)
  let koW = 0, koD = 0, koL = 0, koGF = 0, koGA = 0
  playerKoTies.forEach(m => {
    const isA = m.teamA.isPlayer
    koGF += isA ? m.aGoals : m.bGoals
    koGA += isA ? m.bGoals : m.aGoals
    const { w, d, l } = koTieLegRecord(m, isA)
    koW += w; koD += d; koL += l
  })

  // Awaited (not fire-and-forget) so the run is in the DB before we navigate —
  // otherwise Home re-fetches recent runs before the save lands.
  async function persistRun() {
    if (fromHistory || quickSim) return
    if (savedRef.current) return       // never persist the same run twice
    savedRef.current = true
    if (user && !isGuest && formation) {
      try {
        await saveCLRun({
          userId: user.id,
          formation,
          teamOvr: playerTeam.ovr,
          result: clResult!,
          squad: fullSquad,
          difficulty, custom: customDifficulty,
          stats: runStats?.stats,
          awards: runStats?.awards,
        })
      } catch (error) { console.error('Failed to save CL run:', error) }
    }
    if (user && !isGuest && runStats) {
      const pots = runStats.awards.playerOfTheSeason[0], u21 = runStats.awards.bestU21[0]
      await mergeCareerFromRun(user.id, {
        competition: 'champions_league',
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
    restartToModeSelect()
  }

  async function handleReturnToHome() {
    if (submittingRef.current) return
    submittingRef.current = true; setSubmitting(true)
    await persistRun()
    resetRun()
    exitToHome()
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: CL.bgTint }]} contentContainerStyle={styles.content}>
      {/* Header */}
      <Animated.View style={[
        styles.header,
        { opacity: heroAnim, transform: [{ translateY: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] },
      ]}>
        <Text style={styles.competitionLabel}>UEFA CHAMPIONS LEAGUE</Text>
        <Text style={[styles.resultBanner, { color: resultColor }]}>{resultLabel.toUpperCase()}</Text>
        {isChampion && <Text style={styles.trophy}>🏆</Text>}
      </Animated.View>

      {/* Player team summary */}
      <View style={[styles.card, { borderColor: resultColor }]}>
        <View style={styles.playerTeamRow}>
          <View>
            <Text style={styles.playerTeamName}>{playerTeam.clubName}</Text>
            <Text style={styles.playerTeamMeta}>OVR {playerTeam.ovr} · Pot {playerPot}</Text>
          </View>
          <View style={[styles.potPill, { backgroundColor: colors.pots[playerPot] + '22', borderColor: colors.pots[playerPot] }]}>
            <Text style={[styles.potPillText, { color: colors.pots[playerPot] }]}>POT {playerPot}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <StatBox label="League Pos" value={`${playerPos}${ordinal(playerPos)}`} />
          <StatBox label="Points" value={String(playerTeam.stats.points)} />
          <StatBox label="Record" value={`${playerTeam.stats.won}W ${playerTeam.stats.drawn}D ${playerTeam.stats.lost}L`} />
          <StatBox label="Goals" value={`${playerTeam.stats.goalsFor}-${playerTeam.stats.goalsAgainst}`} />
        </View>
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

      {/* Full league phase standings — all 36, scrollable, tap a row for matchdays */}
      <View style={styles.card}>
        <TitleWithInfo title="League Phase Standings" topic="league_phase_zones" style={styles.sectionTitle} />
        <Text style={styles.phaseNote}>Tap any club to see its matchday results</Text>
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
          <Text style={{ color: colors.success }}>■</Text> 1-8 → R16 direct   ·   <Text style={{ color: colors.warning }}>■</Text> 9-24 → Playoff   ·   <Text style={{ color: '#DC2626' }}>■</Text> 25-36 out
        </Text>
      </View>

      {/* Player's own matchdays */}
      {leagueMatchdays.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Your League Phase</Text>
          <TeamMatchdays matches={leagueMatchdays} clubId={playerTeam.clubId} onOpenMatch={openLeagueMatchDetail} />
        </View>
      )}

      {/* Knockout bracket + player's KO stat row */}
      {(playoffRound.length > 0 || r16.length > 0) && (
        <View style={styles.card}>
          <TitleWithInfo title="Knockout Rounds" topic="knockout_bracket" style={styles.sectionTitle} />
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
              { key: 'playoff', label: 'Playoff',        sub: '16 → 8', matches: playoffRound },
              { key: 'r16',     label: 'Round of 16',    sub: '8 + 8',  matches: r16, showDirect: true },
              { key: 'qf',      label: 'Quarter-Finals', sub: '',       matches: qf },
              { key: 'sf',      label: 'Semi-Finals',    sub: '',       matches: sf },
              { key: 'final',   label: 'Final',          sub: '',       matches: final ? [final] : [] },
            ].filter(r => r.matches.length > 0)}
            directIds={new Set(leaguePhaseStandings.slice(0, 8).map(t => t.clubId))}
            onMatchPress={setOpenKO}
          />
          <Text style={styles.phaseNote}>
            <Text style={{ color: colors.tiers.perfection }}>◆</Text> entered the Round of 16 directly (1st–8th) · all others came through the Playoff round · tap a tie for detail
          </Text>
        </View>
      )}

      {/* Winner card */}
      {winner && (
        <View style={[styles.card, styles.winnerCard]}>
          <Text style={styles.winnerLabel}>UCL Champion</Text>
          <Text style={styles.winnerName}>{winner.clubName}</Text>
          <Text style={styles.winnerOvr}>OVR {winner.ovr}</Text>
        </View>
      )}

      {/* Buttons */}
      {fromHistory ? (
        <>
          {dbRun?.stats && (
            <Pressable style={({ pressed }) => [styles.actionBtn, { backgroundColor: CL.accent, marginBottom: spacing.md }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]} onPress={() => router.push({ pathname: '/game/stats', params: { runId: params.runId! } })}>
              <Text style={styles.actionBtnText}>📊 View Stats</Text>
            </Pressable>
          )}
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

      {/* How the Champions League works */}
      <Pressable style={styles.rulesLink} onPress={() => setRulesOpen(true)}>
        <Text style={[styles.rulesLinkText, { color: CL.accent }]}>📖  How the Champions League works</Text>
      </Pressable>

      {/* Team matchday modal */}
      <TeamModal
        team={openTeam}
        matches={openTeam ? leagueMatchdays : []}
        onClose={() => setOpenTeam(null)}
        onOpenMatch={openLeagueMatchDetail}
      />
      <KOTieModal
        match={openKO} onClose={() => setOpenKO(null)}
        playerClubId={playerTeam.clubId}
        draftedPlayers={(fromHistory ? dbRun?.squad ?? [] : fullSquad) as DraftedPlayer[]}
        onStatsLeg={openKoLegDetail}
      />
      <MatchDetailModal request={matchDetail} onClose={() => setMatchDetail(null)} accent={CL.accent} />
      <RulesModal visible={rulesOpen} onClose={() => setRulesOpen(false)} accent={CL.accent} />
    </ScrollView>
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

function StandingsRow({ team, pos }: { team: any; pos: number }) {
  const gd = team.stats.goalsFor - team.stats.goalsAgainst
  // qualification zone accent on the position number
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

// One team's league-phase fixtures, from that team's perspective.
function TeamMatchdays({ matches, clubId, onOpenMatch }: { matches: CLLeagueMatch[]; clubId: string; onOpenMatch?: (m: CLLeagueMatch) => void }) {
  const own = matches
    .filter(m => m.home.clubId === clubId || m.away.clubId === clubId)
    .sort((a, b) => a.matchday - b.matchday)
  if (own.length === 0) return <Text style={styles.phaseNote}>No matchday data.</Text>

  return (
    <View style={styles.mdList}>
      {own.map((m, i) => {
        const atHome = m.home.clubId === clubId
        const oppName = atHome ? m.away.clubName : m.home.clubName
        const gf = atHome ? m.homeGoals : m.awayGoals
        const ga = atHome ? m.awayGoals : m.homeGoals
        const rc = gf > ga ? colors.success : gf < ga ? '#DC2626' : colors.warning
        const myS  = summariseScorers(atHome ? m.scorers?.home : m.scorers?.away)
        const oppS = summariseScorers(atHome ? m.scorers?.away : m.scorers?.home)
        return (
          <Pressable key={i} onPress={onOpenMatch ? () => onOpenMatch(m) : undefined} disabled={!onOpenMatch}>
            <View style={styles.mdRow}>
              <Text style={styles.mdNum}>MD{m.matchday}</Text>
              <Text style={styles.mdVenue}>{atHome ? 'vs' : '@'}</Text>
              <Text style={styles.mdOpp} numberOfLines={1}>{oppName}</Text>
              <View style={[styles.mdScoreBadge, { backgroundColor: rc + '22' }]}>
                <Text style={[styles.mdScoreText, { color: rc }]}>{gf}-{ga}</Text>
              </View>
            </View>
            {(myS || oppS) && (
              <Text style={styles.mdScorerLine} numberOfLines={2}>
                {[myS && `⚽ ${myS}`, oppS && `· ${oppS}`].filter(Boolean).join('  ')}
              </Text>
            )}
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
          <Pressable style={styles.modalClose} onPress={onClose}>
            <Text style={styles.modalCloseText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </AppModal>
  )
}

// Horizontal column-per-round bracket. The Playoff is the left-most feeder
// column (16→8); direct qualifiers (1st–8th) appear in the R16 column with a
// ◆ marker since they skip the Playoff entirely.
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
              {r.matches.map((m, i) => (
                <BracketMatch key={i} match={m} directIds={directIds} showDirect={!!r.showDirect} onPress={() => onMatchPress(m)} />
              ))}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

function BracketMatch({ match: m, directIds, showDirect, onPress }: { match: CLKnockoutMatch; directIds: Set<string>; showDirect: boolean; onPress: () => void }) {
  const isPM   = m.teamA.isPlayer || m.teamB.isPlayer
  const aWon   = m.winner.clubId === m.teamA.clubId
  const suffix = m.aPens !== undefined ? `pens ${m.aPens}-${m.bPens}` : m.extraTime ? 'AET' : null
  return (
    <Pressable style={[styles.bracketCard, isPM && styles.bracketCardPlayer]} onPress={onPress}>
      <BracketTeam team={m.teamA} won={aWon} goals={m.aGoals} direct={showDirect && directIds.has(m.teamA.clubId)} />
      <View style={styles.bracketDivider}>
        {suffix && <Text style={styles.bracketSuffix}>{suffix}</Text>}
        {m.leg1 && m.leg2 && (
          <Text style={styles.bracketLegs}>{m.leg1.aGoals}-{m.leg1.bGoals} · {m.leg2.aGoals}-{m.leg2.bGoals}</Text>
        )}
      </View>
      <BracketTeam team={m.teamB} won={!aWon} goals={m.bGoals} direct={showDirect && directIds.has(m.teamB.clubId)} />
    </Pressable>
  )
}

const CL_KO_NAMES: Record<string, string> = { playoff: 'Playoff', r16: 'Round of 16', qf: 'Quarter-Final', sf: 'Semi-Final', final: 'Final' }

// Tap-through detail for a CL knockout tie (two legs, or the single final).
function KOTieModal({ match: m, onClose, playerClubId, draftedPlayers, onStatsLeg }: {
  match: CLKnockoutMatch | null; onClose: () => void
  playerClubId?: string; draftedPlayers?: DraftedPlayer[]
  onStatsLeg?: (m: CLKnockoutMatch, leg: 1 | 2) => void   // deep-stats per leg
}) {
  // Named penalty takers are only pre-built for the tie the reveal animated.
  // Expand lazily here (same shared helper the live sim uses) so EVERY
  // shootout — history runs, other ties — shows real takers. Your own club's
  // takers come from YOUR drafted squad, not the DB's historical roster.
  const [, forceTick] = useState(0)
  useEffect(() => {
    if (!m || m.penKicksA || !m.aPenKicks || !m.bPenKicks) return
    let active = true
    attachCLShootoutNames([m], playerClubId, draftedPlayers).then(() => { if (active) forceTick(x => x + 1) }).catch(() => { /* fall back to no list */ })
    return () => { active = false }
  }, [m])
  const kicksA = m?.penKicksA
  const kicksB = m?.penKicksB
  return (
    <AppModal visible={m !== null} onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          {m && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>{CL_KO_NAMES[m.round] ?? m.round}</Text>
              <Text style={styles.koTieAgg}>{m.teamA.clubName} {m.aGoals} – {m.bGoals} {m.teamB.clubName} {m.leg1 ? '(agg.)' : ''}</Text>
              {m.extraTime && <Text style={styles.koModalNote}>Decided after extra time</Text>}
              {m.aPens !== undefined && <Text style={styles.koModalPens}>Penalties: {m.aPens} – {m.bPens} · {m.winner.clubName} advance</Text>}
              {kicksA && kicksB && <PenShootout teamA={m.teamA.clubName} teamB={m.teamB.clubName} kicksA={kicksA} kicksB={kicksB} />}

              {m.leg1 ? (
                <>
                  <KOLeg label="Leg 1" home={m.teamA.clubName} away={m.teamB.clubName} hg={m.leg1.aGoals} ag={m.leg1.bGoals} scorers={m.leg1Scorers} homeId={m.teamA.clubId} onStats={onStatsLeg ? () => onStatsLeg(m, 1) : undefined} />
                  {m.leg2 && <KOLeg label="Leg 2" home={m.teamB.clubName} away={m.teamA.clubName} hg={m.leg2.bGoals} ag={m.leg2.aGoals} scorers={m.leg2Scorers} homeId={m.teamB.clubId} onStats={onStatsLeg ? () => onStatsLeg(m, 2) : undefined} />}
                  {m.leg2ExtraTime && (m.leg2ExtraTime.aGoals > 0 || m.leg2ExtraTime.bGoals > 0) && <KOLeg label="Extra Time (leg 2)" home={m.teamB.clubName} away={m.teamA.clubName} hg={m.leg2ExtraTime.bGoals} ag={m.leg2ExtraTime.aGoals} scorers={m.leg2ExtraTimeScorers} homeId={m.teamB.clubId} />}
                </>
              ) : (
                <KOLeg label="Final" home={m.teamA.clubName} away={m.teamB.clubName} hg={m.aGoals} ag={m.bGoals} scorers={m.leg1Scorers} homeId={m.teamA.clubId} onStats={onStatsLeg ? () => onStatsLeg(m, 1) : undefined} />
              )}
            </ScrollView>
          )}
          <Pressable style={styles.modalClose} onPress={onClose}><Text style={styles.modalCloseText}>Close</Text></Pressable>
        </Pressable>
      </Pressable>
    </AppModal>
  )
}

function KOLeg({ label, home, away, hg, ag, scorers, homeId, onStats }: { label: string; home: string; away: string; hg: number; ag: number; scorers?: import('@/types/stats').MatchScorers; homeId: string; onStats?: () => void }) {
  const hs = summariseScorers(scorers?.home), as = summariseScorers(scorers?.away)
  return (
    <View style={styles.koLegBlock}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={styles.koLegLabel}>{label}</Text>
        {onStats && (
          <Pressable onPress={onStats} hitSlop={8}>
            <Text style={{ fontSize: 10, color: CL.accent, fontWeight: typography.bold }}>📊 Match stats ›</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.koLegScore}>{home} {hg} – {ag} {away}</Text>
      {hs ? <Text style={styles.koLegScorer}>⚽ {home}: {hs}</Text> : null}
      {as ? <Text style={styles.koLegScorer}>⚽ {away}: {as}</Text> : null}
    </View>
  )
}

function BracketTeam({ team, won, goals, direct }: { team: any; won: boolean; goals: number; direct: boolean }) {
  return (
    <View style={styles.bracketTeamRow}>
      <Text
        style={[styles.bracketTeamName, won && styles.bracketTeamWon, team.isPlayer && styles.bracketTeamPlayer]}
        numberOfLines={1}
      >
        {direct && <Text style={styles.bracketDirect}>◆ </Text>}{team.clubName}
      </Text>
      <Text style={[styles.bracketTeamGoals, won && styles.bracketTeamWon]}>{goals}</Text>
    </View>
  )
}

// Degraded view for older CL runs saved before the full tournament was stored.
function CLHistorySummary({ run }: { run: any }) {
  const round = String(run.tier ?? '')
  const color = ROUND_COLORS[round] ?? CL.accent
  const label = ROUND_LABELS[round] ?? round
  const games = (run.wins ?? 0) + (run.draws ?? 0) + (run.losses ?? 0)

  return (
    <ScrollView style={[styles.container, { backgroundColor: CL.bgTint }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.competitionLabel}>UEFA CHAMPIONS LEAGUE</Text>
        <Text style={[styles.resultBanner, { color }]}>{label.toUpperCase()}</Text>
        {round === 'winner' && <Text style={styles.trophy}>🏆</Text>}
      </View>
      <View style={[styles.card, { borderColor: color }]}>
        <Text style={styles.playerTeamName}>Your Club</Text>
        <Text style={styles.playerTeamMeta}>OVR {run.team_ovr} · Finished #{run.final_position} of {run.teams_in_league}</Text>
        <View style={styles.statsRow}>
          <StatBox label="Games" value={String(games)} />
          <StatBox label="Record" value={`${run.wins}W ${run.draws}D ${run.losses}L`} />
          <StatBox label="Goals" value={`${run.goals_for}-${run.goals_against}`} />
        </View>
      </View>
      <Text style={styles.phaseNote}>
        Full tournament details aren’t saved for this older run. Play a new Champions
        League to see the complete league table and bracket here.
      </Text>
      <View style={styles.buttonRow}>
        <Pressable style={({ pressed }) => [styles.actionBtn, styles.actionBtnSecondary, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]} onPress={() => router.back()}>
          <Text style={styles.actionBtnText}>Back</Text>
        </Pressable>
      </View>
    </ScrollView>
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
  container: { flex: 1, backgroundColor: colors.bg },
  content:   { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  center:    { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: typography.md, color: colors.textSecondary },

  header: {
    alignItems:   'center',
    paddingTop:   56,
    paddingBottom: spacing.xl,
    gap:          spacing.sm,
  },
  competitionLabel: {
    fontSize:      typography.xs,
    fontWeight:    typography.black,
    color:         CL.accent,
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
    backgroundColor: colors.bgCard,
    borderRadius:    radius.lg,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         spacing.lg,
    gap:             spacing.md,
    ...shadows.sm,
  },

  playerTeamRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
  },
  playerTeamName: { fontSize: typography.xl, fontWeight: typography.black, color: colors.textPrimary },
  playerTeamMeta: { fontSize: typography.sm, color: colors.textSecondary, marginTop: 2 },
  potPill: {
    borderRadius:      radius.full,
    borderWidth:       2,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.xs,
  },
  potPillText: { fontSize: typography.sm, fontWeight: typography.black },

  statsRow: {
    flexDirection: 'row',
    gap:           spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop:    spacing.md,
  },
  statBox:   { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: typography.md, fontWeight: typography.black, color: colors.textPrimary },
  statLabel: { fontSize: typography.xs, color: colors.textMuted, textAlign: 'center' },

  sectionTitle: { fontSize: typography.md, fontWeight: typography.bold, color: colors.textPrimary },
  rulesLink: { alignItems: 'center', paddingVertical: spacing.md },
  rulesLinkText: { fontSize: typography.sm, fontWeight: typography.bold },

  tableHeaderRow: {
    flexDirection:     'row',
    paddingBottom:     spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  standingsScroll: { maxHeight: 360 },
  tableRow: {
    flexDirection:     'row',
    paddingVertical:   spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems:        'center',
  },
  tableRowPlayer: {
    backgroundColor: CL.accent + '11',
    borderColor:     CL.accent,
    borderWidth:     1,
    borderRadius:    radius.sm,
  },
  tableCol:     { fontSize: 10, fontWeight: typography.bold, color: colors.textMuted },
  tableColData: { fontSize: 11, color: colors.textSecondary },
  playerText:   { color: CL.accent, fontWeight: typography.bold },
  colPos:  { width: 34, textAlign: 'center' as any },
  posCell: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  zoneDot: { width: 6, height: 6, borderRadius: 3 },
  colName: { flex: 1,  paddingLeft: spacing.xs },
  colStat: { width: 28, textAlign: 'center' as any },
  colPts:  { width: 32, fontWeight: typography.bold },

  phaseNote: {
    fontSize:  typography.xs,
    color:     colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },

  // matchday list
  mdList: { gap: spacing.xs },
  mdRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
    paddingVertical: 3,
  },
  mdNum:   { width: 34, fontSize: 10, fontWeight: typography.bold, color: colors.textMuted },
  mdVenue: { width: 16, fontSize: 10, color: colors.textMuted },
  mdOpp:   { flex: 1, fontSize: 12, color: colors.textSecondary },
  mdScoreBadge: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, minWidth: 40, alignItems: 'center' },
  mdScoreText:  { fontSize: 12, fontWeight: typography.black },
  mdScorerLine: { fontSize: 9, color: colors.textMuted, paddingLeft: 34, paddingBottom: 4 },
  koTieAgg:     { fontSize: typography.md, fontWeight: typography.bold, color: colors.textPrimary, textAlign: 'center', marginVertical: spacing.xs },
  koModalNote:  { fontSize: typography.xs, color: colors.warning, textAlign: 'center' },
  koModalPens:  { fontSize: typography.sm, color: CL.accent, fontWeight: typography.bold, textAlign: 'center', marginBottom: spacing.sm },
  koLegBlock:   { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.xs, gap: 2 },
  koLegLabel:   { fontSize: typography.xs, color: colors.textMuted, fontWeight: typography.bold, textTransform: 'uppercase', letterSpacing: 1 },
  koLegScore:   { fontSize: typography.sm, color: colors.textPrimary, fontWeight: typography.bold },
  koLegScorer:  { fontSize: typography.xs, color: colors.textSecondary },

  // knockout bracket
  bracketScroll: { marginHorizontal: -spacing.xs, marginTop: spacing.sm },
  bracketRow:    { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.xs },
  bracketCol:    { width: 158 },
  bracketColLabel: {
    fontSize:      typography.xs,
    fontWeight:    typography.black,
    color:         colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign:     'center',
  },
  bracketColSub: {
    fontSize:  8,
    color:     CL.accent,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  bracketColBody: { justifyContent: 'space-around' },
  bracketCard: {
    backgroundColor:   colors.bgElevated,
    borderRadius:      radius.md,
    borderWidth:       1,
    borderColor:       colors.border,
    paddingVertical:   4,
    paddingHorizontal: spacing.sm,
  },
  bracketCardPlayer: {
    borderColor:     CL.accent,
    backgroundColor: CL.accent + '11',
  },
  bracketTeamRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            4,
  },
  bracketTeamName:   { flex: 1, fontSize: 10, color: colors.textMuted },
  bracketTeamWon:    { color: colors.textPrimary, fontWeight: typography.black },
  bracketTeamPlayer: { color: CL.accent },
  bracketTeamGoals:  { fontSize: 11, fontWeight: typography.bold, color: colors.textSecondary, width: 14, textAlign: 'right' },
  bracketDirect:     { color: colors.tiers.perfection },
  bracketDivider: { minHeight: 10, alignItems: 'center', justifyContent: 'center' },
  bracketSuffix: { fontSize: 8, color: colors.warning, fontWeight: typography.bold },
  bracketLegs:   { fontSize: 8, color: colors.textMuted },

  winnerCard: {
    alignItems:      'center',
    backgroundColor: colors.tiers.perfection + '11',
    borderColor:     colors.tiers.perfection,
  },
  winnerLabel: { fontSize: typography.xs, color: colors.textMuted, fontWeight: typography.bold, textTransform: 'uppercase', letterSpacing: 1 },
  winnerName:  { fontSize: typography.xxl, fontWeight: typography.black, color: colors.tiers.perfection },
  winnerOvr:   { fontSize: typography.sm, color: colors.textSecondary },

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
    backgroundColor: colors.bgCard,
    borderRadius:    radius.lg,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         spacing.lg,
    gap:             spacing.sm,
  },
  modalTitle: { fontSize: typography.lg, fontWeight: typography.black, color: colors.textPrimary },
  modalClose: {
    marginTop:       spacing.md,
    backgroundColor: colors.bgElevated,
    borderRadius:    radius.md,
    paddingVertical: spacing.md,
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     colors.border,
  },
  modalCloseText: { fontSize: typography.md, fontWeight: typography.bold, color: colors.textPrimary },

  buttonRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  actionBtn: {
    flex:            1,
    backgroundColor: CL.accent,
    borderRadius:    radius.md,
    paddingVertical: spacing.lg,
    alignItems:      'center',
    ...shadows.md,
  },
  actionBtnSecondary: {
    backgroundColor: colors.bgElevated,
    borderWidth:     1,
    borderColor:     colors.border,
  },
  actionBtnText: {
    fontSize:      typography.md,
    fontWeight:    typography.black,
    color:         colors.textPrimary,
    letterSpacing: 1.5,
  },
})
