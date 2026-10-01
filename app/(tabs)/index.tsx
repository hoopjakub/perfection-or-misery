import React, { useCallback, useState } from 'react'
import { VersionButton } from '@/components/VersionButton'
import { PageMeta, GAME_JSON_LD } from '@/components/PageMeta'
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
  const { isGuest, user, guestFinishedRun } = useUserStore()
  const [stats, setStats] = useState<UserStats | null>(null)
  const [recentRuns, setRecentRuns] = useState<RunHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const wide = useSizeClass() === 'expanded'

  // Refetch every time Home gains focus (tabs persist, so a plain mount effect
  // would go stale) — this is what makes a freshly-finished run show up.
  useFocusEffect(
    useCallback(() => {
      let active = true
      async function loadData() {
        if (!user || isGuest) { setLoading(false); return }
        try {
          const [userStats, runs] = await Promise.all([
            fetchUserStats(user.id),
            fetchRunHistory(user.id, 3),
          ])
          if (!active) return
          setStats(userStats)
          setRecentRuns(runs)
          setFailed(false)
        } catch (error) {
          console.warn('[home] load failed:', error)
          if (active) setFailed(true)
        } finally {
          if (active) setLoading(false)
        }
      }
      loadData()
      return () => { active = false }
    }, [user, isGuest, reloadKey])
  )

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
            <KitText t="tag" color={roles.textMuted} numberOfLines={1} style={styles.keptTag}>{`YOUR ${(MODE_TAG[kept.mode] ?? kept.mode).toUpperCase()} RUN · ${kept.draftedPlayers.length} PICKED`}</KitText>
            <Plate label="Let it go" variant="quiet" roles={roles} onPress={letGo} />
          </View>
          <Plate label="Continue your run" icon="play" roles={roles} onPress={continueRun} />
        </>
      )}
      {kept?.stage === 'season' && (
        <StripedNotice roles={roles} actionLabel="Understood" onAction={letGo}>
          Your last run was stopped during its season, so it's gone. A season can't be picked up halfway: starting it again would play every result again.
        </StripedNotice>
      )}
      <View style={styles.actions}>
        <Plate
          label="Start a run" icon="forward" roles={roles} variant={keptDraft ? 'secondary' : 'primary'}
          onPress={() => router.push('/game/mode-select')}
          style={styles.start}
        />
        {canAgain && last && (
          <Plate
            label="Again" icon="again" variant="secondary" roles={roles} onPress={again}
            accessibilityHint={`Start another ${MODE_TAG[last.mode] ?? last.mode} run`}
          />
        )}
      </View>
    </View>
  )
  const record = (
    <>
        {!isGuest && stats?.bestTier ? (
          <View style={styles.bestRow} accessible accessibilityLabel={`Best: ${formatTier(stats.bestTier)}, ${stats.bestScore ?? 0} points, ${stats.totalRuns} runs`}>
            <Tag roles={roles} variant="selected">BEST</Tag>
            <KitText t="tag" color={roles.text}>{formatTier(stats.bestTier).toUpperCase()}</KitText>
            <KitText t="figure" color={roles.text}>{(stats.bestScore ?? 0).toLocaleString('en-US')}</KitText>
            <KitText t="tag" color={roles.textMuted} style={styles.runsCount}>{stats.totalRuns} RUNS</KitText>
          </View>
        ) : null}
        {!isGuest && (loading || failed || recentRuns.length > 0) && (
          <>
            <SectionTag roles={roles}>Last runs</SectionTag>
            {failed && recentRuns.length === 0 ? (
              <InlineError roles={roles} message="Couldn't load your runs." onRetry={() => { setLoading(true); setReloadKey(k => k + 1) }} />
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
                    score={run.score.toLocaleString('en-US')}
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
        <View style={styles.wide}>
          <View style={styles.wideLeft}>
            <Wordmark roles={roles} />
            <KitText t="bodyL" color={roles.textMuted} style={styles.pitch}>
              Draft an XI from real seasons. Find out which one you get.
            </KitText>
            <View style={styles.wideActions}>{actions}</View>
            {isGuest && guestFinishedRun && (
              <View style={styles.guestLine}>
                <KitText t="body" color={roles.textMuted}>Runs aren't kept as a guest.</KitText>
                <Plate label="Keep my runs" variant="quiet" roles={roles} onPress={() => router.push('/auth/register')} />
              </View>
            )}
            <Plate label="New here? How it works" variant="quiet" roles={roles} onPress={() => router.push('/guide')} style={styles.guideLink} />
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
        <Wordmark roles={roles} />
        <KitText t="bodyL" color={roles.textMuted} style={styles.pitch}>
          Draft an XI from real seasons. Find out which one you get.
        </KitText>
        {record}
        {isGuest && guestFinishedRun && (
          <View style={styles.guestLine}>
            <KitText t="body" color={roles.textMuted}>Runs aren't kept as a guest.</KitText>
            <Plate label="Keep my runs" variant="quiet" roles={roles} onPress={() => router.push('/auth/register')} />
          </View>
        )}
        <Plate label="New here? How it works" variant="quiet" roles={roles} onPress={() => router.push('/guide')} style={styles.guideLink} />
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
