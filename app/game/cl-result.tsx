import React from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import { router } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { colors, spacing, typography, radius, shadows } from '@/theme'
import type { CLSeasonResult, CLKnockoutMatch, CLPot } from '@/engine/cl-sim'

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

const POT_COLORS: Record<number, string> = {
  1: '#F59E0B',
  2: '#A78BFA',
  3: '#34D399',
  4: '#60A5FA',
}

export default function CLResultScreen() {
  const { clResult, resetRun } = useGameStore()

  if (!clResult) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>No CL result found.</Text>
        <Pressable onPress={() => router.replace('/game/mode-select')} style={{ marginTop: spacing.lg }}>
          <Text style={{ color: colors.accent, fontWeight: '700' }}>← Back to Menu</Text>
        </Pressable>
      </View>
    )
  }

  const { leaguePhaseStandings, playoffRound, r16, qf, sf, final, winner, playerTeam, playerFinalRound, playerPot } = clResult
  const resultColor = ROUND_COLORS[playerFinalRound] ?? colors.accent
  const resultLabel = ROUND_LABELS[playerFinalRound] ?? playerFinalRound
  const isChampion  = playerFinalRound === 'winner'
  const playerPos   = leaguePhaseStandings.findIndex(t => t.isPlayer) + 1

  function handlePlayAgain() {
    resetRun()
    router.replace('/game/mode-select')
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.competitionLabel}>UEFA CHAMPIONS LEAGUE</Text>
        <Text style={[styles.resultBanner, { color: resultColor }]}>{resultLabel.toUpperCase()}</Text>
        {isChampion && <Text style={styles.trophy}>🏆</Text>}
      </View>

      {/* Player team summary */}
      <View style={[styles.card, { borderColor: resultColor }]}>
        <View style={styles.playerTeamRow}>
          <View>
            <Text style={styles.playerTeamName}>{playerTeam.clubName}</Text>
            <Text style={styles.playerTeamMeta}>OVR {playerTeam.ovr} · Pot {playerPot}</Text>
          </View>
          <View style={[styles.potPill, { backgroundColor: POT_COLORS[playerPot] + '22', borderColor: POT_COLORS[playerPot] }]}>
            <Text style={[styles.potPillText, { color: POT_COLORS[playerPot] }]}>POT {playerPot}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <StatBox label="League Pos" value={`${playerPos}${ordinal(playerPos)}`} />
          <StatBox label="Points" value={String(playerTeam.stats.points)} />
          <StatBox label="Record" value={`${playerTeam.stats.won}W ${playerTeam.stats.drawn}D ${playerTeam.stats.lost}L`} />
          <StatBox label="Goals" value={`${playerTeam.stats.goalsFor}-${playerTeam.stats.goalsAgainst}`} />
        </View>
      </View>

      {/* League phase standings (top 12 + player's position) */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>League Phase Standings</Text>
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.tableCol, styles.colPos]}>#</Text>
          <Text style={[styles.tableCol, styles.colName]}>Club</Text>
          <Text style={[styles.tableCol, styles.colStat]}>P</Text>
          <Text style={[styles.tableCol, styles.colStat]}>GD</Text>
          <Text style={[styles.tableCol, styles.colStat, styles.colPts]}>Pts</Text>
        </View>
        {leaguePhaseStandings.slice(0, 8).map((team, idx) => (
          <StandingsRow key={team.clubId} team={team} pos={idx + 1} highlight={idx < 8} />
        ))}
        {playerPos > 8 && playerPos <= 24 && (
          <>
            <Text style={styles.ellipsis}>· · ·</Text>
            <StandingsRow team={playerTeam} pos={playerPos} highlight={false} />
          </>
        )}
        {playerPos > 24 && (
          <>
            <Text style={styles.ellipsis}>· · ·</Text>
            <StandingsRow team={playerTeam} pos={playerPos} highlight={false} />
            <Text style={styles.phaseNote}>↑ Top 8 → R16 direct  ·  9-24 → Playoff  ·  25-36 eliminated</Text>
          </>
        )}
        <Text style={styles.phaseNote}>Top 8 advance directly to Round of 16 · 9-24 enter Playoff round</Text>
      </View>

      {/* Knockout bracket */}
      {(playoffRound.length > 0 || r16.length > 0) && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Knockout Rounds</Text>

          {playoffRound.length > 0 && (
            <KnockoutSection label="Playoff Round" matches={playoffRound} playerTeam={playerTeam} />
          )}
          {r16.length > 0 && (
            <KnockoutSection label="Round of 16" matches={r16} playerTeam={playerTeam} />
          )}
          {qf.length > 0 && (
            <KnockoutSection label="Quarter-Finals" matches={qf} playerTeam={playerTeam} />
          )}
          {sf.length > 0 && (
            <KnockoutSection label="Semi-Finals" matches={sf} playerTeam={playerTeam} />
          )}
          {final && (
            <KnockoutSection label="Final" matches={[final]} playerTeam={playerTeam} isFinal />
          )}
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

function StandingsRow({ team, pos, highlight }: { team: any; pos: number; highlight: boolean }) {
  const gd = team.stats.goalsFor - team.stats.goalsAgainst
  return (
    <View style={[styles.tableRow, team.isPlayer && styles.tableRowPlayer]}>
      <Text style={[styles.tableColData, styles.colPos as any, team.isPlayer && styles.playerText]}>{pos}</Text>
      <Text style={[styles.tableColData, styles.colName, team.isPlayer && styles.playerText]} numberOfLines={1}>{team.clubName}</Text>
      <Text style={[styles.tableColData, styles.colStat, team.isPlayer && styles.playerText]}>{team.stats.played}</Text>
      <Text style={[styles.tableColData, styles.colStat, team.isPlayer && styles.playerText]}>{gd > 0 ? `+${gd}` : gd}</Text>
      <Text style={[styles.tableColData, styles.colStat, styles.colPts, team.isPlayer && styles.playerText]}>{team.stats.points}</Text>
    </View>
  )
}

function KnockoutSection({
  label, matches, playerTeam, isFinal = false
}: { label: string; matches: CLKnockoutMatch[]; playerTeam: any; isFinal?: boolean }) {
  return (
    <View style={styles.knockoutSection}>
      <Text style={styles.knockoutLabel}>{label}</Text>
      {matches.map((m, i) => {
        const isPlayerMatch = m.teamA.isPlayer || m.teamB.isPlayer
        const playerWon     = m.winner.isPlayer
        const scoreA = m.extraTime ? `${m.aGoals}` : `${m.aGoals}`
        const scoreB = m.extraTime ? `${m.bGoals}` : `${m.bGoals}`
        const suffix = m.aPens !== undefined ? ` (${m.aPens}-${m.bPens} pens)` : m.extraTime ? ' (AET)' : ''

        return (
          <View key={i} style={[styles.koRow, isPlayerMatch && styles.koRowPlayer]}>
            <Text
              style={[styles.koTeam, styles.koTeamA, m.winner.clubId === m.teamA.clubId && styles.koWinner, m.teamA.isPlayer && styles.koPlayerTeam]}
              numberOfLines={1}
            >
              {m.teamA.clubName}
            </Text>
            <View style={styles.koScore}>
              <Text style={styles.koScoreText}>{scoreA} - {scoreB}</Text>
              {(m.extraTime || m.aPens !== undefined) && (
                <Text style={styles.koSuffix}>{suffix}</Text>
              )}
            </View>
            <Text
              style={[styles.koTeam, styles.koTeamB, m.winner.clubId === m.teamB.clubId && styles.koWinner, m.teamB.isPlayer && styles.koPlayerTeam]}
              numberOfLines={1}
            >
              {m.teamB.clubName}
            </Text>
          </View>
        )
      })}
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
    alignItems:   'center',
    paddingTop:   56,
    paddingBottom: spacing.xl,
    gap:          spacing.sm,
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

  playerTeamRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
  },
  playerTeamName: {
    fontSize:   typography.xl,
    fontWeight: typography.black,
    color:      colors.textPrimary,
  },
  playerTeamMeta: {
    fontSize: typography.sm,
    color:    colors.textSecondary,
    marginTop: 2,
  },
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

  sectionTitle: {
    fontSize:   typography.md,
    fontWeight: typography.bold,
    color:      colors.textPrimary,
  },

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
  ellipsis: {
    textAlign: 'center',
    color:     colors.textMuted,
    fontSize:  typography.md,
    paddingVertical: spacing.xs,
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
    flexDirection: 'row',
    alignItems:    'center',
    backgroundColor: colors.bgElevated,
    borderRadius:  radius.md,
    padding:       spacing.sm,
    gap:           spacing.sm,
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
  koScore: {
    alignItems: 'center',
    minWidth:   55,
    gap:        2,
  },
  koScoreText: {
    fontSize:   typography.sm,
    fontWeight: typography.black,
    color:      colors.textPrimary,
  },
  koSuffix: {
    fontSize: 8,
    color:    colors.textMuted,
  },

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
