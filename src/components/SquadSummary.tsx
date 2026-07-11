import React, { useState } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { router } from 'expo-router'
import { getSlotsForFormation } from '@/engine/formations'
import { colors, spacing, typography, radius } from '@/theme'
import type { CompetitionStats } from '@/types/stats'
import type { DraftedPlayer, Formation } from '@/types/game'

// Your XI with per-player stats, in-lineup positions, and "notable" league ranks
// (top-3 in any category). Shared by the league/CL/WC result pages. Toggle
// between STATS (goals/assists/clean sheets) and TEAM (the real club & season
// each drafted player came from).
export function SquadSummary({ stats, draftedPlayers, formation, accent, runId }: {
  stats: CompetitionStats
  draftedPlayers: DraftedPlayer[]
  formation: Formation | null
  accent: string
  runId?: string   // when viewing from history, link to the saved snapshot
}) {
  const [view, setView] = useState<'stats' | 'team'>('stats')
  const all = stats.players
  const slots = formation ? getSlotsForFormation(formation) : []
  const draftedById = new Map(draftedPlayers.map(d => [d.playerId, d]))
  const slotLabel = (playerId: string) => {
    const dp = draftedById.get(playerId)
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
      <View style={styles.titleRow}>
        <Text style={styles.title}>Your Squad</Text>
        <View style={styles.toggle}>
          {(['stats', 'team'] as const).map(v => (
            <Pressable key={v} style={[styles.toggleBtn, view === v && { backgroundColor: accent }]} onPress={() => setView(v)}>
              <Text style={[styles.toggleText, view === v && styles.toggleTextActive]}>{v === 'stats' ? 'Stats' : 'Team'}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {yours.map(p => {
        const gr = gR.get(p.playerId), ar = aR.get(p.playerId), cr = cR.get(p.playerId)
        const notable: string[] = []
        if (gr && gr <= 3) notable.push(`⚽#${gr}`)
        if (ar && ar <= 3) notable.push(`🅰#${ar}`)
        if (cr && cr <= 3) notable.push(`🧤#${cr}`)
        const dp = draftedById.get(p.playerId)
        return (
          <View key={p.playerId} style={styles.row}>
            <Text style={styles.pos}>{slotLabel(p.playerId) ?? p.position}</Text>
            <Text style={styles.name} numberOfLines={1}>
              {p.name}{p.isBench && <Text style={styles.subTag}> SUB</Text>}
            </Text>
            {view === 'stats' ? (
              <>
                <Text style={styles.line}>{p.goals}G {p.assists}A {p.cleanSheets}CS</Text>
                {notable.length > 0 && <Text style={[styles.notable, { color: accent }]}>{notable.join(' ')}</Text>}
              </>
            ) : (
              <Text style={styles.line} numberOfLines={1}>{dp ? `${dp.clubName}${dp.season ? ` · ${dp.season}` : ''}` : '—'}</Text>
            )}
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
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  title: { fontSize: typography.md, fontWeight: typography.bold, color: colors.textPrimary },
  toggle: { flexDirection: 'row', backgroundColor: colors.bgElevated, borderRadius: radius.full, padding: 2, gap: 2 },
  toggleBtn: { paddingHorizontal: spacing.md, paddingVertical: 3, borderRadius: radius.full },
  toggleText: { fontSize: typography.xs, fontWeight: typography.bold, color: colors.textMuted },
  toggleTextActive: { color: colors.textPrimary },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border },
  pos: { width: 36, fontSize: 10, color: colors.textMuted, fontWeight: typography.bold },
  name: { flex: 1, fontSize: typography.sm, color: colors.textPrimary },
  line: { fontSize: typography.xs, color: colors.textSecondary },
  notable: { fontSize: 10, fontWeight: typography.bold },
  subTag: { fontSize: 9, fontWeight: typography.black, color: colors.warning },
  more: { fontSize: typography.sm, fontWeight: typography.bold, textAlign: 'center' },
})
