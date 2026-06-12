import React, { useState } from 'react'
import {
  View, Text, StyleSheet, Pressable, ScrollView, Dimensions
} from 'react-native'
import { LineChart } from 'react-native-chart-kit'
import { router } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { useUserStore } from '@/store/userStore'
import { saveRun } from '@/db/queries/runs'
import { colors, spacing, typography, radius, shadows } from '@/theme'
import type { Tier } from '@/types/simulation'

const TIER_META: Record<Tier, { title: string; desc: string; emoji: string }> = {
  perfection: {
    title: 'ULTIMATE PERFECTION',
    desc: 'You won the league with a perfect 100% win record. A legendary achievement that will never be forgotten!',
    emoji: '👑',
  },
  almost_perfection: {
    title: 'ALMOST PERFECTION',
    desc: 'You went completely unbeaten throughout the season to lift the trophy. Simply sensational!',
    emoji: '🌟',
  },
  champions: {
    title: 'LEAGUE CHAMPIONS',
    desc: 'You won the league! Your name is etched in glory and your fans will celebrate for decades.',
    emoji: '🏆',
  },
  title_contender: {
    title: 'TITLE CONTENDERS',
    desc: 'A podium finish! You pushed the champions to the absolute limit and proved you belong at the top.',
    emoji: '🥈',
  },
  champions_league: {
    title: 'EUROPEAN ELITE',
    desc: 'Top 4 finish! You have qualified for the prestigious Champions League to face the best in Europe.',
    emoji: '🇪🇺',
  },
  europa_glory: {
    title: 'EUROPA LEAGUE GLORY',
    desc: 'You secured European football! A strong season finishing in the top 7. Continental nights await.',
    emoji: '🎫',
  },
  almost_matters: {
    title: 'MID-TABLE COMFORT',
    desc: 'A comfortable mid-table finish in the top half. Safe, respectable, but maybe a bit forgettable.',
    emoji: '📈',
  },
  respectful_mediocrity: {
    title: 'RESPECTABLY MEDIOCRE',
    desc: 'You survived relegation, but only just. A season of scraping by. You need to recruit better next time.',
    emoji: '🥱',
  },
  absolute_misery: {
    title: 'ABSOLUTE MISERY',
    desc: 'Relegation! A disastrous campaign finishing in the bottom 3. The board is furious. Total heartbreak.',
    emoji: '💀',
  },
}

export default function ResultScreen() {
  const store = useGameStore()
  const { simResult, resetRun, mode, formation, placedLeague, draftedPlayers } = store
  const { user, isGuest } = useUserStore()
  const [selectedMatchday, setSelectedMatchday] = useState<number | null>(null)

  if (!simResult) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ fontSize: 40 }}>⚠️</Text>
        <Text style={styles.loadingText}>No simulation result found.</Text>
        <Pressable onPress={() => router.replace('/game/mode-select')} style={{ marginTop: 12 }}>
          <Text style={{ color: colors.accent, fontWeight: '700' }}>← Back to Modes</Text>
        </Pressable>
      </View>
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
  } = simResult

  const meta = TIER_META[tier]
  const tierColor = (colors.tiers as any)[tier] ?? colors.accent
  const gd = goalsFor - goalsAgainst

  // Default to final matchday if not selected
  const currentMatchday = selectedMatchday ?? matchdayHistory.length
  const currentSnapshot = matchdayHistory[currentMatchday - 1]

  // Prepare graph data
  const graphData = {
    labels: matchdayHistory.slice(0, currentMatchday).map((_, idx) => `MD${idx + 1}`),
    datasets: matchdayHistory[0]?.standings.map(team => {
      const positions = matchdayHistory.slice(0, currentMatchday).map(snapshot => {
        const position = snapshot.standings.findIndex(s => s.clubId === team.clubId) + 1
        return position
      })
      return {
        data: positions,
        color: (opacity = 1) => team.isPlayer ? colors.accent : colors.textMuted,
        strokeWidth: team.isPlayer ? 3 : 1,
      }
    }) || [],
  }

  async function handlePlayAgain() {
    if (user && !isGuest && mode && formation && placedLeague && simResult) {
      try {
        await saveRun({
          userId: user.id,
          mode,
          formation,
          teamOvr: playerTeam.ovr,
          leagueId: placedLeague.leagueId,
          leagueName: placedLeague.leagueName,
          yearStart: placedLeague.yearStart,
          seasonResult: simResult,
          squad: draftedPlayers,
        })
      } catch (error) {
        console.error('Failed to save run:', error)
      }
    }
    resetRun()
    router.replace('/game/mode-select')
  }

  async function handleReturnToHome() {
    if (user && !isGuest && mode && formation && placedLeague && simResult) {
      try {
        await saveRun({
          userId: user.id,
          mode,
          formation,
          teamOvr: playerTeam.ovr,
          leagueId: placedLeague.leagueId,
          leagueName: placedLeague.leagueName,
          yearStart: placedLeague.yearStart,
          seasonResult: simResult,
          squad: draftedPlayers,
        })
      } catch (error) {
        console.error('Failed to save run:', error)
      }
    }
    resetRun()
    router.replace('/(tabs)')
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Season Summary</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Tier Card */}
        <View style={[styles.tierCard, { borderColor: tierColor }]}>
          <Text style={styles.tierEmoji}>{meta.emoji}</Text>
          <Text style={[styles.tierTitle, { color: tierColor }]}>{meta.title}</Text>
          <Text style={styles.positionText}>Finished #{finalPosition} out of {teamsInLeague} teams</Text>
          <Text style={styles.tierDesc}>{meta.desc}</Text>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsCard}>
          <Text style={styles.sectionTitle}>Campaign Stats</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statVal}>{playerTeam.stats.points}</Text>
              <Text style={styles.statLbl}>Points</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statVal}>{wins}</Text>
              <Text style={styles.statLbl}>Wins</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statVal}>{draws}</Text>
              <Text style={styles.statLbl}>Draws</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statVal}>{losses}</Text>
              <Text style={styles.statLbl}>Losses</Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <Text style={styles.rowStatText}>Goal Diff: <Text style={{ color: gd >= 0 ? colors.success : colors.danger }}>{gd > 0 ? `+${gd}` : gd}</Text></Text>
            <Text style={styles.rowStatText}>Goals Scored: <Text style={{ color: colors.textPrimary }}>{goalsFor}</Text></Text>
            <Text style={styles.rowStatText}>Goals Conceded: <Text style={{ color: colors.textPrimary }}>{goalsAgainst}</Text></Text>
          </View>
        </View>

        {/* Highlights */}
        <View style={styles.highlightsCard}>
          <Text style={styles.sectionTitle}>Season Highlights</Text>
          <View style={styles.highlightsList}>
            {biggestWin && (
              <View style={styles.highlightItem}>
                <Text style={styles.highlightLabel}>🏆 Biggest Win</Text>
                <Text style={styles.highlightValue}>{biggestWin.score} vs {biggestWin.opponent}</Text>
              </View>
            )}
            {worstLoss && (
              <View style={styles.highlightItem}>
                <Text style={styles.highlightLabel}>💔 Worst Loss</Text>
                <Text style={styles.highlightValue}>{worstLoss.score} vs {worstLoss.opponent}</Text>
              </View>
            )}
            {upsets.length > 0 && (
              <View style={styles.highlightItem}>
                <Text style={styles.highlightLabel}>⚠️ Shock Defeats</Text>
                <Text style={styles.highlightValue}>
                  {upsets.length} upset{upsets.length > 1 ? 's' : ''} (e.g. {upsets[0].score} vs {upsets[0].opponent})
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Matchday History */}
        <View style={styles.matchdayCard}>
          <Text style={styles.sectionTitle}>Matchday History</Text>

          {/* Matchday Selector */}
          <View style={styles.matchdaySelector}>
            <Text style={styles.matchdaySelectorLabel}>Matchday {currentMatchday}/{matchdayHistory.length}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.matchdayScroll}>
              {matchdayHistory.map((_, idx) => (
                <Pressable
                  key={idx}
                  style={[
                    styles.matchdayChip,
                    currentMatchday === idx + 1 && styles.matchdayChipActive,
                  ]}
                  onPress={() => setSelectedMatchday(idx + 1)}
                >
                  <Text style={[
                    styles.matchdayChipText,
                    currentMatchday === idx + 1 && styles.matchdayChipTextActive,
                  ]}>
                    {idx + 1}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Matchday Fixtures */}
          {currentSnapshot && (
            <View style={styles.matchdayFixtures}>
              <Text style={styles.matchdaySectionTitle}>Matchday {currentMatchday} Results</Text>
              {currentSnapshot.fixtures.map((fixture, idx) => {
                const result = fixture.result
                if (!result) return null

                const isPlayerHome = fixture.home.isPlayer
                const isPlayerAway = fixture.away.isPlayer

                return (
                  <View
                    key={idx}
                    style={[
                      styles.fixtureRow,
                      (isPlayerHome || isPlayerAway) && styles.fixtureRowPlayer,
                    ]}
                  >
                    <Text
                      style={[
                        styles.fixtureTeam,
                        styles.fixtureTeamHome,
                        isPlayerHome && styles.fixtureTeamPlayer,
                      ]}
                      numberOfLines={1}
                    >
                      {fixture.home.clubName}
                    </Text>
                    <View style={styles.fixtureScore}>
                      <Text style={[
                        styles.fixtureScoreText,
                        result.outcome === 'home' && styles.fixtureScoreWinner,
                        isPlayerHome && styles.fixtureScorePlayer,
                      ]}>
                        {result.homeGoals}
                      </Text>
                      <Text style={styles.fixtureScoreDivider}>-</Text>
                      <Text style={[
                        styles.fixtureScoreText,
                        result.outcome === 'away' && styles.fixtureScoreWinner,
                        isPlayerAway && styles.fixtureScorePlayer,
                      ]}>
                        {result.awayGoals}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.fixtureTeam,
                        styles.fixtureTeamAway,
                        isPlayerAway && styles.fixtureTeamPlayer,
                      ]}
                      numberOfLines={1}
                    >
                      {fixture.away.clubName}
                    </Text>
                  </View>
                )
              })}
            </View>
          )}

          {/* Matchday Standings */}
          {currentSnapshot && (
            <View style={styles.matchdayStandings}>
              <Text style={styles.matchdaySectionTitle}>Standings after Matchday {currentMatchday}</Text>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableCol, styles.colPos]}>#</Text>
                <Text style={[styles.tableCol, styles.colName]}>Club</Text>
                <Text style={[styles.tableCol, styles.colStat]}>P</Text>
                <Text style={[styles.tableCol, styles.colStat]}>GD</Text>
                <Text style={[styles.tableCol, styles.colStat, styles.colPts]}>PTS</Text>
              </View>
              {currentSnapshot.standings.map((team, idx) => {
                const teamGd = team.stats.goalsFor - team.stats.goalsAgainst
                return (
                  <View
                    key={team.clubId}
                    style={[
                      styles.tableRow,
                      team.isPlayer && styles.tableRowPlayer,
                    ]}
                  >
                    <Text style={[styles.tableColData, styles.colPos, team.isPlayer && styles.playerRowText]}>
                      {idx + 1}
                    </Text>
                    <Text
                      style={[styles.tableColData, styles.colName, team.isPlayer && styles.playerRowText]}
                      numberOfLines={1}
                    >
                      {team.clubName}
                    </Text>
                    <Text style={[styles.tableColData, styles.colStat, team.isPlayer && styles.playerRowText]}>
                      {team.stats.played}
                    </Text>
                    <Text style={[styles.tableColData, styles.colStat, team.isPlayer && styles.playerRowText]}>
                      {teamGd > 0 ? `+${teamGd}` : teamGd}
                    </Text>
                    <Text style={[styles.tableColData, styles.colStat, styles.colPts, team.isPlayer && styles.playerRowText]}>
                      {team.stats.points}
                    </Text>
                  </View>
                )
              })}
            </View>
          )}
        </View>

        {/* Position Tracking Graph */}
        <View style={styles.graphCard}>
          <Text style={styles.sectionTitle}>Position Tracking</Text>
          <Text style={styles.graphSubtitle}>League position throughout the season (up to Matchday {currentMatchday})</Text>
          <View style={styles.graphContainer}>
            <LineChart
              data={{
                labels: graphData.labels,
                datasets: graphData.datasets,
              }}
              width={Dimensions.get('window').width - spacing.lg * 2}
              height={220}
              chartConfig={{
                backgroundColor: colors.bgCard,
                backgroundGradientFrom: colors.bgCard,
                backgroundGradientTo: colors.bgCard,
                decimalPlaces: 0,
                color: (opacity = 1) => colors.textSecondary,
                labelColor: (opacity = 1) => colors.textMuted,
                style: {
                  borderRadius: radius.md,
                },
                propsForDots: {
                  r: '0',
                },
                propsForLabels: {
                  fontSize: 8,
                },
              }}
              bezier
              style={styles.graph}
              withDots={false}
              withInnerLines={false}
              withOuterLines={false}
              withVerticalLines={false}
              withHorizontalLines={true}
              yAxisLabel=""
              yAxisSuffix=""
            />
          </View>
          <View style={styles.graphLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
              <Text style={styles.legendText}>Your Team</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.textMuted }]} />
              <Text style={styles.legendText}>Other Teams</Text>
            </View>
          </View>
        </View>

        {/* Final Standings Table */}
        <View style={styles.tableCard}>
          <Text style={styles.sectionTitle}>Final Standings</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableCol, styles.colPos]}>#</Text>
            <Text style={[styles.tableCol, styles.colName]}>Club</Text>
            <Text style={[styles.tableCol, styles.colStat]}>P</Text>
            <Text style={[styles.tableCol, styles.colStat]}>GD</Text>
            <Text style={[styles.tableCol, styles.colStat, styles.colPts]}>PTS</Text>
          </View>
          {table.map((team, idx) => {
            const teamGd = team.stats.goalsFor - team.stats.goalsAgainst
            return (
              <View
                key={team.clubId}
                style={[
                  styles.tableRow,
                  team.isPlayer && styles.tableRowPlayer
                ]}
              >
                <Text style={[styles.tableColData, styles.colPos, team.isPlayer && styles.playerRowText]}>
                  {idx + 1}
                </Text>
                <Text
                  style={[styles.tableColData, styles.colName, team.isPlayer && styles.playerRowText]}
                  numberOfLines={1}
                >
                  {team.clubName}
                </Text>
                <Text style={[styles.tableColData, styles.colStat, team.isPlayer && styles.playerRowText]}>
                  {team.stats.played}
                </Text>
                <Text style={[styles.tableColData, styles.colStat, team.isPlayer && styles.playerRowText]}>
                  {teamGd > 0 ? `+${teamGd}` : teamGd}
                </Text>
                <Text style={[styles.tableColData, styles.colStat, styles.colPts, team.isPlayer && styles.playerRowText]}>
                  {team.stats.points}
                </Text>
              </View>
            )
          })}
        </View>

        {/* Play Again Button */}
        <View style={styles.buttonRow}>
          <Pressable style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={handleReturnToHome}>
            <Text style={styles.actionBtnText}>Return to Home</Text>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={handlePlayAgain}>
            <Text style={styles.actionBtnText}>Play Again</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.textSecondary,
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
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: typography.lg,
    fontWeight: typography.black,
    color: colors.textPrimary,
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
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
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
    fontWeight: typography.black,
    textAlign: 'center',
    letterSpacing: 1,
  },
  positionText: {
    fontSize: typography.md,
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  tierDesc: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    fontSize: typography.md,
    fontWeight: typography.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  statsCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statVal: {
    fontSize: typography.lg,
    fontWeight: typography.black,
    color: colors.textPrimary,
  },
  statLbl: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  rowStatText: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: typography.medium,
  },
  highlightsCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  highlightsList: {
    gap: spacing.sm,
  },
  highlightItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  highlightLabel: {
    fontSize: typography.sm,
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  highlightValue: {
    fontSize: typography.sm,
    color: colors.textSecondary,
  },
  tableCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.xs,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
  },
  tableRowPlayer: {
    backgroundColor: colors.accent + '11',
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  playerRowText: {
    color: colors.accent,
    fontWeight: typography.bold,
  },
  tableCol: {
    fontSize: 10,
    fontWeight: typography.bold,
    color: colors.textMuted,
  },
  tableColData: {
    fontSize: 11,
    color: colors.textSecondary,
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
    fontWeight: typography.bold,
  },
  actionBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
    ...shadows.md,
    flex: 1,
  },
  actionBtnSecondary: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionBtnText: {
    fontSize: typography.md,
    fontWeight: typography.black,
    color: colors.textPrimary,
    letterSpacing: 1.5,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  matchdayCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  matchdaySelector: {
    gap: spacing.sm,
  },
  matchdaySelectorLabel: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: typography.medium,
  },
  matchdayScroll: {
    flexDirection: 'row',
  },
  matchdayChip: {
    backgroundColor: colors.bgElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  matchdayChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  matchdayChipText: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: typography.bold,
  },
  matchdayChipTextActive: {
    color: colors.textPrimary,
  },
  matchdayFixtures: {
    gap: spacing.sm,
  },
  matchdaySectionTitle: {
    fontSize: typography.sm,
    fontWeight: typography.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  fixtureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fixtureRowPlayer: {
    backgroundColor: colors.accent + '11',
    borderColor: colors.accent,
  },
  fixtureTeam: {
    flex: 1,
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: typography.medium,
  },
  fixtureTeamHome: {
    textAlign: 'right',
  },
  fixtureTeamAway: {
    textAlign: 'left',
  },
  fixtureTeamPlayer: {
    color: colors.accent,
    fontWeight: typography.bold,
  },
  fixtureScore: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  fixtureScoreText: {
    fontSize: typography.md,
    fontWeight: typography.black,
    color: colors.textPrimary,
  },
  fixtureScoreWinner: {
    color: colors.success,
  },
  fixtureScorePlayer: {
    color: colors.accent,
  },
  fixtureScoreDivider: {
    fontSize: typography.md,
    color: colors.textMuted,
    marginHorizontal: spacing.xs,
  },
  matchdayStandings: {
    gap: spacing.sm,
  },
  graphCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  graphSubtitle: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  graphContainer: {
    alignItems: 'center',
  },
  graph: {
    borderRadius: radius.md,
  },
  graphLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: typography.xs,
    color: colors.textSecondary,
  },
})
