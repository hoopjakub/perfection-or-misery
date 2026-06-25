import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { colors, spacing, typography } from '@/theme'
import type { PenKick } from '@/engine/knockout-match'

// Renders a stored penalty shootout (kicker name + ✅/❌) for the result screens.
export function PenShootout({ teamA, teamB, kicksA, kicksB }: {
  teamA: string; teamB: string; kicksA: PenKick[]; kicksB: PenKick[]
}) {
  const rows = Math.max(kicksA.length, kicksB.length)
  if (rows === 0) return null
  return (
    <View style={styles.box}>
      <Text style={styles.title}>Penalty Shootout</Text>
      <View style={styles.header}>
        <Text style={[styles.team, { textAlign: 'right' }]} numberOfLines={1}>{teamA}</Text>
        <View style={{ width: spacing.md }} />
        <Text style={styles.team} numberOfLines={1}>{teamB}</Text>
      </View>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.row}>
          <Text style={[styles.name, { textAlign: 'right' }]} numberOfLines={1}>
            {kicksA[i] ? `${kicksA[i].playerName} ${kicksA[i].scored ? '✅' : '❌'}` : ''}
          </Text>
          <Text style={styles.num}>{i + 1}</Text>
          <Text style={styles.name} numberOfLines={1}>
            {kicksB[i] ? `${kicksB[i].scored ? '✅' : '❌'} ${kicksB[i].playerName}` : ''}
          </Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  box:    { borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.sm, paddingTop: spacing.sm, gap: 2 },
  title:  { fontSize: typography.xs, color: colors.textMuted, fontWeight: typography.bold, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', marginBottom: 2 },
  header: { flexDirection: 'row', alignItems: 'center' },
  team:   { flex: 1, fontSize: 10, color: colors.textSecondary, fontWeight: typography.bold },
  row:    { flexDirection: 'row', alignItems: 'center' },
  name:   { flex: 1, fontSize: typography.xs, color: colors.textPrimary },
  num:    { width: 18, textAlign: 'center', fontSize: 9, color: colors.textMuted },
})
