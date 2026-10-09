import { t, num, dec } from '@/i18n'
import { useKept } from '@/lib/kept'
import { log } from '@/diag/log'
import React, { useEffect, useState } from 'react'
import { friendIds } from '@/lib/friends'
import { PageMeta } from '@/components/PageMeta'
import { View, StyleSheet, Pressable } from 'react-native'
import { router } from 'expo-router'
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
import { EVERYDAY } from '@/lib/appearance'
import { fetchClubBoard, ClubsUnavailable, type ClubBoardRow } from '@/db/queries/clubs'
import { ClubTag } from '@/components/ClubParts'
import { OfflineNotice } from '@/components/OfflineStrip'

// D9 · Ranks (docs/ui-overhaul/07d). The best runs anyone has played, each as
// the same garment label your own runs wear, with its place set in the super
// beside it. The podium used gold/silver/bronze fills; the place number in
// the big type carries that now, and the verdict edge still marks Perfection.
//
// P8-85: two boards (all time, and this week), filters by mode and difficulty,
// your own runs marked in the list, and your place on the board even when it's
// outside the fifty ("You: 214th").
const roles = ROLES[EVERYDAY]

// P8-152: a season's board is the same runs read between its dates.
type Board = 'all' | 'week' | 'season' | 'clubs'
const BOARD_OPTIONS: { id: Board; label: string }[] = [
  { id: 'all', label: t('ranks.allTime') }, { id: 'week', label: t('ranks.weekly') }, { id: 'season', label: t('ranks.season') }, { id: 'clubs', label: t('ranks.clubs') },
]
type ModeFilter = 'any' | 'all_time' | 'league' | 'chaos' | 'cursed' | 'tournaments' | 'champions_league' | 'champions_league_custom' | 'europa_league' | 'conference_league' | 'world_cup'
type DiffFilter = 'any' | 'easy' | 'medium' | 'hard' | 'custom'
type HardFilter = 'any' | '3' | '6' | '8' | '10'
type EuroFilter = 'any' | 'ucl' | 'uel' | 'uecl'
type HuntFilter = 'any' | 'none' | 'ucl' | 'uel' | 'uecl'
const HUNT_OPTIONS: { id: HuntFilter; label: string }[] = [
  { id: 'any', label: t('ranks.allRuns') }, { id: 'none', label: t('ranks.wherever') },
  { id: 'ucl', label: t('ranks.aimedUcl') }, { id: 'uel', label: t('ranks.aimedUel') }, { id: 'uecl', label: t('ranks.aimedUecl') },
]
const EURO_OPTIONS: { id: EuroFilter; label: string }[] = [
  { id: 'any', label: t('ranks.allThree') }, { id: 'ucl', label: t('ranks.champions') }, { id: 'uel', label: t('ranks.europa') }, { id: 'uecl', label: t('ranks.conference') },
]

const MODE_OPTIONS: { id: ModeFilter; label: string }[] = [
  { id: 'any', label: t('ranks.all') }, { id: 'all_time', label: t('modes.allTime') }, { id: 'league', label: t('modes.league') },
  { id: 'chaos', label: t('modes.chaos') }, { id: 'cursed', label: t('modes.cursed') }, { id: 'tournaments', label: t('ranks.allTournaments') },
  { id: 'champions_league', label: t('ranks.uclFinals') }, { id: 'champions_league_custom', label: t('comp.europePath') },
  { id: 'europa_league', label: t('comp.uelShort') }, { id: 'conference_league', label: t('comp.ueclShort') }, { id: 'world_cup', label: t('modes.groupWorldCup') },
]
const TOURNAMENTS = ['champions_league', 'champions_league_custom', 'europa_league', 'conference_league', 'world_cup']
const DIFF_OPTIONS: { id: DiffFilter; label: string }[] = [
  { id: 'any', label: t('ranks.any') }, { id: 'easy', label: t('difficulty.easy') }, { id: 'medium', label: t('difficulty.medium') }, { id: 'hard', label: t('difficulty.hard') }, { id: 'custom', label: t('difficulty.custom') },
]
const HARD_OPTIONS: { id: HardFilter; label: string }[] = [
  { id: 'any', label: t('ranks.any') }, { id: '3', label: `${dec(3)}–11` }, { id: '6', label: `${dec(6)}–11` }, { id: '8', label: `${dec(8)}–11` }, { id: '10', label: `${dec(10)}–11` },
]

export default function LeaderboardScreen() {
  const { user, isGuest } = useUserStore()
  const [board, setBoard] = useState<Board>('all')
  const [seasonN, setSeasonN] = useState(() => String(seasonOf().n))
  const season = SEASONS[Number(seasonN)]
  const [mode, setMode] = useState<ModeFilter>('any')
  const [diff, setDiff] = useState<DiffFilter>('any')
  const [hard, setHard] = useState<HardFilter>('any')
  // P8.5-21: the full path's board, one competition at a time or all three.
  const [euro, setEuro] = useState<EuroFilter>('any')
  const [hunt, setHunt] = useState<HuntFilter>('any')
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
    ...(mode === 'champions_league_custom' && euro !== 'any' ? { competition: euro } : {}),
    ...(mode === 'champions_league_custom' && hunt !== 'any' ? { target: hunt } : {}),
  }
  const key = JSON.stringify(filter)
  // The board's own filters, without the window: changing one starts again at the top.
  const scopeKey = JSON.stringify({ board, seasonN, mode, diff, hard, euro, hunt, friendsOnly })
  useEffect(() => { setStart(0) }, [scopeKey])
  // Friends only: the list of friends, then the window put round you — the
  // top when you're in the first 25, otherwise 25 above you and 25 below.
  useEffect(() => {
    if (!friendsOnly || !me) return
    friendIds().then(setFriends).catch(e => { log.warn('net', 'leaderboard: friends failed', e); setFriends([]) })
  }, [friendsOnly, me])
  const aroundPlace = (place: number) => setStart(Math.max(0, place - 26))

  // Refetch on focus (tabs stay mounted, so a mount-only effect went stale the
  // moment you finished another run) and whenever a filter changes. P9.75: a
  // board you've seen shows at once, as you saw it, while it refreshes; one you
  // haven't waits on ghost rows (src/lib/kept.ts). Friends only waits for the
  // list of friends, which its filter needs.
  const ready = !(friendsOnly && me && friends === null)
  const kept = useKept(ready ? `board:${me ?? 'guest'}:${key}` : null, async () => {
    const [data, place] = await Promise.all([
      fetchLeaderboard(filter),
      me ? fetchMyPlace(me, filter).catch(e => { log.warn('net', 'leaderboard: your place failed', e); return null }) : Promise.resolve(null),
    ])
    return { data, place }
  }, 'leaderboard')
  const leaderboard: LeaderboardEntry[] = kept.data?.data ?? []
  const mine = kept.data?.place ?? null
  const failed = kept.failed
  const loading = kept.data === undefined && !failed
  // Friends only centres on you once your place is known.
  useEffect(() => {
    if (friendsOnly && mine && start === 0 && mine.place > 25) aroundPlace(mine.place)
  }, [friendsOnly, mine?.place])

  const filters = (
    <View style={styles.filters}>
      <SegmentSwitch<Board> roles={roles} value={board} onChange={setBoard}
        options={BOARD_OPTIONS} />
      {board === 'week' && (
        <KitText t="tag" color={roles.textMuted}>{t('ranks.weekWindow')}</KitText>
      )}
      {/* The live season and every one before it. */}
      {board === 'season' && (
        <>
          <Chips<string> roles={roles} label={t('ranks.season')} value={seasonN} onChange={setSeasonN}
            options={seasonsSoFar().map(x => ({ id: String(x.n), label: t('ranks.seasonN', { n: x.n }) }))} />
          <KitText t="tag" color={roles.textMuted}>
            {`${season.name.toUpperCase()} · ${seasonDates(season).toUpperCase()} · ${isFinished(season) ? t('ranks.final') : t('ranks.live')}`}
          </KitText>
        </>
      )}
      <Chips<ModeFilter> roles={roles} label={t('ranks.mode')} options={MODE_OPTIONS} value={mode} onChange={setMode} />
      {mode === 'champions_league_custom' && (
        <>
          <Chips<EuroFilter> roles={roles} label={t('ranks.competition')} options={EURO_OPTIONS} value={euro} onChange={setEuro} />
          <Chips<HuntFilter> roles={roles} label={t('ranks.hunting')} options={HUNT_OPTIONS} value={hunt} onChange={setHunt} />
        </>
      )}
      <Chips<DiffFilter> roles={roles} label={t('ranks.difficulty')} options={DIFF_OPTIONS} value={diff} onChange={setDiff} />
      {diff === 'custom' && (
        <Chips<HardFilter> roles={roles} label={t('ranks.hardness')} options={HARD_OPTIONS} value={hard} onChange={setHard} />
      )}
      {!!me && (
        <Chips<'all' | 'friends'> roles={roles} label={t('ranks.who')} value={friendsOnly ? 'friends' : 'all'} onChange={v => setFriendsOnly(v === 'friends')}
          options={[{ id: 'all', label: t('ranks.everyone') }, { id: 'friends', label: t('ranks.youAndFriends') }]} />
      )}
      {/* Any fifty on the board: your own, or from a place you type. */}
      <View style={styles.jumpRow}>
        {mine && <Plate label={t('ranks.aroundYou')} icon="you" variant="secondary" roles={roles} onPress={() => aroundPlace(mine.place)} />}
        <View style={{ flex: 1 }}>
          <Field roles={roles} label={t('ranks.goToPlace')} value={placeInput} keyboardType="number-pad" onChangeText={v => setPlaceInput(v.replace(/[^\d]/g, ''))}
            onSubmitEditing={() => { const n = Number(placeInput); if (n > 0) aroundPlace(n) }} returnKeyType="go" />
        </View>
      </View>
      {start > 0 && <Plate label={t('ranks.backToTop')} variant="quiet" roles={roles} onPress={() => setStart(0)} />}
    </View>
  )

  const inList = !!me && leaderboard.some(e => e.user_id === me)

  return (
    <KitScreen ground={EVERYDAY} width={wide ? 'wide' : 'column'}>
      <PageMeta title={t('ranks.pageTitle')} description={t('ranks.pageDesc')} path="/leaderboard" />
      <OfflineNotice />
      <KitText t="superL" color={roles.text} accessibilityRole="header" style={styles.title}>{t('ranks.title')}</KitText>
      <KitText t="tag" color={roles.textMuted}>{board === 'clubs' ? t('ranks.subClubs') : board === 'week' ? t('ranks.subWeek') : t('ranks.subAll')}</KitText>
      {board === 'clubs' ? (
        <>
          <View style={styles.filters}>
            <SegmentSwitch<Board> roles={roles} value={board} onChange={setBoard}
              options={BOARD_OPTIONS} />
          </View>
          <ClubBoard />
        </>
      ) : <>
      {filters}
      {/* Your place, even outside the fifty. */}
      {mine && (
        <View style={[styles.you, { borderColor: prim.orange }]} accessible accessibilityLabel={t('ranks.youA11y', { place: ordinal(mine.place), points: num(mine.score) })}>
          <Tag roles={roles} variant="you">{t('ranks.you')}</Tag>
          <KitText t="title" color={roles.text}>{ordinal(mine.place)}</KitText>
          <KitText t="figure" color={roles.textMuted} style={styles.youScore}>{num(mine.score)}</KitText>
          {!inList && <KitText t="tag" color={roles.textMuted}>{t('ranks.outsideFifty')}</KitText>}
        </View>
      )}
      {loading ? (
        <View style={styles.list}>{[0, 1, 2].map(i => <RunLabelSkeleton key={i} roles={roles} />)}</View>
      ) : failed && leaderboard.length === 0 ? (
        <InlineError roles={roles} message={t('ranks.loadFailed')} onRetry={kept.reload} />
      ) : leaderboard.length === 0 ? (
        <EmptyState roles={roles} title={t('ranks.nobody')} body={board === 'week' ? t('ranks.nobodyWeek') : t('ranks.nobodyAll')} />
      ) : (
        <View style={[styles.list, wide && styles.grid]}>
          {leaderboard.map((entry, i) => {
            const yours = !!me && entry.user_id === me
            return (
              <View key={entry.id} style={[styles.row, wide && styles.cell]}>
                <View style={styles.placeCol}>
                  <KitText t={start + i < 3 ? 'superM' : 'superS'} color={start + i < 3 ? roles.text : roles.textMuted} style={styles.place}>{String(start + i + 1)}</KitText>
                  {yours && <Tag roles={roles} variant="you">{t('ranks.you')}</Tag>}
                </View>
                {/* Your own runs wear an orange outline as well as the tag. */}
                <View style={[{ flex: 1 }, yours && [styles.yours, { borderColor: prim.orange }]]}>
                  {/* P8-88/89: whose run, with their picture and team badge, a tap from their profile. */}
                  <PlayerName roles={roles} name={entry.profiles.username ?? t('ranks.player')} avatarPath={entry.profiles.avatar_path} tag={entry.profiles.club_tag}
                    badgeTeamId={entry.profiles.badge_team_id} badgeTeamName={entry.profiles.badge_team_name}
                    onPress={() => router.push({ pathname: '/u/[id]', params: { id: entry.user_id } })} />
                  <RunLabel
                    roles={roles}
                    colourway={colourwayFor(entry.mode)}
                    title={formatTier(entry.tier)}
                    meta={runMeta(entry)}
                    score={num(entry.score)}
                    verdict={verdictOf(entry.tier)}
                    onPress={() => router.push({ pathname: runRoute(entry.mode), params: { runId: entry.id } })}
                  />
                </View>
              </View>
            )
          })}
        </View>
      )}
      </>}
    </KitScreen>
  )
}

// P8.5-09: the clubs leaderboard. The same as Ranks, but for clubs: no
// seasons, and a club's score is every member's runs added together (the
// database adds them up: club_board in supabase/clubs-2.sql). Your club wears
// the orange outline.
function ClubBoard() {
  const myTag = useUserStore(s => s.profile?.club_tag ?? null)
  // Kept like the runs' board (P9.75, src/lib/kept.ts). "Not set up" is an
  // answer, not a failure, so it's kept too.
  const kept = useKept<ClubBoardRow[] | 'unavailable'>('clubs', () => fetchClubBoard(50).catch(e => {
    if (e instanceof ClubsUnavailable) return 'unavailable' as const
    throw e
  }), 'clubs board')
  const rows = Array.isArray(kept.data) ? kept.data : null
  const state = kept.data === 'unavailable' ? 'unavailable' : rows ? 'ready' : kept.failed ? 'failed' : 'loading'
  if (state === 'loading') return <View style={styles.list}>{[0, 1, 2].map(i => <RunLabelSkeleton key={i} roles={roles} />)}</View>
  if (state === 'unavailable') return <EmptyState roles={roles} title={t('ranks.notSetUp')} body={t('ranks.notSetUpBody')} />
  if (state === 'failed') return <EmptyState roles={roles} title={t('ranks.clubsFailed')} body={t('ranks.tryLater')} />
  if (!rows?.length) return <EmptyState roles={roles} title={t('ranks.noClubs')} body={t('ranks.noClubsBody')} />
  return (
    <View style={styles.list}>
      {rows.map((c, i) => {
        const yours = !!myTag && c.tag === myTag
        return (
          <Pressable key={c.id} onPress={() => router.push({ pathname: '/club/[id]', params: { id: c.id } })} accessibilityRole="button"
            accessibilityLabel={t('ranks.clubA11y', { place: i + 1, name: c.name, points: num(c.score), runs: c.runs, members: c.members }) + (yours ? t('ranks.yourClub') : '')}
            style={({ pressed }) => [styles.row, styles.clubRow, yours && [styles.yours, { borderColor: prim.orange }], pressed && { opacity: 0.7 }]}>
            <View style={styles.placeCol}>
              <KitText t={i < 3 ? 'superM' : 'superS'} color={i < 3 ? roles.text : roles.textMuted} style={styles.place}>{String(i + 1)}</KitText>
            </View>
            <ClubTag tag={c.tag} colour={c.colour} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <KitText t="body" color={roles.text} numberOfLines={1}>{c.name}</KitText>
              <KitText t="tag" color={roles.textMuted}>{t('ranks.membersRuns', { members: t('clubs.headerMembers', { count: c.members }), runs: t('ranks.runs', { count: c.runs }) })}</KitText>
            </View>
            <KitText t="figure" color={roles.text}>{num(c.score)}</KitText>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[5] },
  cell: { width: '48%' },
  title: { marginTop: space[5] },
  filters: { gap: space[2], marginTop: space[4] },
  you: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: space[4], borderWidth: border.thin, padding: space[2] },
  youScore: { marginLeft: 'auto' },
  clubRow: { alignItems: 'center', gap: space[2], minHeight: 56 },
  list: { gap: space[4], marginTop: space[4] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  placeCol: { width: 44, alignItems: 'flex-end', gap: 2 },
  place: { textAlign: 'right' },
  jumpRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space[2] },
  yours: { borderWidth: border.thin, padding: 2 },
})
