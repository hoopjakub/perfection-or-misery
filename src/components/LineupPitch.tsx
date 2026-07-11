import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { getSlotsForFormation, getFormationRows } from '@/engine/formations'
import { effectiveOvr } from '@/engine/rating'
import { colors, spacing, typography, radius } from '@/theme'
import type { DraftedPlayer, Formation, PositionSlot } from '@/types/game'

// The squad pitch with each slot's effective OVR — reused from the pre-sim
// review screen so the result page shows the same lineup overview. Rows come
// from the formation's real row layout (getFormationRows), so a 4-2-3-1's
// double pivot + AM band, a 3-4-3's wing-backs, etc. actually look distinct
// from each other instead of every formation collapsing into the same
// generic attack/mid/defense/GK bucketing.
export function LineupPitch({ formation, draftedPlayers, title }: {
  formation: Formation
  draftedPlayers: DraftedPlayer[]
  title?: string
}) {
  const slots = getSlotsForFormation(formation)
  const rows = getFormationRows(formation)

  const renderRow = (labels: string[], key: number) => {
    // Consume slots by label as we go so duplicate labels (e.g. three 'CM's)
    // each get their own distinct slot rather than all matching the first.
    const remaining = [...slots]
    const rowSlots = labels
      .map(label => {
        const idx = remaining.findIndex(s => s.label === label)
        if (idx === -1) return null
        const [slot] = remaining.splice(idx, 1)
        return slot
      })
      .filter((s): s is PositionSlot => s !== null)

    return (
      <View key={key} style={styles.pitchRow}>
        {rowSlots.map((slot, i) => {
          const player = draftedPlayers.find(p => p.slotIndex === slot.slotIndex)
          const ovr = player ? effectiveOvr(player, slot) : 0
          const color = (colors.positions as any)[slot.primary] ?? colors.accent
          return (
            <View key={i} style={styles.pitchPlayer}>
              <View style={[styles.posIndicator, { backgroundColor: color }]}>
                <Text style={styles.posText}>{slot.label}</Text>
              </View>
              <Text style={styles.playerNameText} numberOfLines={1}>
                {player ? player.name.split(' ').slice(-1)[0] : 'Empty'}
              </Text>
              <Text style={styles.playerOvrText}>{player ? ovr : '--'}</Text>
            </View>
          )
        })}
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {title && <Text style={styles.title}>{title}</Text>}
      <View style={styles.pitch}>
        {rows.map((row, i) => renderRow(row, i))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  title: { fontSize: typography.md, fontWeight: typography.bold, color: colors.textPrimary, marginBottom: spacing.xs },
  pitch: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.lg, gap: spacing.lg },
  pitchRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md },
  pitchPlayer: { alignItems: 'center', width: 70 },
  posIndicator: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm, marginBottom: 4 },
  posText: { fontSize: 8, fontWeight: typography.black, color: colors.bg },
  playerNameText: { fontSize: typography.xs, fontWeight: typography.medium, color: colors.textPrimary, textAlign: 'center' },
  playerOvrText: { fontSize: 10, fontWeight: typography.bold, color: colors.textSecondary },
})
