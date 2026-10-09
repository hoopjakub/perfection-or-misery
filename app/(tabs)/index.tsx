import { t, num } from '@/i18n'
import { useKept } from '@/lib/kept'
import { measure } from '@/diag/perf'
import React, { useCallback, useEffect, useState } from 'react'
import { VersionButton } from '@/components/VersionButton'
import { PageMeta, GAME_JSON_LD } from '@/components/PageMeta'
import { UpdateStrip } from '@/components/UpdateStrip'
import { View, ScrollView, StyleSheet, Platform } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useUserStore } from '@/store/userStore'
import { useGameStore } from '@/store/gameStore'
import { keptRun, resumeKeptRun, dropKeptRun, type KeptRun } from '@/lib/runKeeper'
import { useSettingsStore } from '@/store/settingsStore'
import { fetchUserStats, fetchRunHistory, type UserStats, type RunHistoryEntry } from '@/db/queries/leaderboard'
import { ROLES, space, colourwayFor } from '@/theme'
import { formatTier, verdictOf, runMeta, MODE_TAG } from '@/data/tiers'
import { runRoute } from '@/lib/nav'
import { useSizeClass } from '@/hooks/useSizeClass'
import { applyMode } from '@/data/modes'
import type { Difficulty } from '@/engine/difficulty'
import type { GameMode } from '@/types/game'
import {
  KitScreen, KitText, Wordmark, Plate, RunLabel, RunLabelSkeleton, SectionTag, Tag, InlineError, StripedNotice,
} from '@/components/kit'
import { EVERYDAY } from '@/lib/appearance'

// Home (Play) — docs/ui-overhaul/07a A2. The poster, your last three
// verdicts as garment labels, and one orange plate in the thumb zone.
const roles = ROLES[EVERYDAY]

// Modes "AGAIN" can restart straight at the shape screen. A league run also
// needs its league picked, and a custom difficulty's knobs aren't stored on
// the run, so those two go through setup the normal way. ('era' is retired.)
const AGAIN_MODES = new Set(['all_time', 'chaos', 'cursed', 'champions_league', 'champions_league_custom', 'europa_league', 'conference_league', 'world_cup'])
const PRESETS = new Set(['easy', 'medium', 'hard'])


export default function HomeScreen() {
  // Phase 9: boot:interactive ends at Home's first frame (once: the mark is used up).
  useEffect(() => { const id = requestAnimationFrame(() => measure('boot:interactive', 'boot')); return () => cancelAnimationFrame(id) }, [])
  const { isGuest, user, guestFinishedRun } = useUserStore()
  // P9.75: what Home showed last time, at once, refreshed every time it comes
  // into view (src/lib/kept.ts). Finishing a run rebuilds the tabs
  // (exitToHome), so Home used to start from ghost rows after every run; the
  // run just saved is already in the kept copy (runs.ts, keepJustPlayed).
  const me = user && !isGuest ? user.id : null
  const home = useKept<{ stats: UserStats | null; runs: RunHistoryEntry[] }>(me && `home:${me}`, async () => {
    const [stats, runs] = await Promise.all([fetchUserStats(me!), fetchRunHistory(me!, 3)])
    return { stats, runs }
  }, 'home')
  const stats = home.data?.stats ?? null
  const recentRuns = home.data?.runs ?? []
  const failed = home.failed
  const loading = !isGuest && home.data === undefined && !failed
  const wide = useSizeClass() === 'expanded'

  // The same "last run" the LAST TIME tags read (settingsStore), so Again and
  // the tags always agree — and a guest, who has no saved runs, gets Again too.
  const last = useSettingsStore(s => s.lastRun)
  const canAgain = !!last && AGAIN_MODES.has(last.mode)
    && (!last.difficulty || PRESETS.has(last.difficulty) || last.difficulty === last.mode)

  function again() {
    if (!last) return
    // Same mode and difficulty as the last run, straight to the shape — the
    // two choices it skips are exactly the ones being repeated.
    const store = useGameStore.getState()
    applyMode(store, last.mode as GameMode)
    if (last.difficulty && PRESETS.has(last.difficulty)) {
      // The bench stays as the player last set it (P8-01): AGAIN repeats a run,
      // it doesn't quietly switch the bench back on.
      store.setDifficulty(last.difficulty as Difficulty)
    }
    router.push('/game/formation-select')
  }

  // P8-149: a run the last launch left. A draft is offered back; a run that
  // had been drawn into its season is only said, once (see src/lib/runKeeper).
  const [kept, setKept] = useState<KeptRun | null>(null)
  useFocusEffect(useCallback(() => {
    let alive = true
    // Only while no run is under way in this launch (the store is empty).
    if (!useGameStore.getState().formation) keptRun().then(k => { if (alive) setKept(k) })
    return () => { alive = false }
  }, []))
  function continueRun() {
    if (!kept) return
    resumeKeptRun(kept)
    setKept(null)
    router.push('/game/draft')
  }
  function letGo() { dropKeptRun(); setKept(null) }

  // The thumb zone: one orange plate, and the rematch beside it.
  // A kept run sits above the row, never inside it (it squeezed Start a run
  // off the screen, 27 Sept): its line with Let it go beside it, then Continue
  // as the one orange plate, and Start a run steps down to secondary.
  const keptDraft = kept?.stage === 'draft'
  const actions = (
    <View style={styles.thumb}>
      {keptDraft && (
        <>
          <View style={styles.keptHead}>
            <KitText t="tag" color={roles.textMuted} numberOfLines={1} style={styles.keptTag}>{t('home.keptRun', { mode: (MODE_TAG[kept.mode] ?? kept.mode).toUpperCase(), count: kept.draftedPlayers.length })}</KitText>
            <Plate label={t('home.letGo')} variant="quiet" roles={roles} onPress={letGo} />
          </View>
          <Plate label={t('home.continueRun')} icon="play" roles={roles} onPress={continueRun} />
        </>
      )}
      {kept?.stage === 'season' && (
        <StripedNotice roles={roles} actionLabel={t('home.understood')} onAction={letGo}>
          {t('home.seasonLost')}
        </StripedNotice>
      )}
      <View style={styles.actions}>
        <Plate
          label={t('home.startRun')} icon="forward" roles={roles} variant={keptDraft ? 'secondary' : 'primary'}
          onPress={() => router.push('/game/mode-select')}
          style={styles.start}
        />
        {canAgain && last && (
          <Plate
            label={t('home.again')} icon="again" variant="secondary" roles={roles} onPress={again}
            accessibilityHint={t('home.againHint', { mode: MODE_TAG[last.mode] ?? last.mode })}
          />
        )}
      </View>
    </View>
  )
  const record = (
    <>
        {!isGuest && stats?.bestTier ? (
          <View style={styles.bestRow} accessible accessibilityLabel={t('home.bestA11y', { tier: formatTier(stats.bestTier), score: num(stats.bestScore ?? 0), runs: stats.totalRuns })}>
            <Tag roles={roles} variant="selected">{t('home.best')}</Tag>
            <KitText t="tag" color={roles.text}>{formatTier(stats.bestTier).toUpperCase()}</KitText>
            <KitText t="figure" color={roles.text}>{num(stats.bestScore ?? 0)}</KitText>
            <KitText t="tag" color={roles.textMuted} style={styles.runsCount}>{t('home.runsCount', { count: stats.totalRuns })}</KitText>
          </View>
        ) : null}
        {!isGuest && (loading || failed || recentRuns.length > 0) && (
          <>
            <SectionTag roles={roles}>{t('home.lastRuns')}</SectionTag>
            {failed && recentRuns.length === 0 ? (
              <InlineError roles={roles} message={t('home.loadFailed')} onRetry={home.reload} />
            ) : loading && recentRuns.length === 0 ? (
              <View style={styles.labels}>
                <RunLabelSkeleton roles={roles} />
                <RunLabelSkeleton roles={roles} />
              </View>
            ) : (
              <View style={styles.labels}>
                {recentRuns.map(run => (
                  <RunLabel
                    key={run.id}
                    roles={roles}
                    colourway={colourwayFor(run.mode)}
                    title={formatTier(run.tier)}
                    meta={runMeta(run)}
                    score={num(run.score)}
                    verdict={verdictOf(run.tier)}
                    onPress={() => router.push({ pathname: runRoute(run.mode), params: { runId: run.id } })}
                  />
                ))}
              </View>
            )}
          </>
        )}
    </>
  )

  // Expanded (≥1024, 10-ADAPT §2.2): the poster and its plate on the left
  // third, your best and last runs on the right. Compact is the phone poster
  // with the plate in the thumb zone.
  if (wide) {
    return (
      <KitScreen ground={EVERYDAY} width="wide">
        <PageMeta path="/" jsonLd={GAME_JSON_LD} />
        {/* P8.5-31: a new build, when there is one. */}
        <UpdateStrip />
        <View style={styles.wide}>
          <View style={styles.wideLeft}>
            <Wordmark roles={roles} />
            <KitText t="bodyL" color={roles.textMuted} style={styles.pitch}>
              {t('home.pitch')}
            </KitText>
            <View style={styles.wideActions}>{actions}</View>
            {isGuest && guestFinishedRun && (
              <View style={styles.guestLine}>
                <KitText t="body" color={roles.textMuted}>{t('home.guestNotKept')}</KitText>
                <Plate label={t('home.keepMyRuns')} variant="quiet" roles={roles} onPress={() => router.push('/auth/register')} />
              </View>
            )}
            <Plate label={t('home.howItWorks')} variant="quiet" roles={roles} onPress={() => router.push('/guide')} style={styles.guideLink} />
            {/* P8-73: the version, as a door to what's new. */}
            <VersionButton roles={roles} style={styles.version} />
          </View>
          <View style={styles.wideRight}>{record}</View>
        </View>
      </KitScreen>
    )
  }

  return (
    <KitScreen ground={EVERYDAY} scroll={false} contentStyle={styles.screen}>
      <PageMeta path="/" jsonLd={GAME_JSON_LD} />
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={Platform.OS === 'web'}>
        <UpdateStrip />
        <Wordmark roles={roles} />
        <KitText t="bodyL" color={roles.textMuted} style={styles.pitch}>
          {t('home.pitch')}
        </KitText>
        {record}
        {isGuest && guestFinishedRun && (
          <View style={styles.guestLine}>
            <KitText t="body" color={roles.textMuted}>{t('home.guestNotKept')}</KitText>
            <Plate label={t('home.keepMyRuns')} variant="quiet" roles={roles} onPress={() => router.push('/auth/register')} />
          </View>
        )}
        <Plate label={t('home.howItWorks')} variant="quiet" roles={roles} onPress={() => router.push('/guide')} style={styles.guideLink} />
        {/* P8-73: the version, as a door to what's new. */}
        <VersionButton roles={roles} style={styles.version} />
      </ScrollView>
      {actions}
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  thumb: { gap: space[2] },
  keptHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  keptTag: { flex: 1 },
  screen: { flex: 1, paddingBottom: space[3] },
  body: { flex: 1 },
  bodyContent: { paddingBottom: space[5] },
  pitch: { marginTop: space[4], maxWidth: 320 },
  bestRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2], marginTop: space[5] },
  runsCount: { marginLeft: 'auto' },
  labels: { gap: space[3] },
  guestLine: { marginTop: space[5], gap: space[1], alignItems: 'flex-start' },
  guideLink: { alignSelf: 'flex-start', marginTop: space[4], marginLeft: -space[2] },
  version: { marginTop: space[3] },
  actions: { flexDirection: 'row', gap: space[2], alignItems: 'stretch' },
  start: { flex: 1 },
  wide: { flexDirection: 'row', gap: space[7], marginTop: space[6], alignItems: 'flex-start' },
  wideLeft: { flex: 1, maxWidth: 440, gap: space[2] },
  wideRight: { flex: 1.4, minWidth: 0 },
  wideActions: { marginTop: space[5] },
})
