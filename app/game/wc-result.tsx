import React from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import { router } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { useUserStore } from '@/store/userStore'
import { saveWCRun } from '@/db/queries/runs'
import { getFlag } from '@/lib/flagMap'
import { colors, spacing, typography, radius, shadows } from '@/theme'
import type { WCKnockoutMatch, WCTeam, WCGroup } from '@/engine/world-cup-sim'

const ROUND_LABELS: Record<string, string> = {
  groups:  'Eliminated in Group Stage',
  r32:     'Round of 32 Exit',
  r16:     'Round of 16 Exit',
  qf:      'Quarter-Final Exit',
  sf:      'Semi-Final Exit',
  final:   'Finalist',
  winner:  'WORLD CUP CHAMPION',
}

const ROUND_COLORS: Record<string, string> = {
  groups:  '#DC2626',
  r32:     '#EA580C',
  r16:     '#F59E0B',
  qf:      '#F59E0B',
  sf:      '#A78BFA',
  final:   '#34D399',
  winner:  '#F59E0B',
}

const KO_ROUND_NAMES: Record<string, string> = {
  r32:   'Round of 32',
  r16:   'Round of 16',
  qf:    'Quarter-Finals',
  sf:    'Semi-Finals',
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
  const { wcResult, resetRun, formation, draftedPlayers } = useGameStore()
  const { user, isGuest } = useUserStore()

  if (!wcResult) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>No World Cup result found.</Text>
        <Pressable onPress={() => router.replace('/game/mode-select')} style={{ marginTop: spacing.lg }}>
          <Text style={{ color: colors.accent, fontWeight: '700' }}>← Back to Menu</Text>
        </Pressable>
      </View>
    )
  }

  const {
    groups, knockoutRounds, winner,
    playerTeam, playerFinalRound, playerGroup, playerGroupPos,
  } = wcResult

  const resultColor = ROUND_COLORS[playerFinalRound] ?? colors.accent
  const resultLabel = ROUND_LABELS[playerFinalRound] ?? playerFinalRound
  const isChampion  = playerFinalRound === 'winner'

  // Pre-sort every group once
  const sortedGroups: WCGroup[] = groups.map(g => ({ id: g.id, teams: [...g.teams].sort(sortGroupTeams) }))
  const myGroup = sortedGroups.find(g => g.id === playerGroup)
  const myGroupSorted = myGroup ? myGroup.teams : []

  // Best third-place ranking across all groups
  const thirdPlaceTeams = sortedGroups.map(g => g.teams[2]).filter(Boolean).sort(sortGroupTeams)
  const q3Count = Math.min(8, thirdPlaceTeams.length)

  async function persistRun() {
    if (user && !isGuest && formation) {
      try {
        await saveWCRun({
          userId: user.id,
          formation,
          teamOvr: playerTeam.ovr,
          result: wcResult!,
          squad: draftedPlayers,
        })
      } catch (error) {
        console.error('Failed to save WC run:', error)
      }
    }
  }

  async function handlePlayAgain() {
    await persistRun()
    resetRun()
    router.replace('/game/mode-select')
  }

  async function handleReturnToHome() {
    await persistRun()
    resetRun()
    router.replace('/(tabs)')
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.competitionLabel}>FIFA WORLD CUP</Text>
        <Text style={[styles.resultBanner, { color: resultColor }]}>{resultLabel.toUpperCase()}</Text>
        {isChampion && <Text style={styles.trophy}>🏆</Text>}
      </View>

      {/* Player team summary */}
      <View style={[styles.card, { borderColor: resultColor }]}>
        <Text style={styles.playerTeamName}>{getFlag(playerTeam.clubId)} {playerTeam.clubName}</Text>
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
                <Text style={[styles.tableColData, styles.colName, team.isPlayer && styles.playerText]} numberOfLines={1}>
                  {getFlag(team.clubId)} {team.clubName}
                </Text>
                <Text style={[styles.tableColData, styles.colStat, team.isPlayer && styles.playerText]}>{team.stats.played}</Text>
                <Text style={[styles.tableColData, styles.colStat, team.isPlayer && styles.playerText]}>{gd > 0 ? `+${gd}` : gd}</Text>
                <Text style={[styles.tableColData, styles.colStat, styles.colPts, team.isPlayer && styles.playerText]}>{team.stats.points}</Text>
              </View>
            )
          })}
          <Text style={styles.phaseNote}>Top 2 qualify · Best 8 third-place teams also qualify</Text>
        </View>
      )}

      {/* All groups */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>All Groups</Text>
        <View style={styles.groupsGrid}>
          {sortedGroups.map(group => {
            const playerInGroup = group.teams.some(t => t.isPlayer)
            return (
              <View key={group.id} style={[styles.groupCard, playerInGroup && styles.groupCardPlayer]}>
                <Text style={styles.groupCardTitle}>Group {group.id}</Text>
                {group.teams.map((team, idx) => {
                  const qualified = idx < 2
                  return (
                    <View key={team.clubId} style={[styles.groupTeamRow, qualified && styles.groupTeamRowQ, team.isPlayer && styles.groupTeamRowSelf]}>
                      <Text style={styles.groupTeamRank}>{idx + 1}</Text>
                      <Text style={[styles.groupTeamName, team.isPlayer && styles.groupTeamNameSelf]} numberOfLines={1}>
                        {getFlag(team.clubId)} {team.clubName}
                      </Text>
                      <Text style={styles.groupTeamPts}>{team.stats.points}</Text>
                    </View>
                  )
                })}
              </View>
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
                <Text style={[styles.tableColData, styles.colName, team.isPlayer && styles.playerText]} numberOfLines={1}>
                  {getFlag(team.clubId)} {team.clubName}
                </Text>
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
          <Text style={styles.phaseNote}>Scroll sideways · your matches are highlighted</Text>
          <BracketView knockoutRounds={knockoutRounds} />
        </View>
      )}

      {/* Winner */}
      {winner && (
        <View style={[styles.card, styles.winnerCard]}>
          <Text style={styles.winnerLabel}>World Cup Champion</Text>
          <Text style={styles.winnerName}>{getFlag(winner.clubId)} {winner.clubName}</Text>
          <Text style={styles.winnerOvr}>OVR {winner.ovr}</Text>
        </View>
      )}

      {/* Buttons */}
      <View style={styles.buttonRow}>
        <Pressable style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={handleReturnToHome}>
          <Text style={styles.actionBtnText}>Return to Home</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={handlePlayAgain}>
          <Text style={styles.actionBtnText}>Play Again</Text>
        </Pressable>
      </View>
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

function BracketView({ knockoutRounds }: { knockoutRounds: { round: string; matches: WCKnockoutMatch[] }[] }) {
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
                <BracketMatch key={i} match={m} />
              ))}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

function BracketMatch({ match: m }: { match: WCKnockoutMatch }) {
  const isPM = m.teamA.isPlayer || m.teamB.isPlayer
  const aWon = m.winner.clubId === m.teamA.clubId
  const pens = m.result.homePens !== null ? `p${m.result.homePens}-${m.result.awayPens}` : null
  const suffix = pens ?? (m.result.extraTime ? 'AET' : null)

  return (
    <View style={[styles.bracketCard, isPM && styles.bracketCardPlayer]}>
      <BracketTeam team={m.teamA} won={aWon} goals={m.result.homeGoals} />
      <View style={styles.bracketDivider}>
        {suffix && <Text style={styles.bracketSuffix}>{suffix}</Text>}
      </View>
      <BracketTeam team={m.teamB} won={!aWon} goals={m.result.awayGoals} />
    </View>
  )
}

function BracketTeam({ team, won, goals }: { team: WCTeam; won: boolean; goals: number }) {
  return (
    <View style={styles.bracketTeamRow}>
      <Text
        style={[styles.bracketTeamName, won && styles.bracketTeamWon, team.isPlayer && styles.bracketTeamPlayer]}
        numberOfLines={1}
      >
        {getFlag(team.clubId)} {team.clubName}
      </Text>
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
    color:         colors.accent,
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
    backgroundColor: colors.accent + '11',
    borderColor:     colors.accent,
    borderWidth:     1,
    borderRadius:    radius.sm,
  },
  tableRowQ: { borderLeftWidth: 3, borderLeftColor: colors.success },
  tableCol:     { fontSize: 10, fontWeight: typography.bold, color: colors.textMuted },
  tableColData: { fontSize: 11, color: colors.textSecondary },
  playerText:   { color: colors.accent, fontWeight: typography.bold },
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
    borderColor: colors.accent,
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
    backgroundColor: colors.accent + '15',
    borderRadius:    radius.sm,
  },
  groupTeamRank: { fontSize: 9, color: colors.textMuted, width: 12 },
  groupTeamName: { flex: 1, fontSize: 10, color: colors.textSecondary },
  groupTeamNameSelf: { color: colors.accent, fontWeight: typography.bold },
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
    borderColor:     colors.accent,
    backgroundColor: colors.accent + '11',
  },
  bracketTeamRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            4,
  },
  bracketTeamName:   { flex: 1, fontSize: 10, color: colors.textMuted },
  bracketTeamWon:    { color: colors.textPrimary, fontWeight: typography.black },
  bracketTeamPlayer: { color: colors.accent },
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

  buttonRow: {
    flexDirection: 'row',
    gap:           spacing.md,
    marginTop:     spacing.md,
  },
  actionBtn: {
    flex:            1,
    backgroundColor: colors.accent,
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
