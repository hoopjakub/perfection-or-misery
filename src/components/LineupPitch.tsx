import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { getSlotsForFormation } from '@/engine/formations'
import { effectiveOvr } from '@/engine/rating'
import { colors, spacing, typography, radius } from '@/theme'
import type { DraftedPlayer, Formation } from '@/types/game'

// Left-to-right ordering so the lineup reads mirror-correct (L* left, R* right).
function rowOrder(label: string): number {
  if (label.startsWith('L')) return -1
  if (label.startsWith('R')) return 1
  return 0
}

const ATTACK = ['LW', 'ST', 'RW']
const MID    = ['LM', 'CM', 'CAM', 'CDM', 'RM']
const DEF    = ['LB', 'CB', 'RB', 'LWB', 'RWB']

// The squad pitch with each slot's effective OVR — reused from the pre-sim
// review screen so the result page shows the same lineup overview.
export function LineupPitch({ formation, draftedPlayers, title }: {
  formation: Formation
  draftedPlayers: DraftedPlayer[]
  title?: string
}) {
  const slots = getSlotsForFormation(formation)
  const rowOf = (labels: string[]) => slots.filter(s => labels.includes(s.label)).sort((a, b) => rowOrder(a.label) - rowOrder(b.label))

  const renderRow = (labels: string[]) => (
    <View style={styles.pitchRow}>
      {rowOf(labels).map((slot, i) => {
        const player = draftedPlayers.find(p => p.slotIndex === slot.slotIndex)
        const ovr = player ? effectiveOvr(player, slot) : 0
        const color = (colors.positions as any)[slot.label] ?? (colors.positions as any)[slot.primary] ?? colors.accent
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

  return (
    <View style={styles.container}>
      {title && <Text style={styles.title}>{title}</Text>}
      <View style={styles.pitch}>
        {renderRow(ATTACK)}
        {renderRow(MID)}
        {renderRow(DEF)}
        {renderRow(['GK'])}
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
