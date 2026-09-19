import React, { useCallback, useState } from 'react'
import { PageMeta } from '@/components/PageMeta'
import { View, StyleSheet } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { fetchLeaderboard, type LeaderboardEntry } from '@/db/queries/leaderboard'
import { formatTier, verdictOf, runMeta } from '@/data/tiers'
import { runRoute } from '@/lib/nav'
import { useSizeClass } from '@/hooks/useSizeClass'
import { ROLES, space, colourwayFor } from '@/theme'
import { KitScreen, KitText, RunLabel, RunLabelSkeleton, EmptyState, InlineError } from '@/components/kit'

// D9 · Ranks (docs/ui-overhaul/07d). The best runs anyone has played, each as
// the same garment label your own runs wear, with its place set in the super
// beside it. The podium used gold/silver/bronze fills; the place number in
// the big type carries that now, and the verdict edge still marks Perfection.
const roles = ROLES.cotton

export default function LeaderboardScreen() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const wide = useSizeClass() === 'expanded'   // two columns of labels (10-ADAPT §2.2)

  // Refetch on focus (tabs stay mounted, so a mount-only effect went stale the
  // moment you finished another run). Skeletons on the first load only.
  useFocusEffect(
    useCallback(() => {
      let active = true
      ;(async () => {
        try {
          const data = await fetchLeaderboard({ limit: 50 })
          if (active) { setLeaderboard(data); setFailed(false) }
        } catch (error) {
          console.warn('[leaderboard] load failed:', error)
          if (active) setFailed(true)
        } finally {
          if (active) setLoading(false)
        }
      })()
      return () => { active = false }
    }, [reloadKey])
  )

  return (
    <KitScreen ground="cotton" width={wide ? 'wide' : 'column'}>
      <PageMeta title="Ranks" description="The fifty best runs anyone has played, by score." path="/leaderboard" />
      <KitText t="superL" color={roles.text} accessibilityRole="header" style={styles.title}>RANKS</KitText>
      <KitText t="tag" color={roles.textMuted}>The fifty best runs, by score</KitText>
      {loading ? (
        <View style={styles.list}>{[0, 1, 2].map(i => <RunLabelSkeleton key={i} roles={roles} />)}</View>
      ) : failed && leaderboard.length === 0 ? (
        <InlineError roles={roles} message="The ranks couldn't be loaded." onRetry={() => { setLoading(true); setReloadKey(k => k + 1) }} />
      ) : leaderboard.length === 0 ? (
        <EmptyState roles={roles} title="Nobody yet" body="Finish a run and be the first on the board." />
      ) : (
        <View style={[styles.list, wide && styles.grid]}>
          {leaderboard.map((entry, i) => (
            <View key={entry.id} style={[styles.row, wide && styles.cell]}>
              <KitText t={i < 3 ? 'superM' : 'superS'} color={i < 3 ? roles.text : roles.textMuted} style={styles.place}>{String(i + 1)}</KitText>
              <View style={{ flex: 1 }}>
                <RunLabel
                  roles={roles}
                  colourway={colourwayFor(entry.mode)}
                  title={formatTier(entry.tier)}
                  meta={`${entry.profiles.username} · ${runMeta(entry)}`}
                  score={entry.score.toLocaleString('en-US')}
                  verdict={verdictOf(entry.tier)}
                  onPress={() => router.push({ pathname: runRoute(entry.mode), params: { runId: entry.id } })}
                />
              </View>
            </View>
          ))}
        </View>
      )}
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[5] },
  cell: { width: '48%' },
  title: { marginTop: space[5] },
  list: { gap: space[4], marginTop: space[4] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  place: { width: 44, textAlign: 'right' },
})
