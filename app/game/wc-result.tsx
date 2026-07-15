import React, { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Animated } from 'react-native'
import { AppModal } from '@/components/AppModal'
import { router, useLocalSearchParams } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { useUserStore } from '@/store/userStore'
import { saveWCRun, fetchRunById } from '@/db/queries/runs'
import { computeWCRunStats, summariseScorers, attachWCShootoutNames } from '@/engine/run-stats'
import { mergeCareerFromRun } from '@/db/queries/career'
import { LineupPitch } from '@/components/LineupPitch'
import { SquadSummary } from '@/components/SquadSummary'
import { PenShootout } from '@/components/PenShootout'
import type { CompetitionStats, SeasonAwards } from '@/types/stats'
import type { DraftedPlayer } from '@/types/game'
import { TeamLabel } from '@/components/TeamLabel'
import { colors, spacing, typography, radius, shadows, MODE_THEMES } from '@/theme'
import type { WCKnockoutMatch, WCTeam, WCGroup, WCGroupMatch, WCSeasonResult } from '@/engine/world-cup-sim'

import { WCGroupModal, WCGroupMatchdays } from '@/components/WCGroupModal'
import { MatchDetailModal, type MatchDetailRequest } from '@/components/MatchDetailModal'

const WC = MODE_THEMES.world_cup

const ROUND_LABELS: Record<string, string> = {
  groups:  'Eliminated in Group Stage',
  r32:     'Round of 32 Exit',
  r16:     'Round of 16 Exit',
  qf:      'Quarter-Final Exit',
  sf:      'Semi-Final Exit',
  fourth:  "Semi 'No Medal' Finalist",
  third:   '🥉 Third Place',
  final:   'Finalist',
  winner:  'WORLD CUP CHAMPION',
}

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
  const { resetRun, formation, draftedPlayers, benchPlayers, quickSim } = store
  const fullSquad = [...draftedPlayers, ...benchPlayers]
  const { user, isGuest } = useUserStore()
  const params = useLocalSearchParams<{ runId?: string }>()
  const fromHistory = !!params.runId

  const [dbRun, setDbRun] = useState<any>(null)
  const [loading, setLoading] = useState(fromHistory)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [openKO, setOpenKO] = useState<WCKnockoutMatch | null>(null)
  const [matchDetail, setMatchDetail] = useState<MatchDetailRequest | null>(null)
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
    computeWCRunStats(store.wcResult, fullSquad, undefined, store.useSubstitutes)
      .then(res => res && setRunStats(res))
      .catch(e => console.warn('[wc-result] stats failed:', e))
  }, [])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={WC.accent} size="large" />
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
        <Text style={styles.errorText}>No World Cup result found.</Text>
        <Pressable onPress={() => router.replace('/game/mode-select')} style={{ marginTop: spacing.lg }}>
          <Text style={{ color: WC.accent, fontWeight: '700' }}>← Back to Menu</Text>
        </Pressable>
      </View>
    )
  }

  const {
    groups, knockoutRounds, winner,
    playerTeam, playerFinalRound, playerGroup, playerGroupPos,
  } = wcResult

  const resultColor = ROUND_COLORS[playerFinalRound] ?? WC.accent
  const resultLabel = ROUND_LABELS[playerFinalRound] ?? playerFinalRound
  const isChampion  = playerFinalRound === 'winner'

  // Pre-sort every group once
  const sortedGroups: WCGroup[] = groups.map(g => ({ id: g.id, teams: [...g.teams].sort(sortGroupTeams) }))
  const myGroup = sortedGroups.find(g => g.id === playerGroup)
  const myGroupSorted = myGroup ? myGroup.teams : []

  // Deep-stats entry points — group matches + knockout ties.
  const ovrByClub = new Map(groups.flatMap(g => g.teams).map(t => [t.clubId, t.ovr]))
  const openGroupMatchDetail = (m: WCGroupMatch) => setMatchDetail({
    homeClubId: m.home.clubId, homeName: m.home.clubName,
    awayClubId: m.away.clubId, awayName: m.away.clubName,
    homeGoals: m.homeGoals, awayGoals: m.awayGoals,
    scorers: m.scorers, seed: m.seed, yearStart: 2026,
    competitionLabel: `Group ${m.groupId} · Matchday ${m.matchday}`,
    playerClubId: playerTeam.clubId,
    drafted: (fromHistory ? dbRun?.squad ?? [] : fullSquad) as DraftedPlayer[],
  })
  const openKoDetail = (m: WCKnockoutMatch) => setMatchDetail({
    homeClubId: m.teamA.clubId, homeName: m.teamA.clubName,
    awayClubId: m.teamB.clubId, awayName: m.teamB.clubName,
    homeGoals: m.result.homeGoals, awayGoals: m.result.awayGoals,
    extraTime: m.result.extraTime,
    pensNote: m.result.homePens !== null ? `Penalties ${m.result.homePens} – ${m.result.awayPens} · ${m.winner.clubName} advance` : undefined,
    scorers: m.scorers, seed: m.seed, yearStart: 2026,
    competitionLabel: KO_ROUND_NAMES[m.round] ?? m.round,
    playerClubId: playerTeam.clubId,
    drafted: (fromHistory ? dbRun?.squad ?? [] : fullSquad) as DraftedPlayer[],
  })

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
    if (savedRef.current) return       // never persist the same run twice
    savedRef.current = true
    if (user && !isGuest && formation) {
      try {
        await saveWCRun({
          userId: user.id,
          formation,
          teamOvr: playerTeam.ovr,
          result: wcResult!,
          squad: fullSquad,
          stats: runStats?.stats,
          awards: runStats?.awards,
        })
      } catch (error) { console.error('Failed to save WC run:', error) }
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
    <ScrollView style={[styles.container, { backgroundColor: WC.bgTint }]} contentContainerStyle={styles.content}>
      {/* Header */}
      <Animated.View style={[
        styles.header,
        { opacity: heroAnim, transform: [{ translateY: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] },
      ]}>
        <Text style={styles.competitionLabel}>FIFA WORLD CUP</Text>
        <Text style={[styles.resultBanner, { color: resultColor }]}>{resultLabel.toUpperCase()}</Text>
        {isChampion && <Text style={styles.trophy}>🏆</Text>}
      </Animated.View>

      {/* Player team summary */}
      <View style={[styles.card, { borderColor: resultColor }]}>
        <TeamLabel clubId={playerTeam.clubId} name={playerTeam.clubName} textStyle={styles.playerTeamName} size={24} />
        <Text style={styles.playerTeamMeta}>
          OVR {playerTeam.ovr} · Group {playerGroup} · Finished {playerGroupPos}{ordinal(playerGroupPos)} in group
        </Text>
        <View style={styles.statsRow}>
          <StatBox label="Games" value={String(playerTeam.stats.played)} />
          <StatBox label="Record" value={`${playerTeam.stats.won}W ${playerTeam.stats.drawn}D ${playerTeam.stats.lost}L`} />
          <StatBox label="Goals" value={`${playerTeam.stats.goalsFor}-${playerTeam.stats.goalsAgainst}`} />
          <StatBox label="Points" value={String(playerTeam.stats.points)} />
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
            {st && <SquadSummary stats={st} draftedPlayers={squad} formation={form ?? null} accent={WC.accent} runId={params.runId} />}
          </>
        )
      })()}

      {/* Player group standings */}
      {myGroupSorted.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Group {playerGroup} Final Standings</Text>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableCol, styles.colPos]}>#</Text>
            <Text style={[styles.tableCol, styles.colName]}>Team</Text>
            <Text style={[styles.tableCol, styles.colStat]}>P</Text>
            <Text style={[styles.tableCol, styles.colStat]}>GD</Text>
            <Text style={[styles.tableCol, styles.colStat, styles.colPts]}>Pts</Text>
          </View>
          {myGroupSorted.map((team, idx) => {
            const gd = team.stats.goalsFor - team.stats.goalsAgainst
            const qualified = idx < 2
            return (
              <View key={team.clubId} style={[styles.tableRow, team.isPlayer && styles.tableRowPlayer, qualified && styles.tableRowQ]}>
                <Text style={[styles.tableColData, styles.colPos as any, team.isPlayer && styles.playerText]}>{idx + 1}</Text>
                <TeamLabel
                  clubId={team.clubId}
                  name={team.clubName}
                  containerStyle={styles.colName}
                  textStyle={[styles.tableColData, team.isPlayer && styles.playerText]}
                />
                <Text style={[styles.tableColData, styles.colStat, team.isPlayer && styles.playerText]}>{team.stats.played}</Text>
                <Text style={[styles.tableColData, styles.colStat, team.isPlayer && styles.playerText]}>{gd > 0 ? `+${gd}` : gd}</Text>
                <Text style={[styles.tableColData, styles.colStat, styles.colPts, team.isPlayer && styles.playerText]}>{team.stats.points}</Text>
              </View>
            )
          })}
          <Text style={styles.phaseNote}>Top 2 qualify · Best 8 third-place teams also qualify</Text>
          {groupMatchdays.length > 0 && (
            <WCGroupMatchdays matches={groupMatchdays.filter(m => m.groupId === playerGroup)} onOpenMatch={openGroupMatchDetail} />
          )}
        </View>
      )}

      {/* All groups */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>All Groups</Text>
        <Text style={styles.phaseNote}>Tap a group to see its results</Text>
        <View style={styles.groupsGrid}>
          {sortedGroups.map(group => {
            const playerInGroup = group.teams.some(t => t.isPlayer)
            return (
              <Pressable
                key={group.id}
                style={[styles.groupCard, playerInGroup && styles.groupCardPlayer]}
                onPress={() => setOpenGroup(group.id)}
              >
                <Text style={styles.groupCardTitle}>Group {group.id}</Text>
                {group.teams.map((team, idx) => {
                  const qualified = idx < 2
                  return (
                    <View key={team.clubId} style={[styles.groupTeamRow, qualified && styles.groupTeamRowQ, team.isPlayer && styles.groupTeamRowSelf]}>
                      <Text style={styles.groupTeamRank}>{idx + 1}</Text>
                      <TeamLabel
                        clubId={team.clubId}
                        name={team.clubName}
                        size={11}
                        gap={3}
                        containerStyle={styles.groupTeamName}
                        textStyle={[styles.groupTeamNameText, team.isPlayer && styles.groupTeamNameSelf]}
                      />
                      <Text style={styles.groupTeamPts}>{team.stats.points}</Text>
                    </View>
                  )
                })}
              </Pressable>
            )
          })}
        </View>
      </View>

      {/* Best third-place teams */}
      {thirdPlaceTeams.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Best Third-Place Teams</Text>
          <Text style={styles.phaseNote}>Top {q3Count} advanced to the Round of 32</Text>
          {thirdPlaceTeams.map((team, idx) => {
            const advances = idx < q3Count
            return (
              <View key={team.clubId} style={[styles.tableRow, advances && styles.tableRowQ, team.isPlayer && styles.tableRowPlayer]}>
                <Text style={[styles.tableColData, styles.colPos as any, team.isPlayer && styles.playerText]}>{idx + 1}</Text>
                <TeamLabel
                  clubId={team.clubId}
                  name={team.clubName}
                  containerStyle={styles.colName}
                  textStyle={[styles.tableColData, team.isPlayer && styles.playerText]}
                />
                {(() => { const gd = team.stats.goalsFor - team.stats.goalsAgainst
                  return <Text style={[styles.tableColData, styles.colStat]}>{gd >= 0 ? `+${gd}` : gd}</Text> })()}
                <Text style={[styles.tableColData, styles.colStat, styles.colPts, advances && { color: colors.success }]}>{team.stats.points}</Text>
              </View>
            )
          })}
        </View>
      )}

      {/* Knockout bracket */}
      {knockoutRounds.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Knockout Bracket</Text>
          {playerKoMatches.length > 0 && (
            <View style={styles.statsRow}>
              <StatBox label="KO Games" value={String(playerKoMatches.length)} />
              <StatBox label="Record" value={`${koW}W ${koL}L`} />
              <StatBox label="Goals" value={`${koGF}-${koGA}`} />
            </View>
          )}
          <Text style={styles.phaseNote}>Scroll sideways · your matches are highlighted</Text>
          <Text style={styles.phaseNote}>Tap a tie to see the match detail</Text>
          <BracketView knockoutRounds={knockoutRounds} onMatchPress={setOpenKO} />
        </View>
      )}

      {/* Winner */}
      {winner && (
        <View style={[styles.card, styles.winnerCard]}>
          <Text style={styles.winnerLabel}>World Cup Champion</Text>
          <TeamLabel clubId={winner.clubId} name={winner.clubName} textStyle={styles.winnerName} size={26} />
          <Text style={styles.winnerOvr}>OVR {winner.ovr}</Text>
        </View>
      )}

      {/* Buttons */}
      {fromHistory ? (
        <>
          {dbRun?.stats && (
            <Pressable style={({ pressed }) => [styles.actionBtn, { backgroundColor: WC.accent, marginBottom: spacing.md }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]} onPress={() => router.push({ pathname: '/game/stats', params: { runId: params.runId! } })}>
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
            <Pressable style={({ pressed }) => [styles.actionBtn, { backgroundColor: WC.accent, marginBottom: spacing.md }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]} onPress={() => router.push('/game/stats')}>
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

      {/* Group detail modal (shared with the live simulation) */}
      <WCGroupModal
        group={openGroup ? sortedGroups.find(g => g.id === openGroup) ?? null : null}
        matches={openGroup ? groupMatchdays.filter(m => m.groupId === openGroup) : []}
        onClose={() => setOpenGroup(null)}
        onOpenMatch={openGroupMatchDetail}
      />
      <KOMatchModal
        match={openKO} onClose={() => setOpenKO(null)}
        playerClubId={playerTeam.clubId}
        draftedPlayers={(fromHistory ? dbRun?.squad ?? [] : fullSquad) as DraftedPlayer[]}
        onStats={() => { if (openKO) openKoDetail(openKO) }}
      />
      <MatchDetailModal request={matchDetail} onClose={() => setMatchDetail(null)} accent={WC.accent} />
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

// Degraded view for older WC runs saved before the full tournament was stored.
function WCHistorySummary({ run }: { run: any }) {
  const round = String(run.tier ?? '')
  const color = ROUND_COLORS[round] ?? WC.accent
  const label = ROUND_LABELS[round] ?? round
  const games = (run.wins ?? 0) + (run.draws ?? 0) + (run.losses ?? 0)

  return (
    <ScrollView style={[styles.container, { backgroundColor: WC.bgTint }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.competitionLabel}>FIFA WORLD CUP</Text>
        <Text style={[styles.resultBanner, { color }]}>{label.toUpperCase()}</Text>
        {round === 'winner' && <Text style={styles.trophy}>🏆</Text>}
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

function BracketView({ knockoutRounds, onMatchPress }: { knockoutRounds: { round: string; matches: WCKnockoutMatch[] }[]; onMatchPress: (m: WCKnockoutMatch) => void }) {
  const maxMatches = Math.max(...knockoutRounds.map(r => r.matches.length), 1)
  const colHeight = maxMatches * ROW_H

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator style={styles.bracketScroll}>
      <View style={styles.bracketRow}>
        {knockoutRounds.map(({ round, matches }) => (
          <View key={round} style={styles.bracketCol}>
            <Text style={styles.bracketColLabel}>{KO_ROUND_NAMES[round] ?? round.toUpperCase()}</Text>
            <View style={[styles.bracketColBody, { height: colHeight }]}>
              {matches.map((m, i) => (
                <BracketMatch key={i} match={m} onPress={() => onMatchPress(m)} />
              ))}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

function BracketMatch({ match: m, onPress }: { match: WCKnockoutMatch; onPress: () => void }) {
  const isPM = m.teamA.isPlayer || m.teamB.isPlayer
  const aWon = m.winner.clubId === m.teamA.clubId
  const pens = m.result.homePens !== null ? `p${m.result.homePens}-${m.result.awayPens}` : null
  const suffix = pens ?? (m.result.extraTime ? 'AET' : null)

  return (
    <Pressable style={[styles.bracketCard, isPM && styles.bracketCardPlayer]} onPress={onPress}>
      <BracketTeam team={m.teamA} won={aWon} goals={m.result.homeGoals} />
      <View style={styles.bracketDivider}>
        {suffix && <Text style={styles.bracketSuffix}>{suffix}</Text>}
      </View>
      <BracketTeam team={m.teamB} won={!aWon} goals={m.result.awayGoals} />
    </Pressable>
  )
}

// Tap-through detail for a WC knockout tie.
function KOMatchModal({ match: m, onClose, playerClubId, draftedPlayers, onStats }: {
  match: WCKnockoutMatch | null; onClose: () => void
  playerClubId?: string; draftedPlayers?: DraftedPlayer[]
  onStats?: () => void   // opens the deep-stats match-detail modal
}) {
  const hs = summariseScorers(m?.scorers?.home)
  const as = summariseScorers(m?.scorers?.away)
  // Named penalty takers are only pre-built for the tie the reveal animated —
  // expand lazily here (same shared helper the live sim uses) so a shootout
  // reopened from history still shows its real takers. Your own nation's
  // takers come from YOUR drafted squad, not the DB's historical roster.
  const [, forceTick] = useState(0)
  useEffect(() => {
    if (!m || m.penKicksA || !m.result.homePenKicks || !m.result.awayPenKicks) return
    let active = true
    attachWCShootoutNames([m], playerClubId, draftedPlayers).then(() => { if (active) forceTick(x => x + 1) }).catch(() => { /* fall back to no list */ })
    return () => { active = false }
  }, [m])
  return (
    <AppModal visible={m !== null} onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          {m && (
            <>
              <Text style={styles.modalTitle}>{KO_ROUND_NAMES[m.round] ?? m.round.toUpperCase()}</Text>
              <View style={styles.koModalScore}>
                <TeamLabel clubId={m.teamA.clubId} name={m.teamA.clubName} size={16} containerStyle={{ flex: 1, justifyContent: 'flex-end' }} textStyle={styles.koModalTeam} />
                <Text style={styles.koModalGoals}>{m.result.homeGoals} - {m.result.awayGoals}</Text>
                <TeamLabel clubId={m.teamB.clubId} name={m.teamB.clubName} size={16} containerStyle={{ flex: 1 }} textStyle={styles.koModalTeam} />
              </View>
              {m.result.extraTime && <Text style={styles.koModalNote}>After extra time</Text>}
              {m.result.homePens !== null && <Text style={styles.koModalPens}>Penalties: {m.result.homePens} – {m.result.awayPens} · {m.winner.clubName} advance</Text>}
              {!!(hs || as) && (
                <View style={styles.koModalScorers}>
                  {hs ? <Text style={styles.koModalScorerLine}>⚽ {m.teamA.clubName}: {hs}</Text> : null}
                  {as ? <Text style={styles.koModalScorerLine}>⚽ {m.teamB.clubName}: {as}</Text> : null}
                </View>
              )}
              {m.penKicksA && m.penKicksB && <PenShootout teamA={m.teamA.clubName} teamB={m.teamB.clubName} kicksA={m.penKicksA} kicksB={m.penKicksB} />}
              {onStats && (
                <Pressable style={styles.koStatsBtn} onPress={onStats}>
                  <Text style={styles.koStatsBtnText}>📊 Full match stats & ratings ›</Text>
                </Pressable>
              )}
            </>
          )}
          <Pressable style={styles.modalClose} onPress={onClose}><Text style={styles.modalCloseText}>Close</Text></Pressable>
        </Pressable>
      </Pressable>
    </AppModal>
  )
}

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
  container: { flex: 1, backgroundColor: colors.bg },
  content:   { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  center:    { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: typography.md, color: colors.textSecondary },

  header: {
    alignItems:    'center',
    paddingTop:    56,
    paddingBottom: spacing.xl,
    gap:           spacing.sm,
  },
  competitionLabel: {
    fontSize:      typography.xs,
    fontWeight:    typography.black,
    color:         WC.accent,
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

  playerTeamName: { fontSize: typography.xl, fontWeight: typography.black, color: colors.textPrimary },
  playerTeamMeta: { fontSize: typography.sm, color: colors.textSecondary },

  statsRow: {
    flexDirection:  'row',
    gap:            spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop:     spacing.md,
  },
  statBox:   { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: typography.md, fontWeight: typography.black, color: colors.textPrimary },
  statLabel: { fontSize: typography.xs, color: colors.textMuted, textAlign: 'center' },

  sectionTitle: { fontSize: typography.md, fontWeight: typography.bold, color: colors.textPrimary },

  tableHeaderRow: {
    flexDirection:     'row',
    paddingBottom:     spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableRow: {
    flexDirection:     'row',
    paddingVertical:   spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems:        'center',
  },
  tableRowPlayer: {
    backgroundColor: WC.accent + '11',
    borderColor:     WC.accent,
    borderWidth:     1,
    borderRadius:    radius.sm,
  },
  tableRowQ: { borderLeftWidth: 3, borderLeftColor: colors.success },
  tableCol:     { fontSize: 10, fontWeight: typography.bold, color: colors.textMuted },
  tableColData: { fontSize: 11, color: colors.textSecondary },
  playerText:   { color: WC.accent, fontWeight: typography.bold },
  colPos:  { width: 24, textAlign: 'center' as any },
  colName: { flex: 1,  paddingLeft: spacing.xs },
  colStat: { width: 28, textAlign: 'center' as any },
  colPts:  { width: 32, fontWeight: typography.bold },

  phaseNote: {
    fontSize:  typography.xs,
    color:     colors.textMuted,
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
    backgroundColor: colors.bgElevated,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         spacing.sm,
    gap:             2,
  },
  groupCardPlayer: {
    borderColor: WC.accent,
  },
  groupCardTitle: {
    fontSize:      typography.xs,
    fontWeight:    typography.black,
    color:         colors.textPrimary,
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
    borderLeftColor: colors.success,
    paddingLeft:     4,
  },
  groupTeamRowSelf: {
    backgroundColor: WC.accent + '15',
    borderRadius:    radius.sm,
  },
  groupTeamRank: { fontSize: 9, color: colors.textMuted, width: 12 },
  groupTeamName: { flex: 1 },
  groupTeamNameText: { fontSize: 10, color: colors.textSecondary },
  groupTeamNameSelf: { color: WC.accent, fontWeight: typography.bold },
  groupTeamPts: { fontSize: 10, fontWeight: typography.bold, color: colors.textPrimary, width: 18, textAlign: 'right' },

  // bracket
  bracketScroll: { marginHorizontal: -spacing.xs },
  bracketRow:    { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.xs },
  bracketCol:    { width: CARD_W, gap: spacing.sm },
  bracketColLabel: {
    fontSize:      typography.xs,
    fontWeight:    typography.black,
    color:         colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign:     'center',
  },
  bracketColBody: {
    justifyContent: 'space-around',
  },
  bracketCard: {
    backgroundColor: colors.bgElevated,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  bracketCardPlayer: {
    borderColor:     WC.accent,
    backgroundColor: WC.accent + '11',
  },
  bracketTeamRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            4,
  },
  bracketTeamLabel:  { flex: 1 },
  bracketTeamName:   { fontSize: 10, color: colors.textMuted },
  bracketTeamWon:    { color: colors.textPrimary, fontWeight: typography.black },
  bracketTeamPlayer: { color: WC.accent },
  bracketTeamGoals:  { fontSize: 11, fontWeight: typography.bold, color: colors.textSecondary, width: 14, textAlign: 'right' },
  bracketDivider: {
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bracketSuffix: { fontSize: 8, color: colors.warning, fontWeight: typography.bold },

  winnerCard: {
    alignItems:      'center',
    backgroundColor: colors.tiers.perfection + '11',
    borderColor:     colors.tiers.perfection,
  },
  winnerLabel: { fontSize: typography.xs, color: colors.textMuted, fontWeight: typography.bold, textTransform: 'uppercase', letterSpacing: 1 },
  winnerName:  { fontSize: typography.xxl, fontWeight: typography.black, color: colors.tiers.perfection },
  winnerOvr:   { fontSize: typography.sm, color: colors.textSecondary },

  // matchday list
  mdSection: {
    gap:           spacing.sm,
    marginTop:     spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop:    spacing.sm,
  },
  mdBlock: { gap: 4 },
  mdLabel: {
    fontSize:      typography.xs,
    fontWeight:    typography.bold,
    color:         colors.textMuted,
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
  mdTeamText:   { fontSize: 11, color: colors.textSecondary },
  mdTeamPlayer: { color: WC.accent, fontWeight: typography.bold },
  mdScorers:    { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.xs, marginBottom: 4 },
  mdScorerHalf: { flex: 1, fontSize: 9, color: colors.textMuted },
  koModalScore: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.sm },
  koModalTeam:  { fontSize: typography.sm, color: colors.textPrimary, fontWeight: typography.bold },
  koModalGoals: { fontSize: typography.xl, fontWeight: typography.black, color: colors.textPrimary },
  koModalNote:  { fontSize: typography.xs, color: colors.warning, textAlign: 'center' },
  koModalPens:  { fontSize: typography.sm, color: WC.accent, fontWeight: typography.bold, textAlign: 'center', marginTop: 2 },
  koStatsBtn: { marginTop: spacing.sm, borderWidth: 1, borderColor: WC.accent, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center', backgroundColor: WC.accent + '15' },
  koStatsBtnText: { fontSize: typography.sm, fontWeight: typography.bold, color: WC.accent },
  koModalScorers: { marginTop: spacing.sm, gap: 4, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  koModalScorerLine: { fontSize: typography.xs, color: colors.textSecondary },
  mdScore: {
    fontSize:   12,
    fontWeight: typography.black,
    color:      colors.textPrimary,
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
    backgroundColor: colors.bgCard,
    borderRadius:    radius.lg,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         spacing.lg,
    gap:             spacing.sm,
  },
  modalTitle: {
    fontSize:     typography.lg,
    fontWeight:   typography.black,
    color:        colors.textPrimary,
    marginBottom: spacing.sm,
  },
  modalClose: {
    marginTop:       spacing.md,
    backgroundColor: colors.bgElevated,
    borderRadius:    radius.md,
    paddingVertical: spacing.md,
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     colors.border,
  },
  modalCloseText: {
    fontSize:   typography.md,
    fontWeight: typography.bold,
    color:      colors.textPrimary,
  },

  buttonRow: {
    flexDirection: 'row',
    gap:           spacing.md,
    marginTop:     spacing.md,
  },
  actionBtn: {
    flex:            1,
    backgroundColor: WC.accent,
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
