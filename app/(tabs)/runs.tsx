import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useUserStore } from '@/store/userStore'
import { fetchRunHistory, type RunHistoryEntry } from '@/db/queries/leaderboard'
import { PressCard, BackButton, DifficultyBadge } from '@/components/ui'
import { colors, spacing, typography, radius, shadows, MODE_THEMES } from '@/theme'

type SortKey = 'date' | 'score' | 'wins' | 'draws' | 'losses' | 'tier' | 'difficulty'
const SORT_OPTIONS: { key: SortKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'date',       label: 'Date',       icon: 'time-outline' },
  { key: 'score',      label: 'Score',      icon: 'trophy-outline' },
  { key: 'difficulty', label: 'Difficulty', icon: 'flame-outline' },
  { key: 'wins',       label: 'Wins',       icon: 'checkmark-circle-outline' },
  { key: 'draws',      label: 'Draws',      icon: 'remove-circle-outline' },
  { key: 'losses',     label: 'Losses',     icon: 'close-circle-outline' },
  { key: 'tier',       label: 'Tier',       icon: 'ribbon-outline' },
]

// Same combined ladder the tier column already mixed league tiers with CL/WC
// round-reached strings — kept as-is (tier sort is inherently a cross-mode
// approximation), just centralized instead of inline in the sort switch.
const TIER_ORDER = [
  'perfection', 'almost_perfection', 'champions', 'title_contender', 'champions_league',
  'europa_glory', 'almost_matters', 'respectful_mediocrity', 'absolute_misery',
  'winner', 'finalist', 'sf_exit', 'qf_exit', 'r16_exit', 'playoff_exit', 'league_exit',
  'quali_playoff_exit', 'q3_exit', 'q2_exit', 'q1_exit',
]

function formatTier(tier: string): string {
  return tier.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function resultRoute(mode: string) {
  return mode === 'world_cup' ? '/game/wc-result'
    : mode === 'champions_league_custom' ? '/game/custom-ucl-result'
    : mode === 'champions_league' ? '/game/cl-result'
    : '/game/result'
}

export default function RunsScreen() {
  const { user, isGuest } = useUserStore()
  const [runs, setRuns] = useState<RunHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortKey>('date')

  useEffect(() => {
    let active = true
    async function loadRuns() {
      if (!user || isGuest) { setLoading(false); return }
      try {
        const data = await fetchRunHistory(user.id, 100)
        if (active) setRuns(data)
      } catch (error) {
        console.error('Failed to load runs:', error)
      } finally {
        if (active) setLoading(false)
      }
    }
    loadRuns()
    return () => { active = false }
  }, [user, isGuest])

  // Every key sorts DESCENDING except losses and tier, where a smaller number
  // is the better result — sorting those descending would put your worst runs
  // first, which is the "doesn't properly sort" complaint that motivated this.
  const sortedRuns = useMemo(() => {
    const sorted = [...runs]
    switch (sortBy) {
      case 'date':       return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      case 'score':      return sorted.sort((a, b) => b.score - a.score)
      case 'wins':       return sorted.sort((a, b) => b.wins - a.wins)
      case 'draws':      return sorted.sort((a, b) => b.draws - a.draws)
      case 'losses':     return sorted.sort((a, b) => a.losses - b.losses)
      case 'difficulty': return sorted.sort((a, b) => (b.difficulty_meta?.hardness ?? -1) - (a.difficulty_meta?.hardness ?? -1))
      case 'tier':        return sorted.sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier))
      default:            return sorted
    }
  }, [runs, sortBy])

  if (loading) {
    return (
      <View style={styles.container}>
        <Header />
        <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>
      </View>
    )
  }

  if (isGuest) {
    return (
      <View style={styles.container}>
        <Header />
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>Sign in to view your run history</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Header count={runs.length} />

      {/* Sort control — a BOUNDED-HEIGHT horizontal row. The old version left
          this ScrollView's height unset; on web a horizontal ScrollView with no
          explicit height lets its content stretch to fill whatever vertical
          space is left in the flex column, dragging every chip along with it
          into a screen-tall pill. Fixed height + centered content keeps every
          chip exactly one row tall regardless of platform. */}
      <ScrollView
        horizontal
        style={styles.sortScroll}
        contentContainerStyle={styles.sortScrollContent}
        showsHorizontalScrollIndicator={false}
      >
        {SORT_OPTIONS.map(opt => {
          const active = sortBy === opt.key
          return (
            <PressCard
              key={opt.key}
              style={[styles.sortChip, active && { backgroundColor: colors.accent, borderColor: colors.accent }]}
              onPress={() => setSortBy(opt.key)}
            >
              <Ionicons name={opt.icon} size={13} color={active ? colors.bg : colors.textSecondary} />
              <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>{opt.label}</Text>
            </PressCard>
          )
        })}
      </ScrollView>

      {sortedRuns.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="skull-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>No runs yet. Start suffering.</Text>
        </View>
      ) : (
        <ScrollView style={styles.runsScroll} contentContainerStyle={styles.runsScrollContent} showsVerticalScrollIndicator={false}>
          {sortedRuns.map(run => {
            // Chaos/Cursed get a full mode-coloured border (not just a tier-coloured
            // left edge) so they're identifiable in the list at a glance, same
            // ask as the achievements screen's card treatment for those modes.
            const modeTheme = run.mode === 'chaos' || run.mode === 'cursed' ? MODE_THEMES[run.mode] : null
            const tierColor = (colors.tiers as any)[run.tier] ?? colors.accent
            return (
              <PressCard
                key={run.id}
                style={[
                  styles.runCard,
                  modeTheme
                    ? { borderWidth: 1.5, borderColor: modeTheme.accent, backgroundColor: modeTheme.bgTint }
                    : { borderLeftWidth: 3, borderLeftColor: tierColor },
                ]}
                onPress={() => router.push({ pathname: resultRoute(run.mode), params: { runId: run.id } })}
              >
                <View style={styles.runCardHeader}>
                  <Text style={[styles.runTier, { color: modeTheme?.accent ?? tierColor }]} numberOfLines={1}>
                    {formatTier(run.tier)}
                  </Text>
                  <Text style={styles.runDate}>{formatDate(run.created_at)}</Text>
                </View>
                <Text style={styles.runLeague} numberOfLines={1}>{run.league_name}</Text>

                <View style={styles.runMetaRow}>
                  <DifficultyBadge run={run} compact />
                  <View style={{ flex: 1 }} />
                  <Text style={styles.runScore}>{run.score}</Text>
                </View>

                <View style={styles.runStatsRow}>
                  <StatChip label="W" value={run.wins} color={colors.success} />
                  <StatChip label="D" value={run.draws} color={colors.textSecondary} />
                  <StatChip label="L" value={run.losses} color={colors.danger} />
                  <View style={{ flex: 1 }} />
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </View>
              </PressCard>
            )
          })}
        </ScrollView>
      )}
    </View>
  )
}

function Header({ count }: { count?: number }) {
  return (
    <View style={styles.header}>
      <BackButton />
      <View style={{ alignItems: 'center' }}>
        <Text style={styles.title}>My Runs</Text>
        {count != null && <Text style={styles.subtitle}>{count} run{count === 1 ? '' : 's'} played</Text>}
      </View>
      <View style={{ width: 34 }} />
    </View>
  )
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.statChip}>
      <Text style={[styles.statChipLabel, { color }]}>{label}</Text>
      <Text style={styles.statChipValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: typography.xl, fontWeight: typography.black, color: colors.textPrimary },
  subtitle: { fontSize: 11, color: colors.textMuted, marginTop: 1 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  emptyText: { fontSize: typography.sm, color: colors.textMuted, textAlign: 'center' },

  // height is the fix — see the comment above the ScrollView in the component.
  sortScroll: { height: 52, flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border },
  sortScrollContent: { alignItems: 'center', paddingHorizontal: spacing.lg, gap: spacing.sm },
  sortChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.bgElevated, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
  },
  sortChipText: { fontSize: 12, color: colors.textSecondary, fontWeight: typography.bold },
  sortChipTextActive: { color: colors.bg },

  runsScroll: { flex: 1 },
  runsScrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },
  runCard: {
    backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, gap: 6, ...shadows.sm,
  },
  runCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  runTier: { fontSize: typography.sm, fontWeight: typography.bold, flexShrink: 1, marginRight: spacing.sm },
  runDate: { fontSize: typography.xs, color: colors.textMuted },
  runLeague: { fontSize: typography.md, fontWeight: typography.bold, color: colors.textPrimary },

  runMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  runScore: { fontSize: typography.lg, fontWeight: typography.black, color: colors.textPrimary },

  runStatsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  statChip: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  statChipLabel: { fontSize: 10, fontWeight: typography.black },
  statChipValue: { fontSize: typography.xs, color: colors.textSecondary, fontWeight: typography.medium },
})
