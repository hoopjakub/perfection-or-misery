import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import { useUserStore } from '@/store/userStore'
import { fetchCareer } from '@/db/queries/career'
import { colors, spacing, typography, radius, shadows } from '@/theme'
import type { CareerStats, CareerPlayerLine } from '@/types/stats'

type Tab = 'goals' | 'assists' | 'cleanSheets' | 'matchesPlayed'
type Comp = 'all' | 'league' | 'champions_league' | 'champions_league_custom' | 'world_cup'

const COMP_LABEL: Record<string, string> = { league: 'LGE', champions_league: 'UCL', champions_league_custom: 'UCL✦', world_cup: 'WC' }
const TAB_LABEL: Record<Tab, string> = { goals: 'Goals', assists: 'Assists', cleanSheets: 'Clean Sheets', matchesPlayed: 'Apps' }

export default function CareerScreen() {
  const { user, isGuest } = useUserStore()
  const [career, setCareer] = useState<CareerStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('goals')
  const [comp, setComp] = useState<Comp>('all')

  useEffect(() => {
    async function go() {
      if (!user || isGuest) { setLoading(false); return }
      try { setCareer(await fetchCareer(user.id)) }
      catch (e) { console.warn('[career] load failed:', e) }
      finally { setLoading(false) }
    }
    go()
  }, [])

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>
  if (isGuest || !user) return (
    <View style={styles.center}><Text style={{ fontSize: 40 }}>🔒</Text><Text style={styles.muted}>Sign in to build a career.</Text>
      <Pressable onPress={() => router.back()} style={{ marginTop: spacing.md }}><Text style={{ color: colors.accent, fontWeight: '700' }}>← Back</Text></Pressable></View>
  )
  if (!career || career.players.length === 0) return (
    <View style={styles.center}><Text style={{ fontSize: 40 }}>🏟️</Text><Text style={styles.muted}>No career yet. Finish some runs.</Text>
      <Pressable onPress={() => router.back()} style={{ marginTop: spacing.md }}><Text style={{ color: colors.accent, fontWeight: '700' }}>← Back</Text></Pressable></View>
  )

  const pool = comp === 'all' ? career.players : career.players.filter(p => p.competition === comp)
  const list = [...pool].filter(p => (p as any)[tab] > 0).sort((a, b) => (b as any)[tab] - (a as any)[tab])
  const decorated = [...pool].filter(p => p.potsWins > 0 || p.u21Wins > 0).sort((a, b) => (b.potsWins + b.u21Wins) - (a.potsWins + a.u21Wins))

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>←</Text></Pressable>
        <Text style={styles.title}>Career</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.totalsRow}>
          <View style={styles.totalBox}><Text style={styles.totalVal}>{new Set(career.players.map(p => p.playerId)).size}</Text><Text style={styles.totalLbl}>Players Fielded</Text></View>
          <View style={styles.totalBox}><Text style={[styles.totalVal, { color: colors.success }]}>{career.goalsFor}</Text><Text style={styles.totalLbl}>Goals For</Text></View>
          <View style={styles.totalBox}><Text style={[styles.totalVal, { color: colors.danger }]}>{career.goalsAgainst}</Text><Text style={styles.totalLbl}>Goals Against</Text></View>
        </View>

        {/* Competition filter */}
        <View style={styles.chips}>
          {(['all', 'league', 'champions_league', 'champions_league_custom', 'world_cup'] as Comp[]).map(c => (
            <Pressable key={c} onPress={() => setComp(c)} style={[styles.chip, comp === c && styles.chipActive]}>
              <Text style={[styles.chipText, comp === c && styles.chipTextActive]}>{c === 'all' ? 'All' : COMP_LABEL[c]}</Text>
            </Pressable>
          ))}
        </View>

        {/* Awards cabinet */}
        {decorated.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🏆 Awards Cabinet</Text>
            {decorated.map(p => (
              <View key={`${p.playerId}|${p.seasonLabel}|${p.competition}`} style={styles.row}>
                <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.meta}>{p.seasonLabel} · {COMP_LABEL[p.competition] ?? p.competition}</Text>
                <Text style={styles.trophies}>{p.potsWins > 0 ? `🏆×${p.potsWins} ` : ''}{p.u21Wins > 0 ? `🌟×${p.u21Wins}` : ''}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Leaderboard */}
        <View style={styles.card}>
          <View style={styles.tabs}>
            {(['goals', 'assists', 'cleanSheets', 'matchesPlayed'] as Tab[]).map(t => (
              <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
                <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{TAB_LABEL[t]}</Text>
              </Pressable>
            ))}
          </View>
          {list.length === 0 ? <Text style={styles.muted}>Nothing here yet.</Text> : list.map((p, i) => (
            <View key={`${p.playerId}|${p.seasonLabel}|${p.competition}`} style={styles.row}>
              <Text style={styles.rank}>{i + 1}</Text>
              <View style={styles.nameCol}>
                <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.meta}>{p.seasonLabel} · {COMP_LABEL[p.competition] ?? p.competition} · {p.runs} run{p.runs !== 1 ? 's' : ''} · {p.matchesPlayed} apps</Text>
              </View>
              <Text style={styles.statVal}>{(p as any)[tab]}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  muted: { color: colors.textMuted, fontSize: typography.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.textPrimary, fontSize: typography.xl },
  title: { fontSize: typography.lg, fontWeight: typography.black, color: colors.textPrimary },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  totalsRow: { flexDirection: 'row', gap: spacing.sm },
  totalBox: { flex: 1, backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.md, alignItems: 'center' },
  totalVal: { fontSize: typography.xl, fontWeight: typography.black, color: colors.textPrimary },
  totalLbl: { fontSize: typography.xs, color: colors.textMuted, marginTop: 2 },
  chips: { flexDirection: 'row', gap: spacing.xs },
  chip: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: typography.xs, fontWeight: typography.bold, color: colors.textSecondary },
  chipTextActive: { color: colors.textPrimary },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs, ...shadows.sm },
  cardTitle: { fontSize: typography.md, fontWeight: typography.bold, color: colors.textPrimary, marginBottom: spacing.xs },
  tabs: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  tabText: { fontSize: 10, fontWeight: typography.bold, color: colors.textSecondary },
  tabTextActive: { color: colors.textPrimary },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  rank: { width: 22, textAlign: 'center', fontSize: typography.sm, fontWeight: typography.bold, color: colors.textMuted },
  nameCol: { flex: 1 },
  name: { flex: 1, fontSize: typography.sm, color: colors.textPrimary },
  meta: { fontSize: 10, color: colors.textMuted },
  statVal: { fontSize: typography.md, fontWeight: typography.black, color: colors.accent, minWidth: 30, textAlign: 'right' },
  trophies: { fontSize: typography.sm },
})
