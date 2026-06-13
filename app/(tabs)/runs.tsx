import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import { useUserStore } from '@/store/userStore'
import { fetchRunHistory } from '@/db/queries/leaderboard'
import { colors, spacing, typography, radius, shadows } from '@/theme'

type SortOption = 'date' | 'score' | 'wins' | 'draws' | 'losses' | 'tier'

export default function RunsScreen() {
  const { user, isGuest } = useUserStore()
  const [runs, setRuns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortOption>('date')

  useEffect(() => {
    async function loadRuns() {
      if (!user || isGuest) {
        setLoading(false)
        return
      }

      try {
        const data = await fetchRunHistory(user.id, 100)
        setRuns(data)
      } catch (error) {
        console.error('Failed to load runs:', error)
      } finally {
        setLoading(false)
      }
    }

    loadRuns()
  }, [user, isGuest])

  function formatTier(tier: string): string {
    return tier
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function getSortedRuns() {
    const sorted = [...runs]
    switch (sortBy) {
      case 'date':
        return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      case 'score':
        return sorted.sort((a, b) => b.score - a.score)
      case 'wins':
        return sorted.sort((a, b) => b.wins - a.wins)
      case 'draws':
        return sorted.sort((a, b) => b.draws - a.draws)
      case 'losses':
        return sorted.sort((a, b) => a.losses - b.losses)
      case 'tier':
        const tierOrder = ['perfection', 'almost_perfection', 'champions', 'title_contender', 'champions_league', 'europa_glory', 'almost_matters', 'respectful_mediocrity', 'absolute_misery']
        return sorted.sort((a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier))
      default:
        return sorted
    }
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>←</Text>
          </Pressable>
          <Text style={styles.title}>My Runs</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </View>
    )
  }

  if (isGuest) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>←</Text>
          </Pressable>
          <Text style={styles.title}>My Runs</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🔒</Text>
          <Text style={styles.emptyText}>Sign in to view your run history</Text>
        </View>
      </View>
    )
  }

  const sortedRuns = getSortedRuns()

  return (
    <View style={styles.container}>
      {/* header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>My Runs</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* sort options */}
      <ScrollView horizontal style={styles.sortScroll} showsHorizontalScrollIndicator={false}>
        {(['date', 'score', 'wins', 'draws', 'losses', 'tier'] as SortOption[]).map((option) => (
          <Pressable
            key={option}
            style={[styles.sortChip, sortBy === option && styles.sortChipActive]}
            onPress={() => setSortBy(option)}
          >
            <Text style={[styles.sortChipText, sortBy === option && styles.sortChipTextActive]}>
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* runs list */}
      {sortedRuns.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>😬</Text>
          <Text style={styles.emptyText}>No runs yet. Start suffering.</Text>
        </View>
      ) : (
        <ScrollView style={styles.runsScroll} showsVerticalScrollIndicator={false}>
          {sortedRuns.map((run) => (
            <Pressable
              key={run.id}
              style={styles.runCard}
              onPress={() => router.push({ pathname: '/game/result', params: { runId: run.id } })}
            >
              <View style={styles.runCardHeader}>
                <Text style={styles.runTier}>{formatTier(run.tier)}</Text>
                <Text style={styles.runDate}>{formatDate(run.created_at)}</Text>
              </View>
              <Text style={styles.runLeague}>{run.league_name}</Text>
              <View style={styles.runStats}>
                <Text style={styles.runStat}>Score: {run.score}</Text>
                <Text style={styles.runStat}>#{run.final_position}</Text>
              </View>
              <View style={styles.runStats}>
                <Text style={styles.runStat}>W: {run.wins}</Text>
                <Text style={styles.runStat}>D: {run.draws}</Text>
                <Text style={styles.runStat}>L: {run.losses}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: 56,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    color: colors.textPrimary,
    fontSize: typography.xl,
  },
  title: {
    fontSize: typography.xl,
    fontWeight: typography.black,
    color: colors.textPrimary,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortScroll: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sortChip: {
    backgroundColor: colors.bgElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  sortChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  sortChipText: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: typography.bold,
  },
  sortChipTextActive: {
    color: colors.textPrimary,
  },
  runsScroll: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  runCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  runCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  runTier: {
    fontSize: typography.sm,
    fontWeight: typography.bold,
    color: colors.accent,
  },
  runDate: {
    fontSize: typography.xs,
    color: colors.textMuted,
  },
  runLeague: {
    fontSize: typography.md,
    fontWeight: typography.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  runStats: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  runStat: {
    fontSize: typography.sm,
    color: colors.textSecondary,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xxl,
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: typography.sm,
    color: colors.textMuted,
  },
})
