import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useUserStore } from '@/store/userStore'
import { fetchAchievementRuns, isRunWon, type AchievementRun } from '@/db/queries/leaderboard'
import { BackButton } from '@/components/ui'
import { colors, spacing, typography, radius, shadows } from '@/theme'

// Which modes to show, in display order, with their identity + whether they have
// a base-difficulty axis (chaos/cursed don't — they're a single conquest).
const MODE_META: { mode: string; title: string; icon: keyof typeof Ionicons.glyphMap; accent: string; hasDifficulty: boolean; trophy: string }[] = [
  { mode: 'world_cup',               title: 'World Cup',                 icon: 'earth',    accent: '#F5C518', hasDifficulty: true,  trophy: 'Lift the World Cup' },
  { mode: 'champions_league_custom', title: 'Champions League',          icon: 'trophy',   accent: '#4FA9FF', hasDifficulty: true,  trophy: 'Win the full UCL journey' },
  { mode: 'champions_league',        title: 'Champions League (Classic)',icon: 'trophy',   accent: '#4FA9FF', hasDifficulty: true,  trophy: 'Win the finals-only UCL' },
  { mode: 'all_time',                title: 'All Time',                  icon: 'planet',   accent: '#10B981', hasDifficulty: true,  trophy: 'Win the league' },
  { mode: 'league',                  title: 'League Mode',               icon: 'flag',     accent: '#3B82F6', hasDifficulty: true,  trophy: 'Win the league' },
  { mode: 'era',                     title: 'Era Mode',                  icon: 'calendar', accent: '#8B5CF6', hasDifficulty: true,  trophy: 'Win the league' },
  { mode: 'chaos',                   title: 'Chaos Mode',                icon: 'skull',    accent: '#FF3B30', hasDifficulty: false, trophy: 'Win the league' },
  { mode: 'cursed',                  title: 'Cursed Mode',               icon: 'flame',    accent: '#A855F7', hasDifficulty: false, trophy: 'Win the league' },
]

type ModeAch = {
  wonEasy: boolean; wonMedium: boolean; wonHard: boolean
  customBestHardness: number | null   // hardest CUSTOM run won in this mode
  conquered: boolean                  // any trophy at all (covers old runs + chaos/cursed)
  legacyWins: number                  // wins with no recorded difficulty (pre-feature)
}

function emptyAch(): ModeAch {
  return { wonEasy: false, wonMedium: false, wonHard: false, customBestHardness: null, conquered: false, legacyWins: 0 }
}

function computeAchievements(runs: AchievementRun[]): Record<string, ModeAch> {
  const out: Record<string, ModeAch> = {}
  const metaByMode = new Map(MODE_META.map(m => [m.mode, m]))
  for (const m of MODE_META) out[m.mode] = emptyAch()
  for (const run of runs) {
    const a = out[run.mode]
    if (!a || !isRunWon(run)) continue
    a.conquered = true
    switch (run.difficulty) {
      case 'easy':   a.wonEasy = true; break
      case 'medium': a.wonMedium = true; break
      case 'hard':   a.wonHard = true; break
      case 'custom': {
        const h = run.difficulty_meta?.hardness
        if (typeof h === 'number') a.customBestHardness = Math.max(a.customBestHardness ?? -1, h)
        break
      }
      default:
        // No difficulty on the run. Chaos/Cursed have NO difficulty axis at
        // all (mode-select never calls setDifficulty for them) — that's normal,
        // not stale data, so it doesn't count as "legacy". Only modes that DO
        // have a difficulty axis but are missing it are genuinely pre-feature runs.
        if (metaByMode.get(run.mode)?.hasDifficulty) a.legacyWins++
    }
  }
  return out
}

export default function AchievementsScreen() {
  const { user, isGuest } = useUserStore()
  const [loading, setLoading] = useState(true)
  const [ach, setAch] = useState<Record<string, ModeAch>>({})
  const [totalWins, setTotalWins] = useState(0)
  const [hardestWon, setHardestWon] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      if (!user || isGuest) { setLoading(false); return }
      try {
        const runs = await fetchAchievementRuns(user.id)
        if (!active) return
        const computed = computeAchievements(runs)
        setAch(computed)
        const wins = runs.filter(isRunWon)
        setTotalWins(wins.length)
        const hardest = wins.reduce<number | null>((max, r) => {
          const h = r.difficulty_meta?.hardness
          return typeof h === 'number' ? Math.max(max ?? -1, h) : max
        }, null)
        setHardestWon(hardest)
      } catch (e) {
        console.warn('[achievements] load failed:', e)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [user, isGuest])

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.title}>Achievements</Text>
        <View style={{ width: 34 }} />
      </View>

      {isGuest ? (
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.textMuted} />
          <Text style={styles.muted}>Sign in to track your trophies across runs.</Text>
        </View>
      ) : loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* summary */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryValue}>{totalWins}</Text>
              <Text style={styles.summaryLabel}>Trophies</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryBox}>
              <Text style={styles.summaryValue}>{hardestWon != null ? `${hardestWon.toFixed(1)}` : '—'}</Text>
              <Text style={styles.summaryLabel}>Hardest won{hardestWon != null ? ' /10' : ''}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryBox}>
              <Text style={styles.summaryValue}>{MODE_META.filter(m => ach[m.mode]?.conquered).length}/{MODE_META.length}</Text>
              <Text style={styles.summaryLabel}>Modes cleared</Text>
            </View>
          </View>

          {MODE_META.map(meta => {
            const a = ach[meta.mode] ?? emptyAch()
            return (
              <View key={meta.mode} style={[styles.card, a.conquered && { borderColor: meta.accent }]}>
                <View style={styles.cardHead}>
                  <View style={[styles.modeIcon, { backgroundColor: meta.accent + '22' }]}>
                    <Ionicons name={meta.icon} size={18} color={meta.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modeTitle}>{meta.title}</Text>
                    <Text style={styles.modeSub}>{meta.trophy}</Text>
                  </View>
                  {a.conquered
                    ? <Ionicons name="trophy" size={20} color={colors.gold} />
                    : <Ionicons name="ellipse-outline" size={18} color={colors.textMuted} />}
                </View>

                {meta.hasDifficulty ? (
                  <View style={styles.badgeRow}>
                    <DiffBadge label="Easy"   won={a.wonEasy}   accent={meta.accent} />
                    <DiffBadge label="Medium" won={a.wonMedium} accent={meta.accent} />
                    <DiffBadge label="Hard"   won={a.wonHard}   accent={meta.accent} />
                    <CustomBadge hardness={a.customBestHardness} accent={meta.accent} />
                  </View>
                ) : (
                  <View style={styles.badgeRow}>
                    <View style={[styles.badge, a.conquered ? { backgroundColor: meta.accent + '22', borderColor: meta.accent } : styles.badgeOff]}>
                      <Text style={[styles.badgeText, a.conquered && { color: meta.accent }]}>
                        {a.conquered ? '✓ Conquered' : 'Not yet'}
                      </Text>
                    </View>
                  </View>
                )}

                {a.legacyWins > 0 && (
                  <Text style={styles.legacyNote}>
                    +{a.legacyWins} older win{a.legacyWins > 1 ? 's' : ''} from before difficulty was tracked
                  </Text>
                )}
              </View>
            )
          })}

          <Text style={styles.footnote}>
            Difficulty badges light up from your saved runs — win a mode on a difficulty and it stays earned. Custom shows the hardest custom run you've won (0–11 scale).
          </Text>
        </ScrollView>
      )}
    </View>
  )
}

function DiffBadge({ label, won, accent }: { label: string; won: boolean; accent: string }) {
  return (
    <View style={[styles.badge, won ? { backgroundColor: accent + '22', borderColor: accent } : styles.badgeOff]}>
      {won && <Ionicons name="checkmark" size={11} color={accent} />}
      <Text style={[styles.badgeText, won && { color: accent }]}>{label}</Text>
    </View>
  )
}

function CustomBadge({ hardness, accent }: { hardness: number | null; accent: string }) {
  const won = hardness != null
  return (
    <View style={[styles.badge, won ? { backgroundColor: colors.gold + '22', borderColor: colors.gold } : styles.badgeOff]}>
      {won && <Ionicons name="construct" size={11} color={colors.gold} />}
      <Text style={[styles.badgeText, won && { color: colors.gold }]}>
        {won ? `Custom ${hardness!.toFixed(1)}/10` : 'Custom'}
      </Text>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  muted: { fontSize: typography.sm, color: colors.textMuted, textAlign: 'center' },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },

  summaryRow: {
    flexDirection: 'row', backgroundColor: colors.bgCard, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.md, ...shadows.sm,
  },
  summaryBox: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, backgroundColor: colors.border },
  summaryValue: { fontSize: typography.xl, fontWeight: typography.black, color: colors.textPrimary },
  summaryLabel: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },

  card: {
    backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.md, gap: spacing.sm, ...shadows.sm,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  modeIcon: { width: 34, height: 34, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  modeTitle: { fontSize: typography.md, fontWeight: typography.bold, color: colors.textPrimary },
  modeSub: { fontSize: 10, color: colors.textMuted },

  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 4,
  },
  badgeOff: { borderColor: colors.border, backgroundColor: colors.bgElevated },
  badgeText: { fontSize: 11, fontWeight: typography.bold, color: colors.textMuted },
  legacyNote: { fontSize: 10, color: colors.textMuted, fontStyle: 'italic' },
  footnote: { fontSize: 11, color: colors.textMuted, textAlign: 'center', lineHeight: 16, paddingTop: spacing.sm },
})
