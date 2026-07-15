import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native'
import { router } from 'expo-router'
import { fetchLeaderboard, type LeaderboardEntry } from '@/db/queries/leaderboard'
import { PressCard } from '@/components/ui'
import { colors, spacing, typography, radius, shadows } from '@/theme'

// Gold / silver / bronze for the podium ranks.
const MEDALS = ['#FFD700', '#C0C0C0', '#CD7F32']

export default function LeaderboardScreen() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadLeaderboard() {
      try {
        const data = await fetchLeaderboard({ limit: 50 })
        setLeaderboard(data)
      } catch (error) {
        console.error('Failed to load leaderboard:', error)
      } finally {
        setLoading(false)
      }
    }

    loadLeaderboard()
  }, [])

  function formatTier(tier: string): string {
    return tier
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Leaderboard</Text>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Leaderboard</Text>

      {leaderboard.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>😬</Text>
          <Text style={styles.emptyText}>No runs yet. Be the first!</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {leaderboard.map((entry, index) => (
            <PressCard
              key={entry.id}
              style={[styles.entryCard, index < 3 && { borderColor: MEDALS[index] }]}
              onPress={() => router.push({
                pathname: entry.mode === 'world_cup' ? '/game/wc-result'
                        : entry.mode === 'champions_league_custom' ? '/game/custom-ucl-result'
                        : entry.mode === 'champions_league' ? '/game/cl-result'
                        : '/game/result',
                params: { runId: entry.id },
              })}
            >
              <View style={[styles.rankBadge, index < 3 && { backgroundColor: MEDALS[index] }]}>
                <Text style={[styles.rankText, index < 3 && { color: '#0A0E1A' }]}>{index + 1}</Text>
              </View>
              <View style={styles.entryContent}>
                <Text style={styles.username}>{entry.profiles.username}</Text>
                <Text style={styles.entryTier}>{formatTier(entry.tier)}</Text>
                <Text style={styles.entryLeague}>{entry.league_name}</Text>
              </View>
              <View style={styles.entryStats}>
                <Text style={styles.entryScore}>{entry.score}</Text>
                <Text style={styles.entryDate}>{formatDate(entry.created_at)}</Text>
              </View>
            </PressCard>
          ))}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: colors.bg,
    paddingTop:      64,
    paddingHorizontal: spacing.lg,
  },
  title: {
    fontSize:     typography.xxl,
    fontWeight:   typography.black,
    color:        colors.textPrimary,
    marginBottom: spacing.md,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  scroll: {
    flex: 1,
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  rankText: {
    fontSize: typography.sm,
    fontWeight: typography.black,
    color: colors.textPrimary,
  },
  entryContent: {
    flex: 1,
  },
  username: {
    fontSize: typography.md,
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  entryTier: {
    fontSize: typography.sm,
    color: colors.accent,
    fontWeight: typography.medium,
  },
  entryLeague: {
    fontSize: typography.xs,
    color: colors.textSecondary,
  },
  entryStats: {
    alignItems: 'flex-end',
  },
  entryScore: {
    fontSize: typography.lg,
    fontWeight: typography.black,
    color: colors.textPrimary,
  },
  entryDate: {
    fontSize: typography.xs,
    color: colors.textMuted,
  },
})