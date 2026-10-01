import React, { useCallback, useEffect, useState } from 'react'
import { friendIds } from '@/lib/friends'
import { PageMeta } from '@/components/PageMeta'
import { View, StyleSheet } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { fetchLeaderboard, fetchMyPlace, type LeaderboardEntry, type LeaderboardFilter } from '@/db/queries/leaderboard'
import { formatTier, verdictOf, runMeta } from '@/data/tiers'
import { runRoute } from '@/lib/nav'
import { weekStart } from '@/lib/week'
import { SEASONS, seasonOf, seasonsSoFar, seasonDates, seasonWindow, isFinished } from '@/data/seasons'
import { ordinal } from '@/lib/format'
import { useSizeClass } from '@/hooks/useSizeClass'
import { useUserStore } from '@/store/userStore'
import { ROLES, space, border, prim, colourwayFor } from '@/theme'
import { KitScreen, KitText, RunLabel, RunLabelSkeleton, EmptyState, InlineError, Chips, Tag, Plate, Field } from '@/components/kit'
import { SegmentSwitch } from '@/components/season/SeasonParts'
import { PlayerName } from '@/components/profile/ProfileParts'

// D9 · Ranks (docs/ui-overhaul/07d). The best runs anyone has played, each as
// the same garment label your own runs wear, with its place set in the super
// beside it. The podium used gold/silver/bronze fills; the place number in
// the big type carries that now, and the verdict edge still marks Perfection.
//
// P8-85: two boards (all time, and this week), filters by mode and difficulty,
// your own runs marked in the list, and your place on the board even when it's
// outside the fifty ("You: 214th").
const roles = ROLES.cotton

// P8-152: a season's board is the same runs read between its dates.
type Board = 'all' | 'week' | 'season'
type ModeFilter = 'any' | 'all_time' | 'league' | 'chaos' | 'cursed' | 'tournaments' | 'champions_league' | 'champions_league_custom' | 'europa_league' | 'conference_league' | 'world_cup'
type DiffFilter = 'any' | 'easy' | 'medium' | 'hard' | 'custom'
type HardFilter = 'any' | '3' | '6' | '8' | '10'

const MODE_OPTIONS: { id: ModeFilter; label: string }[] = [
  { id: 'any', label: 'All' }, { id: 'all_time', label: 'All Time' }, { id: 'league', label: 'League' },
  { id: 'chaos', label: 'Chaos' }, { id: 'cursed', label: 'Cursed' }, { id: 'tournaments', label: 'All tournaments' },
  { id: 'champions_league', label: 'UCL Finals' }, { id: 'champions_league_custom', label: 'UCL Full path' },
  { id: 'europa_league', label: 'Europa League' }, { id: 'conference_league', label: 'Conference League' }, { id: 'world_cup', label: 'World Cup' },
]
const TOURNAMENTS = ['champions_league', 'champions_league_custom', 'europa_league', 'conference_league', 'world_cup']
const DIFF_OPTIONS: { id: DiffFilter; label: string }[] = [
  { id: 'any', label: 'Any' }, { id: 'easy', label: 'Easy' }, { id: 'medium', label: 'Medium' }, { id: 'hard', label: 'Hard' }, { id: 'custom', label: 'Custom' },
]
const HARD_OPTIONS: { id: HardFilter; label: string }[] = [
  { id: 'any', label: 'Any' }, { id: '3', label: '3.0–11' }, { id: '6', label: '6.0–11' }, { id: '8', label: '8.0–11' }, { id: '10', label: '10.0–11' },
]

export default function LeaderboardScreen() {
  const { user, isGuest } = useUserStore()
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [mine, setMine] = useState<{ place: number; score: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [board, setBoard] = useState<Board>('all')
  const [seasonN, setSeasonN] = useState(() => String(seasonOf().n))
  const season = SEASONS[Number(seasonN)]
  const [mode, setMode] = useState<ModeFilter>('any')
  const [diff, setDiff] = useState<DiffFilter>('any')
  const [hard, setHard] = useState<HardFilter>('any')
  // P8-99: which fifty — from place `start + 1` — and friends only.
  const [start, setStart] = useState(0)
  const [placeInput, setPlaceInput] = useState('')
  const [friendsOnly, setFriendsOnly] = useState(false)
  const [friends, setFriends] = useState<string[] | null>(null)
  const wide = useSizeClass() === 'expanded'   // two columns of labels (10-ADAPT §2.2)
  const me = !isGuest ? user?.id : undefined

  const filter: LeaderboardFilter = {
    limit: 50,
    offset: start,
    ...(friendsOnly && me && friends ? { userIds: [me, ...friends] } : {}),
    ...(board === 'week' ? { since: weekStart().toISOString() } : {}),
    ...(board === 'season' ? seasonWindow(season) : {}),
    ...(mode === 'tournaments' ? { modes: TOURNAMENTS } : mode !== 'any' ? { mode } : {}),
    ...(diff !== 'any' ? { difficulty: diff } : {}),
    ...(diff === 'custom' && hard !== 'any' ? { minHardness: Number(hard) } : {}),
  }
  const key = JSON.stringify(filter)
  // The board's own filters, without the window: changing one starts again at the top.
  const scopeKey = JSON.stringify({ board, seasonN, mode, diff, hard, friendsOnly })
  useEffect(() => { setStart(0) }, [scopeKey])
  // Friends only: the list of friends, then the window put round you — the
  // top when you're in the first 25, otherwise 25 above you and 25 below.
  useEffect(() => {
    if (!friendsOnly || !me) return
    friendIds().then(setFriends).catch(e => { console.warn('[leaderboard] friends failed:', e); setFriends([]) })
  }, [friendsOnly, me])
  const aroundPlace = (place: number) => setStart(Math.max(0, place - 26))

  // Refetch on focus (tabs stay mounted, so a mount-only effect went stale the
  // moment you finished another run) and whenever a filter changes.
  useFocusEffect(
    useCallback(() => {
      let active = true
      ;(async () => {
        try {
          const [data, place] = await Promise.all([
            fetchLeaderboard(filter),
            me ? fetchMyPlace(me, filter).catch(e => { console.warn('[leaderboard] your place failed:', e); return null }) : Promise.resolve(null),
          ])
          if (active) { setLeaderboard(data); setMine(place); setFailed(false) }
          // Friends only centres on you once your place is known.
          if (active && friendsOnly && place && start === 0 && place.place > 25) aroundPlace(place.place)
        } catch (error) {
          console.warn('[leaderboard] load failed:', error)
          if (active) setFailed(true)
        } finally {
          if (active) setLoading(false)
        }
      })()
      return () => { active = false }
    }, [reloadKey, key, me])
  )

  const filters = (
    <View style={styles.filters}>
      <SegmentSwitch<Board> roles={roles} value={board} onChange={setBoard}
        options={[{ id: 'all', label: 'All time' }, { id: 'week', label: 'This week' }, { id: 'season', label: 'Season' }]} />
      {board === 'week' && (
        <KitText t="tag" color={roles.textMuted}>Monday 00:00 to Sunday 23:59, Slovak time (Europe/Bratislava)</KitText>
      )}
      {/* The live season and every one before it. */}
      {board === 'season' && (
        <>
          <Chips<string> roles={roles} label="Season" value={seasonN} onChange={setSeasonN}
            options={seasonsSoFar().map(x => ({ id: String(x.n), label: `Season ${x.n}` }))} />
          <KitText t="tag" color={roles.textMuted}>
            {`${season.name.toUpperCase()} · ${seasonDates(season).toUpperCase()} · ${isFinished(season) ? 'FINAL' : 'LIVE'}`}
          </KitText>
        </>
      )}
      <Chips<ModeFilter> roles={roles} label="Mode" options={MODE_OPTIONS} value={mode} onChange={setMode} />
      <Chips<DiffFilter> roles={roles} label="Difficulty" options={DIFF_OPTIONS} value={diff} onChange={setDiff} />
      {diff === 'custom' && (
        <Chips<HardFilter> roles={roles} label="Hardness" options={HARD_OPTIONS} value={hard} onChange={setHard} />
      )}
      {!!me && (
        <Chips<'all' | 'friends'> roles={roles} label="Who" value={friendsOnly ? 'friends' : 'all'} onChange={v => setFriendsOnly(v === 'friends')}
          options={[{ id: 'all', label: 'Everyone' }, { id: 'friends', label: 'You and your friends' }]} />
      )}
      {/* Any fifty on the board: your own, or from a place you type. */}
      <View style={styles.jumpRow}>
        {mine && <Plate label="Around you" icon="you" variant="secondary" roles={roles} onPress={() => aroundPlace(mine.place)} />}
        <View style={{ flex: 1 }}>
          <Field roles={roles} label="Go to place" value={placeInput} keyboardType="number-pad" onChangeText={v => setPlaceInput(v.replace(/[^\d]/g, ''))}
            onSubmitEditing={() => { const n = Number(placeInput); if (n > 0) aroundPlace(n) }} returnKeyType="go" />
        </View>
      </View>
      {start > 0 && <Plate label="Back to the top" variant="quiet" roles={roles} onPress={() => setStart(0)} />}
    </View>
  )

  const inList = !!me && leaderboard.some(e => e.user_id === me)

  return (
    <KitScreen ground="cotton" width={wide ? 'wide' : 'column'}>
      <PageMeta title="Ranks" description="The fifty best runs anyone has played, by score." path="/leaderboard" />
      <KitText t="superL" color={roles.text} accessibilityRole="header" style={styles.title}>RANKS</KitText>
      <KitText t="tag" color={roles.textMuted}>{board === 'week' ? 'The fifty best runs this week, by score' : 'The fifty best runs, by score'}</KitText>
      {filters}
      {/* Your place, even outside the fifty. */}
      {mine && (
        <View style={[styles.you, { borderColor: prim.orange }]} accessible accessibilityLabel={`You: ${ordinal(mine.place)}, ${mine.score} points`}>
          <Tag roles={roles} variant="you">YOU</Tag>
          <KitText t="title" color={roles.text}>{ordinal(mine.place)}</KitText>
          <KitText t="figure" color={roles.textMuted} style={styles.youScore}>{mine.score.toLocaleString('en-US')}</KitText>
          {!inList && <KitText t="tag" color={roles.textMuted}>OUTSIDE THE FIFTY</KitText>}
        </View>
      )}
      {loading ? (
        <View style={styles.list}>{[0, 1, 2].map(i => <RunLabelSkeleton key={i} roles={roles} />)}</View>
      ) : failed && leaderboard.length === 0 ? (
        <InlineError roles={roles} message="The ranks couldn't be loaded." onRetry={() => { setLoading(true); setReloadKey(k => k + 1) }} />
      ) : leaderboard.length === 0 ? (
        <EmptyState roles={roles} title="Nobody yet" body={board === 'week' ? 'No runs this week with these filters. Finish one and be first.' : 'No runs with these filters. Finish one and be the first on the board.'} />
      ) : (
        <View style={[styles.list, wide && styles.grid]}>
          {leaderboard.map((entry, i) => {
            const yours = !!me && entry.user_id === me
            return (
              <View key={entry.id} style={[styles.row, wide && styles.cell]}>
                <View style={styles.placeCol}>
                  <KitText t={start + i < 3 ? 'superM' : 'superS'} color={start + i < 3 ? roles.text : roles.textMuted} style={styles.place}>{String(start + i + 1)}</KitText>
                  {yours && <Tag roles={roles} variant="you">YOU</Tag>}
                </View>
                {/* Your own runs wear an orange outline as well as the tag. */}
                <View style={[{ flex: 1 }, yours && [styles.yours, { borderColor: prim.orange }]]}>
                  {/* P8-88/89: whose run, with their picture and team badge, a tap from their profile. */}
                  <PlayerName roles={roles} name={entry.profiles.username ?? 'Player'} avatarPath={entry.profiles.avatar_path} tag={entry.profiles.club_tag}
                    badgeTeamId={entry.profiles.badge_team_id} badgeTeamName={entry.profiles.badge_team_name}
                    onPress={() => router.push({ pathname: '/u/[id]', params: { id: entry.user_id } })} />
                  <RunLabel
                    roles={roles}
                    colourway={colourwayFor(entry.mode)}
                    title={formatTier(entry.tier)}
                    meta={runMeta(entry)}
                    score={entry.score.toLocaleString('en-US')}
                    verdict={verdictOf(entry.tier)}
                    onPress={() => router.push({ pathname: runRoute(entry.mode), params: { runId: entry.id } })}
                  />
                </View>
              </View>
            )
          })}
        </View>
      )}
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[5] },
  cell: { width: '48%' },
  title: { marginTop: space[5] },
  filters: { gap: space[2], marginTop: space[4] },
  you: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: space[4], borderWidth: border.thin, padding: space[2] },
  youScore: { marginLeft: 'auto' },
  list: { gap: space[4], marginTop: space[4] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  placeCol: { width: 44, alignItems: 'flex-end', gap: 2 },
  place: { textAlign: 'right' },
  jumpRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space[2] },
  yours: { borderWidth: border.thin, padding: 2 },
})
