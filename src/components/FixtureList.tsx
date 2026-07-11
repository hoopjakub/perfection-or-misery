import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { colors, spacing, typography, radius } from '@/theme'
import { TeamLabel } from '@/components/TeamLabel'

// Shared by classic UCL and the custom UCL league phase — shown on the
// pre-simulation review screen so you know who you're playing and from which
// pot before you hit start, not just after the fact.
const POT_COLORS: Record<number, string> = { 1: '#F59E0B', 2: '#A78BFA', 3: '#34D399', 4: '#60A5FA' }

export type FixtureListItem = {
  matchday: number
  clubId: string
  clubName: string
  pot: number
  isHome: boolean
}

export function FixtureList({ items, accent, title = 'Your Fixtures' }: {
  items: FixtureListItem[]
  accent: string
  title?: string
}) {
  if (items.length === 0) return null
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {/* Staggered reveal — each fixture drops in a beat after the last, like a
          draw ceremony calling out names one at a time rather than a static list. */}
      {[...items].sort((a, b) => a.matchday - b.matchday).map((f, i) => {
        const potColor = POT_COLORS[f.pot] ?? colors.textMuted
        return (
          <Animated.View key={f.matchday} entering={FadeInDown.delay(i * 90).springify().damping(14)} style={styles.row}>
            <Text style={styles.md}>MD{f.matchday}</Text>
            <View style={[styles.haBadge, { borderColor: f.isHome ? accent : colors.border }]}>
              <Text style={[styles.haText, f.isHome && { color: accent }]}>{f.isHome ? 'H' : 'A'}</Text>
            </View>
            <TeamLabel clubId={f.clubId} name={f.clubName} textStyle={styles.oppName} containerStyle={{ flex: 1 }} size={16} />
            <View style={[styles.potBadge, { borderColor: potColor, backgroundColor: potColor + '22' }]}>
              <Text style={[styles.potText, { color: potColor }]}>POT {f.pot}</Text>
            </View>
          </Animated.View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  title: { fontSize: typography.md, fontWeight: typography.bold, color: colors.textPrimary, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  md: { width: 34, fontSize: 11, fontWeight: typography.bold, color: colors.textMuted },
  haBadge: { width: 22, height: 22, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  haText: { fontSize: 10, fontWeight: typography.black, color: colors.textMuted },
  oppName: { fontSize: typography.sm, color: colors.textPrimary },
  potBadge: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  potText: { fontSize: 9, fontWeight: typography.black, letterSpacing: 0.5 },
})
