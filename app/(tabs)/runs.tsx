import React, { useCallback, useMemo, useState } from 'react'
import { PageMeta } from '@/components/PageMeta'
import { View, StyleSheet } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useUserStore } from '@/store/userStore'
import { fetchRunHistory, type RunHistoryEntry } from '@/db/queries/leaderboard'
import { TIER_RANK, formatTier, verdictOf, runMeta } from '@/data/tiers'
import { runRoute } from '@/lib/nav'
import { useSizeClass } from '@/hooks/useSizeClass'
import { ROLES, space, colourwayFor } from '@/theme'
import { KitScreen, KitText, BackControl, RunLabel, RunLabelSkeleton, EmptyState, InlineError, Chips } from '@/components/kit'

// D8 · Runs (docs/ui-overhaul/07d). Every run as the same garment label Home
// shows for the last three, so a run looks like itself wherever it appears.
// Sorting is the kit's chips; the date sits in the label's tag line.
const roles = ROLES.cotton

type SortKey = 'date' | 'score' | 'difficulty' | 'wins' | 'losses' | 'tier'
const SORTS: { id: SortKey; label: string }[] = [
  { id: 'date', label: 'Latest' }, { id: 'score', label: 'Score' }, { id: 'tier', label: 'Tier' },
  { id: 'difficulty', label: 'Hardest' }, { id: 'wins', label: 'Wins' }, { id: 'losses', label: 'Fewest losses' },
]

// Tier sort uses the same cross-mode prestige ranking as Home's "Best Tier"
// (src/data/tiers.ts). The old local list had no World Cup tiers, so they
// sorted above Perfection.
const tierRank = (tier: string) => TIER_RANK[tier] ?? -1
const date = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()

export default function RunsScreen() {
  const { user, isGuest } = useUserStore()
  const [runs, setRuns] = useState<RunHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortKey>('date')
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const wide = useSizeClass() === 'expanded'   // two columns of labels (10-ADAPT §2.2)

  // Refetch whenever the screen gains focus: tabs stay mounted, so a mount-only
  // effect never showed a run finished after the first visit.
  useFocusEffect(
    useCallback(() => {
      let active = true
      ;(async () => {
        if (!user || isGuest) { setLoading(false); return }
        try {
          const data = await fetchRunHistory(user.id, 100)
          if (active) { setRuns(data); setFailed(false) }
        } catch (error) {
          console.warn('[runs] load failed:', error)
          if (active) setFailed(true)
        } finally {
          if (active) setLoading(false)
        }
      })()
      return () => { active = false }
    }, [user, isGuest, reloadKey])
  )

  // Best first on every key: descending, except losses, where fewer is better.
  const sorted = useMemo(() => {
    const r = [...runs]
    switch (sortBy) {
      case 'date':       return r.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      case 'score':      return r.sort((a, b) => b.score - a.score)
      case 'wins':       return r.sort((a, b) => b.wins - a.wins)
      case 'losses':     return r.sort((a, b) => a.losses - b.losses)
      case 'difficulty': return r.sort((a, b) => (b.difficulty_meta?.hardness ?? -1) - (a.difficulty_meta?.hardness ?? -1))
      case 'tier':       return r.sort((a, b) => tierRank(b.tier) - tierRank(a.tier))
    }
  }, [runs, sortBy])

  return (
    <KitScreen ground="cotton" width={wide ? 'wide' : 'column'}>
      <PageMeta title="Your runs" description="Every run you've played, as its label: the verdict, the score, where and how hard." path="/runs" />
      <BackControl roles={roles} />
      <KitText t="superL" color={roles.text} accessibilityRole="header" style={styles.title}>YOUR RUNS</KitText>
      {!isGuest && !loading && runs.length > 0 && (
        <KitText t="tag" color={roles.textMuted}>{`${runs.length} run${runs.length === 1 ? '' : 's'} played`}</KitText>
      )}

      {isGuest ? (
        <EmptyState roles={roles} icon="lock" title="Sign in to keep your runs" body="Guest runs aren't saved. Sign in from Profile and every run lands here." />
      ) : loading ? (
        <View style={styles.list}>{[0, 1, 2].map(i => <RunLabelSkeleton key={i} roles={roles} />)}</View>
      ) : failed && runs.length === 0 ? (
        <InlineError roles={roles} message="Your runs couldn't be loaded." onRetry={() => { setLoading(true); setReloadKey(k => k + 1) }} />
      ) : runs.length === 0 ? (
        <EmptyState roles={roles} title="No runs yet" body="Start suffering." />
      ) : (
        <>
          <Chips roles={roles} label="Sort" options={SORTS} value={sortBy} onChange={setSortBy} style={styles.sort} />
          <View style={[styles.list, wide && styles.grid]}>
            {sorted.map(run => (
              <View key={run.id} style={wide ? styles.cell : undefined}>
              <RunLabel
                roles={roles}
                colourway={colourwayFor(run.mode)}
                title={formatTier(run.tier)}
                meta={`${date(run.created_at)} · ${runMeta(run)} · W${run.wins} D${run.draws} L${run.losses}`}
                score={run.score.toLocaleString('en-US')}
                verdict={verdictOf(run.tier)}
                onPress={() => router.push({ pathname: runRoute(run.mode), params: { runId: run.id } })}
              />
              </View>
            ))}
          </View>
        </>
      )}
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[5] },
  cell: { width: '48%' },
  title: { marginTop: space[3] },
  sort: { marginTop: space[4], marginBottom: space[2] },
  list: { gap: space[4], marginTop: space[3] },
})
