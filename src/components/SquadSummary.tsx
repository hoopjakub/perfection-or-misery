import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { router } from 'expo-router'
import { getSlotsForFormation } from '@/engine/formations'
import { colors, spacing, typography, radius } from '@/theme'
import type { CompetitionStats } from '@/types/stats'
import type { DraftedPlayer, Formation } from '@/types/game'

// Your XI with per-player stats, in-lineup positions, and "notable" league ranks
// (top-3 in any category). Shared by the league/CL/WC result pages.
export function SquadSummary({ stats, draftedPlayers, formation, accent, runId }: {
  stats: CompetitionStats
  draftedPlayers: DraftedPlayer[]
  formation: Formation | null
  accent: string
  runId?: string   // when viewing from history, link to the saved snapshot
}) {
  const all = stats.players
  const slots = formation ? getSlotsForFormation(formation) : []
  const slotLabel = (playerId: string) => {
    const dp = draftedPlayers.find(d => d.playerId === playerId)
    return dp ? slots.find(s => s.slotIndex === dp.slotIndex)?.label : undefined
  }
  const rankIn = (key: 'goals' | 'assists' | 'cleanSheets') => {
    const m = new Map<string, number>()
    all.filter(p => (p as any)[key] > 0).sort((a, b) => (b as any)[key] - (a as any)[key]).forEach((p, i) => m.set(p.playerId, i + 1))
    return m
  }
  const gR = rankIn('goals'), aR = rankIn('assists'), cR = rankIn('cleanSheets')
  const yours = all.filter(p => p.isPlayerClub).sort((a, b) => b.goals - a.goals || b.assists - a.assists || b.cleanSheets - a.cleanSheets)
  if (yours.length === 0) return null

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Your Squad</Text>
      {yours.map(p => {
        const gr = gR.get(p.playerId), ar = aR.get(p.playerId), cr = cR.get(p.playerId)
        const notable: string[] = []
        if (gr && gr <= 3) notable.push(`⚽#${gr}`)
        if (ar && ar <= 3) notable.push(`🅰#${ar}`)
        if (cr && cr <= 3) notable.push(`🧤#${cr}`)
        return (
          <View key={p.playerId} style={styles.row}>
            <Text style={styles.pos}>{slotLabel(p.playerId) ?? p.position}</Text>
            <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
            <Text style={styles.line}>{p.goals}G {p.assists}A {p.cleanSheets}CS</Text>
            {notable.length > 0 && <Text style={[styles.notable, { color: accent }]}>{notable.join(' ')}</Text>}
          </View>
        )
      })}
      <Pressable onPress={() => router.push(runId ? { pathname: '/game/stats', params: { runId } } : '/game/stats')} style={{ paddingTop: spacing.sm }}>
        <Text style={[styles.more, { color: accent }]}>Full stats →</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs },
  title: { fontSize: typography.md, fontWeight: typography.bold, color: colors.textPrimary, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border },
  pos: { width: 36, fontSize: 10, color: colors.textMuted, fontWeight: typography.bold },
  name: { flex: 1, fontSize: typography.sm, color: colors.textPrimary },
  line: { fontSize: typography.xs, color: colors.textSecondary },
  notable: { fontSize: 10, fontWeight: typography.bold },
  more: { fontSize: typography.sm, fontWeight: typography.bold, textAlign: 'center' },
})
