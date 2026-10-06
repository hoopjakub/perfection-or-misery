import { t, num, LOCALE } from '@/i18n'
import { useSettledOnce } from '@/lib/loading'
import { log } from '@/diag/log'
import React, { useCallback, useMemo, useState } from 'react'
import { PageMeta } from '@/components/PageMeta'
import { View, StyleSheet, FlatList, Platform } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useUserStore } from '@/store/userStore'
import { fetchRunHistory, fetchScoreLadder, placeOn, SCORE_LADDER, type RunHistoryEntry } from '@/db/queries/leaderboard'
import { weekStart } from '@/lib/week'
import { SEASONS, seasonsSoFar, seasonDates } from '@/data/seasons'
import { ordinal } from '@/lib/format'
import { TIER_RANK, formatTier, verdictOf, runMeta } from '@/data/tiers'
import { runRoute } from '@/lib/nav'
import { useSizeClass } from '@/hooks/useSizeClass'
import { ROLES, space, colourwayFor } from '@/theme'
import { KitScreen, KitText, RunLabel, RunLabelSkeleton, EmptyState, InlineError, Chips } from '@/components/kit'
import { EVERYDAY } from '@/lib/appearance'

// D8 · Runs (docs/ui-overhaul/07d). Every run as the same garment label Home
// shows for the last three, so a run looks like itself wherever it appears.
// Sorting is the kit's chips; the date sits in the label's tag line.
const roles = ROLES[EVERYDAY]

type SortKey = 'date' | 'score' | 'difficulty' | 'wins' | 'losses' | 'tier'
const SORTS: { id: SortKey; label: string }[] = [
  { id: 'date', label: t('ranks.latest') }, { id: 'score', label: t('ranks.score') }, { id: 'tier', label: t('ranks.tier') },
  { id: 'difficulty', label: t('ranks.hardest') }, { id: 'wins', label: t('ranks.wins') }, { id: 'losses', label: t('ranks.fewestLosses') },
]

// Tier sort uses the same cross-mode prestige ranking as Home's "Best Tier"
// (src/data/tiers.ts). The old local list had no World Cup tiers, so they
// sorted above Perfection.
const tierRank = (tier: string) => TIER_RANK[tier] ?? -1
const date = (s: string) => new Date(s).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()

const placeLabel = (place: number | null, board: string) => (place ? t('ranks.placeOn', { place: ordinal(place).toUpperCase(), board }) : t('ranks.outsideTop', { n: SCORE_LADDER, board }))

export default function RunsScreen() {
  const once = useSettledOnce()   // Phase 9: a first load arrives deliberately (src/lib/loading.ts)
  const { user, isGuest } = useUserStore()
  const [runs, setRuns] = useState<RunHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortKey>('date')
  // P8-152: every run, or one season's.
  const [seasonN, setSeasonN] = useState('all')
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  // P8-99: every run's place on the all-time board, and on this week's when
  // it's from this week (the week as Ranks counts it, src/lib/week.ts).
  const [ladders, setLadders] = useState<{ all: number[]; week: number[]; since: string } | null>(null)
  const wide = useSizeClass() === 'expanded'   // two columns of labels (10-ADAPT §2.2)

  // Refetch whenever the screen gains focus: tabs stay mounted, so a mount-only
  // effect never showed a run finished after the first visit.
  useFocusEffect(
    useCallback(() => {
      let active = true
      ;(async () => {
        if (!user || isGuest) { setLoading(false); return }
        try {
          const data = await once(fetchRunHistory(user.id, 100))
          if (active) { setRuns(data); setFailed(false) }
          const since = weekStart().toISOString()
          Promise.all([fetchScoreLadder(), fetchScoreLadder(since)])
            .then(([all, week]) => { if (active) setLadders({ all, week, since }) })
            .catch(e => log.warn('net', 'runs: places failed', e))
        } catch (error) {
          log.warn('net', 'runs: load failed', error)
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
    const season = seasonN === 'all' ? null : SEASONS[Number(seasonN)]
    const r = season ? runs.filter(x => {
      const t = new Date(x.created_at).getTime()
      return (!season.start || t >= season.start.getTime()) && t < season.end.getTime()
    }) : [...runs]
    switch (sortBy) {
      case 'date':       return r.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      case 'score':      return r.sort((a, b) => b.score - a.score)
      case 'wins':       return r.sort((a, b) => b.wins - a.wins)
      case 'losses':     return r.sort((a, b) => a.losses - b.losses)
      case 'difficulty': return r.sort((a, b) => (b.difficulty_meta?.hardness ?? -1) - (a.difficulty_meta?.hardness ?? -1))
      case 'tier':       return r.sort((a, b) => tierRank(b.tier) - tierRank(a.tier))
    }
  }, [runs, sortBy, seasonN])

  // Phase 9 (N-14): up to 100 runs, so the list is a FlatList: only the labels
  // near the screen are mounted. The title and the filters are its header, so
  // they scroll away with it as before.
  const header = (
    <>
      <PageMeta title={t('ranks.yourRunsTitle')} description={t('ranks.yourRunsDesc')} path="/runs" />
      <KitText t="superL" color={roles.text} accessibilityRole="header" style={styles.title}>{t('ranks.yourRuns')}</KitText>
      {!isGuest && !loading && runs.length > 0 && (
        <KitText t="tag" color={roles.textMuted}>{t('ranks.played', { count: runs.length })}</KitText>
      )}
    </>
  )

  if (isGuest || loading || (failed && runs.length === 0) || runs.length === 0) {
    return (
      <KitScreen ground={EVERYDAY} width={wide ? 'wide' : 'column'}>
        {header}
        {isGuest ? (
          <EmptyState roles={roles} icon="lock" title={t('ranks.signInKeep')} body={t('ranks.guestNotSaved')} />
        ) : loading ? (
          <View style={styles.list}>{[0, 1, 2].map(i => <RunLabelSkeleton key={i} roles={roles} />)}</View>
        ) : failed && runs.length === 0 ? (
          <InlineError roles={roles} message={t('ranks.runsFailed')} onRetry={() => { setLoading(true); setReloadKey(k => k + 1) }} />
        ) : runs.length === 0 ? (
          <EmptyState roles={roles} title={t('ranks.noRuns')} body={t('ranks.startSuffering')} />
        ) : null}
      </KitScreen>
    )
  }

  return (
    <KitScreen ground={EVERYDAY} width={wide ? 'wide' : 'column'} scroll={false}>
      <FlatList
        key={wide ? 'grid' : 'list'}
        data={sorted}
        keyExtractor={run => run.id}
        numColumns={wide ? 2 : 1}
        columnWrapperStyle={wide ? styles.gridRow : undefined}
        contentContainerStyle={styles.listBody}
        showsVerticalScrollIndicator={Platform.OS === 'web'}
        initialNumToRender={12}
        ListHeaderComponent={<>{header}
          <Chips roles={roles} label={t('ranks.sort')} options={SORTS} value={sortBy} onChange={setSortBy} style={styles.sort} />
          <Chips<string> roles={roles} label={t('ranks.season')} value={seasonN} onChange={setSeasonN}
            options={[{ id: 'all', label: t('ranks.all') }, ...seasonsSoFar().map(x => ({ id: String(x.n), label: t('ranks.seasonN', { n: x.n }) }))]} />
          {seasonN !== 'all' && (
            <KitText t="tag" color={roles.textMuted}>
              {`${SEASONS[Number(seasonN)].name.toUpperCase()} · ${seasonDates(SEASONS[Number(seasonN)]).toUpperCase()} · ${t('ranks.runs', { count: sorted.length })}`}
            </KitText>
          )}
        </>}
        renderItem={({ item: run }) => (
          <View style={wide ? styles.cell : undefined}>
            <RunLabel
              roles={roles}
              colourway={colourwayFor(run.mode)}
              title={formatTier(run.tier)}
              meta={[
                date(run.created_at), runMeta(run), t('ranks.wdl', { w: run.wins, d: run.draws, l: run.losses }),
                ...(ladders ? [placeLabel(placeOn(ladders.all, run.score), t('ranks.boardAll')),
                  ...(run.created_at >= ladders.since ? [placeLabel(placeOn(ladders.week, run.score), t('ranks.boardWeek'))] : [])] : []),
              ].join(' · ')}
              score={num(run.score)}
              verdict={verdictOf(run.tier)}
              onPress={() => router.push({ pathname: runRoute(run.mode), params: { runId: run.id } })}
            />
          </View>
        )}
      />
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  gridRow: { columnGap: space[5] },
  listBody: { gap: space[4], paddingBottom: space[7] },
  cell: { width: '48%' },
  // A tab, not a pushed page: no back control (P8-97), and the same top as Ranks.
  title: { marginTop: space[5] },
  sort: { marginTop: space[4], marginBottom: space[2] },
  list: { gap: space[4], marginTop: space[3] },
})
