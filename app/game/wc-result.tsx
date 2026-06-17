import React from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import { router } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { colors, spacing, typography, radius, shadows } from '@/theme'
import type { WCSeasonResult, WCKnockoutMatch, WCTeam } from '@/engine/world-cup-sim'

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

export default function WCResultScreen() {
  const { wcResult, resetRun } = useGameStore()

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

  // Player's group
  const myGroup = groups.find(g => g.id === playerGroup)
  const myGroupSorted = myGroup
    ? [...myGroup.teams].sort((a, b) => {
        if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points
        const gd = (b.stats.goalsFor - b.stats.goalsAgainst) - (a.stats.goalsFor - a.stats.goalsAgainst)
        return gd !== 0 ? gd : b.stats.goalsFor - a.stats.goalsFor
      })
    : []

  function handlePlayAgain() {
    resetRun()
    router.replace('/game/mode-select')
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
        <Text style={styles.playerTeamName}>{playerTeam.clubName}</Text>
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

      {/* Group standings */}
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
                <Text style={[styles.tableColData, styles.colName, team.isPlayer && styles.playerText]} numberOfLines={1}>{team.clubName}</Text>
                <Text style={[styles.tableColData, styles.colStat, team.isPlayer && styles.playerText]}>{team.stats.played}</Text>
                <Text style={[styles.tableColData, styles.colStat, team.isPlayer && styles.playerText]}>{gd > 0 ? `+${gd}` : gd}</Text>
                <Text style={[styles.tableColData, styles.colStat, styles.colPts, team.isPlayer && styles.playerText]}>{team.stats.points}</Text>
              </View>
            )
          })}
          <Text style={styles.phaseNote}>Top 2 qualify · Best 8 third-place teams also qualify</Text>
        </View>
      )}

      {/* Knockout rounds */}
      {knockoutRounds.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Knockout Rounds</Text>
          {knockoutRounds.map(({ round, matches }) => (
            <KnockoutSection
              key={round}
              label={KO_ROUND_NAMES[round] ?? round.toUpperCase()}
              matches={matches}
              playerTeam={playerTeam}
              isFinal={round === 'final'}
            />
          ))}
        </View>
      )}

      {/* Winner */}
      {winner && (
        <View style={[styles.card, styles.winnerCard]}>
          <Text style={styles.winnerLabel}>World Cup Champion</Text>
          <Text style={styles.winnerName}>{winner.clubName}</Text>
          <Text style={styles.winnerOvr}>OVR {winner.ovr}</Text>
        </View>
      )}

      <Pressable style={styles.playAgainBtn} onPress={handlePlayAgain}>
        <Text style={styles.playAgainText}>PLAY AGAIN</Text>
      </Pressable>
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

function KnockoutSection({
  label, matches, playerTeam, isFinal = false,
}: { label: string; matches: WCKnockoutMatch[]; playerTeam: WCTeam; isFinal?: boolean }) {
  // Only show player's match + final in full; collapse others
  const playerMatch = matches.find(m => m.teamA.isPlayer || m.teamB.isPlayer)
  const displayMatches = playerMatch
    ? isFinal ? matches : [playerMatch]
    : isFinal ? matches : matches.slice(0, 2)

  return (
    <View style={styles.knockoutSection}>
      <Text style={styles.knockoutLabel}>{label}</Text>
      {displayMatches.map((m, i) => {
        const isPM = m.teamA.isPlayer || m.teamB.isPlayer
        const extraTime = m.result.extraTime
        const pens = m.result.homePens !== null ? `(${m.result.homePens}-${m.result.awayPens} pens)` : null
        const suffix = pens ?? (extraTime ? '(AET)' : null)

        return (
          <View key={i} style={[styles.koRow, isPM && styles.koRowPlayer]}>
            <Text
              style={[styles.koTeam, styles.koTeamA,
                m.winner.clubId === m.teamA.clubId && styles.koWinner,
                m.teamA.isPlayer && styles.koPlayerTeam]}
              numberOfLines={1}
            >
              {m.teamA.clubName}
            </Text>
            <View style={styles.koScore}>
              <Text style={styles.koScoreText}>{m.result.homeGoals} - {m.result.awayGoals}</Text>
              {suffix && <Text style={styles.koSuffix}>{suffix}</Text>}
            </View>
            <Text
              style={[styles.koTeam, styles.koTeamB,
                m.winner.clubId === m.teamB.clubId && styles.koWinner,
                m.teamB.isPlayer && styles.koPlayerTeam]}
              numberOfLines={1}
            >
              {m.teamB.clubName}
            </Text>
          </View>
        )
      })}
      {!playerMatch && !isFinal && matches.length > 2 && (
        <Text style={styles.phaseNote}>+{matches.length - 2} more matches</Text>
      )}
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

  knockoutSection: { gap: spacing.sm },
  knockoutLabel: {
    fontSize:      typography.xs,
    fontWeight:    typography.bold,
    color:         colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  koRow: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: colors.bgElevated,
    borderRadius:    radius.md,
    padding:         spacing.sm,
    gap:             spacing.sm,
  },
  koRowPlayer: {
    backgroundColor: colors.accent + '15',
    borderWidth:     1,
    borderColor:     colors.accent + '44',
  },
  koTeam:       { flex: 1, fontSize: typography.xs, color: colors.textSecondary },
  koTeamA:      { textAlign: 'right' as any },
  koTeamB:      { textAlign: 'left' as any },
  koWinner:     { color: colors.textPrimary, fontWeight: typography.bold },
  koPlayerTeam: { color: colors.accent },
  koScore: { alignItems: 'center', minWidth: 55, gap: 2 },
  koScoreText: { fontSize: typography.sm, fontWeight: typography.black, color: colors.textPrimary },
  koSuffix:    { fontSize: 8, color: colors.textMuted },

  winnerCard: {
    alignItems:      'center',
    backgroundColor: colors.tiers.perfection + '11',
    borderColor:     colors.tiers.perfection,
  },
  winnerLabel: { fontSize: typography.xs, color: colors.textMuted, fontWeight: typography.bold, textTransform: 'uppercase', letterSpacing: 1 },
  winnerName:  { fontSize: typography.xxl, fontWeight: typography.black, color: colors.tiers.perfection },
  winnerOvr:   { fontSize: typography.sm, color: colors.textSecondary },

  playAgainBtn: {
    backgroundColor: colors.accent,
    borderRadius:    radius.md,
    paddingVertical: spacing.lg,
    alignItems:      'center',
    marginTop:       spacing.md,
    ...shadows.md,
  },
  playAgainText: {
    fontSize:      typography.lg,
    fontWeight:    typography.black,
    color:         colors.textPrimary,
    letterSpacing: 3,
  },
})
