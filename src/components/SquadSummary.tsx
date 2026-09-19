import React, { useState } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getSlotsForFormation } from '@/engine/formations'
import { PressCard } from '@/components/ui'
import { colors, spacing, typography, radius, ratingColor, prim, font } from '@/theme'
import type { CompetitionStats } from '@/types/stats'
import type { DraftedPlayer, Formation } from '@/types/game'

// Your XI with per-player stats, in-lineup positions, and "notable" league ranks
// (top-3 in any category). Shared by the league/CL/WC result pages. Toggle
// between STATS (goals/assists/clean sheets + avg match rating + POTM count)
// and TEAM (the real club & season each drafted player came from).
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
            <PressCard key={v} style={[styles.toggleBtn, view === v && { backgroundColor: accent }]} onPress={() => setView(v)}>
              <Text style={[styles.toggleText, view === v && styles.toggleTextActive]}>{v === 'stats' ? 'Stats' : 'Team'}</Text>
            </PressCard>
          ))}
        </View>
      </View>
      {yours.map(p => {
        const gr = gR.get(p.playerId), ar = aR.get(p.playerId), cr = cR.get(p.playerId)
        const notable: string[] = []
        if (gr && gr <= 3) notable.push(`#${gr}`)
        if (ar && ar <= 3) notable.push(`🅰#${ar}`)
        if (cr && cr <= 3) notable.push(`#${cr}`)
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
                {p.avgRating != null && (
                  <View style={[styles.ratingChip, { backgroundColor: ratingColor(p.avgRating) }]}>
                    <Text style={styles.ratingChipText}>{p.avgRating.toFixed(2)}</Text>
                  </View>
                )}
                {(p.potm ?? 0) > 0 && <Text style={styles.potm}>{p.potm}</Text>}
                {notable.length > 0 && <Text style={[styles.notable, { color: accent }]}>{notable.join(' ')}</Text>}
              </>
            ) : (
              <Text style={styles.line} numberOfLines={1}>{dp ? `${dp.clubName}${dp.season ? ` · ${dp.season}` : ''}` : '—'}</Text>
            )}
          </View>
        )
      })}
      <PressCard
        onPress={() => router.push({ pathname: '/game/run', params: runId ? { runId, tab: 'stats' } : { tab: 'stats' } })}
        style={{ paddingTop: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}
      >
        <Text style={[styles.more, { color: accent }]}>Full stats</Text>
        <Ionicons name="arrow-forward" size={14} color={accent} />
      </PressCard>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: prim.nylonRaised, borderRadius: 0, borderWidth: 1, borderColor: prim.ruleNylon, padding: spacing.md, gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  title: { fontSize: typography.md, fontFamily: font.bodyBold, color: prim.cotton },
  toggle: { flexDirection: 'row', backgroundColor: prim.nylonSunken, borderRadius: 0, padding: 2, gap: 2 },
  toggleBtn: { paddingHorizontal: spacing.md, paddingVertical: 3, borderRadius: 0 },
  toggleText: { fontSize: typography.xs, fontFamily: font.bodyBold, color: prim.cottonMuted },
  toggleTextActive: { color: prim.cotton },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: prim.ruleNylon },
  pos: { width: 36, fontSize: 10, color: prim.cottonMuted, fontFamily: font.bodyBold },
  name: { flex: 1, fontSize: typography.sm, color: prim.cotton },
  line: { fontSize: typography.xs, color: prim.cottonMuted },
  notable: { fontSize: 10, fontFamily: font.bodyBold },
  ratingChip: { borderRadius: 0, paddingHorizontal: 4, paddingVertical: 1, minWidth: 32, alignItems: 'center' },
  ratingChipText: { fontSize: 10, fontFamily: font.bodyBlack, color: '#0A0E1A' },
  potm: { fontSize: 10, fontFamily: font.bodyBlack, color: '#FFD700' },
  subTag: { fontSize: 9, fontFamily: font.bodyBlack, color: colors.warning },
  more: { fontSize: typography.sm, fontFamily: font.bodyBold, textAlign: 'center' },
})
