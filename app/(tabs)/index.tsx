import React, { useCallback, useState } from 'react'
import { View, Text, StyleSheet, Pressable, StatusBar, ScrollView, ActivityIndicator } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useUserStore } from '@/store/userStore'
import { fetchUserStats, fetchRunHistory, type UserStats } from '@/db/queries/leaderboard'
import { colors, spacing, typography, radius, shadows } from '@/theme'
import { formatTier } from '@/data/tiers'

export default function HomeScreen() {
  const { profile, isGuest, user } = useUserStore()
  const [stats, setStats] = useState<UserStats | null>(null)
  const [recentRuns, setRecentRuns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Refetch every time Home gains focus (tabs persist, so a plain mount effect
  // would go stale) — this is what makes a freshly-finished run show up.
  useFocusEffect(
    useCallback(() => {
      let active = true
      async function loadData() {
        if (!user || isGuest) { setLoading(false); return }
        try {
          const [userStats, runs] = await Promise.all([
            fetchUserStats(user.id),
            fetchRunHistory(user.id, 3),
          ])
          if (!active) return
          setStats(userStats)
          setRecentRuns(runs)
        } catch (error) {
          console.error('Failed to load user data:', error)
        } finally {
          if (active) setLoading(false)
        }
      }
      loadData()
      return () => { active = false }
    }, [user, isGuest])
  )

  function formatDate(dateString: string): string {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            {isGuest ? 'Playing as Guest' : `Hey, ${profile?.username}`}
          </Text>
          <Text style={styles.subtitle}>
            {isGuest ? 'Create an account to save your runs' : 'Ready to suffer?'}
          </Text>
        </View>
        {isGuest && (
          <Pressable
            style={styles.signInBtn}
            onPress={() => router.push('/auth/register')}
          >
            <Text style={styles.signInBtnText}>Sign Up</Text>
          </Pressable>
        )}
      </View>

      {/* hero */}
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>PERFECTION</Text>
        <Text style={styles.heroOr}>or</Text>
        <Text style={styles.heroMisery}>MISERY</Text>
        <Text style={styles.heroTagline}>
          Draft your XI. Face the consequences.
        </Text>
      </View>

      {/* start button */}
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.startBtn, pressed && styles.startBtnPressed]}
          onPress={() => router.push('/game/mode-select')}
        >
          <Text style={styles.startBtnText}>START RUN</Text>
        </Pressable>

        {/* best run teaser */}
        {loading ? (
          <View style={styles.statsRow}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{stats?.bestScore ?? '—'}</Text>
              <Text style={styles.statLabel}>Best Score</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{formatTier(stats?.bestTier)}</Text>
              <Text style={styles.statLabel}>Best Tier</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{stats?.totalRuns ?? 0}</Text>
              <Text style={styles.statLabel}>Total Runs</Text>
            </View>
          </View>
        )}
      </View>

      {/* recent runs */}
      <View style={styles.recentSection}>
        <Text style={styles.sectionTitle}>Recent Runs</Text>
        {loading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : recentRuns.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>😬</Text>
            <Text style={styles.emptyText}>No runs yet. Start suffering.</Text>
          </View>
        ) : (
          <ScrollView style={styles.recentScroll} showsVerticalScrollIndicator={false}>
            {recentRuns.map((run) => (
              <View key={run.id} style={styles.runCard}>
                <View style={styles.runCardHeader}>
                  <Text style={styles.runTier}>{formatTier(run.tier)}</Text>
                  <Text style={styles.runDate}>{formatDate(run.created_at)}</Text>
                </View>
                <Text style={styles.runLeague}>{run.league_name}</Text>
                <View style={styles.runStats}>
                  <Text style={styles.runStat}>Score: {run.score}</Text>
                  <Text style={styles.runStat}>#{run.final_position}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: colors.bg,
    paddingTop:      56,
  },
  header: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    paddingHorizontal: spacing.lg,
    marginBottom:   spacing.xl,
  },
  greeting: {
    fontSize:   typography.md,
    color:      colors.textPrimary,
    fontWeight: typography.bold,
  },
  subtitle: {
    fontSize:  typography.sm,
    color:     colors.textSecondary,
    marginTop: 2,
  },
  signInBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    borderRadius:      radius.full,
  },
  signInBtnText: {
    color:      colors.textPrimary,
    fontSize:   typography.sm,
    fontWeight: typography.bold,
  },
  hero: {
    alignItems:        'center',
    paddingHorizontal: spacing.lg,
    marginBottom:      spacing.xl,
  },
  heroTitle: {
    fontSize:      typography.hero,
    fontWeight:    typography.black,
    color:         colors.textPrimary,
    letterSpacing: 6,
  },
  heroOr: {
    fontSize:   typography.lg,
    color:      colors.textMuted,
    fontWeight: typography.regular,
    marginVertical: 2,
  },
  heroMisery: {
    fontSize:      typography.hero,
    fontWeight:    typography.black,
    color:         colors.danger,
    letterSpacing: 6,
  },
  heroTagline: {
    fontSize:   typography.sm,
    color:      colors.textSecondary,
    marginTop:  spacing.md,
    letterSpacing: 1,
  },
  actions: {
    paddingHorizontal: spacing.lg,
    marginBottom:      spacing.xl,
  },
  startBtn: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.lg,
    borderRadius:    radius.md,
    alignItems:      'center',
    marginBottom:    spacing.md,
    ...shadows.md,
  },
  startBtnPressed: {
    backgroundColor: colors.accentDim,
    transform:       [{ scale: 0.98 }],
  },
  startBtnText: {
    fontSize:      typography.lg,
    fontWeight:    typography.black,
    color:         colors.textPrimary,
    letterSpacing: 3,
  },
  statsRow: {
    flexDirection:     'row',
    backgroundColor:   colors.bgCard,
    borderRadius:      radius.md,
    borderWidth:       1,
    borderColor:       colors.border,
    paddingVertical:   spacing.md,
  },
  statBox: {
    flex:       1,
    alignItems: 'center',
  },
  statDivider: {
    width:           1,
    backgroundColor: colors.border,
  },
  statValue: {
    fontSize:   typography.xl,
    fontWeight: typography.black,
    color:      colors.textPrimary,
  },
  statLabel: {
    fontSize:  typography.xs,
    color:     colors.textSecondary,
    marginTop: 2,
  },
  recentSection: {
    flex:              1,
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    fontSize:     typography.md,
    fontWeight:   typography.bold,
    color:        colors.textPrimary,
    marginBottom: spacing.md,
  },
  recentScroll: {
    flex: 1,
  },
  runCard: {
    backgroundColor: colors.bgCard,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         spacing.md,
    marginBottom:    spacing.sm,
  },
  runCardHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:    spacing.xs,
  },
  runTier: {
    fontSize:   typography.sm,
    fontWeight: typography.bold,
    color:      colors.accent,
  },
  runDate: {
    fontSize:  typography.xs,
    color:     colors.textMuted,
  },
  runLeague: {
    fontSize:   typography.md,
    fontWeight: typography.bold,
    color:      colors.textPrimary,
    marginBottom: spacing.xs,
  },
  runStats: {
    flexDirection: 'row',
    gap:           spacing.md,
  },
  runStat: {
    fontSize: typography.sm,
    color:    colors.textSecondary,
  },
  emptyState: {
    alignItems:  'center',
    paddingTop:  spacing.xxl,
  },
  emptyEmoji: {
    fontSize:     40,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: typography.sm,
    color:    colors.textMuted,
  },
})